import type { Metadata } from "next";
import { Playfair_Display, DM_Sans, DM_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

import * as Sentry from '@sentry/nextjs';

// Claude chose this approach because: Sentry requires generateMetadata (not static metadata) to inject trace headers for error tracking
export function generateMetadata(): Metadata {
  return {
    title: "GrowLog AI — Your Garden Journal",
    description: "Chat with an AI advisor about your crops. Weather-aware advice, observation logging, and automatic Google Sheets sync.",
    other: {
      ...Sentry.getTraceData()
    }
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* GA4 — loads on every page, tracks navigation automatically */}
      <Script src="https://www.googletagmanager.com/gtag/js?id=G-BJQ18PWF0D" strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'G-BJQ18PWF0D');
      `}</Script>
      <body className={`${playfair.variable} ${dmSans.variable} ${dmMono.variable} font-sans antialiased bg-straw text-soil`}>
        {children}
      </body>
    </html>
  );
}
