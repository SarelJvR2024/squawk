"use client";

import { useEffect, useState } from "react";
import type { AnswerLibrary } from "./types";

/* The Answer Library — 9,836 researched options across all 324 checks — is
   356 kB gzipped. Only the capture and field screens need it, so it is split
   out of checks.json and fetched on first use rather than shipped in the
   initial bundle. One module-level promise means it loads once per session
   and every subsequent caller gets the resolved map immediately.

   Once loaded it stays in memory, so the field tablet keeps working when the
   airport wifi drops. */

let cache: Record<string, AnswerLibrary> | null = null;
let inflight: Promise<Record<string, AnswerLibrary>> | null = null;

export function loadAnswers(): Promise<Record<string, AnswerLibrary>> {
  if (cache) return Promise.resolve(cache);
  inflight ??= import("@/data/answers.json").then((m) => {
    cache = m.default as unknown as Record<string, AnswerLibrary>;
    return cache;
  });
  return inflight;
}

/** Synchronous peek — non-null only once the library has loaded. */
export function peekAnswers(id: string): AnswerLibrary | null {
  return cache?.[id] ?? null;
}

/** The whole map, or null while it is still loading. */
export function useAnswerLibrary(): Record<string, AnswerLibrary> | null {
  const [lib, setLib] = useState<Record<string, AnswerLibrary> | null>(cache);
  useEffect(() => {
    let live = true;
    loadAnswers().then((l) => {
      if (live) setLib(l);
    });
    return () => {
      live = false;
    };
  }, []);
  return lib;
}

/** One check's options, or null while loading / if the check has none. */
export function useAnswers(checkId: string): AnswerLibrary | null {
  const lib = useAnswerLibrary();
  return lib?.[checkId] ?? null;
}
