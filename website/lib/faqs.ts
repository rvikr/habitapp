export type Faq = {
  question: string;
  answer: string;
};

/**
 * FAQ content shared by the landing page (top few) and /faq (all). Answers are
 * also emitted as FAQPage JSON-LD on /faq, so the wording here must match the
 * rendered page exactly — edit copy only in this file. Keep answers factual:
 * no invented prices, ratings, or features the app doesn't ship.
 */
export const ALL_FAQS: Faq[] = [
  {
    question: "What is Lagan?",
    answer:
      "Lagan is an AI-powered habit tracker. You build daily routines on a simple timeline, check habits off as you go, and an AI coach reads your patterns to suggest the next small improvement.",
  },
  {
    question: "Is Lagan free?",
    answer:
      "Yes. Lagan is free to use in the web app and the Android app. Advanced AI features are part of Lagan Pro, with 50% off the yearly plan during our launch.",
  },
  {
    question: "Which platforms does Lagan support?",
    answer:
      "Lagan works in any modern browser — on desktop and iPhone — at lagan.health/app. The Android app is available on Google Play, and a native iOS app is coming soon.",
  },
  {
    question: "Is Lagan on Google Play?",
    answer:
      "Yes — download the Lagan Android app from Google Play. You can also use the full web app for free in any modern browser.",
  },
  {
    question: "How does the AI coaching in Lagan work?",
    answer:
      "Lagan's AI looks at your habits, streaks, and completion patterns, then suggests realistic next steps — when to schedule a habit, what to try after a missed day, and which routine to build next.",
  },
  {
    question: "Can I use Lagan on iPhone?",
    answer:
      "Yes. The full Lagan web app runs in Safari or any browser on iPhone at lagan.health/app — no install needed. A native iOS app is in development and coming soon.",
  },
  {
    question: "How much does Lagan Pro cost?",
    answer:
      "Lagan's core habit tracking is free forever. Lagan Pro is a paid subscription that unlocks advanced AI coaching features; current prices are always shown in the app before you subscribe, and the yearly plan is 50% off during our launch.",
  },
  {
    question: "How is Lagan different from other habit trackers?",
    answer:
      "Most habit trackers stop at checklists. Lagan adds an AI coach that reads your actual completion patterns and suggests specific next steps, plus schedule-aware streaks that only count the days a habit is planned for — so rest days never break your progress.",
  },
  {
    question: "How do streaks work in Lagan?",
    answer:
      "Streaks in Lagan are schedule-aware: only the days a habit is scheduled count toward its streak. If a habit runs Monday to Friday, the weekend doesn't break it. There's also a short morning grace period, so yesterday's streak isn't wiped the moment a new day starts.",
  },
  {
    question: "What happens when I miss a day?",
    answer:
      "Missing a scheduled day resets that habit's streak, but nothing else is lost — your history, XP, level, and badges all stay. Days a habit isn't scheduled never break a streak, and the AI coach can suggest a realistic way to restart after a miss.",
  },
  {
    question: "How do XP, levels, and badges work in Lagan?",
    answer:
      "Every habit completion earns XP, and XP adds up to levels over time. Badges mark milestones like long streaks and consistent weeks. Together they turn showing up daily into visible progress you can look back on.",
  },
  {
    question: "Does Lagan send reminders?",
    answer:
      "Yes. You can set a reminder time for each habit, and Lagan's smart reminders use AI to nudge you at moments that fit your routine — calm notifications rather than constant noise.",
  },
  {
    question: "Is my habit data private?",
    answer:
      "Your habit data belongs to you. Lagan stores it securely to sync across your devices and never sells it. The privacy policy at lagan.health/privacy explains exactly what is collected and how it's used.",
  },
  {
    question: "How do I delete my Lagan account and data?",
    answer:
      "You can delete your account and all associated data at any time, either from within the app or by following the steps at lagan.health/account-deletion. Deletion is permanent and covers your habits, history, and profile.",
  },
];

/** Subset shown on the landing page — the full list lives at /faq. */
export const LANDING_FAQS = ALL_FAQS.slice(0, 5);
