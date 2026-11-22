"use client";

/** LIBRARY — ACSA's procedures, as reference.
 *
 *  More-menu only, read-only, no entity scope: a procedure is the same
 *  document wherever it's audited, unlike a check. The build brief's "70
 *  procedures used... 19 held but not cited" — the 70 is real and exactly
 *  what src/lib/library.ts derives; there is no "19" anywhere in this repo
 *  (codes, titles or content), so UNCITED_GAP_NOTE says that plainly rather
 *  than this screen inventing a list to fill the gap. See library.ts's own
 *  header for the full reasoning.
 *
 *  List + card, both driven by one `?doc=` (and `?clause=`) query param so
 *  the three other entry points (a check's "ACSA requirement", an issue's
 *  citation, Issues' "To review") can deep-link straight to a procedure at
 *  a specific clause, per the build brief — see AcsaRequirementPanel.tsx
 *  and ReviewRiskPanel.tsx for the links in. */

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ALL_PROCEDURES,
  PROCEDURE_DISCIPLINES,
  UNCITED_GAP_NOTE,
  procedureByDoc,
  procedureMatches,
  type AcsaProcedure,
} from "@/lib/library";
import { DisciplineSelect } from "@/components/ui/DisciplineSelect";
import { Btn, Empty, Panel } from "@/components/ui/primitives";
import { IconLeft, IconSearch } from "@/components/ui/icons";

export default function LibraryPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4 text-[12px]" style={{ color: "var(--ink-4)" }}>
          Loading…
        </div>
      }
    >
      <LibraryPageInner />
    </Suspense>
  );
}

function LibraryPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const docParam = searchParams.get("doc");
  const clauseParam = searchParams.get("clause");

  if (docParam) {
    return (
      <ProcedureCard
        proc={procedureByDoc(docParam)}
        doc={docParam}
        clause={clauseParam}
        onBack={() => router.push("/library")}
      />
    );
  }
  return <ProcedureList />;
}

function ProcedureList() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [discipline, setDiscipline] = useState("");

  const filtered = useMemo(
    () =>
      ALL_PROCEDURES.filter(
        (p) => (!discipline || p.disciplines.includes(discipline)) && procedureMatches(p, query)
      ),
    [query, discipline]
  );

  return (
    <div className="app-scroll mx-auto min-h-0 w-full max-w-[900px] flex-1 overflow-y-auto px-4 py-4">
      <h1 className="mb-1 text-[18px] font-bold">Library</h1>
      <p className="mb-3 text-[13px]" style={{ color: "var(--ink-3)" }}>
        ACSA&rsquo;s procedures the register cites, as reference. Read-only — the register
        itself is edited in Setup, not here.
      </p>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <IconSearch
            width={13}
            height={13}
            className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2"
            style={{ color: "var(--ink-4)" }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by code, title or wording"
            aria-label="Search procedures"
            className="w-full rounded-[11px] border py-[9px] pl-[32px] pr-3 text-[12.5px]"
            style={{ borderColor: "var(--line-2)", background: "var(--panel)", color: "var(--ink)" }}
          />
        </div>
        <DisciplineSelect
          value={discipline}
          onChange={setDiscipline}
          options={[
            { value: "", label: "All disciplines" },
            ...PROCEDURE_DISCIPLINES.map((d) => ({ value: d, label: d })),
          ]}
          ariaLabel="Discipline"
          active={!!discipline}
          className="w-full sm:w-[220px]"
        />
      </div>

      {filtered.length === 0 ? (
        <Empty>No procedure matches.</Empty>
      ) : (
        <ul className="mb-4 flex flex-col gap-[7px]">
          {filtered.map((p) => (
            <li key={p.doc}>
              <button
                type="button"
                onClick={() => router.push(`/library?doc=${encodeURIComponent(p.doc)}`)}
                className="flex min-h-[44px] w-full flex-col gap-0.5 rounded-[11px] border px-3 py-2.5 text-left transition-[var(--t)] hover:-translate-y-[1px]"
                style={{ borderColor: "var(--line-2)", background: "var(--panel)" }}
              >
                <span className="font-mono text-[10.5px]" style={{ color: "var(--ink-4)" }}>
                  {p.doc}
                </span>
                <span className="text-[13px] font-semibold">{p.title}</span>
                <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                  Used by {p.citations.length} check{p.citations.length === 1 ? "" : "s"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div
        className="rounded-[11px] border px-3 py-2.5 text-[11.5px] leading-[1.5]"
        style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn)" }}
      >
        {UNCITED_GAP_NOTE}
      </div>
    </div>
  );
}

function ProcedureCard({
  proc,
  doc,
  clause,
  onBack,
}: {
  proc: AcsaProcedure | undefined;
  doc: string;
  clause: string | null;
  onBack: () => void;
}) {
  const router = useRouter();

  const records = useMemo(() => {
    if (!proc) return [];
    return Array.from(new Set(proc.citations.flatMap((c) => c.acsaEvidence)));
  }, [proc]);

  const watchFors = useMemo(() => {
    if (!proc) return [];
    return proc.citations
      .filter((c) => c.acsaConflict)
      .map((c) => ({ checkId: c.checkId, text: c.acsaConflict }));
  }, [proc]);

  if (!proc) {
    return (
      <div className="app-scroll mx-auto min-h-0 w-full max-w-[900px] flex-1 overflow-y-auto px-4 py-4">
        <Btn onClick={onBack} className="mb-3">
          <IconLeft width={12} height={12} /> All procedures
        </Btn>
        <Empty>No cited procedure has the code &ldquo;{doc}&rdquo;.</Empty>
      </div>
    );
  }

  return (
    <div className="app-scroll mx-auto min-h-0 w-full max-w-[900px] flex-1 overflow-y-auto px-4 py-4">
      <Btn onClick={onBack} className="mb-3">
        <IconLeft width={12} height={12} /> All procedures
      </Btn>

      <div className="font-mono text-[11px]" style={{ color: "var(--ink-4)" }}>
        {proc.doc}
      </div>
      <h1 className="mb-1 text-[17px] font-bold">{proc.title}</h1>
      <div className="mb-4 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
        Used by {proc.citations.length} check{proc.citations.length === 1 ? "" : "s"} ·{" "}
        {proc.clauses.length} clause{proc.clauses.length === 1 ? "" : "s"} cited
      </div>

      <div className="mb-4">
        <div className="label-xs mb-1.5">Key requirements, with clause</div>
        <div className="flex flex-col gap-2">
          {proc.citations.map((c) => {
            const atRequestedClause = !!clause && c.clauses.includes(clause);
            return (
              <Panel key={c.checkId} className={atRequestedClause ? "border-2" : undefined}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px]" style={{ color: "var(--ink-4)" }}>
                    {c.clauses.length > 0 ? `cl. ${c.clauses.join(", ")}` : "document-level"}
                  </span>
                  <button
                    type="button"
                    onClick={() => router.push(`/capture?check=${c.checkId}`)}
                    className="text-[10.5px] font-semibold underline"
                    style={{ color: "var(--acc)" }}
                  >
                    Open {c.checkId}
                  </button>
                </div>
                {c.acsaRequirement && (
                  <div className="mb-1.5 text-[12px] leading-[1.5]">{c.acsaRequirement}</div>
                )}
                {c.acsaThreshold && (
                  <div className="text-[11.5px] leading-[1.5]" style={{ color: "var(--ink-2)" }}>
                    <b>ACSA states ·</b> {c.acsaThreshold}
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      </div>

      {records.length > 0 && (
        <div className="mb-4">
          <div className="label-xs mb-1.5">Records it names</div>
          <ul className="list-disc pl-4 text-[12px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
            {records.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {watchFors.length > 0 && (
        <div className="mb-4">
          <div className="label-xs mb-1.5" style={{ color: "var(--warn)" }}>
            Things to watch for
          </div>
          <div className="flex flex-col gap-1.5">
            {watchFors.map((w) => (
              <div
                key={w.checkId}
                className="rounded-[8px] border px-[10px] py-[8px] text-[11.5px] leading-[1.5]"
                style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line)", color: "var(--warn)" }}
              >
                {w.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
