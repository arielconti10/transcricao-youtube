import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlayerRequest,
  createYouTubeAudioSource,
  parsePlayerResponse,
} from "../src/youtube-audio.ts";

const MP4_LOW = {
  averageBitrate: 48_000,
  contentLength: "960",
  itag: 139,
  mimeType: 'audio/mp4; codecs="mp4a.40.2"',
  url: "https://googlevideo.example/audio-low",
};
const MP4_HIGH = {
  averageBitrate: 128_000,
  contentLength: "2560",
  itag: 140,
  mimeType: 'audio/mp4; codecs="mp4a.40.2"',
  url: "https://googlevideo.example/audio-high",
};
const WEBM_TRACK = {
  averageBitrate: 50_000,
  contentLength: "1000",
  itag: 249,
  mimeType: 'audio/webm; codecs="opus"',
  url: "https://googlevideo.example/audio-webm",
};

function playerPayload(formats: unknown[], status = "OK") {
  return {
    playabilityStatus: { status },
    streamingData: { adaptiveFormats: formats },
  };
}

function playerResponse(formats: unknown[], status = "OK"): Response {
  return Response.json(playerPayload(formats, status));
}

test("builds an embedded-player request for the video", () => {
  assert.deepEqual(buildPlayerRequest("dQw4w9WgXcQ"), {
    context: {
      client: {
        clientName: "WEB_EMBEDDED_PLAYER",
        clientScreen: "EMBED",
        clientVersion: "1.20250310.01.00",
        hl: "en",
      },
      thirdParty: {
        embedUrl: "https://www.youtube.com/",
      },
    },
    videoId: "dQw4w9WgXcQ",
  });
});

test("prefers the smallest mp4 audio track and strips codec parameters", () => {
  const formats = parsePlayerResponse(
    playerPayload([MP4_HIGH, WEBM_TRACK, MP4_LOW]),
  );

  assert.deepEqual(
    formats.map((format) => format.url),
    [
      "https://googlevideo.example/audio-low",
      "https://googlevideo.example/audio-high",
      "https://googlevideo.example/audio-webm",
    ],
  );
  assert.equal(formats[0]?.mimeType, "audio/mp4");
});

test("ignores video tracks and formats without a direct URL", () => {
  const formats = parsePlayerResponse(
    playerPayload([
      {
        averageBitrate: 500_000,
        itag: 137,
        mimeType: 'video/mp4; codecs="avc1.640028"',
        url: "https://googlevideo.example/video",
      },
      {
        averageBitrate: 48_000,
        itag: 139,
        mimeType: 'audio/mp4; codecs="mp4a.40.2"',
        signatureCipher: "s=abc&sp=sig&url=https%3A%2F%2Fexample.invalid",
      },
      WEBM_TRACK,
    ]),
  );

  assert.deepEqual(
    formats.map((format) => format.url),
    ["https://googlevideo.example/audio-webm"],
  );
});

test("reports unplayable videos as unavailable", () => {
  assert.throws(
    () => parsePlayerResponse(playerPayload([MP4_LOW], "LOGIN_REQUIRED")),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "VIDEO_UNAVAILABLE",
  );
  assert.throws(
    () => parsePlayerResponse(playerPayload([])),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "VIDEO_UNAVAILABLE",
  );
});

test("detects upfront when the owner disabled playback outside YouTube", () => {
  assert.throws(
    () =>
      parsePlayerResponse({
        playabilityStatus: {
          status: "UNPLAYABLE",
          reason:
            "Playback on other websites has been disabled by the video owner",
        },
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "EMBEDDING_DISABLED",
  );
  assert.throws(
    () =>
      parsePlayerResponse({
        playabilityStatus: {
          status: "UNPLAYABLE",
          errorScreen: {
            playerErrorMessageRenderer: {
              subreason: {
                runs: [
                  {
                    text: "Playback on other websites has been disabled by the video owner",
                  },
                ],
              },
            },
          },
        },
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "EMBEDDING_DISABLED",
  );
  assert.throws(
    () =>
      parsePlayerResponse({
        playabilityStatus: {
          status: "UNPLAYABLE",
          playableInEmbed: false,
          reason: "Video unavailable",
        },
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "EMBEDDING_DISABLED",
  );
});

test("downloads the chosen audio track through the embedded player", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fetchImpl = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = String(input);
    calls.push({ input: url, init });
    if (url.includes("youtubei")) {
      return playerResponse([MP4_HIGH, MP4_LOW]);
    }
    return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
  };
  const source = createYouTubeAudioSource({
    fetchImpl: fetchImpl as typeof fetch,
    maxBytes: 1_000_000,
    timeoutMs: 1_000,
  });

  const audio = await source.fetchAudio("dQw4w9WgXcQ");

  assert.deepEqual(Array.from(audio.data), [1, 2, 3, 4]);
  assert.equal(audio.mimeType, "audio/mp4");
  assert.equal(calls.length, 2);
  assert.equal(
    calls[0]?.input,
    "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
  );
  const playerHeaders = new Headers(calls[0]?.init?.headers);
  assert.equal(playerHeaders.get("x-youtube-client-name"), "56");
  assert.deepEqual(
    JSON.parse(String(calls[0]?.init?.body)),
    buildPlayerRequest("dQw4w9WgXcQ"),
  );
  assert.equal(calls[1]?.input, "https://googlevideo.example/audio-low");
});

test("reports audio tracks above the size limit as too long", async () => {
  const fetchImpl = (async (input: string | URL | Request) => {
    if (String(input).includes("youtubei")) {
      return playerResponse([
        { ...MP4_LOW, contentLength: "2000" },
        { ...MP4_HIGH, contentLength: "5000" },
      ]);
    }
    return new Response(new Uint8Array([1]), { status: 200 });
  }) as typeof fetch;
  const source = createYouTubeAudioSource({
    fetchImpl,
    maxBytes: 1_000,
    timeoutMs: 1_000,
  });

  await assert.rejects(
    source.fetchAudio("dQw4w9WgXcQ"),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "VIDEO_TOO_LONG",
  );
});

test("reports a download that grows past the size limit as too long", async () => {
  const fetchImpl = (async (input: string | URL | Request) => {
    if (String(input).includes("youtubei")) {
      return playerResponse([{ ...MP4_LOW, contentLength: "10" }]);
    }
    return new Response(new Uint8Array(2_000), { status: 200 });
  }) as typeof fetch;
  const source = createYouTubeAudioSource({
    fetchImpl,
    maxBytes: 1_000,
    timeoutMs: 1_000,
  });

  await assert.rejects(
    source.fetchAudio("dQw4w9WgXcQ"),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "VIDEO_TOO_LONG",
  );
});

test("reports refused or empty audio downloads as unavailable", async () => {
  const fetchImpl = (async (input: string | URL | Request) => {
    if (String(input).includes("youtubei")) {
      return playerResponse([MP4_LOW]);
    }
    return new Response("Forbidden", { status: 403 });
  }) as typeof fetch;
  const source = createYouTubeAudioSource({
    fetchImpl,
    maxBytes: 1_000_000,
    timeoutMs: 1_000,
  });

  await assert.rejects(
    source.fetchAudio("dQw4w9WgXcQ"),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "VIDEO_UNAVAILABLE",
  );
});

test("maps a stalled player request to a timeout error", async () => {
  const fetchImpl = (async () => {
    throw new DOMException("The request timed out.", "TimeoutError");
  }) as typeof fetch;
  const source = createYouTubeAudioSource({
    fetchImpl,
    maxBytes: 1_000_000,
    timeoutMs: 1,
  });

  await assert.rejects(
    source.fetchAudio("dQw4w9WgXcQ"),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "SOURCE_TIMEOUT",
  );
});
