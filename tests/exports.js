const { chromium } = require("playwright");
const fs = require("fs");
const B = process.env.BASE || "http://localhost:3000";

/** The answer library is TABBED — Evidence, Likely answers, Issues, Walkabout,
 *  Snippets — so a panel has to be opened before its chips are in the DOM. The
 *  five used to be stacked, which ran well past a tablet's height; the counts
 *  on the tabs are what keep a tapped panel legible while it is closed. */
const openTab = (page, label) =>
  page.locator('button[role="tab"]', { hasText: label }).first().click();

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
const panelChip = (page, key) => page.locator(`[data-panel="${key}"] button`).first();
/* A real 1x1 JPEG — small enough to inline, real enough to decode. */
const PIXEL_JPEG =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
let pass = 0,
  fail = 0;
const log = [];
const ok = (n, c, x = "") => {
  c ? (pass++, log.push("PASS  " + n)) : (fail++, log.push("FAIL  " + n + (x ? "  [" + x + "]" : "")));
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));

  // --- capture something real: a status, evidence, an issue, an observation ---
  await p.goto(B + "/capture", { waitUntil: "networkidle" });
  await p.waitForTimeout(2200);
  await p.keyboard.press("2"); // Non-compliant
  await p.waitForTimeout(300);
  await openTab(p, "Evidence to request");
  await panelChip(p, "evidence").click();
  await p.waitForTimeout(300);
  await openTab(p, "Issues found");
  await panelChip(p, "issues").click();
  await p.waitForTimeout(500);
  /* The OBSERVATION field by its placeholder, not "the first textarea".
     The check screen now carries a collapsed treatment block per raised
     finding, which puts a hidden textarea earlier in the DOM — and a test that
     says "the first one" was always going to break the first time the page
     grew a field above it. */
  await p
    .locator('textarea[placeholder^="Composed from your taps"]')
    .first()
    .fill('Register produced; three of eleven entries unsigned & "undated".');
  await p.waitForTimeout(300);
  /* A captioned photograph, so the Photographs sheet has something real in it
     and the Findings sheet has a caption to carry across. */
  await p.locator('input[type=file][accept="image/*"]').first().setInputFiles({
    name: "register.jpg", mimeType: "image/jpeg", buffer: Buffer.from(PIXEL_JPEG, "base64"),
  });
  await p.waitForTimeout(1600);
  await p.locator('input[aria-label^="Caption for"]').first()
    .fill("Signature column of the register, three rows blank");
  await p.waitForTimeout(300);
  /* WHICH asset. The caption says what is wrong; these say what it is wrong
     with, which is the half a maintenance planner needs. Optional on screen,
     so this proves they survive to the workbook when someone does fill them. */
  await p.locator('input[aria-label^="Asset name for"]').first()
    .fill("MV Switchboard 3B");
  await p.locator('input[aria-label^="Asset number or reference for"]').first()
    .fill("SW-3B-011");
  await p.waitForTimeout(600);
  await p.locator("button", { hasText: /^Save$/ }).first().click();
  await p.waitForTimeout(700);

  // agree a rating so the findings sheet has an agreed row AND a suggested one
  await p.goto(B + "/findings", { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  await p.locator("button[aria-label*=' by ']").nth(12).click();
  await p.waitForTimeout(400);
  await p
    .locator('textarea[placeholder^="What must happen"]')
    .first()
    .fill("Re-issue the register with every entry signed and dated.");
  await p.waitForTimeout(400);

  /* --- a hazard, built from that finding ---
     Raised directly rather than through consolidation: this suite runs without
     a model key, and the point being checked is the SHEET, not the grouping. */
  await p.goto(B + "/hazards", { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  await p.locator("button", { hasText: /^Raise one directly$/ }).first().click();
  await p.waitForTimeout(500);
  await p
    .locator('input[placeholder^="Uncontained fuel release"]')
    .first()
    .fill("Loss of traceability on an unsigned MV register");
  await p.waitForTimeout(300);
  const addFinding = p.locator("select").filter({ hasText: "add a finding" }).first();
  const addable = await addFinding.count();
  if (addable) {
    await addFinding.selectOption({ index: 1 });
    await p.waitForTimeout(400);
  }
  ok("a hazard can be raised with no model configured", addable > 0);
  await p.locator("button[aria-label*=' by ']").nth(6).click();
  await p.waitForTimeout(400);
  const hazardBody = await p.locator("body").innerText();
  /* These two used to assert the opposite, and correctly: erm.ts was a
     declared, deliberately empty instrument while ACSA had not supplied the
     scale. J050 001FW cl. 9.2.2 arrived, so the screen offers the real matrix
     now — consequence 5 to 1, priorities I/II/III — and the assertions follow
     the world rather than the other way round. */
  ok(
    "the hazard screen offers ACSA's ERM matrix, cited",
    /J050 001FW/i.test(hazardBody) && /cl\. 9\.2\.2/i.test(hazardBody),
    hazardBody.slice(0, 160).replace(/\n/g, " ")
  );
  ok(
    "and it is not a second opinion on B170 001M",
    (await p.locator("button[aria-label*='priority']").count()) === 25,
    "25 cells of a separate instrument, not a re-skin of the other one"
  );

  // --- export ---
  await p.goto(B + "/capture", { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  await openExport(p);
  const panel = await p.locator("body").innerText();
  ok("export panel opens and states the position", /check-points captured/.test(panel), panel.slice(0, 100).replace(/\n/g, " "));

  const dl = p.waitForEvent("download", { timeout: 60000 });
  await p.locator("button", { hasText: /^Excel$/ }).first().click();
  const download = await dl;
  const name = download.suggestedFilename();
  const path = "/home/claude/delivery/" + name;
  await download.saveAs(path);
  ok("workbook downloads", fs.existsSync(path) && fs.statSync(path).size > 5000, name + " " + (fs.existsSync(path) ? fs.statSync(path).size : 0));
  ok("filename carries entity, visit and date", /^FALE_2026-09_audit_\d{8}\.xlsx$/.test(name), name);

  // CSV too
  const dl2 = p.waitForEvent("download", { timeout: 60000 });
  await p.locator("button", { hasText: /^CSV$/ }).first().click();
  const d2 = await dl2;
  await d2.saveAs("/home/claude/delivery/" + d2.suggestedFilename());
  ok("csv downloads", /\.csv$/.test(d2.suggestedFilename()), d2.suggestedFilename());

  // findings-only workbook
  const dl3 = p.waitForEvent("download", { timeout: 60000 });
  await p.locator("button", { hasText: /^Excel$/ }).nth(2).click();
  const d3 = await dl3;
  await d3.saveAs("/home/claude/delivery/" + d3.suggestedFilename());
  ok("a single-sheet export downloads", /findings/.test(d3.suggestedFilename()), d3.suggestedFilename());

  // --- the photograph index, read out of the workbook itself ---
  const photoCard = p.locator("b", { hasText: /^Photographs$/ }).first().locator("xpath=../..");
  await photoCard.scrollIntoViewIfNeeded();
  const dl4 = p.waitForEvent("download", { timeout: 60000 });
  await photoCard.locator("button", { hasText: /^CSV$/ }).first().click();
  const d4 = await dl4;
  const photoCsv = "/home/claude/delivery/" + d4.suggestedFilename();
  await d4.saveAs(photoCsv);
  const csv = fs.readFileSync(photoCsv, "utf8");
  const head = csv.split("\n")[0];

  ok("the photographs sheet exports", /photographs/i.test(d4.suggestedFilename()), d4.suggestedFilename());
  ok(
    "its columns are the index, in order, and File comes first",
    /^\ufeff?File,Reference,Check,Discipline,Asset system,Area,Asset,Asset no\. \/ ref,Caption,Caption source,Taken,Attached/.test(head),
    head.slice(0, 160)
  );
  ok(
    "and it says where each image actually is",
    /Where the image is,Record copy/.test(head),
    head.slice(-80)
  );
  ok("the caption an auditor typed is in the row", /Signature column of the register/.test(csv),
     csv.split("\n")[1]?.slice(0, 140) || "");
  ok("and it is attributed to the auditor, not the assistant", /,Auditor,/.test(csv));
  ok("the asset the photograph is of reaches the workbook",
     /MV Switchboard 3B/.test(csv) && /SW-3B-011/.test(csv),
     csv.split("\n")[1]?.slice(0, 200) || "");
  ok("the check reference is this site's portal id", /,KSIA-[A-Z]{3}-\d{3},/.test(csv),
     csv.split("\n")[1]?.slice(0, 80) || "");

  // --- the images themselves, as files ---
  const dlz = p.waitForEvent("download", { timeout: 60000 });
  await p.locator("button", { hasText: /^Download images$/ }).first().click();
  const dz = await dlz;
  const zipPath = "/home/claude/delivery/" + dz.suggestedFilename();
  await dz.saveAs(zipPath);
  ok("the images download as a zip", /photographs.*\.zip$/.test(dz.suggestedFilename()),
     dz.suggestedFilename());

  /* Read the zip's central directory rather than trusting the filename. */
  const zbuf = fs.readFileSync(zipPath);
  const names = [];
  for (let i = 0; i < zbuf.length - 4; i++) {
    if (zbuf.readUInt32LE(i) === 0x02014b50) {
      const n = zbuf.readUInt16LE(i + 28);
      names.push(zbuf.subarray(i + 46, i + 46 + n).toString("utf8"));
    }
  }
  ok("it contains the photograph, named the way the workbook refers to it",
     names.some((n) => /^photographs\/KSIA-[A-Z]{3}-\d{3}_P01\.jpg$/.test(n)), names.join(" | "));
  ok("and a manifest so the zip reads on its own",
     names.includes("photographs/MANIFEST.csv"), names.join(" | "));

  /* The cross-reference: the name in the workbook is the name in the zip. */
  const inZip = names.find((n) => n.endsWith(".jpg"))?.replace("photographs/", "");
  ok("the workbook's File column matches the file in the zip exactly",
     !!inZip && csv.includes(inZip), `${inZip} not found in the Photographs sheet`);

  /* --- the hazards sheet, read out of the workbook itself --- */
  const hazCard = p.locator("b", { hasText: /^Hazards$/ }).first().locator("xpath=../..");
  await hazCard.scrollIntoViewIfNeeded();
  const dl5 = p.waitForEvent("download", { timeout: 60000 });
  await hazCard.locator("button", { hasText: /^CSV$/ }).first().click();
  const d5 = await dl5;
  const hazCsv = "/home/claude/delivery/" + d5.suggestedFilename();
  await d5.saveAs(hazCsv);
  const hcsv = fs.readFileSync(hazCsv, "utf8");
  const hhead = hcsv.split("\n")[0];

  ok("the hazards sheet exports", /hazards/i.test(d5.suggestedFilename()), d5.suggestedFilename());
  ok(
    "it carries BOTH rating instruments, each by its own axis name",
    /Severity \(B170 001M\)/.test(hhead) &&
      /Likelihood \(B170 001M\)/.test(hhead) &&
      /* IMPACT for the ERM axis, decided 9 September 2026. The property is
         unchanged — two instruments, two axis names, neither borrowing the
         other's word. "Consequence" was cl. 9.2.2's own term and accurate, but
         it did not tell the two instruments apart at a glance, which is the
         job this name has to do in a workbook somebody reads a year later. */
      /Impact \(ACSA ERM\)/.test(hhead) &&
      !/Consequence \(ACSA ERM\)/.test(hhead) &&
      /Likelihood \(ACSA ERM\)/.test(hhead),
    "B170 has SEVERITY and ERM has IMPACT — they run in opposite " +
      "directions and are not the same axis: " + hhead.slice(0, 200)
  );
  ok(
    "and the ERM columns carry what the rating is FOR",
    /ERM priority/.test(hhead) &&
      /ERM tolerance/.test(hhead) &&
      /Combined Assurance Coverage Plan \(cl\. 9\.1\.2\)/.test(hhead),
    "cl. 9.1.2 is why the second rating exists at all"
  );
  ok(
    "and a rating-state column for each, so neither reads as agreed by default",
    /B170 001M rating state/.test(hhead) && /ERM rating state/.test(hhead)
  );
  ok("the event a person typed is in the row", /Loss of traceability on an unsigned MV register/.test(hcsv),
     hcsv.split("\n")[1]?.slice(0, 140) || "");
  ok(
    "the agreed B170 001M rating reached the sheet",
    /Agreed by the audit team/.test(hcsv)
  );
  /* The hazard in this run was rated on B170 001M and never on ERM, so the
     ERM columns are empty — and they must say WHICH kind of empty. "Not rated
     on ERM" and a blank cell read very differently to somebody holding the
     workbook, and neither means a rating of zero. */
  ok(
    "an ERM rating nobody agreed reads as not rated, not as blank",
    /Not rated on ERM/.test(hcsv),
    hcsv.split("\n")[1]?.slice(0, 220) || ""
  );
  /* The cover sheet's own wording is asserted in erm-matrix.test.mjs, which
     reads exports.ts directly — cheaper than pulling a second workbook here,
     and it fails for the same reason if the explanation ever goes. */
  ok("the findings behind it are named", /F-[A-Z0-9]{5}/.test(hcsv), hcsv.split("\n")[1]?.slice(0, 80) || "");
  ok("and its photographs are indexed the same way the findings sheet indexes them",
     /Photograph files/.test(hhead) && /Photograph captions/.test(hhead));

  /* --- and the reverse cross-reference, off the findings sheet --- */
  const findCard = p.locator("b", { hasText: /^Findings$/ }).first().locator("xpath=../..");
  await findCard.scrollIntoViewIfNeeded();
  const dl6 = p.waitForEvent("download", { timeout: 60000 });
  await findCard.locator("button", { hasText: /^CSV$/ }).first().click();
  const d6 = await dl6;
  const findCsv = "/home/claude/delivery/" + d6.suggestedFilename();
  await d6.saveAs(findCsv);
  const fcsv = fs.readFileSync(findCsv, "utf8");
  ok(
    "the findings sheet says where each finding ended up",
    /Consolidated into/.test(fcsv.split("\n")[0]),
    fcsv.split("\n")[0].slice(-120)
  );
  ok(
    "a finding in a hazard names it, and one in none says so",
    /HZ-[A-Z0-9]{5}/.test(fcsv) || /Not grouped/.test(fcsv),
    fcsv.split("\n")[1]?.slice(0, 160) || ""
  );

  ok("no page errors during export", errs.length === 0, errs[0] || "");

  // --- ACSA role must not see the export control ---
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  /* The role is a pill showing the CURRENT role that opens the switch, not two
     buttons side by side — the role is state, and state a menu hides is state
     an auditor discovers by finding half the app disabled. */
  await p.locator('button[aria-label^="Viewing as"]').first().click();
  await p.waitForTimeout(400);
  await p.locator('[role="menuitem"]', { hasText: "Read-only" }).first().click();
  await p.waitForTimeout(900);
  /* Opened, and counted INSIDE the menu. Counting a hidden control would read
     zero whatever the role is, which is a green assertion that proves
     nothing. */
  await p.locator("button", { hasText: /^More$/ }).first().click();
  await p.waitForTimeout(400);
  const acsa = await p.locator('[role="menuitem"]', { hasText: "Export the workbook" }).count();
  ok("ACSA read-only role has no export control", acsa === 0, "count=" + acsa);
  const shortcuts = await p.locator('[role="menuitem"]', { hasText: "Keyboard shortcuts" }).count();
  ok("but the menu is still there and still says what the keys do", shortcuts === 1,
     "an empty menu would read as a broken one");

  console.log(log.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  console.log("SAVED:" + path);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log(log.join("\n"));
  console.error("HARNESS", e.message);
  process.exit(1);
});
