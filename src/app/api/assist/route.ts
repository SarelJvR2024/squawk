import type { NextRequest } from "next/server";
import {
  LIKELIHOODS,
  LIKELIHOOD_DEF,
  SEVERITIES,
  SEVERITY_DEF,
} from "@/lib/risk";

/* The assist endpoint. Everything the model is asked to do is advisory: it
   drafts wording and offers an opinion, and the auditor accepts, edits or
   ignores it. Nothing here writes to the audit record — the client applies a
   result only when someone taps Use.

   The key never reaches the browser. Without ANTHROPIC_API_KEY the route
   reports itself unavailable and the UI hides its assist affordances, so the
   app is fully usable with no model at all.

   What this route sends off the device is the text listed in each task below,
   and — only when ASSIST_VISION is 1 — the photographs the auditor is asking
   about. It never sends audio.

   ASSIST_VISION is enforced HERE, not in the client. Site photographs of a
   national key point leaving the device is ACSA's decision to make, not the
   build's, so the switch lives on the server where a client cannot get round
   it: with the flag unset the images are dropped from the request before it is
   assembled, and the affordance still works on captions alone.

   The other routes that send anything: /api/transcribe sends the audio of a
   voice note when an auditor asks for that note to be transcribed, and the
   browser's own dictation engine, which the auditor has to switch on. All of it
   is the design document's Q4 question and all of it is off until a key is set
   or a switch is thrown. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.ASSIST_MODEL ?? "claude-sonnet-4-5";

/** Where the request actually goes.
 *
 *  Configurable because the README already offers this as the answer to Q4: if
 *  ACSA's governance requires the data to stay in their tenant, point this at an
 *  in-tenant endpoint and nothing in the UI changes. It is also what lets
 *  tests/vision.js prove — against a real request rather than by reading the
 *  code — that no image byte leaves when ASSIST_VISION is off. */
const ENDPOINT = process.env.ASSIST_ENDPOINT ?? "https://api.anthropic.com/v1/messages";
const MAX_INPUT = 24_000;

/** Off unless explicitly turned on. See the header note. */
const VISION = process.env.ASSIST_VISION === "1";

/* Caps, refused rather than silently trimmed. An auditor who attaches nine
   photographs and gets an answer about eight has been told nothing about the
   ninth, which is the one they were probably asking about. */
const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_MEDIA = ["image/jpeg", "image/png", "image/webp"];

interface Img {
  mediaType: string;
  /** base64, no data-URL prefix. */
  data: string;
  /** A line naming what this image belongs to, sent immediately before it.
   *
   *  Consolidation is the reason this exists. Eight photographs in one flat
   *  block are eight pictures of an airport; the same eight, each preceded by
   *  "KSIA-ELE-014_P02 — on finding F-3K9QP", let the model say *which* two
   *  findings its photographs show to be the same physical thing. Without the
   *  attribution the answer cannot be checked, and an ungrounded grouping is
   *  worse than none. */
  label?: string;
}

type Task =
  | "observation"      // turn tapped chips into one clean observation
  | "finding"          // tidy a finding into one audit-grade sentence
  | "explain"          // plain-English reading of what this check requires
  | "rating"           // an opinion on severity and likelihood, with reasons
  | "narrative"        // draft the discipline section of the report
  | "transcript"       // turn a spoken note into the written answer
  | "caption"          // describe one photograph, factually
  | "rootcause"        // candidate root causes, and the question to ask instead
  | "hazard"           // what event does this finding expose
  | "consolidate"      // group findings that describe one physical thing
  | "reassess";        // re-read a hazard after the walkthrough

/** The B170 001M scales, BUILT FROM src/lib/risk.ts rather than restated here.
 *
 *  This exists because restating them was a live defect. The prompt used to
 *  read "severity A (Catastrophic) to E (Minor), likelihood 1 (Not likely) to
 *  5 (Expected)", and both halves were wrong:
 *
 *    · E is NEGLIGIBLE. Minor is D. The bottom of the scale was named one
 *      notch too high.
 *    · "Not likely to Expected" is a GENERIC probability scale. B170 001M's
 *      likelihood is occurrence history — Extremely Improbable, Improbable,
 *      Remote, Occasional, Frequent — and its level 3 means "unlikely but
 *      could possibly occur", where the generic reading of level 3 is
 *      "Likely". The opposite.
 *
 *  Every rating opinion the assistant has ever given was formed against that.
 *  The same inversion had already been caught once inside risk.ts, and
 *  tests/risk-matrix.test.mjs was written to stop it returning — but the wrong
 *  words were in a DIFFERENT FILE from the matrix, so the suite guarding the
 *  matrix could not see them.
 *
 *  Restating a scale is the bug. So this is generated: there is now one source
 *  of these words, and a prompt that disagrees with the matrix is not
 *  expressible. tests/risk-matrix.test.mjs asserts the route derives rather
 *  than restates. */
const B170_SCALES = [
  "Severity, verbatim from cl. 4.3.1 — use these letters and these meanings, not a generic scale:",
  ...SEVERITIES.map(
    (s) => `  ${s} — ${SEVERITY_DEF[s.charAt(0)].consequence}`
  ),
  "",
  "Likelihood, verbatim from cl. 4.3.2. NOTE: this axis is OCCURRENCE HISTORY, not probability. Level 3 means \"unlikely but could possibly occur\", NOT \"likely\":",
  ...LIKELIHOODS.map((l) => {
    const d = LIKELIHOOD_DEF[l.charAt(0)];
    return `  ${l}${d.gloss ? ` (${d.gloss})` : ""} — ${d.meaning}`;
  }),
  "",
  "Cells are written likelihood-first: 3A is likelihood 3, severity A.",
].join("\n");

const SYSTEM = `You are assisting a Thabile-Pridin JV auditor during an Airports Company South Africa asset assurance audit at a South African airport.

House rules, in order of importance:
1. Never invent a fact, a figure, a date, an interval, a clause number or an ACSA document number. Work only from the text you are given. If the text does not settle something, say plainly that it does not.
2. Where ACSA states no threshold, that absence is itself the audit point. Say so; do not fill the gap with an industry norm.
3. Write as an auditor writes: third person, past tense, factual, specific, no adjectives of praise or blame. "The register was produced but three of eleven entries were unsigned" — not "poor record keeping was evident".
4. South African context: the OHS Act 85 of 1993 and its regulations, SANS standards, SACAA Part 139, ICAO Annex 14 and Doc 9137, DoEL and ECSA registration. British spelling.
5. You advise. The auditor decides. Never state a rating as settled, and never imply an action has been agreed.
6. Be brief. An observation is one to three sentences. A finding is one sentence.
7. Photographs are evidence, not proof of the auditor's conclusion. Describe only what is visible. Do not infer a maintenance history, a date, a rating or a cause from an image. Where the image is unclear, say so rather than guessing — "the plate is not legible in this photograph" is a useful answer.`;

const TASK_PROMPT: Record<Task, string> = {
  observation:
    "Compose the observation for this check from the material below. One to three sentences, ready to paste into the audit record. Return the observation text alone, with no preamble, heading or quotation marks.",
  finding:
    "Rewrite the finding below as a single audit-grade sentence stating what was found — not what should happen next. Return the sentence alone.",
  explain:
    "Explain what this check requires, in plain English, for an auditor who has not read the underlying procedure. Cover: what ACSA's own documents demand, what the acceptance threshold is (or say clearly that ACSA states none), and what 'good' looks like on the day. Four sentences at most.",
  rating:
    `Give your opinion on how this finding rates on ACSA's B170 001M matrix.\n\n${B170_SCALES}\n\nAnswer in this shape and nothing else:\nSeverity: <letter> — <five words>\nLikelihood: <number> — <five words>\nWhy: <one sentence>\nThe audit team rates as a group and may well disagree with you; frame it as a view, not a verdict.`,
  transcript:
    "Below is a verbatim transcript of a voice note an auditor dictated at the asset, followed by the check it was recorded against. Spoken notes ramble, restart, switch between English and Afrikaans mid-sentence, and carry filler. Rewrite it as the written observation for this check.\n\nRules for this task specifically:\n- Carry across every fact, number, unit, quantity, location and item the auditor said, exactly as said. A number is the whole value of this record; changing 40mm to 40cm, or dropping one of three items, is the worst thing you can do here.\n- Where the auditor spoke Afrikaans, write the observation in English, but keep any proper noun, plant name, equipment tag or ACSA document reference in the form they said it.\n- Drop the filler, the false starts, the asides to other people and anything said about the recording itself.\n- Do not add a fact the auditor did not say, do not resolve something they left uncertain, and do not soften or sharpen their judgement. If they said they were unsure, the observation says so.\n- If the note is too garbled or too sparse to make an observation from, say exactly that in one sentence instead of inventing one.\nReturn the observation text alone, with no preamble, heading or quotation marks.",
  caption:
    'Describe the photograph supplied, for an audit record. One line, under 25 words, factual, naming what is shown and its visible condition. No judgement, no cause, no rating, no date. If something an auditor would want — a serial plate, a gauge reading, a label — is present but cannot be made out, say so in `note` rather than guessing at it.\nReturn JSON and nothing else:\n{"caption":"<the line>","legible":<true if the subject is clear enough to describe usefully, else false>,"note":"<what could not be made out, or an empty string>"}',
  rootcause:
    'Propose the root causes that could explain the finding below.\n\nA root cause is something the responsible person knows and the auditor does not. Your real job here is to sharpen the QUESTION, not to answer it — `askInstead` is the most valuable field you will write, and a candidate with a good question and low confidence is worth more than a confident guess.\n\nRules:\n- Two to four candidates, ranked most likely first.\n- `cause` MUST be exactly one of the categories listed in the context under "Root-cause categories". Do not invent one, do not reword one.\n- `reasoning` is one sentence and must tie to something actually in the evidence. If the evidence does not support a cause, do not offer it.\n- `confidence` is high only where the evidence itself settles it, which is rare at this stage.\n- `askInstead` is the question to put to the responsible person that would confirm or kill this cause. Leave it empty only when the evidence already settles the matter.\nReturn JSON and nothing else:\n{"candidates":[{"cause":"<category>","reasoning":"<one sentence>","confidence":"<high|medium|low>","askInstead":"<question, or empty>"}]}',
  hazard:
    'Name the hazard the finding below exposes.\n\nRate the hazard, not the document. A missing maintenance record is not itself the risk — the risk is the event the maintenance was preventing, and that is what an audit rates. "Register not signed" is a finding; "loss of traceability on a fuel hydrant nobody can prove was serviced" is a hazard.\n\nRules:\n- One to three hazards, most significant first. Most findings expose one.\n- `event` is under 15 words and names an EVENT, not a document, a process or a state of paperwork.\n- `why` names the control that failed and what it was protecting against.\n- Do not rate it. Severity and likelihood are the audit team\'s to agree.\n- Where the finding does not support naming an event, say so in `why` and give `confidence` low rather than reaching.\nReturn JSON and nothing else:\n{"hazards":[{"event":"<under 15 words>","description":"<one or two sentences>","why":"<what control failed and what it was protecting against>","confidence":"<high|medium|low>"}]}',
  consolidate:
    'Below are findings from one audit. Group the ones that describe the SAME physical thing or the same exposure into hazards.\n\nDifferent disciplines write the same defect up in their own language: Electrical records a substation with no gaseous suppression, Process Safety records a fire-detection gap in the same room, and it is one hazard with two findings behind it. That is what this is for.\n\nWhere photographs are supplied, use them to test whether two findings describe the same physical item. Two write-ups in different disciplines\' language frequently show the same defect. Say in the note when a photograph is what made you group them, and name which photographs.\n\nRules:\n- A finding may appear in at most one group. Leave a finding out entirely rather than forcing it.\n- Do not group by discipline, by asset system or by severity. Group by the physical thing or the exposure.\n- A group of one is legitimate where a finding is its own hazard.\n- `event` is under 15 words and names the event, not the paperwork.\n- Do not rate anything.\nReturn JSON and nothing else:\n{"groups":[{"event":"<under 15 words>","description":"<one or two sentences>","why":"<what control failed and what it was protecting against>","findingIds":["F-XXXXX"],"note":"<why these belong together; name the photographs if a photograph is what showed it>","confidence":"<high|medium|low>"}]}',
  reassess:
    'Re-read the hazard below after the site walkthrough. Photographs from the walkthrough are supplied where the deployment sends them.\n\nDescribe only what is visible. A photograph may reveal a condition nobody wrote up — raise that as a separate hazard. It may not be used to raise a likelihood on its own: likelihood on this scale is occurrence history, which a photograph cannot show.\n\nThat last rule matters. A rusty panel in a photograph tells you about condition, not about how often the event has occurred, and moving likelihood on the strength of an image is the wrong reasoning applied to the right evidence.\n\nRules:\n- Say what the walkthrough changed, if anything. "Nothing seen on site changes this" is a good answer and often the right one.\n- `newHazards` is for conditions visible in the photographs that no finding covers. Empty is normal.\n- Do not agree a rating. Where you think the rating should move, say so in `ratingComment` as a view, with the reason, and leave it to the team.\n- Name which photographs you are describing.\nReturn JSON and nothing else:\n{"note":"<what the walkthrough did or did not change>","photographsSeen":["<file or reference>"],"ratingComment":"<a view on the rating and why, or empty>","newHazards":[{"event":"<under 15 words>","why":"<what it exposes>"}]}',
  narrative:
    "Draft the narrative for this discipline's section of the audit report from the captured material below. Lead with the overall position, then what was found, then what remains open. Do not list every check. No headings, no bullet points, three paragraphs at most.",
};

export async function GET() {
  return Response.json({
    available: !!process.env.ANTHROPIC_API_KEY,
    model: MODEL,
    /* The client reads this to word the on-screen line correctly. It does NOT
       read it to decide whether to send images — the route drops them either
       way. */
    vision: VISION,
  });
}

export async function POST(req: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return Response.json(
      { error: "No model is configured for this deployment.", available: false },
      { status: 503 }
    );
  }

  let body: { task?: Task; context?: string; images?: Img[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }

  const task = body.task;
  const context = (body.context ?? "").slice(0, MAX_INPUT);
  if (!task || !(task in TASK_PROMPT)) {
    return Response.json({ error: "Unknown task." }, { status: 400 });
  }
  if (!context.trim()) {
    return Response.json({ error: "Nothing to work from." }, { status: 400 });
  }

  /* Images, and the gate. Order matters: refuse an over-cap request BEFORE
     deciding whether vision is on, so an auditor gets the same clear answer
     either way rather than a silent success that quietly dropped four
     photographs. */
  const sent = Array.isArray(body.images) ? body.images : [];
  if (sent.length > MAX_IMAGES) {
    return Response.json(
      {
        error: `Too many photographs for one request: ${sent.length}, and the limit is ${MAX_IMAGES}. Ask about fewer at a time.`,
      },
      { status: 400 }
    );
  }
  const totalBytes = sent.reduce((n, i) => n + (i?.data?.length ?? 0), 0);
  if (totalBytes > MAX_IMAGE_BYTES) {
    return Response.json(
      {
        error: `Those photographs come to ${(totalBytes / 1024 / 1024).toFixed(1)} MB and the limit is ${MAX_IMAGE_BYTES / 1024 / 1024} MB. Ask about fewer at a time.`,
      },
      { status: 413 }
    );
  }

  /* THE ENFORCEMENT POINT. With ASSIST_VISION unset this is an empty array and
     no image byte reaches the network, whatever the client sent. */
  const images: Img[] = VISION
    ? sent
        .filter(
          (i) =>
            i && typeof i.data === "string" && ALLOWED_MEDIA.includes(i.mediaType)
        )
        .map((i) => ({
          mediaType: i.mediaType,
          data: i.data,
          ...(typeof i.label === "string" && i.label.trim()
            ? { label: i.label.trim() }
            : {}),
        }))
    : [];

  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: task === "narrative" ? 1200 : 500,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            /* Images first, then the instruction: the model reads the request
               with the evidence already in front of it. */
            content: [
              ...images.flatMap((i) => [
                ...(i.label
                  ? [{ type: "text" as const, text: i.label.slice(0, 200) }]
                  : []),
                {
                  type: "image" as const,
                  source: { type: "base64" as const, media_type: i.mediaType, data: i.data },
                },
              ]),
              { type: "text" as const, text: `${TASK_PROMPT[task]}\n\n---\n${context}` },
            ],
          },
        ],
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error("assist upstream", r.status, detail.slice(0, 400));
      return Response.json(
        { error: `The model service returned ${r.status}.` },
        { status: 502 }
      );
    }

    const json = (await r.json()) as { content?: { type: string; text?: string }[] };
    const text = (json.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("")
      .trim();

    if (!text) return Response.json({ error: "The model returned nothing." }, { status: 502 });
    return Response.json({ text, model: MODEL });
  } catch (e) {
    console.error("assist", e);
    return Response.json({ error: "Could not reach the model service." }, { status: 502 });
  }
}
