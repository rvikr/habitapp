/**
 * Shared form-field class strings (plain constants so both server and client
 * components can use them). Pattern lifted from SettingsForm, the reference
 * form styling.
 */

export const fieldLabel =
  "block text-xs font-bold uppercase tracking-wide text-on-surface-variant mb-2";

export const fieldInput =
  "w-full px-4 py-3 bg-surface-container-low border border-outline-variant rounded-xl text-on-background placeholder:text-outline text-sm font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all";

/** Input that sits directly on the page background (login) — one surface step up. */
export const fieldInputRaised =
  "w-full px-4 py-3 bg-surface-container-high border border-outline-variant rounded-xl text-on-background placeholder:text-outline text-sm font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all";

export const fieldInputError =
  "w-full px-4 py-3 bg-surface border border-outline-variant rounded-xl text-on-background placeholder:text-outline text-sm font-medium focus:outline-none focus:border-error focus:ring-2 focus:ring-error/15 transition-all";

export const fieldErrorText =
  "bg-error-container text-on-error-container px-4 py-3 rounded-xl text-sm font-medium";

export const fieldSuccessText =
  "bg-secondary-container/50 text-on-secondary-container px-4 py-3 rounded-xl text-sm font-medium";
