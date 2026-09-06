import type { NextRequest } from "next/server";

/* Transcription of a recorded voice note.
 *
 *  This is the one place in the application where a RECORDING leaves the
 *  tablet, and it does so only when an auditor taps Transcribe on a specific
 *  note. Nothing is uploaded in the background, on save, or on a schedule.
 *  Without ELEVENLABS_API_KEY the route reports itself unavailable, the button
 *  never appears, and voice notes behave as they always have: recorded, played
 *  back and kept locally, with a transcript typed by hand if one is wanted.
 *
 *  Why a service at all. The browser's own dictation engine is live-only — it
 *  can hear a note while it is being spoken but cannot be pointed at a
 *  recording afterwards — it is absent on iPadOS Safari, which is the likely
 *  field tablet, and it is pinned to a single language. TPJV's auditors switch
 *  between English and Afrikaans inside one sentence, which is precisely what
 *  a single-language engine turns to nonsense. Scribe auto-detects instead, so
 *  `language_code` is deliberately left unset unless the deployment names one.
 *
 *  The audio is streamed straight through to the service and never written to
 *  disk here. The key never reaches the browser. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENDPOINT = "https://api.elevenlabs.io/v1/speech-to-text";
const MODEL = process.env.TRANSCRIBE_MODEL ?? "scribe_v1";
/* Unset means auto-detect, which is what the code-switching needs. Set
   TRANSCRIBE_LANGUAGE only if a site turns out to be reliably monolingual. */
const LANGUAGE = process.env.TRANSCRIBE_LANGUAGE ?? "";

/* A serverless request body is capped well below this by the platform. The
   limit is here so an over-long note fails with a sentence an auditor can act
   on rather than a bare 413 from the edge. At the bitrate MediaRecorder uses
   for speech this is roughly twenty minutes of talking. */
const MAX_BYTES = 4 * 1024 * 1024;

export async function GET() {
  return Response.json({
    available: !!process.env.ELEVENLABS_API_KEY,
    model: MODEL,
  });
}

export async function POST(req: NextRequest) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return Response.json(
      {
        error: "No transcription service is configured for this deployment.",
        available: false,
      },
      { status: 503 }
    );
  }

  let audio: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("audio");
    if (f instanceof File) audio = f;
  } catch {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }

  if (!audio || audio.size === 0) {
    return Response.json({ error: "No audio was sent." }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return Response.json(
      {
        error:
          "That note is too long to transcribe in one piece. Record shorter notes — a minute or two each.",
      },
      { status: 413 }
    );
  }

  const upstream = new FormData();
  upstream.set("file", audio, audio.name || "note.webm");
  upstream.set("model_id", MODEL);
  if (LANGUAGE) upstream.set("language_code", LANGUAGE);
  /* Speaker labels and "[door slams]" style event tags are noise in a note
     one auditor dictated to themselves, and both cost accuracy. */
  upstream.set("diarize", "false");
  upstream.set("tag_audio_events", "false");

  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "xi-api-key": key },
      body: upstream,
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error("transcribe upstream", r.status, detail.slice(0, 400));
      return Response.json(
        {
          error:
            r.status === 401
              ? "The transcription service rejected the deployment's key."
              : `The transcription service returned ${r.status}.`,
        },
        { status: 502 }
      );
    }

    const json = (await r.json()) as { text?: string; language_code?: string };
    const text = (json.text ?? "").trim();

    /* Silence, or speech the service could not make out, comes back empty.
       That is a real answer and it is reported as one — an empty transcript is
       never filled in with something plausible. */
    if (!text) {
      return Response.json(
        { error: "Nothing could be made out in that recording." },
        { status: 422 }
      );
    }

    return Response.json({ text, language: json.language_code ?? null, model: MODEL });
  } catch (e) {
    console.error("transcribe", e);
    return Response.json(
      { error: "Could not reach the transcription service." },
      { status: 502 }
    );
  }
}
