export type CompletionSubmissionOperation = {
  id: string;
  payloadKey: string;
};

type CompletionSubmissionPayload = {
  habitId: string;
  value: number;
  note: string;
};

export function operationForCompletionSubmission(
  current: CompletionSubmissionOperation | null,
  payload: CompletionSubmissionPayload,
  createId: () => string,
): CompletionSubmissionOperation {
  const payloadKey = JSON.stringify([payload.habitId, payload.value, payload.note.trim()]);
  return current?.payloadKey === payloadKey ? current : { id: createId(), payloadKey };
}
