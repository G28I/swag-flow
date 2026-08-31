import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/app/lib/prisma";
import { aj } from "@/app/lib/arcjet";
import { logStatsigEvent } from "@/app/lib/statsig";
import { env } from "@/app/lib/env";
import { executeWithRetryAndBackoff, getCooldownKey } from "@/app/lib/retryEngine";
import { normalizeUsage } from "@/app/lib/costEngine";

function safeEnqueue(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  data: unknown
): boolean {
  try {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    return true;
  } catch {
    return false;
  }
}

function safeClose(controller: ReadableStreamDefaultController) {
  try {
    controller.close();
  } catch {
    // Ignore if controller is already closed or errored
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const isClerkConfigured =
      process.env.CLERK_SECRET_KEY &&
      process.env.CLERK_SECRET_KEY !== "sk_test_placeholder" &&
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY !== "pk_test_placeholder";

    let userId: string | null = null;
    if (isClerkConfigured) {
      const authObj = await auth();
      userId = authObj.userId;
    }

    if (!userId && process.env.NODE_ENV === "development") {
      userId = "mock_user_123";
    }

    const effectiveUserId = userId || "anonymous";

    // 2. Run Arcjet protection FIRST (rate limiting, bot detection, shield) before consuming body stream
    const decision = await aj.protect(req, { userId: effectiveUserId, requested: 1 });
    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        return NextResponse.json(
          { error: "Rate limit exceeded. Please wait a moment before trying again." },
          { status: 429 }
        );
      }
      if (decision.reason.isBot()) {
        return NextResponse.json({ error: "Automated access is not allowed." }, { status: 403 });
      }
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    // 3. Parse request body
    const body = await req.json();
    const { threadId, parentId, model, anonToken: bodyAnonToken, systemPrompt, temperature, topP, maxTokens } = body;
    const anonTokenHeader = req.headers.get("x-anon-token");
    const anonToken = bodyAnonToken || anonTokenHeader;

    if (!threadId || !parentId || !model) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    // 4. Parallelize thread verification and past messages fetch (READ only — 2 queries instead of 3)
    const [thread, pastMessages] = await Promise.all([
      prisma.thread.findUnique({
        where: { id: threadId },
      }),
      prisma.message.findMany({
        where: { threadId },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    // 5. Enforce thread ownership and parent message validity before writing any data
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const isOwner =
      Boolean(userId && thread.userId === userId) ||
      Boolean(
        anonToken &&
          typeof anonToken === "string" &&
          thread.userId === `anon_${anonToken.trim()}`
      ) ||
      (process.env.NODE_ENV === "development" && thread.userId === "mock_user_123");

    if (!isOwner) {
      return NextResponse.json({ error: "Unauthorized access to thread" }, { status: 403 });
    }

    const parentMessage = pastMessages.find((m) => m.id === parentId);
    if (!parentMessage) {
      return NextResponse.json(
        { error: "Parent message not found in this thread" },
        { status: 400 }
      );
    }

    // Inherit or override generation hyperparameters
    const effectiveSystemPrompt = parentMessage?.systemPrompt || (typeof systemPrompt === "string" ? systemPrompt : null);
    const effectiveTemperature = parentMessage?.temperature ?? (typeof temperature === "number" ? temperature : null);
    const effectiveTopP = parentMessage?.topP ?? (typeof topP === "number" ? topP : null);
    const effectiveMaxTokens = parentMessage?.maxTokens ?? (typeof maxTokens === "number" ? maxTokens : null);

    // 6. Create assistant message placeholder in database only after authorization passes
    const assistantMessage = await prisma.message.create({
      data: {
        role: "assistant",
        content: "",
        model,
        threadId,
        parentId,
        systemPrompt: effectiveSystemPrompt,
        temperature: effectiveTemperature,
        topP: effectiveTopP,
        maxTokens: effectiveMaxTokens,
      },
    });

    // Construct streaming messages array, inserting system prompt if present
    const messagesToStream: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
    if (effectiveSystemPrompt && effectiveSystemPrompt.trim() !== "") {
      messagesToStream.push({
        role: "system",
        content: effectiveSystemPrompt.trim(),
      });
    }

    const parentIndex = pastMessages.findIndex((m) => m.id === parentId);
    const historyMessages = (
      parentIndex !== -1 ? pastMessages.slice(0, parentIndex + 1) : pastMessages
    ).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
    messagesToStream.push(...historyMessages);

    // 7. Return standard Server-Sent Events (SSE) Response
    const reqRecvTime = performance.now();
    const encoder = new TextEncoder();
    const customStream = new ReadableStream({
      async start(controller) {
        let startTime = performance.now();
        let openRouterConnectMs: number | null = null;
        let ttft: number | null = null;
        let tokenCount = 0;
        let completionText = "";
        let isFirstToken = true;
        let activeAbortController: AbortController | null = null;
        let inactivityTimeout: NodeJS.Timeout | null = null;

        const clearInactivityTimeout = () => {
          if (inactivityTimeout) {
            clearTimeout(inactivityTimeout);
            inactivityTimeout = null;
          }
        };

        const resetInactivityTimeout = () => {
          clearInactivityTimeout();
          inactivityTimeout = setTimeout(() => {
            if (activeAbortController) {
              activeAbortController.abort(
                new Error("Stream connection timed out due to inactivity.")
              );
            }
          }, 15000);
        };

        try {
          // Send initial metadata containing the DB message ID, server receive timestamp, and hyperparameters
          safeEnqueue(controller, encoder, {
            type: "meta",
            messageId: assistantMessage.id,
            reqRecvMs: Math.round(reqRecvTime),
            config: {
              systemPrompt: effectiveSystemPrompt,
              temperature: effectiveTemperature,
              topP: effectiveTopP,
              maxTokens: effectiveMaxTokens,
            },
          });

          // Fallback cascade models if primary model is rate-limited or unavailable
          const FALLBACK_CASCADE = [
            "google/gemini-2.0-flash-exp:free",
            "meta-llama/llama-3.3-70b-instruct:free",
            "qwen/qwen-2.5-coder-32b-instruct:free",
            "nvidia/nemotron-3.5-lightning:free",
            "minimax/minimax-m3:free",
          ];

          let activeModel = model;
          let response: Response | null = null;
          let modelsToTry = [model, ...FALLBACK_CASCADE.filter((m) => m !== model)];

          for (const currentTryModel of modelsToTry) {
            clearInactivityTimeout();
            activeAbortController = new AbortController();
            resetInactivityTimeout();

            try {
              const fetchStart = performance.now();
              const openRouterPayload: Record<string, unknown> = {
                model: currentTryModel,
                messages: messagesToStream,
                stream: true,
                usage: { include: true },
              };

              if (typeof effectiveTemperature === "number" && !isNaN(effectiveTemperature)) {
                openRouterPayload.temperature = Math.max(0, Math.min(2, effectiveTemperature));
              }
              if (typeof effectiveTopP === "number" && !isNaN(effectiveTopP)) {
                openRouterPayload.top_p = Math.max(0, Math.min(1, effectiveTopP));
              }
              if (typeof effectiveMaxTokens === "number" && !isNaN(effectiveMaxTokens)) {
                openRouterPayload.max_tokens = Math.max(1, Math.min(8192, effectiveMaxTokens));
              }

              response = await executeWithRetryAndBackoff(
                async () => {
                  return await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
                      "Content-Type": "application/json",
                      "HTTP-Referer": "http://localhost:3000",
                      "X-Title": "Swag-flow",
                    },
                    body: JSON.stringify(openRouterPayload),
                    signal: activeAbortController?.signal,
                  });
                },
                {
                  maxRetries: 3,
                  baseDelayMs: 500,
                  maxDelayMs: 8000,
                  cooldownKey: getCooldownKey("openrouter", currentTryModel),
                  signal: req.signal,
                  streamStarted: false,
                }
              );

              openRouterConnectMs = performance.now() - fetchStart;

              if (response && response.ok) {
                activeModel = currentTryModel;
                break;
              }
            } catch (fetchErr) {
              console.warn(`Fetch attempt failed for ${currentTryModel}:`, fetchErr);
            }
          }

          if (!response || !response.ok) {
            clearInactivityTimeout();
            const errText = response ? await response.text() : "No response";
            let detail = errText;
            try {
              const parsedErr = JSON.parse(errText);
              detail = parsedErr.error?.message || parsedErr.message || errText;
            } catch {
              // Use raw text fallback
            }
            throw new Error(`OpenRouter (${response ? response.status : 500}): ${detail}`);
          }

          // If a fallback model was selected, notify database and client UI
          if (activeModel !== model) {
            prisma.message
              .update({
                where: { id: assistantMessage.id },
                data: { model: activeModel },
              })
              .catch(() => {});

            safeEnqueue(controller, encoder, {
              type: "fallback",
              originalModel: model,
              fallbackModel: activeModel,
            });
          }

          const reader = response.body?.getReader();
          if (!reader) {
            if (inactivityTimeout) clearTimeout(inactivityTimeout);
            throw new Error("No readable stream body returned from OpenRouter");
          }

          const decoder = new TextDecoder();
          let buffer = "";
          startTime = performance.now();
          let lastFlushTime = performance.now();
          let capturedUsageObj: Record<string, unknown> | null = null;

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              resetInactivityTimeout(); // Reset 15s inactivity watchdog on each chunk

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                const cleanedLine = line.trim();
                if (!cleanedLine) continue;

                if (cleanedLine.startsWith("data: ")) {
                  const dataStr = cleanedLine.slice(6).trim();
                  if (dataStr === "[DONE]") continue;

                  let parsed: Record<string, unknown> | null = null;
                  try {
                    parsed = JSON.parse(dataStr);
                  } catch {
                    // Ignore JSON parsing errors for incomplete lines split across chunk boundaries
                    continue;
                  }

                  if (parsed && typeof parsed === "object") {
                    const parsedObj = parsed as {
                      error?: { message?: string };
                      choices?: Array<{ delta?: { content?: string } }>;
                      usage?: Record<string, unknown>;
                    };

                    if (parsedObj.error) {
                      const msg = parsedObj.error.message || "Model provider error";
                      throw new Error(`OpenRouter: ${msg}`);
                    }

                    if (parsedObj.usage) {
                      capturedUsageObj = { ...(capturedUsageObj || {}), ...(parsedObj.usage || {}) };
                      if (typeof parsedObj.usage.completion_tokens === "number") {
                        tokenCount = parsedObj.usage.completion_tokens;
                      }
                    }

                    const content = parsedObj.choices?.[0]?.delta?.content;
                    if (content) {
                      if (isFirstToken) {
                        ttft = (performance.now() - startTime) / 1000;
                        isFirstToken = false;
                      }
                      completionText += content;
                      // Fallback token counter in case usage statistics aren't received
                      tokenCount += 1;

                      safeEnqueue(controller, encoder, { type: "token", text: content });

                      // Periodically flush accumulated text to database (every 3s — final write on done is authoritative)
                      const now = performance.now();
                      if (now - lastFlushTime > 3000 && completionText.length > 0) {
                        lastFlushTime = now;
                        prisma.message
                          .update({
                            where: { id: assistantMessage.id },
                            data: { content: completionText },
                          })
                          .catch(() => {});
                      }
                    }
                  }
                }
              }
            }

            // Handle any remaining text in buffer
            if (buffer.trim().startsWith("data: ")) {
              const cleanedLine = buffer.trim();
              const dataStr = cleanedLine.slice(6).trim();
              if (dataStr !== "[DONE]") {
                let parsed: Record<string, unknown> | null = null;
                try {
                  parsed = JSON.parse(dataStr);
                } catch {
                  // Ignore
                }
                if (parsed && typeof parsed === "object") {
                  const parsedObj = parsed as {
                    error?: { message?: string };
                    choices?: Array<{ delta?: { content?: string } }>;
                    usage?: Record<string, unknown>;
                  };

                  if (parsedObj.error) {
                    const msg = parsedObj.error.message || "Model provider error";
                    throw new Error(`OpenRouter: ${msg}`);
                  }

                  if (parsedObj.usage) {
                    capturedUsageObj = { ...capturedUsageObj, ...parsedObj.usage };
                    if (typeof parsedObj.usage.completion_tokens === "number") {
                      tokenCount = parsedObj.usage.completion_tokens;
                    }
                  }

                  const content = parsedObj.choices?.[0]?.delta?.content;
                  if (content) {
                    completionText += content;
                    tokenCount += 1;
                    safeEnqueue(controller, encoder, { type: "token", text: content });
                  }
                }
              }
            }

            const totalTime = (performance.now() - startTime) / 1000;
            const actualTtft = ttft ?? totalTime;
            const tokensPerSec =
              totalTime > actualTtft ? tokenCount / (totalTime - actualTtft) : tokenCount;

            const normalizedUsage = normalizeUsage(capturedUsageObj, {
              modelRequested: model,
              actualModelUsed: activeModel,
              fallbackOccurred: activeModel !== model,
            });

            // Update database with final response content, performance metrics, and cost usage
            try {
              const updateData: Record<string, unknown> = {
                content: completionText,
                latency: totalTime,
                ttft: actualTtft,
                tokensPerSec,
                tokenCount,
                promptTokens: normalizedUsage.promptTokens,
                completionTokens: normalizedUsage.completionTokens,
                reasoningTokens: normalizedUsage.reasoningTokens,
                cachedTokens: normalizedUsage.cachedTokens,
                costUsd: normalizedUsage.costUsd,
                costSource: normalizedUsage.costSource,
                actualModel: activeModel,
              };

              await prisma.message.update({
                where: { id: assistantMessage.id },
                data: updateData as Parameters<typeof prisma.message.update>[0]["data"],
              });
            } catch (dbErr) {
              console.warn("Notice: Message update skipped or record moved:", dbErr);
            }

            // Log completion metrics in Statsig (fire-and-forget for speed)
            logStatsigEvent(effectiveUserId, "model_response_completed", {
              threadId,
              model,
              actualModel: activeModel,
              messageId: assistantMessage.id,
              latency: totalTime,
              ttft: actualTtft,
              tokensPerSec,
              tokenCount,
              costUsd: normalizedUsage.costUsd,
              status: "success",
            }).catch(() => {});

            // Send completion metadata to the client
            safeEnqueue(controller, encoder, {
              type: "done",
              latency: totalTime,
              ttft: actualTtft,
              tokensPerSec,
              tokenCount,
              usage: normalizedUsage,
            });
            clearInactivityTimeout();
            safeClose(controller);
          } catch (streamError: unknown) {
            throw streamError;
          }
        } catch (err: unknown) {
          clearInactivityTimeout();
          // Log full internal error diagnostics to server logs for debugging
          console.error("Error during streaming process:", err);

          const rawErrorString = err instanceof Error ? err.message : String(err);
          const lowerErr = rawErrorString.toLowerCase();

          const isTimeout =
            err instanceof Error &&
            (err.name === "TimeoutError" ||
              err.name === "AbortError" ||
              lowerErr.includes("timeout"));

          const isRateLimit = lowerErr.includes("429") || lowerErr.includes("rate limit");
          const isCapacityOrServiceErr =
            lowerErr.includes("503") ||
            lowerErr.includes("500") ||
            lowerErr.includes("502") ||
            lowerErr.includes("504") ||
            lowerErr.includes("overloaded") ||
            lowerErr.includes("capacity") ||
            lowerErr.includes("unavailable");

          // Sanitize browser-facing error message to prevent leaking internal provider secret details or diagnostic IDs
          const errorMessage = isTimeout
            ? "Model connection timed out due to inactivity. Click 🔄 to retry."
            : isRateLimit
              ? "The model provider is temporarily rate limited. Please wait a moment and click 🔄 to retry."
              : isCapacityOrServiceErr
                ? "The AI model service is temporarily overloaded or unavailable. Click 🔄 to retry."
                : "Unable to complete response from model provider. Click 🔄 to retry.";

          const elapsed = (performance.now() - startTime) / 1000;
          const actualTtft = ttft ?? elapsed;

          // If we already accumulated content, save that content rather than overwriting with error
          const savedContent =
            completionText.trim().length > 0 ? completionText : `Error: ${errorMessage}`;

          try {
            await prisma.message.update({
              where: { id: assistantMessage.id },
              data: {
                content: savedContent,
                latency: elapsed,
                ttft: actualTtft,
                tokenCount,
              },
            });
          } catch (dbErr) {
            console.error("Failed to update message on stream error:", dbErr);
          }

          // Log failure event in Statsig (fire-and-forget)
          logStatsigEvent(effectiveUserId, "model_response_failed", {
            threadId,
            model,
            messageId: assistantMessage.id,
            error: errorMessage,
          }).catch(() => {});

          // Inform client of the error cleanly
          safeEnqueue(controller, encoder, {
            type: "error",
            message: errorMessage,
          });
          safeClose(controller);
        }
      },
    });

    return new Response(customStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    console.error("Error in stream route handler:", error);
    return NextResponse.json({ error: "An unexpected server error occurred." }, { status: 500 });
  }
}
