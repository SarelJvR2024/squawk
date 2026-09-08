"use client";

/** Two auditors, one audit — the file that carries a day's work between them.
 *
 *  An ACSA audit is done by a team, and Squawk keeps the audit in one device's
 *  IndexedDB. Until the shared record exists, this is how the work comes back
 *  together: each auditor shares their captures, one device merges the rest,
 *  and that device holds the audit the workbook is built from.
 *
 *  Two things are said on screen rather than left to be discovered:
 *
 *    · which photographs have NOT reached the record store, because those
 *      travel as a reference with no image and the person merging needs to know
 *      before they build a report, not after;
 *    · every record both devices had changed. The newer one wins — it has to
 *      win something — but a merge that quietly drops somebody's afternoon is
 *      worse than one that refuses, so each is named with both times.
 */

import { useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { summarise, type Bundle, type MergeReport } from "@/lib/merge";
import { entity as entityOf } from "@/lib/programme";
import { Btn } from "@/components/ui/primitives";
import { IconDownload, IconTeam, IconUpload } from "@/components/ui/icons";

const stamp = (t: number) =>
  new Date(t).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function TeamMerge() {
  const exportBundle = useStore((s) => s.exportBundle);
  const importBundle = useStore((s) => s.importBundle);
  const entityCode = useStore((s) => s.entity);
  const visit = useStore((s) => s.visit);
  const file = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<MergeReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const share = () => {
    setError(null);
    const bundle = exportBundle();
    const blob = new Blob([JSON.stringify(bundle)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const who = (bundle.meta.exportedBy || "unnamed").split(" ")[0].replace(/\W/g, "");
    a.download = `${entityCode}_${visit}_captures_${who}.squawk.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const merge = async (f: File) => {
    setError(null);
    setReport(null);
    let parsed: Bundle | null = null;
    try {
      parsed = JSON.parse(await f.text()) as Bundle;
    } catch {
      setError("That file could not be read. A capture bundle is the .squawk.json file the Share button produces.");
      return;
    }
    const out = importBundle(parsed);
    if (typeof out === "string") setError(out);
    else setReport(out);
  };

  const notUploaded = exportBundle().meta.photographsNotUploaded;

  return (
    <div
      className="mb-3.5 rounded-[13px] border p-3"
      style={{ borderColor: "var(--line)", background: "var(--sunken)" }}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[180px] flex-1">
          <b className="flex items-center gap-[7px] font-display text-[12.5px] font-semibold">
            <IconTeam width={14} height={14} style={{ color: "var(--acc)" }} />
            Team captures
          </b>
          <span
            className="mt-[3px] block text-[11.5px] leading-[1.5]"
            style={{ color: "var(--ink-2)" }}
          >
            Everything this device holds for {entityOf(entityCode).short} {visit}, as one file
            to hand to whoever is assembling the audit. Merging is per record and never
            overwrites evidence: two auditors who photographed the same defect end up with
            both photographs.
          </span>
          {notUploaded > 0 && (
            /* Rule 4 in merge.ts, said where it matters. */
            <span
              className="mt-[6px] block rounded-[8px] border px-[9px] py-[6px] text-[11px] leading-[1.5]"
              style={{
                background: "var(--warn-bg)",
                borderColor: "var(--warn-line)",
                color: "var(--warn)",
              }}
            >
              <b>{notUploaded}</b>{" "}
              {notUploaded === 1 ? "photograph has" : "photographs have"} not reached the record
              store yet. Photographs travel as references, so those would arrive on the other
              device with no image. Get signal, let the queue drain, and share again.
            </span>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-[6px]">
          <Btn onClick={share}>
            <IconDownload width={13} height={13} />
            Share my captures
          </Btn>
          <Btn variant="ghost" onClick={() => file.current?.click()}>
            <IconUpload width={13} height={13} />
            Merge a file
          </Btn>
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            aria-label="Merge a capture bundle"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              /* Cleared so the same file can be picked twice — after a refusal
                 the auditor's next act is usually to try it again. */
              e.target.value = "";
              if (f) void merge(f);
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

      {report && (
        <div
          className="mt-3 rounded-[11px] border px-3.5 py-2.5"
          style={{ borderColor: "var(--good-line)", background: "var(--good-bg)" }}
        >
          <b className="block text-[12px]" style={{ color: "var(--good)" }}>
            {summarise(report)}
          </b>
          <span className="mt-[3px] block text-[11px]" style={{ color: "var(--ink-2)" }}>
            Shared by {report.from} at {stamp(report.exportedAt)}.{" "}
            {report.attachmentsAdded > 0
              ? `${report.attachmentsAdded} attachment${report.attachmentsAdded === 1 ? "" : "s"} added. `
              : ""}
            {report.verifications.added.length + report.verifications.updated.length > 0
              ? `${report.verifications.added.length + report.verifications.updated.length} closure items updated. `
              : ""}
          </span>

          {report.photographsWithoutImage > 0 && (
            <div
              className="mt-2 rounded-[8px] border px-[9px] py-[6px] text-[11px] leading-[1.5]"
              style={{
                background: "var(--warn-bg)",
                borderColor: "var(--warn-line)",
                color: "var(--warn)",
              }}
            >
              <b>{report.photographsWithoutImage}</b>{" "}
              {report.photographsWithoutImage === 1 ? "photograph" : "photographs"} arrived as a
              reference with no image — they had not reached the record store when the file was
              made. Ask for the file again once that device has had signal.
            </div>
          )}

          {report.duplicates.length > 0 && (
            /* Above the contested list on purpose. A record both devices
               changed resolved itself — the newer won, and the older is there
               to look at. A duplicate has NOT resolved: one defect is sitting
               in the audit twice, and it will be rated twice and reach ACSA
               twice unless somebody settles it. */
            <div
              className="mt-2 rounded-[11px] border px-2.5 py-2 text-[11px]"
              style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line)", color: "var(--warn)" }}
            >
              <b>
                {report.duplicates.length} possible duplicate
                {report.duplicates.length === 1 ? "" : "s"}
              </b>{" "}
              — the same issue button on the same check, raised on both devices. Kept as
              separate findings, because the same button is legitimately raised once per
              asset. Open Findings and settle them, or one defect is counted twice.
              <ul className="mt-1.5 flex flex-col gap-[3px]">
                {report.duplicates.map((d) => (
                  <li key={`${d.checkId}-${d.issueIndex}`} className="font-mono text-[10.5px]">
                    {d.ids.join(" + ")} · {d.checkId}
                    {d.assets.some((a) => a.length > 0)
                      ? ` · ${d.assets.map((a) => (a.length ? a.join("/") : "no asset")).join(" vs ")}`
                      : " · neither names an asset"}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.contested.length > 0 && (
            /* Named, not summarised. Somebody has to be able to go and look. */
            <details className="group mt-2">
              <summary
                className="cursor-pointer list-none text-[11px] font-semibold select-none"
                style={{ color: "var(--ink-2)" }}
              >
                <span className="inline-block transition-transform group-open:rotate-90">›</span>{" "}
                {report.contested.length} record
                {report.contested.length === 1 ? "" : "s"} both devices had changed
              </summary>
              <ul className="mt-1.5 flex flex-col gap-[3px]">
                {report.contested.map((c) => (
                  <li
                    key={`${c.kind}-${c.id}`}
                    className="font-mono text-[10.5px]"
                    style={{ color: "var(--ink-2)" }}
                  >
                    {c.id} · kept {c.winner === "mine" ? "this device's" : "theirs"} ({stamp(
                      c.winner === "mine" ? c.mineAt : c.theirsAt
                    )}
                    ), over {stamp(c.winner === "mine" ? c.theirsAt : c.mineAt)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
