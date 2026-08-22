import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define which routes are public
const isPublicRoute = createRouteMatcher([
  "/",
  "/models",
  "/leaderboard",
  "/sign-in(.*)",
  "/sign-up(.*)",
  // We can make endpoints public in middleware, and enforce auth inside the handlers
  "/api/arena/stream",
  "/api/arena/prompt",
  "/api/arena/models",
  "/api/arena/vote",
  "/api/arena/threads(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
