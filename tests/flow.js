const { chromium } = require("playwright");

/* Does the number move, and does it move only when it should?
 *
 *  Every screen in this app derives its figures from the same store, and the
 *  invariant the whole thing is built on is that a rating the group has not
 *  agreed reaches NO KPI, NO dashboard and NO export. That rule is easy to
 *  state and easy to leak: it was applied correctly in exports.ts, in
 *  carryforward.ts and in the dashboard's own `rated` list, and broken in the
 *  two `currentRating` helpers next door — which fed the Improved / Unchanged /
 *  Worsened counts, the headline comparison against March 2025.
 *
 *  Reading the code did not catch that for months. Watching the number move
 *  does. So this suite drives a real browser, records what each screen says at
 *  each step, and asserts what changed AND what did not.
 *
 *  Needs a server: BASE=http://localhost:3000 node tests/flow.js
 */

const B = process.env.BASE || "http://localhost:3000";
let pass = 0, fail = 0;
const log = [];
const ok = (n, c, x = "") => {
  c ? (pass++, log.push("PASS  " + n)) : (fail++, log.push("FAIL  " + n + (x ? "  [" + x + "]" : "")));
};

/** Read a KPI card by its label, from anywhere on the page. */
async function kpi(p, label) {
  const v = await p.evaluate((l) => {
    const els = [...document.querySelectorAll("span,div")].filter(
      (e) => e.textContent?.trim() === l && e.children.length === 0
    );
    for (const e of els) {
      const card = e.closest("div");
      const b = card?.parentElement?.querySelector("b");
      if (b) return b.textContent?.trim();
    }
    return null;
  }, label);
  return v;
}

/** The number in a nav badge, or 0 when there is none. */
async function badge(p, name) {
  return p.evaluate((n) => {
    const a = [...document.querySelectorAll("a")].find((x) => x.textContent?.includes(n));
    const m = a?.textContent?.match(/(\d+)\s*$/);
    return m ? Number(m[1]) : 0;
  }, name);
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));

  /* ---------------- 1. a clean start ---------------- */
  await p.goto(B + "/dashboard", { waitUntil: "networkidle" });
  await p.waitForTimeout(2000);
  const before = {
    findings: await kpi(p, "Findings raised"),
    worsened: await kpi(p, "Worsened"),
    improved: await kpi(p, "Improved"),
  };
  ok("the dashboard starts with no findings", before.findings === "0", JSON.stringify(before));

  /* ---------------- 2. capture a check, raise a finding ----------------
     The issue button seeds a SUGGESTED severity and likelihood. Nothing about
     that is agreed. */
  await p.goto(B + "/capture", { waitUntil: "networkidle" });
  await p.waitForTimeout(2400);
  const capBefore = await badge(p, "Capture");
  await p.keyboard.press("2");                       // Non-compliant
  await p.waitForTimeout(300);
  await p.locator("text=Issues found").first().locator("xpath=../..").locator("button").first().click();
  await p.waitForTimeout(600);
  await p.locator("button", { hasText: /^Save$/ }).first().click();
  await p.waitForTimeout(800);

  const capAfter = await badge(p, "Capture");
  ok("capturing a check works the Capture badge down", capAfter === capBefore - 1,
     `${capBefore} -> ${capAfter}`);
  ok("and raising a finding shows on the Findings badge", (await badge(p, "Findings")) === 1,
     String(await badge(p, "Findings")));

  /* ---------------- 3. THE INVARIANT ----------------
     A suggested rating must reach nothing. */
  await p.goto(B + "/dashboard", { waitUntil: "networkidle" });
  await p.waitForTimeout(1600);
  const suggested = {
    findings: await kpi(p, "Findings raised"),
    rated: await kpi(p, "Ratings agreed"),
    red: await kpi(p, "Red"),
    worsened: await kpi(p, "Worsened"),
  };
  ok("the finding itself is counted", suggested.findings === "1", JSON.stringify(suggested));
  ok("but no rating is agreed yet", suggested.rated === "0" || suggested.rated === null,
     String(suggested.rated));
  ok("no band is counted from a suggestion", suggested.red === "0" || suggested.red === null,
     String(suggested.red));
  /* The one that was broken: an untapped issue button used to be able to turn
     an asset system Unacceptable and move this. */
  ok("AND THE MOVEMENT COUNTS DO NOT MOVE on a suggestion",
     suggested.worsened === before.worsened,
     `worsened ${before.worsened} -> ${suggested.worsened}`);

  const matrixBefore = await p.evaluate(() =>
    (document.body.innerText.match(/(\d+) rated/) || [])[1] ?? "?"
  );
  ok("the risk matrix on the dashboard counts no rated finding yet", matrixBefore === "0",
     matrixBefore);

  /* ---------------- 4. agree the rating ---------------- */
  await p.goto(B + "/findings", { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  const cell = p.locator("button[aria-label*=' by likelihood ']").first();
  ok("the findings screen offers the B170 001M matrix", (await cell.count()) > 0);
  /* 5A — the worst cell, so the effect is unambiguous. */
  await p.locator('button[aria-label^="Severity A - Catastrophic by likelihood 5"]').first().click();
  await p.waitForTimeout(700);

  await p.goto(B + "/dashboard", { waitUntil: "networkidle" });
  await p.waitForTimeout(1600);
  const agreed = {
    rated: await kpi(p, "Ratings agreed"),
    red: await kpi(p, "Red"),
  };
  ok("agreeing a rating counts it", agreed.rated === "1", String(agreed.rated));
  ok("and a 5A lands in the Red band", agreed.red === "1", String(agreed.red));
  const matrixAfter = await p.evaluate(() =>
    (document.body.innerText.match(/(\d+) rated/) || [])[1] ?? "?"
  );
  ok("the dashboard matrix now counts it", matrixAfter === "1", matrixAfter);

  /* ---------------- 5. it reaches the hazard register ---------------- */
  await p.goto(B + "/hazards", { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  const body = await p.locator("body").innerText();
  ok("the hazard register sees the finding as ungrouped",
     /1[\s\S]{0,40}Findings not yet grouped/.test(body) || /1 finding not yet in a hazard/.test(body),
     body.slice(0, 200).replace(/\n/g, " "));

  await p.locator("button", { hasText: /^Raise one directly$/ }).first().click();
  await p.waitForTimeout(500);
  const sel = p.locator("select").filter({ hasText: "add a finding" }).first();
  if (await sel.count()) { await sel.selectOption({ index: 1 }); await p.waitForTimeout(500); }
  const after = await p.locator("body").innerText();
  ok("consolidating it clears the ungrouped count",
     /0[\s\S]{0,40}Findings not yet grouped/.test(after),
     after.slice(0, 200).replace(/\n/g, " "));
  ok("a hazard arrives unrated, whatever the finding behind it was rated",
     /UNRATED/.test(after) || /counts nowhere until the group agrees/.test(after));

  /* ---------------- 6. and the closure position ---------------- */
  await p.goto(B + "/closure", { waitUntil: "networkidle" });
  await p.waitForTimeout(1400);
  const closure = await p.locator("body").innerText();
  ok("closure lists this site's own prior findings", /2025/.test(closure));
  ok("no page errors anywhere in the flow", errs.length === 0, errs[0] || "");

  console.log(log.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log(log.join("\n"));
  console.log("THREW: " + e.message);
  process.exit(1);
});
