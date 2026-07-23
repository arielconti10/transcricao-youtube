import { createHash } from "node:crypto";

import {
  GeminiProviderError,
  type TranscriptProvider,
} from "./gemini-provider.ts";
import type { UsageGuard } from "./usage-guard.ts";
import { normalizeYouTubeUrl } from "./youtube-url.ts";

interface AppConfig {
  maxTranscriptCharacters?: number;
  provider: TranscriptProvider;
  usageGuard: UsageGuard;
}

interface RequestContext {
  clientAddress: string;
}

const PROVIDER_ERROR_RESPONSES: Record<
  string,
  { message: string; status: number }
> = {
  NO_SPEECH: {
    message: "Não conseguimos encontrar fala clara neste vídeo.",
    status: 422,
  },
  PROVIDER_RATE_LIMIT: {
    message: "O serviço está muito ocupado agora. Tente novamente mais tarde.",
    status: 429,
  },
  PROVIDER_TIMEOUT: {
    message: "A transcrição demorou demais. Tente novamente.",
    status: 504,
  },
  PROVIDER_UNAVAILABLE: {
    message: "Não foi possível preparar a transcrição agora. Tente novamente.",
    status: 502,
  },
  SOURCE_TIMEOUT: {
    message: "A transcrição demorou demais. Tente novamente.",
    status: 504,
  },
  VIDEO_TOO_LONG: {
    message: "Este vídeo é demasiado longo para transcrever.",
    status: 422,
  },
  VIDEO_UNAVAILABLE: {
    message:
      "Não conseguimos acessar este vídeo. Confirme que o link está correto e que o vídeo não é privado.",
    status: 422,
  },
};

const USAGE_ERROR_MESSAGES = {
  BUSY: "Já existe uma transcrição em andamento. Aguarde um pouco.",
  DAILY_LIMIT: "O limite de hoje foi atingido. Tente novamente amanhã.",
  RATE_LIMIT: "Foram feitas muitas tentativas. Tente novamente mais tarde.",
} as const;

function jsonResponse(payload: unknown, status = 200): Response {
  return Response.json(payload, {
    headers: {
      "cache-control": "no-store",
    },
    status,
  });
}

function createClientKey(clientAddress: string): string {
  return createHash("sha256").update(clientAddress).digest("hex");
}

export function createApp(config: AppConfig) {
  return {
    async handle(
      request: Request,
      context: RequestContext,
    ): Promise<Response> {
      let body: { url?: unknown };
      try {
        body = (await request.json()) as { url?: unknown };
      } catch {
        return jsonResponse(
          {
            error: {
              code: "INVALID_REQUEST",
              message: "O pedido não pôde ser lido. Tente novamente.",
            },
          },
          400,
        );
      }

      const videoUrl =
        typeof body.url === "string" ? normalizeYouTubeUrl(body.url) : null;
      if (videoUrl === null) {
        return jsonResponse(
          {
            error: {
              code: "INVALID_URL",
              message: "Cole um link válido de um vídeo do YouTube.",
            },
          },
          400,
        );
      }

      const lease = config.usageGuard.acquire(
        createClientKey(context.clientAddress),
      );
      if (!lease.allowed) {
        return jsonResponse(
          {
            error: {
              code: lease.code,
              message: USAGE_ERROR_MESSAGES[lease.code],
            },
          },
          429,
        );
      }

      try {
        const result = await config.provider.transcribe(videoUrl);
        const characterLimit = config.maxTranscriptCharacters ?? 400_000;
        if (result.transcript.length > characterLimit) {
          return jsonResponse({
            transcript: result.transcript.slice(0, characterLimit),
            truncated: true,
          });
        }

        return jsonResponse(result);
      } catch (error) {
        if (error instanceof GeminiProviderError) {
          const mappedError = PROVIDER_ERROR_RESPONSES[error.code];
          if (mappedError !== undefined) {
            return jsonResponse(
              {
                error: {
                  code: error.code,
                  message: mappedError.message,
                },
              },
              mappedError.status,
            );
          }
        }

        return jsonResponse(
          {
            error: {
              code: "UNKNOWN_ERROR",
              message: "Algo correu mal. Tente novamente.",
            },
          },
          500,
        );
      } finally {
        lease.release();
      }
    },
  };
}
