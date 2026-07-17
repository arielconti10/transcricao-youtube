import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import test from "node:test";

import type { AppConfiguration } from "../src/config.ts";
import { createRuntime } from "../src/runtime.ts";

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("composes the local server, guard, app, and Gemini provider", async () => {
  const configuration: AppConfiguration = {
    familyAccessToken: "family-secret",
    geminiApiKey: "gemini-api-key",
    geminiModel: "gemini-test",
    host: "127.0.0.1",
    maxConcurrent: 1,
    maxPerClientPerHour: 6,
    maxPerDay: 20,
    maxTranscriptCharacters: 400_000,
    port: 0,
    providerTimeoutMs: 1_000,
    trustProxy: false,
  };
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: "Transcrição da integração." }],
              role: "model",
            },
            finishReason: "STOP",
            index: 0,
            safetyRatings: [],
          },
        ],
        modelVersion: "gemini-test",
        responseId: "runtime-response",
        usageMetadata: {
          candidatesTokenCount: 6,
          promptTokenCount: 100,
          totalTokenCount: 106,
        },
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    )) as typeof fetch;

  const runtime = createRuntime(configuration, {
    fetchImpl,
    publicDirectory: new URL("../public/", import.meta.url),
  });
  runtime.server.listen(0, "127.0.0.1");
  await once(runtime.server, "listening");

  try {
    const address = runtime.server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/transcriptions`,
      {
        body: JSON.stringify({ url: "https://youtu.be/dQw4w9WgXcQ" }),
        headers: {
          "content-type": "application/json",
          "x-family-token": "family-secret",
        },
        method: "POST",
      },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      transcript: "Transcrição da integração.",
      truncated: false,
    });
  } finally {
    await closeServer(runtime.server);
  }
});
