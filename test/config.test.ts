import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../src/config.ts";

test("loads secrets and conservative local defaults from the environment", () => {
  assert.deepEqual(
    loadConfig({
      GEMINI_API_KEY: "gemini-api-key",
      SITE_PASSWORD: "a-long-site-password",
    }),
    {
      geminiApiKey: "gemini-api-key",
      geminiModel: "gemini-3.6-flash",
      host: "127.0.0.1",
      maxAudioBytes: 100_000_000,
      maxConcurrent: 1,
      maxPerClientPerHour: 6,
      maxPerDay: 20,
      maxTranscriptCharacters: 400_000,
      port: 4173,
      providerTimeoutMs: 300_000,
      sitePassword: "a-long-site-password",
      trustProxy: false,
    },
  );
});

test("accepts explicit deployment and usage-limit overrides", () => {
  assert.deepEqual(
    loadConfig({
      GEMINI_API_KEY: "another-api-key",
      GEMINI_MODEL: "gemini-custom",
      HOST: "0.0.0.0",
      MAX_AUDIO_BYTES: "250000000",
      MAX_CONCURRENT_TRANSCRIPTIONS: "2",
      MAX_REQUESTS_PER_DAY: "30",
      MAX_REQUESTS_PER_HOUR: "8",
      MAX_TRANSCRIPT_CHARACTERS: "500000",
      PORT: "8080",
      PROVIDER_TIMEOUT_MS: "240000",
      SITE_PASSWORD: "another-long-password",
      TRUST_PROXY: "true",
    }),
    {
      geminiApiKey: "another-api-key",
      geminiModel: "gemini-custom",
      host: "0.0.0.0",
      maxAudioBytes: 250_000_000,
      maxConcurrent: 2,
      maxPerClientPerHour: 8,
      maxPerDay: 30,
      maxTranscriptCharacters: 500_000,
      port: 8080,
      providerTimeoutMs: 240_000,
      sitePassword: "another-long-password",
      trustProxy: true,
    },
  );
});

test("fails fast when a required secret is missing", () => {
  assert.throws(
    () => loadConfig({ SITE_PASSWORD: "a-long-site-password" }),
    /GEMINI_API_KEY/,
  );
  assert.throws(
    () => loadConfig({ GEMINI_API_KEY: "gemini-api-key" }),
    /SITE_PASSWORD/,
  );
});

test("rejects invalid numeric settings instead of starting unpredictably", () => {
  assert.throws(
    () =>
      loadConfig({
        GEMINI_API_KEY: "gemini-api-key",
        PORT: "not-a-port",
        SITE_PASSWORD: "a-long-site-password",
      }),
    /PORT/,
  );
  assert.throws(
    () =>
      loadConfig({
        GEMINI_API_KEY: "gemini-api-key",
        MAX_REQUESTS_PER_DAY: "0",
        SITE_PASSWORD: "a-long-site-password",
      }),
    /MAX_REQUESTS_PER_DAY/,
  );
});
