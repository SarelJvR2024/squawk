const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:3000';
let pass=0, fail=0; const log=[];
const ok=(n,c,x='')=>{ c?(pass++,log.push('PASS  '+n)):(fail++,log.push('FAIL  '+n+(x?'  ['+x+']':''))); };

/* Walk the app at four sites of three different classes and prove the numbers
   on screen are that site's numbers.
 *
 *  King Shaka 324 with 15 open 2025 findings, O.R. Tambo 324 with 33, Bram
 *  Fischer 319 with none, Corporate Office 200 with none and no Civil work at
 *  all. Everything below is read off the rendered page rather than computed
 *  here, because the failure this guards against is a screen showing a count
 *  from the whole register while claiming to be at a site. */

const SITES = [
  { code:'FALE', short:'KSIA',  checks:324, prior:15, civil:true  },
  { code:'FAOR', short:'ORTIA', checks:324, prior:33, civil:true  },
  { code:'FABL', short:'BFIA',  checks:319, prior:0,  civil:true  },
  { code:'HO',   short:'CO',    checks:200, prior:0,  civil:false },
];

(async()=>{
 const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const ctx = await b.newContext({viewport:{width:1440,height:960}});
 const p = await ctx.newPage();
 const errs=[];
 p.on('pageerror', e=>errs.push(String(e)));
 p.on('console', m=>{ const t=m.text(); if(m.type()==='error' && !/fonts\.(googleapis|gstatic)\.com/.test(t) && !/Failed to load resource/.test(t)) errs.push('console: '+t); });

 await p.goto(B+'/capture', {waitUntil:'networkidle'});
 await p.waitForTimeout(1500);

 for (const s of SITES) {
  // the header entity picker is the only way in, same as an auditor has
  const picker = p.locator('select[aria-label="Entity"]').first();
  await picker.waitFor({state:'visible', timeout:15000});
  await picker.selectOption(s.code);
  await p.waitForTimeout(1200);

  const shell = await p.locator('body').innerText();
  ok(`${s.short}: the shell names this site`, new RegExp(s.short).test(shell), shell.slice(0,90).replace(/\n/g,' '));
  ok(`${s.short}: the progress ring counts to ${s.checks}`,
     new RegExp(`/${s.checks}\\b`).test(shell), (shell.match(/\d+\/\d+/g)||[]).join(' '));

  // check ids on this screen carry this site's prefix and no other
  const idCells = await p.locator('span.font-mono').allInnerTexts();
  const ids = idCells.filter(t=>/^[A-Z]+-[A-Z]{3}-\d{3}/.test(t.trim()));
  ok(`${s.short}: check ids are prefixed ${s.short}-`,
     ids.length>0 && ids.every(t=>t.trim().startsWith(s.short+'-')),
     ids.slice(0,3).join(' | '));

  // Corporate Office has no airfield, so it must not offer Civil at all
  const rail = await p.locator('select[aria-label="Discipline"]').first().innerText();
  ok(`${s.short}: Civil ${s.civil?'is':'is NOT'} offered`,
     /Civil/.test(rail) === s.civil, rail.slice(0,80).replace(/\n/g,' '));

  // closure carries this site's own 2025 findings and nobody else's
  await p.goto(B+'/closure', {waitUntil:'networkidle'});
  await p.waitForTimeout(1000);
  const clo = await p.locator('body').innerText();
  if (s.prior > 0) {
    ok(`${s.short}: closure carries its ${s.prior} open 2025 findings`,
       new RegExp(`${s.prior} items? left open`).test(clo), clo.slice(0,140).replace(/\n/g,' '));
    const pids = (clo.match(/[A-Z]+-[A-Z]{3}-P\d\d/g)||[]);
    ok(`${s.short}: every carried finding id is ${s.short}'s`,
       pids.length>0 && pids.every(x=>x.startsWith(s.short+'-')),
       [...new Set(pids.filter(x=>!x.startsWith(s.short+'-')))].slice(0,4).join(' '));
  } else {
    /* 2026-09-10: the sentence lost the site's name and the words "is". The
       heading beside it already says "Follow-up at {short}", and the top of
       that screen was half the screen — Sarel's words. Same assertion. */
    ok(`${s.short}: a baseline site shows nothing outstanding`,
       /Nothing outstanding coming into/.test(clo), clo.slice(0,140).replace(/\n/g,' '));
  }
  await p.goto(B+'/capture', {waitUntil:'networkidle'});
  await p.waitForTimeout(900);
 }

 // the portfolio must add up to the register's own total
 await p.goto(B+'/dashboard', {waitUntil:'networkidle'});
 await p.waitForTimeout(1200);
 const btn = p.locator('button', {hasText:/^portfolio$/i}).first();
 if (await btn.count()) { await btn.click(); await p.waitForTimeout(900); }
 const dash = await p.locator('body').innerText();
 ok('portfolio totals 3,086 check-points across ten sites', /3[,\s]?086/.test(dash), dash.slice(0,200).replace(/\n/g,' '));
 ok('portfolio totals the 78 findings carried in from 2025', /\b78\b/.test(dash));
 await p.screenshot({path:'/home/claude/shots/persite-portfolio.png', fullPage:true});

 ok('no page errors anywhere in the walk', errs.length===0, errs.slice(0,2).join(' | '));

 console.log(log.join('\n'));
 console.log(`\n${pass} passed, ${fail} failed`);
 await b.close();
 process.exit(fail?1:0);
})().catch(e=>{ console.log(log.join('\n')); console.error('HARNESS', e.message); process.exit(1); });
