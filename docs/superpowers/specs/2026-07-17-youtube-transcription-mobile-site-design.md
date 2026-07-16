# YouTube Transcription Mobile Site Design

**Date:** 2026-07-17
**Status:** Approved concept; written specification awaiting review

## Goal

Build a small mobile website that lets one non-technical user paste a public YouTube link and receive a readable Portuguese transcript, even when the video does not provide captions.

The site must work comfortably on an older Android phone. The phone only submits the link and displays text; all video processing happens remotely.

## Success criteria

- The primary flow requires only a YouTube link and one tap.
- A public Portuguese-language video without captions can produce a faithful transcript.
- The transcript is easy to read on a 360-pixel-wide Android screen.
- The user can copy or share the transcript without dealing with files, timestamps, or accounts.
- API credentials never reach the browser.
- Transcripts and submitted URLs are not stored by the application.

## Scope

### Included

- A Portuguese-language, mobile-first website.
- Public `youtube.com` and `youtu.be` URLs.
- Transcription of spoken Portuguese whether or not YouTube captions exist.
- A large link field and one primary action labeled **Transcrever**.
- A readable transcript with **Copiar**, **Compartilhar**, and **Nova transcrição** actions.
- A clipboard fallback when Android's native sharing capability is unavailable.
- Clear Portuguese loading and error messages.
- Anonymous access through a bookmarked family link, with no login form.
- Server-side access controls, rate limits, and spend safeguards.

### Excluded from the first version

- Private, unlisted, age-restricted, region-blocked, or otherwise inaccessible videos.
- Translation from other spoken languages into Portuguese.
- Timestamps, speaker labels, summaries, chat, search, history, or saved transcripts.
- Audio or video uploads.
- Native Android or browser-extension versions.
- A public multi-user service.

## User experience

### Entry state

The page contains:

- A short title explaining the purpose in Portuguese.
- One large URL field labeled **Cole o link do vídeo do YouTube**.
- One full-width **Transcrever** button.
- A short note that only public YouTube videos are supported.

The layout uses large type, high contrast, generous tap targets, and no navigation menu. It remains usable at 320 pixels wide, with 360 pixels as the main test width.

### Processing state

After submission, the form becomes inactive and the page shows a plain progress message such as **Estamos preparando a transcrição. Vídeos longos podem demorar alguns minutos.** The user cannot accidentally start duplicate requests.

### Result state

The transcript appears as normal paragraphs rather than a timestamped list. Controls appear above and below long results:

- **Copiar texto** copies the complete transcript.
- **Compartilhar** opens Android's native share sheet when available and otherwise copies the text.
- **Nova transcrição** clears the result and returns focus to the link field.

No video URL, transcript, or history remains after the page is refreshed.

## Architecture

The product is one lightweight TypeScript web application with two boundaries:

1. **Mobile web client** — static HTML, CSS, and minimal JavaScript for form submission, state changes, copying, and sharing.
2. **Transcription endpoint** — a server-side `POST /api/transcriptions` handler that validates the request and calls the Gemini API.

The implementation should avoid a large client-side framework runtime. The browser bundle must stay small and use broadly supported web APIs suitable for an older Android Chrome installation.

### Transcription provider

The endpoint sends the public YouTube URL directly to Gemini's video-understanding API and instructs it to:

- transcribe all spoken content faithfully;
- preserve Portuguese wording rather than summarize or rewrite it;
- omit timestamps, commentary, headings, and Markdown;
- return only the transcript in readable paragraphs;
- state explicitly when the speech cannot be reliably transcribed.

The provider integration sits behind a small internal interface so the API or model can be replaced if Google's preview YouTube-URL capability changes.

### Request flow

1. The client checks that the field is not empty and submits the URL.
2. The server accepts only HTTPS YouTube hosts and rejects malformed or unexpected URLs.
3. The server checks the family access token, per-client rate limit, request concurrency, and global daily spend guard.
4. The server calls Gemini with the fixed transcription instructions and the submitted public video URL.
5. The server normalizes whitespace, enforces an output-size ceiling, and returns plain text as JSON.
6. The client renders the text using text-only DOM APIs; provider output is never interpreted as HTML.

## Access, privacy, and cost control

- The Gemini API key exists only as a server environment variable.
- The bookmarked family URL contains a high-entropy access token in its URL fragment. Fragments are not sent in ordinary HTTP requests or referrer headers. The client sends the token to the endpoint in a request header.
- The endpoint rejects missing or incorrect access tokens using constant-time comparison where the runtime supports it.
- Rate limiting applies per network address and globally. Only one transcription may run concurrently for the family token in the first version.
- A daily request or spend ceiling stops unexpected usage. Exceeding it produces a friendly Portuguese message rather than additional charges.
- Application logs contain request IDs, durations, and coarse error categories only. They do not contain video URLs, prompts, transcripts, access tokens, or API keys.
- The application does not use cookies, analytics, advertising, or a content database. A minimal server-side store may keep only hashed, short-lived counters needed for rate limiting and the daily spend guard.

The family link is a convenience safeguard, not strong identity verification. Anyone who receives it can use the tool until the token is rotated.

## Failure handling

The client maps technical failures to short Portuguese messages and always offers a retry or reset action.

| Condition | User-facing behavior |
| --- | --- |
| Empty or malformed link | Ask for a valid YouTube link without sending a request. |
| Non-YouTube host | Explain that only YouTube links are supported. |
| Private, unlisted, blocked, removed, or inaccessible video | Explain that the tool can only read accessible public videos. |
| Speech is absent or unintelligible | Explain that a reliable transcript could not be produced. |
| Provider timeout or temporary failure | Preserve the entered URL and offer **Tentar novamente**. |
| Rate or spend limit reached | Explain that the daily limit was reached and to try later. |
| Transcript exceeds the response limit | Return the complete portion available and clearly state that the video was too long for one transcript; do not silently truncate it. |

Requests have an explicit timeout and are not retried automatically after transcription begins, avoiding accidental duplicate provider charges. The user controls any retry.

## Testing and verification

### Automated tests

- URL parsing and allow-list validation for standard, shortened, mobile, Shorts, and malformed links.
- Access-token, rate-limit, concurrency, timeout, output-size, and error-mapping behavior.
- Provider prompt construction and response normalization using a fake provider.
- Client state transitions for idle, processing, result, and error states.
- Copy behavior and the fallback used when `navigator.share` or the Clipboard API is missing.
- Confirmation that provider content is rendered as text, not executable HTML.

### Browser verification

- Android-sized viewports at 320 and 360 pixels wide.
- Large-font and text-zoom behavior without horizontal scrolling.
- A public Portuguese video with captions.
- A public Portuguese video without captions.
- Invalid, private or unavailable, silent, and unusually long videos.
- Slow network behavior and repeat taps.
- Copy, native share, share fallback, retry, and reset flows.

## Deployment and operations

The application is deployed over HTTPS as a single web service with secrets configured through the hosting platform. Required production configuration:

- `GEMINI_API_KEY`
- `FAMILY_ACCESS_TOKEN`
- rate-limit and daily-budget settings
- a small counter store when the hosting platform does not provide native rate and concurrency controls
- the selected Gemini model name, kept configurable without a code change

The first deployment starts on Gemini's currently available YouTube-URL feature. Google documents this feature as preview, supports public videos only, and may change its pricing or limits. The internal provider boundary and clear failure messages are therefore required parts of the first version, not deferred work.

## Acceptance checklist

- A bookmarked family link opens directly to the Portuguese form with no login.
- A valid public Portuguese YouTube link produces a full plain-text transcript without timestamps.
- The workflow is usable with one hand on an older Android-sized screen.
- Copy works even when native sharing and modern Clipboard APIs are unavailable.
- Invalid or unsupported videos never expose technical error details.
- Refreshing the page removes the current URL and transcript.
- Provider secrets and the configured family token do not appear in shipped source bundles; submitted URLs and transcript contents do not appear in application logs.
- Automated tests pass and the complete flow is verified against real public videos before handoff.

## References

- [Gemini API video understanding](https://ai.google.dev/gemini-api/docs/video-understanding)
- [Gemini API billing](https://ai.google.dev/gemini-api/docs/billing)
- [YouTube API Services developer policies](https://developers.google.com/youtube/terms/developer-policies)
