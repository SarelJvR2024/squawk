"use client";

import Link from "next/link";
import type { Check } from "@/lib/types";
import { acsaFileFor, ACSA_LIBRARY_ROOT, ICAO_STORE_URL, useReferenceMap } from "@/lib/reference";

const sub = { color: "var(--ink-3)" } as const;
const body = { color: "var(--ink-2)" } as const;

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="label-xs mb-1">{title}</div>
      {children}
    </section>
  );
}
function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-4 text-[12.5px] leading-[1.7]" style={body}>
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}
function Nil({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12.5px]" style={sub}>
      {children}
    </p>
  );
}

/** Everything the audit needs to know about one check in one place: how
 *  often, evidence, what to see, what to explain, the specs explained, and
 *  the ACSA and ICAO documents behind it. Read-only. */
export function ReferencePanel({ check }: { check: Check }) {
  const map = useReferenceMap();
  const r = map?.[check.id];
  const seen = new Set<string>();
  const docs = check.acsaDocs.flatMap((d) => (d.doc && !seen.has(d.doc) && seen.add(d.doc) ? [{ ...d, doc: d.doc }] : []));
  return (
    <div className="flex flex-col gap-4">
      <Sec title="Specs to measure against">
        {!map ? (
          <Nil>Loading…</Nil>
        ) : r?.specs?.length ? (
          <ol className="flex flex-col gap-2">
            {r.specs.map((s, i) => (
              <li key={i} className="rounded-[8px] border px-[10px] py-[8px]" style={{ borderColor: "var(--line-2)", background: "var(--sunken)" }}>
                <div className="text-[12.5px] leading-[1.55]" style={body}>
                  {s.text}
                </div>
                {s.means && (
                  <div className="mt-1 text-[12px]" style={sub}>
                    <b>Means:</b> {s.means}
                  </div>
                )}
                {s.check && (
                  <div className="text-[12px]" style={sub}>
                    <b>Check:</b> {s.check}
                  </div>
                )}
                {s.source && (
                  <div className="font-mono text-[10.5px]" style={sub}>
                    {s.source}
                  </div>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <Nil>No measurable spec is stated for this check.</Nil>
        )}
      </Sec>

      <Sec title="How often, and what that means">
        {r?.freq ? (
          <>
            <List items={r.freq.tasks} />
            <div className="mt-1 text-[12px] leading-[1.6]" style={sub}>
              {r.freq.meaning.map((m, i) => (
                <div key={i}>{m}</div>
              ))}
            </div>
          </>
        ) : (
          <Nil>No frequency stated.</Nil>
        )}
      </Sec>

      <Sec title="Evidence needed">{r?.evidence ? <List items={r.evidence} /> : <Nil>None listed.</Nil>}</Sec>

      <Sec title="What to see on site">
        {r?.site ? (
          <div className="text-[12.5px] leading-[1.6]" style={body}>
            {r.site.look && <p>{r.site.look}</p>}
            {r.site.pass && (
              <p className="mt-1">
                <b>Pass:</b> {r.site.pass}
              </p>
            )}
          </div>
        ) : (
          <Nil>No site check: documents only.</Nil>
        )}
      </Sec>

      <Sec title="To explain / demonstrate">
        {r?.demo ? (
          <div className="text-[12.5px] leading-[1.6]" style={body}>
            {r.demo.approach && <p>{r.demo.approach}</p>}
            {r.demo.ask && (
              <p>
                <b>Ask:</b> {r.demo.ask}
              </p>
            )}
            {r.demo.test && (
              <p>
                <b>Show the test:</b> {r.demo.test}
              </p>
            )}
            {r.demo.proves && (
              <p>
                <b>Proves:</b> {r.demo.proves}
              </p>
            )}
          </div>
        ) : (
          <Nil>Nothing to demonstrate.</Nil>
        )}
      </Sec>

      <Sec title="ACSA documents">
        {docs.length ? (
          <ul className="flex flex-col gap-1.5">
            {docs.map((d) => {
              const f = acsaFileFor(d.doc);
              return (
                <li key={d.doc} className="text-[12.5px] leading-[1.55]" style={body}>
                  <Link href={`/library?doc=${encodeURIComponent(d.doc)}`} className="underline">
                    {d.doc}
                  </Link>{" "}
                  {d.title}
                  {d.clause ? ` (cl. ${d.clause})` : ""} ·{" "}
                  <a href={f ? f.url : ACSA_LIBRARY_ROOT} target="_blank" rel="noreferrer" className="underline">
                    {f ? "open folder" : "open library"}
                  </a>
                </li>
              );
            })}
          </ul>
        ) : (
          <Nil>No ACSA document identified for this check.</Nil>
        )}
        <p className="mt-1 text-[11px]" style={sub}>
          Links open ACSA&apos;s documents on TPJV SharePoint; sign-in is required.
        </p>
      </Sec>

      <Sec title={`ICAO${r?.icao ? (r.icao.status === "cited" ? " — cited by the register" : " — indicative, topic match only") : ""}`}>
        {r?.icao ? <List items={r.icao.items} /> : <Nil>No ICAO document identified.</Nil>}
        <p className="mt-1 text-[11px]" style={sub}>
          ICAO texts are licensed.{" "}
          <a href={ICAO_STORE_URL} target="_blank" rel="noreferrer" className="underline">
            ICAO store
          </a>
          . Clause numbers are not verified against the licensed text.
        </p>
      </Sec>
    </div>
  );
}
