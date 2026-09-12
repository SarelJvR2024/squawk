const B0 = process.env.BASE_NO_KEY || 'http://localhost:3000';
const B1 = process.env.BASE_WITH_KEY || B0;
const { chromium } = require('playwright');

/** The answer library is TABBED — Evidence, Likely answers, Issues, Walkabout,
 *  Snippets — so a panel has to be opened before its chips are in the DOM. The
 *  five used to be stacked, which ran well past a tablet's height; the counts
 *  on the tabs are what keep a tapped panel legible while it is closed. */
const openTab = (page, label) =>
  page.locator('button[role="tab"]', { hasText: label }).first().click();
const panelChip = (page, key) => page.locator(`[data-panel="${key}"] button`).first();
let pass=0,fail=0; const log=[];
const ok=(n,c,x='')=>{c?(pass++,log.push('PASS  '+n)):(fail++,log.push('FAIL  '+n+(x?'  ['+x+']':'')))};
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

 // ---- no model configured (port 3102) ----
 {
  const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(''+B0+'/capture',{waitUntil:'networkidle'}); await p.waitForTimeout(2200);
  const t=await p.locator('body').innerText();
  /* UPDATED 2026-09-12: Compose, Draft and the mic moved into the observation
     box as icons, so the label is an aria-label and a title rather than body
     text. Counting the control is the assertion that survives that; reading
     the page's words was only ever a proxy for it. */
  ok('offline composer is offered with no model',
     (await p.locator('button[aria-label="Compose from taps"]').count()) === 1);
  ok('AI buttons are hidden with no model',
     (await p.locator('button[aria-label="Draft with AI"]').count()) === 0 &&
     !/Explain this check/.test(t));
  // the composer must work with nothing tapped -> a clear message, not a crash
  await p.locator('button[aria-label="Compose from taps"]').first().click(); await p.waitForTimeout(700);
  const t0=await p.locator('body').innerText();
  ok('composer with nothing tapped says so', /Nothing tapped/.test(t0), t0.slice(0,80).replace(/\n/g,' '));
  // now tap a status + evidence + issue, then compose
  await p.keyboard.press('2'); await p.waitForTimeout(400);
  await openTab(p, 'Evidence to request'); await panelChip(p, 'evidence').click(); await p.waitForTimeout(400);
  await openTab(p, 'Issues found'); await panelChip(p, 'issues').click(); await p.waitForTimeout(600);
  await p.locator('button[aria-label="Compose from taps"]').first().click(); await p.waitForTimeout(700);
  const t1=await p.locator('body').innerText();
  ok('composer produces a draft from taps', /suggested wording/i.test(t1), t1.slice(0,80).replace(/\n/g,' '));
  ok('draft mentions the requested evidence', /Evidence requested/.test(t1));
  /* THE OBSERVATION BOX BY NAME, not `textarea` and hope.
     Raising a finding from an issue chip renders the treatment block, whose
     "What must happen" field is a textarea earlier in the DOM — so `.first()`
     had been reading an empty box that was never the record, and the two
     assertions either side of this one were passing and failing for reasons
     that had nothing to do with the composer. */
  ok('draft is NOT written into the record until accepted',
     (await p.locator('textarea[aria-label="Observation"]').first().inputValue()).indexOf('Evidence requested')===-1);
  await p.locator('button',{hasText:/^Use it$/}).first().click(); await p.waitForTimeout(600);
  const v=await p.locator('textarea[aria-label="Observation"]').first().inputValue();
  ok('accepting the draft writes it to the record', /Evidence requested/.test(v), v.slice(0,60));
  await p.screenshot({path:'/home/claude/shots/ai-composer.png'});
  ok('no page errors in the composer path', errs.length===0, errs[0]||'');
  await p.context().close();
 }

 // ---- fully configured (BASE_WITH_KEY, placeholder keys -> upstream fails) ----
 {
  const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(''+B1+'/capture',{waitUntil:'networkidle'}); await p.waitForTimeout(2500);
  /* UPDATED 2026-09-10. "Draft with AI" is on the page; "Explain this check"
     is not, because the check screen became TABBED and the plain reading now
     lives under "In plain English". This assertion had been failing on main
     since that shipped — reading body text and expecting both strings is only
     right while everything is stacked. Open the tab, then assert. */
  /* Also an icon now, so it is counted rather than read out of the page. */
  const draftVisible = (await p.locator('button[aria-label="Draft with AI"]').count()) === 1;
  await openTab(p, 'In plain English'); await p.waitForTimeout(500);
  const t=await p.locator('body').innerText();
  ok('AI buttons appear when a model is configured', draftVisible && /Explain this check/.test(t));
  /* Back to the tab the composer lives on, so the click below finds it. */
  await openTab(p, 'ACSA requirement'); await p.waitForTimeout(400);
  // a failing model must surface an honest message and leave the record alone
  const before = await p.locator('textarea[aria-label="Observation"]').first().inputValue();
  await p.locator('button[aria-label="Draft with AI"]').first().click();
  let seen=''; for(let i=0;i<40;i++){ await p.waitForTimeout(150); const s=await p.locator('body').innerText(); if(/model service returned|unavailable/i.test(s)){seen=s;break;} }
  ok('a model failure is reported honestly', !!seen, 'no toast seen within 6s');
  ok('a model failure leaves the record untouched', (await p.locator('textarea[aria-label="Observation"]').first().inputValue())===before);
  ok('a model failure does not throw', errs.length===0, errs[0]||'');
  // help panel should say a model is connected
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  /* UPDATED 2026-09-10: Sync, Export, Reset and help were grouped under a
     labelled "More" menu, so the shortcuts control is a menu ITEM now and no
     longer a button in the header. Also red on main since that shipped. */
  await p.locator('button',{hasText:/^More$/}).first().click(); await p.waitForTimeout(400);
  await p.locator('button',{hasText:/Keyboard shortcuts/}).first().click(); await p.waitForTimeout(600);
  const h=await p.locator('body').innerText();
  ok('help panel states the AI position', /AI assistance/.test(h) && /model is connected/i.test(h));
  /* This used to assert "attachments never leave the device", which stopped
     being true when Transcribe was added: a voice note's audio does leave, on
     a tap. The panel now names all three egress paths instead, and the claim
     that survives is the narrower one that is still true — the MODEL is sent
     text only. */
  ok('help panel names every path that can send data off the device',
     /Three things can send data off this device/.test(h) &&
     /all three are off until someone turns them on/i.test(h));
  ok('help panel still says photographs and audio never reach the model',
     /Photographs are never sent to it, and audio never is either/i.test(h));
  ok('help panel offers the live-text switch and says where the audio goes',
     /Live text while recording/.test(h) && /speech service/i.test(h));
  const dictBox = p.locator('input[aria-label="Live text while recording"]').first();
  ok('live text is off until the auditor switches it on',
     (await dictBox.count()) === 1 && (await dictBox.isChecked()) === false);
  await p.screenshot({path:'/home/claude/shots/ai-help.png'});
  await p.context().close();
 }

 // ---- a real recording, on a fake microphone ----
 /* The transcribe and write-up controls hang off a voice note that exists, so
    the only way to see them is to make one. Chromium's fake capture device
    gives MediaRecorder a real stream to record, which is as close to an
    auditor pressing the button as this can get without a person and a mic. */
 {
  const fb = await chromium.launch({
    executablePath:'/opt/pw-browsers/chromium',
    args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'],
  });
  const ctx = await fb.newContext({viewport:{width:1440,height:900}, permissions:['microphone']});
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(''+B1+'/capture',{waitUntil:'networkidle'}); await p.waitForTimeout(2000);

  const before = await p.locator('audio').count();
  await p.locator('button[aria-label="Record a voice note"]').first().click();
  await p.waitForTimeout(400);
  const rec = await p.locator('body').innerText();
  /* UPDATED 2026-09-12: the mic moved into the observation box, where there is
     34px for it and no room for the word. It still says it is running — a red
     fill and the clock counting — and the control still announces itself as
     "Stop recording", which is what a screen reader and this assertion both
     go on. The labelled form elsewhere in the app keeps "Stop · 0:03". */
  ok('recording shows a running timer', /\d+:\d\d/.test(rec), rec.slice(0,60).replace(/\n/g,' '));
  ok('and the control says what tapping it does, even with no room for a label',
     (await p.locator('button[aria-label="Stop recording"]').count()) === 1);
  ok('live text is NOT running, because nobody switched it on',
     !/speech sent to the browser/i.test(rec));
  await p.waitForTimeout(1600);
  await p.locator('button[aria-label="Stop recording"]').first().click();
  await p.waitForTimeout(1500);

  ok('the note is kept and can be played back', (await p.locator('audio').count()) === before + 1);
  const after = await p.locator('body').innerText();
  ok('the note carries its real measured duration', /0:0[12]/.test(after), after.slice(0,120).replace(/\n/g,' '));
  ok('Transcribe is offered on the note', (await p.locator('button',{hasText:/^Transcribe$/}).count()) >= 1);
  ok('nothing is written up before there is a transcript',
     (await p.locator('button',{hasText:/Write it up/}).count()) === 0);
  ok('no suggested wording is claimed before anyone asked for one',
     !/Suggested wording/.test(after));
  ok('recording a note does not write to the observation',
     (await p.locator('textarea[aria-label="Observation"]').first().inputValue()).trim() === '');
  ok('no page errors while recording', errs.length===0, errs[0]||'');
  await p.screenshot({path:'/home/claude/shots/ai-voicenote.png'});
  await ctx.close(); await fb.close();
 }

 console.log(log.join('\n')); console.log(`\n${pass} passed, ${fail} failed`);
 await b.close(); process.exit(fail?1:0);
})().catch(e=>{console.log(log.join('\n'));console.error('HARNESS',e.message);process.exit(1)});
