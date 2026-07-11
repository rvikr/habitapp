const { chromium } = require("playwright");
const fs = require("fs");
const { runScenario } = require("./post-create-smoke.cjs");

if (typeof runScenario !== "function") {
  throw new Error("post-create smoke harness does not expose runScenario");
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const result = await runScenario(browser, {
      id: "offline-reload",
      kind: "quantity",
      tutorialHeading: "Let's log your first habit together",
      actionLabel: "Log 250 ml",
      dashboardHabit: "Drink Water",
      removeHabits: [],
      expectedHabitCount: 4,
      expectedCompletionValue: 250,
      expectedCompletedOn: localDateKey(),
      expectedQueued: true,
      reloadBeforeReplay: true,
    });
    fs.writeFileSync(
      "tmp/first-run-smoke-offline-reload-current.json",
      JSON.stringify(result, null, 2),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
