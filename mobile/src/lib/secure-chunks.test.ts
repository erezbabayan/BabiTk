import assert from "node:assert/strict";
import { test } from "node:test";

import { CHUNK_MARKER, parseChunkMarker, secureKey, splitIntoChunks, SECURE_CHUNK_SIZE } from "./secure-chunks.ts";

test("SecureStore keys are sanitized", () => {
  assert.equal(secureKey("sb-abc-auth-token"), "sb-abc-auth-token");
  assert.equal(secureKey("__convexAuthJWT_https:x"), "__convexAuthJWT_https_x");
});

test("large session values are chunked under the per-value limit and rejoin exactly", () => {
  const value = "x".repeat(SECURE_CHUNK_SIZE * 2 + 7);
  const chunks = splitIntoChunks(value);
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every((c) => c.length <= SECURE_CHUNK_SIZE));
  assert.equal(chunks.join(""), value);
  assert.deepEqual(splitIntoChunks("short"), ["short"]);
});

test("chunk marker parsing", () => {
  assert.equal(parseChunkMarker(`${CHUNK_MARKER}3`), 3);
  assert.equal(parseChunkMarker("{\"access_token\":1}"), null);
  assert.equal(parseChunkMarker(null), null);
  assert.equal(parseChunkMarker(`${CHUNK_MARKER}0`), null);
});
