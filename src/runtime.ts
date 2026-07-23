import { createApp } from "./app.ts";
import type { AppConfiguration } from "./config.ts";
import { createGeminiProvider } from "./gemini-provider.ts";
import { createNodeServer } from "./server.ts";
import { createProtectedApp } from "./session-auth.ts";
import { createUsageGuard } from "./usage-guard.ts";
import { createYouTubeAudioSource } from "./youtube-audio.ts";

interface RuntimeOptions {
  fetchImpl?: typeof fetch;
  publicDirectory?: URL;
}

export function createRuntime(
  config: AppConfiguration,
  options: RuntimeOptions = {},
) {
  const provider = createGeminiProvider({
    apiKey: config.geminiApiKey,
    audioSource: createYouTubeAudioSource({
      fetchImpl: options.fetchImpl,
      maxBytes: config.maxAudioBytes,
      timeoutMs: config.providerTimeoutMs,
    }),
    fetchImpl: options.fetchImpl,
    model: config.geminiModel,
    timeoutMs: config.providerTimeoutMs,
  });
  const usageGuard = createUsageGuard({
    maxConcurrent: config.maxConcurrent,
    maxPerClientPerHour: config.maxPerClientPerHour,
    maxPerDay: config.maxPerDay,
  });
  const transcriptionApp = createApp({
    maxTranscriptCharacters: config.maxTranscriptCharacters,
    provider,
    usageGuard,
  });
  const app = createProtectedApp({
    app: transcriptionApp,
    secureCookie: false,
    sitePassword: config.sitePassword,
  });

  return {
    server: createNodeServer({
      app,
      publicDirectory:
        options.publicDirectory ?? new URL("../public/", import.meta.url),
      trustProxy: config.trustProxy,
    }),
  };
}
