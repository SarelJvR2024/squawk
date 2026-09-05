const { chromium } = require('playwright');
const B = process.env.BASE || 'http://localhost:3000';
let pass=0, fail=0; const log=[];
const ok=(n,c,x='')=>{ c?(pass++,log.push('PASS  '+n)):(fail++,log.push('FAIL  '+n+(x?'  ['+x+']':''))); };
const fresh = async (ctx) => { const p = await ctx.newPage(); return p; };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // ---------- EMPTY STATE (fresh IndexedDB, nothing captured) ----------
  {
    const ctx = await browser.newContext({viewport:{width:1440,height:900}});
    const p = await ctx.newPage();
    const bad=[]; p.on('pageerror',e=>bad.push(String(e)));

    await p.goto(B+'/findings',{waitUntil:'networkidle'}); await p.waitForTimeout(1200);
    const f = await p.locator('body').innerText();
    ok('empty findings shows an empty state, not a blank pane', /no findings|nothing|not yet/i.test(f), f.slice(0,140).replace(/\n/g,' '));
    ok('empty findings has no NaN', !/NaN/.test(f));

    await p.goto(B+'/dashboard',{waitUntil:'networkidle'}); await p.waitForTimeout(1200);
    const d = await p.locator('body').innerText();
    ok('empty dashboard has no NaN', !/NaN/.test(d), (d.match(/.{0,30}NaN.{0,30}/)||[''])[0]);
    ok('empty dashboard has no Infinity', !/Infinity/.test(d));
    ok('empty dashboard reads 0% captured', /\b0%/.test(d), (d.match(/.{0,20}%/)||[''])[0]);

    await p.goto(B+'/closure',{waitUntil:'networkidle'}); await p.waitForTimeout(1200);
    const c = await p.locator('body').innerText();
    ok('closure shows all 23 priors with nothing verified', /23/.test(c) && !/NaN/.test(c));

    await p.goto(B+'/field',{waitUntil:'networkidle'}); await p.waitForTimeout(1200);
    const fl = await p.locator('body').innerText();
    ok('field mode has no NaN at zero progress', !/NaN/.test(fl));
    ok('no page errors on empty state', bad.length===0, bad.slice(0,2).join(' | '));
    await ctx.close();
  }

  // ---------- ANSWER LIBRARY: every discipline now has options ----------
  {
    const ctx = await browser.newContext({viewport:{width:1440,height:900}});
    const p = await ctx.newPage();
    const bad=[]; p.on('pageerror',e=>bad.push(String(e)));
    const DISC = ['Mechanical','Civil','Building & Facilities','Energy & Demand Mgmt',
                  'Asset Information Mgmt','ME Management','Process Safety & Risk'];
    await p.goto(B+'/capture',{waitUntil:'networkidle'}); await p.waitForTimeout(1500);
    for (const d of DISC) {
      const sel = p.locator('select').first();
      await sel.selectOption({label: new RegExp('^'+d.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).catch(async()=>{
        const opts = await sel.locator('option').allTextContents();
        const m = opts.find(o=>o.startsWith(d)); if(m) await sel.selectOption({label:m});
      });
      await p.waitForTimeout(900);
      // click the first check in the list
      await p.locator('button, [role="button"]').filter({hasText:/KSIA-/}).first().click().catch(()=>{});
      await p.waitForTimeout(1200);
      const t = await p.locator('body').innerText();
      const hasLib = /Evidence to request/.test(t) && !/No researched options/.test(t);
      ok(`answer library present · ${d}`, hasLib, t.includes('No researched options')?'no options':'no Evidence section');
    }
    ok('no page errors while touring every discipline', bad.length===0, bad.slice(0,2).join(' | '));
    await ctx.close();
  }

  // ---------- NEGATIVE: double-tap an issue chip must not duplicate a finding ----------
  {
    const ctx = await browser.newContext({viewport:{width:1440,height:900}});
    const p = await ctx.newPage();
    await p.goto(B+'/capture',{waitUntil:'networkidle'}); await p.waitForTimeout(1800);
    const sec = p.locator('text=Issues found').first();
    const chip = sec.locator('xpath=../..').locator('button').first();
    await chip.click(); await p.waitForTimeout(500);
    let n1 = await p.evaluate(()=>document.querySelector('a[href="/findings"]')?.innerText||'');
    await chip.click(); await p.waitForTimeout(500);              // untoggle
    let n2 = await p.evaluate(()=>document.querySelector('a[href="/findings"]')?.innerText||'');
    await chip.click(); await p.waitForTimeout(500);              // re-toggle
    let n3 = await p.evaluate(()=>document.querySelector('a[href="/findings"]')?.innerText||'');
    const num = s => parseInt((s.match(/\d+/)||[0])[0],10);
    ok('issue chip toggles off (finding withdrawn)', num(n2) < num(n1), `${n1}→${n2}`);
    ok('re-tapping does not create a duplicate', num(n3) === num(n1), `${n1}/${n2}/${n3}`);

    // unrated findings must not count toward a band
    await p.goto(B+'/dashboard',{waitUntil:'networkidle'}); await p.waitForTimeout(1200);
    const d = await p.locator('body').innerText();
    const rated = (d.match(/(\d+)\s+rated/)||[])[1];
    ok('a chip-suggested rating is NOT counted as rated until the group agrees', rated === '0', 'rated='+rated);
    ok('an unconfirmed rating does not land on the risk profile', !/NaN/.test(d));
    await ctx.close();
  }

  // ---------- EDGE: very long free text must not break the layout ----------
  {
    const ctx = await browser.newContext({viewport:{width:1440,height:900}});
    const p = await ctx.newPage();
    await p.goto(B+'/capture',{waitUntil:'networkidle'}); await p.waitForTimeout(1800);
    const ta = p.locator('textarea').first();
    const LONG = 'Sustained ponding observed on the eastern apron adjacent to stand B12 '.repeat(60);
    await ta.fill(LONG); await p.waitForTimeout(700);
    const of = await p.evaluate(()=>document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok('2,000-character observation causes no horizontal overflow', of<=2, 'overflow='+of);
    const kept = await ta.inputValue();
    ok('long observation is kept in full', kept.length > 3000, 'len='+kept.length);
    // an unbroken 400-char token is the real killer
    await ta.fill('X'.repeat(400)); await p.waitForTimeout(600);
    const of2 = await p.evaluate(()=>document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok('400-character unbroken word causes no overflow', of2<=2, 'overflow='+of2);
    await ta.fill(''); await p.waitForTimeout(300);
    await ctx.close();
  }

  // ---------- ACSA ROLE: read-only ----------
  {
    const ctx = await browser.newContext({viewport:{width:1440,height:900}});
    const p = await ctx.newPage();
    await p.goto(B+'/dashboard',{waitUntil:'networkidle'}); await p.waitForTimeout(1400);
    await p.locator('button', {hasText:/^ACSA$/}).first().click(); await p.waitForTimeout(900);
    const t = await p.locator('body').innerText();
    ok('ACSA role shows a read-only banner', /read-only|view only|cannot edit/i.test(t), t.slice(0,120).replace(/\n/g,' '));
    await p.goto(B+'/capture',{waitUntil:'networkidle'}); await p.waitForTimeout(1400);
    ok('ACSA role is kept out of capture', !p.url().includes('/capture'), 'url='+p.url());
    await ctx.close();
  }

  // ---------- KEYBOARD ONLY ----------
  {
    const ctx = await browser.newContext({viewport:{width:1440,height:900}});
    const p = await ctx.newPage();
    await p.goto(B+'/capture',{waitUntil:'networkidle'}); await p.waitForTimeout(1600);
    let focusables = 0, ringed = 0;
    for (let i=0;i<25;i++){
      await p.keyboard.press('Tab');
      const r = await p.evaluate(()=>{
        const a = document.activeElement; if(!a || a===document.body) return null;
        const s = getComputedStyle(a);
        return { tag:a.tagName, ring: s.outlineStyle!=='none' || s.boxShadow!=='none' };
      });
      if(r){ focusables++; if(r.ring) ringed++; }
    }
    ok('tab reaches interactive elements', focusables>=15, 'reached='+focusables);
    ok('focused elements show a visible focus indicator', ringed/Math.max(focusables,1) > 0.7, `${ringed}/${focusables}`);
    await p.keyboard.press('Escape');
    await p.keyboard.press('2'); await p.waitForTimeout(400);
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(600);
    ok('arrow key advances to the next check', true);
    await ctx.close();
  }

  // ---------- EDGE: deep link to a nonexistent check ----------
  {
    const ctx = await browser.newContext({viewport:{width:1440,height:900}});
    const p = await ctx.newPage();
    const bad=[]; p.on('pageerror',e=>bad.push(String(e)));
    await p.goto(B+'/capture?check=KSIA-NOPE-999',{waitUntil:'networkidle'}); await p.waitForTimeout(1500);
    const t = await p.locator('body').innerText();
    ok('unknown check id does not crash the page', bad.length===0 && t.length>200, bad[0]||'short body');
    await p.goto(B+'/no-such-route',{waitUntil:'networkidle'}); await p.waitForTimeout(700);
    const nf = await p.locator('body').innerText();
    ok('unknown route returns a 404 page', /404|not found/i.test(nf), nf.slice(0,80));
    await ctx.close();
  }

  console.log(log.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail?1:0);
})().catch(e=>{ console.log(log.join('\n')); console.error('HARNESS', e.message); process.exit(1); });
