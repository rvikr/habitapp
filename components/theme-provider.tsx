import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { Appearance, Platform, useColorScheme as useRNColorScheme } from "react-native";
import { colorScheme as nwColorScheme } from "nativewind";
import { getItem, setItem } from "@/lib/platform/storage";

const STORAGE_KEY = "habbit:theme";

type ColorScheme = "light" | "dark";
type ThemeCtx = { colorScheme: ColorScheme; toggle: () => void };

const ThemeContext = createContext<ThemeCtx>({ colorScheme: "light", toggle: () => {} });

// Cross-platform color-scheme override.
// - NativeWind's `colorScheme.set()` updates className-driven `dark:` variants on every platform.
// - `Appearance.setColorScheme()` updates RN-native UI (statusbar, system-rendered chrome) but is iOS/Android-only;
//    calling it on web throws because the web shim doesn't implement it.
function applyColorScheme(scheme: ColorScheme) {
  nwColorScheme.set(scheme);
  if (Platform.OS !== "web" && typeof Appearance.setColorScheme === "function") {
    Appearance.setColorScheme(scheme);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useRNColorScheme() ?? "light";
  const [colorScheme, setColorScheme] = useState<ColorScheme>(systemScheme);

  useEffect(() => {
    getItem(STORAGE_KEY).then((saved: string | null) => {
      if (saved === "light" || saved === "dark") {
        setColorScheme(saved);
        applyColorScheme(saved);
      } else {
        // No saved preference: sync NativeWind to the system scheme so
        // className `dark:` variants and this context never disagree.
        applyColorScheme(systemScheme);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle() {
    const next: ColorScheme = colorScheme === "light" ? "dark" : "light";
    setColorScheme(next);
    applyColorScheme(next);
    setItem(STORAGE_KEY, next);
  }

  return <ThemeContext.Provider value={{ colorScheme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
