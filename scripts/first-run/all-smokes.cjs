const { spawn } = require("child_process");
const http = require("http");

const baseUrl = "http://localhost:8083/";

const smokes = [
  ["auth screens and validation", "scripts/first-run/auth-smoke.cjs"],
  ["email confirmation callback", "scripts/first-run/callback-smoke.cjs"],
  ["wizard routine builder", "scripts/first-run/full-smoke.cjs"],
  ["treatment quick start", "scripts/first-run/treatment-quick-start-smoke.cjs"],
  ["post-create tutorial", "scripts/first-run/post-create-smoke.cjs"],
  ["manual habit creation", "scripts/first-run/manual-habit-smoke.cjs"],
  ["treatment manual habit creation", "scripts/first-run/treatment-manual-habit-smoke.cjs"],
  ["activation dashboard stages", "scripts/first-run/activation-dashboard-smoke.cjs"],
  ["habit detail quick log", "scripts/first-run/detail-log-smoke.cjs"],
  ["desktop first-run web", "scripts/first-run/desktop-smoke.cjs"],
];

function waitForServer(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    function poll() {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      req.on("error", retry);
      req.setTimeout(2000, () => {
        req.destroy();
        retry();
      });
    }

    function retry() {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Expo web server is not reachable at ${url}`));
        return;
      }
      setTimeout(poll, 500);
    }

    poll();
  });
}

function runSmoke(label, script) {
  return new Promise((resolve, reject) => {
    console.log(`\n[first-run] ${label}`);
    const child = spawn(process.execPath, [script], { stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        console.log(`[first-run] ${label} passed`);
        resolve();
        return;
      }
      reject(new Error(`${label} failed with exit code ${code}`));
    });
  });
}

(async () => {
  await waitForServer(baseUrl);
  for (const [label, script] of smokes) {
    await runSmoke(label, script);
  }
  console.log("\n[first-run] all local first-run smokes passed");
})().catch((err) => {
  console.error(`\n[first-run] ${err.message}`);
  process.exit(1);
});
