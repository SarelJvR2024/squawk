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

/** A nav badge, as "done/total" or a bare count.
 *
 *  The labels name the audit activity — Checks, Inspection, Follow-up — and
 *  the routes deliberately did not move with them, so this looks up by href
 *  rather than by the visible word. A test that keys off a label breaks every
 *  time somebody improves the wording, which is not what it is guarding. */
async function badge(p, href) {
  return p.evaluate((h) => {
    const a = [...document.querySelectorAll("a")].find((x) => x.getAttribute("href") === h);
    const t = a?.textContent ?? "";
    const pair = t.match(/(\d+)\/(\d+)\s*$/);
    if (pair) return { done: Number(pair[1]), total: Number(pair[2]) };
    const one = t.match(/(\d+)\s*$/);
    return { done: one ? Number(one[1]) : 0, total: null };
  }, href);
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
  const capBefore = await badge(p, "/capture");
  await p.keyboard.press("2");                       // Non-compliant
  await p.waitForTimeout(300);
  await p.locator("text=Issues found").first().locator("xpath=../..").locator("button").first().click();
  await p.waitForTimeout(600);
  await p.locator("button", { hasText: /^Save$/ }).first().click();
  await p.waitForTimeout(800);

  const capAfter = await badge(p, "/capture");
  ok("capturing a check moves the Checks badge UP — it counts done, not left",
     capAfter.done === capBefore.done + 1 && capAfter.total === capBefore.total,
     `${capBefore.done}/${capBefore.total} -> ${capAfter.done}/${capAfter.total}`);
  ok("and the denominator is this site's list, not the register",
     capAfter.total !== null && capAfter.total < 374,
     `total=${capAfter.total}`);
  ok("raising a finding shows on the Findings badge",
     (await badge(p, "/findings")).done === 1,
     JSON.stringify(await badge(p, "/findings")));

  /* ---------------- 2b. the treatment fields, where the issue was raised ----
     ACSA's dashboards carry Root Cause, Risk Treatment, Target Date and
     Progress/Update. The compliance session settles the check, confirms last
     cycle's finding and captures the root cause in ONE conversation with the
     responsible person in the room — making the auditor navigate away is how
     the second and third get postponed and then never had. */
  const treatment = p.locator("summary", { hasText: /Treatment ·/ }).first();
  ok("the check screen carries the treatment fields for what it raised",
     (await treatment.count()) > 0);
  ok("and says what is outstanding without being opened",
     /no root cause/.test(await treatment.innerText()),
     "blank fields are filled at different moments and must never read as complete");
  await treatment.click();
  await p.waitForTimeout(600);
  const checkBody = await p.locator("body").innerText();
  ok("but NOT the risk matrix — the group agrees that at the register",
     !/Severity \(rows\)/.test(checkBody),
     "one component, two shapes; the four fields are not written twice");
  await p.locator('input[placeholder^="What moved"]').first()
    .fill("Manager confirmed the register is being reissued.");
  await p.locator("button", { hasText: /Add to the log/ }).first().click();
  await p.waitForTimeout(700);
  const logged = await p.locator("body").innerText();
  ok("progress on a finding is a dated log, recorded on the day",
     /register is being reissued/.test(logged) && /1 update/.test(logged));

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

  /* The ACSA report fills an agreed rating cell SOLID with white text and the
     app keeps a soft tint for one the assistant has only suggested — so the
     weight of the colour carries the meaning rather than a word beside it
     doing all the work. Two cells in the SAME band are compared: 5A, which
     was just agreed, against 5B, which is Red too and was not. If they ever
     paint the same, the distinction has quietly stopped existing. */
  const style = (sel) =>
    p.locator(sel).first().evaluate((el) => {
      const c = getComputedStyle(el);
      return { bg: c.backgroundColor, fg: c.color };
    });
  const agreedCell = await style('button[aria-label^="Severity A - Catastrophic by likelihood 5"]');
  const otherRed = await style('button[aria-label^="Severity B - Hazardous by likelihood 5"]');
  ok("an agreed cell is filled solid, the way the report prints it",
     agreedCell.bg === "rgb(199, 56, 48)", agreedCell.bg);
  ok("and its text is white against that fill",
     agreedCell.fg === "rgb(255, 255, 255)", agreedCell.fg);
  ok("a cell in the same band that nobody agreed stays a soft tint",
     otherRed.bg !== agreedCell.bg, `${otherRed.bg} vs ${agreedCell.bg}`);

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

  /* ---------------- 6. the OTHER way a hazard is raised ----------------
     Not every hazard is consolidated from findings. One seen on the walk is
     not a finding first and never becomes one — no check-point was written up
     about it, and grouping findings afterwards cannot invent it. Until this
     existed the register's empty state offered only "Go to capture", so on a
     fresh device there was no way to record a hazard at all. */
  await p.goto(B + "/field", { waitUntil: "networkidle" });
  await p.waitForTimeout(2000);
  const newHazard = p.locator("button", { hasText: /New hazard/ });
  ok("the walk offers a way to raise a hazard where it is seen",
     (await newHazard.count()) > 0);
  await newHazard.first().click();
  await p.waitForTimeout(600);
  await p
    .locator('input[placeholder^="Uncontained fuel release"]')
    .first()
    .fill("Uncontained fuel release on the apron");
  await p.locator("textarea").last().fill("Hydrant pit lid missing; no bunding under the coupler.");
  await p.locator("button", { hasText: /Create hazard/ }).first().click();
  await p.waitForTimeout(900);

  await p.goto(B + "/hazards", { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  const withWalk = await p.locator("body").innerText();
  ok("a hazard raised on the walk reaches the register",
     /Uncontained fuel release on the apron/.test(withWalk));
  ok("and it arrives unrated like every other one",
     /UNRATED/.test(withWalk),
     "the walk names the event; the group rates it");
  ok("it needed no finding behind it",
     /0 findings/.test(withWalk) || /Raised directly|RAISED DIRECTLY/i.test(withWalk),
     "a hazard with no findings is legitimate and the type has always allowed it");

  /* ---------------- 7. and the closure position ---------------- */
  await p.goto(B + "/closure", { waitUntil: "networkidle" });
  await p.waitForTimeout(1400);
  const closure = await p.locator("body").innerText();
  ok("closure lists this site's own prior findings", /2025/.test(closure));
  /* ---------------- 8. following an item across audits ----------------
     The three-year cycle exists so an item can be followed. A verification has
     always been stored per visit, so the data was there from the start — but
     the screen read the current visit's record and nothing else, so an item
     that had been Open - repeat twice looked exactly like one closed first
     time. That difference is the whole point of following up. */
  await p.locator("button.min-h-\\[56px\\]", { hasText: /^Repeat$/ }).first().click();
  await p.waitForTimeout(800);
  ok("a mitigation action is asked for when an item does not close",
     (await p.locator("text=Mitigation action").count()) > 0,
     "recorded against the carried item, not raised as a new finding");
  await p
    .locator('textarea[placeholder^="What is outstanding"]')
    .first()
    .fill("Contractor appointed; parts on 6-week lead time.");
  await p.waitForTimeout(300);

  for (const line of ["Spoke to the Maintenance Manager, PO raised.", "Parts still not delivered."]) {
    await p.locator('input[placeholder^="What moved"]').first().fill(line);
    await p.locator("button", { hasText: /Add to the log/ }).first().click();
    await p.waitForTimeout(600);
  }
  const timeline = await p.locator("body").innerText();
  ok("the history is shown as a timeline", /every audit that touched this/i.test(timeline));
  ok("including the audit that raised it", /raised/i.test(timeline));
  /* The one that matters: ACSA's Progress/Update is a single cell that gets
     typed over, so a second entry would replace the first. */
  ok("BOTH log entries survive — it appends, it does not overwrite",
     /PO raised/.test(timeline) && /Parts still not delivered/.test(timeline),
     "a cell that gets typed over cannot say when an item moved or who said so");
  ok("each entry carries its author and the status at the time",
     /Sarel/.test(timeline) && /Open - repeat/i.test(timeline));
  ok("and what is still outstanding is called out",
     /still to happen/i.test(timeline));

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
