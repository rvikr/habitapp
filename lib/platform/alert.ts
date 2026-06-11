import { Alert, Platform, type AlertButton } from "react-native";

// react-native-web ships Alert as an empty stub, so on web every Alert.alert —
// validation messages, error feedback, confirm dialogs — silently did nothing.
// Drop-in replacement: native delegates to Alert.alert; web maps the same API
// onto window.alert (no choice) / window.confirm (cancel + action).
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons);
    return;
  }
  const text = message ? `${title}\n\n${message}` : title;
  if (!buttons || buttons.length <= 1) {
    window.alert(text);
    buttons?.[0]?.onPress?.();
    return;
  }
  const confirm =
    buttons.find((button) => button.style !== "cancel") ?? buttons[buttons.length - 1];
  const cancel = buttons.find((button) => button.style === "cancel");
  if (window.confirm(text)) confirm.onPress?.();
  else cancel?.onPress?.();
}
