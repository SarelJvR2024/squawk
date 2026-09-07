/* The manifest's icons, rendered from the same mark the masthead draws.
 *
 *  Chromium is already here for the test suites, so it does the rasterising and
 *  no image library joins the dependency list for four PNGs that change about
 *  once a year. Re-run it only when the mark or the accent colours change:
 *
 *    node scripts/make-icons.mjs
 *
 *  The colours are the light theme's --acc / --acc-2 and the masthead's own
 *  #2d1956, copied rather than imported because this runs outside the bundle.
 *  If globals.css moves them, move them here too. */
import { chromium } from "playwright";
import fs from "node:fs";

const ACC = "#4b2e83", ACC2 = "#5c3a9c", MAST = "#2d1956";

/* `safe` is the maskable safe zone: Android crops a maskable icon to whatever
   shape the launcher uses, so the mark sits inside the middle 80%. */
const svg = (size, maskable) => {
  const pad = maskable ? size * 0.1 : 0;
  const box = size - pad * 2;
  const r = maskable ? size * 0.5 : size * 0.22;   // full-bleed ground when maskable
  const stroke = box * 0.11;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${ACC}"/><stop offset="1" stop-color="${ACC2}"/>
  </linearGradient></defs>
  <rect width="${size}" height="${size}" rx="${maskable ? 0 : r}" fill="${maskable ? MAST : "url(#g)"}"/>
  ${maskable ? `<rect x="${pad}" y="${pad}" width="${box}" height="${box}" rx="${box * 0.24}" fill="url(#g)"/>` : ""}
  <path d="M ${size * 0.3} ${size * 0.52} L ${size * 0.44} ${size * 0.66} L ${size * 0.71} ${size * 0.36}"
        fill="none" stroke="#ffffff" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
};

const out = [
  ["public/icon-192.png", 192, false],
  ["public/icon-512.png", 512, false],
  ["public/icon-maskable-512.png", 512, true],
  ["public/apple-touch-icon.png", 180, false],
];

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [file, size, maskable] of out) {
  const ctx = await b.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.setContent(`<style>html,body{margin:0;padding:0}</style>${svg(size, maskable)}`);
  await p.screenshot({ path: file, omitBackground: true });
  await ctx.close();
  console.log(file, size, maskable ? "maskable" : "");
}
await b.close();
