import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Space_Grotesk, Manrope } from "next/font/google";
import "./globals.css";

const plusJakarta = localFont({
  src: [
    { path: "../public/fonts/PlusJakartaSans-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/PlusJakartaSans-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-plus-jakarta",
  display: "swap",
});

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

const SITE_URL = "https://lagan.health";
const SITE_DESCRIPTION =
  "Lagan Health is the home of Lagan AI Habit Tracker at lagan.health. Build routines, get AI coaching and smart reminders, track streaks, and earn XP.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Lagan Health - Lagan AI Habit Tracker",
    template: "%s - Lagan Health",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Lagan AI Habit Tracker",
  keywords: [
    "Lagan",
    "Lagan Health",
    "Lagan AI Habit Tracker",
    "lagan.health",
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
  authors: [{ name: "Lagan Health" }],
  creator: "Lagan Health",
  publisher: "Lagan Health",
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.png",
    apple: "/icon-192.png",
  },
  openGraph: {
    type: "website",
    siteName: "Lagan Health",
    title: "Lagan Health - Lagan AI Habit Tracker",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Lagan Health AI habit tracker with daily habits, streaks, AI coaching, and badges",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lagan Health - Lagan AI Habit Tracker",
    description: SITE_DESCRIPTION,
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
    name: "Lagan Health",
    alternateName: ["Lagan", "Lagan AI Habit Tracker", "lagan.health"],
    url: SITE_URL,
    logo: `${SITE_URL}/og-image.png`,
    sameAs: [],
  };

  return (
    <html lang="en" className={`${plusJakarta.variable} ${spaceGrotesk.variable} ${manrope.variable}`}>
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
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
