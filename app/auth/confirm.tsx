// Auth emails link to https://lagan.health/auth/confirm (also handled on the web
// by website/app/auth/confirm/route.ts). With verified Android App Links / iOS
// Universal Links that URL opens the app here instead of the browser, carrying
// the same token_hash/type the OAuth deep link does.
//
// Render the callback screen directly rather than redirecting to /auth/callback:
// the callback reads the original launch URL via Linking.getInitialURL(), so it
// sees the token even when the router's own parse of the nested redirect_to param
// would drop it, and there is no redirect hop that can strip the credential.
export { default } from "./callback";
