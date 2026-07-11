export type BufferedAnalyticsEvent = {
  event: string;
  properties?: Record<string, unknown>;
};

export function createAnalyticsBuffer(maxEvents = 50) {
  const limit = Math.max(1, Math.trunc(maxEvents));
  const events: BufferedAnalyticsEvent[] = [];
  let pendingIdentity: string | null = null;

  return {
    enqueue(event: string, properties?: Record<string, unknown>): void {
      events.push(properties ? { event, properties } : { event });
      if (events.length > limit) events.splice(0, events.length - limit);
    },
    identify(userId: string): void {
      pendingIdentity = userId;
    },
    identity(): string | null {
      return pendingIdentity;
    },
    drain(): BufferedAnalyticsEvent[] {
      return events.splice(0, events.length);
    },
    clearEvents(): void {
      events.splice(0, events.length);
    },
    reset(): void {
      pendingIdentity = null;
      events.splice(0, events.length);
    },
  };
}
