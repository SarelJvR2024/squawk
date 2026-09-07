import type { MetadataRoute } from "next";

/** What makes Squawk installable — and therefore openable with no signal.
 *
 *  `start_url` is /capture rather than /, because / is a server redirect and a
 *  launch that begins with a redirect begins with a network request. On an
 *  apron there may not be one.
 *
 *  `display: "standalone"` is not decoration either. On iOS it removes Safari's
 *  chrome, which is ~110px of a 664px screen — the difference between two chip
 *  rows and four on the check screen — and it stops a stray swipe navigating
 *  away from a half-captured observation. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Squawk — ACSA Asset Assurance",
    short_name: "Squawk",
    description:
      "Audit capture, field inspection and findings closure for the ACSA asset assurance programme.",
    start_url: "/capture",
    scope: "/",
    display: "standalone",
    orientation: "any",
    /* The masthead's colour, matching the iOS status bar tint already set in
       layout.tsx, so the top of the screen is one surface rather than two. */
    theme_color: "#2d1956",
    background_color: "#f7f6fb",
    lang: "en-ZA",
    categories: ["business", "productivity", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      /* Android crops a maskable icon to the launcher's own shape, so this one
         carries the mark inside the middle 80% on a full-bleed ground. Without
         it the rounded square gets rounded a second time and loses its corners. */
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
