"use client";

/** QUICK EVIDENCE REQUEST — Sarel: "the capture evidence is too
 *  complicated. it is just an option to capture evidence ie Planned
 *  maintenance schedule for runway markings for one week, inspection
 *  records of stormwater for 2 days. this is linked to a discipline. add a
 *  simple capture to the review page." Originally built straight into
 *  ReviewRiskTable.tsx's "Risk & root cause" tab; moved out to its own file
 *  — Sarel: "move the evidence request to a separate tab inside the review
 *  page" — so it can sit at the top of review/page.tsx's new "Evidence" tab
 *  instead, above the full tracking view (EvidenceReviewView) that already
 *  carries status, compliance rating and review feedback.
 *
 *  Two fields and a button — a discipline and one line saying what's
 *  needed (the auditor's own words carry the "for one week"/"for 2 days"
 *  part; nothing here tries to parse a period out of free text). Writes
 *  through the SAME addEvidenceItem store action every other evidence-
 *  request entry point in this app already calls — ReviewRiskPanel's own
 *  "Request for this check/system/discipline" buttons, and /evidence's own
 *  "Log it" — so the result is a real EvidenceItem, in the real Evidence
 *  log, not a second record kind invented here. It deliberately does NOT
 *  redirect anywhere afterward: the full form (document number, medium,
 *  received-by, returned-to, …) is for whoever actually chases the
 *  document down, not for the moment of noticing it's needed — and the rest
 *  of that chasing now has its own tab, right below this. */

import { useState } from "react";
import { useStore } from "@/lib/store";
import { ALL_DISCIPLINES } from "@/lib/register";

export default function EvidenceQuickCapture() {
  const addEvidenceItem = useStore((s) => s.addEvidenceItem);
  const [discipline, setDiscipline] = useState("");
  const [text, setText] = useState("");
  const [justAdded, setJustAdded] = useState<string | null>(null);

  function submit() {
    const t = text.trim();
    if (!t || !discipline) return;
    addEvidenceItem(t, { discipline });
    setText("");
    setJustAdded(t);
  }

  return (
    <div
      className="mb-2.5 rounded-[11px] border p-2.5"
      style={{ borderColor: "var(--line-2)", background: "var(--sunken)" }}
    >
      <div
        className="mb-1.5 text-[10px] font-semibold tracking-[.03em] uppercase"
        style={{ color: "var(--ink-3)" }}
      >
        Request evidence
      </div>
      <div className="flex flex-wrap items-center gap-[6px]">
        <select
          aria-label="Which discipline this evidence request is about"
          value={discipline}
          onChange={(e) => {
            setDiscipline(e.target.value);
            setJustAdded(null);
          }}
          className="h-[30px] rounded-[8px] border px-2 text-[11px]"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
        >
          <option value="">Discipline…</option>
          {ALL_DISCIPLINES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setJustAdded(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="What's needed — e.g. Planned maintenance schedule for runway markings, for the last week"
          className="h-[30px] min-w-[260px] flex-1 rounded-[8px] border px-2 text-[11px]"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim() || !discipline}
          className="h-[30px] rounded-[8px] px-3 text-[11px] font-semibold disabled:opacity-55"
          style={{ background: "var(--acc)", color: "#fff" }}
        >
          Request
        </button>
      </div>
      {justAdded && (
        <div className="mt-1.5 text-[10.5px]" style={{ color: "var(--good)" }}>
          &ldquo;{justAdded}&rdquo; requested — it&rsquo;s in the Evidence log now.
        </div>
      )}
    </div>
  );
}
