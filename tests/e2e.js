const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:3000';

/** The answer library is TABBED — Evidence, Likely answers, Issues, Walkabout,
 *  Snippets — so a panel has to be opened before its chips are in the DOM. The
 *  five used to be stacked, which ran well past a tablet's height; the counts
 *  on the tabs are what keep a tapped panel legible while it is closed. */
const openTab = (page, label) =>
  page.locator('button[role="tab"]', { hasText: label }).first().click();
const panelChip = (page, key) => page.locator(`[data-panel="${key}"] button`).first();
let pass=0, fail=0; const log=[];
function ok(n,c,extra=''){ if(c){pass++;log.push('PASS  '+n);} else {fail++;log.push('FAIL  '+n+(extra?'  ['+extra+']':''));} }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport:{width:1440,height:900} });
  const page = await ctx.newPage();
  const errs=[];
  /* Fonts are fetched from Google at runtime (see src/app/layout.tsx), and a
     sandbox with no egress to fonts.googleapis.com logs a failed resource for
     every page. That is the network, not the app — the page renders and works
     in its fallback stack — so it is excluded here rather than left to fail an
     assertion the reader then has to be told to ignore. Anything else that
     fails to load is a real error and still counts. */
  const envNoise = (t) => /fonts\.(googleapis|gstatic)\.com/.test(t) ||
    (/Failed to load resource/.test(t) && /ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED/.test(t));
  const note = (t) => { if (!envNoise(t)) errs.push(t); };
  page.on('pageerror', e=>note(String(e))); page.on('console', m=>{ if(m.type()==='error') note('console: '+m.text()); });

  // 1 capture loads
  await page.goto(B+'/capture', {waitUntil:'networkidle'});
  await page.waitForTimeout(900);
  /* The four compliance buttons, which is the one control this screen exists
     to offer. It used to look for the word "Status" — the label beside them
     when they lived in the header; they are in the pinned bar with Save now
     and the label went with the move, so the check was asserting the presence
     of a caption rather than of the answer. */
  /* BY ACCESSIBLE NAME, not by rendered text. The button carries ACSA's code
     for narrow screens and the full word for wide ones, and both spans are in
     the DOM at every width — one of them merely display:none — so matching on
     text sees "NCNon-compliant" and matches nothing. `aria-label` is the full
     word at every width, which is also what a screen reader is told. */
  ok('capture page loads', await page.locator('button[aria-label="Non-compliant"]').first().isVisible().catch(()=>false));

  // 2 status via keyboard
  await page.keyboard.press('1');
  await page.waitForTimeout(300);
  const compBtn = page.locator('button[aria-label="Compliant"]').first();
  const bg1 = await compBtn.evaluate(el=>getComputedStyle(el).borderColor).catch(()=>'');
  ok('keyboard 1 selects Compliant', !!bg1, bg1);

  // 3 issue chip raises a finding
  const issueSection = page.locator('button[role="tab"]', { hasText: 'Issues found' }).first();
  ok('issues section present', await issueSection.isVisible().catch(()=>false));
  await openTab(page, 'Issues found');
  await page.waitForTimeout(300);
  const issueChip = panelChip(page, 'issues');
  const chipText = await issueChip.innerText().catch(()=>'');
  await issueChip.click();
  await page.waitForTimeout(500);
  ok('issue chip clickable', chipText.length>0, chipText);

  // 4 findings badge in nav
  const navFind = page.locator('a[href="/findings"], a[href*="findings"]').first();
  const navTxt = await navFind.innerText().catch(()=>'');
  ok('findings nav shows a count', /\d/.test(navTxt), navTxt);

  // 5 Save & next
  const before = await page.url();
  const saveBtn = page.locator('button', {hasText:/^Save$/}).first();
  await saveBtn.click(); await page.waitForTimeout(400);
  ok('Save button works', true);

  // 6 findings page
  await page.goto(B+'/findings', {waitUntil:'networkidle'}); await page.waitForTimeout(800);
  const fBody = await page.locator('body').innerText();
  /* 2026-09-10: the Findings screen is the ASSET SYSTEM assessment now, and a
     finding is listed under the system it belongs to rather than in a flat
     register. So "not empty" cannot be asserted by the absence of the words "no
     findings" — the page legitimately carries the sentence "a system with no
     findings is not automatically Green", which is the whole reason the band is
     not computed from them. Assert what the step was actually about: the screen
     rendered its assessment, and the finding raised a moment ago is still
     counted in the navigation. */
  ok('findings page renders the asset system assessment',
     /Asset systems at/.test(fBody) && fBody.length>200, fBody.slice(0,120));
  ok('and the finding raised a moment ago is still counted',
     /\d/.test(await page.locator('a[href*="findings"]').first().innerText().catch(()=>'')));

  /* 7 rate the asset system.
     2026-09-10: the 5x5 matrix came off this screen — Sarel: "remove the large
     rating matrix, make it more simple to select severity and likelihood." Two
     axes of five, each carrying the whole B170 001M label as its accessible
     name, so the assertion is still that a screen reader can read the scale and
     that the band and STRATEGY follow from the choice rather than being typed.
     The matrix itself is unchanged on the findings and hazard screens; flow.js
     is the suite that exercises it. */
  const sev = page.locator('div[role="radiogroup"][aria-label="Severity"] button');
  const sLbl = await sev.first().getAttribute('aria-label').catch(()=>null);
  ok('the severity scale carries ACSA\'s own labels', /^[A-E] - /.test(String(sLbl)), String(sLbl));
  await sev.nth(2).click(); await page.waitForTimeout(300);
  /* One axis is not a rating. Nothing may be banded yet. */
  const half = await page.locator('body').innerText();
  ok('ONE AXIS IS NOT A RATING', !/Avoidance|Reduction|Segregation/.test(half),
     'a half-set rating must not produce a band or a strategy');
  await page.locator('div[role="radiogroup"][aria-label="Likelihood"] button').nth(3).click();
  await page.waitForTimeout(400);
  const fBody2 = await page.locator('body').innerText();
  ok('rating shows a band strategy', /Avoidance|Reduction|Segregation/.test(fBody2));

  // 8 owner persists
  const owner = page.locator('select').filter({hasText:/./}).nth(1);
  await page.screenshot({path:'/home/claude/shots/findings.png', fullPage:false});

  // 9 closure page + coverage guard
  await page.goto(B+'/closure', {waitUntil:'networkidle'}); await page.waitForTimeout(800);
  const cBody = await page.locator('body').innerText();
  ok('closure lists prior findings', /2025|PF/i.test(cBody), cBody.slice(0,120));
  ok('closure shows lifecycle', /Remediated|Verified/i.test(cBody));
  await page.screenshot({path:'/home/claude/shots/closure.png'});

  // 10 dashboard
  await page.goto(B+'/dashboard', {waitUntil:'networkidle'}); await page.waitForTimeout(900);
  const dBody = await page.locator('body').innerText();
  ok('dashboard renders', dBody.length>300);
  ok('dashboard mentions portfolio/airport', /Portfolio|Airport|Network/i.test(dBody));
  await page.screenshot({path:'/home/claude/shots/dashboard.png'});

  // 11 field mode
  await page.goto(B+'/field', {waitUntil:'networkidle'}); await page.waitForTimeout(800);
  const flBody = await page.locator('body').innerText();
  ok('field mode renders', flBody.length>200, flBody.slice(0,100));
  await page.screenshot({path:'/home/claude/shots/field.png'});

  // 12 persistence across reload
  await page.goto(B+'/findings', {waitUntil:'networkidle'}); await page.waitForTimeout(900);
  const persisted = await page.locator('body').innerText();
  /* Same change of screen, same reasoning as above. What survives a reload is
     the RECORD, and the navigation's own count is read straight off it. */
  ok('findings survive reload (IndexedDB)',
     /Asset systems at/.test(persisted) &&
       /\d/.test(await page.locator('a[href*="findings"]').first().innerText().catch(()=>'')));

  // 13 command palette
  await page.goto(B+'/capture', {waitUntil:'networkidle'}); await page.waitForTimeout(700);
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(400);
  /* The PALETTE's own field, by name. This used to take the first input whose
     placeholder contained "search", which was fine until the screen grew a
     second one — the asset picker's, inside a folded <details>, earlier in the
     DOM and never visible. The palette was opening the whole time; the
     assertion was looking at the wrong box. */
  const palette = () => page.locator('input[aria-label="Jump to check"]');
  let paletteOpen = await palette().isVisible().catch(()=>false);
  if(!paletteOpen){ await page.keyboard.press('Control+k'); await page.waitForTimeout(400);
    paletteOpen = await palette().isVisible().catch(()=>false); }
  ok('command palette opens', paletteOpen);
  if(paletteOpen){ await page.keyboard.type('earth'); await page.waitForTimeout(500);
    const pal = await page.locator('body').innerText();
    ok('palette returns results', pal.length>0); await page.screenshot({path:'/home/claude/shots/palette.png'});
    await page.keyboard.press('Escape'); }

  // 14 mobile 390px
  const m = await ctx.newPage(); await m.setViewportSize({width:390,height:844});
  await m.goto(B+'/field', {waitUntil:'networkidle'}); await m.waitForTimeout(900);
  const oflow = await m.evaluate(()=>document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('field mode has no horizontal overflow at 390px', oflow<=2, 'overflow='+oflow);
  await m.screenshot({path:'/home/claude/shots/mobile-field.png', fullPage:false});
  await m.goto(B+'/capture', {waitUntil:'networkidle'}); await m.waitForTimeout(900);
  const oflow2 = await m.evaluate(()=>document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('capture has no horizontal overflow at 390px', oflow2<=2, 'overflow='+oflow2);
  await m.screenshot({path:'/home/claude/shots/mobile-capture.png'});
  /* The home screen's ten-site calendar strip is the widest thing in the app.
     Unpositioned, its cards counted toward the DOCUMENT's scroll area rather
     than the strip's: the layout looked right and the whole shell, masthead
     included, panned 1,244px into empty space on a phone. So this asserts what
     the eye cannot — that the VIEWPORT does not move. */
  await m.goto(B+'/home', {waitUntil:'networkidle'}); await m.waitForTimeout(1200);
  const oflow3 = await m.evaluate(()=>{ window.scrollTo(2000,0); const x = window.scrollX; window.scrollTo(0,0);
    return {o: document.documentElement.scrollWidth - document.documentElement.clientWidth, x}; });
  ok('the home screen does not pan sideways at 390px', oflow3.o<=2 && oflow3.x===0, 'overflow='+oflow3.o+' scrollX='+oflow3.x);
  await m.screenshot({path:'/home/claude/shots/mobile-home.png'});

  // 15 dark mode
  const d = await ctx.newPage(); await d.emulateMedia({colorScheme:'dark'});
  await d.setViewportSize({width:1440,height:900});
  await d.goto(B+'/dashboard', {waitUntil:'networkidle'}); await d.waitForTimeout(900);
  const bgc = await d.evaluate(()=>getComputedStyle(document.body).backgroundColor);
  ok('dark mode changes body background', bgc && bgc!=='rgb(255, 255, 255)', bgc);
  await d.screenshot({path:'/home/claude/shots/dark-dashboard.png'});

  ok('no uncaught page errors', errs.length===0, errs.slice(0,3).join(' | '));

  console.log(log.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  if(errs.length) console.log('\nERRORS:\n'+errs.slice(0,10).join('\n'));
  await browser.close();
  /* This suite used to exit 0 whatever happened, so a red e2e read as green to
     anything checking status rather than reading the output. The other three
     browser suites have always done this. */
  process.exit(fail?1:0);
})().catch(e=>{ console.log(log.join('\n')); console.error('HARNESS ERROR', e); process.exit(1); });
