/* Can this be used by somebody who cannot see it — or cannot see it well?
 *
 *  The second half of that question is not a minority case here. Squawk is used
 *  on a tablet held at arm's length on an apron at King Shaka at midday, and
 *  low-contrast grey text in direct sun is invisible to everybody. Roughly one
 *  man in twelve cannot separate the red dot from the green one either, and the
 *  dots are the fastest thing on the screen to read.
 *
 *  So this suite is not a compliance box. It computes the contrast of every
 *  foreground the design system uses, in BOTH themes, from the tokens as the
 *  browser actually resolves them — and it drives every screen looking for a
 *  control nobody could name, a form field nobody could label, and a colour
 *  carrying meaning on its own.
 *
 *  It found, on its first run: no `main` landmark anywhere, no `h1` on seven of
 *  the eight screens, no skip link, two unlabelled fields on Follow-up, six
 *  status dots that said nothing at all, and four colour tokens below WCAG AA —
 *  two of them, at 2.34:1 and 3.23:1, used for 9px hint text.
 *
 *    BASE=http://localhost:3000 node tests/a11y.js
 */

const { chromium } = require("playwright");
const B = process.env.BASE || "http://localhost:3000";
const PAGES = ["/home", "/capture", "/field", "/findings", "/hazards", "/closure", "/dashboard", "/review", "/preflight"];

let pass = 0, fail = 0;
const log = [];
const ok = (n, c, x = "") => {
  c ? (pass++, log.push("PASS  " + n)) : (fail++, log.push("FAIL  " + n + (x ? "  [" + x + "]" : "")));
};

/* WCAG AA: 4.5:1 for body text. Everything below is body text or smaller. */
const AA = 4.5;

const CONTRAST = `(() => {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  const rgb = (s) => {
    const d = document.createElement("div");
    d.style.color = s; document.body.appendChild(d);
    const c = getComputedStyle(d).color; d.remove();
    return c.match(/\\d+/g).map(Number);
  };
  const lum = ([r, g, b]) => {
    const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const l1 = lum(rgb(a)), l2 = lum(rgb(b));
    const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
    return +(((hi + 0.05) / (lo + 0.05)).toFixed(2));
  };
  const surfaces = ["--panel", "--sunken", "--bg", "--focus-surface"];
  const out = {};
  /* Every ink step against every surface it can land on. */
  for (const ink of ["--ink", "--ink-2", "--ink-3", "--ink-4"]) {
    for (const s of surfaces) out[ink + " on " + s] = ratio(v(ink), v(s));
  }
  /* And each band colour on its own tinted ground, which is where it is used. */
  out["--good on --good-bg"] = ratio(v("--good"), v("--good-bg"));
  out["--warn on --warn-bg"] = ratio(v("--warn"), v("--warn-bg"));
  out["--bad on --bad-bg"] = ratio(v("--bad"), v("--bad-bg"));
  out["--neu on --neu-bg"] = ratio(v("--neu"), v("--neu-bg"));
  out["--acc on --panel"] = ratio(v("--acc"), v("--panel"));
  out["--acc on --acc-soft"] = ratio(v("--acc"), v("--acc-soft"));
  /* The solid band fills print white-on-colour, like the ACSA report. */
  out["--on-solid on --bad-solid"] = ratio(v("--on-solid"), v("--bad-solid"));
  out["--on-solid on --warn-solid"] = ratio(v("--on-solid"), v("--warn-solid"));
  out["--on-solid on --good-solid"] = ratio(v("--on-solid"), v("--good-solid"));
  out["--on-acc on --acc"] = ratio(v("--on-acc"), v("--acc"));
  return out;
})()`;

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  try {
    /* ----------------------------- contrast ----------------------------- */
    for (const scheme of ["light", "dark"]) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
      const page = await ctx.newPage();
      await page.goto(B + "/capture", { waitUntil: "networkidle" });
      await page.waitForTimeout(1200);
      const ratios = await page.evaluate(CONTRAST);
      const bad = Object.entries(ratios).filter(([, r]) => r < AA);
      ok(`EVERY COLOUR THE DESIGN SYSTEM USES MEETS WCAG AA — ${scheme}`,
         bad.length === 0,
         bad.map(([k, r]) => `${k} = ${r}`).join(" · "));
      /* The floor, quoted, so a future change that only just scrapes past is
         visible in the output rather than silently fine. */
      const worst = Object.entries(ratios).sort((a, b) => a[1] - b[1])[0];
      log.push(`      ${scheme}: weakest is ${worst[0]} at ${worst[1]}:1`);
      await ctx.close();
    }

    /* -------------------------- every screen ---------------------------- */
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    for (const path of PAGES) {
      await page.goto(B + path, { waitUntil: "networkidle" });
      await page.waitForTimeout(1600);
      const r = await page.evaluate(() => {
        const vis = (e) => e.offsetParent !== null || getComputedStyle(e).position === "fixed";
        const named = (e) =>
          (e.getAttribute("aria-label") || e.getAttribute("title") || e.innerText || e.value || "").trim();
        const controls = [...document.querySelectorAll("button,a[href],select,input,textarea")].filter(vis);
        const labelled = (e) =>
          e.getAttribute("aria-label") ||
          e.getAttribute("aria-labelledby") ||
          (e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`)) ||
          e.closest("label");
        return {
          unnamed: [...new Set(controls.filter((e) => !named(e)).map((e) => e.outerHTML.slice(0, 70)))],
          unlabelled: [
            ...new Set(
              [...document.querySelectorAll("input,select,textarea")]
                .filter(vis).filter((e) => !labelled(e))
                .map((e) => e.outerHTML.slice(0, 70))
            ),
          ],
          mains: document.querySelectorAll("main").length,
          h1s: document.querySelectorAll("h1").length,
          h1text: document.querySelector("h1")?.textContent?.trim() ?? "",
          skip: !!document.querySelector('a[href="#work"]'),
          lang: document.documentElement.lang,
          imgsNoAlt: [...document.querySelectorAll("img")].filter(vis).filter((i) => !i.hasAttribute("alt")).length,
        };
      });

      ok(`${path} — every control has a name`, r.unnamed.length === 0, r.unnamed.join(" · "));
      ok(`${path} — every field has a label`, r.unlabelled.length === 0, r.unlabelled.join(" · "));
      ok(`${path} — one main landmark, and one h1 naming the screen and the audit`,
         r.mains === 1 && r.h1s === 1 && r.h1text.includes("—"), 
         `main=${r.mains} h1=${r.h1s} "${r.h1text}"`);
      ok(`${path} — a skip link past the navigation`, r.skip);
      ok(`${path} — the page declares its language`, r.lang === "en-ZA", r.lang);
      if (r.imgsNoAlt > 0) ok(`${path} — every image has alt text`, false, String(r.imgsNoAlt));
    }

    /* ------------------- colour is never the only carrier ---------------- */
    await page.goto(B + "/capture", { waitUntil: "networkidle" });
    await page.waitForTimeout(1800);
    /* Every small round span on the screen, whether it came from the Dot
       primitive or was written by hand, has to pass ONE of two tests:
    
         it says what its colour means (its own sr-only text, or a title), or
    
         it is marked aria-hidden AND the row it sits in says the state in
         words anyway — a green dot beside "23 findings" is a second reading
         of something already written, and does not need a third.
    
       aria-hidden on its own is not a pass. That would let any dot be
       silenced by one attribute, which is exactly the failure this suite
       exists to catch. */
    const dots = await page.evaluate(() => {
      const all = [...document.querySelectorAll("span.rounded-full")].filter(
        (e) => e.clientWidth <= 9 && e.clientHeight <= 9 && e.offsetParent !== null
      );
      const rowOf = (e) => e.closest("button,a,li,tr") || e.parentElement;
      const speaks = (e) => !!(e.textContent.trim() || e.getAttribute("title") || e.getAttribute("aria-label"));
      const decorative = (e) => {
        if (!e.closest("[aria-hidden]")) return false;
        const row = rowOf(e);
        return !!row && row.textContent.replace(/\s+/g, " ").trim().length >= 3;
      };
      const bad = all.filter((e) => !speaks(e) && !decorative(e));
      return {
        total: all.length,
        speechless: bad.length,
        first: bad.slice(0, 3).map((e) => e.outerHTML.slice(0, 60)),
      };
    });
    ok("A STATUS DOT SAYS WHAT ITS COLOUR MEANS, in words",
       dots.total > 0 && dots.speechless === 0,
       `${dots.speechless} of ${dots.total} say nothing — one man in twelve cannot read the colour · ${dots.first.join(" · ")}`);

    /* --------------------------- the keyboard ---------------------------- */
    await page.keyboard.press("Tab");
    const first = await page.evaluate(() => {
      const a = document.activeElement;
      const s = getComputedStyle(a);
      return { text: (a.textContent || "").trim(), outline: s.outlineWidth, visible: a.getBoundingClientRect().height > 0 };
    });
    ok("the first thing the keyboard reaches is the skip link",
       /skip to the audit/i.test(first.text), first.text.slice(0, 40));
    ok("and it becomes visible when it is focused, which is the only time it is any use",
       first.visible, JSON.stringify(first));
    ok("focus is drawn, not left to the browser's default",
       first.outline !== "0px", first.outline);

    await ctx.close();
  } catch (e) {
    fail++;
    log.push("FAIL  harness  [" + e.message + "]");
  }
  console.log(log.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
