import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildPwaHandoffUrl,
  normalizeRedirectTo,
  resolveAppHandoff,
} from "../lib/auth-app-handoff.ts";

const token = "token-value";

test("native and PWA callback destinations are rebuilt canonically", () => {
  assert.deepEqual(resolveAppHandoff("lagan://auth/callback", token, "signup"), {
    kind: "native",
    deepLink: "lagan://auth/callback?token_hash=token-value&type=signup",
    redirectTo: "lagan://auth/callback",
  });
  assert.deepEqual(
    resolveAppHandoff("lagan://auth/callback?type=recovery", token, "recovery"),
    {
      kind: "native",
      deepLink: "lagan://auth/callback?token_hash=token-value&type=recovery",
      redirectTo: "lagan://auth/callback?type=recovery",
    },
  );
  assert.deepEqual(
    resolveAppHandoff("https://lagan.health/app/auth/callback?type=recovery", token, "recovery"),
    {
      kind: "pwa",
      url: "https://lagan.health/app/auth/callback?token_hash=token-value&type=recovery",
    },
  );
});

test("redirect normalization tolerates exactly one extra encoding layer", () => {
  const encoded = encodeURIComponent("lagan://auth/callback?type=recovery");
  assert.equal(normalizeRedirectTo(encoded), "lagan://auth/callback?type=recovery");
  assert.equal(normalizeRedirectTo(encodeURIComponent(encoded)), null);
  assert.equal(normalizeRedirectTo("%not-valid"), null);
});

test("resolver rejects hostile or ambiguous callback URLs", () => {
  for (const candidate of [
    "lagan://auth/callbackevil",
    "lagan://auth/callback#fragment",
    "lagan://auth/callback?type=recovery&type=recovery",
    "lagan://auth/callback?type=signup",
    "lagan://auth/callback?token_hash=attacker",
    "https://lagan.health.evil.example/app/auth/callback",
    "https://user@lagan.health/app/auth/callback",
    "https://lagan.health:444/app/auth/callback",
    "https://lagan.health/app/auth/callback/",
    "https://lagan.health/app/auth/callback?extra=value",
    "exp://127.0.0.1:8081/--/auth/callback",
  ]) {
    assert.equal(resolveAppHandoff(candidate, token, "recovery"), null, candidate);
  }
});

test("PWA fallback construction preserves stale-email tokens", () => {
  assert.equal(
    buildPwaHandoffUrl("old-token", "signup"),
    "https://lagan.health/app/auth/callback?token_hash=old-token&type=signup",
  );
  const routeSource = readFileSync(new URL("../app/auth/confirm/route.ts", import.meta.url), "utf8");
  assert.match(routeSource, /handoff\?\.url \?\? buildPwaHandoffUrl\(tokenHash, type\)/);
  assert.doesNotMatch(routeSource, /verifyOtp|createServerClient/);
  assert.match(routeSource, /NextResponse\.redirect\(target, 302\)/);
});

test("native-only email route preserves the legacy custom-scheme fallback", () => {
  const routeSource = readFileSync(
    new URL("../app/auth/native-confirm/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(routeSource, /export \{ GET \} from "\.\.\/confirm\/route"/);

  const aasaSource = readFileSync(
    new URL("../app/api/apple-app-site-association/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(aasaSource, /\/auth\/native-confirm\*/);
  assert.doesNotMatch(aasaSource, /\/app\/auth\/callback/);
});
