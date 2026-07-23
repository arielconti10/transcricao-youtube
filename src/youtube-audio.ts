const INNERTUBE_PLAYER_URL =
  "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const INNERTUBE_CLIENT_NAME = "WEB_EMBEDDED_PLAYER";
const INNERTUBE_CLIENT_NAME_ID = "56";
const INNERTUBE_CLIENT_VERSION = "1.20250310.01.00";
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

export interface YouTubeAudio {
  data: Uint8Array<ArrayBuffer>;
  mimeType: string;
}

export interface YouTubeAudioSource {
  fetchAudio(videoId: string): Promise<YouTubeAudio>;
}

export class YouTubeAudioError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "YouTubeAudioError";
    this.code = code;
  }
}

interface AudioFormat {
  bitrate?: number;
  contentLength?: number;
  mimeType: string;
  url: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

export function buildPlayerRequest(videoId: string) {
  return {
    context: {
      client: {
        clientName: INNERTUBE_CLIENT_NAME,
        clientScreen: "EMBED",
        clientVersion: INNERTUBE_CLIENT_VERSION,
        hl: "en",
      },
      thirdParty: {
        embedUrl: "https://www.youtube.com/",
      },
    },
    videoId,
  };
}

export function parsePlayerResponse(payload: unknown): AudioFormat[] {
  if (!isRecord(payload)) {
    throw new YouTubeAudioError(
      "VIDEO_UNAVAILABLE",
      "YouTube returned an invalid player response.",
    );
  }

  const playability = payload.playabilityStatus;
  if (!isRecord(playability) || playability.status !== "OK") {
    throw new YouTubeAudioError(
      "VIDEO_UNAVAILABLE",
      "YouTube reports this video as not playable.",
    );
  }

  const streamingData = payload.streamingData;
  const adaptiveFormats = isRecord(streamingData)
    ? streamingData.adaptiveFormats
    : undefined;
  if (!Array.isArray(adaptiveFormats)) {
    throw new YouTubeAudioError(
      "VIDEO_UNAVAILABLE",
      "YouTube did not offer a downloadable audio track.",
    );
  }

  const formats: AudioFormat[] = [];
  for (const candidate of adaptiveFormats) {
    if (!isRecord(candidate)) {
      continue;
    }
    const { mimeType, url } = candidate;
    if (
      typeof mimeType !== "string" ||
      !mimeType.startsWith("audio/") ||
      typeof url !== "string" ||
      url === ""
    ) {
      continue;
    }
    formats.push({
      bitrate:
        optionalNumber(candidate.averageBitrate) ??
        optionalNumber(candidate.bitrate),
      contentLength:
        typeof candidate.contentLength === "string"
          ? optionalNumber(Number(candidate.contentLength))
          : undefined,
      mimeType: mimeType.split(";", 1)[0] ?? mimeType,
      url,
    });
  }

  if (formats.length === 0) {
    throw new YouTubeAudioError(
      "VIDEO_UNAVAILABLE",
      "YouTube did not offer a downloadable audio track.",
    );
  }

  formats.sort((first, second) => {
    const containerRank = (format: AudioFormat) =>
      format.mimeType === "audio/mp4" ? 0 : 1;
    return (
      containerRank(first) - containerRank(second) ||
      (first.bitrate ?? Number.MAX_SAFE_INTEGER) -
        (second.bitrate ?? Number.MAX_SAFE_INTEGER)
    );
  });

  return formats;
}

interface YouTubeAudioOptions {
  fetchImpl?: typeof fetch;
  maxBytes: number;
  timeoutMs: number;
}

export function createYouTubeAudioSource(
  options: YouTubeAudioOptions,
): YouTubeAudioSource {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function fetchWithTimeout(
    input: string,
    init?: RequestInit,
  ): Promise<Response> {
    try {
      return await fetchImpl(input, {
        ...init,
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        throw new YouTubeAudioError(
          "SOURCE_TIMEOUT",
          "Downloading the audio from YouTube timed out.",
        );
      }
      throw error;
    }
  }

  return {
    async fetchAudio(videoId) {
      const playerResponse = await fetchWithTimeout(INNERTUBE_PLAYER_URL, {
        body: JSON.stringify(buildPlayerRequest(videoId)),
        headers: {
          "content-type": "application/json",
          "user-agent": BROWSER_USER_AGENT,
          "x-youtube-client-name": INNERTUBE_CLIENT_NAME_ID,
          "x-youtube-client-version": INNERTUBE_CLIENT_VERSION,
        },
        method: "POST",
      });
      if (!playerResponse.ok) {
        throw new YouTubeAudioError(
          "VIDEO_UNAVAILABLE",
          `YouTube refused the player request with status ${playerResponse.status}.`,
        );
      }

      const formats = parsePlayerResponse(await playerResponse.json());
      let lastError: YouTubeAudioError = new YouTubeAudioError(
        "VIDEO_UNAVAILABLE",
        "YouTube did not offer a downloadable audio track.",
      );

      for (const format of formats) {
        if (
          format.contentLength !== undefined &&
          format.contentLength > options.maxBytes
        ) {
          lastError = new YouTubeAudioError(
            "VIDEO_TOO_LONG",
            "The audio track exceeds the configured size limit.",
          );
          continue;
        }

        const audioResponse = await fetchWithTimeout(format.url, {
          headers: { "user-agent": BROWSER_USER_AGENT },
        }).catch((error: unknown) => {
          if (error instanceof YouTubeAudioError) {
            lastError = error;
            return null;
          }
          throw error;
        });
        if (audioResponse === null) {
          continue;
        }
        if (!audioResponse.ok) {
          lastError = new YouTubeAudioError(
            "VIDEO_UNAVAILABLE",
            `YouTube refused the audio download with status ${audioResponse.status}.`,
          );
          continue;
        }

        const data = new Uint8Array(await audioResponse.arrayBuffer());
        if (data.byteLength > options.maxBytes) {
          throw new YouTubeAudioError(
            "VIDEO_TOO_LONG",
            "The audio track exceeds the configured size limit.",
          );
        }
        if (data.byteLength === 0) {
          lastError = new YouTubeAudioError(
            "VIDEO_UNAVAILABLE",
            "YouTube returned an empty audio track.",
          );
          continue;
        }

        return { data, mimeType: format.mimeType };
      }

      throw lastError;
    },
  };
}
