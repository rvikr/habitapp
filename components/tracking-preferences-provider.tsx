import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getItem, setItem } from "@/lib/platform/storage";

const STEP_KEY = "habbit:tracking:steps";
const SLEEP_KEY = "habbit:tracking:sleep";

type TrackingPreferences = {
  stepsEnabled: boolean;
  sleepEnabled: boolean;
  hydrated: boolean;
  setStepsEnabled: (value: boolean) => void;
  setSleepEnabled: (value: boolean) => void;
};

const TrackingPreferencesContext = createContext<TrackingPreferences>({
  stepsEnabled: true,
  sleepEnabled: true,
  hydrated: false,
  setStepsEnabled: () => {},
  setSleepEnabled: () => {},
});

function parseStored(value: string | null): boolean | null {
  if (value === "on") return true;
  if (value === "off") return false;
  return null;
}

export function TrackingPreferencesProvider({ children }: { children: ReactNode }) {
  const [stepsEnabled, setStepsEnabledState] = useState(true);
  const [sleepEnabled, setSleepEnabledState] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([getItem(STEP_KEY), getItem(SLEEP_KEY)]).then(([rawSteps, rawSleep]) => {
      if (!mounted) return;
      const steps = parseStored(rawSteps);
      const sleep = parseStored(rawSleep);
      if (steps !== null) setStepsEnabledState(steps);
      if (sleep !== null) setSleepEnabledState(sleep);
      setHydrated(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const setStepsEnabled = useCallback((value: boolean) => {
    setStepsEnabledState(value);
    setItem(STEP_KEY, value ? "on" : "off");
  }, []);

  const setSleepEnabled = useCallback((value: boolean) => {
    setSleepEnabledState(value);
    setItem(SLEEP_KEY, value ? "on" : "off");
  }, []);

  const value = useMemo(
    () => ({ stepsEnabled, sleepEnabled, hydrated, setStepsEnabled, setSleepEnabled }),
    [stepsEnabled, sleepEnabled, hydrated, setStepsEnabled, setSleepEnabled],
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
