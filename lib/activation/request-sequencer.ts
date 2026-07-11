export function createActivationLoadSequencer() {
  let latestRequestId = 0;

  return {
    begin(): number {
      latestRequestId += 1;
      return latestRequestId;
    },
    invalidate(): void {
      latestRequestId += 1;
    },
    isCurrent(requestId: number): boolean {
      return requestId === latestRequestId;
    },
  };
}
