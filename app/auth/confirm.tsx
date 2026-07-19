import { Redirect, useLocalSearchParams } from "expo-router";

// Auth emails link to https://lagan.health/auth/confirm (handled on the web by
// website/app/auth/confirm/route.ts). With Android App Links / iOS Universal
// Links that URL opens this app directly instead of the browser, so the same
// path must exist as a native route. The callback screen already understands
// token_hash/type from either the deep-link URL or its route params, so hand
// everything through untouched.
export default function AuthConfirmScreen() {
  const params = useLocalSearchParams();
  return <Redirect href={{ pathname: "/auth/callback", params }} />;
}
