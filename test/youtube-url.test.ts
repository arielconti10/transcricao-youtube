import assert from "node:assert/strict";
import test from "node:test";

import { normalizeYouTubeUrl } from "../src/youtube-url.ts";

test("normalizes a shared youtu.be link to a canonical watch URL", () => {
  assert.equal(
    normalizeYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?si=shared-link"),
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
});

test("normalizes standard and mobile YouTube watch links", () => {
  for (const input of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=dQw4w9WgXcQ",
  ]) {
    assert.equal(
      normalizeYouTubeUrl(input),
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  }
});

test("normalizes Shorts and live-video links", () => {
  for (const input of [
    "https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share",
    "https://www.youtube.com/live/dQw4w9WgXcQ",
  ]) {
    assert.equal(
      normalizeYouTubeUrl(input),
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  }
});

test("rejects insecure, lookalike, malformed, and non-video links", () => {
  for (const input of [
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.example.org/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=too-short",
    "https://youtu.be/dQw4w9WgXcQ/extra",
    "not a URL",
  ]) {
    assert.equal(normalizeYouTubeUrl(input), null, input);
  }
});
