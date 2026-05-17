import { ScrollViewStyleReset } from "expo-router/html";

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Lagan" />
        <meta name="theme-color" content="#F26B1F" />
        <meta name="mobile-web-app-capable" content="yes" />

        <title>Lagan लगन — Build habits, track progress, earn badges</title>
        <meta name="description" content="Track your daily habits, build streaks, and unlock achievements. Cross-platform on iOS, Android, and web." />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Lagan लगन" />
        <meta property="og:description" content="Build habits, track progress, earn badges." />
        <meta property="og:image" content="/og-image.png" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Lagan लगन" />
        <meta name="twitter:description" content="Build habits, track progress, earn badges." />

        {/* PWA */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/favicon.png" />

        <ScrollViewStyleReset />

        {/* Body background frames the phone-shaped app on desktop, fills the viewport on mobile. */}
        <style dangerouslySetInnerHTML={{ __html: `
          html,body,#root,#__next{height:100%;}
          body{margin:0;background:#F2EDE4;}
          @media(prefers-color-scheme:dark){body{background:#0f0f14;}}
          @media(max-width:480px){body{background:#f8f9fa;}@media(prefers-color-scheme:dark){body{background:#0f0f14;}}}
        ` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
