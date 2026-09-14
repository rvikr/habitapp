import { getItem, setItem } from "@/lib/platform/storage";

const WIDGET_BACKGROUND_STEPS_KEY = "habbit:tracking:widget-background-steps";

export async function getWidgetBackgroundStepsConsent(): Promise<boolean> {
  return (await getItem(WIDGET_BACKGROUND_STEPS_KEY)) === "on";
}

export async function setWidgetBackgroundStepsConsent(enabled: boolean): Promise<void> {
  await setItem(WIDGET_BACKGROUND_STEPS_KEY, enabled ? "on" : "off");
}
