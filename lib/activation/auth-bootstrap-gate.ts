export function createActivationAuthBootstrapGate() {
  let authEventSeen = false;
  let cancelled = false;

  return {
    acceptBootstrap(): boolean {
      return !cancelled && !authEventSeen;
    },
    observeAuthEvent(): boolean {
      if (cancelled) return false;
      authEventSeen = true;
      return true;
    },
    cancel(): void {
      cancelled = true;
    },
  };
}
