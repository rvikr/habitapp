import { readFile } from "node:fs/promises";

const apply = process.argv.includes("--apply");
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF;

if (!accessToken || !projectRef) {
  throw new Error("SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF are required.");
}

const redirectUrls = [
  "lagan://auth/callback",
  "lagan://auth/callback?type=recovery",
  "https://lagan.health/auth/callback",
  "https://lagan.health/app/auth/callback",
  "https://lagan.health/app/auth/callback?type=recovery",
];
const confirmation = await readFile(
  new URL("../supabase/templates/confirmation.html", import.meta.url),
  "utf8",
);
const recovery = await readFile(
  new URL("../supabase/templates/recovery.html", import.meta.url),
  "utf8",
);
const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

const currentResponse = await fetch(endpoint, { headers });
if (!currentResponse.ok) {
  throw new Error(
    `Unable to read hosted Supabase Auth configuration (HTTP ${currentResponse.status}).`,
  );
}
const current = await currentResponse.json();
const currentRedirects = String(current.uri_allow_list ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .sort();
const desiredRedirects = [...redirectUrls].sort();

const drift = {
  siteUrl: current.site_url !== "https://lagan.health",
  redirects: JSON.stringify(currentRedirects) !== JSON.stringify(desiredRedirects),
  confirmation: current.mailer_templates_confirmation_content !== confirmation,
  recovery: current.mailer_templates_recovery_content !== recovery,
};
const drifted = Object.entries(drift)
  .filter(([, differs]) => differs)
  .map(([name]) => name);

if (drifted.length === 0) {
  console.log("Hosted Supabase Auth configuration matches the repository.");
  process.exit(0);
}
if (!apply) {
  throw new Error(`Hosted Supabase Auth configuration drift: ${drifted.join(", ")}.`);
}

const updateResponse = await fetch(endpoint, {
  method: "PATCH",
  headers,
  body: JSON.stringify({
    site_url: "https://lagan.health",
    uri_allow_list: redirectUrls.join(","),
    mailer_subjects_confirmation: "Confirm your email",
    mailer_subjects_recovery: "Reset your password",
    mailer_templates_confirmation_content: confirmation,
    mailer_templates_recovery_content: recovery,
  }),
});
if (!updateResponse.ok) {
  throw new Error(
    `Unable to update hosted Supabase Auth configuration (HTTP ${updateResponse.status}).`,
  );
}
console.log(`Updated hosted Supabase Auth configuration: ${drifted.join(", ")}.`);
