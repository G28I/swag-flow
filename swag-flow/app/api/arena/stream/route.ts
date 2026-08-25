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

    // In local development, if no active session exists, fallback to mock user
    if (!userId && process.env.NODE_ENV === "development") {
      userId = "mock_user_123";
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Clone request to read body for Arcjet validation (if required),
    // then validate body parameters.
    const body = await req.json();
    const { threadId, parentId, model } = body;

    if (!threadId || !parentId || !model) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    // 3. Run Arcjet protection (rate limiting, bot detection, shield)
    // We pass userId to track the token bucket limit per user across all models
    const decision = await aj.protect(req, { userId, requested: 1 });
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

    // 4. Verify thread ownership and parentId validity (parallelized for speed)
    const [thread, parentMessage] = await Promise.all([
      prisma.thread.findFirst({
        where: { id: threadId, userId },
      }),
      prisma.message.findFirst({
        where: { id: parentId, threadId },
      }),
    ]);

    if (!thread) {
      return NextResponse.json({ error: "Thread not found or unauthorized" }, { status: 404 });
    }

    if (!parentMessage) {
      return NextResponse.json(
        { error: "Parent message not found in this thread" },
        { status: 400 }
      );
    }

    // 5. Create the assistant message placeholder in the database
    const assistantMessage = await prisma.message.create({
      data: {
        role: "assistant",
        content: "",
        model,
        threadId,
        parentId,
      },
    });

    // 6. Build conversation history up to the parent message
    const pastMessages = await prisma.message.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
    });

    const parentIndex = pastMessages.findIndex((m) => m.id === parentId);
    const messagesToStream = (
      parentIndex !== -1 ? pastMessages.slice(0, parentIndex + 1) : pastMessages
    ).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // 6. Return standard Server-Sent Events (SSE) Response
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

          // Fetch OpenRouter API stream
          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "http://localhost:3000",
              "X-Title": "Swag-flow",
            },
            body: JSON.stringify({
              model,
              messages: messagesToStream,
              stream: true,
              stream_options: { include_usage: true },
            }),
            signal: AbortSignal.timeout(35000),
          });

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`OpenRouter returned status ${response.status}: ${errText}`);
          }

          const reader = response.body?.getReader();
          if (!reader) {
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

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                const cleanedLine = line.trim();
                if (!cleanedLine) continue;

                if (cleanedLine.startsWith("data: ")) {
                  const dataStr = cleanedLine.slice(6).trim();
                  if (dataStr === "[DONE]") continue;

                  try {
                    const parsed = JSON.parse(dataStr);
                    const content = parsed.choices?.[0]?.delta?.content;

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

                    if (parsed.usage) {
                      tokenCount = parsed.usage.completion_tokens;
                    }
                  } catch {
                    // Ignore JSON parsing errors for incomplete lines
                  }
                }
              }
            }

            // Handle any remaining text in buffer
            if (buffer.trim().startsWith("data: ")) {
              const cleanedLine = buffer.trim();
              const dataStr = cleanedLine.slice(6).trim();
              if (dataStr !== "[DONE]") {
                try {
                  const parsed = JSON.parse(dataStr);
                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content) {
                    completionText += content;
                    tokenCount += 1;
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({ type: "token", text: content })}\n\n`
                      )
                    );
                  }
                  if (parsed.usage) {
                    tokenCount = parsed.usage.completion_tokens;
                  }
                } catch {
                  // Ignore
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
            logStatsigEvent(userId, "model_response_completed", {
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
            ? "Model request timed out after 35 seconds. Click 🔄 to retry."
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
          logStatsigEvent(userId, "model_response_failed", {
            threadId,
            model,
            messageId: assistantMessage.id,
            error: errorMessage,
          }).catch(() => {});

          // Inform client of the error if controller is open
          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  message: "An error occurred while calling the model. Please try again.",
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
