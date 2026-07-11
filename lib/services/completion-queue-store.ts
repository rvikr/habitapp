import { getItem, removeItem, setItem } from "../platform/storage";
import { createCompletionQueueStore } from "../data/completion-queue-store";

export const completionQueueStore = createCompletionQueueStore({
  getItem,
  setItem,
  removeItem,
});
