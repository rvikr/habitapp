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
        <meta name="theme-color" content="#F26B1F" />
        <meta name="mobile-web-app-capable" content="yes" />

        <title>Lagan — Habit Tracker, Streak Builder & Daily Routines</title>
        <meta
          name="description"
          content="Lagan is a free habit tracker for iOS, Android, and web. Build daily habits, track streaks, earn badges, and stay consistent with a minimalist, distraction-free design."
        />
        <meta
          name="keywords"
          content="habit tracker, daily habit app, streak tracker, routine tracker, habit builder, morning routine app, atomic habits, habit log, consistency tracker, goal tracker, self improvement app"
        />
        <meta name="application-name" content="Lagan" />
        <link rel="canonical" href="https://lagan.health/" />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Lagan" />
        <meta property="og:url" content="https://lagan.health/" />
        <meta property="og:locale" content="en_US" />
        <meta property="og:title" content="Lagan — Habit Tracker & Streak Builder" />
        <meta
          property="og:description"
          content="Build daily habits, track streaks, and earn badges with a minimalist habit tracker for iOS, Android, and web."
        />
        <meta property="og:image" content="/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta
          property="og:image:alt"
          content="Lagan habit tracker — daily habits, streaks, and badges"
        />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Lagan — Habit Tracker & Streak Builder" />
        <meta
          name="twitter:description"
          content="Build daily habits, track streaks, and earn badges with a minimalist habit tracker for iOS, Android, and web."
        />
        <meta name="twitter:image" content="/og-image.png" />

        {/* PWA */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/favicon.png" />

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
