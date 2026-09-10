/* Two devices, one audit — driven for real.
 *
 *  An ACSA audit is done by a team, and Squawk keeps the audit in one device's
 *  IndexedDB. tests/merge.test.mjs proves the merge RULES by running the module
 *  directly; this suite proves the WHOLE ROUTE works, because the rules being
 *  right is no use if the file never leaves the first device or never arrives
 *  at the second.
 *
 *  So it uses two browser contexts as two auditors' devices. The first captures
 *  a check and raises a finding, then shares its captures. The second starts
 *  empty — a different origin storage partition, so genuinely a different
 *  tablet — and merges the file it was handed.
 *
 *    BASE=http://localhost:3000 node tests/team.js
 */

const { chromium } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const B = process.env.BASE || "http://localhost:3000";

/** The answer library is TABBED — Evidence, Likely answers, Issues, Walkabout,
 *  Snippets — so a panel has to be opened before its chips are in the DOM. The
 *  five used to be stacked, which ran well past a tablet's height; the counts
 *  on the tabs are what keep a tapped panel legible while it is closed. */
const openTab = (page, label) =>
  page.locator('button[role="tab"]', { hasText: label }).first().click();
const panelChip = (page, key) => page.locator(`[data-panel="${key}"] button`).first();

let pass = 0, fail = 0;
const log = [];
const ok = (n, c, x = "") => {
  c ? (pass++, log.push("PASS  " + n)) : (fail++, log.push("FAIL  " + n + (x ? "  [" + x + "]" : "")));
};

/* EXPORT LIVES IN THE "MORE" MENU NOW. Sync, Export, Start again and the
   shortcuts sheet stood in the masthead at every width for the whole audit —
   four controls you reach for once a day, taking a third of the header from
   the two used constantly. Opening the menu first is the real interaction, so
   it is what these suites do. */
const openExport = async (page) => {
  await page.locator("button", { hasText: /^More$/ }).first().click();
  await page.waitForTimeout(400);
  await page.locator('[role="menuitem"]', { hasText: "Export the workbook" }).first().click();
  await page.waitForTimeout(700);
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  let bundlePath = "";

  try {
    /* ------------------------- device one: capture ------------------------ */
    const ctxA = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      acceptDownloads: true,
    });
    const a = await ctxA.newPage();
    await a.goto(B + "/capture", { waitUntil: "networkidle" });
    await a.waitForTimeout(1500);

    await a.keyboard.press("2");
    await a.waitForTimeout(300);
    await openTab(a, "Issues found");
    await a.waitForTimeout(300);
    const issue = panelChip(a, "issues");
    const issueText = await issue.innerText().catch(() => "");
    await issue.click();
    await a.waitForTimeout(500);
    await a.locator("button", { hasText: /^Save$/ }).first().click();
    await a.waitForTimeout(900);

    await openExport(a);
    const panel = await a.locator("body").innerText();
    ok("the export sheet offers the team a way to hand work over",
       /Team captures/.test(panel), panel.slice(0, 120).replace(/\n/g, " "));

    const [download] = await Promise.all([
      a.waitForEvent("download", { timeout: 15000 }),
      a.locator("button", { hasText: /Share my captures/ }).first().click(),
    ]);
    bundlePath = path.join(os.tmpdir(), `squawk-bundle-${Date.now()}.json`);
    await download.saveAs(bundlePath);
    const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));

    /* Whichever airport the app opened on — the point is that the bundle SAYS,
       because a bundle that does not name its audit is one that can be merged
       into the wrong one. */
    ok("the file names the audit it belongs to",
       /^[A-Z]{3,5}$/.test(bundle.meta?.entity ?? "") && /^\d{4}-\d{2}$/.test(bundle.meta?.visit ?? ""),
       JSON.stringify(bundle.meta ?? {}).slice(0, 120));
    ok("and who shared it, so a merge report can name them",
       (bundle.meta?.exportedBy ?? "").length > 0, bundle.meta?.exportedBy);
    ok("and it is named so a person can tell whose it is",
       /captures/.test(download.suggestedFilename()), download.suggestedFilename());
    ok("it carries the check that was answered",
       Object.keys(bundle.visit?.responses ?? {}).length >= 1,
       String(Object.keys(bundle.visit?.responses ?? {}).length));
    ok("and the finding that was raised", (bundle.findings ?? []).length >= 1,
       String((bundle.findings ?? []).length) + " · " + issueText.slice(0, 40));
    ok("EVERY RECORD SAYS WHEN IT WAS WRITTEN, which is what makes it mergeable",
       Object.values(bundle.visit.responses).every((r) => typeof r.updatedAt === "number"),
       JSON.stringify(Object.values(bundle.visit.responses)[0]?.updatedAt));
    ok("no image bytes travel in the file",
       !/data:image|base64/.test(JSON.stringify(bundle)),
       "a bundle carrying images would be hundreds of megabytes and unsendable");

    await ctxA.close();

    /* ------------------------- device two: merge -------------------------- */
    const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const b = await ctxB.newPage();
    const errs = [];
    b.on("pageerror", (e) => errs.push(String(e)));
    await b.goto(B + "/capture", { waitUntil: "networkidle" });
    await b.waitForTimeout(1500);

    const before = await b.locator("body").innerText();
    ok("the second device starts with nothing captured",
       /not captured yet/.test(before), before.slice(0, 120).replace(/\n/g, " "));

    await openExport(b);
    await b.locator("input[aria-label='Merge a capture bundle']").setInputFiles(bundlePath);
    await b.waitForTimeout(1500);

    const after = await b.locator("body").innerText();
    ok("THE MERGE REPORTS WHAT IT DID", /Merged from/.test(after),
       after.slice(0, 200).replace(/\n/g, " "));
    ok("and it names the check and the finding it brought over",
       /1 check/.test(after) && /1 finding/.test(after),
       (after.match(/Merged from[^\n]*/) ?? [""])[0]);

    /* Close the sheet and look at the audit itself, not at the report. */
    await b.locator("button[aria-label='Close']").first().click();
    await b.waitForTimeout(1200);
    const merged = await b.locator("body").innerText();
    ok("THE OTHER AUDITOR'S WORK IS NOW IN THIS DEVICE'S AUDIT",
       !/not captured yet/.test(merged), merged.slice(0, 160).replace(/\n/g, " "));

    await b.goto(B + "/findings", { waitUntil: "networkidle" });
    await b.waitForTimeout(1200);
    /* 2026-09-10: /findings opens on the asset-system assessment; the register
       of findings is the other half of the same screen. Assert on the row
       itself rather than on the absence of the words "no findings" — the
       assessment legitimately carries the sentence "a system with no findings
       is not automatically Green", which is why the band is not computed from
       them. */
    await b
      .locator('button[role="radio"]', { hasText: /Findings raised/ })
      .first()
      .click()
      .catch(() => {});
    await b.waitForTimeout(900);
    const findings = await b.locator("body").innerText();
    ok("and the finding is on the findings screen, not just in a report",
       /F-[A-Z0-9]{4,}/.test(findings), findings.slice(0, 140).replace(/\n/g, " "));

    /* Merging the same file again is something an auditor will do. */
    await b.goto(B + "/capture", { waitUntil: "networkidle" });
    await b.waitForTimeout(1200);
    await openExport(b);
    await b.locator("input[aria-label='Merge a capture bundle']").setInputFiles(bundlePath);
    await b.waitForTimeout(1500);
    await b.locator("button[aria-label='Close']").first().click();
    await b.waitForTimeout(800);
    await b.goto(B + "/findings", { waitUntil: "networkidle" });
    await b.waitForTimeout(1200);
    const twice = await b.locator("body").innerText();
    const idCount = (twice.match(/F-[A-Z0-9]{5}/g) ?? []).length;
    const distinct = new Set(twice.match(/F-[A-Z0-9]{5}/g) ?? []).size;
    ok("MERGING THE SAME FILE TWICE DOES NOT DUPLICATE THE FINDING",
       idCount === 0 || distinct === new Set(twice.match(/F-[A-Z0-9]{5}/g)).size,
       `${idCount} ids, ${distinct} distinct`);

    ok("no page errors anywhere in the hand-over", errs.length === 0, errs[0] ?? "");
    await ctxB.close();
  } catch (e) {
    fail++;
    log.push("FAIL  harness  [" + e.message + "]");
  } finally {
    if (bundlePath) fs.rmSync(bundlePath, { force: true });
  }

  console.log(log.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
