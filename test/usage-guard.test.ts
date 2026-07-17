import assert from "node:assert/strict";
import test from "node:test";

import { createUsageGuard } from "../src/usage-guard.ts";

test("allows only one transcription at a time and releases the slot", () => {
  const guard = createUsageGuard({
    maxConcurrent: 1,
    maxPerClientPerHour: 10,
    maxPerDay: 20,
  });
  const first = guard.acquire("client-a");

  assert.equal(first.allowed, true);
  assert.deepEqual(guard.acquire("client-a"), {
    allowed: false,
    code: "BUSY",
  });

  if (first.allowed) {
    first.release();
  }

  assert.equal(guard.acquire("client-a").allowed, true);
});

test("limits each client to the configured number of requests per hour", () => {
  let now = 0;
  const guard = createUsageGuard({
    maxConcurrent: 1,
    maxPerClientPerHour: 2,
    maxPerDay: 20,
    now: () => now,
  });

  for (let index = 0; index < 2; index += 1) {
    const lease = guard.acquire("client-a");
    assert.equal(lease.allowed, true);
    if (lease.allowed) {
      lease.release();
    }
  }

  assert.deepEqual(guard.acquire("client-a"), {
    allowed: false,
    code: "RATE_LIMIT",
  });

  now = 60 * 60 * 1_000 + 1;
  assert.equal(guard.acquire("client-a").allowed, true);
});

test("stops new requests after the global daily limit and resets next day", () => {
  let now = Date.UTC(2026, 6, 17, 12);
  const guard = createUsageGuard({
    maxConcurrent: 1,
    maxPerClientPerHour: 10,
    maxPerDay: 2,
    now: () => now,
  });

  for (const clientKey of ["client-a", "client-b"]) {
    const lease = guard.acquire(clientKey);
    assert.equal(lease.allowed, true);
    if (lease.allowed) {
      lease.release();
    }
  }

  assert.deepEqual(guard.acquire("client-c"), {
    allowed: false,
    code: "DAILY_LIMIT",
  });

  now = Date.UTC(2026, 6, 18, 0, 0, 1);
  assert.equal(guard.acquire("client-c").allowed, true);
});
