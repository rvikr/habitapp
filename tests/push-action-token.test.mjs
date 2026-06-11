// Round-trip tests for supabase/functions/_shared/push-action-token.ts.
// The helper is pure Web Crypto, so it runs under Node with type stripping:
//   node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/push-action-token.test.mjs
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import {
  signActionToken,
  verifyActionToken,
} from "../supabase/functions/_shared/push-action-token.ts";

const SECRET = "test-secret-please-rotate";
const NOW = Math.floor(Date.now() / 1000);
const payload = {
  u: "8a1f8c2e-1234-4abc-9def-0123456789ab",
  h: "7b2e9d3f-5678-4cde-8abc-fedcba987654",
  d: "2026-06-11",
  exp: NOW + 3600,
};

// Valid token round-trips.
const token = await signActionToken(payload, SECRET);
assert.deepEqual(await verifyActionToken(token, SECRET), payload);

// Wrong secret fails.
assert.equal(await verifyActionToken(token, "other-secret"), null);

// Tampered payload fails (swap habit id inside the encoded payload).
const [body, sig] = token.split(".");
const decoded = JSON.parse(Buffer.from(body, "base64url").toString());
decoded.h = payload.u;
const tampered = Buffer.from(JSON.stringify(decoded)).toString("base64url") + "." + sig;
assert.equal(await verifyActionToken(tampered, SECRET), null);

// Expired token fails even with a valid signature.
const expired = await signActionToken({ ...payload, exp: NOW - 1 }, SECRET);
assert.equal(await verifyActionToken(expired, SECRET), null);

// Malformed field shapes fail (non-uuid user, bad date).
const badUser = await signActionToken({ ...payload, u: "not-a-uuid" }, SECRET);
assert.equal(await verifyActionToken(badUser, SECRET), null);
const badDate = await signActionToken({ ...payload, d: "11-06-2026" }, SECRET);
assert.equal(await verifyActionToken(badDate, SECRET), null);

// Garbage input fails without throwing.
assert.equal(await verifyActionToken("garbage", SECRET), null);
assert.equal(await verifyActionToken("a.b.c", SECRET), null);
assert.equal(await verifyActionToken("!!!.???", SECRET), null);

console.log("push-action-token: all assertions passed");
