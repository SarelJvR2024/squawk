"use client";

import { useMemo } from "react";
import { ACSA_FILES, ACSA_LIBRARY_ROOT, ICAO_STORE_URL, icaoDocName, useReferenceMap } from "@/lib/reference";

/** Library → where the actual documents are. ACSA's are on TPJV SharePoint
 *  (sign-in required); ICAO's are licensed, so only the list of what the
 *  register points to and where to obtain it. */
export function DocumentAccess() {
  const map = useReferenceMap();
  const folders = useMemo(() => {
    const m = new Map<string, { url: string; names: string[] }>();
    for (const f of ACSA_FILES) {
      const e = m.get(f.folder) ?? { url: f.url, names: [] };
      e.names.push(f.name);
      m.set(f.folder, e);
    }
    return Array.from(m.entries());
  }, []);
  const icao = useMemo(() => {
    const m = new Map<string, { cited: number; ind: number }>();
    for (const r of Object.values(map ?? {})) {
      if (!r.icao) continue;
      for (const l of new Set(r.icao.items.map(icaoDocName))) {
        const e = m.get(l) ?? { cited: 0, ind: 0 };
        if (r.icao.status === "cited") e.cited++;
        else e.ind++;
        m.set(l, e);
      }
    }
    return Array.from(m.entries()).sort((a, b) => b[1].cited + b[1].ind - (a[1].cited + a[1].ind));
  }, [map]);
  const box = { borderColor: "var(--line-2)", background: "var(--panel)" } as const;
  return (
    <div className="mb-4 flex flex-col gap-3">
      <section className="rounded-[11px] border px-3 py-2.5" style={box}>
        <div className="mb-1 text-[13px] font-semibold">ACSA documents ({ACSA_FILES.length})</div>
        <p className="mb-1.5 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
          On TPJV SharePoint — sign-in required.{" "}
          <a href={ACSA_LIBRARY_ROOT} target="_blank" rel="noreferrer" className="underline">
            Open the whole library
          </a>
        </p>
        <ul className="flex flex-col gap-1 text-[12.5px]">
          {folders.map(([name, e]) => (
            <li key={name}>
              <a href={e.url} target="_blank" rel="noreferrer" className="underline">
                {name}
              </a>{" "}
              <span style={{ color: "var(--ink-3)" }}>({e.names.length})</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-[11px] border px-3 py-2.5" style={box}>
        <div className="mb-1 text-[13px] font-semibold">ICAO documents the register points to</div>
        <p className="mb-1.5 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
          Licensed texts, not held in the app. Get them from the{" "}
          <a href={ICAO_STORE_URL} target="_blank" rel="noreferrer" className="underline">
            ICAO store
          </a>
          . Counts are checks that cite the document / checks where it is only a topic match.
        </p>
        {!map ? (
          <p className="text-[12px]">Loading…</p>
        ) : (
          <ul className="flex flex-col gap-0.5 text-[12.5px]">
            {icao.map(([n, c]) => (
              <li key={n}>
                {n}{" "}
                <span className="font-mono text-[10.5px]" style={{ color: "var(--ink-3)" }}>
                  {c.cited} / {c.ind}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
