const PRIVATE_PROPERTY_PATTERN =
  /^(?:email|user_id|habit_id|habit_name|body_metrics?|baselines?|answers?)$/i;
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

function installAnalyticsCollector(page) {
  const events = [];
  const pending = new Set();
  page.on("console", (message) => {
    const task = Promise.all(
      message.args().map((argument) => argument.jsonValue().catch(() => undefined)),
    )
      .then(([marker, name, properties]) => {
        if (marker !== "[track]" || typeof name !== "string") return;
        events.push({
          name,
          properties:
            properties && typeof properties === "object" && !Array.isArray(properties)
              ? properties
              : {},
        });
      })
      .finally(() => pending.delete(task));
    pending.add(task);
  });
  return {
    events,
    async settle() {
      await Promise.all([...pending]);
    },
  };
}

function requireAnalyticsEvent(events, name, predicate = () => true) {
  const event = events.find((candidate) => candidate.name === name && predicate(candidate));
  if (!event) throw new Error(`missing analytics event: ${name}`);
  return event;
}

function assertActivationAnalyticsSafe(event) {
  for (const [key, value] of Object.entries(event.properties ?? {})) {
    if (PRIVATE_PROPERTY_PATTERN.test(key)) {
      throw new Error(`private analytics property: ${key}`);
    }
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    if (serialized && (EMAIL_PATTERN.test(serialized) || UUID_PATTERN.test(serialized))) {
      throw new Error(`private analytics value in: ${key}`);
    }
  }
}

module.exports = {
  assertActivationAnalyticsSafe,
  installAnalyticsCollector,
  requireAnalyticsEvent,
};
