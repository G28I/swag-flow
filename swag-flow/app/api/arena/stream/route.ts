import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/app/lib/prisma";
import { aj } from "@/app/lib/arcjet";
import { logStatsigEvent } from "@/app/lib/statsig";
import { env } from "@/app/lib/env";

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
    const { threadId, parentId, model } = body;

    if (!threadId || !parentId || !model) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    // 4. Parallelize thread verification, parent lookup, and past messages fetch (READ only)
    const [thread, parentMessage, pastMessages] = await Promise.all([
      prisma.thread.findUnique({
        where: { id: threadId },
      }),
      prisma.message.findFirst({
        where: { id: parentId, threadId },
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

    const isAnonymousThread =
      !thread.userId || thread.userId === "anonymous" || thread.userId === "mock_user_123";

    if (!isAnonymousThread && thread.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized access to thread" }, { status: 403 });
    }

    if (!parentMessage) {
      return NextResponse.json(
        { error: "Parent message not found in this thread" },
        { status: 400 }
      );
    }

    // 6. Create assistant message placeholder in database only after authorization passes
    const assistantMessage = await prisma.message.create({
      data: {
        role: "assistant",
        content: "",
        model,
        threadId,
        parentId,
      },
    });

    const parentIndex = pastMessages.findIndex((m) => m.id === parentId);
    const messagesToStream = (
      parentIndex !== -1 ? pastMessages.slice(0, parentIndex + 1) : pastMessages
    ).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // 5. Return standard Server-Sent Events (SSE) Response
    const encoder = new TextEncoder();
    const customStream = new ReadableStream({
      async start(controller) {
        let startTime = performance.now();
        let ttft: number | null = null;
        let tokenCount = 0;
        let completionText = "";
        let isFirstToken = true;

        try {
          // Send initial metadata containing the DB message ID
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "meta", messageId: assistantMessage.id })}\n\n`
            )
          );

          // Inactivity watchdog for OpenRouter connection:
          // 15 seconds allowed for first byte or between streaming data chunks
          const openRouterAbortController = new AbortController();
          let inactivityTimeout: NodeJS.Timeout | null = null;

          const resetInactivityTimeout = () => {
            if (inactivityTimeout) clearTimeout(inactivityTimeout);
            inactivityTimeout = setTimeout(() => {
              openRouterAbortController.abort(
                new Error("Stream connection timed out due to inactivity.")
              );
            }, 15000);
          };

          resetInactivityTimeout();

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
            let attempts = 0;
            while (attempts < 2) {
              attempts++;
              try {
                response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:3000",
                    "X-Title": "Swag-flow",
                  },
                  body: JSON.stringify({
                    model: currentTryModel,
                    messages: messagesToStream,
                    stream: true,
                  }),
                  signal: openRouterAbortController.signal,
                });

                if (response.status === 429 && attempts < 2) {
                  await new Promise((res) => setTimeout(res, 300));
                  continue;
                }
              } catch (fetchErr) {
                console.warn(`Fetch error for ${currentTryModel}:`, fetchErr);
              }
              break;
            }

            if (response && response.ok) {
              activeModel = currentTryModel;
              break;
            }
          }

          if (!response || !response.ok) {
            if (inactivityTimeout) clearTimeout(inactivityTimeout);
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

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "fallback",
                  originalModel: model,
                  fallbackModel: activeModel,
                })}\n\n`
              )
            );
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
                      usage?: { completion_tokens?: number };
                    };

                    if (parsedObj.error) {
                      const msg = parsedObj.error.message || "Model provider error";
                      throw new Error(`OpenRouter: ${msg}`);
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

                      controller.enqueue(
                        encoder.encode(
                          `data: ${JSON.stringify({ type: "token", text: content })}\n\n`
                        )
                      );

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

                    if (parsedObj.usage?.completion_tokens) {
                      tokenCount = parsedObj.usage.completion_tokens;
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
                    usage?: { completion_tokens?: number };
                  };

                  if (parsedObj.error) {
                    const msg = parsedObj.error.message || "Model provider error";
                    throw new Error(`OpenRouter: ${msg}`);
                  }

                  const content = parsedObj.choices?.[0]?.delta?.content;
                  if (content) {
                    completionText += content;
                    tokenCount += 1;
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({ type: "token", text: content })}\n\n`
                      )
                    );
                  }
                  if (parsedObj.usage?.completion_tokens) {
                    tokenCount = parsedObj.usage.completion_tokens;
                  }
                }
              }
            }

            const totalTime = (performance.now() - startTime) / 1000;
            const actualTtft = ttft ?? totalTime;
            const tokensPerSec =
              totalTime > actualTtft ? tokenCount / (totalTime - actualTtft) : tokenCount;

            // Update database with final response content and performance metrics
            try {
              await prisma.message.update({
                where: { id: assistantMessage.id },
                data: {
                  content: completionText,
                  latency: totalTime,
                  ttft: actualTtft,
                  tokensPerSec,
                  tokenCount,
                },
              });
            } catch (dbErr) {
              console.warn("Notice: Message update skipped or record moved:", dbErr);
            }

            // Log completion metrics in Statsig (fire-and-forget for speed)
            logStatsigEvent(effectiveUserId, "model_response_completed", {
              threadId,
              model,
              messageId: assistantMessage.id,
              latency: totalTime,
              ttft: actualTtft,
              tokensPerSec,
              tokenCount,
              status: "success",
            }).catch(() => {});

            // Send completion metadata to the client
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "done",
                  latency: totalTime,
                  ttft: actualTtft,
                  tokensPerSec,
                  tokenCount,
                })}\n\n`
              )
            );
            controller.close();
          } catch (streamError: unknown) {
            throw streamError;
          }
        } catch (err: unknown) {
          console.error("Error during streaming process:", err);

          const isTimeout =
            err instanceof Error &&
            (err.name === "TimeoutError" ||
              err.name === "AbortError" ||
              err.message.toLowerCase().includes("timeout"));
          const errorMessage = isTimeout
            ? "Model connection timed out due to inactivity. Click 🔄 to retry."
            : err instanceof Error
              ? err.message
              : "Unknown error";
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

          // Inform client of the precise error if controller is open
          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  message: errorMessage,
                })}\n\n`
              )
            );
            controller.close();
          } catch {
            // Client may have already closed connection
          }
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
