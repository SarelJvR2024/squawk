import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* Photographs: real, captioned, downscaled, and only sent when someone says so.
 *
 *  Three separate things, and it matters that they stay separate.
 *
 *    Storing    a phone photograph is 4-12 MB as taken. Twenty of those fill a
 *               tablet's quota and the audit stops mid-morning behind an opaque
 *               browser error. Every image is re-encoded to 1600px / q0.82
 *               before it is stored, and the capture timestamp is read off the
 *               original first, because WHEN a photograph was taken is audit
 *               evidence and the canvas re-encode destroys EXIF.
 *
 *    Captioning a photograph with no caption is a JPEG nobody can search,
 *               report on or recognise in six months. It is shown as incomplete
 *               in the same warn colour a finding with no owner uses, and the
 *               export says NO CAPTION rather than leaving a blank cell that
 *               reads as "nothing to say".
 *
 *    Sending    whether a site photograph of a national key point leaves the
 *               device is ACSA's decision. ASSIST_VISION is enforced in the
 *               ROUTE, not the client, so no client change can get round it.
 *               tests/vision.js proves that against a live request; this suite
 *               proves the code says it.
 *
 *  Source-reading, like risk-matrix.test.mjs and capture.test.mjs. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const media = src("lib", "media.ts");
const types = src("lib", "types.ts");
const capture = src("components", "Capture.tsx");
const assistLib = src("lib", "assist.ts");
const route = src("app", "api", "assist", "route.ts");
const advice = src("components", "RootCauseAdvice.tsx");
const detail = src("components", "CheckDetail.tsx");
const findings = src("app", "(app)", "findings", "page.tsx");
const exportsSrc = src("lib", "exports.ts");
const panel = src("components", "ExportPanel.tsx");

let failures = 0;
const check = (name, cond, detailText = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detailText ? `  [${detailText}]` : ""}`);
  }
};

const photosLib = src("lib", "photos.ts");
const sync = src("lib", "sync.ts");
const photoRoute = src("app", "api", "photos", "route.ts");
const store = src("lib", "store.ts");
const shell = src("components", "AppShell.tsx");

/* ------------------------ Part 0: one name, in every place ---------------- */

/* `KSIA-ELE-001_P01` has to mean one image on the tablet, in the zip, in the
   blob store, in the workbook and in a Word report. Everything below hangs off
   that, which is why it is first. */

check(
  "a photograph is named from the check-point it belongs to",
  /export function nextPhotoRef\(prefix: string, existing: Attachment\[\]\)/.test(photosLib) &&
    /_P\$\{String\(highest \+ 1\)\.padStart\(2, "0"\)\}/.test(photosLib),
  "photo-k3j9x2mq appears nowhere a person would look"
);

check(
  "a reference is never reused after a delete",
  /let highest = 0;/.test(photosLib) &&
    /highest = Math\.max\(highest, Number\(n\[1\]\)\)/.test(photosLib) &&
    !/existing\.length \+ 1/.test(photosLib),
  "P02 coming to mean a second image would re-evidence a March finding with a September photograph"
);

check(
  "the name is assigned in the store, not in a screen",
  /ref: nextPhotoRef\(portalIdFor\(get\(\)\.entity, checkId\), r\.attachments\)/.test(store),
  "field mode and the check screen must number by the same rule or they collide"
);

check(
  "photographs captured before this get their names",
  /if \(from < 8\)/.test(store) &&
    /portalIdFor\(entityCode, checkId\)/.test(store) &&
    /const entityCode = key\.split\("\/"\)\[0\];/.test(store),
  "and each keeps the site prefix of the audit it belongs to, not whichever is open at upgrade"
);

check(
  "naming is a pure module the workbook writer can use",
  !/"use client"/.test(photosLib) && /export function photoFilename/.test(photosLib),
  "exports.ts builds a filename and has no business importing a client store to do it"
);

/* ------------------------------ Part 1: stored small, dated, and for real -- */

check(
  "a photograph is downscaled and re-encoded before it is stored",
  /const MAX_EDGE = 1600;/.test(media) &&
    /const JPEG_QUALITY = 0\.82;/.test(media) &&
    /toBlob\(res, "image\/jpeg", JPEG_QUALITY\)/.test(media),
  "twenty untouched phone photographs fill a tablet"
);

check(
  "the capture button stores the prepared image, not the original file",
  /const prepared = await preparePhoto\(file\);/.test(capture) &&
    /await putBlob\(blobKey, prepared\.blob\);/.test(capture) &&
    !/await putBlob\(blobKey, file\);/.test(capture),
  ""
);

check(
  "EXIF DateTimeOriginal is read BEFORE the re-encode destroys it",
  /const takenAt = await exifTakenAt\(file\);/.test(media) &&
    media.indexOf("const takenAt = await exifTakenAt(file);") <
      media.indexOf("toBlob(res, \"image/jpeg\", JPEG_QUALITY)"),
  "when a photograph was taken is audit evidence"
);

check(
  "an undecodable image is kept rather than dropped",
  /return \{\s*\n?\s*blob: file,/.test(media),
  "a photograph that will not re-encode is still better evidence than no photograph"
);

check(
  "several photographs can be taken at once",
  /multiple/.test(capture) && /const files = Array\.from\(e\.target\.files \?\? \[\]\);/.test(capture),
  ""
);

check(
  "the full image never enters the persisted store",
  /thumbDataUrl\?: string;/.test(types) &&
    /The full image lives in the media store under its blobKey/.test(types) &&
    !/dataUrl: prepared/.test(capture),
  "the persist value rewrites on every keystroke"
);

check(
  "deleting a photograph deletes its stored image",
  /const a = r\.attachments\.find\(\(x\) => x\.id === attachmentId\);\s*\n\s*if \(a\?\.blobKey\) void delBlob\(a\.blobKey\);/.test(
    src("lib", "store.ts")
  ),
  "do not orphan blobs"
);

/* ------------------------------------- Part 2: a caption, or it is incomplete */

check(
  "a caption is part of the record, with its source",
  /caption\?: string;/.test(types) && /captionSource\?: "auditor" \| "assistant";/.test(types),
  ""
);

check(
  "a new photograph starts uncaptioned rather than captioned with its filename",
  /caption: "",/.test(capture),
  "a filename is not a description"
);

check(
  "an uncaptioned photograph is shown as incomplete",
  /const uncaptioned = !dead && !caption\.trim\(\);/.test(capture) &&
    /Caption needed/.test(capture) &&
    /borderColor: uncaptioned \? "var\(--warn-line\)"/.test(capture),
  "the same warn treatment a finding with no owner gets"
);

check(
  "typing over a proposed caption makes it the auditor's again",
  /onUpdate\(\{ caption: e\.target\.value, captionSource: "auditor" \}\)/.test(capture),
  ""
);

check(
  "a proposed caption is never applied without the tap that asked for it",
  /const parsed = parseCaption\(raw\);/.test(capture) &&
    /if \(!parsed\) throw new Error/.test(capture),
  "a model answering in prose must produce a visible refusal, not a half-applied caption"
);

check(
  "the caption prompt refuses to describe a photograph it was not given",
  /If no image is supplied with this request, say so in `note`/.test(assistLib),
  "with vision off the caption task has only text — it must say so rather than invent a scene"
);

check(
  "the caption context does not hand the model the conclusion first",
  /A caption must describe what is in the picture/.test(assistLib) &&
    !/observation/.test(assistLib.split("export function captionContext")[1].split("export function")[0]),
  "handing over the finding first produces a caption that agrees with the finding"
);

/* ---------------------------- Part 3: vision is gated in the route ---------- */

check(
  "the flag is off unless explicitly turned on",
  /const VISION = process\.env\.ASSIST_VISION === "1";/.test(route),
  ""
);

check(
  "the route strips images when the flag is off",
  /const images: Img\[\] = VISION\s*\n?\s*\?/.test(route) && /:\s*\[\];/.test(route),
  "the server is the enforcement point — no client change may get round it"
);

check(
  "the client cannot decide this for itself",
  !/vision \?\s*\n?\s*images/.test(route),
  ""
);

check(
  "over-cap requests are refused, not silently truncated",
  /sent\.length > MAX_IMAGES/.test(route) &&
    /Too many photographs for one request/.test(route) &&
    /totalBytes > MAX_IMAGE_BYTES/.test(route) &&
    !/\.slice\(0, MAX_IMAGES\)/.test(route),
  "an answer about eight of nine photographs says nothing about the ninth"
);

check(
  "the caps are the brief's — 8 images, 4 MB",
  /const MAX_IMAGES = 8;/.test(route) && /const MAX_IMAGE_BYTES = 4 \* 1024 \* 1024;/.test(route),
  ""
);

check(
  "only real image types are forwarded",
  /const ALLOWED_MEDIA = \["image\/jpeg", "image\/png", "image\/webp"\];/.test(route) &&
    /ALLOWED_MEDIA\.includes\(i\.mediaType\)/.test(route),
  ""
);

check(
  "the size check runs before the flag is consulted",
  route.indexOf("totalBytes > MAX_IMAGE_BYTES") < route.indexOf("const images: Img[] = VISION"),
  "an auditor should get the same clear refusal whether or not vision happens to be on"
);

check(
  "availability tells the client which sentence to show",
  /vision: VISION,/.test(route) && /export function useVisionOn\(\): boolean/.test(assistLib),
  ""
);

check(
  "the screen says which, in words, wherever a photograph would be sent",
  /Photographs are sent to the assistant for this step/.test(capture) &&
    /Photograph captions are sent; the images themselves are not/.test(capture) &&
    /Photographs are sent to the assistant for this step/.test(advice),
  "one line on screen, not a tooltip"
);

check(
  "the system prompt tells the model what a photograph is and is not",
  /Photographs are evidence, not proof of the auditor's conclusion/.test(route) &&
    /the plate is not legible in this photograph/.test(route),
  ""
);

/* ------------------------- Part 4: root-cause advice, written once ---------- */

check(
  "the advice lives in one component",
  /export default function RootCauseAdvice/.test(advice) &&
    /import RootCauseAdvice from ".\/RootCauseAdvice"/.test(detail) &&
    /import RootCauseAdvice from "@\/components\/RootCauseAdvice"/.test(findings),
  "the same advice written twice drifts apart"
);

check(
  "a candidate outside the register's vocabulary is dropped",
  /export function parseRootCauses\(raw: string, allowed: string\[\]\)/.test(assistLib) &&
    /if \(!allowed\.includes\(c\.cause\)\) continue;/.test(assistLib),
  "a chip an auditor cannot set is worse than one fewer suggestion"
);

check(
  "the question to ask is rendered, and rendered to be read",
  /Ask instead/.test(advice) && /askInstead/.test(advice),
  "a root cause is something the responsible person knows and the auditor does not"
);

check(
  "the prompt says the question is the deliverable",
  /Your real job here is to sharpen the QUESTION, not to answer it/.test(route),
  ""
);

check(
  "picking a cause is the only thing the component can change",
  /onPick: \(cause: string\) => void;/.test(advice) &&
    !/updateFinding|patch\(/.test(advice),
  "the questions are for the room and are never written into the record"
);

check(
  "nothing is suggested at all without a model",
  /if \(!aiOn\) return null;/.test(advice),
  ""
);

/* --------------------------------- Part 5: indexed, and the tablet watched -- */

check(
  "there is a photograph index in the workbook",
  /export function photographsSheet\(x: ExportInput\): Sheet/.test(exportsSrc) &&
    /photographsSheet\(x\),/.test(exportsSrc),
  "a photograph nobody indexed is a photograph nobody will find"
);

check(
  "an uncaptioned photograph is called out in the export, not left blank",
  /: "NO CAPTION",/.test(exportsSrc),
  "a blank cell reads as 'nothing to say'"
);

check(
  "the export distinguishes an auditor's caption from an accepted proposal",
  /"Assistant, accepted by the auditor"/.test(exportsSrc) && /: "Auditor"/.test(exportsSrc),
  "they are different evidence and a reader is entitled to tell them apart"
);

check(
  "findings carry their photographs across",
  /\{ header: "Photographs", width: 12 \}/.test(exportsSrc) &&
    /\{ header: "Photograph captions", width: 60, wrap: true \}/.test(exportsSrc),
  ""
);

check(
  "the tablet's storage is visible before it runs out",
  /export async function photoBudget/.test(media) &&
    /const budget = useState|const \[budget, setBudget\]/.test(panel) &&
    /WARN_BYTES/.test(panel),
  "the browser's own quota error is opaque and arrives on an apron"
);

check(
  "the budget is measured from the stored blobs, not from what the records claim",
  /const b = \(await idbGet\(k\)\) as Blob \| undefined;/.test(media),
  "the records are what would be wrong in the case worth catching"
);

check(
  "uncaptioned photographs are counted where the auditor is about to export",
  /uncaptioned > 0 &&/.test(panel),
  ""
);

/* -------------------- Part 6: it leaves the tablet, and it also stays ------ */

check(
  "the record copy is private",
  /access: "private"/.test(photoRoute) && !/access: "public"/.test(photoRoute),
  "a public blob URL for a national key point is a URL anybody who sees it can keep"
);

check(
  "the local copy is never deleted because a record copy exists",
  !/delBlob|delBlobs|clearAllMedia/.test(sync) && !/delBlob/.test(photoRoute),
  "an auditor on an apron must not need a network to look at a photograph they took an hour ago"
);

check(
  "the object path is validated, not trusted",
  /const PATH = \/\^\[A-Z0-9\]\{2,6\}/.test(photoRoute) && /PATH\.test\(pathname\)/.test(photoRoute),
  "a traversal would put audit evidence somewhere nobody looks for it"
);

check(
  "the stored name is the name the workbook uses",
  /addRandomSuffix: false/.test(photoRoute) &&
    /export function photoObjectPath/.test(photosLib),
  "a random suffix breaks the one thing the naming exists for"
);

check(
  "a retry replaces rather than duplicating",
  /allowOverwrite: true/.test(photoRoute),
  "a dropped connection is the common case; two objects for one reference is worse than an overwrite"
);

check(
  "without a token the route refuses and the app carries on",
  /if \(!token\)/.test(photoRoute) && /status: 503/.test(photoRoute) &&
    /available: !!process\.env\.BLOB_READ_WRITE_TOKEN/.test(photoRoute),
  ""
);

check(
  "the queue is derived from the records, not held beside them",
  /!a\.cloudUrl/.test(sync) && !/localStorage|idbSet\(/.test(sync),
  "a separate queue does not survive a flat battery; 'has a blobKey and no cloudUrl' does"
);

check(
  "uploads run one at a time",
  /for \(const \{ checkId, a \} of todo\)/.test(sync) && !/Promise\.all\(todo/.test(sync),
  "eight parallel uploads on airport wifi is eight timeouts"
);

check(
  "it does not try while offline, and resumes when the network returns",
  /if \(!navigator\.onLine\) break;/.test(sync) && /addEventListener\("online", set\)/.test(sync),
  ""
);

check(
  "a failed upload is recorded on the photograph, not swallowed",
  /cloudError: e instanceof Error \? e\.message/.test(sync) &&
    /not sent —/.test(capture),
  ""
);

check(
  "the shell says when evidence is still only on the device",
  /const sync = usePhotoSync\(\);/.test(shell) && /on device only/.test(shell),
  "an auditor who captured forty photographs on an apron is entitled to know where they are"
);

check(
  "the browser is asked not to evict the audit",
  /export async function requestPersistentStorage/.test(media) &&
    /navigator\.storage\.persist\(\)/.test(media) &&
    /void requestPersistentStorage\(\);/.test(shell),
  "Safari clears storage for a site not visited for about a week"
);

check(
  "and the answer is reported rather than assumed",
  /export async function isStoragePersisted/.test(media) &&
    /persisted === false &&/.test(panel),
  "the browser decides; pretending it agreed is how an audit disappears between site visits"
);

/* ------------------------- Part 7: the images come out as files ------------ */

check(
  "there is a zip of the images, separate from the workbook",
  /export function buildPhotoZip/.test(photosLib) && /zipSync/.test(photosLib),
  "the index is kilobytes and the evidence is not"
);

check(
  "the zip carries a manifest so it reads on its own",
  /MANIFEST\.csv/.test(photosLib),
  "a folder of JPEGs separated from the workbook says nothing"
);

check(
  "it is built from the stored blobs, not from what the records claim",
  /const blob = await getBlob\(a\.blobKey!\);/.test(panel) && /if \(!blob\) continue;/.test(panel),
  "a record pointing at a blob that is not there is the case worth catching"
);

check(
  "the workbook's first photograph column is the filename",
  /\{ header: "File", width: 26 \}/.test(exportsSrc) && /photoFilename\(a\),/.test(exportsSrc),
  "this column is how somebody reading the workbook finds the actual image"
);

check(
  "and every finding lists the files behind it",
  /\{ header: "Photograph files", width: 44, wrap: true \}/.test(exportsSrc) &&
    /photosFor\(x, f\.checkId\)\.map\(photoFilename\)\.join\(" · "\)/.test(exportsSrc),
  ""
);

check(
  "the workbook says where each image actually is",
  /"On the device and in the record store"/.test(exportsSrc) &&
    /"On the device only"/.test(exportsSrc),
  "a row that does not say would let somebody assume a copy exists"
);

/* ---------------- Part 8: the README actually says all of this ------------- */

/* Added because it did not. The vision flag and the storage architecture were
   reported as documented in a previous round and were not: the script that was
   meant to write them asserted its way to a failure before it wrote the file,
   and nothing checked. A doc claim is as checkable as a code claim. */
const readme = fs.readFileSync(path.join(here, "..", "README.md"), "utf8");
for (const [what, needle] of [
  ["the vision flag", "ASSIST_VISION"],
  ["the record store token", "BLOB_READ_WRITE_TOKEN"],
  ["a photographs section", "## Photographs"],
  ["why images stay out of the persist value", "Images never enter the persisted store"],
  ["that the local copy is never deleted", "Never deleted because a record copy exists"],
  ["that the record copy is private", 'access: "private"'],
  ["the naming scheme", "KSIA-ELE-001_P01"],
  ["that retention is undecided", "Retention — still undecided"],
]) {
  check(`README documents ${what}`, readme.includes(needle), needle);
}

/* ------------------------------------------------------------------ result */

console.log(failures === 0 ? "\nPHOTOS OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exit(failures === 0 ? 0 : 1);
