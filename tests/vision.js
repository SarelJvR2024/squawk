/* Does an image byte actually leave?
 *
 *  Every other assertion about ASSIST_VISION reads the source. This one does
 *  not: it stands a stub endpoint in front of the route, sends photographs
 *  through /api/assist, and looks at the bytes the route forwarded. That is the
 *  only way to answer the question the flag exists for — whether a site
 *  photograph of a national key point left the tablet — because a client that
 *  is told not to send images and a server that refuses to forward them look
 *  identical from the outside until you check.
 *
 *  Two servers, both with a key so the route is live:
 *    BASE_NO_VISION   ASSIST_VISION unset  -> the forwarded body must carry NO
 *                                            image block, whatever was sent
 *    BASE_VISION      ASSIST_VISION=1      -> it must carry exactly what was
 *                                            sent, and refuse over-cap requests
 *
 *  Both point ASSIST_ENDPOINT at the stub this file starts.
 *
 *    node tests/vision.js
 *
 *  It starts and stops its own servers; nothing needs to be running first.
 */

const http = require("node:http");
const { spawn } = require("node:child_process");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const STUB_PORT = 3211;
const NO_VISION_PORT = 3212;
const VISION_PORT = 3213;

let pass = 0, fail = 0;
const log = [];
const ok = (n, c, x = "") => {
  c ? (pass++, log.push("PASS  " + n)) : (fail++, log.push("FAIL  " + n + (x ? "  [" + x + "]" : "")));
};

/* ---- the stub the route thinks is Anthropic ---- */
const seen = [];
const stub = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    seen.push(body);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ content: [{ type: "text", text: "stub answer" }] }));
  });
});

const startApp = (port, env) =>
  new Promise((resolve, reject) => {
    const p = spawn("npx", ["next", "start", "-p", String(port)], {
      cwd: ROOT,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: "sk-ant-stub",
        ASSIST_ENDPOINT: `http://127.0.0.1:${STUB_PORT}/v1/messages`,
        ...env,
      },
      stdio: "ignore",
    });
    const t0 = Date.now();
    const poll = async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/api/assist`);
        if (r.ok) return resolve(p);
      } catch {}
      if (Date.now() - t0 > 60000) return reject(new Error(`app on ${port} never came up`));
      setTimeout(poll, 400);
    };
    poll();
  });

const post = (port, body) =>
  fetch(`http://127.0.0.1:${port}/api/assist`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/* A real 1x1 JPEG, base64, no data-URL prefix. */
const TINY_JPEG =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
const img = (n = 1) =>
  Array.from({ length: n }, () => ({ mediaType: "image/jpeg", data: TINY_JPEG }));

const imageBlocks = (raw) => {
  try {
    const j = JSON.parse(raw);
    const content = j.messages?.[0]?.content;
    if (!Array.isArray(content)) return [];
    return content.filter((c) => c.type === "image");
  } catch {
    return [];
  }
};

(async () => {
  let noVision, vision;
  try {
    await new Promise((r) => stub.listen(STUB_PORT, "127.0.0.1", r));

    /* ---------- ASSIST_VISION unset ---------- */
    noVision = await startApp(NO_VISION_PORT, {});

    const avail = await (await fetch(`http://127.0.0.1:${NO_VISION_PORT}/api/assist`)).json();
    ok("availability reports vision off", avail.available === true && avail.vision === false,
       JSON.stringify(avail));

    seen.length = 0;
    const r1 = await post(NO_VISION_PORT, {
      task: "caption",
      context: "Photograph taken during an audit.",
      images: img(3),
    });
    ok("the request still succeeds with vision off", r1.ok, String(r1.status));
    ok("the route forwarded exactly one request", seen.length === 1, String(seen.length));

    /* THE assertion this file exists for. */
    ok("NO image block reached the network", imageBlocks(seen[0]).length === 0,
       `${imageBlocks(seen[0]).length} image block(s) forwarded`);
    ok("and no image byte did either — the payload does not contain the image data",
       seen[0] && !seen[0].includes(TINY_JPEG.slice(0, 48)),
       "the base64 was found in the forwarded body");
    ok("the text of the task still went", seen[0] && seen[0].includes("Describe the photograph"));

    /* ---------- ASSIST_VISION=1 ---------- */
    vision = await startApp(VISION_PORT, { ASSIST_VISION: "1" });

    const avail2 = await (await fetch(`http://127.0.0.1:${VISION_PORT}/api/assist`)).json();
    ok("availability reports vision on", avail2.vision === true, JSON.stringify(avail2));

    seen.length = 0;
    const r2 = await post(VISION_PORT, {
      task: "caption",
      context: "Photograph taken during an audit.",
      images: img(3),
    });
    ok("the request succeeds with vision on", r2.ok, String(r2.status));
    ok("all three images reached the network", imageBlocks(seen[0]).length === 3,
       `${imageBlocks(seen[0]).length} forwarded`);
    ok("they are sent as base64 image blocks in the documented shape",
       imageBlocks(seen[0])[0]?.source?.type === "base64" &&
       imageBlocks(seen[0])[0]?.source?.media_type === "image/jpeg");
    ok("images come before the instruction",
       (() => { const c = JSON.parse(seen[0]).messages[0].content;
                return c[0].type === "image" && c[c.length - 1].type === "text"; })());

    /* ---------- the caps ---------- */
    seen.length = 0;
    const tooMany = await post(VISION_PORT, { task: "caption", context: "x", images: img(9) });
    const tmBody = await tooMany.json();
    ok("nine photographs are refused, not truncated to eight",
       tooMany.status === 400 && seen.length === 0, `${tooMany.status}, forwarded ${seen.length}`);
    ok("and the refusal says why, in a sentence",
       /Too many photographs/.test(tmBody.error ?? ""), tmBody.error ?? "");

    seen.length = 0;
    const big = { mediaType: "image/jpeg", data: "A".repeat(5 * 1024 * 1024) };
    const tooBig = await post(VISION_PORT, { task: "caption", context: "x", images: [big] });
    const tbBody = await tooBig.json();
    ok("an over-size request is refused before anything is forwarded",
       tooBig.status === 413 && seen.length === 0, `${tooBig.status}, forwarded ${seen.length}`);
    ok("and that refusal is readable too",
       /limit is 4 MB/.test(tbBody.error ?? ""), tbBody.error ?? "");

    /* Over-cap must fail the same way whether or not vision is on: an auditor
       should not learn about the limit only on the deployments that use it. */
    seen.length = 0;
    const capOff = await post(NO_VISION_PORT, { task: "caption", context: "x", images: img(9) });
    ok("the same refusal with vision off", capOff.status === 400 && seen.length === 0,
       `${capOff.status}, forwarded ${seen.length}`);

    seen.length = 0;
    const wrongType = await post(VISION_PORT, {
      task: "caption",
      context: "x",
      images: [{ mediaType: "application/pdf", data: TINY_JPEG }],
    });
    ok("a non-image media type is dropped rather than forwarded",
       wrongType.ok && imageBlocks(seen[0]).length === 0,
       `${imageBlocks(seen[0] ?? "").length} forwarded`);
  } catch (e) {
    console.log(log.join("\n"));
    console.error("HARNESS", e.message);
    process.exitCode = 1;
  } finally {
    noVision?.kill();
    vision?.kill();
    stub.close();
  }

  console.log(log.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
