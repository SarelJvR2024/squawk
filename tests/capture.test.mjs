import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* Capture must be real.
 *
 *  Until this suite existed, "Voice note" flipped a boolean and then wrote
 *  `a?.IO[0]?.finding` — the first issue option from the Answer Library — into
 *  the auditor's observation as though it had been dictated on site, with a
 *  fixed `durationSec: 14`. "Photo" wrote a filename and no image. Field mode
 *  did the same with "Dictated on site." and a generated colour swatch.
 *
 *  Nothing about that was visible on screen: the pill said "voice 0:14", the
 *  observation read like an observation, and the export counted an attachment.
 *  It would have reached an ACSA report as evidence of something nobody
 *  recorded.
 *
 *  This suite reads the source rather than running it, the same way
 *  risk-matrix.test.mjs does — the fabrication was in what the code *said*, so
 *  that is what is asserted on. It is a regression guard first and a unit test
 *  second: its whole purpose is that a future edit cannot quietly put a
 *  plausible-looking string back where a recording belongs. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const media = src("lib", "media.ts");
const capture = src("components", "Capture.tsx");
const checkDetail = src("components", "CheckDetail.tsx");
const field = src("app", "(app)", "field", "page.tsx");
const store = src("lib", "store.ts");
const types = src("lib", "types.ts");

/* The UI surfaces where an auditor captures evidence. Library code is excluded
   deliberately: media.ts is allowed to name a duration, because it measures
   one. */
const uiSurfaces = [
  ["CheckDetail.tsx", checkDetail],
  ["field/page.tsx", field],
];

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ------------------------------------------- Part 1: the fabrication is gone */

for (const [name, text] of uiSurfaces) {
  check(
    `${name} does not hardcode a recording duration`,
    !/durationSec:\s*\d/.test(text),
    "a duration must be measured by the recorder, never written as a literal"
  );

  check(
    `${name} does not write a transcript it did not hear`,
    !/transcript:\s*["'`]/.test(text) && !/transcript:\s*a\?\.IO/.test(text),
    "a transcript comes from the dictation engine or the auditor's keyboard"
  );

  check(
    `${name} does not splice a [voice] tag into the observation`,
    !/\[voice\]/.test(text),
    "the recording is evidence beside the observation, not text inside it"
  );

  check(
    `${name} has no hardcoded site photo filename`,
    !/KSIA-P/.test(text),
    "photo names must come from the file or the current entity, not a literal"
  );
}

check(
  "field mode no longer generates fake photographs",
  !/swatch\s*\(/.test(field) && !/data:image\/svg\+xml/.test(field),
  "the colour-swatch placeholder stood in for a camera"
);

/* ------------------------------------------------ Part 2: capture is genuine */

check(
  "media.ts opens a real microphone",
  /navigator\.mediaDevices\??\.?getUserMedia/.test(media),
  "getUserMedia is the only way to reach a microphone"
);

check(
  "media.ts records through MediaRecorder",
  /new MediaRecorder\(/.test(media),
  ""
);

check(
  "the recorder measures elapsed time rather than assuming it",
  /Date\.now\(\)\s*-\s*startedAtRef\.current/.test(media),
  "duration must be derived from the clock"
);

check(
  "the microphone stream is released when recording stops",
  /getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/.test(media),
  "a stream left open keeps the tablet's mic indicator lit"
);

check(
  "recording capability is detected, not assumed",
  /export function supportsRecording/.test(media) &&
    /MediaRecorder\.isTypeSupported/.test(media),
  "iPadOS writes audio/mp4 where Chrome writes audio/webm"
);

check(
  "both capture surfaces use the shared real controls",
  uiSurfaces.every(([, t]) => /VoiceNoteButton/.test(t) && /PhotoButton/.test(t)),
  "a second implementation is how the first one drifted"
);

check(
  "the photo control opens the camera on a tablet",
  /capture="environment"/.test(capture) && /accept="image\/\*"/.test(capture),
  ""
);

/* ------------------------------------ Part 3: an empty transcript stays empty */

check(
  "an absent transcript is left undefined rather than filled",
  /transcript:\s*dict\.transcript\.trim\(\)\s*\|\|\s*undefined/.test(capture),
  "an empty transcript is a correct answer"
);

check(
  "dictation failure does not take the recording down with it",
  /onerror = \(\) => setListening\(false\)/.test(media),
  "the audio is the evidence; the text is the convenience"
);

check(
  "an unavailable microphone is reported, not silently ignored",
  /Microphone permission denied/.test(media) && /NotAllowedError/.test(media),
  ""
);

/* ---------------------------------------- Part 4: blobs stay out of the store */

check(
  "the media store is keyed separately from the persisted audit",
  /const MEDIA_PREFIX = "squawk-media\//.test(media),
  ""
);

check(
  "the persisted store key is unchanged",
  /name: "acsa-assurance-v1"/.test(store),
  "renaming it orphans every in-flight capture on a tablet"
);

check(
  "an attachment carries a blob key, not the bytes",
  /blobKey\?: string/.test(types),
  "base64 in the store rewrites megabytes per keystroke"
);

check(
  "no UI surface writes inline dataUrl bytes",
  uiSurfaces.every(([, t]) => !/dataUrl:\s*/.test(t)),
  "dataUrl is legacy — read for old records, never written"
);

check(
  "object URLs are revoked",
  /URL\.revokeObjectURL/.test(media),
  "a megabyte leaks per photograph viewed otherwise"
);

/* --------------------------------- Part 5: pre-recording records are honest */

check(
  "the store migrates to v4",
  /version: 4/.test(store),
  ""
);

check(
  "records made before capture worked are marked unavailable, not deleted",
  /unavailable: !a\.blobKey && !a\.dataUrl/.test(store) &&
    /unavailable\?: boolean/.test(types),
  "deleting them would shrink a count an auditor may already have reported"
);

check(
  "the UI says so on screen",
  /no audio stored — recorded before capture worked/.test(capture),
  ""
);

/* ------------------------------------------------------------------ result */

console.log(
  failures === 0
    ? "\nCAPTURE OK"
    : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`
);
process.exit(failures === 0 ? 0 : 1);
