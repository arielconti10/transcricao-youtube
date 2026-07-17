import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const publicDirectory = new URL("../public/", import.meta.url);
const indexPath = new URL("index.html", publicDirectory);
const stylesPath = new URL("styles.css", publicDirectory);
const scriptPath = new URL("app.js", publicDirectory);
const faviconPath = new URL("favicon.svg", publicDirectory);

test("ships an accessible Portuguese mobile transcription interface", () => {
  assert.equal(existsSync(indexPath), true, "public/index.html must exist");
  assert.equal(existsSync(stylesPath), true, "public/styles.css must exist");
  assert.equal(existsSync(scriptPath), true, "public/app.js must exist");
  assert.equal(existsSync(faviconPath), true, "public/favicon.svg must exist");

  const html = readFileSync(indexPath, "utf8");
  const styles = readFileSync(stylesPath, "utf8");
  const script = readFileSync(scriptPath, "utf8");

  assert.match(html, /<html[^>]+lang="pt"/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /rel="icon"[^>]+href="\/favicon\.svg"/);
  assert.match(html, /<label[^>]+for="youtube-url"/);
  assert.match(html, /<input[^>]+id="youtube-url"[^>]+name="youtube-url"/);
  assert.match(html, /<button[^>]+type="submit"[^>]*>[^<]*<span[^>]*>Transcrever/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /id="transcript"/);
  assert.match(html, /id="copy-button"[^>]+type="button"/);
  assert.match(html, /id="share-button"[^>]+type="button"/);
  assert.match(html, /id="new-button"[^>]+type="button"/);

  assert.match(styles, /@font-face[\s\S]+font-family:\s*"InterVariable"/);
  assert.match(styles, /min-height:\s*3rem/);
  assert.match(styles, /@media\s*\(max-width:\s*24rem\)/);
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);

  assert.match(script, /location\.hash/);
  assert.match(script, /x-family-token/);
  assert.match(script, /navigator\.share/);
  assert.match(script, /execCommand\("copy"\)/);
  assert.match(script, /textContent\s*=/);
});
