"use client";

/** Which assets a finding or a hazard is about.
 *
 *  Scoped to where the auditor is standing — this entity, and where the record
 *  knows them, this discipline and asset system — because a finding raised
 *  against Electrical / AGL at King Shaka has no business offering a Cape Town
 *  chiller. Search widens it when the scope is wrong, which happens: the check
 *  says Switchgear and the plate says Substations.
 *
 *  FOLDED BY DEFAULT, and the summary line carries the whole answer when it is
 *  short. An asset link is genuinely optional and most records will not have
 *  one, so an open picker on every finding would be a screenful of nothing for
 *  the majority to serve the minority.
 *
 *  THE SAMPLE WARNING IS NOT DECORATION. Until ACSA supplies the register this
 *  is a stand-in, and an invented asset tag filed against a real finding is
 *  worse than no tag at all. It is said on the panel, every tag carries
 *  SAMPLE- in it, and the sync refuses to send them. */

import { useMemo, useState } from "react";
import {
  anySample,
  assetLabel,
  assetsById,
  findAssets,
  useAssets,
  type Asset,
} from "@/lib/assets";

export default function AssetPicker({
  entityCode,
  discipline,
  system,
  value,
  onChange,
}: {
  entityCode: string;
  discipline?: string;
  system?: string;
  value: string[] | undefined;
  onChange: (ids: string[]) => void;
}) {
  const reg = useAssets();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  /* Searching means the auditor has decided the scope is wrong, so drop it
     rather than making them clear two things to find one asset. */
  const scoped = q.trim().length > 0 ? {} : { discipline, system };
  const { rows, total } = useMemo(
    () => findAssets(reg, { entityCode, ...scoped, q }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reg, entityCode, scoped.discipline, scoped.system, q]
  );
  const picked = assetsById(reg, value);
  const sample = anySample(value) || reg?.meta.source !== "acsa";

  const toggle = (a: Asset) => {
    const has = value?.includes(a.assetId);
    onChange(has ? (value ?? []).filter((x) => x !== a.assetId) : [...(value ?? []), a.assetId]);
  };

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="rounded-[10px] border"
      style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
    >
      <summary
        className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-[11px] py-[9px] text-[11.5px]"
        style={{ color: "var(--ink-2)" }}
      >
        <span style={{ color: "var(--ink-3)" }}>{open ? "▾" : "▸"}</span>
        <span className="font-display font-semibold">Assets</span>
        <span className="min-w-0 flex-1 truncate" style={{ color: "var(--ink-3)" }}>
          {picked.length === 0
            ? "none linked — optional"
            : picked.length <= 2
              ? picked.map((a) => a.assetId).join(", ")
              : `${picked.length} linked`}
        </span>
      </summary>

      <div className="border-t px-[11px] py-[10px]" style={{ borderColor: "var(--line-2)" }}>
        {sample && (
          <p
            className="mb-2 rounded-[8px] border px-[9px] py-[7px] text-[10.5px] leading-[1.5]"
            style={{ background: "var(--warn-bg)", borderColor: "var(--warn-line)", color: "var(--warn)" }}
          >
            <b>Stand-in register.</b> ACSA has not supplied the real one yet, so every tag here
            begins with <code className="font-mono">SAMPLE-</code>. Links are kept and appear in the
            workbook, and the portal sync leaves them behind on purpose.
          </p>
        )}

        {picked.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-[5px]">
            {picked.map((a) => (
              <button
                key={a.assetId}
                onClick={() => onChange((value ?? []).filter((x) => x !== a.assetId))}
                className="flex min-h-[36px] items-center gap-[6px] rounded-full border px-[10px] font-mono text-[10px]"
                style={{ background: "var(--acc-soft)", borderColor: "var(--acc-line)", color: "var(--acc)" }}
                title={`Unlink ${assetLabel(a)}`}
              >
                {assetLabel(a)}
                <span style={{ color: "var(--ink-3)" }}>×</span>
              </button>
            ))}
          </div>
        )}

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={
            discipline || system
              ? `Search all of ${entityCode}, or pick from ${system ?? discipline} below`
              : "Search this site's assets"
          }
          aria-label="Search assets"
          className="mb-2 min-h-[40px] w-full rounded-[8px] border px-[9px] text-[11.5px] outline-none"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
        />

        {!reg ? (
          <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>
            Loading the register…
          </p>
        ) : rows.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>
            Nothing matches. The register may simply not carry this asset yet.
          </p>
        ) : (
          <>
            <ul className="max-h-[220px] overflow-y-auto">
              {rows.map((a) => {
                const on = value?.includes(a.assetId);
                return (
                  <li key={a.assetId}>
                    <button
                      onClick={() => toggle(a)}
                      className="flex min-h-[44px] w-full items-center gap-2 rounded-[7px] px-[8px] text-left text-[11px]"
                      style={{ background: on ? "var(--acc-soft)" : "transparent", color: "var(--ink)" }}
                    >
                      <span className="font-mono text-[10px]" style={{ color: on ? "var(--acc)" : "var(--ink-3)" }}>
                        {on ? "✓" : "+"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className="block truncate font-mono text-[10px] font-semibold">{a.assetId}</b>
                        <span className="block truncate" style={{ color: "var(--ink-2)" }}>
                          {a.name}
                          {a.location ? ` · ${a.location}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {/* Say what is NOT on screen. A picker that shows 40 of 1,506 and
                implies that is all there is sends somebody looking for an asset
                on a list they cannot see. */}
            {total > rows.length && (
              <p className="mt-1 text-[10px]" style={{ color: "var(--ink-3)" }}>
                Showing {rows.length} of {total} — narrow it with the search.
              </p>
            )}
          </>
        )}
      </div>
    </details>
  );
}
