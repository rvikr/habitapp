import { getItem, removeItem, setItem } from "../platform/storage";
import { createOptimisticFirstLogStore } from "../activation/optimistic-marker";

export const optimisticFirstLogStore = createOptimisticFirstLogStore({
  getItem,
  setItem,
  removeItem,
});
