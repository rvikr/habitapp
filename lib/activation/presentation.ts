import type { ActivationStage, ActivationVariant } from "./contracts.ts";

export type ActivationTab = "index" | "achievements" | "progress" | "leaderboard" | "settings";

export type ActivationPresentation = {
  visibleTabs: readonly ActivationTab[];
  notificationMode: "hidden" | "contextual" | "standard";
  showMonetization: boolean;
  showCompetition: boolean;
  showCoach: boolean;
  hideDuplicateEmptyHeaderAction: boolean;
  allowFirstRunOnboarding: boolean;
};

const ALL_TABS: readonly ActivationTab[] = [
  "index",
  "achievements",
  "progress",
  "leaderboard",
  "settings",
];

const PRE_VALUE_TABS: readonly ActivationTab[] = ["index", "settings"];
const FIRST_LOG_TABS: readonly ActivationTab[] = ["index", "achievements", "progress", "settings"];

export function resolveActivationPresentation(
  variant: ActivationVariant,
  stage: ActivationStage,
): ActivationPresentation {
  if (variant === "control") {
    return {
      visibleTabs: ALL_TABS,
      notificationMode: "standard",
      showMonetization: true,
      showCompetition: true,
      showCoach: true,
      hideDuplicateEmptyHeaderAction: false,
      allowFirstRunOnboarding: stage === "pre_value",
    };
  }

  if (stage === "pre_value") {
    return {
      visibleTabs: PRE_VALUE_TABS,
      notificationMode: "hidden",
      showMonetization: false,
      showCompetition: false,
      showCoach: false,
      hideDuplicateEmptyHeaderAction: true,
      allowFirstRunOnboarding: true,
    };
  }

  if (stage === "first_log") {
    return {
      visibleTabs: FIRST_LOG_TABS,
      notificationMode: "contextual",
      showMonetization: false,
      showCompetition: false,
      showCoach: false,
      hideDuplicateEmptyHeaderAction: false,
      allowFirstRunOnboarding: false,
    };
  }

  return {
    visibleTabs: ALL_TABS,
    notificationMode: "standard",
    showMonetization: true,
    showCompetition: true,
    showCoach: true,
    hideDuplicateEmptyHeaderAction: false,
    allowFirstRunOnboarding: false,
  };
}

export function isActivationTabPathAllowed(
  pathname: string,
  presentation: ActivationPresentation,
): boolean {
  const [firstSegment = ""] = pathname.split(/[?#]/, 1)[0].split("/").filter(Boolean);
  const tab = firstSegment || "index";
  if (!ALL_TABS.includes(tab as ActivationTab)) return true;
  return presentation.visibleTabs.includes(tab as ActivationTab);
}
