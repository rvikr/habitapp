// Legacy target retained for emails sent before /auth/native-confirm was
// introduced. New native emails use native-confirm; PWA emails go straight to
// /app/auth/callback and are never claimed by the installed native app.
//
// Render the callback screen directly rather than redirecting to /auth/callback:
// the callback reads the original launch URL via Linking.getInitialURL(), so it
// sees the token even when the router's own parse of the nested redirect_to param
// would drop it, and there is no redirect hop that can strip the credential.
export { default } from "./callback";
