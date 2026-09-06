import type { NextRequest } from "next/server";

/* The assist endpoint. Everything the model is asked to do is advisory: it
   drafts wording and offers an opinion, and the auditor accepts, edits or
   ignores it. Nothing here writes to the audit record — the client applies a
   result only when someone taps Use.

   The key never reaches the browser. Without ANTHROPIC_API_KEY the route
   reports itself unavailable and the UI hides its assist affordances, so the
   app is fully usable with no model at all.

   What this route sends off the device is text and only text — the material
   listed in each task below. It never sends a photograph and never sends audio.
   It is no longer the only route that sends anything, though: see
   /api/transcribe, which sends the audio of a voice note when an auditor asks
   for that note to be transcribed, and the browser's own dictation engine,
   which the auditor now has to switch on. All three are the design document's
   Q4 question and all three are off until a key is set or a switch is thrown. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.ASSIST_MODEL ?? "claude-sonnet-4-5";
const MAX_INPUT = 24_000;

type Task =
  | "observation"      // turn tapped chips into one clean observation
  | "finding"          // tidy a finding into one audit-grade sentence
  | "explain"          // plain-English reading of what this check requires
  | "rating"           // an opinion on severity and likelihood, with reasons
  | "narrative"        // draft the discipline section of the report
  | "transcript";      // turn a spoken note into the written answer

const SYSTEM = `You are assisting a Thabile-Pridin JV auditor during an Airports Company South Africa asset assurance audit at a South African airport.

House rules, in order of importance:
1. Never invent a fact, a figure, a date, an interval, a clause number or an ACSA document number. Work only from the text you are given. If the text does not settle something, say plainly that it does not.
2. Where ACSA states no threshold, that absence is itself the audit point. Say so; do not fill the gap with an industry norm.
3. Write as an auditor writes: third person, past tense, factual, specific, no adjectives of praise or blame. "The register was produced but three of eleven entries were unsigned" — not "poor record keeping was evident".
4. South African context: the OHS Act 85 of 1993 and its regulations, SANS standards, SACAA Part 139, ICAO Annex 14 and Doc 9137, DoEL and ECSA registration. British spelling.
5. You advise. The auditor decides. Never state a rating as settled, and never imply an action has been agreed.
6. Be brief. An observation is one to three sentences. A finding is one sentence.`;

const TASK_PROMPT: Record<Task, string> = {
  observation:
    "Compose the observation for this check from the material below. One to three sentences, ready to paste into the audit record. Return the observation text alone, with no preamble, heading or quotation marks.",
  finding:
    "Rewrite the finding below as a single audit-grade sentence stating what was found — not what should happen next. Return the sentence alone.",
  explain:
    "Explain what this check requires, in plain English, for an auditor who has not read the underlying procedure. Cover: what ACSA's own documents demand, what the acceptance threshold is (or say clearly that ACSA states none), and what 'good' looks like on the day. Four sentences at most.",
  rating:
    "Give your opinion on how this finding rates on ACSA's B170 001M matrix: severity A (Catastrophic) to E (Minor), likelihood 1 (Not likely) to 5 (Expected). Answer in this shape and nothing else:\nSeverity: <letter> — <five words>\nLikelihood: <number> — <five words>\nWhy: <one sentence>\nThe audit team rates as a group and may well disagree with you; frame it as a view, not a verdict.",
  transcript:
    "Below is a verbatim transcript of a voice note an auditor dictated at the asset, followed by the check it was recorded against. Spoken notes ramble, restart, switch between English and Afrikaans mid-sentence, and carry filler. Rewrite it as the written observation for this check.\n\nRules for this task specifically:\n- Carry across every fact, number, unit, quantity, location and item the auditor said, exactly as said. A number is the whole value of this record; changing 40mm to 40cm, or dropping one of three items, is the worst thing you can do here.\n- Where the auditor spoke Afrikaans, write the observation in English, but keep any proper noun, plant name, equipment tag or ACSA document reference in the form they said it.\n- Drop the filler, the false starts, the asides to other people and anything said about the recording itself.\n- Do not add a fact the auditor did not say, do not resolve something they left uncertain, and do not soften or sharpen their judgement. If they said they were unsure, the observation says so.\n- If the note is too garbled or too sparse to make an observation from, say exactly that in one sentence instead of inventing one.\nReturn the observation text alone, with no preamble, heading or quotation marks.",
  narrative:
    "Draft the narrative for this discipline's section of the audit report from the captured material below. Lead with the overall position, then what was found, then what remains open. Do not list every check. No headings, no bullet points, three paragraphs at most.",
};

export async function GET() {
  return Response.json({ available: !!process.env.ANTHROPIC_API_KEY, model: MODEL });
}

export async function POST(req: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return Response.json(
      { error: "No model is configured for this deployment.", available: false },
      { status: 503 }
    );
  }

  let body: { task?: Task; context?: string };
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

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
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
        messages: [{ role: "user", content: `${TASK_PROMPT[task]}\n\n---\n${context}` }],
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
