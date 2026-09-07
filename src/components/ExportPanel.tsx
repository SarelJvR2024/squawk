"use client";

import { useEffect, useMemo, useState } from "react";
import {
  checksAt,
  priorFindingsAt,
  useResponses,
  useEntityCode,
  useVerifications,
  useVisitFindings,
  useVisitHazards,
  useVisitId,
} from "@/lib/store";
import { loadAnswers } from "@/lib/answers";
import { formatBytes, getBlob, isStoragePersisted, photoBudget } from "@/lib/media";
import { buildPhotoZip, photoFilename, type PhotoFile } from "@/lib/photos";
import { portalIdFor } from "@/lib/sites";
import {
  aboutSheet,
  closureSheet,
  evidenceRequestSheet,
  exportFilename,
  findingsSheet,
  hazardsSheet,
  fullWorkbook,
  photographsSheet,
  registerSheet,
  summarySheet,
  type ExportInput,
} from "@/lib/exports";
import { downloadBytes, downloadText, downloadWorkbook, toCsv, type Sheet } from "@/lib/xlsx";
import { Btn } from "@/components/ui/primitives";
import TeamMerge from "@/components/TeamMerge";
import { IconDownload, IconX } from "@/components/ui/icons";

type Kind =
  | "full"
  | "register"
  | "findings"
  | "hazards"
  | "closure"
  | "evidence"
  | "summary"
  | "photographs";

const OPTIONS: { kind: Kind; title: string; blurb: string }[] = [
  {
    kind: "full",
    title: "Everything",
    blurb:
      "Eight sheets: a cover note explaining what a blank cell means, the summary, the register, the findings, the hazards, the closure position, the evidence request and the photograph index.",
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
    kind: "hazards",
    title: "Hazards",
    blurb:
      "What the findings expose, rated as events, carrying both rating instruments in their own columns. ACSA's ERM scale has not been supplied, so those columns say so rather than reading blank.",
  },
  {
    kind: "closure",
    title: "Closure",
    blurb:
      "This site's open 2025 findings, what was verified this visit, and the coverage guard where no current check covers the asset system.",
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
  {
    kind: "photographs",
    title: "Photographs",
    blurb:
      "One row per photograph — the file it is, what it shows, which check it belongs to, who captioned it and when it was taken. This is the index; Images below is the evidence itself.",
  },
];

/** Above this, say something. A tablet's IndexedDB quota is not a fixed number
 *  — it depends on the device and how much free space it has — so this is a
 *  "look at this" line rather than a limit, chosen to fire long before a real
 *  quota does. */
const WARN_BYTES = 200 * 1024 * 1024;

export default function ExportPanel({ onClose }: { onClose: () => void }) {
  const responses = useResponses();
  const findings = useVisitFindings();
  const hazards = useVisitHazards();
  const verifications = useVerifications();
  const entityCode = useEntityCode();
  const [budget, setBudget] = useState({ count: 0, bytes: 0 });
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void photoBudget().then((b) => live && setBudget(b));
    void isStoragePersisted().then((v) => live && setPersisted(v));
    return () => {
      live = false;
    };
  }, []);
  const uncaptioned = Object.values(responses).reduce(
    (n, r) =>
      n + r.attachments.filter((a) => a.kind === "photo" && !a.caption?.trim()).length,
    0
  );
  const visitId = useVisitId();
  const [busy, setBusy] = useState<Kind | "images" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const photos = useMemo(
    () =>
      Object.entries(responses).flatMap(([checkId, r]) =>
        r.attachments
          .filter((a) => a.kind === "photo" && a.blobKey && !a.unavailable)
          .map((a) => ({ checkId, a }))
      ),
    [responses]
  );
  const photoCount = photos.length;

  /* The images, zipped, with a manifest. Read straight out of the media store
     rather than from anything the records claim, because a record pointing at a
     blob that is not there is exactly the case worth catching before somebody
     relies on the zip. */
  const downloadImages = async () => {
    setBusy("images");
    setError(null);
    try {
      const files: PhotoFile[] = [];
      const rows: string[] = [
        "file,reference,check,caption,caption source,taken,attached,attached by",
      ];
      const q = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      for (const { checkId, a } of photos) {
        const blob = await getBlob(a.blobKey!);
        if (!blob) continue;
        const name = photoFilename(a);
        files.push({ name, bytes: new Uint8Array(await blob.arrayBuffer()) });
        rows.push(
          [
            name,
            a.ref ?? "",
            portalIdFor(entityCode, checkId),
            a.caption?.trim() ?? "",
            a.caption?.trim() ? (a.captionSource === "assistant" ? "Assistant, accepted" : "Auditor") : "NO CAPTION",
            a.takenAt ? new Date(a.takenAt).toISOString() : "",
            new Date(a.createdAt).toISOString(),
            a.createdBy,
          ]
            .map(q)
            .join(",")
        );
      }
      if (!files.length) throw new Error("No stored images to export.");
      downloadBytes(
        buildPhotoZip(files, rows.join("\n")),
        exportFilename(entityCode, visitId, "photographs", "zip"),
        "application/zip"
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "The images could not be zipped.");
    } finally {
      setBusy(null);
    }
  };

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
        hazards,
        prior: priorFindingsAt(entityCode),
        verifications,
        library,
      };
      const one: Record<Exclude<Kind, "full">, () => Sheet> = {
        register: () => registerSheet(x),
        findings: () => findingsSheet(x),
        hazards: () => hazardsSheet(x),
        closure: () => closureSheet(x),
        evidence: () => evidenceRequestSheet(x),
        summary: () => summarySheet(x),
        photographs: () => photographsSheet(x),
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

        {/* What the evidence is costing the tablet. A device running out of
            storage mid-audit must fail visibly: the browser's own error for a
            full quota is opaque, arrives while somebody is standing on an
            apron, and looks like the app simply refusing to save. */}
        <div
          className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] border px-[10px] py-[8px] text-[11.5px]"
          style={{
            background: budget.bytes > WARN_BYTES ? "var(--warn-bg)" : "var(--sunken)",
            borderColor: budget.bytes > WARN_BYTES ? "var(--warn-line)" : "var(--line-2)",
            color: budget.bytes > WARN_BYTES ? "var(--warn)" : "var(--ink-2)",
          }}
        >
          <span>
            <b>{budget.count}</b> photograph{budget.count === 1 ? "" : "s"} and voice note
            {budget.count === 1 ? "" : "s"} stored on this device, <b>{formatBytes(budget.bytes)}</b>
          </span>
          {uncaptioned > 0 && (
            <span style={{ color: "var(--warn)" }}>
              {uncaptioned} photograph{uncaptioned === 1 ? "" : "s"} with no caption
            </span>
          )}
          {budget.bytes > WARN_BYTES && (
            <span>
              Getting large. Export and reset a finished visit before starting another.
            </span>
          )}
          {/* Whether the browser has agreed not to throw this away. Safari
              clears storage for a site not visited for about a week; Chrome
              evicts under pressure. If the answer is no, say so here rather
              than letting somebody find out after a site visit. */}
          {persisted === false && (
            <span style={{ color: "var(--warn)" }}>
              This browser has not granted persistent storage — it may clear the audit if
              the device runs low or the app goes unopened for a week. Export before you
              leave site.
            </span>
          )}
        </div>

        {/* The images themselves, separately from the workbook. Separate because
          the index is a few kilobytes and the evidence is not: an auditor can
          send the workbook to a discipline lead without a hundred megabytes
          attached, and fetch the images when somebody asks. The filenames match
          the File column of the Photographs sheet exactly. */}
      <div
        className="mb-3.5 flex flex-wrap items-start gap-3 rounded-[13px] border p-3"
        style={{ borderColor: "var(--line)", background: "var(--sunken)" }}
      >
        <div className="min-w-[180px] flex-1">
          <b className="block font-display text-[12.5px] font-semibold">Images</b>
          <span className="mt-[3px] block text-[11.5px] leading-[1.5]" style={{ color: "var(--ink-2)" }}>
            Every photograph as a file, named the way the workbook refers to it
            ({photoCount === 0 ? "none captured yet" : `${photoCount} · ${formatBytes(budget.bytes)}`}),
            with a manifest inside so the zip still reads on its own.
          </span>
        </div>
        <div className="flex shrink-0 gap-[6px]">
          <Btn disabled={busy !== null || photoCount === 0} onClick={downloadImages}>
            <IconDownload width={13} height={13} />
            {busy === "images" ? "Zipping…" : "Download images"}
          </Btn>
        </div>
      </div>

      <TeamMerge />

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
