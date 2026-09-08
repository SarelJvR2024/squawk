/* Does the app open with no signal?
 *
 *  Every other guarantee in this repo about not losing captured work assumed
 *  the app had already loaded — IndexedDB holds the audit, photographs survive
 *  a reload, the sync queue waits for signal. None of that helps an auditor
 *  standing airside at King Shaka with no signal who closes the tab, or whose
 *  phone drops the page from memory, which iOS does aggressively. Before the
 *  service worker they got a browser error page and could not reach a single
 *  thing they had captured.
 *
 *  So this suite does the only thing that answers the question: it loads the
 *  app, CUTS THE NETWORK, and drives it. Reading the source would prove a
 *  service worker file exists, which is not the same claim.
 *
 *  It also asserts the things that must NOT be cached, because a routing rule
 *  that quietly hoovers up everything same-origin would put photographs of a
 *  national key point in a second store nobody decided on, and would answer an
 *  availability probe from a cache — telling an auditor a model is configured
 *  on a deployment where it is not.
 *
 *    BASE=http://localhost:3000 node tests/offline.js
 */

const { chromium } = require("playwright");
const B = process.env.BASE || "http://localhost:3000";

let pass = 0, fail = 0;
const log = [];
const ok = (n, c, x = "") => {
  c ? (pass++, log.push("PASS  " + n)) : (fail++, log.push("FAIL  " + n + (x ? "  [" + x + "]" : "")));
};

/** Wait until a worker is not just registered but ACTIVE and controlling the
 *  page. Registered-but-not-controlling caches nothing and would make every
 *  assertion below pass for the wrong reason on the first load. */
const controlled = (page) =>
  page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    null,
    { timeout: 20000 }
  );

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 664 } });
  const page = await ctx.newPage();

  try {
    /* ---------------- with signal ---------------- */
    await page.goto(B + "/capture", { waitUntil: "networkidle" });
    await controlled(page);
    ok("the service worker takes control of the page", true);

    const mf = await (await ctx.request.get(B + "/manifest.webmanifest")).json();
    ok("the app is installable", mf.display === "standalone" && mf.name.includes("Squawk"),
       JSON.stringify(mf).slice(0, 80));
    ok("it starts at a screen, not at a redirect", mf.start_url === "/capture", mf.start_url);
    ok("and carries a maskable icon, so a launcher does not crop the mark twice",
       (mf.icons ?? []).some((i) => i.purpose === "maskable"));

    /* Warm the rest of the shell the way an auditor would: by using it. */
    for (const path of ["/findings", "/hazards", "/closure", "/dashboard", "/field", "/review"]) {
      await page.goto(B + path, { waitUntil: "networkidle" });
    }
    await page.goto(B + "/capture", { waitUntil: "networkidle" });

    /* Capture something, so we can prove the WORK survives, not just the shell —
       and raise a finding, so the findings screen has a record with an asset
       picker on it when the network is gone. */
    await page.waitForTimeout(1200);
    await page.keyboard.press("2");
    await page.waitForTimeout(300);
    const issue = page.locator("text=Issues found").first().locator("xpath=../..").locator("button").first();
    if (await issue.count()) {
      await issue.click();
      await page.waitForTimeout(600);
    }
    await page.locator("button", { hasText: /^Save$/ }).first().click();
    await page.waitForTimeout(800);

    const cacheNames = await page.evaluate(() => caches.keys());
    ok("it keeps its caches under one versioned prefix", cacheNames.every((n) => n.startsWith("squawk-v")),
       cacheNames.join(", "));

    const cached = await page.evaluate(async () => {
      const out = [];
      for (const n of await caches.keys()) {
        const c = await caches.open(n);
        for (const r of await c.keys()) out.push(r.url);
      }
      return out;
    });
    ok("the seven screens are in the cache",
       ["/capture", "/findings", "/hazards", "/closure", "/dashboard", "/field", "/review"]
         .every((p) => cached.some((u) => new URL(u).pathname === p)),
       String(cached.filter((u) => !u.includes("/_next/")).length) + " non-asset entries");

    /* THE EXCLUSIONS. Each of these being cached would be a defect, not a
       missing optimisation. */
    ok("NO /api RESPONSE IS CACHED — an availability probe must never be answered from one",
       !cached.some((u) => new URL(u).pathname.startsWith("/api/")),
       cached.filter((u) => u.includes("/api/")).join(", "));
    ok("nor the OAuth redirect, which carries a code and a state in its URL",
       !cached.some((u) => new URL(u).pathname.startsWith("/graph-callback")));
    ok("and nothing cross-origin — the photographs are not copied into a second store",
       cached.every((u) => new URL(u).origin === new URL(B).origin),
       cached.filter((u) => new URL(u).origin !== new URL(B).origin).join(", "));
    ok("the redirecting root is not cached, which would hand a redirected response to a navigation",
       !cached.some((u) => new URL(u).pathname === "/"),
       cached.filter((u) => new URL(u).pathname === "/").join(", "));

    /* ---------------- cut the network ---------------- */
    await ctx.setOffline(true);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const body = await page.locator("body").innerText();
    ok("THE APP COLD-STARTS WITH NO SIGNAL", /Evidence to request|Status/.test(body),
       body.slice(0, 120).replace(/\n/g, " "));
    ok("and it is Squawk, not a browser error page",
       /SQUAWK/i.test(body) && !/ERR_INTERNET_DISCONNECTED|No internet/i.test(body),
       body.slice(0, 120).replace(/\n/g, " "));

    ok("the work captured before the signal went is still there",
       /desk done|complete ·/i.test(body), body.slice(0, 160).replace(/\n/g, " "));

    /* A typed URL, offline — the case where somebody reopens from a bookmark. */
    await page.goto(B + "/findings", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const fBody = await page.locator("body").innerText();
    ok("another screen opens offline from its own URL", /finding/i.test(fBody),
       fBody.slice(0, 120).replace(/\n/g, " "));

    /* And the bare root, which is a redirect and therefore the one most likely
       to break: it must land on a screen rather than an error. */
    await page.goto(B + "/", { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(1200);
    const rBody = await page.locator("body").innerText();
    ok("the bare address falls back to a screen rather than failing",
       /SQUAWK/i.test(rBody), rBody.slice(0, 120).replace(/\n/g, " "));

    /* THE TWO LAZY PAYLOADS. Both are fetched on first use rather than shipped
       in the bundle — 9,836 researched options and 1,506 asset rows that a
       tablet on the apron should not pay for until it asks. Which means both
       are only offline-safe if something fetched them while there was still a
       signal. An auditor who never opened an asset picker on wifi and then
       needs one in a substation is the case this pair is here to catch. */
    await page.goto(B + "/capture", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const chips = await page.locator("body").innerText();
    ok("OFFLINE, A CHECK STILL OFFERS ITS RESEARCHED OPTIONS",
       /Evidence to request/.test(chips) && !/No researched options/.test(chips),
       chips.slice(0, 140).replace(/\n/g, " "));

    await page.goto(B + "/findings", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const picker = page.locator("summary", { hasText: "Assets" }).first();
    let assetsOffline = "no picker on the page";
    if (await picker.count()) {
      await picker.click();
      await page.waitForTimeout(2000);
      assetsOffline = await page
        .locator("input[aria-label='Search assets']")
        .first()
        .locator("xpath=../..")
        .innerText()
        .catch(() => "unreadable");
    }
    ok("AND THE ASSET REGISTER IS REACHABLE WITH NO SIGNAL",
       /SAMPLE-/.test(assetsOffline) && !/Loading the register/.test(assetsOffline),
       assetsOffline.slice(0, 110).replace(/\n/g, " "));

    /* The routes that must still fail honestly rather than lie from a cache. */
    await page.goto(B + "/capture", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    const apiOffline = await page.evaluate(async () => {
      try {
        const r = await fetch("/api/assist");
        return `answered ${r.status}`;
      } catch {
        return "failed";
      }
    });
    ok("an API call offline FAILS rather than returning a stale answer",
       apiOffline === "failed", apiOffline);

    await ctx.setOffline(false);

    /* ------------- THE DAY AFTER A DEPLOY, ON AN APRON ------------------

       The one that was open. A deploy lands; the auditor opens the app with
       signal and is served the cached shell instantly while the NEW html is
       written behind them; they walk out and lose signal; iOS drops the tab;
       they reopen — and get a shell asking for chunk filenames nobody ever
       fetched. Content-hashed assets cannot go stale, but they can be ABSENT,
       and absent offline is a blank page airside with the whole audit sitting
       unreachable in IndexedDB.

       Driven, not argued: the navigation is answered with html naming a build
       this device cannot fetch, and then the network is cut. A shell one build
       AHEAD of its own chunks is worse than one behind, which merely works. */
    await ctx.route("**/capture", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body:
          "<!doctype html><html><head><script src=\"/_next/static/chunks/from-a-build-we-cannot-fetch.js\" defer></script></head>" +
          "<body><div id=\"__next\"></div></body></html>",
      })
    );
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await ctx.unroute("**/capture");

    await ctx.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
    await page.waitForTimeout(2500);
    const afterDeploy = (await page.locator("body").innerText().catch(() => "")).trim();
    ok("THE APP STILL OPENS OFFLINE AFTER A DEPLOY IT COULD NOT FINISH FETCHING",
       /KSIA|capture|check/i.test(afterDeploy),
       `body was ${JSON.stringify(afterDeploy.slice(0, 80))} — a shell one build ahead of its ` +
         "own chunks is a blank page on an apron");
    await ctx.setOffline(false);
  } catch (e) {
    fail++;
    log.push("FAIL  harness  [" + e.message + "]");
  }

  console.log(log.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
