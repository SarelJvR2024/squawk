import type { NextRequest } from "next/server";
import { JUDGEMENT, SYSTEM, TASK_PROMPT, type Task } from "@/lib/assistPrompts";

/* The assist endpoint. Everything the model is asked to do is advisory: it
   drafts wording and offers an opinion, and the auditor accepts, edits or
   ignores it. Nothing here writes to the audit record — the client applies a
   result only when someone taps Use.

   The key never reaches the browser. Without ANTHROPIC_API_KEY the route
   reports itself unavailable and the UI hides its assist affordances, so the
   app is fully usable with no model at all.

   What this route sends off the device is the text listed in each task
   below (the actual wording lives in src/lib/assistPrompts.ts, not here —
   see that file's own header if you are here to change what a task says),
   and — only when ASSIST_VISION is 1 — the photographs the auditor is
   asking about. It never sends audio.

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
const MODEL = process.env.ASSIST_MODEL ?? "claude-opus-5";

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
        /* Headroom, not a target — the prompts are what keep the answers
           short, and output is billed on what is generated rather than on the
           ceiling. It has to be headroom now: a thinking model spends part of
           this budget before it writes a word, and 500 was enough to have
           truncated the JSON tasks mid-object and returned nothing. */
        max_tokens: task === "narrative" ? 8000 : 4000,
        output_config: { effort: JUDGEMENT.includes(task) ? "medium" : "low" },
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

    const json = (await r.json()) as {
      content?: { type: string; text?: string }[];
      stop_reason?: string;
      stop_details?: { category?: string | null } | null;
    };

    /* A decline is a 200 with no text, and "the model returned nothing" would
       describe it wrongly — it returned an answer, and the answer was no. Say
       which it was, because the two have different remedies: a decline is
       reworded or done by hand, an empty response is retried. */
    if (json.stop_reason === "refusal") {
      const cat = json.stop_details?.category;
      console.error("assist refusal", cat ?? "(no category)");
      return Response.json(
        {
          error: `The model declined this request${cat ? ` (${cat})` : ""}. Write it yourself, or reword what you are asking about.`,
        },
        { status: 502 }
      );
    }

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
