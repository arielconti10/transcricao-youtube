import { createHash, createHmac, timingSafeEqual } from "node:crypto";

interface WebApp {
  handle(
    request: Request,
    context: { clientAddress: string },
  ): Promise<Response>;
}

interface ProtectedAppConfig {
  app: WebApp;
  secureCookie: boolean;
  sitePassword: string;
}

const SESSION_COOKIE_NAME = "transcricao_session";
const SESSION_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const SESSION_PURPOSE = "transcricao-youtube-session-v1";

function jsonResponse(payload: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(payload, {
    headers: {
      "cache-control": "no-store",
      ...headers,
    },
    status,
  });
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function secretsMatch(actual: string, expected: string): boolean {
  return timingSafeEqual(digest(actual), digest(expected));
}

function sessionToken(password: string): string {
  return createHmac("sha256", password)
    .update(SESSION_PURPOSE, "utf8")
    .digest("base64url");
}

function cookieValue(request: Request, name: string): string {
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader === null) {
    return "";
  }

  for (const item of cookieHeader.split(";")) {
    const separatorIndex = item.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    if (item.slice(0, separatorIndex).trim() === name) {
      return item.slice(separatorIndex + 1).trim();
    }
  }

  return "";
}

function sessionCookie(
  value: string,
  secure: boolean,
  maxAgeSeconds: number,
): string {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${value}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Strict",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) {
    attributes.push("Secure");
  }
  return attributes.join("; ");
}

function methodNotAllowed(allow: string): Response {
  return new Response("Method not allowed", {
    headers: {
      allow,
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    },
    status: 405,
  });
}

function accessDeniedResponse(): Response {
  return jsonResponse(
    {
      error: {
        code: "ACCESS_DENIED",
        message: "A sessão terminou. Introduza novamente a palavra-passe.",
      },
    },
    401,
  );
}

export function createProtectedApp(config: ProtectedAppConfig) {
  const expectedSessionToken = sessionToken(config.sitePassword);

  function isAuthenticated(request: Request): boolean {
    return secretsMatch(
      cookieValue(request, SESSION_COOKIE_NAME),
      expectedSessionToken,
    );
  }

  async function handleSession(request: Request): Promise<Response> {
    if (request.method === "GET") {
      return jsonResponse({ authenticated: isAuthenticated(request) });
    }

    if (request.method === "DELETE") {
      return jsonResponse(
        { authenticated: false },
        200,
        {
          "set-cookie": sessionCookie("", config.secureCookie, 0),
        },
      );
    }

    if (request.method !== "POST") {
      return methodNotAllowed("GET, POST, DELETE");
    }

    let body: { password?: unknown };
    try {
      body = (await request.json()) as { password?: unknown };
    } catch {
      return jsonResponse(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "O pedido não pôde ser lido. Tente novamente.",
          },
        },
        400,
      );
    }

    if (
      typeof body.password !== "string" ||
      !secretsMatch(body.password, config.sitePassword)
    ) {
      return jsonResponse(
        {
          error: {
            code: "INVALID_PASSWORD",
            message: "A palavra-passe não está correta.",
          },
        },
        401,
      );
    }

    return jsonResponse(
      { authenticated: true },
      200,
      {
        "set-cookie": sessionCookie(
          expectedSessionToken,
          config.secureCookie,
          SESSION_MAX_AGE_SECONDS,
        ),
      },
    );
  }

  return {
    async handle(
      request: Request,
      context: { clientAddress: string },
    ): Promise<Response> {
      const pathname = new URL(request.url).pathname;

      if (pathname === "/api/session") {
        return handleSession(request);
      }

      if (pathname === "/api/transcriptions") {
        if (request.method !== "POST") {
          return methodNotAllowed("POST");
        }
        if (!isAuthenticated(request)) {
          return accessDeniedResponse();
        }
        return config.app.handle(request, context);
      }

      return new Response("Not found", {
        headers: {
          "cache-control": "no-store",
          "content-type": "text/plain; charset=utf-8",
        },
        status: 404,
      });
    },
  };
}
