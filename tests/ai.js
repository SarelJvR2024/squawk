const B0 = process.env.BASE_NO_KEY || 'http://localhost:3000';
const B1 = process.env.BASE_WITH_KEY || B0;
const { chromium } = require('playwright');
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
  ok('offline composer is offered with no model', /Compose from taps/.test(t));
  ok('AI buttons are hidden with no model', !/Draft with AI|Explain this check/.test(t));
  // the composer must work with nothing tapped -> a clear message, not a crash
  await p.locator('button',{hasText:'Compose from taps'}).first().click(); await p.waitForTimeout(700);
  const t0=await p.locator('body').innerText();
  ok('composer with nothing tapped says so', /Nothing tapped/.test(t0), t0.slice(0,80).replace(/\n/g,' '));
  // now tap a status + evidence + issue, then compose
  await p.keyboard.press('2'); await p.waitForTimeout(400);
  await p.locator('text=Evidence to request').first().locator('xpath=../..').locator('button').first().click(); await p.waitForTimeout(400);
  await p.locator('text=Issues found').first().locator('xpath=../..').locator('button').first().click(); await p.waitForTimeout(600);
  await p.locator('button',{hasText:'Compose from taps'}).first().click(); await p.waitForTimeout(700);
  const t1=await p.locator('body').innerText();
  ok('composer produces a draft from taps', /suggested wording/i.test(t1), t1.slice(0,80).replace(/\n/g,' '));
  ok('draft mentions the requested evidence', /Evidence requested/.test(t1));
  ok('draft is NOT written into the record until accepted',
     (await p.locator('textarea').first().inputValue()).indexOf('Evidence requested')===-1);
  await p.locator('button',{hasText:/^Use it$/}).first().click(); await p.waitForTimeout(600);
  const v=await p.locator('textarea').first().inputValue();
  ok('accepting the draft writes it to the record', /Evidence requested/.test(v), v.slice(0,60));
  await p.screenshot({path:'/home/claude/shots/ai-composer.png'});
  ok('no page errors in the composer path', errs.length===0, errs[0]||'');
  await p.context().close();
 }

 // ---- model configured (port 3103, placeholder key -> upstream 401) ----
 {
  const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(''+B1+'/capture',{waitUntil:'networkidle'}); await p.waitForTimeout(2500);
  const t=await p.locator('body').innerText();
  ok('AI buttons appear when a model is configured', /Draft with AI/.test(t) && /Explain this check/.test(t));
  // a failing model must surface an honest message and leave the record alone
  const before = await p.locator('textarea').first().inputValue();
  await p.locator('button',{hasText:'Draft with AI'}).first().click();
  let seen=''; for(let i=0;i<40;i++){ await p.waitForTimeout(150); const s=await p.locator('body').innerText(); if(/model service returned|unavailable/i.test(s)){seen=s;break;} }
  ok('a model failure is reported honestly', !!seen, 'no toast seen within 6s');
  ok('a model failure leaves the record untouched', (await p.locator('textarea').first().inputValue())===before);
  ok('a model failure does not throw', errs.length===0, errs[0]||'');
  // help panel should say a model is connected
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.locator('button[aria-label="Keyboard shortcuts"]').first().click(); await p.waitForTimeout(600);
  const h=await p.locator('body').innerText();
  ok('help panel states the AI position', /AI assistance/.test(h) && /model is connected/i.test(h));
  ok('help panel states that attachments never leave the device', /never leave the device/i.test(h));
  await p.screenshot({path:'/home/claude/shots/ai-help.png'});
  await p.context().close();
 }
 console.log(log.join('\n')); console.log(`\n${pass} passed, ${fail} failed`);
 await b.close(); process.exit(fail?1:0);
})().catch(e=>{console.log(log.join('\n'));console.error('HARNESS',e.message);process.exit(1)});
