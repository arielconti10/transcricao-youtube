import { once } from "node:events";

import { loadConfig, type AppConfiguration } from "./config.ts";
import { createRuntime } from "./runtime.ts";

interface AcceptanceOptions {
  configuration: AppConfiguration;
  fetchImpl?: typeof fetch;
  videoUrl: string;
}

export interface AcceptanceResult {
  characterCount: number;
  truncated: false;
  wordCount: number;
}

interface TranscriptionResponse {
  error?: {
    message?: unknown;
  };
  transcript?: unknown;
  truncated?: unknown;
}

async function closeServer(
  server: ReturnType<typeof createRuntime>["server"],
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

export async function runLocalAcceptance(
  options: AcceptanceOptions,
): Promise<AcceptanceResult> {
  const runtime = createRuntime(options.configuration, {
    fetchImpl: options.fetchImpl,
  });

  runtime.server.listen(0, "127.0.0.1");
  await once(runtime.server, "listening");

  try {
    const address = runtime.server.address();
    if (address === null || typeof address === "string") {
      throw new Error("O servidor local não indicou uma porta válida.");
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/transcriptions`,
      {
        body: JSON.stringify({ url: options.videoUrl }),
        headers: {
          "content-type": "application/json",
          "x-family-token": options.configuration.familyAccessToken,
        },
        method: "POST",
      },
    );
    const payload = (await response.json()) as TranscriptionResponse;

    if (!response.ok) {
      const message =
        typeof payload.error?.message === "string"
          ? payload.error.message
          : "O endpoint local devolveu um erro inesperado.";
      throw new Error(`A aceitação falhou (${response.status}): ${message}`);
    }

    if (
      typeof payload.transcript !== "string" ||
      payload.transcript.trim().length === 0
    ) {
      throw new Error("A aceitação falhou: a transcrição está vazia.");
    }

    if (payload.truncated !== false) {
      throw new Error("A aceitação falhou: a transcrição ficou incompleta.");
    }

    return {
      characterCount: payload.transcript.length,
      truncated: false,
      wordCount: payload.transcript.trim().split(/\s+/u).length,
    };
  } finally {
    await closeServer(runtime.server);
  }
}

async function main(): Promise<void> {
  const videoUrl = process.argv[2];
  if (videoUrl === undefined || videoUrl.trim() === "") {
    throw new Error(
      "Indique o endereço do vídeo: npm run acceptance -- https://youtu.be/…",
    );
  }

  const result = await runLocalAcceptance({
    configuration: loadConfig(),
    videoUrl,
  });

  console.log("Aceitação concluída: o endpoint local devolveu a transcrição completa.");
  console.log(`Palavras: ${result.wordCount}`);
  console.log(`Caracteres: ${result.characterCount}`);
  console.log("Cortada: não");
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    console.error(message);
    process.exitCode = 1;
  });
}
