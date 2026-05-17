export async function impact(): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(10);
  }
}

export async function success(): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate([10, 50, 10]);
  }
}
