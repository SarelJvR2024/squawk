const { chromium } = require("playwright");
const fs = require("fs");
const B = process.env.BASE || "http://localhost:3000";
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
