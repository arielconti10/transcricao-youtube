import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createApp } from "../src/app.ts";
import type {
  TranscriptProvider,
  TranscriptResult,
} from "../src/gemini-provider.ts";
import { GeminiProviderError } from "../src/gemini-provider.ts";
import { createUsageGuard } from "../src/usage-guard.ts";

test("returns a transcript for a valid YouTube link", async () => {
  const transcribedUrls: string[] = [];
  const provider: TranscriptProvider = {
    async transcribe(videoUrl: string): Promise<TranscriptResult> {
      transcribedUrls.push(videoUrl);
      return {
        transcript: "Esta é a transcrição completa.",
        truncated: false,
      };
    },
  };
  const app = createApp({
    provider,
    usageGuard: createUsageGuard({
      maxConcurrent: 1,
      maxPerClientPerHour: 10,
      maxPerDay: 20,
    }),
  });
  const response = await app.handle(
    new Request("http://localhost/api/transcriptions", {
      body: JSON.stringify({
        url: "https://youtu.be/dQw4w9WgXcQ?si=shared-link",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    { clientAddress: "127.0.0.1" },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    transcript: "Esta é a transcrição completa.",
    truncated: false,
  });
  assert.deepEqual(transcribedUrls, [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  ]);
});

test("rejects a non-YouTube URL before calling the provider", async () => {
  let providerCalled = false;
  const app = createApp({
    provider: {
      async transcribe() {
        providerCalled = true;
        return { transcript: "Não deveria aparecer.", truncated: false };
      },
    },
    usageGuard: createUsageGuard({
      maxConcurrent: 1,
      maxPerClientPerHour: 10,
      maxPerDay: 20,
    }),
  });
  const response = await app.handle(
    new Request("http://localhost/api/transcriptions", {
      body: JSON.stringify({
        url: "https://youtube.com.example.org/watch?v=dQw4w9WgXcQ",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    { clientAddress: "127.0.0.1" },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: {
      code: "INVALID_URL",
      message: "Cole um link válido de um vídeo do YouTube.",
    },
  });
  assert.equal(providerCalled, false);
});

test("returns a safe error for malformed JSON", async () => {
  const app = createApp({
    provider: {
      async transcribe() {
        return { transcript: "Não deveria aparecer.", truncated: false };
      },
    },
    usageGuard: createUsageGuard({
      maxConcurrent: 1,
      maxPerClientPerHour: 10,
      maxPerDay: 20,
    }),
  });
  const response = await app.handle(
    new Request("http://localhost/api/transcriptions", {
      body: "{invalid",
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    { clientAddress: "127.0.0.1" },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: {
      code: "INVALID_REQUEST",
      message: "O pedido não pôde ser lido. Tente novamente.",
    },
  });
});

test("maps provider failures to safe Portuguese responses", async () => {
  const cases = [
    {
      code: "EMBEDDING_DISABLED",
      message: "O autor deste vídeo não permite a reprodução fora do YouTube.",
      status: 422,
    },
    {
      code: "VIDEO_UNAVAILABLE",
      message:
        "Não conseguimos acessar este vídeo. Confirme que o link está correto e que o vídeo não é privado.",
      status: 422,
    },
    {
      code: "VIDEO_TOO_LONG",
      message: "Este vídeo é demasiado longo para transcrever.",
      status: 422,
    },
    {
      code: "NO_SPEECH",
      message: "Não conseguimos encontrar fala clara neste vídeo.",
      status: 422,
    },
    {
      code: "SOURCE_TIMEOUT",
      message: "A transcrição demorou demais. Tente novamente.",
      status: 504,
    },
    {
      code: "PROVIDER_TIMEOUT",
      message: "A transcrição demorou demais. Tente novamente.",
      status: 504,
    },
    {
      code: "PROVIDER_RATE_LIMIT",
      message: "O serviço está muito ocupado agora. Tente novamente mais tarde.",
      status: 429,
    },
    {
      code: "PROVIDER_UNAVAILABLE",
      message: "Não foi possível preparar a transcrição agora. Tente novamente.",
      status: 502,
    },
  ] as const;

  for (const expected of cases) {
    const app = createApp({
      provider: {
        async transcribe() {
          throw new GeminiProviderError(
            expected.code,
            "Sensitive provider details that must not reach the client.",
          );
        },
      },
      usageGuard: createUsageGuard({
        maxConcurrent: 1,
        maxPerClientPerHour: 10,
        maxPerDay: 20,
      }),
    });
    const response = await app.handle(
      new Request("http://localhost/api/transcriptions", {
        body: JSON.stringify({ url: "https://youtu.be/dQw4w9WgXcQ" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      { clientAddress: "127.0.0.1" },
    );

    assert.equal(response.status, expected.status, expected.code);
    assert.deepEqual(
      await response.json(),
      {
        error: {
          code: expected.code,
          message: expected.message,
        },
      },
      expected.code,
    );
  }
});

test("maps usage limits to helpful Portuguese responses", async () => {
  const cases = [
    {
      code: "BUSY",
      message: "Já existe uma transcrição em andamento. Aguarde um pouco.",
    },
    {
      code: "RATE_LIMIT",
      message: "Foram feitas muitas tentativas. Tente novamente mais tarde.",
    },
    {
      code: "DAILY_LIMIT",
      message: "O limite de hoje foi atingido. Tente novamente amanhã.",
    },
  ] as const;

  for (const expected of cases) {
    const app = createApp({
      provider: {
        async transcribe() {
          return { transcript: "Não deveria aparecer.", truncated: false };
        },
      },
      usageGuard: {
        acquire() {
          return { allowed: false, code: expected.code };
        },
      },
    });
    const response = await app.handle(
      new Request("http://localhost/api/transcriptions", {
        body: JSON.stringify({ url: "https://youtu.be/dQw4w9WgXcQ" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      { clientAddress: "127.0.0.1" },
    );

    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), {
      error: {
        code: expected.code,
        message: expected.message,
      },
    });
  }
});

test("hides unexpected internal failures from the client", async () => {
  const app = createApp({
    provider: {
      async transcribe() {
        throw new Error("Secret internal failure details.");
      },
    },
    usageGuard: createUsageGuard({
      maxConcurrent: 1,
      maxPerClientPerHour: 10,
      maxPerDay: 20,
    }),
  });
  const response = await app.handle(
    new Request("http://localhost/api/transcriptions", {
      body: JSON.stringify({ url: "https://youtu.be/dQw4w9WgXcQ" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    { clientAddress: "127.0.0.1" },
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: {
      code: "UNKNOWN_ERROR",
      message: "Algo correu mal. Tente novamente.",
    },
  });
});

test("uses a one-way client key for rate-limit counters", async () => {
  let receivedClientKey = "";
  const app = createApp({
    provider: {
      async transcribe() {
        return { transcript: "Transcrição.", truncated: false };
      },
    },
    usageGuard: {
      acquire(clientKey) {
        receivedClientKey = clientKey;
        return { allowed: true, release() {} };
      },
    },
  });
  await app.handle(
    new Request("http://localhost/api/transcriptions", {
      body: JSON.stringify({ url: "https://youtu.be/dQw4w9WgXcQ" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    { clientAddress: "203.0.113.10" },
  );

  assert.equal(
    receivedClientKey,
    createHash("sha256").update("203.0.113.10").digest("hex"),
  );
  assert.equal(receivedClientKey.includes("203.0.113.10"), false);
});

test("marks an oversized transcript as truncated instead of returning it silently", async () => {
  const app = createApp({
    maxTranscriptCharacters: 10,
    provider: {
      async transcribe() {
        return {
          transcript: "0123456789texto adicional",
          truncated: false,
        };
      },
    },
    usageGuard: createUsageGuard({
      maxConcurrent: 1,
      maxPerClientPerHour: 10,
      maxPerDay: 20,
    }),
  });
  const response = await app.handle(
    new Request("http://localhost/api/transcriptions", {
      body: JSON.stringify({ url: "https://youtu.be/dQw4w9WgXcQ" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    { clientAddress: "127.0.0.1" },
  );

  assert.deepEqual(await response.json(), {
    transcript: "0123456789",
    truncated: true,
  });
});
