import { createHabitMutationQueueStore } from "../data/habit-mutation-queue-store";
import { getItem, removeItem, setItem } from "../platform/storage";

export const habitMutationQueueStore = createHabitMutationQueueStore({
  getItem,
  setItem,
  removeItem,
});
