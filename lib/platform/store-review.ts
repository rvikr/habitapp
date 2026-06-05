import * as StoreReview from "expo-store-review";
import Constants from "expo-constants";
import { Platform } from "react-native";
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

  try {
    await StoreReview.requestReview();
  } catch {
    return;
  }
  await setItem(LAST_REVIEW_KEY, String(Date.now()));
}

export async function requestReviewManually(): Promise<boolean> {
  if (Platform.OS === "android") {
    return openAndroidStoreListing();
  }

  const available = await StoreReview.isAvailableAsync();
  if (available) {
    try {
      await StoreReview.requestReview();
      return true;
    } catch {
      // Fall through to a store URL when the native request cannot launch.
    }
  }

  const url = await StoreReview.storeUrl();
  return url ? openUrl(url) : false;
}

async function openAndroidStoreListing(): Promise<boolean> {
  const configuredUrl = await StoreReview.storeUrl();
  if (configuredUrl && (await openUrl(configuredUrl))) return true;

  const packageName = Constants.expoConfig?.android?.package;
  if (!packageName) return false;

  return (
    (await openUrl(`market://details?id=${encodeURIComponent(packageName)}`)) ||
    (await openUrl(
      `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageName)}`,
    ))
  );
}

async function openUrl(url: string): Promise<boolean> {
  const { Linking } = await import("react-native");
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
