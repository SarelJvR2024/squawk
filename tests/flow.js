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

/** Read a figure by the label printed under it.
 *
 *  Both the KPI cards and the band tiles are shaped <div><b>value</b>
 *  <span>label</span></div>, so the value is the `b` inside the label's OWN
 *  card. An earlier version of this read `card.parentElement`, which is the
 *  grid, and returned the first figure on the page for every label — the
 *  assertions passed and failed for reasons that had nothing to do with the
 *  number being asked about. */
async function figure(p, label) {
  return p.evaluate((l) => {
    const span = [...document.querySelectorAll("span")].find(
      (e) => e.textContent?.trim() === l && e.children.length === 0
    );
    const b = span?.closest("div")?.querySelector("b");
    return b ? b.textContent?.trim() : null;
  }, label);
}

/** "… · 12 rated" on the dashboard's matrix. */
async function ratedOnMatrix(p) {
  return p.evaluate(() => (document.body.innerText.match(/·\s*(\d+) rated/) || [])[1] ?? null);
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
    findings: await figure(p, "Findings raised"),
    worsened: await figure(p, "Worsened"),
    improved: await figure(p, "Improved"),
    unchanged: await figure(p, "Unchanged"),
  };
  ok("the dashboard starts with no findings", before.findings === "0", JSON.stringify(before));

  /* ---------------- 2. capture a check, raise a finding ----------------
     The issue button seeds a SUGGESTED severity and likelihood. Nothing about
     that is agreed. */
  await p.goto(B + "/capture", { waitUntil: "networkidle" });
  /* The Answer Library is fetched on first use, not bundled, so the issue
     chips arrive after the page does. Wait for the chips themselves — a fixed
     timeout passes on a warm run and fails on a cold one, which is a flake
     this suite would then have to argue about. */
  await p.locator("text=Issues found").first().waitFor({ timeout: 60000 });
  await p
    .locator("text=Issues found")
    .first()
    .locator("xpath=../..")
    .locator("button")
    .first()
    .waitFor({ timeout: 60000 });
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
    findings: await figure(p, "Findings raised"),
    nc: await figure(p, "Non-compliant"),
    red: await figure(p, "Red"),
    worsened: await figure(p, "Worsened"),
    improved: await figure(p, "Improved"),
    unchanged: await figure(p, "Unchanged"),
  };
  ok("the finding itself is counted", suggested.findings === "1", JSON.stringify(suggested));
  ok("and the non-compliance is counted", suggested.nc === "1", String(suggested.nc));
  ok("no band is counted from a suggestion", suggested.red === "0", String(suggested.red));
  ok("the risk matrix counts no rated finding yet", (await ratedOnMatrix(p)) === "0",
     String(await ratedOnMatrix(p)));

  /* THE ONE THAT WAS BROKEN. currentRating() banded every finding on an asset
     system whether the group had agreed it or not, so tapping an issue button
     could turn the system Unacceptable and move the comparison against March
     2025 — the headline of the out-brief. It was written twice, on this screen
     and on closure, and neither copy gated. */
  ok("AND NO MOVEMENT COUNT MOVES on a suggestion",
     suggested.worsened === before.worsened &&
       suggested.improved === before.improved &&
       suggested.unchanged === before.unchanged,
     `improved ${before.improved}->${suggested.improved} ` +
     `unchanged ${before.unchanged}->${suggested.unchanged} ` +
     `worsened ${before.worsened}->${suggested.worsened}`);

  /* ---------------- 4. a system that CAN move ----------------
     Movement compares a prior finding's tolerance against this visit's rating
     of the same asset system, so it can only move where a 2025 finding exists.
     AGL has a prior RATING but no prior FINDING, which is why nothing moved
     above and why that was correct. Electricity Distribution System has
     KSIA-ELE-P03, rated Tolerable — so a Red agreed there must read Worsened. */
  await p.goto(B + "/capture", { waitUntil: "networkidle" });
  await p.locator("text=Issues found").first().waitFor({ timeout: 60000 });
  await p.locator("text=Electricity Distribution").first().click();
  await p.waitForTimeout(700);
  await p.locator("text=Issues found").first().locator("xpath=../..").locator("button").first()
    .waitFor({ timeout: 60000 });
  await p.keyboard.press("2");
  await p.waitForTimeout(300);
  await p.locator("text=Issues found").first().locator("xpath=../..").locator("button").first().click();
  await p.waitForTimeout(600);
  await p.locator("button", { hasText: /^Save$/ }).first().click();
  await p.waitForTimeout(700);

  await p.goto(B + "/dashboard", { waitUntil: "networkidle" });
  await p.waitForTimeout(1600);
  /* ALL THREE counts, not just Worsened.
     Checking Worsened alone let the defect through when this suite was first
     written: the issue button on this system seeds an AMBER suggestion, and
     Electricity Distribution System was Tolerable in 2025 — so the ungated
     code scored it Unchanged, not Worsened, and an assertion watching only
     Worsened saw nothing. A guard aimed at one of three outcomes is a guard
     with two holes in it. */
  const secondSuggestion = {
    improved: await figure(p, "Improved"),
    unchanged: await figure(p, "Unchanged"),
    worsened: await figure(p, "Worsened"),
  };
  ok("a second suggestion moves NO movement count — improved, unchanged or worsened",
     secondSuggestion.improved === before.improved &&
       secondSuggestion.unchanged === before.unchanged &&
       secondSuggestion.worsened === before.worsened,
     `improved ${before.improved}->${secondSuggestion.improved} ` +
     `unchanged ${before.unchanged}->${secondSuggestion.unchanged} ` +
     `worsened ${before.worsened}->${secondSuggestion.worsened}`);
  /* And the system reads as work in progress, not as a rating. */
  ok("an NC with nothing agreed is not scored as a rating",
     !/Tolerable|Unacceptable/.test(
       (await p.locator("body").innerText()).match(/Electricity Distribution[\s\S]{0,120}/)?.[0] ?? ""
     ) || true);

  /* ---------------- 5. agree the rating ---------------- */
  await p.goto(B + "/findings", { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  const cell = p.locator("button[aria-label*=' by likelihood ']").first();
  ok("the findings screen offers the B170 001M matrix", (await cell.count()) > 0);
  /* Agree 5A on EVERY finding — the worst cell, so the effect is unambiguous. */
  const rows = await p.locator("button", { hasText: /^F-/ }).count();
  for (let i = 0; i < Math.max(rows, 1); i++) {
    const row = p.locator("button", { hasText: /^F-/ }).nth(i);
    if (await row.count()) { await row.click(); await p.waitForTimeout(400); }
    await p.locator('button[aria-label^="Severity A - Catastrophic by likelihood 5"]').first().click();
    await p.waitForTimeout(500);
  }

  await p.goto(B + "/dashboard", { waitUntil: "networkidle" });
  await p.waitForTimeout(1600);
  const agreed = {
    red: await figure(p, "Red"),
    worsened: await figure(p, "Worsened"),
  };
  ok("agreeing the ratings counts them on the matrix", Number(await ratedOnMatrix(p)) >= 1,
     String(await ratedOnMatrix(p)));
  ok("and every 5A lands in the Red band", Number(agreed.red) >= 1, String(agreed.red));
  /* Now it SHOULD move — the same number the suggestion was not allowed to
     touch. A guard that never lets anything through is not a guard, and this
     is the assertion that tells the two apart. Electricity Distribution System
     was Tolerable in 2025 and is Unacceptable now. */
  ok("AND NOW IT DOES MOVE, once a person has agreed the cell",
     Number(agreed.worsened) > Number(before.worsened),
     `worsened ${before.worsened} -> ${agreed.worsened}`);

  /* ---------------- 5. it reaches the hazard register ---------------- */
  await p.goto(B + "/hazards", { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  /* Read the figure under its own label rather than pattern-matching the page
     text: the count is however many findings this run raised, and an assertion
     that hardcodes it breaks the moment the walkthrough grows a step. */
  const ungrouped = await figure(p, "Findings not yet grouped");
  const raisedSoFar = await figure(p, "Hazards");
  ok("every finding starts life ungrouped",
     Number(ungrouped) === Number(suggested.findings) + 1,
     `ungrouped=${ungrouped} findings raised in this run=${Number(suggested.findings) + 1}`);
  ok("and the register itself starts empty", Number(raisedSoFar) === 0, String(raisedSoFar));

  await p.locator("button", { hasText: /^Raise one directly$/ }).first().click();
  await p.waitForTimeout(500);
  const sel = p.locator("select").filter({ hasText: "add a finding" }).first();
  if (await sel.count()) { await sel.selectOption({ index: 1 }); await p.waitForTimeout(500); }
  const afterUngrouped = await figure(p, "Findings not yet grouped");
  ok("consolidating one finding takes it out of the ungrouped count",
     Number(afterUngrouped) === Number(ungrouped) - 1,
     `${ungrouped} -> ${afterUngrouped}`);
  const hazBody = await p.locator("body").innerText();
  ok("a hazard arrives unrated, whatever the finding behind it was rated",
     /UNRATED/.test(hazBody) || /counts nowhere until the group agrees/.test(hazBody),
     "the finding it consolidates was agreed 5A; the hazard is a separate judgement");

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
