export function foreignCompletionOwnerIds(
  operations: readonly { userId: string }[],
  currentUserId: string,
): string[] {
  return [
    ...new Set(
      operations
        .filter((operation) => operation.userId !== currentUserId)
        .map((operation) => operation.userId),
    ),
  ];
}
