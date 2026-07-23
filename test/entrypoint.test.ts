import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const entrypoint = new URL("../src/main.ts", import.meta.url);
const acceptanceEntrypoint = new URL("../src/acceptance.ts", import.meta.url);

test("ships a local runtime entrypoint without printing configured secrets", () => {
  assert.equal(existsSync(entrypoint), true, "src/main.ts must exist");
  const source = readFileSync(entrypoint, "utf8");

  assert.match(source, /loadConfig/);
  assert.match(source, /createRuntime/);
  assert.match(source, /server\.listen/);
  assert.doesNotMatch(source, /console\.(?:log|info)\([^\n]*sitePassword/);
});

test("ships an acceptance entrypoint that never prints configured secrets", () => {
  assert.equal(existsSync(acceptanceEntrypoint), true, "src/acceptance.ts must exist");
  const source = readFileSync(acceptanceEntrypoint, "utf8");

  assert.match(source, /runLocalAcceptance/);
  assert.doesNotMatch(source, /console\.(?:log|info)\([^\n]*(?:geminiApiKey|sitePassword)/);
});
