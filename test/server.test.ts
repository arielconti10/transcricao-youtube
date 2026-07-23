import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import test from "node:test";

import { createNodeServer } from "../src/server.ts";

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("serves the mobile interface with restrictive security headers", async () => {
  const server = createNodeServer({
    app: {
      async handle() {
        return Response.json({ error: { code: "NOT_EXPECTED" } }, { status: 500 });
      },
    },
    publicDirectory: new URL("../public/", import.meta.url),
    trustProxy: false,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const response = await fetch(origin + "/");

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.match(
      response.headers.get("content-security-policy") ?? "",
      /default-src 'self'/,
    );
    assert.match(await response.text(), /Transcrição fácil/);

    const favicon = await fetch(origin + "/favicon.svg");
    assert.equal(favicon.status, 200);
    assert.equal(favicon.headers.get("content-type"), "image/svg+xml");

    const missing = await fetch(origin + "/not-found");
    assert.equal(missing.status, 404);
  } finally {
    await closeServer(server);
  }
});

test("forwards the transcription endpoint and trusted client address", async () => {
  const received: Array<{
    body: unknown;
    clientAddress: string;
  }> = [];
  const server = createNodeServer({
    app: {
      async handle(request, context) {
        received.push({
          body: await request.json(),
          clientAddress: context.clientAddress,
        });
        return Response.json(
          { transcript: "Transcrição completa.", truncated: false },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
    publicDirectory: new URL("../public/", import.meta.url),
    trustProxy: true,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/transcriptions`,
      {
        body: JSON.stringify({ url: "https://youtu.be/dQw4w9WgXcQ" }),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "198.51.100.5, 10.0.0.1",
        },
        method: "POST",
      },
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(await response.json(), {
      transcript: "Transcrição completa.",
      truncated: false,
    });
    assert.deepEqual(received, [
      {
        body: { url: "https://youtu.be/dQw4w9WgXcQ" },
        clientAddress: "198.51.100.5",
      },
    ]);
  } finally {
    await closeServer(server);
  }
});

test("forwards session checks without requiring a request body", async () => {
  const received: Array<{ method: string; path: string }> = [];
  const server = createNodeServer({
    app: {
      async handle(request) {
        received.push({
          method: request.method,
          path: new URL(request.url).pathname,
        });
        return Response.json({ authenticated: false });
      },
    },
    publicDirectory: new URL("../public/", import.meta.url),
    trustProxy: false,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/session`,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { authenticated: false });
    assert.deepEqual(received, [{ method: "GET", path: "/api/session" }]);
  } finally {
    await closeServer(server);
  }
});

test("rejects oversized API bodies before they reach the app", async () => {
  let appCalled = false;
  const server = createNodeServer({
    app: {
      async handle() {
        appCalled = true;
        return Response.json({ unexpected: true });
      },
    },
    publicDirectory: new URL("../public/", import.meta.url),
    trustProxy: false,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/transcriptions`,
      {
        body: JSON.stringify({ url: "x".repeat(20_000) }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );

    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), {
      error: {
        code: "REQUEST_TOO_LARGE",
        message: "O pedido é demasiado grande.",
      },
    });
    assert.equal(appCalled, false);
  } finally {
    await closeServer(server);
  }
});
