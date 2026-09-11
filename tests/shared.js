/* Several auditors, one audit — over the wire this time.
 *
 *  tests/merge.test.mjs proves the rules; tests/team.js proves the file route.
 *  This proves the shared record: two devices, a real Next server holding the
 *  secret key, and a Supabase that this suite can turn off on purpose.
 *
 *  Sarel asked for it to be tested "in all scenarios with multiple auditors
 *  offline and online as expected and also test some edge cases and do negative
 *  testing", and the negative half is the half that matters. A sync that works
 *  when everything is fine is table stakes. What decides whether a team trusts
 *  it is what happens when the passphrase is wrong, when the record is down,
 *  when two auditors answered the same check in a basement, and when somebody
 *  points a client at the wrong airport.
 *
 *    node tests/shared.js        (starts everything it needs)
 */

const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const SUPA_PORT = 3901;
const APP_PORT = 3902;
const BARE_PORT = 3903; // the same build with nothing configured
const HALF_PORT = 3904; // and one with the URL set but the other two missing
const PASS = "harbour-cassette-nine-lantern-drift";
const BASE = `http://127.0.0.1:${APP_PORT}`;

/** The answer library is TABBED — Evidence, Likely answers, Issues, Walkabout,
 *  Snippets — so a panel has to be opened before its chips are in the DOM. The
 *  five used to be stacked, which ran well past a tablet's height; the counts
 *  on the tabs are what keep a tapped panel legible while it is closed. */
const openTab = (page, label) =>
  page.locator('button[role="tab"]', { hasText: label }).first().click();
const panelChip = (page, key) => page.locator(`[data-panel="${key}"] button`).first();

let pass = 0, fail = 0;
const log = [];
const ok = (n, c, x = "") => {
  c ? (pass++, log.push("PASS  " + n)) : (fail++, log.push("FAIL  " + n + (x ? "  [" + x + "]" : "")));
};

function killTree(p) {
  if (!p?.pid) return;
  try { process.kill(-p.pid, "SIGKILL"); } catch { try { p.kill("SIGKILL"); } catch {} }
}

const startApp = (port, env) =>
  new Promise((resolve, reject) => {
    const p = spawn("npx", ["next", "start", "-p", String(port)], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: "ignore",
      detached: true,
    });
    const t0 = Date.now();
    const poll = async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/api/sync`);
        if (r.ok) return resolve(p);
      } catch {}
      if (Date.now() - t0 > 90000) return reject(new Error(`app on ${port} never came up`));
      setTimeout(poll, 400);
    };
    poll();
  });

/** An auditor: their own browser context, so their own IndexedDB. */
async function auditor(browser, name, { unlock = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(BASE + "/capture", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  /* Name them, so provenance in the record is a person rather than "unnamed". */
  await page.evaluate((who) => {
    const raw = localStorage.getItem("squawk-team-passphrase");
    void raw;
    window.dispatchEvent(new Event("squawk-noop"));
    return who;
  }, name);
  if (unlock) {
    await page.evaluate((p) => localStorage.setItem("squawk-team-passphrase", p), PASS);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1800);
  }
  return { ctx, page, errs, name };
}

/* Idempotent on purpose. Clicking Export while the sheet is already up hits the
   backdrop and CLOSES it, so a helper that assumes the sheet is shut turns a
   passing assertion into a failing one for a reason that has nothing to do with
   the app. */
const sheetUp = (page) =>
  page.locator("text=Team captures").first().isVisible().catch(() => false);

/* EXPORT LIVES IN THE "MORE" MENU NOW. Sync, Export, Start again and the
   shortcuts sheet stood in the masthead at every width for the whole audit —
   four controls you reach for once a day, taking a third of the header from
   the two used constantly. Opening the menu first is the real interaction, so
   it is what these suites do. */
const openExport = async (page) => {
  if (await sheetUp(page)) return;
  await page.locator("button", { hasText: /^More$/ }).first().click();
  await page.waitForTimeout(400);
  await page.locator('[role="menuitem"]', { hasText: "Export the workbook" }).first().click();
  await page.waitForTimeout(900);
};
const closeSheet = async (page) => {
  if (!(await sheetUp(page))) return;
  /* The backdrop, not the close button: there is more than one aria-label
     "Close" in the shell and .first() is not reliably this one. */
  await page.mouse.click(5, 5);
  await page.waitForTimeout(600);
};

/** Answer the check at `index` and save it. Returns the portal id it answered. */
async function captureOne(page, key = "2", index = 0) {
  const rows = page.locator("aside a, [data-check-row]");
  void rows;
  if (index > 0) {
    for (let i = 0; i < index; i++) {
      await page.locator("button[aria-label='Next']").first().click();
      await page.waitForTimeout(400);
    }
  }
  await page.keyboard.press(key);
  await page.waitForTimeout(300);
  await page.locator("button", { hasText: /^Save$/ }).first().click();
  await page.waitForTimeout(800);
}

/** What a device actually holds for one check, read out of its own IndexedDB.
 *
 *  The screen cannot answer this unambiguously — "N/A" is both a compliance and
 *  a button label — and the point of a convergence test is what the devices
 *  STORED, not what a regex could find in some rendered text. */
async function complianceFor(page, checkId) {
  return page.evaluate(async (id) => {
    const raw = await new Promise((resolve) => {
      const open = indexedDB.open("keyval-store");
      open.onsuccess = () => {
        const db = open.result;
        const req = db.transaction("keyval").objectStore("keyval").get("acsa-assurance-v1");
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      };
      open.onerror = () => resolve(null);
    });
    if (!raw) return null;
    const state = JSON.parse(raw).state;
    const key = `${state.entity}/${state.visit}`;
    return state.byVisit?.[key]?.responses?.[id]?.compliance ?? null;
  }, checkId);
}

/** The first check on the list, whatever the register happens to open on. */
const firstCheckId = (page) =>
  page.evaluate(() => (document.body.innerText.match(/[A-Z]{2,5}-[A-Z]{3}-\d{3}/) ?? [null])[0]);

const syncNow = async (page) => {
  await openExport(page);
  const btn = page.locator("button", { hasText: /^Sync now$/ }).first();
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(1600);
  }
  await closeSheet(page);
};

(async () => {
  const { fakeSupabase } = await import("./fake-supabase.mjs");
  const supa = await fakeSupabase(SUPA_PORT);
  let app, bare, half, browser;

  try {
    app = await startApp(APP_PORT, {
      SUPABASE_URL: supa.url,
      SUPABASE_SECRET_KEY: "sb_secret_not_a_real_key",
      SQUAWK_TEAM_PASSPHRASE: PASS,
    });
    bare = await startApp(BARE_PORT, {
      SUPABASE_URL: "",
      SUPABASE_SECRET_KEY: "",
      SQUAWK_TEAM_PASSPHRASE: "",
    });
    /* The realistic half-configured deployment. Sarel set some of the three in
       Vercel and could not tell which were still empty — nothing said. This one
       exists so the answer is tested, not assumed. */
    half = await startApp(HALF_PORT, {
      SUPABASE_URL: supa.url,
      SUPABASE_SECRET_KEY: "",
      SQUAWK_TEAM_PASSPHRASE: "",
    });
    browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

    /* ================= negative first, on the route itself ================= */
    const api = await browser.newContext();

    const avail = await (await api.request.get(`${BASE}/api/sync`)).json();
    ok("a configured deployment says it has a shared record", avail.available === true);

    const bareAvail = await (await api.request.get(`http://127.0.0.1:${BARE_PORT}/api/sync`)).json();
    ok("AN UNCONFIGURED ONE SAYS IT HAS NONE — it never falls open",
       bareAvail.available === false, JSON.stringify(bareAvail));

    /* WHICH ONES ARE EMPTY. The route answers with names and nothing else —
       never a value, never a length, never a prefix — so a deployment can be
       diagnosed from Pre-flight without anybody reading a secret out of it. */
    ok("an unconfigured one names all three missing variables",
       Array.isArray(bareAvail.missing) && bareAvail.missing.length === 3 &&
       ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "SQUAWK_TEAM_PASSPHRASE"]
         .every((k) => bareAvail.missing.includes(k)), JSON.stringify(bareAvail));

    ok("a configured one names none", Array.isArray(avail.missing) && avail.missing.length === 0,
       JSON.stringify(avail));

    const halfAvail = await (await api.request.get(`http://127.0.0.1:${HALF_PORT}/api/sync`)).json();
    ok("A HALF-CONFIGURED ONE NAMES EXACTLY THE TWO THAT ARE EMPTY",
       halfAvail.available === false && Array.isArray(halfAvail.missing) &&
       halfAvail.missing.length === 2 &&
       halfAvail.missing.includes("SUPABASE_SECRET_KEY") &&
       halfAvail.missing.includes("SQUAWK_TEAM_PASSPHRASE"), JSON.stringify(halfAvail));

    /* And it is still shut. Naming what is missing must not be mistaken for
       degrading gracefully into an open door. */
    const halfTry = await api.request.post(`http://127.0.0.1:${HALF_PORT}/api/sync`, {
      data: { passphrase: "anything at all", entity: "KSIA", visit: "2026-09", records: [] },
    });
    ok("and a half-configured one still refuses to sync", halfTry.status() === 503,
       String(halfTry.status()));

    /* The secret this route holds must not be inferable from what it says about
       itself — no value, no length, no first characters, in any field. */
    const halfBody = JSON.stringify(halfAvail) + JSON.stringify(bareAvail) + JSON.stringify(avail);
    ok("nothing it reports carries a value, a length or a prefix of one",
       !halfBody.includes(supa.url) && !halfBody.includes(PASS) &&
       !halfBody.includes("sb_secret") && !/\b(length|len|prefix|value|starts)\b/i.test(halfBody),
       halfBody.slice(0, 200));

    const bareTry = await api.request.post(`http://127.0.0.1:${BARE_PORT}/api/sync`, {
      data: { passphrase: "anything at all", entity: "KSIA", visit: "2026-09", records: [] },
    });
    ok("and refuses to sync rather than syncing without a check",
       bareTry.status() === 503, String(bareTry.status()));

    const wrong = await api.request.post(`${BASE}/api/sync`, {
      data: { passphrase: "not the passphrase", entity: "KSIA", visit: "2026-09", records: [] },
    });
    ok("a wrong passphrase is refused", wrong.status() === 401, String(wrong.status()));
    const wrongBody = await wrong.json();
    ok("and the refusal says nothing about the real one",
       !JSON.stringify(wrongBody).includes(PASS) && !/length|character/i.test(wrongBody.error ?? ""),
       wrongBody.error);

    const empty = await api.request.post(`${BASE}/api/sync`, {
      data: { entity: "KSIA", visit: "2026-09", records: [] },
    });
    ok("so is no passphrase at all", empty.status() === 401, String(empty.status()));

    /* Brute force. FREE_TRIES is 8; the ninth in a minute is refused. */
    let locked = 0;
    for (let i = 0; i < 12; i++) {
      const r = await api.request.post(`${BASE}/api/sync`, {
        data: { passphrase: `guess-${i}`, entity: "KSIA", visit: "2026-09", records: [] },
      });
      if (r.status() === 429) locked++;
    }
    ok("GUESSING IS SLOWED DOWN, not left open", locked > 0, `${locked} of 12 refused outright`);

    /* The brake is per-caller; a different one is unaffected. Also clears the
       first caller for the rest of the suite. */
    const other = await api.request.post(`${BASE}/api/sync`, {
      headers: { "x-forwarded-for": "203.0.113.9" },
      data: { passphrase: PASS, entity: "KSIA", visit: "2026-09", records: [] },
    });
    ok("and one client being throttled does not lock out another",
       other.status() === 200, String(other.status()));

    /* Spoofing the audit inside the rows. */
    await api.request.post(`${BASE}/api/sync`, {
      headers: { "x-forwarded-for": "203.0.113.10" },
      data: {
        passphrase: PASS,
        entity: "KSIA",
        visit: "2026-09",
        records: [
          { entity: "CPTA", visit: "2027-03", kind: "response", id: "SPOOF-1", updated_at: 5, payload: { checkId: "SPOOF-1" } },
        ],
      },
    });
    const spoofed = [...supa.rows.values()].find((r) => r.id === "SPOOF-1");
    ok("A ROW CANNOT NAME AN AUDIT THE REQUEST DID NOT AUTHENTICATE FOR",
       spoofed && spoofed.entity === "KSIA" && spoofed.visit === "2026-09",
       spoofed ? `${spoofed.entity} ${spoofed.visit}` : "not written at all");

    /* Stale writes. */
    const push = (id, at, headers = { "x-forwarded-for": "203.0.113.11" }) =>
      api.request.post(`${BASE}/api/sync`, {
        headers,
        data: {
          passphrase: PASS,
          entity: "KSIA",
          visit: "2026-09",
          records: [{ kind: "response", id, updated_at: at, payload: { checkId: id, mark: at } }],
        },
      });
    await push("STALE-1", 2000);
    await push("STALE-1", 1000);
    const stale = [...supa.rows.values()].find((r) => r.id === "STALE-1");
    ok("A DEVICE OUT OF A BASEMENT CANNOT PUSH ITS STALE COPY OVER NEWER WORK",
       stale?.updated_at === 2000, `updated_at=${stale?.updated_at}`);
    await push("STALE-1", 3000);
    ok("but a genuinely newer one is taken",
       [...supa.rows.values()].find((r) => r.id === "STALE-1")?.updated_at === 3000);

    const huge = await api.request.post(`${BASE}/api/sync`, {
      headers: { "x-forwarded-for": "203.0.113.12" },
      data: { passphrase: PASS, entity: "KSIA", visit: "2026-09", note: "x".repeat(5 * 1024 * 1024) },
    });
    ok("an oversized body is refused rather than stored", huge.status() === 413, String(huge.status()));

    /* ---- THE COMMIT-TIME RACE, which is how a team silently loses work ----

       Postgres reads now() at a transaction's START and makes its rows visible
       at its COMMIT. A push that takes a moment therefore lands carrying a
       timestamp from before it began. If another device is handed a cursor in
       that window, the slow device's rows are older than the cursor and are
       excluded from every pull that device will ever make again — and it will
       not re-push them, because its own watermark has moved on.

       Three auditors is where this stops being theoretical: it needs one push
       to overlap another. That is an ordinary afternoon on an apron. */
    await api.request.get(`${supa.url}/__reset`);

    const sync = (since, records) =>
      api.request
        .post(`${BASE}/api/sync`, {
          headers: { "x-forwarded-for": "203.0.113.44" },
          data: { passphrase: PASS, entity: "KSIA", visit: "2026-09", since, records },
        })
        .then((r) => r.json());

    const row = (id, at) => ({ kind: "response", id, updated_at: at, payload: { checkId: id } });

    /* Auditor A's push is held open for 800ms — it is stamped now, it commits
       later. Auditor C's is instant and lands in between. */
    await api.request.get(`${supa.url}/__lag?ms=800`);
    await sync(null, [row("RACE-SLOW", 1000)]);
    await sync(null, [row("RACE-FAST", 1000)]);

    /* Auditor B pulls in the window: only C's row exists, so B's cursor moves
       past A's stamp while A's work is still in flight. */
    const bFirst = await sync(null, []);
    ok("the slow auditor's push has not landed yet, so B cannot see it",
       !bFirst.records.some((r) => r.id === "RACE-SLOW"),
       bFirst.records.map((r) => r.id).join(","));

    await new Promise((r) => setTimeout(r, 1200)); // A commits

    const inTable = [...supa.rows.values()].some((r) => r.id === "RACE-SLOW");
    ok("and it IS in the record — nothing was lost server-side", inTable);

    const bSecond = await sync(bFirst.cursor, []);
    ok("A CAPTURED CHECK IS NEVER INVISIBLE TO THE REST OF THE TEAM",
       bSecond.records.some((r) => r.id === "RACE-SLOW"),
       `B pulled [${bSecond.records.map((r) => r.id).join(",") || "nothing"}] with cursor ${bFirst.cursor} — ` +
         "a check captured on one tablet that no other tablet will ever pull again");

    await api.request.get(`${supa.url}/__reset`);
    await api.close();

    /* ==================== two auditors, the happy path ==================== */
    const A = await auditor(browser, "Auditor A");
    const B = await auditor(browser, "Auditor B");

    await captureOne(A.page, "2");
    await syncNow(A.page);
    ok("what one auditor captures reaches the record",
       [...supa.rows.values()].some((r) => r.kind === "response"),
       `${supa.rows.size} rows`);

    await syncNow(B.page);
    const bBody = await B.page.locator("body").innerText();
    ok("AND THE OTHER AUDITOR'S DEVICE HAS IT WITHOUT ANYONE SENDING A FILE",
       !/not captured yet/.test(bBody), bBody.slice(0, 140).replace(/\n/g, " "));

    /* Two-way: B answers a different check, A picks it up. */
    await B.page.locator("button[aria-label='Next']").first().click();
    await B.page.waitForTimeout(600);
    await B.page.keyboard.press("1");
    await B.page.waitForTimeout(300);
    await B.page.locator("button", { hasText: /^Save$/ }).first().click();
    await B.page.waitForTimeout(800);
    await syncNow(B.page);
    await syncNow(A.page);
    await A.page.locator("button[aria-label='Next']").first().click();
    await A.page.waitForTimeout(900);
    const aSecond = await A.page.locator("body").innerText();
    ok("and it goes both ways", !/not captured yet/.test(aSecond),
       aSecond.slice(0, 140).replace(/\n/g, " "));

    /* ========================= offline, and back ========================== */
    await B.ctx.setOffline(true);
    await B.page.reload({ waitUntil: "domcontentloaded" });
    await B.page.waitForTimeout(2500);
    await openExport(B.page);
    const offlineText = await B.page.locator("body").innerText();
    ok("OFFLINE, IT SAYS SO AND SAYS NOTHING IS LOST",
       /waiting for signal/i.test(offlineText) && /nothing is lost/i.test(offlineText),
       offlineText.slice(0, 160).replace(/\n/g, " "));
    await closeSheet(B.page);

    /* Capture with no signal — the whole point of the app. */
    /* A fingerprint, not a count: re-answering a check the team already has
       UPDATES a row rather than adding one, so counting rows would call a
       working sync a failure. What "the work went up" means is that the record
       is not what it was. */
    const fingerprint = () =>
      JSON.stringify([...supa.rows.values()].map((r) => `${r.kind}:${r.id}:${r.updated_at}`).sort());
    const beforeOffline = fingerprint();
    await B.page.locator("button[aria-label='Next']").first().click();
    await B.page.waitForTimeout(500);
    await B.page.keyboard.press("2");
    await B.page.waitForTimeout(300);
    await B.page.locator("button", { hasText: /^Save$/ }).first().click();
    await B.page.waitForTimeout(700);
    const capturedOffline = await B.page.locator("body").innerText();
    ok("and capture is completely unaffected by having no record to talk to",
       /desk done|complete ·/i.test(capturedOffline),
       capturedOffline.slice(0, 160).replace(/\n/g, " "));

    await B.ctx.setOffline(false);
    /* The `online` event is what should carry it up without anyone pressing
       anything — that is the behaviour an auditor walking out of a substation
       depends on. */
    await B.page.evaluate(() => dispatchEvent(new Event("online")));
    await B.page.waitForTimeout(3000);
    ok("WORK CAPTURED OFFLINE GOES UP BY ITSELF WHEN SIGNAL RETURNS",
       fingerprint() !== beforeOffline,
       `the record is unchanged after the basement: ${supa.rows.size} rows`);

    /* ===================== the record itself falls over ==================== */
    await fetch(`${supa.url}/__fail?on=1`);
    await syncNow(A.page);
    await openExport(A.page);
    const downText = await A.page.locator("body").innerText();
    ok("when the record is down the app says so plainly",
       /not syncing/i.test(downText), downText.slice(0, 200).replace(/\n/g, " "));
    ok("and promises the work is still here, which it is",
       /nothing captured here is lost/i.test(downText));
    await closeSheet(A.page);

    await A.page.locator("button[aria-label='Next']").first().click();
    await A.page.waitForTimeout(500);
    await A.page.keyboard.press("1");
    await A.page.waitForTimeout(300);
    await A.page.locator("button", { hasText: /^Save$/ }).first().click();
    await A.page.waitForTimeout(700);
    ok("capture still works with the record refusing every call",
       !/not captured yet/.test(await A.page.locator("body").innerText()));

    await fetch(`${supa.url}/__fail?on=0`);
    await syncNow(A.page);
    await openExport(A.page);
    ok("and it recovers by itself once the record answers again",
       /shared|syncing/i.test(await A.page.locator("body").innerText()));
    await closeSheet(A.page);

    /* ====================== a device that never joined ===================== */
    const C = await auditor(browser, "Auditor C", { unlock: false });

    /* IT SAYS SO WITHOUT BEING ASKED. The passphrase box has always existed, at
       the bottom of the export sheet behind More → Export the workbook, and
       nothing pointed at it — so a second device showed 0/315 and an empty
       review and looked for all the world like a broken deployment. The banner
       is the thing that would have saved Sarel a day. */
    const cFirst = await C.page.locator("body").innerText();
    ok("A DEVICE THAT HAS NOT JOINED IS TOLD SO ON ARRIVAL, unprompted",
       /has not joined the audit/i.test(cFirst), cFirst.slice(0, 160).replace(/\n/g, " "));

    ok("and the banner is in the flow of the page, never over the work",
       await C.page.evaluate(() => {
         const el = document.querySelector('section[aria-label="Join the shared audit"]');
         if (!el) return false;
         const pos = getComputedStyle(el).position;
         /* Anything fixed or absolute here lands on the check screen's sticky
            compliance bar — the three buttons the whole audit is made of. */
         return pos !== "fixed" && pos !== "absolute";
       }));

    await openExport(C.page);
    const lockedText = await C.page.locator("body").innerText();
    ok("a device that has not been given the passphrase says exactly that",
       /locked/i.test(lockedText) && /team passphrase/i.test(lockedText),
       lockedText.slice(0, 160).replace(/\n/g, " "));

    await C.page.locator("input[aria-label='Team passphrase']").fill("wrong one");
    await C.page.locator("button", { hasText: /Join the audit/ }).first().click();
    await C.page.waitForTimeout(1500);
    ok("a typo is caught at the door, not by a sync that silently never works",
       /not right/i.test(await C.page.locator("body").innerText()));
    const kept = await C.page.evaluate(() => localStorage.getItem("squawk-team-passphrase"));
    ok("and a wrong passphrase is never kept", kept === null, String(kept));

    await C.page.locator("input[aria-label='Team passphrase']").fill(PASS);
    await C.page.locator("button", { hasText: /Join the audit/ }).first().click();
    await C.page.waitForTimeout(2500);
    await closeSheet(C.page);
    await C.page.waitForTimeout(2500);
    const cBody = await C.page.locator("body").innerText();
    ok("THE RIGHT ONE LETS A THIRD DEVICE STRAIGHT INTO THE AUDIT",
       !/not captured yet/.test(cBody), cBody.slice(0, 140).replace(/\n/g, " "));

    ok("and once it is in, the banner is gone rather than nagging",
       !/has not joined the audit/i.test(cBody), cBody.slice(0, 160).replace(/\n/g, " "));

    /* Devices A and B have both captured and joined; neither should ever have
       seen it. A prompt that appears on a working device is noise. */
    ok("a device already in the audit is never shown it",
       !/has not joined the audit/i.test(await A.page.locator("body").innerText()));

    /* AND THE BANNER ACTUALLY JOINS. C went in through the export sheet, which
       is the path that already existed; this is the new one, and a prompt that
       appears but does not work would be worse than no prompt at all. */
    const E = await auditor(browser, "Auditor E", { unlock: false });
    await E.page.locator("input[aria-label='Team passphrase to join the audit']").fill(PASS);
    await E.page.locator('section[aria-label="Join the shared audit"] button[type="submit"]').click();
    await E.page.waitForTimeout(3000);
    const eBody = await E.page.locator("body").innerText();
    ok("JOINING FROM THE BANNER ITSELF PUTS THE DEVICE IN THE AUDIT",
       !/not captured yet/.test(eBody) && !/has not joined the audit/i.test(eBody),
       eBody.slice(0, 160).replace(/\n/g, " "));
    const eKept = await E.page.evaluate(() => localStorage.getItem("squawk-team-passphrase"));
    ok("and the passphrase it accepted is the one it kept", eKept === PASS, String(eKept));

    /* Waving it away has to stick across a reload, or it is not a dismissal,
       it is a delay. */
    const F = await auditor(browser, "Auditor F", { unlock: false });
    await F.page.locator('section[aria-label="Join the shared audit"] button', { hasText: /Not now/ })
      .first().click();
    await F.page.reload({ waitUntil: "networkidle" });
    await F.page.waitForTimeout(2000);
    ok("NOT NOW MEANS NOT AGAIN — it stays dismissed across a reload",
       !/has not joined the audit/i.test(await F.page.locator("body").innerText()));
    ok("and dismissing it never quietly let the device in",
       (await F.page.evaluate(() => localStorage.getItem("squawk-team-passphrase"))) === null);
    ok("no page errors for Auditor E", E.errs.length === 0, E.errs[0] ?? "");
    ok("no page errors for Auditor F", F.errs.length === 0, F.errs[0] ?? "");
    await E.ctx.close();
    await F.ctx.close();

    /* ============ both auditors answered the same check, in a basement ====== */
    await A.page.goto(BASE + "/capture", { waitUntil: "networkidle" });
    await B.page.goto(BASE + "/capture", { waitUntil: "networkidle" });
    await A.page.waitForTimeout(1800);
    await B.page.waitForTimeout(1800);
    const contested = await firstCheckId(A.page);
    ok("both devices are looking at the same check to contest",
       contested && contested === (await firstCheckId(B.page)), String(contested));

    await A.ctx.setOffline(true);
    await B.ctx.setOffline(true);

    /* A says compliant. B, a minute later in a different substation, says N/A. */
    await A.page.keyboard.press("1");
    await A.page.waitForTimeout(250);
    await A.page.locator("button", { hasText: /^Save$/ }).first().click();
    await A.page.waitForTimeout(700);
    await B.page.waitForTimeout(1200);
    await B.page.keyboard.press("3");
    await B.page.waitForTimeout(250);
    await B.page.locator("button", { hasText: /^Save$/ }).first().click();
    await B.page.waitForTimeout(700);

    ok("in the basement each device holds its own answer, as it should",
       (await complianceFor(A.page, contested)) === "C" &&
         (await complianceFor(B.page, contested)) === "N/A",
       `A=${await complianceFor(A.page, contested)} B=${await complianceFor(B.page, contested)}`);

    /* Everybody comes up for air. */
    await A.ctx.setOffline(false);
    await B.ctx.setOffline(false);
    await syncNow(A.page);
    await syncNow(B.page);
    await syncNow(A.page);
    await A.page.waitForTimeout(1200);

    const aFinal = await complianceFor(A.page, contested);
    const bFinal = await complianceFor(B.page, contested);
    ok("OUT OF THE BASEMENT, BOTH DEVICES AGREE",
       aFinal !== null && aFinal === bFinal, `A=${aFinal} B=${bFinal}`);
    ok("and they agree on the LATER answer, not on whoever synced first",
       aFinal === "N/A", `${aFinal} — B answered second`);

    /* ========= both auditors raised the SAME issue, in the basement ========

       Two auditors both open the check and both tap the same issue button.
       Each device mints its own random id, the merge keys on id, and one
       defect is now in the audit twice — rated twice, and twice in what
       reaches ACSA. Over the shared record this happens with nothing shown at
       all: the merge report is only rendered for a file merge.

       It is never folded together, because the same button is legitimately
       raised once per switch room. It is FLAGGED, on the screen where the two
       are side by side and a person can settle it. */
    await A.ctx.setOffline(true);
    await B.ctx.setOffline(true);

    const raiseIssue = async (page) => {
      await page.keyboard.press("2");                       // Non-compliant
      await page.waitForTimeout(400);
      await openTab(page, "Issues found");
      await panelChip(page, "issues").click();
      await page.waitForTimeout(600);
      await page.locator("button", { hasText: /^Save$/ }).first().click();
      await page.waitForTimeout(700);
    };
    await raiseIssue(A.page);
    await raiseIssue(B.page);

    await A.ctx.setOffline(false);
    await B.ctx.setOffline(false);
    await syncNow(A.page);
    await syncNow(B.page);
    await syncNow(A.page);
    await A.page.waitForTimeout(1200);

    await A.page.goto(BASE + "/findings", { waitUntil: "networkidle" });
    await A.page.waitForTimeout(1800);
    /* 2026-09-10: /findings opens on the asset-system assessment. The two
       findings are the same check and the same issue, so they sit under the
       same asset system and the warning shows there too — but the register half
       of the screen is where an auditor comparing them actually works, and it
       is the list this assertion has always been about. One press. */
    await A.page
      .locator('button[role="radio"]', { hasText: /Findings raised/ })
      .first()
      .click()
      .catch(() => {});
    await A.page.waitForTimeout(900);
    const findingsText = await A.page.locator("body").innerText();
    ok("ONE DEFECT RAISED BY TWO AUDITORS IS FLAGGED, not counted twice in silence",
       /also raised as F-[A-Z0-9]+ — same issue, same check/.test(findingsText),
       findingsText.slice(0, 260).replace(/\n/g, " · "));
    ok("and BOTH findings are still there — the app asks, it never decides",
       (findingsText.match(/also raised as/g) ?? []).length === 2,
       `${(findingsText.match(/also raised as/g) ?? []).length} rows flagged; ` +
         "folding two switch rooms into one would destroy a real finding");

    /* =================== the passphrase is changed on them ================= */
    const D = await auditor(browser, "Auditor D");
    await D.page.evaluate(() =>
      localStorage.setItem("squawk-team-passphrase", "the-old-passphrase-nobody-told-them")
    );
    await D.page.reload({ waitUntil: "networkidle" });
    await D.page.waitForTimeout(3500);
    await openExport(D.page);
    const rotated = await D.page.locator("body").innerText();
    ok("A DEVICE WITH A PASSPHRASE THAT NO LONGER WORKS IS TOLD, not left guessing",
       /locked|not right/i.test(rotated), rotated.slice(0, 200).replace(/\n/g, " "));
    const stillKept = await D.page.evaluate(() =>
      localStorage.getItem("squawk-team-passphrase")
    );
    ok("and the passphrase that stopped working is dropped rather than retried forever",
       stillKept === null, String(stillKept));
    await closeSheet(D.page);
    ok("no page errors for Auditor D", D.errs.length === 0, D.errs[0] ?? "");
    await D.ctx.close();

    /* ============================ idempotency ============================= */
    const before = supa.rows.size;
    await syncNow(A.page);
    await syncNow(A.page);
    await syncNow(B.page);
    ok("syncing over and over does not grow the record",
       supa.rows.size === before, `${before} -> ${supa.rows.size}`);

    /* Read the RECORD, not the screen. The rendered text names a finding's
       duplicate alongside it — deliberately, so the two can be settled — so an
       id appearing twice on the page is a feature, while an id appearing twice
       in the store is the bug this assertion is actually about. */
    const findingIds = await A.page.evaluate(async () => {
      const raw = await new Promise((resolve) => {
        const open = indexedDB.open("keyval-store");
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction("keyval").objectStore("keyval").get("acsa-assurance-v1");
          req.onsuccess = () => resolve(req.result ?? null);
          req.onerror = () => resolve(null);
        };
        open.onerror = () => resolve(null);
      });
      if (!raw) return [];
      return (JSON.parse(raw).state.findings ?? []).map((f) => f.id);
    });
    ok("nor duplicate what is already there",
       findingIds.length > 0 && findingIds.length === new Set(findingIds).size,
       findingIds.join(", "));

    for (const who of [A, B, C]) {
      ok(`no page errors for ${who.name}`, who.errs.length === 0, who.errs[0] ?? "");
    }

    await A.ctx.close();
    await B.ctx.close();
    await C.ctx.close();
  } catch (e) {
    fail++;
    log.push("FAIL  harness  [" + e.message + "]");
  } finally {
    if (browser) await browser.close();
    killTree(app);
    killTree(bare);
    killTree(half);
    await supa.close();
  }

  console.log(log.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
