/* The record copy — and the copy that stays.
 *
 *  Sarel's requirement in one sentence: the photographs must go to cloud
 *  storage for the record, AND they must remain on the capturing device. Those
 *  pull against each other in the obvious implementation — upload, then free
 *  the space — and the failure would be invisible until an auditor tried to
 *  look at their own photograph on an apron with no signal.
 *
 *  So this drives a real browser against a real route with a stub blob store
 *  standing in for Vercel, and checks both halves: the image left, and the
 *  image is still here.
 *
 *  It starts and stops its own server.  node tests/record.js
 */

const http = require("node:http");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const STUB_PORT = 3221;
const APP_PORT = 3222;

let pass = 0, fail = 0;
const log = [];
const ok = (n, c, x = "") => {
  c ? (pass++, log.push("PASS  " + n)) : (fail++, log.push("FAIL  " + n + (x ? "  [" + x + "]" : "")));
};

const PIXEL_JPEG =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

/* Stands in for the Vercel Blob API. Records what it was asked to store. */
const stored = [];
const stub = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    stored.push({ url: req.url, headers: req.headers, bytes: body.length });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        url: `http://127.0.0.1:${STUB_PORT}/stored${req.url}`,
        downloadUrl: `http://127.0.0.1:${STUB_PORT}/stored${req.url}`,
        pathname: String(req.url).replace(/^\//, ""),
        contentType: "image/jpeg",
        contentDisposition: "inline",
      })
    );
  });
});

const startApp = () =>
  new Promise((resolve, reject) => {
    const p = spawn("npx", ["next", "start", "-p", String(APP_PORT)], {
      cwd: ROOT,
      env: {
        ...process.env,
        BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_stubstore_stubtoken",
        VERCEL_BLOB_API_URL: `http://127.0.0.1:${STUB_PORT}`,
      },
      stdio: "ignore",
    });
    const t0 = Date.now();
    const poll = async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${APP_PORT}/api/photos`);
        if (r.ok) return resolve(p);
      } catch {}
      if (Date.now() - t0 > 60000) return reject(new Error("app never came up"));
      setTimeout(poll, 400);
    };
    poll();
  });

const mediaKeys = (page) =>
  page.evaluate(
    () =>
      new Promise((res) => {
        const req = indexedDB.open("keyval-store");
        req.onsuccess = () => {
          const all = req.result.transaction("keyval").objectStore("keyval").getAllKeys();
          all.onsuccess = () =>
            res(all.result.filter((k) => String(k).startsWith("squawk-media/photo-")).length);
        };
      })
  );

(async () => {
  let app, browser;
  try {
    await new Promise((r) => stub.listen(STUB_PORT, "127.0.0.1", r));
    app = await startApp();

    const avail = await (await fetch(`http://127.0.0.1:${APP_PORT}/api/photos`)).json();
    ok("the route reports a record store is configured", avail.available === true, JSON.stringify(avail));

    browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(String(e)));

    await p.goto(`http://127.0.0.1:${APP_PORT}/capture`, { waitUntil: "networkidle" });
    await p.waitForTimeout(2200);

    await p.locator('input[type=file][accept="image/*"]').first().setInputFiles({
      name: "coupler.jpg", mimeType: "image/jpeg", buffer: Buffer.from(PIXEL_JPEG, "base64"),
    });
    await p.waitForTimeout(1800);

    const body = await p.locator("body").innerText();
    ok("the photograph is named from its check-point",
       /KSIA-[A-Z]{3}-\d{3}_P01/.test(body), (body.match(/KSIA-\S+_P\d\d/) || ["none"])[0]);

    const keysAfterCapture = await mediaKeys(p);
    ok("the image is stored locally on capture", keysAfterCapture >= 1, String(keysAfterCapture));

    /* The queue drains on its own — no button pressed. */
    for (let i = 0; i < 40 && stored.length === 0; i++) await p.waitForTimeout(400);

    ok("it reaches the record store without anyone asking", stored.length === 1, `${stored.length} uploads`);
    /* The SDK sends the object name as a query parameter rather than as a URL
       path, so decode it rather than matching the raw request line. */
    const storedPath = decodeURIComponent(
      new URL(stored[0]?.url ?? "/", "http://x").searchParams.get("pathname") ?? ""
    );
    ok("under the path the workbook refers to",
       /^FALE\/2026-09\/KSIA-[A-Z]{3}-\d{3}_P01\.jpg$/.test(storedPath), storedPath);
    ok("foldered by site and visit, so the store is browsable",
       storedPath.startsWith("FALE/2026-09/"), storedPath);
    ok("with real bytes, not an empty body", (stored[0]?.bytes ?? 0) > 100, String(stored[0]?.bytes));

    /* THE assertion this file exists for. */
    const keysAfterUpload = await mediaKeys(p);
    ok("and the local copy is STILL on the device afterwards",
       keysAfterUpload === keysAfterCapture, `${keysAfterCapture} -> ${keysAfterUpload}`);

    await p.waitForTimeout(1200);
    const after = await p.locator("body").innerText();
    ok("the row says where the photograph now is", /in the record store/.test(after),
       after.slice(0, 120).replace(/\n/g, " "));
    ok("and the shell stops warning once nothing is outstanding",
       !/on device only/.test(after));

    /* It survives a reload with both copies intact and is not re-uploaded. */
    const before = stored.length;
    await p.reload({ waitUntil: "networkidle" });
    await p.waitForTimeout(3000);
    ok("a reload does not re-upload what is already stored", stored.length === before,
       `${before} -> ${stored.length}`);
    ok("and the image is still local after a reload", (await mediaKeys(p)) === keysAfterCapture);
    ok("no page errors anywhere in the path", errs.length === 0, errs[0] || "");

    await p.screenshot({ path: "/home/claude/shots/record-copy.png" });
    await ctx.close();
  } catch (e) {
    console.log(log.join("\n"));
    console.error("HARNESS", e.message);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    app?.kill();
    stub.close();
  }

  console.log(log.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
