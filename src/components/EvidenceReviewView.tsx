"use client";

/** EVIDENCE REVIEW — the "By discipline" tracking view, rebuilt for Sarel's
 *  Evidence-review brief. See docs/capture-review/evidence-review-discovery.md
 *  for the full translation; the short version: this EXTENDS the existing
 *  "By discipline" tab on /evidence (added in the Review table v2 pass)
 *  rather than building a new screen or a new tab on /review — the chain-
 *  of-custody record (EvidenceItem, src/lib/evidence.ts) stays owned by the
 *  one screen that already owns it.
 *
 *  Table + a static right panel (EvidenceReviewPanel), same shape as
 *  ReviewRiskTable/ReviewRiskPanel on /review's "Risk & root cause" tab —
 *  not the brief's own mockup of a panel sliding in as an overlay, because
 *  this app has no overlay panel anywhere else and the brief's own rule is
 *  that the existing design system wins on a conflict. */

import { useMemo, useState } from "react";
import { checksAt, disciplinesAt, systemsOf } from "@/lib/register";
import { portalIdFor, siteFor } from "@/lib/sites";
import {
  EVIDENCE_COMPLIANCE_LABEL,
  TRACKING_LABEL,
  disciplineFor,
  groupByDiscipline,
  shareListText,
  sortWithinDiscipline,
  trackingStage,
  type EvidenceTrackingStage,
} from "@/lib/evidence";
import { useEntityCode, useStore, useEvidenceItems } from "@/lib/store";
import { FileButton, type FileCapture } from "@/components/Capture";
import EvidenceReviewPanel from "@/components/EvidenceReviewPanel";
import Sheet from "@/components/ui/Sheet";
import { Btn, Empty, Field, Pill, type Tone } from "@/components/ui/primitives";
import { DisciplineSelect } from "@/components/ui/DisciplineSelect";
import { IconInbox } from "@/components/ui/icons";
import type { EvidenceItem } from "@/lib/types";

const inputCls = "w-full rounded-[8px] border px-3 py-2 text-[13px]";
const inputStyle = { background: "var(--bg)", borderColor: "var(--line)" } as const;

const STAGE_TONE: Partial<Record<EvidenceTrackingStage, Tone>> = {
  requested: "neutral",
  notStarted: "neutral",
  uploaded: "warn",
  received: "accent",
  analysis: "good",
  insufficient: "bad",
  unavailable: "warn",
};

/** 3.1 of the brief — the six count cards. */
const COUNT_CARDS: { key: "all" | EvidenceTrackingStage; label: string }[] = [
  { key: "all", label: "Total requested" },
  { key: "requested", label: "Requested" },
  { key: "uploaded", label: "Uploaded" },
  { key: "received", label: "Received" },
  { key: "analysis", label: "Analysed" },
  { key: "insufficient", label: "Insufficient" },
];

/** 3.2/3.3 of the brief — the status pills and table's own status column
 *  cover exactly these five; `notStarted`/`returned`/`unavailable` are the
 *  custody register's own edge states (an item nulled back to "not
 *  requested", an ACSA original given back) and stay visible under "All"
 *  without a dedicated pill — this is a review surface, not a second
 *  custody log. */
const STATUS_PILLS: { key: "all" | EvidenceTrackingStage; label: string }[] = [
  { key: "all", label: "All" },
  { key: "requested", label: "Requested" },
  { key: "uploaded", label: "Uploaded" },
  { key: "received", label: "Received" },
  { key: "analysis", label: "Analysed" },
  { key: "insufficient", label: "Insufficient" },
];

export default function EvidenceReviewView({
  onOpenRecord,
}: {
  /** Escape hatch into the real per-document editor ("By document" tab) —
   *  same hand-off ReviewRiskPanel's own Evidence section already uses,
   *  not a second editor built here. */
  onOpenRecord?: (id: string) => void;
}) {
  const items = useEvidenceItems();
  const entityCode = useEntityCode();
  const visitId = useStore((s) => s.visit);
  const auditor = useStore((s) => s.auditor);
  const add = useStore((s) => s.addEvidenceItem);
  const patch = useStore((s) => s.updateEvidenceItem);
  const addPhoto = useStore((s) => s.addEvidenceAttachment);
  const reRequest = useStore((s) => s.reRequestEvidence);

  const disciplines = useMemo(() => disciplinesAt(entityCode), [entityCode]);
  const allChecks = useMemo(() => checksAt(entityCode), [entityCode]);
  const checkDisciplineOf = useMemo(() => {
    const m = new Map(allChecks.map((c) => [c.id, c.discipline]));
    return (id: string) => m.get(id);
  }, [allChecks]);
  const disciplineOf = useMemo(
    () => (e: EvidenceItem) => disciplineFor(e, checkDisciplineOf),
    [checkDisciplineOf]
  );

  const [disciplineFilter, setDisciplineFilter] = useState<string>("all");
  const [systemFilter, setSystemFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_PILLS)[number]["key"]>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [shared, setShared] = useState(false);

  const systemOptions = disciplineFilter === "all" ? [] : systemsOf(entityCode, disciplineFilter);

  /* 3.2 — "discipline/asset-system" filtered, before the status pill. Both
     the count cards (3.1) and the status pills' own bracketed counts read
     off this, never off the status-filtered set — a pill showing its own
     count filtered by itself would always read as the row count. */
  const baseFiltered = useMemo(
    () =>
      items.filter((e) => {
        if (disciplineFilter !== "all" && disciplineOf(e) !== disciplineFilter) return false;
        if (systemFilter === "general" && e.system) return false;
        if (systemFilter !== "all" && systemFilter !== "general" && e.system !== systemFilter) return false;
        return true;
      }),
    [items, disciplineFilter, systemFilter, disciplineOf]
  );

  const counts = useMemo(() => {
    const c: Record<"all" | EvidenceTrackingStage, number> = {
      all: baseFiltered.length,
      notStarted: 0,
      requested: 0,
      uploaded: 0,
      received: 0,
      analysis: 0,
      insufficient: 0,
      returned: 0,
      unavailable: 0,
    };
    for (const e of baseFiltered) c[trackingStage(e)]++;
    return c;
  }, [baseFiltered]);

  const visible = useMemo(() => {
    if (statusFilter === "all") return baseFiltered;
    /* "Requested" also catches the legacy notStarted edge-case — see this
       file's own STATUS_PILLS comment. */
    if (statusFilter === "requested")
      return baseFiltered.filter((e) => ["requested", "notStarted"].includes(trackingStage(e)));
    return baseFiltered.filter((e) => trackingStage(e) === statusFilter);
  }, [baseFiltered, statusFilter]);

  const groups = useMemo(
    () =>
      groupByDiscipline(visible, disciplineOf).map((g) => ({
        ...g,
        items: sortWithinDiscipline(g.items),
      })),
    [visible, disciplineOf]
  );

  /* The flat, on-screen order — what "previous/next" in the panel steps
     through (4.1 of the brief: "without closing the panel"). */
  const flatOrder = useMemo(() => groups.flatMap((g) => g.items.map((e) => e.id)), [groups]);
  const openItem = openId ? items.find((e) => e.id === openId) ?? null : null;
  const openIndex = openId ? flatOrder.indexOf(openId) : -1;

  const site = siteFor(entityCode);

  function shareDiscipline() {
    const text = shareListText(items, disciplineFilter, disciplineOf, {
      siteName: site ? `${site.name} (${site.icao})` : entityCode,
      visitId,
      portalId: (id) => portalIdFor(entityCode, id),
    });
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setShared(true);
        window.setTimeout(() => setShared(false), 2500);
      })
      .catch(() => window.prompt("Copy this list", text));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto w-full max-w-[1100px] px-1 pb-4">
        {/* 3.1 — header */}
        <header className="mb-3">
          <h2 className="font-display text-[15px] font-semibold">Evidence</h2>
          <p className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
            One list per discipline · every request keeps its link to the asset system and
            audit check it was raised against.
          </p>
        </header>

        {/* count cards — 3.1. Live counts off baseFiltered (discipline/
            asset-system filters only), same base the status pills' own
            bracketed counts below use, so neither reads circularly off the
            status filter it is next to. */}
        <div className="mb-3 grid grid-cols-3 gap-[6px] sm:grid-cols-6">
          {COUNT_CARDS.map((c) => (
            <div
              key={c.key}
              className="rounded-[11px] border px-[9px] py-[8px]"
              style={{ background: "var(--panel)", borderColor: "var(--line)" }}
            >
              <div className="font-mono text-[9px] uppercase" style={{ color: "var(--ink-4)" }}>
                {c.label}
              </div>
              <div className="text-[16px] font-bold">{counts[c.key]}</div>
            </div>
          ))}
        </div>

        {/* 3.2 — filters */}
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <select
              value={disciplineFilter}
              onChange={(e) => {
                setDisciplineFilter(e.target.value);
                setSystemFilter("all");
              }}
              aria-label="Filter by discipline"
              className={`${inputCls} min-w-[160px]`}
              style={inputStyle}
            >
              <option value="all">All disciplines</option>
              {disciplines.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              value={systemFilter}
              onChange={(e) => setSystemFilter(e.target.value)}
              aria-label="Filter by asset system"
              disabled={disciplineFilter === "all"}
              className={`${inputCls} min-w-[160px]`}
              style={inputStyle}
            >
              <option value="all">All asset systems</option>
              <option value="general">General</option>
              {systemOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Btn
              disabled={disciplineFilter === "all"}
              title={disciplineFilter === "all" ? "Pick one discipline first" : undefined}
              onClick={shareDiscipline}
            >
              {shared ? "Copied" : "Share list with discipline"}
            </Btn>
            <Btn variant="primary" onClick={() => setAddOpen(true)}>
              + Add request
            </Btn>
          </div>
        </div>

        {/* status pills, always visible with counts — 3.2 */}
        <div className="mb-3 flex flex-wrap gap-[6px]" role="radiogroup" aria-label="Filter by status">
          {STATUS_PILLS.map((p) => {
            const selected = statusFilter === p.key;
            const n = p.key === "all" ? counts.all : counts[p.key];
            return (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setStatusFilter(p.key)}
                className="rounded-full border px-[11px] py-[5px] text-[11.5px] transition-[var(--t)]"
                style={
                  selected
                    ? { background: "var(--acc)", borderColor: "var(--acc)", color: "var(--on-acc)" }
                    : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }
                }
              >
                {p.label} ({n})
              </button>
            );
          })}
        </div>

        <div className="flex min-h-0 flex-1 gap-3">
          <div className="min-w-0 flex-1">
            {items.length === 0 ? (
              <Empty>
                <IconInbox width={26} height={26} />
                <b>No evidence requested yet.</b>
                <span>Add a request to start tracking what you need from the airport.</span>
                <Btn variant="primary" className="mt-2" onClick={() => setAddOpen(true)}>
                  + Add request
                </Btn>
              </Empty>
            ) : groups.length === 0 ? (
              <Empty>
                <b>No requests match these filters.</b>
                <Btn
                  className="mt-2"
                  onClick={() => {
                    setDisciplineFilter("all");
                    setSystemFilter("all");
                    setStatusFilter("all");
                  }}
                >
                  Clear filters
                </Btn>
              </Empty>
            ) : (
              groups.map((g) => (
                <div key={g.discipline} className="mb-4">
                  <div className="mb-2 flex items-baseline justify-between">
                    <b className="text-[13px]">{g.discipline}</b>
                    <span className="font-mono text-[9.5px]" style={{ color: "var(--ink-4)" }}>
                      {g.items.length} request{g.items.length === 1 ? "" : "s"} ·{" "}
                      {g.items.filter((e) => trackingStage(e) === "analysis").length} analysed
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-[11px] border" style={{ borderColor: "var(--line)" }}>
                    <table className="w-full text-left text-[12px]">
                      <thead>
                        <tr style={{ background: "var(--panel-2, var(--bg))" }}>
                          {["Evidence item", "Linked to", "Status", "Compliance", "Files", ""].map((h) => (
                            <th key={h} className="px-3 py-2 font-mono text-[9.5px]" style={{ color: "var(--ink-4)" }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.map((e) => (
                          <Row
                            key={e.id}
                            item={e}
                            entityCode={entityCode}
                            discipline={g.discipline}
                            onOpen={() => setOpenId(e.id)}
                            onAttach={(m) => addPhoto(e.id, { ...m, createdBy: auditor })}
                            onMarkReceived={() => patch(e.id, { receivedAt: Date.now() })}
                            onReRequest={() => reRequest(e.id)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>

          {openItem && (
            <div
              className="hidden w-[420px] shrink-0 overflow-y-auto border-l p-3 md:block"
              style={{ borderColor: "var(--line)", background: "var(--panel)" }}
            >
              <EvidenceReviewPanel
                key={openItem.id}
                item={openItem}
                entityCode={entityCode}
                visitId={visitId}
                auditor={auditor}
                disciplines={disciplines}
                onClose={() => setOpenId(null)}
                onPrev={openIndex > 0 ? () => setOpenId(flatOrder[openIndex - 1]) : undefined}
                onNext={
                  openIndex >= 0 && openIndex < flatOrder.length - 1
                    ? () => setOpenId(flatOrder[openIndex + 1])
                    : undefined
                }
              />
            </div>
          )}
        </div>
      </div>

      <AddEvidenceRequestSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        entityCode={entityCode}
        disciplines={disciplines}
        onAdd={(seed) => {
          const id = add(seed.title, seed);
          setAddOpen(false);
          setOpenId(id);
        }}
      />

      {onOpenRecord && (
        <p className="mt-2 text-center text-[10px]" style={{ color: "var(--ink-4)" }}>
          Need the full custody record (medium, signature, originals)?{" "}
          <button type="button" className="underline" onClick={() => openId && onOpenRecord(openId)}>
            Open it in &ldquo;By document&rdquo;
          </button>
        </p>
      )}
    </div>
  );
}

function Row({
  item: e,
  entityCode,
  discipline,
  onOpen,
  onAttach,
  onMarkReceived,
  onReRequest,
}: {
  item: EvidenceItem;
  entityCode: string;
  discipline: string;
  onOpen: () => void;
  onAttach: (m: FileCapture) => void;
  onMarkReceived: () => void;
  onReRequest: () => void;
}) {
  const stage = trackingStage(e);
  const check = e.checkIds.length ? checksAt(entityCode).find((c) => c.id === e.checkIds[0]) : undefined;

  return (
    <tr
      className="cursor-pointer border-t"
      style={{ borderColor: "var(--line)" }}
      onClick={onOpen}
    >
      <td className="max-w-[220px] px-3 py-2 align-top">
        <b className="line-clamp-2">{e.title || e.id}</b>
      </td>
      <td className="max-w-[220px] px-3 py-2 align-top">
        {/* 3.3 — "If no asset system is linked, show a purple General tag".
            Gated on e.system (the EvidenceItem's OWN scope field), not on
            whether a check happens to be linked too — same reading
            evidence.ts's own disciplineFor()/the panel's "Linked to" card
            use throughout this pass. */}
        {e.system ? (
          <div>
            <b>{e.system}</b>
            {check ? (
              <div className="text-[10.5px]" style={{ color: "var(--ink-4)" }}>
                {check.requirement.slice(0, 80)}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Pill tone="accent">General</Pill>
            <span className="text-[10.5px]" style={{ color: "var(--ink-4)" }}>
              {discipline} discipline
            </span>
          </div>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <Pill tone={STAGE_TONE[stage]}>{TRACKING_LABEL[stage]}</Pill>
      </td>
      <td className="px-3 py-2 align-top">
        {e.complianceRating ? (
          <Pill
            tone={
              e.complianceRating === "compliant"
                ? "good"
                : e.complianceRating === "partial"
                  ? "warn"
                  : "bad"
            }
          >
            {EVIDENCE_COMPLIANCE_LABEL[e.complianceRating]}
          </Pill>
        ) : stage === "analysis" || stage === "insufficient" ? (
          <span
            className="inline-flex rounded-[8px] border border-dashed px-2 py-[2px] font-mono text-[9.5px]"
            style={{ borderColor: "var(--line-3)", color: "var(--ink-3)" }}
          >
            Not rated
          </span>
        ) : (
          <span style={{ color: "var(--ink-4)" }}>—</span>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        {e.attachments.length ? `${e.attachments.length} files` : <span style={{ color: "var(--ink-4)" }}>—</span>}
      </td>
      <td className="px-3 py-2 align-top" onClick={(ev) => ev.stopPropagation()}>
        {stage === "requested" || stage === "notStarted" ? (
          <FileButton compact onCaptured={onAttach} />
        ) : stage === "uploaded" ? (
          <Btn onClick={onMarkReceived}>Mark received</Btn>
        ) : stage === "insufficient" ? (
          <Btn onClick={onReRequest}>Re-request</Btn>
        ) : (
          <Btn onClick={onOpen}>{stage === "received" ? "Analyse" : "Open"}</Btn>
        )}
      </td>
    </tr>
  );
}

/** 3.5 of the brief — title required, discipline required, asset system and
 *  audit check optional and dynamic. Leaving system/check empty is exactly
 *  what makes a General, discipline-level request — same rule the panel's
 *  own "Linked to" card states as helper text. */
function AddEvidenceRequestSheet({
  open,
  onClose,
  entityCode,
  disciplines,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  entityCode: string;
  disciplines: string[];
  onAdd: (seed: { title: string; notes: string; discipline?: string; system?: string; checkIds: string[] }) => void;
}) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [discipline, setDiscipline] = useState(disciplines[0] ?? "");
  const [system, setSystem] = useState("");
  const [checkId, setCheckId] = useState("");

  const systemOptions = discipline ? systemsOf(entityCode, discipline) : [];
  const checkOptions = discipline ? checksAt(entityCode).filter((c) => c.discipline === discipline && (!system || c.system === system)) : [];

  function reset() {
    setTitle("");
    setDetail("");
    setDiscipline(disciplines[0] ?? "");
    setSystem("");
    setCheckId("");
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        onClose();
        reset();
      }}
      title="Add evidence request"
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn
            variant="primary"
            disabled={!title.trim() || !discipline}
            onClick={() => {
              onAdd({
                title: title.trim(),
                notes: detail.trim(),
                discipline,
                system: system || undefined,
                checkIds: checkId ? [checkId] : [],
              });
              reset();
            }}
          >
            Add request
          </Btn>
        </>
      }
    >
      <Field label="TITLE" hint="required">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="What is being requested"
          placeholder="What is being requested"
          className={inputCls}
          style={inputStyle}
        />
      </Field>
      <Field label="DETAIL" hint="optional">
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={2}
          aria-label="Extra description"
          className={inputCls}
          style={inputStyle}
        />
      </Field>
      <Field label="DISCIPLINE" hint="required">
        <DisciplineSelect
          ariaLabel="Discipline"
          value={discipline}
          onChange={(v) => {
            setDiscipline(v);
            setSystem("");
            setCheckId("");
          }}
          options={disciplines.map((d) => ({ value: d, label: d }))}
        />
      </Field>
      <Field label="ASSET SYSTEM" hint="optional — leave empty for General">
        <select
          value={system}
          onChange={(e) => {
            setSystem(e.target.value);
            setCheckId("");
          }}
          aria-label="Asset system"
          disabled={!discipline}
          className={inputCls}
          style={inputStyle}
        >
          <option value="">General (discipline-level)</option>
          {systemOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="AUDIT CHECK" hint="optional">
        <select
          value={checkId}
          onChange={(e) => setCheckId(e.target.value)}
          aria-label="Audit check"
          disabled={!discipline}
          className={inputCls}
          style={inputStyle}
        >
          <option value="">No specific check</option>
          {checkOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.requirement.slice(0, 80)}
            </option>
          ))}
        </select>
      </Field>
    </Sheet>
  );
}
