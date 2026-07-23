import assert from "node:assert/strict";
import test from "node:test";

import { runLocalAcceptance } from "../src/acceptance.ts";
import type { AppConfiguration } from "../src/config.ts";

const configuration: AppConfiguration = {
  geminiApiKey: "gemini-api-key",
  geminiModel: "gemini-test",
  host: "127.0.0.1",
  maxAudioBytes: 100_000_000,
  maxConcurrent: 1,
  maxPerClientPerHour: 6,
  maxPerDay: 20,
  maxTranscriptCharacters: 400_000,
  port: 0,
  providerTimeoutMs: 1_000,
  sitePassword: "site-secret",
  trustProxy: false,
};

function geminiResponse(text: string, finishReason = "STOP"): Response {
  return Response.json({
    candidates: [
      {
        content: {
          parts: [{ text }],
          role: "model",
        },
        finishReason,
      },
    ],
  });
}

test("exercises the real local HTTP endpoint and reports completeness metrics", async () => {
  const transcript = "Olá mãe. Esta transcrição chegou completa e sem cortes.";
  const result = await runLocalAcceptance({
    configuration,
    fetchImpl: (async () => geminiResponse(transcript)) as typeof fetch,
    videoUrl: "https://youtu.be/dQw4w9WgXcQ",
  });

  assert.deepEqual(result, {
    characterCount: transcript.length,
    truncated: false,
    wordCount: 9,
  });
});

test("fails acceptance when the provider reaches its output limit", async () => {
  await assert.rejects(
    runLocalAcceptance({
      configuration,
      fetchImpl: (async () =>
        geminiResponse("Uma transcrição incompleta.", "MAX_TOKENS")) as typeof fetch,
      videoUrl: "https://youtu.be/dQw4w9WgXcQ",
    }),
    /incompleta/i,
  );
});
