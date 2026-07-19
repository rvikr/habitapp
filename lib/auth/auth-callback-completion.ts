import { createAuthCallbackCoordinator } from "./auth-callback-coordinator";
import { exchangeAuthCode, supabase } from "../supabase/client";

export const completeAuthCallback = createAuthCallbackCoordinator({
  exchangeCode: exchangeAuthCode,
  verifyOtp: (input) => supabase.auth.verifyOtp(input),
  getSession: () => supabase.auth.getSession(),
});
