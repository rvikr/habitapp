import * as StoreReview from "expo-store-review";
import { getItem, setItem } from "./storage";

const COMPLETION_COUNT_KEY = "habbit:completion-count";
const LAST_REVIEW_KEY = "habbit:last-review-at";
const REVIEW_THRESHOLD = 7;
const REVIEW_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export async function recordCompletionAndMaybeReview(): Promise<void> {
  const countStr = await getItem(COMPLETION_COUNT_KEY);
  const count = parseInt(countStr ?? "0", 10) + 1;
  await setItem(COMPLETION_COUNT_KEY, String(count));

  if (count % REVIEW_THRESHOLD !== 0) return;

  const lastStr = await getItem(LAST_REVIEW_KEY);
  const last = lastStr ? parseInt(lastStr, 10) : 0;
  if (Date.now() - last < REVIEW_COOLDOWN_MS) return;

  const available = await StoreReview.isAvailableAsync();
  if (!available) return;

  await StoreReview.requestReview();
  await setItem(LAST_REVIEW_KEY, String(Date.now()));
}

export async function requestReviewManually(): Promise<void> {
  const available = await StoreReview.isAvailableAsync();
  if (available) {
    await StoreReview.requestReview();
  } else {
    const url = await StoreReview.storeUrl();
    if (url) {
      const { Linking } = await import("react-native");
      await Linking.openURL(url);
    }
  }
}
