import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Claude chose this approach because: on Vercel the function is paused as soon as the response
// is sent, before Sentry's background send runs (Vercel logs showed "No outgoing requests").
// Waiting up to 2s for the send only affects requests that already failed.
export const onRequestError: typeof Sentry.captureRequestError = async (...args) => {
  Sentry.captureRequestError(...args);
  await Sentry.flush(2000);
};
