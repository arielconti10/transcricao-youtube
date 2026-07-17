const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function normalizeYouTubeUrl(value: string): string | null {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  let videoId: string | null = null;

  if (hostname === "youtu.be") {
    const pathMatch = url.pathname.match(/^\/([^/]+)\/?$/);
    videoId = pathMatch?.[1] ?? null;
  } else if (
    hostname === "youtube.com" ||
    hostname === "www.youtube.com" ||
    hostname === "m.youtube.com"
  ) {
    if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v");
    } else {
      const pathMatch = url.pathname.match(/^\/(?:shorts|live)\/([^/]+)/);
      videoId = pathMatch?.[1] ?? null;
    }
  }

  if (videoId === null) {
    return null;
  }

  if (!VIDEO_ID_PATTERN.test(videoId)) {
    return null;
  }

  return `https://www.youtube.com/watch?v=${videoId}`;
}
