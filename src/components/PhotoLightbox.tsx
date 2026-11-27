"use client";

/** PHOTO INSPECTION — the hover preview and the full-screen lightbox used by the
 *  Triage table and the detail drawer.
 *
 *  THE IMAGE SHOWN IS NEVER THE 240px THUMBNAIL WHEN ANYTHING BETTER EXISTS.
 *  `useRecordImage` (src/lib/recordimage.ts) tries this device's own 1600px
 *  blob first, then the record copy in blob storage through /api/photos, and
 *  only falls back to the thumbnail when neither can be found; when it does,
 *  the lightbox says so in words instead of passing a blur off as evidence.
 *  1600px is the largest copy the app keeps (src/lib/media.ts MAX_EDGE): the
 *  camera original is re-encoded at capture and not stored.
 *
 *  Zoom/pan is plain CSS transform state: wheel and pinch to 400% of the
 *  fitted size, drag to pan, buttons for Zoom in / Zoom out / Fit to screen /
 *  1:1 actual size. Arrow keys move between photos, Escape closes. */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRecordImage } from "@/lib/recordimage";
import type { Attachment } from "@/lib/types";

export interface LightboxPhoto {
  attachment: Attachment;
  /** Asset system the finding belongs to ("General" when none). */
  system: string;
  /** One-line finding summary for the metadata bar. */
  summary: string;
  /** Fallback timestamp (when the finding was raised) if the photo has none. */
  fallbackAt?: number;
}

const MIN = 1;
const MAX = 4;

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function stamp(ms: number | undefined) {
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-ZA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function PhotoLightbox({
  photos,
  index,
  onIndex,
  onClose,
  entityCode,
  visitId,
}: {
  photos: LightboxPhoto[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  entityCode: string;
  visitId: string;
}) {
  const cur = photos[index];
  const img = useRecordImage(cur.attachment, entityCode, visitId);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  /* The view belongs to one photograph: it carries the index it was made for,
     so moving to another photograph reads as "fitted" without an effect. */
  const [raw, setRaw] = useState({ i: index, s: 1, x: 0, y: 0 });
  const [moving, setMoving] = useState(false);
  const view = raw.i === index ? raw : { i: index, s: 1, x: 0, y: 0 };
  const setView = useCallback(
    (fn: ((v: { s: number; x: number; y: number }) => { s: number; x: number; y: number }) | { s: number; x: number; y: number }) =>
      setRaw((prev) => {
        const base = prev.i === index ? prev : { i: index, s: 1, x: 0, y: 0 };
        const n = typeof fn === "function" ? fn(base) : fn;
        return { ...n, i: index };
      }),
    [index]
  );
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; s: number } | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const fit = useCallback(() => setView({ s: 1, x: 0, y: 0 }), [setView]);
  const zoomTo = useCallback((next: number) => {
    setView((v) => {
      const s = clamp(next, MIN, MAX);
      return s === 1 ? { s: 1, x: 0, y: 0 } : { ...v, s };
    });
  }, [setView]);
  const actual = useCallback(() => {
    const el = imgRef.current;
    if (!el || !el.naturalWidth || !el.clientWidth) return;
    zoomTo(el.naturalWidth / el.clientWidth);
  }, [zoomTo]);

  const go = useCallback(
    (d: number) => {
      if (photos.length < 2) return;
      onIndex((index + d + photos.length) % photos.length);
    },
    [index, onIndex, photos.length]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "+" || e.key === "=") setView((v) => ({ ...v, s: clamp(v.s * 1.25, MIN, MAX) }));
      else if (e.key === "-") zoomTo(view.s / 1.25);
      else if (e.key === "0") fit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose, fit, zoomTo, setView, view.s]);

  // Wheel needs a non-passive listener to stop the page scrolling behind.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((v) => {
        const s = clamp(v.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), MIN, MAX);
        return s === 1 ? { s: 1, x: 0, y: 0 } : { ...v, s };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setView]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setMoving(true);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), s: view.s };
      drag.current = null;
    } else {
      drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomTo(pinch.current.s * (d / pinch.current.d));
    } else if (drag.current && view.s > 1) {
      const d = drag.current;
      setView((v) => ({ ...v, x: d.vx + (e.clientX - d.x), y: d.vy + (e.clientY - d.y) }));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      drag.current = null;
      setMoving(false);
    }
  };

  const btn = "rounded-[8px] border px-[10px] py-[6px] text-[12px] font-semibold";
  const btnStyle = { background: "rgba(255,255,255,.1)", borderColor: "rgba(255,255,255,.25)", color: "#fff" } as const;
  const when = stamp(cur.attachment.takenAt) || stamp(cur.fallbackAt);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ background: "rgba(10,6,22,.97)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} style={btnStyle} onClick={() => zoomTo(view.s * 1.25)}>
            Zoom in
          </button>
          <button type="button" className={btn} style={btnStyle} onClick={() => zoomTo(view.s / 1.25)}>
            Zoom out
          </button>
          <button type="button" className={btn} style={btnStyle} onClick={fit}>
            Fit to screen
          </button>
          <button type="button" className={btn} style={btnStyle} onClick={actual}>
            1:1 actual size
          </button>
          <span className="text-[12px]" style={{ color: "rgba(255,255,255,.7)" }} aria-live="polite">
            {Math.round(view.s * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-3">
          {photos.length > 1 && (
            <span className="text-[12px]" style={{ color: "rgba(255,255,255,.7)" }}>
              {index + 1} / {photos.length}
            </span>
          )}
          <button type="button" className={btn} style={btnStyle} onClick={onClose}>
            Close (Esc)
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
        style={{ touchAction: "none", cursor: view.s > 1 ? "grab" : "default" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => (view.s > 1 ? fit() : actual())}
      >
        {img.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local blob/record URL, not a remote asset next/image can optimise
          <img
            ref={imgRef}
            src={img.url}
            alt={cur.attachment.caption || cur.summary}
            draggable={false}
            className="max-h-full max-w-full select-none"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, transformOrigin: "center", transition: moving ? "none" : "transform .12s ease-out" }}
          />
        ) : (
          <span style={{ color: "rgba(255,255,255,.7)" }}>{img.loading ? "Loading full-size image…" : "No image stored for this photograph."}</span>
        )}

        {photos.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              onClick={() => go(-1)}
              className="absolute left-3 top-1/2 h-[44px] w-[44px] -translate-y-1/2 rounded-full border text-[20px]"
              style={btnStyle}
            >
              &#8249;
            </button>
            <button
              type="button"
              aria-label="Next photo"
              onClick={() => go(1)}
              className="absolute right-3 top-1/2 h-[44px] w-[44px] -translate-y-1/2 rounded-full border text-[20px]"
              style={btnStyle}
            >
              &#8250;
            </button>
          </>
        )}
      </div>

      <div className="px-4 py-3 text-[12.5px]" style={{ color: "#fff", background: "rgba(255,255,255,.06)" }}>
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <span>
            <span style={{ color: "rgba(255,255,255,.6)" }}>Asset system </span>
            <strong>{cur.system || "General"}</strong>
          </span>
          {when && (
            <span>
              <span style={{ color: "rgba(255,255,255,.6)" }}>Captured </span>
              {when}
            </span>
          )}
          {cur.attachment.width && cur.attachment.height && (
            <span style={{ color: "rgba(255,255,255,.6)" }}>
              {cur.attachment.width} &times; {cur.attachment.height}px
            </span>
          )}
        </div>
        <div className="mt-1" style={{ color: "rgba(255,255,255,.85)" }}>
          {cur.summary}
        </div>
        {img.thumbOnly && (
          <div className="mt-1 text-[11.5px]" style={{ color: "#FFD27A" }}>
            Showing the small preview only. The full-size image is not on this device and could not be fetched from the record{img.error ? ` (${img.error})` : ""}.
          </div>
        )}
      </div>
    </div>
  );
}

/** A thumbnail's hover preview: ~280x180, after a 200 ms pause, sharp (the
 *  full image, not the 36px tile blown up). Never intercepts the pointer. */
export function PhotoHoverPreview({
  attachment,
  anchor,
  entityCode,
  visitId,
}: {
  attachment: Attachment;
  anchor: DOMRect;
  entityCode: string;
  visitId: string;
}) {
  const img = useRecordImage(attachment, entityCode, visitId);
  const W = 280;
  const H = 180;
  const left = clamp(anchor.left + anchor.width / 2 - W / 2, 8, window.innerWidth - W - 8);
  const below = anchor.bottom + 8 + H < window.innerHeight;
  const top = below ? anchor.bottom + 8 : Math.max(8, anchor.top - 8 - H);
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[80] overflow-hidden rounded-[10px] border"
      style={{ left, top, width: W, height: H, background: "var(--panel)", borderColor: "var(--line-2)", boxShadow: "var(--e3)" }}
    >
      {img.url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img.url} alt="" className="h-full w-full object-cover" />
      )}
    </div>
  );
}

/** Wraps a thumbnail: after 200 ms of hover or keyboard focus, shows the preview. */
export function useHoverPreview(delay = 200) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const off = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setRect(null);
  }, []);
  const on = useCallback(
    (el: HTMLElement) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setRect(el.getBoundingClientRect()), delay);
    },
    [delay]
  );
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return { rect, on, off };
}
