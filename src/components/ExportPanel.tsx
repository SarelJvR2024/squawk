"use client";

import { useState } from "react";
import {
  checksAt,
  priorFindingsAt,
  useResponses,
  useEntityCode,
  useVerifications,
  useVisitFindings,
  useVisitId,
} from "@/lib/store";
import { loadAnswers } from "@/lib/answers";
import {
  aboutSheet,
  closureSheet,
  evidenceRequestSheet,
  exportFilename,
  findingsSheet,
  fullWorkbook,
  registerSheet,
  summarySheet,
  type ExportInput,
} from "@/lib/exports";
import { downloadText, downloadWorkbook, toCsv, type Sheet } from "@/lib/xlsx";
import { Btn } from "@/components/ui/primitives";
import { IconDownload, IconX } from "@/components/ui/icons";

type Kind = "full" | "register" | "findings" | "closure" | "evidence" | "summary";

const OPTIONS: { kind: Kind; title: string; blurb: string }[] = [
  {
    kind: "full",
    title: "Everything",
    blurb:
      "Six sheets: a cover note explaining what a blank cell means, the summary, the register, the findings, the closure position and the evidence request.",
  },
  {
    kind: "register",
    title: "Register",
    blurb:
      "One row per check-point in the shape the workbook already has, with this visit's capture alongside it. This is the sheet that goes back to ACSA.",
  },
  {
    kind: "findings",
    title: "Findings",
    blurb:
      "Every finding with its agreed rating, band and strategy, its owner and due date. Suggested ratings the team has not agreed are kept in their own column.",
  },
  {
    kind: "closure",
    title: "Closure",
    blurb:
      "The 23 March 2025 findings, what was verified this visit, and the coverage guard where no current check covers the asset system.",
  },
  {
    kind: "evidence",
    title: "Evidence request",
    blurb:
      "One row per record asked for — the list that leaves the room at the end of a workshop for ACSA to action.",
  },
  {
    kind: "summary",
    title: "Summary",
    blurb: "Progress and findings by discipline. One page, for the out-brief.",
  },
];

export default function ExportPanel({ onClose }: { onClose: () => void }) {
  const responses = useResponses();
  const findings = useVisitFindings();
  const verifications = useVerifications();
  const entityCode = useEntityCode();
  const visitId = useVisitId();
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const build = async (kind: Kind, csv: boolean) => {
    setBusy(kind);
    setError(null);
    try {
      /* The Answer Library carries the labels behind the tapped indices, so an
         export without it would say "#3" where ACSA needs a document name. It
         is lazily loaded, so wait for it rather than exporting a worse file. */
      const library = await loadAnswers();
      const x: ExportInput = {
        entity: entityCode,
        visit: visitId,
        checks: checksAt(entityCode),
        responses,
        findings,
        prior: priorFindingsAt(entityCode),
        verifications,
        library,
      };
      const one: Record<Exclude<Kind, "full">, () => Sheet> = {
        register: () => registerSheet(x),
        findings: () => findingsSheet(x),
        closure: () => closureSheet(x),
        evidence: () => evidenceRequestSheet(x),
        summary: () => summarySheet(x),
      };

      if (csv) {
        const sheet = kind === "full" ? registerSheet(x) : one[kind]();
        downloadText(toCsv(sheet), exportFilename(entityCode, visitId, kind === "full" ? "register" : kind, "csv"));
      } else if (kind === "full") {
        downloadWorkbook(fullWorkbook(x), exportFilename(entityCode, visitId, "audit"));
      } else {
        downloadWorkbook([aboutSheet(x), one[kind]()], exportFilename(entityCode, visitId, kind));
      }
    } catch (e) {
      /* Say what went wrong. A silent failure on an export looks like a browser
         that swallowed the download, and the auditor waits for a file that is
         never coming. */
      setError(e instanceof Error ? e.message : "The export could not be built.");
    } finally {
      setBusy(null);
    }
  };

  const captured = Object.values(responses).filter((r) => r.captured).length;

  return (
    <div
      className="fixed inset-0 z-[80] flex justify-center overflow-y-auto py-[8vh]"
      style={{ background: "rgba(16,10,32,.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="h-fit w-[min(680px,92vw)] rounded-[20px] border p-[22px]"
        style={{
          background: "var(--panel)",
          borderColor: "var(--line-2)",
          boxShadow: "var(--e3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <h3 className="text-[15px] font-bold">Export</h3>
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--ink-4)" }}>
            <IconX width={15} height={15} />
          </button>
        </div>
        <p className="mb-4 text-[12px] leading-[1.55]" style={{ color: "var(--ink-2)" }}>
          {captured} of {checksAt(entityCode).length} check-points captured, {findings.length}{" "}
          {findings.length === 1 ? "finding" : "findings"} raised. Everything is exported as it
          stands — an empty status means not captured, never compliant.
        </p>

        {error && (
          <div
            className="mb-3 rounded-[11px] border px-3.5 py-2.5 text-[12px]"
            style={{ borderColor: "var(--bad)", background: "var(--bad-bg)", color: "var(--bad)" }}
          >
            {error}
          </div>
        )}

        <div className="flex flex-col gap-[7px]">
          {OPTIONS.map((o) => (
            <div
              key={o.kind}
              className="flex flex-wrap items-start gap-3 rounded-[13px] border p-3"
              style={{ borderColor: "var(--line)", background: "var(--sunken)" }}
            >
              <div className="min-w-[180px] flex-1">
                <b className="block font-display text-[12.5px] font-semibold">{o.title}</b>
                <span
                  className="mt-[3px] block text-[11.5px] leading-[1.5]"
                  style={{ color: "var(--ink-2)" }}
                >
                  {o.blurb}
                </span>
              </div>
              <div className="flex shrink-0 gap-[6px]">
                <Btn disabled={busy !== null} onClick={() => build(o.kind, false)}>
                  <IconDownload width={13} height={13} />
                  {busy === o.kind ? "Building…" : "Excel"}
                </Btn>
                <Btn variant="ghost" disabled={busy !== null} onClick={() => build(o.kind, true)}>
                  CSV
                </Btn>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[11px] leading-[1.55]" style={{ color: "var(--ink-3)" }}>
          Word report templates come next — see the design document, phase 4. Photographs and
          voice notes are counted in the register but stay on the device; the evidence pack that
          carries them out is part of that same phase.
        </p>
      </div>
    </div>
  );
}
