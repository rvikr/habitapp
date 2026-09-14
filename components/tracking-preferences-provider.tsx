import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import { getItem, setItem } from "@/lib/platform/storage";
import {
  getWidgetBackgroundStepsConsent,
  setWidgetBackgroundStepsConsent,
} from "@/lib/widgets/widget-background-steps";

const STEP_KEY = "habbit:tracking:steps";
const SLEEP_KEY = "habbit:tracking:sleep";

type TrackingPreferences = {
  stepsEnabled: boolean;
  sleepEnabled: boolean;
  backgroundWidgetStepsEnabled: boolean;
  hydrated: boolean;
  setStepsEnabled: (value: boolean) => void;
  setSleepEnabled: (value: boolean) => void;
  setBackgroundWidgetStepsEnabled: (value: boolean) => void;
};

const TrackingPreferencesContext = createContext<TrackingPreferences>({
  stepsEnabled: true,
  sleepEnabled: false,
  backgroundWidgetStepsEnabled: false,
  hydrated: false,
  setStepsEnabled: () => {},
  setSleepEnabled: () => {},
  setBackgroundWidgetStepsEnabled: () => {},
});

function parseStored(value: string | null): boolean | null {
  if (value === "on") return true;
  if (value === "off") return false;
  return null;
}

export function TrackingPreferencesProvider({ children }: { children: ReactNode }) {
  const [stepsEnabled, setStepsEnabledState] = useState(Platform.OS !== "web");
  const [sleepEnabled, setSleepEnabledState] = useState(false);
  const [backgroundWidgetStepsEnabled, setBackgroundWidgetStepsEnabledState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([getItem(STEP_KEY), getItem(SLEEP_KEY), getWidgetBackgroundStepsConsent()]).then(
      ([rawSteps, rawSleep, backgroundWidgetSteps]) => {
        if (!mounted) return;
        if (Platform.OS === "web") {
          setStepsEnabledState(false);
          setSleepEnabledState(false);
          setBackgroundWidgetStepsEnabledState(false);
          setHydrated(true);
          return;
        }
        const steps = parseStored(rawSteps);
        const sleep = parseStored(rawSleep);
        if (steps !== null) setStepsEnabledState(steps);
        if (sleep !== null) setSleepEnabledState(sleep);
        setBackgroundWidgetStepsEnabledState(Platform.OS === "android" && backgroundWidgetSteps);
        setHydrated(true);
      },
    );
    return () => {
      mounted = false;
    };
  }, []);

  const setStepsEnabled = useCallback((value: boolean) => {
    const enabled = Platform.OS === "web" ? false : value;
    setStepsEnabledState(enabled);
    setItem(STEP_KEY, enabled ? "on" : "off");
  }, []);

  const setSleepEnabled = useCallback((value: boolean) => {
    const enabled = Platform.OS === "web" ? false : value;
    setSleepEnabledState(enabled);
    setItem(SLEEP_KEY, enabled ? "on" : "off");
  }, []);

  const setBackgroundWidgetStepsEnabled = useCallback((value: boolean) => {
    const enabled = Platform.OS === "android" ? value : false;
    setBackgroundWidgetStepsEnabledState(enabled);
    void setWidgetBackgroundStepsConsent(enabled);
  }, []);

  const value = useMemo(
    () => ({
      stepsEnabled,
      sleepEnabled,
      backgroundWidgetStepsEnabled,
      hydrated,
      setStepsEnabled,
      setSleepEnabled,
      setBackgroundWidgetStepsEnabled,
    }),
    [
      stepsEnabled,
      sleepEnabled,
      backgroundWidgetStepsEnabled,
      hydrated,
      setStepsEnabled,
      setSleepEnabled,
      setBackgroundWidgetStepsEnabled,
    ],
  );

  return (
    <TrackingPreferencesContext.Provider value={value}>
      {children}
    </TrackingPreferencesContext.Provider>
  );
}

export function useTrackingPreferences() {
  return useContext(TrackingPreferencesContext);
}
