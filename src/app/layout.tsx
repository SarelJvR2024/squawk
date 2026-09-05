import type { Metadata, Viewport } from "next";
import "./globals.css";

/* Fonts are loaded from Google Fonts at runtime rather than through
   next/font, because the build environment has no egress to fonts.googleapis.com.
   Every family declares a real fallback stack in globals.css, so the app is
   fully legible before the webfont lands. */

export const metadata: Metadata = {
  title: "Squawk — ACSA Asset Assurance",
  description:
    "Squawk: audit capture, field inspection and findings closure for the ACSA asset assurance programme. Built by Thabile-Pridin JV.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0d18" },
  ],
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
      <body>{children}</body>
    </html>
  );
}
