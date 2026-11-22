"use client";

/** THE "BY CHECK" VIEW — build prompt 6: "redesign /evidence and the
 *  check's evidence row as one evidence record with two views... 'By
 *  document' (one evidence item with every check it satisfies) and 'By
 *  check'. Same records."
 *
 *  SAME RECORDS, REGROUPED — not a second list. Every `EvidenceItem` this
 *  view shows is exactly the one `useEvidenceItems()` already returns for
 *  "By document"; this view only changes what the items are filed under.
 *  An item linked to several checks (`EvidenceItem.checkIds`, the
 *  many-to-many that already exists) appears once under EACH of them —
 *  "satisfies checks 19, 20, 23" cuts both ways: it also means asking
 *  about check 20 and check 23 both turn up the same one document.
 *
 *  AN ITEM WITH NO CHECK LINKED stays out of this view entirely (it has
 *  nowhere to file under, by definition of what this view is grouped by)
 *  — it is still fully present in "By document", which this screen
 *  already offers right beside it.
 *
 *  OPEN JUMPS BACK TO THE FULL CUSTODY RECORD — same "one record, two
 *  detail renderings reached from two views" precedent
 *  EvidenceReviewView.tsx's own `onOpenRecord` already set: this view
 *  does not duplicate the full edit form (title, doc no/rev, received-by
 *  medium, custody, signature...), it only adds quick actions for the
 *  three the spec names (Load file, mark status, re-request) plus a way
 *  back to that form. */

import { useMemo, useState } from "react";
import { checksAt, useEntityCode, useEvidenceItems, useStore } from "@/lib/store";
import { channelsOf } from "@/lib/channels";
import {
  DISPLAY_STATUS_LABEL,
  displayStatus,
  satisfiesLabel,
} from "@/lib/evidence";
import type { EvidenceDisplayStatus } from "@/lib/evidence";
import { portalIdFor } from "@/lib/sites";
import { Btn, Empty, Panel, Pill } from "@/components/ui/primitives";
import { FileButton } from "@/components/Capture";
import type { EvidenceItem } from "@/lib/types";

const STATUS_TONE: Record<EvidenceDisplayStatus, "good" | "warn"> = {
  requested: "warn",
  received: "good",
  unavailable: "warn",
};

export default function EvidenceByCheckView({
  onOpenRecord,
}: {
  onOpenRecord: (id: string) => void;
}) {
  const items = useEvidenceItems();
  const entityCode = useEntityCode();
  const config = useStore((s) => s.checkChannels);
  const patch = useStore((s) => s.updateEvidenceItem);
  const reRequest = useStore((s) => s.reRequestEvidence);
  const addPhoto = useStore((s) => s.addEvidenceAttachment);
  const auditor = useStore((s) => s.auditor);

  const [statusFilter, setStatusFilter] = useState<"all" | EvidenceDisplayStatus>("all");

  /* Only checks the evidence channel is actually on for — the same test
     every other screen in this redesign uses (channelsOf, src/lib/channels.ts).
     A check Setup has switched evidence off for has nowhere to request it
     from in the first place, so nothing here would ever be filed under it. */
  const checks = useMemo(
    () => checksAt(entityCode).filter((c) => channelsOf(config, c.id).evidence),
    [entityCode, config],
  );
  const checkById = useMemo(() => new Map(checks.map((c) => [c.id, c])), [checks]);

  const statusCounts = useMemo(() => {
    const c: Record<"all" | EvidenceDisplayStatus, number> = {
      all: items.length,
      requested: 0,
      received: 0,
      unavailable: 0,
    };
    for (const e of items) c[displayStatus(e)]++;
    return c;
  }, [items]);

  const visibleItems =
    statusFilter === "all" ? items : items.filter((e) => displayStatus(e) === statusFilter);

  const byCheck = useMemo(() => {
    const map = new Map<string, EvidenceItem[]>();
    for (const e of visibleItems) {
      for (const id of e.checkIds) {
        if (!checkById.has(id)) continue;
        map.set(id, [...(map.get(id) ?? []), e]);
      }
    }
    return map;
  }, [visibleItems, checkById]);

  const groups = checks.filter((c) => byCheck.has(c.id));

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-[6px]" role="radiogroup" aria-label="Filter by status">
        {(
          [
            ["all", "All"],
            ["requested", DISPLAY_STATUS_LABEL.requested],
            ["received", DISPLAY_STATUS_LABEL.received],
            ["unavailable", DISPLAY_STATUS_LABEL.unavailable],
          ] as const
        ).map(([key, label]) => {
          const selected = statusFilter === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setStatusFilter(key)}
              className="rounded-full border px-[11px] py-[5px] text-[11.5px] transition-[var(--t)]"
              style={
                selected
                  ? { background: "var(--acc)", borderColor: "var(--acc)", color: "var(--on-acc)" }
                  : { background: "var(--panel)", borderColor: "var(--line-2)", color: "var(--ink-2)" }
              }
            >
              {label} ({statusCounts[key]})
            </button>
          );
        })}
      </div>

      {groups.length === 0 ? (
        <Empty>
          <b>No evidence linked to a check yet.</b>
          <span>
            An item with no check-point linked still shows in &ldquo;By document&rdquo; — this
            view only groups what is already linked.
          </span>
        </Empty>
      ) : (
        groups.map((c) => {
          const checkItems = byCheck.get(c.id) ?? [];
          return (
            <Panel key={c.id} className="mb-3">
              <div className="mb-2 flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-[10px]" style={{ color: "var(--ink-4)" }}>
                  {portalIdFor(entityCode, c.id)}
                </span>
                <span className="text-[13px] font-semibold">{c.requirement}</span>
              </div>
              {checkItems.map((e) => {
                const dstatus = displayStatus(e);
                const others = e.checkIds.filter((id) => id !== c.id);
                return (
                  <div
                    key={e.id}
                    className="flex flex-col gap-[6px] border-t py-2"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[10px]">{e.id}</span>
                          <Pill tone={STATUS_TONE[dstatus]}>{DISPLAY_STATUS_LABEL[dstatus]}</Pill>
                        </div>
                        <p className="mt-1 text-[12.5px]">{e.title || "—"}</p>
                        {others.length > 0 && (
                          <p className="mt-1 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
                            ALSO {satisfiesLabel(others, (id) => portalIdFor(entityCode, id)).toUpperCase()}
                          </p>
                        )}
                      </div>
                      <Btn onClick={() => onOpenRecord(e.id)}>Open</Btn>
                    </div>
                    <div className="flex flex-wrap items-center gap-[6px]">
                      <FileButton compact onCaptured={(m) => addPhoto(e.id, { ...m, createdBy: auditor })} />
                      {dstatus === "requested" && (
                        <>
                          <Btn onClick={() => patch(e.id, { receivedAt: Date.now() })}>Mark received</Btn>
                          <Btn onClick={() => patch(e.id, { unavailableAt: Date.now() })}>Not available</Btn>
                        </>
                      )}
                      {dstatus !== "requested" && (
                        <Btn onClick={() => reRequest(e.id)}>Re-request</Btn>
                      )}
                    </div>
                  </div>
                );
              })}
            </Panel>
          );
        })
      )}
    </div>
  );
}
