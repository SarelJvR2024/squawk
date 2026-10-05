import type { Check } from "@/lib/types";

/** ACSA's own requirement for one check, read-only, independent of any
 *  response or capture state — the desk screen's "ACSA requirement" panel
 *  and the walk's new ACSA tab (see field/page.tsx) show the exact same
 *  thing, because it is the exact same question asked from two screens:
 *  what does ACSA actually require here. One component, not two copies
 *  that drift the next time a field on `Check` changes.
 *
 *  Extracted from CheckDetail's "standard" panel rather than duplicated —
 *  see that file's history for why this reads as one subject (the standard,
 *  the site's override of it, and ACSA's own words for it) rather than
 *  three. */
export default function AcsaRequirementPanel({ check }: { check: Check }) {
  return (
    <>
      {/* ACSA'S OWN WORDS FIRST, verbatim and in quotation marks where the
          register quotes them, with the document and clause that carry them.
          This is the only text on this screen that can be put to ACSA as
          their own.

          max-w-[92ch] IS THE READABLE LINE LENGTH, NOT A LAYOUT ACCIDENT —
          every text block in this panel caps at it so a long paragraph
          does not stretch edge to edge and become hard to track line to
          line. Sarel, on a wide desktop window: real empty space to the
          right of it, wasted rather than planned. Both things are true —
          92ch stays the cap up to xl (1280px), where the panel is at
          tablet-ish width and the cap is doing its job; xl:max-w-[150ch]
          widens it only once the window is wide enough that the gutter
          was genuinely idle rather than protecting readability. Every
          occurrence in this component carries the same pair, so the
          panel reads as one typographic decision, not seven. */}
      {check.acsaRequirement && (
        <div className="mb-2.5">
          <div className="label-xs" style={{ color: "var(--ink-4)" }}>
            What ACSA requires
            {check.acsaDocs.length > 0 &&
              ` · ${check.acsaDocs
                .map((d) => `${d.doc}${d.clause ? ` cl. ${d.clause}` : ""}`)
                .join("; ")}`}
          </div>
          <div className="mt-1 max-w-[92ch] xl:max-w-[150ch] text-[12.5px] leading-[1.55]">
            {check.acsaRequirement}
          </div>
        </div>
      )}

      <div className="label-xs">The standard to audit against · the register&rsquo;s own column</div>
      <div className="mt-1 max-w-[92ch] xl:max-w-[150ch] text-[13.5px] leading-[1.5] font-semibold">
        {check.target || "—"}
      </div>

      {check.siteVariant?.conflict ? (
        /* BOTH FIGURES, SIDE BY SIDE, AND THE CHECK IS NOT REWRITTEN.
           ACSA's register is the client's document. A row quietly edited to
           say something ACSA never wrote is a row nobody can reconcile
           against their own copy at the out-brief — so the check keeps its
           wording and the site's requirement sits beside it, labelled.
           The auditor decides against the one that governs here; the report
           can cite both. */
        <div
          className="mt-2.5 rounded-[9px] border px-[10px] py-[8px]"
          style={{ background: "var(--bad-bg)", borderColor: "var(--bad-line)" }}
        >
          <div className="label-xs" style={{ color: "var(--bad)" }}>
            Conflict — the check and ACSA&rsquo;s own manual disagree at {check.siteVariant.site}
          </div>
          <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
            <div>
              <div className="label-xs" style={{ color: "var(--ink-3)" }}>
                The check as written says
              </div>
              <div className="mt-[3px] text-[12.5px] leading-[1.5]" style={{ color: "var(--ink-2)" }}>
                {check.siteVariant.conflict.checkSays}
              </div>
            </div>
            <div>
              <div className="label-xs" style={{ color: "var(--bad)" }}>
                {check.siteVariant.site} requires — this governs
              </div>
              <div className="mt-[3px] text-[12.5px] leading-[1.5] font-semibold" style={{ color: "var(--bad)" }}>
                {check.siteVariant.conflict.siteRequires}
              </div>
            </div>
          </div>
          <div className="mt-1.5 font-mono text-[9.5px]" style={{ color: "var(--bad)" }}>
            {check.siteVariant.conflict.source}
            {check.siteVariant.conflict.direction === "stricter" &&
              " · auditing to the check as written would pass an installation this site's own manual says is overdue"}
            {check.siteVariant.conflict.direction === "looser" &&
              " · the check asks for more than ACSA requires here — see the evidence question before raising a finding"}
            {check.siteVariant.conflict.direction === "different" &&
              " · not stricter or looser, a different obligation — read both"}
          </div>
        </div>
      ) : check.siteVariant ? (
        /* 40 checks carry a threshold stricter than the network default at
           this site — 32 of them plain variants, the other 8 conflicts,
           handled in the branch above. It goes above ACSA's network wording,
           not in a tooltip — an auditor who reads the network figure and
           misses this one audits against the wrong standard. */
        <div
          className="mt-2.5 rounded-[9px] border px-[10px] py-[8px]"
          style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line)" }}
        >
          <div className="label-xs" style={{ color: "var(--warn)" }}>
            {check.siteVariant.site} applies here — this overrides the network default
          </div>
          <div
            className="mt-1 text-[12.5px] leading-[1.55] whitespace-pre-line"
            style={{ color: "var(--warn)" }}
          >
            {check.siteVariant.note}
          </div>
        </div>
      ) : null}

      {/* WHAT MAKES IT COMPLIANT. Written for the 95 checks whose evidence
          column was a stub — "Test records", "Inspection; programme", nine
          of them empty — and for every check whose ACSA threshold fights its
          own wording. It sits directly under the standard, because it is the
          sentence the evidence gets held against. */}
      {check.complianceTest && (
        <div
          className="mt-2.5 rounded-[9px] border px-[10px] py-[8px]"
          style={{ background: "var(--good-bg)", borderColor: "var(--good-line)" }}
        >
          <div className="label-xs" style={{ color: "var(--good)" }}>
            Compliant when — agreed in the register review, {check.confirmedBy?.toLowerCase()}
            {check.inspect === "reconcile"
              ? ", reconciled on the walk"
              : check.inspect === "examine"
                ? ", seen on the walk"
                : ", nothing to see on site"}
          </div>
          <div className="mt-1 max-w-[92ch] xl:max-w-[150ch] text-[12.5px] leading-[1.55]" style={{ color: "var(--ink-2)" }}>
            {check.complianceTest}
          </div>
        </div>
      )}

      {check.acsaThreshold ? (
        <div
          className="mt-2.5 rounded-[9px] border px-[10px] py-[8px]"
          style={{ background: "var(--acc-soft)", borderColor: "var(--acc-line)" }}
        >
          <div className="label-xs" style={{ color: "var(--acc)" }}>
            ACSA states ·{" "}
            {check.acsaDocs
              .map((d) => `${d.doc}${d.clause ? ` cl. ${d.clause}` : ""}`)
              .join("; ")}
          </div>
          <div className="mt-1 text-[12.5px] leading-[1.55]" style={{ color: "var(--acc)" }}>
            {check.acsaThreshold}
          </div>
        </div>
      ) : (
        /* Silence on screen reads as "nothing to see here". It is the
           opposite: where ACSA's own documents set no threshold, there is no
           standard to audit against, and that is itself the finding. Say it,
           rather than leaving a gap the auditor has to notice. */
        <div
          className="mt-2.5 rounded-[9px] border px-[10px] py-[8px]"
          style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line)" }}
        >
          <div className="label-xs" style={{ color: "var(--warn)" }}>
            ACSA states no threshold
          </div>
          <div className="mt-1 text-[12.5px] leading-[1.55]" style={{ color: "var(--warn)" }}>
            {check.acsaDocs.length > 0
              ? `${check.acsaDocs
                  .map((d) => d.doc)
                  .join(", ")} covers this but sets no interval, limit or acceptance value. Compliance cannot be assessed against a stated standard — raise the absence itself.`
              : "No ACSA document covering this check has been identified. There is no internal standard to audit against — raise the absence itself."}
          </div>
        </div>
      )}
    </>
  );
}
