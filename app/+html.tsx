import { ScrollViewStyleReset } from "expo-router/html";

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Lagan" />
        <meta name="theme-color" content="#451ebb" />
        <meta name="mobile-web-app-capable" content="yes" />

        <title>Lagan — AI Habit Tracker, Coach & Smart Reminders</title>
        <meta
          name="description"
          content="Lagan is an AI-enabled habit tracker for iOS, Android, and web. Build routines, get AI coaching and smart reminders, track streaks, and earn XP."
        />
        <meta
          name="keywords"
          content="AI habit tracker, AI habit coach, AI routine planner, AI smart reminders, habit tracker, daily habit app, streak tracker, routine tracker, habit builder, habit log, consistency tracker, goal tracker"
        />
        <meta name="application-name" content="Lagan" />
        <link rel="canonical" href="https://lagan.health/" />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Lagan" />
        <meta property="og:url" content="https://lagan.health/" />
        <meta property="og:locale" content="en_US" />
        <meta property="og:title" content="Lagan — AI Habit Tracker & Coach" />
        <meta
          property="og:description"
          content="Build daily routines with AI coaching, smart reminders, streak tracking, XP, and badges on iOS, Android, and web."
        />
        <meta property="og:image" content="/app/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta
          property="og:image:alt"
          content="Lagan AI habit tracker with daily habits, streaks, AI coaching, and badges"
        />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Lagan — AI Habit Tracker & Coach" />
        <meta
          name="twitter:description"
          content="Build daily routines with AI coaching, smart reminders, streak tracking, XP, and badges on iOS, Android, and web."
        />
        <meta name="twitter:image" content="/app/og-image.png" />

        {/* PWA */}
        <link rel="manifest" href="/app/manifest.webmanifest" />
        <link rel="icon" type="image/png" href="/app/favicon.png" />
        <link rel="apple-touch-icon" href="/app/icon-192.png" />

        <ScrollViewStyleReset />

        {/* Body background frames the phone-shaped app on desktop, fills the viewport on mobile. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
          html,body,#root,#__next{height:100%;}
          body{margin:0;background:#F2EDE4;}
          @media(prefers-color-scheme:dark){body{background:#0f0f14;}}
          @media(max-width:480px){body{background:#f8f9fa;}@media(prefers-color-scheme:dark){body{background:#0f0f14;}}}
        `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
