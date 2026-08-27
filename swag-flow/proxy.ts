import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define which routes are public
const isPublicRoute = createRouteMatcher([
  "/",
  "/leaderboard",
  "/models",
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Endpoints that support public access
  "/api/arena/stream",
  "/api/arena/prompt",
  "/api/arena/models",
  "/api/arena/vote",
  "/api/arena/threads(.*)",
  "/api/arena/leaderboard",
  "/api/arena/config",
  "/api/arena/telemetry",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
