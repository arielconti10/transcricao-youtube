export interface AppConfiguration {
  geminiApiKey: string;
  geminiModel: string;
  host: string;
  maxAudioBytes: number;
  maxConcurrent: number;
  maxPerClientPerHour: number;
  maxPerDay: number;
  maxTranscriptCharacters: number;
  port: number;
  providerTimeoutMs: number;
  sitePassword: string;
  trustProxy: boolean;
}

function numericSetting(
  name: string,
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfiguration {
  if (!environment.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required.");
  }

  if (!environment.SITE_PASSWORD) {
    throw new Error("SITE_PASSWORD is required.");
  }

  return {
    geminiApiKey: environment.GEMINI_API_KEY,
    geminiModel: environment.GEMINI_MODEL ?? "gemini-3.6-flash",
    host: environment.HOST ?? "127.0.0.1",
    maxAudioBytes: numericSetting(
      "MAX_AUDIO_BYTES",
      environment.MAX_AUDIO_BYTES,
      100_000_000,
    ),
    maxConcurrent: numericSetting(
      "MAX_CONCURRENT_TRANSCRIPTIONS",
      environment.MAX_CONCURRENT_TRANSCRIPTIONS,
      1,
    ),
    maxPerClientPerHour: numericSetting(
      "MAX_REQUESTS_PER_HOUR",
      environment.MAX_REQUESTS_PER_HOUR,
      6,
    ),
    maxPerDay: numericSetting(
      "MAX_REQUESTS_PER_DAY",
      environment.MAX_REQUESTS_PER_DAY,
      20,
    ),
    maxTranscriptCharacters: numericSetting(
      "MAX_TRANSCRIPT_CHARACTERS",
      environment.MAX_TRANSCRIPT_CHARACTERS,
      400_000,
    ),
    port: numericSetting("PORT", environment.PORT, 4173),
    providerTimeoutMs: numericSetting(
      "PROVIDER_TIMEOUT_MS",
      environment.PROVIDER_TIMEOUT_MS,
      300_000,
    ),
    sitePassword: environment.SITE_PASSWORD,
    trustProxy: environment.TRUST_PROXY === "true",
  };
}
