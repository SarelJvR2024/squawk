"use client";

/** A place to put your name, with a finger.
 *
 *  The only genuinely new capability the project's own roadmap identified, and
 *  it is what five of the eight TK-003 forms are worth nothing without:
 *  "an attendance register without signatures is a list somebody typed".
 *
 *  Held to the same four rules as a photograph (docs/REGISTERS.md §1), because
 *  a signature is at least as hard to obtain again:
 *
 *    OWN KEY      the bytes go to the media store under their own key, never
 *                 into the persisted store value, which rewrites on every
 *                 keystroke elsewhere in the app.
 *    A REFERENCE  so the workbook, the safety file and the record agree on what
 *                 to call it.
 *    BACKED UP    a signature that exists only on one tablet is a signature that
 *                 goes with the tablet, and the person who would have to sign
 *                 again is at another airport by then. Backing up is the sync's
 *                 job; this returns what the sync needs.
 *    NEVER SILENT if the bytes could not be stored, this says so and reports
 *                 nothing to the caller. A row that reads as signed when no mark
 *                 exists is worse than an unsigned one, because nobody goes
 *                 looking for it.
 *
 *  POINTER EVENTS, not touch or mouse. One code path covers a finger, a stylus
 *  and a mouse, and `setPointerCapture` is what keeps a stroke attached when a
 *  finger slides off the edge of the pad mid-signature — without it the line
 *  simply stops, which on a small pad happens constantly.
 *
 *  The canvas is sized to its own box at the device's pixel ratio. Drawing into
 *  a 300×120 canvas stretched by CSS gives a signature that looks like it was
 *  written with a marker pen through a sock, and this is somebody's name. */

import { useCallback, useEffect, useRef, useState } from "react";
import { putBlob } from "@/lib/media";
import { Btn } from "@/components/ui/primitives";
import { IconCheck, IconX } from "@/components/ui/icons";

const uid = () => Math.random().toString(36).slice(2, 10);

/** The stroke, in CSS pixels. Thin enough for a real signature, thick enough to
 *  survive being scaled down into a workbook cell. */
const LINE_WIDTH = 2.2;

export interface CapturedSignature {
  blobKey: string;
  signedName: string;
  signedAt: number;
  width: number;
  height: number;
  bytes: number;
}

/** True once anything at all has been drawn. A canvas that was touched once and
 *  carries a single dot is still a mark somebody made; a canvas nobody touched
 *  is not, and must not be storable. */
function hasInk(strokes: number): boolean {
  return strokes > 0;
}

export function SignaturePad({
  name,
  onSigned,
  onCancel,
}: {
  /** Pre-fills the typed name. It is still editable — the person signing says
   *  what their name is, not the row. */
  name: string;
  onSigned: (s: CapturedSignature) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [strokes, setStrokes] = useState(0);
  const [typed, setTyped] = useState(name);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /* Sized to the box it is actually in, at the device's pixel ratio, and
     re-sized if the box changes — a tablet rotating mid-signature would
     otherwise leave the drawing surface and the visible box disagreeing about
     where a finger is. */
  const fit = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rect.width * ratio));
    const h = Math.max(1, Math.round(rect.height * ratio));
    if (c.width === w && c.height === h) return;
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    /* Read off the stylesheet rather than hard-coded, so a signature drawn in
       dark mode is not invisible ink on its own background. */
    ctx.strokeStyle =
      getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#000";
  }, []);

  useEffect(() => {
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit]);

  function pointIn(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    /* Keeps the stroke attached to this canvas when the finger slides past its
       edge. Without it a signature that runs off the right-hand side simply
       stops there, and people sign large. */
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = pointIn(e);
    last.current = p;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    /* A dot, so a full stop or the tittle of an i is not lost. */
    ctx.beginPath();
    ctx.arc(p.x, p.y, LINE_WIDTH / 2, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    setStrokes((n) => n + 1);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    const p = pointIn(e);
    if (!ctx || !last.current) return;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  }

  function up(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = false;
    last.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function clear() {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    setStrokes(0);
    setFailed(null);
  }

  async function save() {
    const c = canvasRef.current;
    if (!c || !hasInk(strokes)) return;
    setSaving(true);
    setFailed(null);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        /* PNG, not JPEG: a signature is a few dark strokes on nothing, and
           JPEG's blocking artefacts around thin high-contrast lines are exactly
           the wrong compression for it. Transparent background, so it drops
           onto a letterhead or a workbook cell without a white box. */
        c.toBlob((b) => resolve(b), "image/png")
      );
      if (!blob) throw new Error("the canvas could not be read");
      const blobKey = `sig-${uid()}`;
      await putBlob(blobKey, blob);
      onSigned({
        blobKey,
        signedName: typed.trim(),
        signedAt: Date.now(),
        width: c.width,
        height: c.height,
        bytes: blob.size,
      });
    } catch (err) {
      /* NOTHING is reported to the caller on failure, so no row can come to
         read as signed without bytes behind it. The message stays up until the
         next attempt rather than flashing: somebody is standing at the gate
         waiting to be let through, and a signature that was not stored is a
         thing they have to do again. */
      setFailed(
        `Not stored — ${
          err instanceof Error ? err.message : "the device refused it"
        }. Nothing has been signed. Try again, or record it on paper.`
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="rounded-[9px] border p-2.5"
      style={{ background: "var(--sunken)", borderColor: "var(--line)" }}
    >
      <label
        className="mb-2 block font-mono text-[9px]"
        style={{ color: "var(--ink-4)" }}
      >
        NAME, AS THEY GIVE IT
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          aria-label="Name of the person signing"
          placeholder="Full name"
          className="mt-1 w-full rounded-[9px] border px-3 py-2 text-[13px]"
          style={{ background: "var(--bg)", borderColor: "var(--line)" }}
        />
      </label>

      <canvas
        ref={canvasRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label="Sign here with your finger"
        role="img"
        className="h-[132px] w-full touch-none rounded-[9px] border"
        style={{ background: "var(--bg)", borderColor: "var(--line-2)" }}
      />
      <p className="mt-1 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
        {hasInk(strokes) ? "SIGN ABOVE — TAP CLEAR TO START AGAIN" : "SIGN ABOVE WITH YOUR FINGER"}
      </p>

      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn onClick={clear} disabled={!hasInk(strokes)}>
          <IconX /> Clear
        </Btn>
        <Btn
          variant="primary"
          onClick={() => void save()}
          /* A typed name with no mark is a list entry, not a signature, so both
             are required and the button says which is missing. */
          disabled={!hasInk(strokes) || !typed.trim() || saving}
        >
          <IconCheck /> {saving ? "Storing…" : "Sign"}
        </Btn>
      </div>

      {failed && (
        <p
          role="alert"
          className="mt-2 text-[10.5px] font-semibold leading-[1.4]"
          style={{ color: "var(--bad)" }}
        >
          {failed}
        </p>
      )}
    </div>
  );
}
