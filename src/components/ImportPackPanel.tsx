"use client";

/** "Import observation pack" — reads ACSA's pre-visit observation workbook
 *  and writes its rows into the currently selected entity and visit as
 *  ad-hoc items, draft findings, draft hazards and check observations.
 *
 *  Same file-picker-driven shape as TeamMerge just above it: choosing a file
 *  only parses it and builds a preview in memory — nothing is written until
 *  Confirm is pressed, and the preview says exactly what Confirm will do,
 *  including which rows were already imported and which could not be
 *  mapped. See src/lib/importPack.ts for the parsing, planning, writing and
 *  undo logic itself; this component only reads the store, builds the
 *  context that module needs, and renders what comes back. */

import { useRef, useState } from "react";
import {
  checksAt,
  useAdhoc,
  useEntityCode,
  useResponses,
  useStore,
  useVisitFindings,
  useVisitHazards,
  useVisitId,
} from "@/lib/store";
import {
  applyImportPlan,
  buildImportPlan,
  parseObservationPack,
  planCounts,
  undoImport,
  type ApplyResult,
  type ImportPlan,
  type UndoResult,
} from "@/lib/importPack";
import { Btn } from "@/components/ui/primitives";
import { IconInbox, IconUpload } from "@/components/ui/icons";

export default function ImportPackPanel() {
  const entityCode = useEntityCode();
  const visitId = useVisitId();
  const auditor = useStore((s) => s.auditor);
  const adhocItems = useAdhoc();
  const findings = useVisitFindings();
  const hazards = useVisitHazards();
  const responses = useResponses();

  const addAdhoc = useStore((s) => s.addAdhoc);
  const addFinding = useStore((s) => s.addFinding);
  const addHazard = useStore((s) => s.addHazard);
  const removeAdhoc = useStore((s) => s.removeAdhoc);
  const removeFinding = useStore((s) => s.removeFinding);
  const removeHazard = useStore((s) => s.removeHazard);
  const getResponse = useStore((s) => s.response);
  const patchResponse = useStore((s) => s.patch);

  const fileInput = useRef<HTMLInputElement>(null);
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [undone, setUndone] = useState<UndoResult | null>(null);
  const [showRows, setShowRows] = useState(false);

  const checks = checksAt(entityCode);

  const pickFile = async (f: File) => {
    setError(null);
    setResult(null);
    setUndone(null);
    setPlan(null);
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await f.arrayBuffer());
    } catch {
      setError("That file could not be read.");
      return;
    }
    try {
      const pack = parseObservationPack(bytes, f.name);
      const built = buildImportPlan(pack, bytes, {
        entity: entityCode,
        visit: visitId,
        auditor,
        existingAdhoc: adhocItems,
        existingFindings: findings,
        existingHazards: hazards,
        checks,
        responses,
      });
      setFileBytes(bytes);
      setPlan(built);
    } catch {
      setError(
        "That file could not be read as an observation pack. It needs an \"Ad-hoc items\" sheet, a \"Findings\" or \"Findings drafts\" sheet, a \"Hazards\" or \"Hazards drafts\" sheet, and a \"Check observations\" sheet, each with its own headers unchanged."
      );
    }
  };

  const confirm = () => {
    if (!plan || plan.blockedReason) return;
    const out = applyImportPlan(plan, {
      addAdhoc,
      addFinding,
      addHazard,
      getResponse,
      patchResponse,
      auditor,
      visit: visitId,
    });
    setResult(out);
    setUndone(null);
    /* Rebuild the plan against what the store now holds, so a second press
       (or the undo button right below) reads "already imported" rather than
       quietly offering to write the same rows twice. */
    if (fileBytes && plan) {
      const pack = parseObservationPack(fileBytes, plan.fileName);
      setPlan(
        buildImportPlan(pack, fileBytes, {
          entity: entityCode,
          visit: visitId,
          auditor,
          existingAdhoc: useStore.getState().visitData().adhoc ?? [],
          existingFindings: useStore.getState().findings.filter(
            (x) => x.entity === entityCode && x.originVisit === visitId
          ),
          existingHazards: useStore.getState().hazards.filter(
            (x) => x.entity === entityCode && x.originVisit === visitId
          ),
          checks,
          responses: useStore.getState().visitData().responses,
        })
      );
    }
  };

  const undo = () => {
    if (!plan) return;
    const fileKeys = new Set<string>([
      ...plan.adhoc.map((r) => r.importKey),
      ...plan.findings.map((r) => r.importKey),
      ...plan.hazards.map((r) => r.importKey),
      ...plan.checkObservations.map((r) => r.importKey),
    ]);
    const out = undoImport(
      fileKeys,
      {
        adhoc: useStore.getState().visitData().adhoc ?? [],
        findings: useStore.getState().findings.filter(
          (x) => x.entity === entityCode && x.originVisit === visitId
        ),
        hazards: useStore.getState().hazards.filter(
          (x) => x.entity === entityCode && x.originVisit === visitId
        ),
        checks,
        responses: useStore.getState().visitData().responses,
      },
      { removeAdhoc, removeFinding, removeHazard, getResponse, patchResponse }
    );
    setUndone(out);
    setResult(null);
    if (fileBytes && plan) {
      const pack = parseObservationPack(fileBytes, plan.fileName);
      setPlan(
        buildImportPlan(pack, fileBytes, {
          entity: entityCode,
          visit: visitId,
          auditor,
          existingAdhoc: useStore.getState().visitData().adhoc ?? [],
          existingFindings: useStore.getState().findings.filter(
            (x) => x.entity === entityCode && x.originVisit === visitId
          ),
          existingHazards: useStore.getState().hazards.filter(
            (x) => x.entity === entityCode && x.originVisit === visitId
          ),
          checks,
          responses: useStore.getState().visitData().responses,
        })
      );
    }
  };

  const counts = plan ? planCounts(plan) : null;
  const totalToWrite = counts
    ? counts.adhoc.toWrite + counts.findings.toWrite + counts.hazards.toWrite + counts.checkObservations.toWrite
    : 0;
  const totalAlready = counts
    ? counts.adhoc.alreadyImported +
      counts.findings.alreadyImported +
      counts.hazards.alreadyImported +
      counts.checkObservations.alreadyImported
    : 0;

  return (
    <div
      className="mb-3.5 rounded-[13px] border p-3"
      style={{ borderColor: "var(--line)", background: "var(--sunken)" }}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[180px] flex-1">
          <b className="flex items-center gap-[7px] font-display text-[12.5px] font-semibold">
            <IconInbox width={14} height={14} style={{ color: "var(--acc)" }} />
            Import observation pack
          </b>
          <span className="mt-[3px] block text-[11.5px] leading-[1.5]" style={{ color: "var(--ink-2)" }}>
            Reads ACSA&apos;s pre-visit observation workbook — Ad-hoc items, Findings, Hazards and
            Check observations — into {entityCode} {visitId}. Nothing is written until you confirm,
            and every row is marked <b>Imported, TPJV-proposed</b> — no severity, no likelihood, no
            rating is ever set by this.
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap gap-[6px]">
          <Btn variant="ghost" onClick={() => fileInput.current?.click()}>
            <IconUpload width={13} height={13} />
            Choose workbook
          </Btn>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-label="Choose an observation pack workbook"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void pickFile(f);
            }}
          />
        </div>
      </div>

      {error && (
        <div
          className="mt-3 rounded-[11px] border px-3.5 py-2.5 text-[12px] leading-[1.5]"
          style={{ borderColor: "var(--bad)", background: "var(--bad-bg)", color: "var(--bad)" }}
        >
          {error}
        </div>
      )}

      {plan && plan.blockedReason && (
        <div
          className="mt-3 rounded-[11px] border px-3.5 py-2.5 text-[12px] leading-[1.5]"
          style={{ borderColor: "var(--bad)", background: "var(--bad-bg)", color: "var(--bad)" }}
        >
          {plan.blockedReason}
        </div>
      )}

      {plan && !plan.blockedReason && counts && (
        <div
          className="mt-3 rounded-[11px] border px-3.5 py-2.5"
          style={{ borderColor: "var(--line-2)", background: "var(--panel)" }}
        >
          <div className="mb-2 font-mono text-[10.5px]" style={{ color: "var(--ink-3)" }}>
            {plan.fileName}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile n={counts.adhoc.toWrite} label="ad-hoc items to add" sub={`${counts.adhoc.total} in the sheet`} />
            <Tile n={counts.findings.toWrite} label="findings to add" sub={`${counts.findings.total} in the sheet`} />
            <Tile n={counts.hazards.toWrite} label="hazards to add" sub={`${counts.hazards.total} in the sheet`} />
            <Tile
              n={counts.checkObservations.toWrite}
              label="check notes to append"
              sub={`${counts.checkObservations.total} in the sheet`}
            />
          </div>

          {totalAlready > 0 && (
            <div className="mt-2 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
              <b>{totalAlready}</b> row{totalAlready === 1 ? "" : "s"} already imported from this
              exact file — not written again.
            </div>
          )}

          {counts.checkObservations.unmapped > 0 && (
            <div
              className="mt-2 rounded-[8px] border px-[9px] py-[6px] text-[11.5px] leading-[1.5]"
              style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line)", color: "var(--warn)" }}
            >
              <b>{counts.checkObservations.unmapped}</b> check observation
              {counts.checkObservations.unmapped === 1 ? "" : "s"} name a Check id not in{" "}
              {entityCode}&apos;s register — listed below, and skipped rather than written.
            </div>
          )}

          {plan.hazards.some((h) => h.unresolvedFindingRefs.length > 0) && (
            <div
              className="mt-2 rounded-[8px] border px-[9px] py-[6px] text-[11.5px] leading-[1.5]"
              style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line)", color: "var(--warn)" }}
            >
              Some hazards name a Finding Ref the Findings sheet does not have — that link is
              dropped, the rest of the hazard is still imported.
            </div>
          )}

          {plan.findings.some((f) => f.fromItemDangling) && (
            <div
              className="mt-2 rounded-[8px] border px-[9px] py-[6px] text-[11.5px] leading-[1.5]"
              style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line)", color: "var(--warn)" }}
            >
              Some findings name a &ldquo;From item&rdquo; Ref the Ad-hoc items sheet does not have
              — the link is dropped, the rest of the finding is still imported.
            </div>
          )}

          <button
            onClick={() => setShowRows((v) => !v)}
            className="mt-2 text-[11px] underline"
            style={{ color: "var(--acc)" }}
          >
            {showRows ? "Hide every row" : "Show every row"}
          </button>

          {showRows && (
            <div className="mt-2 max-h-[280px] overflow-y-auto rounded-[8px] border p-2" style={{ borderColor: "var(--line)" }}>
              <RowGroup title="Ad-hoc items">
                {plan.adhoc.map((r) => (
                  <RowLine key={`a-${r.row.ref}`} ref={r.row.ref} already={r.alreadyImported}>
                    {r.row.description}
                  </RowLine>
                ))}
              </RowGroup>
              <RowGroup title="Findings">
                {plan.findings.map((r) => (
                  <RowLine key={`f-${r.row.ref}`} ref={r.row.ref} already={r.alreadyImported}>
                    {r.row.title}
                  </RowLine>
                ))}
              </RowGroup>
              <RowGroup title="Hazards">
                {plan.hazards.map((r) => (
                  <RowLine key={`h-${r.row.ref}`} ref={r.row.ref} already={r.alreadyImported}>
                    {r.row.event}
                  </RowLine>
                ))}
              </RowGroup>
              <RowGroup title="Check observations">
                {plan.checkObservations.map((r) => (
                  <RowLine
                    key={`c-${r.row.checkCode}`}
                    ref={r.row.checkCode}
                    already={r.alreadyImported}
                    unmapped={r.resolvedCheckId === null}
                  >
                    {r.row.observation}
                  </RowLine>
                ))}
              </RowGroup>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Btn variant="primary" disabled={totalToWrite === 0} onClick={confirm}>
              {totalToWrite === 0 ? "Nothing new to import" : `Confirm — import ${totalToWrite} row${totalToWrite === 1 ? "" : "s"}`}
            </Btn>
            <Btn variant="ghost" onClick={undo}>
              Remove everything imported from this file
            </Btn>
          </div>
        </div>
      )}

      {result && (
        <div
          className="mt-3 rounded-[11px] border px-3.5 py-2.5 text-[12px]"
          style={{ borderColor: "var(--good-line)", background: "var(--good-bg)", color: "var(--good)" }}
        >
          Imported {result.adhocWritten} ad-hoc item{result.adhocWritten === 1 ? "" : "s"},{" "}
          {result.findingsWritten} finding{result.findingsWritten === 1 ? "" : "s"},{" "}
          {result.hazardsWritten} hazard{result.hazardsWritten === 1 ? "" : "s"} and appended{" "}
          {result.checkObservationsWritten} check note{result.checkObservationsWritten === 1 ? "" : "s"}
          . Every one of them is marked &ldquo;Imported, TPJV-proposed&rdquo; wherever it is shown.
        </div>
      )}

      {undone && (
        <div
          className="mt-3 rounded-[11px] border px-3.5 py-2.5 text-[12px]"
          style={{ borderColor: "var(--line-2)", background: "var(--panel)" }}
        >
          Removed {undone.adhocRemoved} ad-hoc item{undone.adhocRemoved === 1 ? "" : "s"},{" "}
          {undone.findingsRemoved} finding{undone.findingsRemoved === 1 ? "" : "s"},{" "}
          {undone.hazardsRemoved} hazard{undone.hazardsRemoved === 1 ? "" : "s"} and un-appended{" "}
          {undone.checkObservationsStripped} check note{undone.checkObservationsStripped === 1 ? "" : "s"} —
          everything this file imported, and nothing else.
        </div>
      )}
    </div>
  );
}

function Tile({ n, label, sub }: { n: number; label: string; sub: string }) {
  return (
    <div className="rounded-[9px] border px-2.5 py-2" style={{ borderColor: "var(--line)", background: "var(--sunken)" }}>
      <div className="font-display text-[17px] font-bold">{n}</div>
      <div className="text-[10.5px] leading-[1.3]" style={{ color: "var(--ink-3)" }}>
        {label}
      </div>
      <div className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
        {sub}
      </div>
    </div>
  );
}

function RowGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <b className="block text-[10.5px] uppercase" style={{ color: "var(--ink-4)" }}>
        {title}
      </b>
      <ul className="mt-1 flex flex-col gap-[2px]">{children}</ul>
    </div>
  );
}

function RowLine({
  ref,
  already,
  unmapped,
  children,
}: {
  ref: string;
  already: boolean;
  unmapped?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-1.5 text-[11px] leading-[1.4]" style={{ color: "var(--ink-2)" }}>
      <span className="font-mono text-[9.5px] shrink-0" style={{ color: "var(--ink-4)" }}>
        {ref}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {unmapped && (
        <span className="shrink-0 font-mono text-[9px]" style={{ color: "var(--warn)" }}>
          UNMAPPED
        </span>
      )}
      {already && !unmapped && (
        <span className="shrink-0 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
          ALREADY IMPORTED
        </span>
      )}
    </li>
  );
}
