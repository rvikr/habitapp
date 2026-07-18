import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("user website routes and their former shared UI are removed", () => {
  for (const path of [
    "app/(app)/dashboard/page.tsx",
    "app/(app)/achievements/page.tsx",
    "app/(app)/leaderboard/page.tsx",
    "app/(app)/settings/page.tsx",
    "app/reset-password/page.tsx",
    "components/Sidebar.tsx",
    "components/HabitList.tsx",
  ]) {
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), false, path);
  }
});

test("login is admin-only and does not expose signup or password recovery", () => {
  const source = readFileSync(new URL("../app/login/LoginForm.tsx", import.meta.url), "utf8");
  assert.match(source, /Admin sign in/);
  assert.match(source, /safeAdminNextPath/);
  assert.doesNotMatch(source, /resetPasswordForEmail|signUp|Forgot password/);
});

test("public deletion page always offers PWA and email request paths", () => {
  const source = readFileSync(
    new URL("../app/account-deletion/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /href=\{WEB_APP_URL\}/);
  assert.match(source, /privacy@lagan\.health/);
  assert.match(source, /\.example\$\/i/);
  assert.match(source, /href=\{mailTo\}/);
});
