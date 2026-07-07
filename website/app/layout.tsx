import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Manrope } from "next/font/google";
import { GOOGLE_SITE_VERIFICATION, SITE_URL, SOCIAL_PROFILE_URLS } from "@/lib/site";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Lagan — AI Habit Tracker & Coach",
    template: "%s — Lagan",
  },
  description:
    "Lagan is an AI habit tracker for the web and Android. Build routines, get AI coaching and smart reminders, track streaks, and earn XP.",
  applicationName: "Lagan",
  keywords: [
    "AI habit tracker",
    "AI habit coach",
    "AI routine planner",
    "AI smart reminders",
    "habit tracker",
    "daily habit app",
    "streak tracker",
    "routine tracker",
    "habit builder",
    "morning routine app",
    "atomic habits app",
    "habit log",
    "consistency tracker",
    "self improvement app",
    "goal tracker",
    "habit tracking app",
  ],
  authors: [{ name: "Lagan" }],
  creator: "Lagan",
  publisher: "Lagan",
  ...(GOOGLE_SITE_VERIFICATION ? { verification: { google: GOOGLE_SITE_VERIFICATION } } : {}),
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.png",
    apple: "/icon-192.png",
  },
  openGraph: {
    type: "website",
    siteName: "Lagan",
    title: "Lagan — AI Habit Tracker & Coach",
    description:
      "Build daily routines with AI coaching, smart reminders, streak tracking, XP, and badges — free on the web, with an Android beta on Google Play.",
    url: SITE_URL,
    locale: "en_US",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Lagan AI habit tracker with daily habits, streaks, AI coaching, and badges",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lagan — AI Habit Tracker & Coach",
    description:
      "Build daily routines with AI coaching, smart reminders, streak tracking, XP, and badges — free on the web, with an Android beta on Google Play.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  category: "productivity",
};

export const viewport: Viewport = {
  themeColor: "#0B0B0E",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Lagan",
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
    sameAs: SOCIAL_PROFILE_URLS,
  };

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Lagan",
    alternateName: ["Lagan Habit Tracker", "Lagan App"],
    url: SITE_URL,
  };

  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${manrope.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
