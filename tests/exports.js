const { chromium } = require("playwright");
const fs = require("fs");
const B = process.env.BASE || "http://localhost:3000";
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
  await p
    .locator("text=Evidence to request")
    .first()
    .locator("xpath=../..")
    .locator("button")
    .first()
    .click();
  await p.waitForTimeout(300);
  await p
    .locator("text=Issues found")
    .first()
    .locator("xpath=../..")
    .locator("button")
    .first()
    .click();
  await p.waitForTimeout(500);
  await p.locator("textarea").first().fill('Register produced; three of eleven entries unsigned & "undated".');
  await p.waitForTimeout(300);
  /* A captioned photograph, so the Photographs sheet has something real in it
     and the Findings sheet has a caption to carry across. */
  await p.locator('input[type=file][accept="image/*"]').first().setInputFiles({
    name: "register.jpg", mimeType: "image/jpeg", buffer: Buffer.from(PIXEL_JPEG, "base64"),
  });
  await p.waitForTimeout(1600);
  await p.locator('input[aria-label^="Caption for"]').first()
    .fill("Signature column of the register, three rows blank");
  await p.waitForTimeout(600);
  await p.locator("button", { hasText: /^Save$/ }).first().click();
  await p.waitForTimeout(700);

  // agree a rating so the findings sheet has an agreed row AND a suggested one
  await p.goto(B + "/findings", { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  await p.locator("button[aria-label*=' by ']").nth(12).click();
  await p.waitForTimeout(400);
  await p.locator("textarea").first().fill("Re-issue the register with every entry signed and dated.");
  await p.waitForTimeout(400);

  // --- export ---
  await p.goto(B + "/capture", { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  await p.locator("button", { hasText: /^Export$/ }).first().click();
  await p.waitForTimeout(700);
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
    "its columns are the index, in order",
    /Photograph.*Check.*Discipline.*Asset system.*Area.*Caption.*Caption source.*Taken.*Attached/.test(head),
    head.slice(0, 160)
  );
  ok("the caption an auditor typed is in the row", /Signature column of the register/.test(csv),
     csv.split("\n")[1]?.slice(0, 140) || "");
  ok("and it is attributed to the auditor, not the assistant", /,Auditor,/.test(csv));
  ok("the check reference is this site's portal id", /,KSIA-[A-Z]{3}-\d{3},/.test(csv),
     csv.split("\n")[1]?.slice(0, 80) || "");

  ok("no page errors during export", errs.length === 0, errs[0] || "");

  // --- ACSA role must not see the export control ---
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  await p.locator("button", { hasText: /^ACSA$/ }).first().click();
  await p.waitForTimeout(900);
  const acsa = await p.locator("button", { hasText: /^Export$/ }).count();
  ok("ACSA read-only role has no export control", acsa === 0, "count=" + acsa);

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
