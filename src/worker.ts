import { createApp } from "./app.ts";
import { createGeminiProvider } from "./gemini-provider.ts";
import { createProtectedApp } from "./session-auth.ts";
import { createUsageGuard } from "./usage-guard.ts";

const API_PATHS = new Set(["/api/session", "/api/transcriptions"]);
const MAXIMUM_REQUEST_BYTES = 16 * 1_024;

const SECURITY_HEADERS = {
  "content-security-policy": [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
  ].join("; "),
  "permissions-policy":
    "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
} as const;

const apps = new WeakMap<object, ReturnType<typeof createProtectedApp>>();

function appFor(env: Env): ReturnType<typeof createProtectedApp> {
  const existing = apps.get(env);
  if (existing !== undefined) {
    return existing;
  }

  const app = createProtectedApp({
    app: createApp({
      maxTranscriptCharacters: 400_000,
      provider: createGeminiProvider({
        apiKey: env.GEMINI_API_KEY,
        model: "gemini-3.6-flash",
        timeoutMs: 300_000,
      }),
      usageGuard: createUsageGuard({
        maxConcurrent: 1,
        maxPerClientPerHour: 6,
        maxPerDay: 20,
      }),
    }),
    secureCookie: true,
    sitePassword: env.SITE_PASSWORD,
  });
  apps.set(env, app);
  return app;
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function requestTooLargeResponse(): Response {
  return Response.json(
    {
      error: {
        code: "REQUEST_TOO_LARGE",
        message: "O pedido é demasiado grande.",
      },
    },
    {
      headers: { "cache-control": "no-store" },
      status: 413,
    },
  );
}

async function requestIsTooLarge(request: Request): Promise<boolean> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAXIMUM_REQUEST_BYTES
  ) {
    return true;
  }

  if (request.body === null) {
    return false;
  }

  const reader = request.clone().body?.getReader();
  if (reader === undefined) {
    return false;
  }

  let receivedBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        return false;
      }
      receivedBytes += chunk.value.byteLength;
      if (receivedBytes > MAXIMUM_REQUEST_BYTES) {
        await reader.cancel();
        return true;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const requestUrl = new URL(request.url);

    try {
      if (API_PATHS.has(requestUrl.pathname)) {
        if (
          request.method !== "GET" &&
          request.method !== "HEAD" &&
          (await requestIsTooLarge(request))
        ) {
          return withSecurityHeaders(requestTooLargeResponse());
        }

        const response = await appFor(env).handle(request, {
          clientAddress:
            request.headers.get("cf-connecting-ip") ?? "unknown",
        });
        return withSecurityHeaders(response);
      }

      return withSecurityHeaders(await env.ASSETS.fetch(request));
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "request_failed",
          message:
            error instanceof Error ? error.message : "Unknown Worker error",
          method: request.method,
          path: requestUrl.pathname,
        }),
      );
      return withSecurityHeaders(
        new Response("Internal server error", {
          headers: {
            "cache-control": "no-store",
            "content-type": "text/plain; charset=utf-8",
          },
          status: 500,
        }),
      );
    }
  },
} satisfies ExportedHandler<Env>;
