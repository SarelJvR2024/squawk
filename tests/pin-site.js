/* Pin the site a browser suite drives, instead of inheriting the default.
 *
 *  Six suites hardcoded King Shaka's ids, counts and filenames and then trusted
 *  the app to open there. On 17 September 2026 the programme's starting entity
 *  moved to O.R. Tambo — King Shaka's audit had slipped to December and the app
 *  was opening on an audit that was not happening — and all six went red at
 *  once: an export named FAOR_..., a blob path of FAOR/2026-09/ORTIA-ELE-001,
 *  a preflight reading "ORTIA Sep 2026", 33 priors where 23 were expected.
 *
 *  None of that was a defect. Every one of them was a suite asserting the
 *  DEFAULT rather than saying which site it meant, so a legitimate calendar
 *  change broke the test suite and nothing else.
 *
 *  So: say it. A suite that cares which site it is on picks one here, and the
 *  next time the programme moves, only the programme moves. persite.js is the
 *  one suite that must NOT use this — proving each site shows its own numbers
 *  is its whole job.
 *
 *  Call it once per page, before the first assertion. It is idempotent: a page
 *  already on that site is left alone rather than re-selected, because the
 *  re-render costs a second and buys nothing. */
module.exports = async function pinSite(page, base, code = "FALE") {
  await page.goto(base + "/capture", { waitUntil: "networkidle" });
  const sel = page.locator('select[aria-label="Entity"]').first();
  /* ATTACHED, not visible, and forced. At phone width the picker is deliberately
     hidden — preflight.js drives a 390px viewport — and waiting for it to be
     visible there times out on a control that is present and perfectly
     settable. The site is state, not a click target. */
  await sel.waitFor({ state: "attached", timeout: 15000 });
  if ((await sel.inputValue()) !== code) {
    await sel.selectOption(code, { force: true });
    /* The store writes through to IndexedDB and every screen re-reads it. */
    await page.waitForTimeout(1400);
  }
  return page;
};
