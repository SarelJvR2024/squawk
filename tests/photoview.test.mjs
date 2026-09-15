import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* THE RECORD COPY OF A PHOTOGRAPH, AND THE GATE IN FRONT OF IT.
 *
 * Sarel, on the Visual review screen on his laptop: "the photos are coming
 * through at very low quality, we cant actually use these images."
 *
 * He was looking at the 240px thumbnail. The full 1600px image was in the blob
 * store the whole time; nothing could fetch it, because a `blobKey` resolves
 * only on the device that took the photograph. /api/photos now streams the
 * record copy back to a device that can prove it is on this audit.
 *
 * These assertions are about the gate, because the thing behind it is
 * photographs of a NATIONAL KEY POINT. Four ways it could be opened by
 * accident:
 *
 *  ONE: it starts answering without a passphrase configured. A deployment with
 *  no SQUAWK_TEAM_PASSPHRASE cannot tell an auditor from anybody who can reach
 *  the URL, so it must refuse rather than guess. Same "never falls open" rule
 *  as /api/sync.
 *
 *  TWO: the passphrase comparison stops being constant time, or starts leaking
 *  which pathnames exist by answering differently for a wrong passphrase.
 *
 *  THREE: the pathname stops being validated and the route becomes a reader for
 *  arbitrary objects in the store.
 *
 *  FOUR: somebody "simplifies" it into handing out a signed URL. A signed URL
 *  is a bare link to a key-point photograph that lives outside the app and can
 *  be lifted from a network log. Proxying the bytes keeps the store's URL off
 *  every browser.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, "..", p), "utf8");

let fail = 0;
const log = [];
const ok = (n, c, x = "") => {
  if (c) log.push(`PASS  ${n}`);
  else {
    fail++;
    log.push(`FAIL  ${n}${x ? `  [${x}]` : ""}`);
  }
};

const route = read("src/app/api/photos/route.ts");
const hook = read("src/lib/recordimage.ts");
const shared = read("src/lib/shared.ts");
const review = read("src/app/(app)/review/page.tsx");
const media = read("src/lib/media.ts");

/* ---- ONE: it never falls open ---------------------------------------- */

ok(
  "the route reads the team passphrase server-side",
  /const TEAM_PASS = process\.env\.SQUAWK_TEAM_PASSPHRASE;/.test(route)
);
ok(
  "WITH NO PASSPHRASE CONFIGURED IT REFUSES, rather than serving the image",
  /if \(!TEAM_PASS\) \{[\s\S]{0,400}status: 503/.test(route)
);
ok(
  "and with no store token it refuses too",
  /if \(!token\) \{[\s\S]{0,300}status: 503/.test(route)
);

/* ---- TWO: the comparison, and what a refusal says --------------------- */

ok(
  "the passphrase is compared as digests, in constant time",
  /createHash\("sha256"\)[\s\S]{0,200}timingSafeEqual/.test(route)
);
ok(
  "a wrong passphrase is 401 and says nothing about the real one",
  /passphraseOk\(passphrase\)[\s\S]{0,300}status: 401/.test(route) &&
    !/length|prefix|starts with/i.test(
      route.slice(route.indexOf("That passphrase is not right"), route.indexOf("That passphrase is not right") + 200)
    )
);
/* Scoped to the read function: PATH.test also guards the UPLOAD path earlier
   in the file, and comparing against that one measures nothing. */
const readFn = route.slice(route.indexOf("async function serveFullImage"));
ok(
  "THE PASSPHRASE IS CHECKED BEFORE THE PATHNAME IS, so a refusal cannot be used to probe which photographs exist",
  readFn.indexOf("passphraseOk(passphrase)") < readFn.indexOf("PATH.test(pathname)"),
  `${readFn.indexOf("passphraseOk(passphrase)")} vs ${readFn.indexOf("PATH.test(pathname)")}`
);

/* ---- THREE: it reads photographs, not the store ----------------------- */

ok(
  "the pathname is validated against the photograph-path shape",
  /if \(!PATH\.test\(pathname\)\)[\s\S]{0,160}status: 400/.test(route)
);

/* ---- FOUR: bytes, not a signed URL ------------------------------------ */

ok(
  "the image is STREAMED back, not handed out as a URL",
  /new Response\(found\.stream/.test(route) && !/presignUrl/.test(route)
);
ok(
  "and the response is private and never cached on the way",
  /"cache-control": "private, no-store"/.test(route)
);
ok(
  "the passphrase travels in a JSON body, never a query string",
  /content-type.*application\/json/.test(route) && !/searchParams\.get\("passphrase"\)/.test(route)
);

/* ---- the client prefers local, then record, then preview -------------- */

ok(
  "the hook exists and prefers the LOCAL copy over the network",
  /if \(local \|\| !path\) return;/.test(hook)
);
ok(
  "it falls back to the thumbnail last, and says when that is all it has",
  /thumbOnly: !full && !!\(a\.thumbDataUrl \|\| a\.dataUrl\)/.test(hook)
);
ok(
  "it revokes the object URL, so a day of viewing does not leak",
  /URL\.revokeObjectURL\(objectUrl\)/.test(hook)
);
ok(
  "it reads the passphrase from the ONE exported key, not a repeated literal",
  /export const PASS_KEY = "squawk-team-passphrase";/.test(shared) &&
    /import \{ PASS_KEY \} from "\.\/shared"/.test(hook) &&
    !/"squawk-team-passphrase"/.test(hook)
);
ok(
  "Visual review uses it for both the tile and the lightbox",
  (review.match(/useRecordImage\(/g) || []).length === 2
);

/* ---- and the thumbnail stays a thumbnail ------------------------------ */

ok(
  "THE THUMBNAIL IS STILL 240px — it rides the persisted JSON and was never the fix",
  /drawTo\(img, 240\)\.toDataURL\("image\/jpeg", 0\.6\)/.test(media)
);
ok(
  "the full image is still 1600px, which is what the record copy serves",
  /const MAX_EDGE = 1600;/.test(media)
);

/* ---- AND THE SAME BYTES REACH THE EXPORT AND THE PORTAL ------------------
 *
 *  Looking at a photograph was only half of it. The zip and the SharePoint
 *  upload both read the LOCAL blob and both gave up quietly when it was not
 *  there — so the auditor who joined the audit rather than taking the
 *  photographs exported a short zip with nothing saying so, and uploaded
 *  nothing at all. One fetcher now, local first and the record copy after. */

const exportPanel = read("src/components/ExportPanel.tsx");
const syncPanel = read("src/components/SyncPanel.tsx");

ok(
  "THE ZIP GOES TO THE RECORD COPY for a photograph this device never took",
  /fullPhotoBlob/.test(exportPanel) && !/getBlob/.test(exportPanel)
);
ok(
  "and a photograph it still cannot read is NAMED, never skipped in silence",
  /unreachable\.push/.test(exportPanel) && /NOT IN THIS ZIP/.test(exportPanel),
  "a zip that is quietly short is worse than one that says which images are missing"
);
ok(
  "the gaps ride inside the manifest, so the zip explains itself after it is emailed on",
  /buildPhotoZip\(files, manifest\.join/.test(exportPanel)
);
ok(
  "a partial export is reported in the warn tone, not as a failure",
  /setNote\(/.test(exportPanel) && /var\(--warn-bg\)/.test(exportPanel),
  "red would say the export did not happen and the auditor would run it again"
);
ok(
  "the eligible set is bytes-reachable, not blobKey — the key crosses, the image does not",
  /a\.blobKey \|\| a\.cloudUrl/.test(exportPanel)
);
ok(
  "THE PORTAL UPLOAD USES THE SAME FETCHER",
  /fullPhotoBlob\(f\.attachment/.test(syncPanel)
);
ok(
  "fullPhotoBlob prefers the local copy, so an apron with no signal costs nothing",
  /if \(a\.blobKey\) \{[\s\S]{0,160}return local;/.test(hook)
);
const fullFn = hook.slice(
  hook.indexOf("export async function fullPhotoBlob"),
  hook.indexOf("export interface RecordImage")
);
ok(
  "and it THROWS rather than falling back to the thumbnail",
  /throw new Error\(/.test(fullFn) && !/thumbDataUrl|dataUrl/.test(fullFn),
  "a 240px preview in an evidence library looks like evidence until somebody tries to read it"
);

console.log(log.join("\n"));
if (fail) {
  console.log(`\n${fail} FAILURES`);
  process.exit(1);
}
console.log("\nPHOTO VIEW OK");
