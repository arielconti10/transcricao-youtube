import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

interface WebApp {
  handle(
    request: Request,
    context: { clientAddress: string },
  ): Promise<Response>;
}

interface NodeServerOptions {
  app: WebApp;
  publicDirectory: URL;
  trustProxy: boolean;
}

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

const STATIC_ROUTES: Record<
  string,
  { cacheControl: string; contentType: string; fileName: string }
> = {
  "/": {
    cacheControl: "no-store",
    contentType: "text/html; charset=utf-8",
    fileName: "index.html",
  },
  "/app.js": {
    cacheControl: "public, max-age=3600",
    contentType: "text/javascript; charset=utf-8",
    fileName: "app.js",
  },
  "/favicon.svg": {
    cacheControl: "public, max-age=86400",
    contentType: "image/svg+xml",
    fileName: "favicon.svg",
  },
  "/index.html": {
    cacheControl: "no-store",
    contentType: "text/html; charset=utf-8",
    fileName: "index.html",
  },
  "/inter-variable.woff2": {
    cacheControl: "public, max-age=31536000, immutable",
    contentType: "font/woff2",
    fileName: "inter-variable.woff2",
  },
  "/styles.css": {
    cacheControl: "public, max-age=3600",
    contentType: "text/css; charset=utf-8",
    fileName: "styles.css",
  },
};

class RequestTooLargeError extends Error {
  constructor() {
    super("Request body exceeded the configured limit.");
    this.name = "RequestTooLargeError";
  }
}

function applySecurityHeaders(response: ServerResponse): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.setHeader(name, value);
  }
}

async function readBody(
  request: IncomingMessage,
  maximumBytes = 16 * 1_024,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maximumBytes) {
      throw new RequestTooLargeError();
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function createRequestHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return headers;
}

function clientAddress(request: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = request.headers["x-forwarded-for"];
    const firstAddress = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded?.split(",")[0];
    if (firstAddress !== undefined && firstAddress.trim() !== "") {
      return firstAddress.trim();
    }
  }

  return request.socket.remoteAddress ?? "unknown";
}

async function sendWebResponse(
  webResponse: Response,
  response: ServerResponse,
): Promise<void> {
  webResponse.headers.forEach((value, name) => {
    response.setHeader(name, value);
  });
  applySecurityHeaders(response);
  const contents = Buffer.from(await webResponse.arrayBuffer());
  response.statusCode = webResponse.status;
  response.setHeader("content-length", contents.byteLength);
  response.end(contents);
}

export function createNodeServer(options: NodeServerOptions): Server {
  return createServer((request, response) => {
    void (async () => {
      applySecurityHeaders(response);
      const requestUrl = new URL(request.url ?? "/", "http://localhost");
      const staticRoute = STATIC_ROUTES[requestUrl.pathname];

      if (
        staticRoute !== undefined &&
        (request.method === "GET" || request.method === "HEAD")
      ) {
        const contents = await readFile(
          new URL(staticRoute.fileName, options.publicDirectory),
        );
        response.writeHead(200, {
          "cache-control": staticRoute.cacheControl,
          "content-length": contents.byteLength,
          "content-type": staticRoute.contentType,
        });
        response.end(request.method === "HEAD" ? undefined : contents);
        return;
      }

      if (
        requestUrl.pathname === "/api/transcriptions" &&
        request.method === "POST"
      ) {
        let body: Buffer;
        try {
          body = await readBody(request);
        } catch (error) {
          if (error instanceof RequestTooLargeError) {
            await sendWebResponse(
              Response.json(
                {
                  error: {
                    code: "REQUEST_TOO_LARGE",
                    message: "O pedido é demasiado grande.",
                  },
                },
                { status: 413 },
              ),
              response,
            );
            return;
          }
          throw error;
        }
        const headers = createRequestHeaders(request);
        const origin = `http://${headers.get("host") ?? "localhost"}`;
        const webRequest = new Request(
          new URL(request.url ?? "/api/transcriptions", origin),
          {
            body: new Uint8Array(body),
            headers,
            method: "POST",
          },
        );
        const webResponse = await options.app.handle(webRequest, {
          clientAddress: clientAddress(request, options.trustProxy),
        });
        await sendWebResponse(webResponse, response);
        return;
      }

      response.writeHead(404, {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
      });
      response.end("Not found");
    })().catch(() => {
      if (!response.headersSent) {
        applySecurityHeaders(response);
        response.writeHead(500, {
          "cache-control": "no-store",
          "content-type": "text/plain; charset=utf-8",
        });
      }
      response.end("Internal server error");
    });
  });
}
