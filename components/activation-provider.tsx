import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import {
  assignActivationVariant,
  type ActivationStage,
  type ActivationVariant,
} from "@/lib/activation/contracts";
import { activationCompletionEvents } from "@/lib/activation/events";
import { createActivationLoadSequencer } from "@/lib/activation/request-sequencer";
import { createActivationAuthBootstrapGate } from "@/lib/activation/auth-bootstrap-gate";
import { activationStateReducer, initialActivationProviderState } from "@/lib/activation/state";
import { loadActivationSnapshot } from "@/lib/services/activation";
import { FEATURE_FLAG_CACHE_TTL_MS } from "@/lib/services/feature-flags";
import { getCurrentSession, isSupabaseConfigured, supabase } from "@/lib/supabase/client";

type ActivationContextValue = {
  ready: boolean;
  variant: ActivationVariant;
  stage: ActivationStage;
  bucket: number;
  refresh: () => Promise<void>;
};

const ActivationContext = createContext<ActivationContextValue | null>(null);

export function ActivationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(activationStateReducer, initialActivationProviderState);
  const mountedRef = useRef(true);
  const userIdRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const loadSequencerRef = useRef(createActivationLoadSequencer());

  const loadForUser = useCallback(
    async (
      userId: string,
      generation: number,
      options?: { forceConfig?: boolean; reconcile?: boolean },
    ) => {
      const requestId = loadSequencerRef.current.begin();
      let snapshot;
      try {
        snapshot = await loadActivationSnapshot(userId, options);
      } catch {
        snapshot = {
          assignment: assignActivationVariant(userId, {
            enabled: false,
            rolloutPercentage: 0,
          }),
          stage: "engaged" as const,
          authoritative: false,
        };
      }
      if (
        !mountedRef.current ||
        userIdRef.current !== userId ||
        generationRef.current !== generation ||
        !loadSequencerRef.current.isCurrent(requestId)
      ) {
        return;
      }
      dispatch({
        type: "loaded",
        userId,
        generation,
        assignment: snapshot.assignment,
        stage: snapshot.stage,
        authoritative: snapshot.authoritative,
      });
    },
    [],
  );

  const transitionToUser = useCallback(
    (userId: string | null) => {
      if (userIdRef.current === userId) {
        dispatch({ type: "auth_changed", userId });
        return;
      }
      userIdRef.current = userId;
      generationRef.current += 1;
      loadSequencerRef.current.invalidate();
      const generation = generationRef.current;
      dispatch({ type: "auth_changed", userId });
      if (userId) void loadForUser(userId, generation);
    },
    [loadForUser],
  );

  const refresh = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) return;
    await loadForUser(userId, generationRef.current, { forceConfig: true });
  }, [loadForUser]);

  useEffect(() => {
    mountedRef.current = true;
    const authBootstrapGate = createActivationAuthBootstrapGate();
    if (!isSupabaseConfigured()) {
      transitionToUser(null);
      return () => {
        authBootstrapGate.cancel();
        mountedRef.current = false;
      };
    }

    void getCurrentSession().then((session) => {
      if (authBootstrapGate.acceptBootstrap()) transitionToUser(session?.user.id ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (authBootstrapGate.observeAuthEvent()) transitionToUser(session?.user.id ?? null);
    });

    return () => {
      authBootstrapGate.cancel();
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [transitionToUser]);

  useEffect(
    () =>
      activationCompletionEvents.subscribe((event) => {
        if (event.userId !== userIdRef.current) return;
        if (event.type === "positive_completion") {
          if (state.ready) loadSequencerRef.current.invalidate();
          dispatch({ type: "optimistic_first_log", userId: event.userId });
          if (!event.queued) {
            void loadForUser(event.userId, generationRef.current, { reconcile: true });
          }
          return;
        }
        void loadForUser(event.userId, generationRef.current, { reconcile: true });
      }),
    [loadForUser, state.ready],
  );

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") void refresh();
    });
    const refreshTimer = setInterval(() => void refresh(), FEATURE_FLAG_CACHE_TTL_MS);
    return () => {
      appStateSubscription.remove();
      clearInterval(refreshTimer);
    };
  }, [refresh]);

  const value = useMemo<ActivationContextValue>(
    () => ({
      ready: state.ready,
      variant: state.variant,
      stage: state.stage,
      bucket: state.bucket,
      refresh,
    }),
    [refresh, state.bucket, state.ready, state.stage, state.variant],
  );

  return <ActivationContext.Provider value={value}>{children}</ActivationContext.Provider>;
}

export function useActivation(): ActivationContextValue {
  const value = useContext(ActivationContext);
  if (!value) throw new Error("useActivation must be used inside ActivationProvider");
  return value;
}
