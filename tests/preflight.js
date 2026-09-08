/* The screen that answers "will this device work", before it matters.
 *
 *  Squawk asks a lot of a phone — audio, photographs, an audit in IndexedDB, a
 *  copy of itself in a cache so it opens with no signal, and a queue pushing
 *  evidence to the record store. Any of those can be off, refused, full or
 *  quietly broken on one particular device, and the way that was found out
 *  before this page existed was by trying to capture something at King Shaka
 *  and having it not work.
 *
 *  So the suite drives the page the way an auditor would, and asserts the two
 *  things that make it worth having: that it reports what is TRUE about the
 *  device it is running on, and that it never asks for a permission nobody
 *  pressed a button for.
 *
 *    BASE=http://localhost:3000 node tests/preflight.js
 */

const { chromium } = require("playwright");
const B = process.env.BASE || "http://localhost:3000";

let pass = 0, fail = 0;
const log = [];
const ok = (n, c, x = "") => {
  c ? (pass++, log.push("PASS  " + n)) : (fail++, log.push("FAIL  " + n + (x ? "  [" + x + "]" : "")));
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  try {
    /* No permissions granted, and every request for one is recorded rather than
       auto-answered — the page must not ask on its own. */
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, permissions: [] });
    const asked = [];
    const page = await ctx.newPage();
    page.on("dialog", (d) => { asked.push(d.message()); void d.dismiss(); });
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e)));

    await page.goto(B + "/preflight", { waitUntil: "networkidle" });
    await page.waitForTimeout(4500);
    const body = await page.locator("body").innerText();

    ok("the pre-flight screen is reachable from the nav on a phone",
       await page.locator("a[href='/preflight']").first().isVisible().catch(() => false));
    ok("it opens without asking for anything", asked.length === 0, asked.join(" | "));
    ok("no page errors", errs.length === 0, errs[0] ?? "");

    ok("it reports the audit in view, so a screenshot of it is evidence about a device",
       /KSIA/.test(body) && /2026-09/.test(body), body.slice(0, 120).replace(/\n/g, " "));

    ok("IT SAYS WHETHER THE APP WILL OPEN WITH NO SIGNAL",
       /Opens with no signal/.test(body), body.slice(0, 200).replace(/\n/g, " "));
    ok("and the worker had actually registered by the time it looked",
       /cached/.test(body) && !/Not registered yet/.test(body),
       (body.match(/Opens with no signal[^\n]*\n[^\n]*/) ?? [""])[0].replace(/\n/g, " · "));

    ok("it proves the device can store the audit by writing and reading back",
       /Written and read back/.test(body));
    ok("it reports the room left for evidence in bytes, not in adjectives",
       /used of/.test(body), (body.match(/[\d.]+ [KMG]?B used of[^\n]*/) ?? [""])[0]);
    ok("and the three services, each saying what is lost without it",
       /Record store for photographs/.test(body) &&
       /AI assistance/.test(body) &&
       /Voice note transcription/.test(body));

    /* The two that must stay behind a button. */
    ok("THE MICROPHONE IS NOT TESTED UNTIL SOMEBODY ASKS",
       /Microphone[\s\S]{0,80}Not tested/.test(body),
       "opening a diagnostic must not throw a permission prompt at somebody");
    ok("nor the camera", /Camera[\s\S]{0,80}Not tested/.test(body));
    ok("and both offer the test",
       (await page.locator("button", { hasText: /Test microphone/ }).count()) === 1 &&
       (await page.locator("button", { hasText: /Test camera/ }).count()) === 1);

    ok("nothing it did changed the audit",
       /0\/315/.test(body), (body.match(/0\/\d+/g) ?? []).join(" "));

    /* ---------------- the clock, which decides who wins a clash ----------

       Two auditors who answer the same check settle it on whichever device
       says it answered LAST. That is the right rule with right clocks and a
       silent thief with a wrong one, so pre-flight has to say so. The check
       must also be honest in both directions: a device with a good clock is
       not allowed to cry wolf. */
    const clockOf = (t) =>
      t.evaluate(() => {
        const m = document.body.innerText.match(/This device's clock[\s\S]{0,200}/);
        return (m ? m[0] : "").replace(/\n/g, " · ");
      });

    ok("a device with a right clock is told so, and not warned for nothing",
       /to within/i.test(await clockOf(page)),
       await clockOf(page));

    /* Now a tablet whose clock is an hour fast — someone else's timezone, or a
       device that has been off for a week. Date.now() is overridden before any
       of the app's script runs, so the page genuinely believes it. */
    const skewed = await browser.newContext({ viewport: { width: 390, height: 800 } });
    await skewed.addInitScript(() => {
      const real = Date.now;
      Date.now = () => real() + 3600 * 1000;
    });
    const sp = await skewed.newPage();
    await sp.goto(B + "/preflight", { waitUntil: "networkidle" });
    await sp.waitForTimeout(3500);
    const skewText = await clockOf(sp);
    ok("A TABLET WITH A WRONG CLOCK IS TOLD, in minutes rather than milliseconds",
       /1 hour ahead of the server|60 minutes ahead of the server/.test(skewText),
       skewText);
    ok("and told what it costs — that it quietly wins or loses every clash",
       /wins or loses every clash/.test(await sp.locator("body").innerText()),
       "a wrong clock nobody explains is a wrong clock nobody fixes");
    await skewed.close();

    await ctx.close();

    /* ---- and now with a microphone, which this one does not have ----
     *
     *  A headless browser has no audio device, so pressing the button in the
     *  context above would report "unavailable" and be testing the sandbox
     *  rather than the app. Chromium's fake capture device is as close to an
     *  auditor's phone as this gets without a person and a mic — the same
     *  approach tests/ai.js takes to record a real voice note. */
    const fake = await chromium.launch({
      executablePath: "/opt/pw-browsers/chromium",
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    });
    const fctx = await fake.newContext({ viewport: { width: 390, height: 800 }, permissions: ["microphone"] });
    const fp = await fctx.newPage();
    await fp.goto(B + "/preflight", { waitUntil: "networkidle" });
    await fp.waitForTimeout(4000);

    await fp.locator("button", { hasText: /Test microphone/ }).first().click();
    await fp.waitForTimeout(2500);
    const afterMic = await fp.locator("body").innerText();
    ok("testing the microphone reports the format it will actually record",
       /Allowed · records audio\//.test(afterMic),
       (afterMic.match(/Microphone[\s\S]{0,120}/) ?? [""])[0].replace(/\n/g, " · "));

    await fp.locator("button", { hasText: /Check again/ }).first().click();
    await fp.waitForTimeout(3000);
    const rechecked = await fp.locator("body").innerText();
    ok("checking again does not throw away a permission result already earned",
       /Allowed · records audio\//.test(rechecked),
       "a screen you have to reload to re-run is a screen that loses what you tested");

    await fctx.close();
    await fake.close();
  } catch (e) {
    fail++;
    log.push("FAIL  harness  [" + e.message + "]");
  }
  console.log(log.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
