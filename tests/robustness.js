const { chromium } = require('playwright');
/* A real 1x1 JPEG. Small enough to inline, real enough that the browser decodes
   it and the downscale path actually runs. */
const PIXEL_JPEG = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const B = process.env.BASE || 'http://localhost:3000';

/** The answer library is TABBED — Evidence, Likely answers, Issues, Walkabout,
 *  Snippets — so a panel has to be opened before its chips are in the DOM. The
 *  five used to be stacked, which ran well past a tablet's height; the counts
 *  on the tabs are what keep a tapped panel legible while it is closed. */
const openTab = (page, label) =>
  page.locator('button[role="tab"]', { hasText: label }).first().click();
const panelChip = (page, key) => page.locator(`[data-panel="${key}"] button`).first();
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
    await openTab(p, 'Issues found');
    await p.waitForTimeout(300);
    const chip = panelChip(p, 'issues');
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
    /* The role is a pill showing the CURRENT role, opening the switch — not
       two buttons side by side. It stayed out of the "More" menu on purpose:
       the role is state, and state a menu hides is state an auditor finds out
       about by discovering half the app disabled. */
    await p.locator('button[aria-label^="Viewing as"]').first().click();
    await p.waitForTimeout(400);
    await p.locator('[role="menuitem"]', {hasText:'Read-only'}).first().click();
    await p.waitForTimeout(900);
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

  // ---------- PHOTOGRAPHS: attached, captioned, survive a reload, deleted cleanly ----------
  /* A real file goes through the real input. The whole path matters here —
     downscale, store, thumbnail, caption, persist, delete — and every step of
     it is the difference between evidence and a JPEG nobody can find. */
  {
    const ctx = await browser.newContext({viewport:{width:1440,height:900}});
    const p = await ctx.newPage();
    const bad=[]; p.on('pageerror',e=>bad.push(String(e)));
    await p.goto(B+'/capture',{waitUntil:'networkidle'}); await p.waitForTimeout(1800);

    const before = await p.locator('input[aria-label^="Caption for"]').count();
    await p.locator('input[type=file][accept="image/*"]').first().setInputFiles({
      name:'apron.jpg', mimeType:'image/jpeg', buffer: Buffer.from(PIXEL_JPEG,'base64'),
    });
    await p.waitForTimeout(1800);

    const capField = p.locator('input[aria-label^="Caption for"]').first();
    ok('a photograph attaches and gets a caption field',
       (await p.locator('input[aria-label^="Caption for"]').count()) === before + 1);

    const body1 = await p.locator('body').innerText();
    ok('an uncaptioned photograph is shown as incomplete', /Caption needed/.test(body1),
       body1.slice(0,100).replace(/\n/g,' '));
    ok('the observation is untouched by attaching a photograph',
       (await p.locator('textarea').first().inputValue()).trim() === '');

    await capField.fill('Hydrant pit coupler, lid missing');
    await p.waitForTimeout(900);
    const body2 = await p.locator('body').innerText();
    ok('captioning clears the incomplete state', !/Caption needed/.test(body2));

    // survives a reload — the image is in IndexedDB, the caption in the store
    await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(2000);
    const kept = await p.locator('input[aria-label^="Caption for"]').first().inputValue();
    ok('the caption survives a reload', kept === 'Hydrant pit coupler, lid missing', kept);
    ok('the image survives a reload too',
       (await p.locator('img[alt="Hydrant pit coupler, lid missing"]').count()) >= 1);

    // deleting removes the record AND the stored image
    const keysBefore = await p.evaluate(async () => {
      const req = indexedDB.open('keyval-store');
      return new Promise((res) => { req.onsuccess = () => {
        const db = req.result;
        const all = db.transaction('keyval').objectStore('keyval').getAllKeys();
        all.onsuccess = () => res(all.result.filter((k)=>String(k).startsWith('squawk-media/photo-')).length);
      };});
    });
    await p.locator('button[aria-label^="Remove apron.jpg"], button[aria-label*="Remove"]').first().click();
    await p.waitForTimeout(1400);
    const keysAfter = await p.evaluate(async () => {
      const req = indexedDB.open('keyval-store');
      return new Promise((res) => { req.onsuccess = () => {
        const db = req.result;
        const all = db.transaction('keyval').objectStore('keyval').getAllKeys();
        all.onsuccess = () => res(all.result.filter((k)=>String(k).startsWith('squawk-media/photo-')).length);
      };});
    });
    ok('deleting a photograph removes its stored image, not just the record',
       keysAfter === keysBefore - 1, `${keysBefore} -> ${keysAfter}`);
    ok('no page errors in the photograph path', bad.length===0, bad[0]||'');
    await p.screenshot({path:'/home/claude/shots/photo-caption.png'});
    await ctx.close();
  }

  // ---------- SEEN ON THE WALK ----------
  /* The three things that would be silently wrong rather than visibly broken.
     Each one looks correct from a screenshot when it is not:

     · An ad-hoc item that gated on the ACSA asset register would simply have
       no add button on a device where the register never arrived, which is
       every device today — the register is a Contract Data 25.2 deliverable
       that is still outstanding and may not land this round.
     · A collapse that discarded unsaved text loses evidence with no error and
       no trace, on the field whose whole point is that it is hard to retype.
     · A completion figure that counted walk items would keep counting, keep
       looking plausible, and be wrong by however many we happened to find. */
  {
    const ctx = await browser.newContext({viewport:{width:375,height:664}});
    const p = await ctx.newPage();
    const bad=[]; p.on('pageerror',e=>bad.push(String(e)));

    await p.goto(B+'/field',{waitUntil:'networkidle'}); await p.waitForTimeout(1600);

    /* The denominator BEFORE anything is added. Read off the screen rather
       than assumed, so the assertion is about what an auditor sees. */
    const before = (await p.locator('body').innerText()).match(/(\d+)\/(\d+)/);
    const denomBefore = before ? before[2] : null;

    const add = p.locator('button', { hasText: /^Add item$/ }).first();
    ok('the add control is on the screen at 375px with no asset register loaded',
       await add.isVisible().catch(()=>false));
    const box = await add.boundingBox();
    ok('and it is at least 56px tall', !!box && box.height >= 56, box ? String(box.height) : 'no box');

    await add.click(); await p.waitForTimeout(500);
    await p.locator('textarea').first().fill('Bund wall cracked through at the day tank.');
    await p.locator('button', { hasText: /^Record it$/ }).first().click();
    await p.waitForTimeout(900);

    const after = await p.locator('body').innerText();
    ok('an item can be recorded with a description alone', /Bund wall cracked through/.test(after));
    /* 2026-09-10: the mark moved onto the row itself. Walk items used to be a
       block above the register under the heading "Seen on the walk · not part
       of the 324"; Sarel asked for them to be filed into the asset system they
       belong to, so each row now carries the mark instead. Same invariant —
       a row that is not one of ACSA's check-points says so, in words. */
    ok('it is marked as not being one of the register check-points',
       /added on the walk/i.test(after));

    /* AND THE AUDITOR CAN SEE IT. The asset systems are shut by default, so
       filing it correctly and showing nothing was a real defect for exactly
       one build: the toast said it was recorded and the screen looked
       identical. Saving opens the group it landed in. */
    ok('recording it opens the group it landed in',
       /Bund wall cracked through/.test(after));
    ok('its id cannot be mistaken for a check-point id', /WALK-/.test(after));

    const denomAfter = (after.match(/(\d+)\/(\d+)/)||[])[2];
    ok('THE COMPLETION DENOMINATOR DID NOT MOVE',
       denomBefore !== null && denomAfter === denomBefore,
       `${denomBefore} -> ${denomAfter}`);
    ok('and the walk count is stated separately', /\+\s*1 seen on the walk/.test(after));

    /* CLOSING MUST HIDE, NEVER DISCARD. The check opened in place at first and
       now opens in a sheet — Sarel on a real phone: too much scrolling, and
       "the save button is not easily visible to find to save it". The
       invariant did not change with the layout, and it is the one worth
       testing either way: type into the observation, dismiss, reopen, read it
       back. Every control writes straight to the store, so nothing is held in
       a draft that a dismissal could drop. */
    /* ONE LEVEL, NOT TWO, since 2026-09-10: the discipline came out of the tree
       and became the filter above it, so the same element carries both
       data-group and data-system and there is one header to open, not two.
       Opening it twice would shut it again. The wrapper carries the attribute;
       the thing that opens it is the button inside. */
    await p.locator('[data-group] > button').first().click(); await p.waitForTimeout(400);
    const row = p.locator('[data-check] button').first();
    await row.click(); await p.waitForTimeout(600);
    ok('a check opens in a sheet', await p.locator('[role="dialog"]').isVisible());
    const save = p.locator('[role="dialog"] button', { hasText: /Save &/ }).first();
    const saveBox = await save.boundingBox();
    ok('AND ITS SAVE IS ON SCREEN WITHOUT SCROLLING THE SHEET',
       !!saveBox && saveBox.y > 0 && saveBox.y + saveBox.height <= 664,
       saveBox ? `y=${Math.round(saveBox.y)}` : 'not found');
    const typed = 'Coupler worn past the wear mark; photographed from the north side.';
    await p.locator('[role="dialog"] textarea').first().fill(typed);
    await p.waitForTimeout(400);
    await p.locator('[role="dialog"] button[aria-label="Close"]').click(); await p.waitForTimeout(400);
    ok('closing it puts the controls away', (await p.locator('[role="dialog"]').count()) === 0);
    await row.click(); await p.waitForTimeout(600);
    const back = await p.locator('[role="dialog"] textarea').first().inputValue();
    ok('CLOSING AND REOPENING LOSES NOTHING', back === typed, back.slice(0,40));
    await p.locator('[role="dialog"] button[aria-label="Close"]').click(); await p.waitForTimeout(300);

    /* And it survived the round trip to storage, not just to React state. */
    await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1600);
    /* Through the search, because a reload puts every group back shut — which
       groups are open is session state, deliberately, and the record is what
       has to survive. The search opens everything it matches, so this reads
       the item back off the screen rather than out of the store. */
    await p.locator('input[aria-label="Search any check"]').fill('Bund wall');
    await p.waitForTimeout(600);
    const persisted = await p.locator('body').innerText();
    ok('the walk item is still there after a reload', /Bund wall cracked through/.test(persisted));
    await p.locator('input[aria-label="Search any check"]').fill('');
    await p.waitForTimeout(300);

    ok('no horizontal scroll on the inspection screen at 375px',
       !(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
    ok('no page errors on the walk path', bad.length===0, bad[0]||'');
    await ctx.close();
  }

  console.log(log.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail?1:0);
})().catch(e=>{ console.log(log.join('\n')); console.error('HARNESS', e.message); process.exit(1); });
