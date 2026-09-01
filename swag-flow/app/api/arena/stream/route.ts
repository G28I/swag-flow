import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { aj } from "@/app/lib/arcjet";
import prisma from "@/app/lib/prisma";
import { executeWithRetryAndBackoff, RetryEngineError } from "@/app/lib/retryEngine";
import { calculateCost, parseUsageTokens } from "@/app/lib/costEngine";
import { normalizeAnonToken, isThreadOwner } from "@/app/lib/authHelper";

export const maxDuration = 60; // 60s maximum execution time for Vercel / serverless

const MODEL_FALLBACK_CHAIN: Record<string, string[]> = {
  "google/gemini-2.0-flash-exp:free": [
    "meta-llama/llama-3.3-70b-instruct:free",
    "qwen/qwen-2.5-coder-32b-instruct:free",
    "nvidia/nemotron-3.5-lightning:free",
  ],
  "meta-llama/llama-3.3-70b-instruct:free": [
    "qwen/qwen-2.5-coder-32b-instruct:free",
    "google/gemini-2.0-flash-exp:free",
    "minimax/minimax-m3:free",
  ],
  "qwen/qwen-2.5-coder-32b-instruct:free": [
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemini-2.0-flash-exp:free",
  ],
};

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

function safeClose(controller: ReadableStreamDefaultController): void {
  try {
    controller.close();
  } catch {}
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

    const anonTokenHeader = req.headers.get("x-anon-token");
    const normalizedAnon = normalizeAnonToken(anonTokenHeader);
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const arcjetUserId = userId || normalizedAnon || clientIp;

    // 2. Run Arcjet protection FIRST (rate limiting, bot detection, shield) before consuming body stream
    const decision = await aj.protect(req, { userId: arcjetUserId, requested: 1 });
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
    const anonToken = bodyAnonToken || anonTokenHeader;

    if (!threadId || !parentId || !model) {
      return NextResponse.json(
        { error: "threadId, parentId, and model are required" },
        { status: 400 }
      );
    }

    // 4. Verify thread ownership
    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    if (!isThreadOwner(thread.userId, userId, anonToken)) {
      return NextResponse.json({ error: "Unauthorized access to thread" }, { status: 403 });
    }

    // Verify parent user message exists in this thread
    const parentMsg = await prisma.message.findFirst({
      where: {
        id: parentId,
        threadId,
        role: "user",
      },
    });

    if (!parentMsg) {
      return NextResponse.json({ error: "Parent user prompt message not found in this thread" }, { status: 404 });
    }

    // 5. Create assistant message placeholder in DB
    const assistantMessage = await prisma.message.create({
      data: {
        role: "assistant",
        content: "",
        model,
        threadId,
        parentId,
        systemPrompt: systemPrompt || parentMsg.systemPrompt || null,
        temperature: typeof temperature === "number" ? temperature : parentMsg.temperature || null,
        topP: typeof topP === "number" ? topP : parentMsg.topP || null,
        maxTokens: typeof maxTokens === "number" ? maxTokens : parentMsg.maxTokens || null,
      },
    });

    // Build conversation context history for LLM
    const historyMessages = await prisma.message.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
    });

    const openRouterMessages: Array<{ role: string; content: string }> = [];

    // System prompt if configured
    const effectiveSystemPrompt = systemPrompt || parentMsg.systemPrompt;
    if (effectiveSystemPrompt) {
      openRouterMessages.push({ role: "system", content: effectiveSystemPrompt });
    }

    // Append prior conversation turns up to current parent prompt
    for (const msg of historyMessages) {
      if (msg.role === "user") {
        openRouterMessages.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant" && msg.id !== assistantMessage.id && msg.content) {
        openRouterMessages.push({ role: "assistant", content: msg.content });
      }
      if (msg.id === parentId) break;
    }

    const openRouterApiKey = process.env.OPENROUTER_API_KEY;

    // 6. Return Streaming Server-Sent Events (SSE) Response
    const encoder = new TextEncoder();
    const customReadable = new ReadableStream({
      async start(controller) {
        const startTime = performance.now();
        let completionText = "";
        let isFirstToken = true;
        let ttft: number | null = null;
        let tokenCount = 0;
        let promptTokensCount = 0;
        let completionTokensCount = 0;
        let reasoningTokensCount = 0;
        let cachedTokensCount = 0;
        let activeModel = model;
        let lastFlushTime = performance.now();
        let activeAbortController: AbortController | null = null;
        let inactivityTimer: NodeJS.Timeout | null = null;

        const resetInactivityTimeout = () => {
          if (inactivityTimer) clearTimeout(inactivityTimer);
          inactivityTimer = setTimeout(() => {
            if (activeAbortController) {
              activeAbortController.abort("Inactivity watchdog timeout after 25 seconds of silence");
            }
          }, 25000);
        };

        const clearInactivityTimeout = () => {
          if (inactivityTimer) {
            clearTimeout(inactivityTimer);
            inactivityTimer = null;
          }
        };

        try {
          const candidateModels = [model, ...(MODEL_FALLBACK_CHAIN[model] || [])];
          let streamSuccess = false;

          for (let modelIdx = 0; modelIdx < candidateModels.length; modelIdx++) {
            const currentCandidateModel = candidateModels[modelIdx];
            activeModel = currentCandidateModel;

            if (modelIdx > 0) {
              safeEnqueue(controller, encoder, {
                type: "fallback_notice",
                requestedModel: model,
                fallbackModel: currentCandidateModel,
              });
            }

            try {
              await executeWithRetryAndBackoff(
                async (_attempt) => {
                  activeAbortController = new AbortController();
                  resetInactivityTimeout();

                  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${openRouterApiKey}`,
                      "HTTP-Referer": "https://github.com/G28I/swag-flow",
                      "X-Title": "Swag-flow",
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      model: currentCandidateModel,
                      messages: openRouterMessages,
                      stream: true,
                      temperature: typeof temperature === "number" ? temperature : 0.7,
                      top_p: typeof topP === "number" ? topP : 1.0,
                      max_tokens: typeof maxTokens === "number" ? maxTokens : 2048,
                    }),
                    signal: activeAbortController.signal,
                  });

                  if (!response.ok) {
                    clearInactivityTimeout();
                    const detail = await response.text().catch(() => "");
                    throw new RetryEngineError(
                      `OpenRouter (${response.status}): ${detail}`,
                      response.status === 429 ? "RATE_LIMITED" : "NETWORK_ERROR",
                      response.status
                    );
                  }

                  if (!response.body) {
                    clearInactivityTimeout();
                    throw new Error("OpenRouter response body is null");
                  }

                  const reader = response.body.getReader();
                  const decoder = new TextDecoder();
                  let buffer = "";

                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    resetInactivityTimeout();
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";

                    for (const line of lines) {
                      const trimmed = line.trim();
                      if (!trimmed || trimmed.startsWith(":")) continue;

                      if (trimmed === "data: [DONE]") {
                        break;
                      }

                      if (trimmed.startsWith("data: ")) {
                        const jsonStr = trimmed.slice(6);
                        try {
                          const parsedObj = JSON.parse(jsonStr);

                          if (parsedObj.error) {
                            const providerErrorMsg = typeof parsedObj.error === "string"
                              ? parsedObj.error
                              : parsedObj.error.message || "Model provider stream error";
                            throw new Error(providerErrorMsg);
                          }

                          if (parsedObj.usage) {
                            const parsedUsage = parseUsageTokens(parsedObj.usage);
                            promptTokensCount = parsedUsage.promptTokens;
                            completionTokensCount = parsedUsage.completionTokens;
                            reasoningTokensCount = parsedUsage.reasoningTokens;
                            cachedTokensCount = parsedUsage.cachedTokens;
                            if (parsedUsage.completionTokens > 0) {
                              tokenCount = parsedUsage.completionTokens;
                            }
                          }

                          const content = parsedObj.choices?.[0]?.delta?.content;
                          if (content) {
                            if (isFirstToken) {
                              ttft = (performance.now() - startTime) / 1000;
                              isFirstToken = false;
                            }
                            completionText += content;
                            tokenCount += 1;

                            const ok = safeEnqueue(controller, encoder, { type: "token", text: content });
                            if (!ok) {
                              // Client disconnected — abort upstream fetch and exit streaming loop immediately
                              activeAbortController?.abort();
                              return;
                            }

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
                        } catch {
                          // Ignore partial JSON chunks
                        }
                      }
                    }
                  }

                  streamSuccess = true;
                  return response;
                },
                {
                  maxRetries: 2,
                  baseDelayMs: 1000,
                  maxDelayMs: 4000,
                  cooldownKey: currentCandidateModel,
                  streamStarted: !isFirstToken,
                }
              );

              if (streamSuccess) break;
            } catch (candidateErr: unknown) {
              clearInactivityTimeout();

              if (candidateErr instanceof RetryEngineError && candidateErr.kind === "ABORTED") {
                throw candidateErr;
              }

              if (modelIdx === candidateModels.length - 1) {
                throw candidateErr;
              }
            }
          }

          clearInactivityTimeout();

          const totalElapsed = (performance.now() - startTime) / 1000;
          const finalTtft = ttft ?? totalElapsed;
          const tokensPerSec = totalElapsed > 0 ? tokenCount / totalElapsed : 0;
          const costData = calculateCost(activeModel, promptTokensCount, completionTokensCount);

          await prisma.message.update({
            where: { id: assistantMessage.id },
            data: {
              content: completionText,
              model: activeModel,
              actualModel: activeModel,
              latency: totalElapsed,
              ttft: finalTtft,
              tokensPerSec,
              tokenCount,
              promptTokens: promptTokensCount,
              completionTokens: completionTokensCount,
              reasoningTokens: reasoningTokensCount,
              cachedTokens: cachedTokensCount,
              cost: costData.costUsd,
              costUsd: costData.costUsd,
              costSource: costData.costSource,
            },
          });

          safeEnqueue(controller, encoder, {
            type: "done",
            messageId: assistantMessage.id,
            finalText: completionText,
            actualModel: activeModel,
            metrics: {
              ttft: finalTtft,
              latency: totalElapsed,
              tokensPerSec,
              tokenCount,
              costUsd: costData.costUsd,
              costSource: costData.costSource,
            },
          });

          safeClose(controller);
        } catch (err: unknown) {
          clearInactivityTimeout();
          console.error("Error during streaming process:", err);

          const rawErrorString = err instanceof Error ? err.message : String(err);
          const lowerErr = rawErrorString.toLowerCase();

          const isTimeout =
            err instanceof Error &&
            (err.name === "TimeoutError" ||
              err.name === "AbortError" ||
              lowerErr.includes("timeout") ||
              lowerErr.includes("timed out"));

          const isRateLimit = lowerErr.includes("429") || lowerErr.includes("rate limit");
          const isCapacityOrServiceErr =
            lowerErr.includes("503") ||
            lowerErr.includes("500") ||
            lowerErr.includes("502") ||
            lowerErr.includes("504") ||
            lowerErr.includes("overloaded") ||
            lowerErr.includes("capacity") ||
            lowerErr.includes("unavailable");

          const errorMessage = isTimeout
            ? "Model connection timed out due to inactivity. Click 🔄 to retry."
            : isRateLimit
              ? "The model provider is temporarily rate limited. Please wait a moment and click 🔄 to retry."
              : isCapacityOrServiceErr
                ? "The AI model service is temporarily overloaded or unavailable. Click 🔄 to retry."
                : "Unable to complete response from model provider. Click 🔄 to retry.";

          const elapsed = (performance.now() - startTime) / 1000;
          const actualTtft = ttft ?? elapsed;

          await prisma.message
            .update({
              where: { id: assistantMessage.id },
              data: {
                content: completionText || errorMessage,
                latency: elapsed,
                ttft: actualTtft,
                tokensPerSec: elapsed > 0 ? tokenCount / elapsed : 0,
                tokenCount,
              },
            })
            .catch(() => {});

          safeEnqueue(controller, encoder, {
            type: "error",
            messageId: assistantMessage.id,
            error: errorMessage,
            partialText: completionText,
          });

          safeClose(controller);
        }
      },
    });

    return new NextResponse(customReadable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: unknown) {
    console.error("Error initializing stream route:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
