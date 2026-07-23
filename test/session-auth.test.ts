import assert from "node:assert/strict";
import test from "node:test";

import { createProtectedApp } from "../src/session-auth.ts";

const SITE_PASSWORD = "correct-horse-battery-staple";
const context = { clientAddress: "127.0.0.1" };

function createTestApp(secureCookie = true) {
  let transcriptionRequests = 0;
  const protectedApp = createProtectedApp({
    app: {
      async handle() {
        transcriptionRequests += 1;
        return Response.json({
          transcript: "Transcrição protegida.",
          truncated: false,
        });
      },
    },
    secureCookie,
    sitePassword: SITE_PASSWORD,
  });

  return {
    protectedApp,
    transcriptionRequests: () => transcriptionRequests,
  };
}

async function logIn(
  app: ReturnType<typeof createProtectedApp>,
): Promise<string> {
  const response = await app.handle(
    new Request("https://example.com/api/session", {
      body: JSON.stringify({ password: SITE_PASSWORD }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    context,
  );
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);
  return cookie.split(";", 1)[0] ?? "";
}

test("reports an unauthenticated session without setting a cookie", async () => {
  const { protectedApp } = createTestApp();
  const response = await protectedApp.handle(
    new Request("https://example.com/api/session"),
    context,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.deepEqual(await response.json(), { authenticated: false });
});

test("rejects an incorrect password without exposing or storing it", async () => {
  const { protectedApp } = createTestApp();
  const response = await protectedApp.handle(
    new Request("https://example.com/api/session", {
      body: JSON.stringify({ password: "wrong-password" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    context,
  );

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.deepEqual(await response.json(), {
    error: {
      code: "INVALID_PASSWORD",
      message: "A palavra-passe não está correta.",
    },
  });
});

test("creates a secure HttpOnly session cookie for the correct password", async () => {
  const { protectedApp } = createTestApp();
  const response = await protectedApp.handle(
    new Request("https://example.com/api/session", {
      body: JSON.stringify({ password: SITE_PASSWORD }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    context,
  );
  const setCookie = response.headers.get("set-cookie") ?? "";

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: true });
  assert.match(setCookie, /^transcricao_session=[A-Za-z0-9_-]+;/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Path=\//);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Max-Age=31536000/);
  assert.match(setCookie, /Secure/);
  assert.equal(setCookie.includes(SITE_PASSWORD), false);
});

test("uses a non-Secure cookie only for the local HTTP server", async () => {
  const { protectedApp } = createTestApp(false);
  const cookie = await logIn(protectedApp);
  const loginResponse = await protectedApp.handle(
    new Request("http://localhost/api/session", {
      body: JSON.stringify({ password: SITE_PASSWORD }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    context,
  );

  assert.notEqual(cookie, "");
  assert.doesNotMatch(loginResponse.headers.get("set-cookie") ?? "", /Secure/);
});

test("protects transcription requests with the session cookie", async () => {
  const { protectedApp, transcriptionRequests } = createTestApp();
  const denied = await protectedApp.handle(
    new Request("https://example.com/api/transcriptions", {
      body: JSON.stringify({ url: "https://youtu.be/dQw4w9WgXcQ" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    context,
  );

  assert.equal(denied.status, 401);
  assert.deepEqual(await denied.json(), {
    error: {
      code: "ACCESS_DENIED",
      message: "A sessão terminou. Introduza novamente a palavra-passe.",
    },
  });
  assert.equal(transcriptionRequests(), 0);

  const cookie = await logIn(protectedApp);
  const allowed = await protectedApp.handle(
    new Request("https://example.com/api/transcriptions", {
      body: JSON.stringify({ url: "https://youtu.be/dQw4w9WgXcQ" }),
      headers: {
        cookie,
        "content-type": "application/json",
      },
      method: "POST",
    }),
    context,
  );

  assert.equal(allowed.status, 200);
  assert.equal(transcriptionRequests(), 1);
});

test("recognizes and clears an existing session", async () => {
  const { protectedApp } = createTestApp();
  const cookie = await logIn(protectedApp);
  const active = await protectedApp.handle(
    new Request("https://example.com/api/session", {
      headers: { cookie },
    }),
    context,
  );
  assert.deepEqual(await active.json(), { authenticated: true });

  const logout = await protectedApp.handle(
    new Request("https://example.com/api/session", {
      headers: { cookie },
      method: "DELETE",
    }),
    context,
  );
  assert.deepEqual(await logout.json(), { authenticated: false });
  assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/);
});

test("rejects malformed login bodies and unsupported methods", async () => {
  const { protectedApp } = createTestApp();
  const malformed = await protectedApp.handle(
    new Request("https://example.com/api/session", {
      body: "{invalid",
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    context,
  );
  assert.equal(malformed.status, 400);

  const unsupported = await protectedApp.handle(
    new Request("https://example.com/api/session", { method: "PUT" }),
    context,
  );
  assert.equal(unsupported.status, 405);
  assert.equal(unsupported.headers.get("allow"), "GET, POST, DELETE");
});
