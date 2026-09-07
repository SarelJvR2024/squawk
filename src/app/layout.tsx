import type { Metadata, Viewport } from "next";
import OfflineReady from "@/components/OfflineReady";
import "./globals.css";

/* Fonts are loaded from Google Fonts at runtime rather than through
   next/font, because the build environment has no egress to fonts.googleapis.com.
   Every family declares a real fallback stack in globals.css, so the app is
   fully legible before the webfont lands. */

export const metadata: Metadata = {
  title: "Squawk — ACSA Asset Assurance",
  description:
    "Squawk: audit capture, field inspection and findings closure for the ACSA asset assurance programme. Built by Thabile-Pridin JV.",
  /* Named explicitly rather than left to file-convention discovery, because
     apple-touch-icon is what iOS puts on the home screen and a missing one
     gets a screenshot of the page instead. */
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "Squawk", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  /* The masthead's own colour, not the page's.
     
     On iOS the status bar sits directly above the masthead and takes its tint
     from here. Against #f7f6fb the dark bar ended at the notch with a light
     strip above it — a seam across the top of the app on the device it is used
     on. Same value in both schemes because the masthead is #2D1956 in both. */
  themeColor: "#2d1956",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-ZA">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        {children}
        <OfflineReady />
      </body>
    </html>
  );
}
