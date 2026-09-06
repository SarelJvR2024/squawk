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

/* ------------------------------------------------------------------ result */

console.log(failures === 0 ? "\nPHOTOS OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exit(failures === 0 ? 0 : 1);
