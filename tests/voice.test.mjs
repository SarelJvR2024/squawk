import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* Voice notes: recorded always, sent never unless asked.
 *
 *  Three things in this app can put an auditor's words somewhere other than
 *  the tablet, and they are not the same decision:
 *
 *    live text     the browser's dictation engine, which is NOT on-device —
 *                  Chrome streams the audio to its vendor's speech service.
 *                  It used to start itself on every recording and said so
 *                  nowhere. It is now a switch, off by default.
 *    Transcribe    sends one recording to the transcription service, on a tap,
 *                  and stores what came back word for word.
 *    Write it up   sends that verbatim text to the model to be turned into the
 *                  written observation.
 *
 *  The recording itself is none of those. It is made, stored and played back
 *  locally, and nothing here may make that conditional on a key, a switch or a
 *  network. That is the first thing this suite checks.
 *
 *  The second is the seam between the three steps. A transcript is what was
 *  said; a revision is what the model thinks it should read like. If a
 *  revision ever overwrites the transcript, the one thing that can catch a
 *  dropped item or a changed number is gone, and nobody would know. So they
 *  are separate fields, both kept, and only an auditor's tap moves either into
 *  the record.
 *
 *  Source-reading, like risk-matrix.test.mjs and capture.test.mjs, because
 *  what is being guarded is what the code says. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const store = src("lib", "store.ts");
const types = src("lib", "types.ts");
const media = src("lib", "media.ts");
const assistLib = src("lib", "assist.ts");
const assistRoute = src("app", "api", "assist", "route.ts");
const transcribeRoute = src("app", "api", "transcribe", "route.ts");
const capture = src("components", "Capture.tsx");
const detail = src("components", "CheckDetail.tsx");
const field = src("app", "(app)", "field", "page.tsx");
const shell = src("components", "AppShell.tsx");

let failures = 0;
const check = (name, cond, detailText = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detailText ? `  [${detailText}]` : ""}`);
  }
};

/* ------------------------------- Part 1: recording is never conditional --- */

check(
  "the recorder is started before any of this is considered",
  /const ok = await rec\.start\(\);/.test(capture) &&
    !/if \(dictationOn\)[\s\S]{0,60}rec\.start\(\)/.test(capture),
  "the audio is the evidence — it cannot depend on a switch or a service"
);

check(
  "the blob is written to the media store on every note",
  /await putBlob\(blobKey, result\.blob\);/.test(capture),
  ""
);

check(
  "playback reads the stored blob, not a transcript",
  /const \{ url, missing \} = useBlobUrl\(a\.blobKey\);/.test(capture) &&
    /<audio controls src=\{src\}/.test(capture),
  "a note that cannot be played back is not evidence of anything"
);

check(
  "nothing in the recorder path checks for a key or a network",
  !/ANTHROPIC_API_KEY|ELEVENLABS_API_KEY|navigator\.onLine/.test(media),
  "src/lib/media.ts must stay offline-only"
);

/* --------------------------------- Part 2: live text is opt-in ------------ */

check(
  "the preference exists and is off by default",
  /dictation: boolean;/.test(store) && /dictation: false,/.test(store),
  ""
);

check(
  "the preference is persisted",
  /partialize:[\s\S]*?dictation: s\.dictation,/.test(store),
  "an auditor turning it on must not find it off again after a reload"
);

check(
  "an upgrading tablet lands with it off",
  /if \(from < 7\)[\s\S]*?st\.dictation = false;/.test(store),
  "v6 and earlier ran dictation on every recording — the safe side of a consent question is off"
);

check(
  "dictation only starts when the auditor has switched it on",
  /if \(ok && dictationOn && dict\.supported\) dict\.start\(\);/.test(capture),
  ""
);

check(
  "a transcript is only taken from the engine when it was allowed to run",
  /transcript: \(dictationOn && dict\.transcript\.trim\(\)\) \|\| undefined,/.test(capture),
  "otherwise a stale transcript from a previous note could be stamped on this one"
);

check(
  "the engine running is visible on screen while it runs",
  /recording && dictationOn && dict\.supported && \(/.test(capture) &&
    /speech sent to the browser/.test(capture),
  "consent given once in a panel is not the auditor seeing it is on right now"
);

check(
  "the shell carries the switch",
  /checked=\{dictation\}/.test(shell) &&
    /onChange=\{\(e\) => setDictation\(e\.target\.checked\)\}/.test(shell),
  ""
);

check(
  "the switch says where the audio actually goes",
  /streaming the audio to its vendor/.test(shell) && /on Chrome\s*\n?\s*that is Google/.test(shell),
  "'live text' on its own does not tell anyone what they are agreeing to"
);

/* ------------------------------ Part 3: transcription is per-note and opt-in */

check(
  "the route reports its own availability",
  /export async function GET\(\)/.test(transcribeRoute) &&
    /available: !!process\.env\.ELEVENLABS_API_KEY/.test(transcribeRoute),
  ""
);

check(
  "without a key the route refuses rather than half-working",
  /if \(!key\) \{[\s\S]*?status: 503/.test(transcribeRoute),
  ""
);

check(
  "the button only appears where the service is configured",
  /const canTranscribe = useTranscribeAvailable\(\);/.test(capture) &&
    /const showTranscribe = [^;]*canTranscribe;/.test(capture),
  "a control that always fails is worse than no control"
);

check(
  "the audio is streamed through, never written to disk",
  !/writeFile|createWriteStream|\/tmp\//.test(transcribeRoute),
  "an audit recording must not be left on a serverless filesystem"
);

check(
  "language is auto-detected rather than pinned to English",
  /const LANGUAGE = process\.env\.TRANSCRIBE_LANGUAGE \?\? "";/.test(transcribeRoute) &&
    /if \(LANGUAGE\) upstream\.set\("language_code", LANGUAGE\);/.test(transcribeRoute),
  "the auditors switch into Afrikaans mid-sentence; a pinned language turns that to nonsense"
);

check(
  "an unintelligible recording is reported, not filled in",
  /if \(!text\) \{[\s\S]*?Nothing could be made out/.test(transcribeRoute),
  "an invented transcript is fabricated evidence — the thing this app exists not to produce"
);

check(
  "an over-long note fails with a sentence, not a bare 413 from the edge",
  /audio\.size > MAX_BYTES/.test(transcribeRoute) && /Record shorter notes/.test(transcribeRoute),
  ""
);

check(
  "what comes back is stored verbatim, with its provenance",
  /transcript: text,\s*\n\s*transcriptSource: "service",/.test(capture),
  ""
);

check(
  "the provenance of a transcript is a persisted field",
  /transcriptSource\?: "browser" \| "service";/.test(types),
  "a reader has to be able to tell a live guess from a service transcription from typing"
);

check(
  "re-transcribing clears the rewrite of the text it replaced",
  /transcribedAt: Date\.now\(\),\s*\n\s*revised: undefined,/.test(capture),
  "a suggestion left sitting under a transcript it did not come from is a lie on screen"
);

/* --------------------------- Part 4: the rewrite never becomes the record -- */

check(
  "the rewrite is a separate field from what was said",
  /transcript\?: string;/.test(types) && /revised\?: string;/.test(types),
  ""
);

check(
  "the assist route carries the task",
  /\| "transcript"/.test(assistRoute) && /^\s*transcript:/m.test(assistRoute),
  ""
);

check(
  "the prompt forbids inventing and insists the numbers carry across",
  /Carry across every fact, number, unit, quantity, location and item/.test(assistRoute) &&
    /Do not add a fact the auditor did not say/.test(assistRoute),
  "a misheard 40mm silently corrupts a trend for months"
);

check(
  "the prompt would rather say it cannot than make something up",
  /too garbled or too sparse[\s\S]{0,80}say exactly that/.test(assistRoute),
  ""
);

check(
  "only the transcript and the check text are sent — never the audio",
  /export function transcriptContext\(transcript: string, check: Check, r\?: Response\)/.test(
    assistLib
  ) && !/blob|FormData/.test(assistLib.split("transcriptContext")[1] ?? ""),
  ""
);

check(
  "the rewrite step is offered only where a model is configured",
  /writeUp=\{\s*\n?\s*aiOn/.test(detail) && /writeUp=\{\s*\n?\s*aiOn/.test(field),
  "both capture surfaces, or one of them silently drops the feature"
);

check(
  "the rewrite is labelled as not being in the record",
  /Suggested wording — not in the record/.test(capture),
  ""
);

check(
  "nothing reaches the observation without a tap",
  /onAccept=\{\(text\) => \{/.test(detail) &&
    !/onUpdate\(\{ revised[\s\S]{0,120}appendObservation/.test(capture),
  "Capture.tsx must not be able to write to the audit record at all"
);

check(
  "accepting appends rather than replacing what the auditor typed",
  /onAccept=\{\(text\) => \{\s*\n\s*appendObservation\(check\.id, text\);/.test(detail) &&
    /appendObservation\(c\.id, text\);/.test(field),
  "an auditor who already wrote something has not asked for it to be discarded"
);

check(
  "writing a transcript back cannot rename the evidence it belongs to",
  /const \{ id: _i, blobKey: _b, createdAt: _c, \.\.\.safe \} = patch;/.test(store),
  "a patch carrying a blobKey would repoint an attachment at another recording"
);

/* --------------------------- Part 5: the app says what it does ------------ */

check(
  "the help panel no longer claims the model is the only thing that sends data",
  !/it is the one thing in this app\s*\n?\s*that sends anything off the device/.test(shell),
  "that was true before Transcribe existed and before dictation was named"
);

check(
  "the panel names all three, and says they are off until switched on",
  /Three things can send data off this device/.test(shell) &&
    /all three are off until someone turns them on/.test(shell),
  ""
);

check(
  "the panel still states that photographs and audio never reach the model",
  /Photographs are never sent to\s*\n?\s*it, and audio never is either\./.test(shell),
  "the AI claim was accurate and must stay accurate, not be watered down"
);

check(
  "the assist route's own header no longer claims to be the only egress",
  /\/api\/transcribe sends the audio of a/.test(assistRoute) &&
    !/the ONLY thing in the app\s*\n?\s*that sends anything off the device/.test(assistRoute),
  "the next person to read that file must not be told something untrue"
);

/* The header grew again when vision arrived, and the claim it makes is now
   narrower and still has to be true: text always, images only behind the flag,
   audio never. */
check(
  "and it says exactly what it does send",
  /and — only when ASSIST_VISION is 1 — the photographs the auditor is asking\s*\n\s*about\. It never sends audio\./.test(
    assistRoute
  ),
  ""
);

/* ------------------------------------------------------------------ result */

console.log(
  failures === 0 ? "\nVOICE OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`
);
process.exit(failures === 0 ? 0 : 1);
