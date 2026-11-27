"use client";

import { useState } from "react";
import type { Check } from "@/lib/types";
import { useStore, useEvidenceItems } from "@/lib/store";
import { trackingStage } from "@/lib/evidence";
import { basisItems, standardEvidence } from "@/lib/standards";
import { Btn } from "@/components/ui/primitives";

/** ICAO and the other external standards the register cites for one check.
 *  Read-only. Only what the register holds is shown: where a check cites no
 *  ICAO document it says so rather than leaving a gap that reads as "none
 *  apply". Confidence and caveat are the register's own. */
export function StandardsPanel({ check }: { check: Check }) {
  const items = basisItems(check.basis);
  const icao = items.filter((i) => i.icao);
  const other = items.filter((i) => !i.icao);
  return (
    <div className="flex flex-col gap-3">
      <section>
        <div className="label-xs mb-1">ICAO</div>
        {icao.length > 0 ? (
          <ul className="list-disc pl-4 text-[12.5px] leading-[1.7]" style={{ color: "var(--ink-2)" }}>
            {icao.map((i, n) => (
              <li key={n}>{i.text}</li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            The register cites no ICAO document for this check.
          </p>
        )}
      </section>
      <section>
        <div className="label-xs mb-1">Other standards and regulations the register cites</div>
        {other.length > 0 ? (
          <ul className="list-disc pl-4 text-[12.5px] leading-[1.7]" style={{ color: "var(--ink-2)" }}>
            {other.map((i, n) => (
              <li key={n}>{i.text}</li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            None cited.
          </p>
        )}
      </section>
      {check.basisConfidence && (
        <p className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
          How firm the citation is: {check.basisConfidence}
          {check.basisConfidence === "medium" && " — the instrument applies but the clause is cited at document level."}
        </p>
      )}
      {check.basisNote && (
        <div
          className="rounded-[8px] border px-[10px] py-[8px] text-[12.5px] leading-[1.55]"
          style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line)", color: "var(--warn)" }}
        >
          {check.basisNote}
        </div>
      )}
    </div>
  );
}

/** The evidence this check is configured to ask for, what has been requested
 *  against it, and a place to ask for something specific on top. Requests
 *  made here are ordinary EvidenceItems linked to this check, so they appear
 *  on the Evidence screen and move through Requested / Received / Not
 *  available exactly like any other. */
export function EvidenceListPanel({ check }: { check: Check }) {
  const addEvidenceItem = useStore((s) => s.addEvidenceItem);
  const all = useEvidenceItems();
  const linked = all.filter((e) => e.checkIds.includes(check.id));
  const standard = standardEvidence(check.evidenceExpected);
  const [text, setText] = useState("");
  const asked = (t: string) => linked.some((e) => e.title.trim().toLowerCase() === t.trim().toLowerCase());

  function request(title: string) {
    const t = title.trim();
    if (!t || asked(t)) return;
    addEvidenceItem(t, { checkIds: [check.id], system: check.system, discipline: check.discipline });
  }

  return (
    <div className="flex flex-col gap-4">
      <section>
        <div className="label-xs mb-1">Standard evidence for this check — from the register</div>
        {standard.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {standard.map((s, i) => (
              <li
                key={i}
                className="flex items-start justify-between gap-2 rounded-[8px] border px-[10px] py-[8px]"
                style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
              >
                <span className="text-[12.5px] leading-[1.55]" style={{ color: "var(--ink-2)" }}>
                  {s}
                </span>
                <Btn className="shrink-0 text-[11px]" disabled={asked(s)} onClick={() => request(s)}>
                  {asked(s) ? "Requested" : "Request"}
                </Btn>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            The register sets no standard evidence for this check.
          </p>
        )}
        {check.acsaEvidence.length > 0 && (
          <div className="mt-2">
            <div className="label-xs mb-1">Records ACSA&apos;s own documents name</div>
            <ul className="list-disc pl-4 text-[12.5px] leading-[1.7]" style={{ color: "var(--ink-2)" }}>
              {check.acsaEvidence.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section>
        <div className="label-xs mb-1">Requested on this check ({linked.length})</div>
        {linked.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {linked.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                <span>{e.title}</span>
                <span className="font-mono text-[10.5px]" style={{ color: "var(--ink-3)" }}>
                  {trackingStage(e)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            Nothing requested against this check yet.
          </p>
        )}
      </section>

      <section>
        <div className="label-xs mb-1">Ask for something specific</div>
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                request(text);
                setText("");
              }
            }}
            placeholder="e.g. Maintenance log for the last 12 months"
            aria-label="Additional evidence to request"
            className="min-h-[44px] min-w-0 flex-1 rounded-[8px] border px-3 text-[13px]"
            style={{ borderColor: "var(--line-2)", background: "var(--panel)" }}
          />
          <Btn
            variant="primary"
            disabled={!text.trim() || asked(text)}
            onClick={() => {
              request(text);
              setText("");
            }}
          >
            Request
          </Btn>
        </div>
        <p className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
          It is added to the Evidence list, linked to this check, as Requested.
        </p>
      </section>
    </div>
  );
}
