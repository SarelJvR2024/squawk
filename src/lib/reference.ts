"use client";

import { useEffect, useState } from "react";
import files from "@/data/acsaDocFiles.json";

/** Per-check reference notes, built from the register and ACSA's procedures
 *  (see tests/reference.test.mjs). Fetched on first use, like the Answer
 *  Library, so it stays out of the initial bundle. Read-only. */
export interface RefSpec {
  text: string;
  means?: string;
  check?: string;
  source?: string;
}
export interface CheckReference {
  icao?: { status: "cited" | "indicative"; items: string[] };
  freq?: { tasks: string[]; meaning: string[] };
  evidence?: string[];
  site?: { look?: string | null; pass?: string | null };
  demo?: { approach?: string; ask?: string; test?: string; proves?: string };
  specs?: RefSpec[];
}

let cache: Record<string, CheckReference> | null = null;
let inflight: Promise<Record<string, CheckReference>> | null = null;

export function loadReference(): Promise<Record<string, CheckReference>> {
  if (cache) return Promise.resolve(cache);
  inflight ??= import("@/data/checkReference.json").then((m) => {
    cache = m.default as unknown as Record<string, CheckReference>;
    return cache;
  });
  return inflight;
}

export function useReferenceMap(): Record<string, CheckReference> | null {
  const [m, setM] = useState(cache);
  useEffect(() => {
    let live = true;
    loadReference().then((x) => live && setM(x));
    return () => {
      live = false;
    };
  }, []);
  return m;
}

export interface AcsaFile {
  folder: string;
  name: string;
  url: string;
}
export const ACSA_FILES = files as AcsaFile[];
/** SharePoint root of the ACSA library — the folder links below sit under it. */
export const ACSA_LIBRARY_ROOT =
  "https://tpjv.sharepoint.com/01 Projects/ACSA Asset Assurance/03. Received from ACSA/Policies and Procedures";

/** The library entry for a cited document code. Matched on the code at the
 *  start of the file name; null where the library holds it under another code
 *  (e.g. D090 001M is held as D090MAN) — the caller then links the root. */
export function acsaFileFor(doc: string): AcsaFile | null {
  const d = doc.replace(/\s+/g, " ").trim().toLowerCase();
  return ACSA_FILES.find((f) => f.name.toLowerCase().startsWith(d + " ") || f.name.toLowerCase() === d) ?? null;
}

/** ICAO texts are licensed, so the app links to where they are bought or held
 *  rather than carrying them. */
export const ICAO_STORE_URL = "https://store.icao.int";

/** One ICAO line from a check, split into document and provision. */
export function icaoDocName(line: string): string {
  return line.split(/,\s|\s[–—-]\s|\(/)[0].trim();
}
