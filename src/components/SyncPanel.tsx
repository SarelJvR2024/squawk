"use client";

/** Sending the audit back to the portal.
 *
 *  THE SHAPE OF THIS SCREEN IS THE SAFETY FEATURE. It is four steps and they
 *  do not collapse into one:
 *
 *    1. sign in as yourself
 *    2. read the lists — their columns, and every Title already in them
 *    3. LOOK AT THE PLAN: every row that would be created, every row that
 *       would be changed, every field that has nowhere to go, and everything
 *       deliberately left out with the reason
 *    4. then, and only then, a button that writes
 *
 *  Up to the moment step 4 is pressed, this component has issued nothing but
 *  GETs. That is worth the extra click: it writes into TPJV's SharePoint,
 *  where ACSA reads it, and an unpreviewable sync is one somebody has to
 *  trust rather than check. */

import { useMemo, useState } from "react";
import {
  checksAt,
  priorFindingsAt,
  useEntityCode,
  useResponses,
  useStore,
  useVerifications,
  useVisitFindings,
  useVisitHazards,
  useVisitId,
} from "@/lib/store";
import { fullPhotoBlob } from "@/lib/recordimage";
import * as graph from "@/lib/graph";
import {
  buildPlan,
  columnContract,
  mapFields,
  canJoin,
  choiceMismatches,
  joinRefusal,
  planTotals,
  projectFields,
  CHECK_FIELDS,
  FINDING_FIELDS,
  LIST_NAMES,
  type FieldMap,
  type PlannedRow,
  type SyncPlan,
} from "@/lib/sharepoint";
import { Btn } from "@/components/ui/primitives";
import { IconX } from "@/components/ui/icons";

type Stage = "idle" | "reading" | "planned" | "writing" | "done";

/** A readiness step: done, not done and here is what to do, or not checked yet
 *  because the step before it has not passed. "waiting" is not a failure and
 *  must not look like one — half of setting this up is knowing which half is
 *  your problem. */
interface Step {
  label: string;
  state: "ok" | "todo" | "waiting";
  detail: string;
}

interface Resolved {
  siteId: string;
  checkList: { id: string; map: FieldMap } | null;
  findingList: { id: string; map: FieldMap } | null;
  driveId: string | null;
  lists: string[];
  /* THE NAMES IT ACTUALLY CHOSE.
     The site has thirteen lists and the matcher takes the first whose name
     fits a pattern. Which one it picked is not a detail — it decides where 33
     rows land — so it is shown rather than left to be inferred from the fact
     that something was found. */
  chose: { checkList: string | null; findingList: string | null; drive: string | null };
}

export function SyncPanel({ onClose }: { onClose: () => void }) {
  const entityCode = useEntityCode();
  const visitId = useVisitId();
  const responses = useResponses();
  const findings = useVisitFindings();
  const hazards = useVisitHazards();
  const verifications = useVerifications();
  const auditor = useStore((s) => s.auditor);
  const updateHazard = useStore((s) => s.updateHazard);

  const [who, setWho] = useState<string | null>(graph.signedInAs());
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [plan, setPlan] = useState<SyncPlan | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; what: string } | null>(null);
  const [result, setResult] = useState<{ written: number; failed: { key: string; why: string }[] } | null>(null);
  /* PHOTOGRAPHS ARE OFF BY DEFAULT. Sarel, 16 September 2026: "we dont need to
     send the photos itself to sharepoint at this stage."
   *
     Off rather than deleted, because "at this stage" is a stage — the upload
     works and the evidence library is where the photographs eventually belong.
     Off rather than remembered, because a switch that silently stayed on from
     a previous session would put a national key point's photographs into
     SharePoint without anybody deciding to this time. It is one tick when it
     is wanted. */
  const [sendPhotos, setSendPhotos] = useState(false);

  const checks = useMemo(() => checksAt(entityCode), [entityCode]);
  const prior = useMemo(() => priorFindingsAt(entityCode), [entityCode]);
  /* A finding in no hazard is work the register will not receive. Counted here
     so the plan can say so rather than letting it look synced. */
  const unconsolidated = useMemo(() => {
    const inHazard = new Set(hazards.flatMap((h) => h.findingIds));
    return findings.filter((f) => !inHazard.has(f.id)).length;
  }, [findings, hazards]);

  const configured = graph.graphConfigured();

  async function signIn() {
    setError(null);
    try {
      setWho(await graph.signIn());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    }
  }

  /** Step 2 and 3. Reads only. */
  async function read() {
    setStage("reading");
    setError(null);
    setResult(null);
    try {
      const site = await graph.resolveSite();
      const all = await graph.lists(site.id);
      const find = (want: RegExp) => all.find((l) => want.test(l.displayName));
      const checkList = find(LIST_NAMES.checkpoints);
      const findingList = find(LIST_NAMES.findings);

      let checkPart: Resolved["checkList"] = null;
      let findPart: Resolved["findingList"] = null;
      const existing = { checkpoints: new Map<string, string>(), findings: new Map<string, string>() };

      if (checkList) {
        const map = mapFields(await graph.columns(site.id, checkList.id), [...CHECK_FIELDS]);
        checkPart = { id: checkList.id, map };
        for (const it of await graph.items(site.id, checkList.id, ["Title"])) {
          const t = String(it.fields.Title ?? "");
          if (t) existing.checkpoints.set(t, it.id);
        }
      }
      if (findingList) {
        const map = mapFields(await graph.columns(site.id, findingList.id), [...FINDING_FIELDS]);
        findPart = { id: findingList.id, map };
        for (const it of await graph.items(site.id, findingList.id, ["Title"])) {
          const t = String(it.fields.Title ?? "");
          if (t) existing.findings.set(t, it.id);
        }
      }

      const drive = (await graph.drives(site.id)).find((d) => LIST_NAMES.evidence.test(d.name))
        ?? (await graph.drives(site.id))[0];

      setResolved({
        siteId: site.id,
        checkList: checkPart,
        findingList: findPart,
        driveId: drive?.id ?? null,
        lists: all.map((l) => l.displayName),
        chose: {
          checkList: checkList?.displayName ?? null,
          findingList: findingList?.displayName ?? null,
          drive: drive?.name ?? null,
        },
      });
      setPlan(
        buildPlan(
          { entity: entityCode, visit: visitId, visitLabel: visitId, checks, responses, hazards, prior, verifications, auditor, findings },
          existing,
          unconsolidated
        )
      );
      setStage("planned");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the portal.");
      setStage("idle");
    }
  }

  /** Step 4. The only function in this file that writes. */
  async function run() {
    if (!plan || !resolved) return;
    setStage("writing");
    setError(null);
    const failed: { key: string; why: string }[] = [];
    let written = 0;
    const t = planTotals(plan);
    const total = t.writes - (sendPhotos ? 0 : t.photographs);

    const writeRows = async (rows: PlannedRow[], list: { id: string; map: FieldMap } | null, what: string) => {
      if (!list) return;
      for (const row of rows) {
        setProgress({ done: written, total, what: `${what} ${row.key}` });
        /* The row's own action decides whether a blank may overwrite. An
           update never empties a cell; see projectFields. */
        const fields = projectFields(list.map, row.values, row.action);
        try {
          if (row.itemId) {
            await graph.updateItem(resolved.siteId, list.id, row.itemId, fields);
          } else {
            await graph.createItem(resolved.siteId, list.id, fields);
            /* Remember the Title we minted, so the NEXT sync updates this row
               rather than creating a second one. This is the single write back
               into local state and it is what makes the whole thing
               idempotent. */
            if (row.hazardId) updateHazard(row.hazardId, { portalId: row.key });
          }
          written++;
        } catch (e) {
          failed.push({ key: row.key, why: e instanceof Error ? e.message : "failed" });
        }
      }
    };

    try {
      await writeRows(plan.checkpoints, resolved.checkList, "check-point");
      await writeRows(plan.findings, resolved.findingList, "finding");

      if (sendPhotos && resolved.driveId && plan.evidence.length) {
        /* THE FOLDER IS ONE CALL THAT CAN FAIL ALL FIVE.
           It used to sit outside the per-photograph try, so when it threw, the
           outer catch set an error — and then reported "33 written. Everything
           in the plan reached the portal", because `failed` was still empty.
           A partial write calling itself complete is the one outcome this
           screen exists to prevent. Every photograph it takes down is now
           named. */
        let folderReady = true;
        try {
          await graph.ensureFolder(resolved.driveId, plan.folder);
        } catch (e) {
          folderReady = false;
          const why = `the evidence folder "${plan.folder}" could not be prepared — ${
            e instanceof Error ? e.message : "failed"
          }`;
          for (const f of plan.evidence) failed.push({ key: f.filename, why });
        }
        for (const f of folderReady ? plan.evidence : []) {
          setProgress({ done: written, total, what: `photograph ${f.filename}` });
          try {
            /* This device's copy if it has one, the record copy otherwise. An
               auditor who joined the audit rather than taking the photographs
               still uploads every one of them. */
            const blob = await fullPhotoBlob(f.attachment, entityCode, visitId);
            await graph.uploadEvidence(resolved.driveId, plan.folder, f.filename, blob);
            written++;
          } catch (e) {
            failed.push({ key: f.filename, why: e instanceof Error ? e.message : "failed" });
          }
        }
      }
      setResult({ written, failed });
      setStage("done");
    } catch (e) {
      /* Whatever stopped it, the rows that never went are not "everything
         reached the portal". Anything unaccounted for is counted here so the
         result cannot read as a success. */
      const why = e instanceof Error ? e.message : "the sync stopped";
      const short = total - written - failed.length;
      if (short > 0) {
        failed.push({
          key: `${short} more row${short === 1 ? "" : "s"}`,
          why: `never attempted — ${why}`,
        });
      }
      setError(why);
      setResult({ written, failed });
      setStage("done");
    } finally {
      setProgress(null);
    }
  }

  const totals = plan ? planTotals(plan) : null;
  /* What the button will actually send, which is not the plan's own total
     while the photographs are switched off. */
  const writes = totals ? totals.writes - (sendPhotos ? 0 : totals.photographs) : 0;
  /* Values bound for a Choice column that will not accept them. */
  const mismatches = plan
    ? [
        ...(resolved?.checkList ? choiceMismatches(resolved.checkList.map, plan.checkpoints) : []),
        ...(resolved?.findingList ? choiceMismatches(resolved.findingList.map, plan.findings) : []),
      ]
    : [];
  const missing = [
    ...(resolved?.checkList?.map.missing ?? []).map((m) => `Check-points · ${m}`),
    ...(resolved?.findingList?.map.missing ?? []).map((m) => `Findings · ${m}`),
  ];

  /* THE JOIN KEY, SEPARATED OUT FROM THE REST OF THE GAPS.
     A missing Owner column costs one field. A missing Title costs idempotency:
     rows written without one can never be found again, so every run recreates
     them. That is a refusal, not an item in a list of skipped fields. */
  const unjoinable = [
    resolved?.checkList && !canJoin(resolved.checkList.map) ? "Check-points" : null,
    resolved?.findingList && !canJoin(resolved.findingList.map) ? "Findings" : null,
  ].filter((v): v is string => !!v);

  /* AND WHETHER IT ACTUALLY BITES, which is not the same question.
   *
   *  A row being UPDATED was found by the Title already in the portal and is
   *  addressed by its item id; its Title does not change and not writing one
   *  costs nothing. Only a CREATE needs to put a Title in, and only a create
   *  can therefore go missing.
   *
   *  The first cut of this refused the whole write on an unjoinable list,
   *  which would have blocked 33 perfectly safe updates on the day it shipped.
   *  A guard that stops work it did not need to stop gets switched off. */
  const blockedCreates = [
    resolved?.checkList && !canJoin(resolved.checkList.map) && (plan?.checkpoints ?? []).some((r) => r.action === "create")
      ? "Check-points"
      : null,
    resolved?.findingList && !canJoin(resolved.findingList.map) && (plan?.findings ?? []).some((r) => r.action === "create")
      ? "Findings"
      : null,
  ].filter((v): v is string => !!v);

  /* WHAT IS READY AND WHAT IS NOT, as a list rather than as an absence.
   *
   *  This screen used to be unreachable until the whole thing worked: the
   *  masthead hid the Sync button unless the deployment was configured, on the
   *  reasoning that a button which can only explain why it does not work is
   *  clutter. That is true of a button. It is not true of a SETUP, and the
   *  setup is where this feature has been stuck — nobody could see whether the
   *  sync existed, what it wanted, or how far along it was, because the one
   *  screen that knows all three was behind the thing it was waiting for.
   *
   *  So the button is always there now and this is what it opens: five steps,
   *  each either done, not done with what to do about it, or not checked yet
   *  because the step before it has not passed. Nothing here writes; nothing
   *  here even reads until you ask it to. */
  const steps: Step[] = [
    {
      label: "This deployment knows where the portal is",
      state: configured && !graph.tenantLooksWrong() ? "ok" : "todo",
      detail: !configured
        ? `Set ${graph.graphMissing().join(", ")} in Vercel and redeploy. These are read at BUILD time, so setting them without a new deploy changes nothing.`
        : (graph.tenantLooksWrong() ?? `${graph.GRAPH_SITE} · tenant ${graph.GRAPH_TENANT.slice(0, 8)}…`),
    },
    {
      /* BEFORE sign-in, because this is the one that fails AFTER a password and
         an MFA prompt have already been given. Prince registered exactly one
         redirect; a preview build hitting it gets AADSTS50011 and reads like a
         broken app rather than the wrong URL. */
      label: "Microsoft will redirect back to this deployment",
      state: !configured
        ? "waiting"
        : !graph.redirectOriginKnown()
          ? "waiting"
          : graph.redirectRegistered()
            ? "ok"
            : "todo",
      detail: !graph.redirectOriginKnown()
        ? "Not checked — NEXT_PUBLIC_GRAPH_ORIGIN is not set, so Squawk does not know which origin the app registration will redirect to. Sign-in may still work; it simply cannot be warned about in advance."
        : graph.redirectRegistered()
          ? `${graph.redirectUri()} — the registered SPA redirect.`
          : `Only ${graph.GRAPH_ORIGIN}/graph-callback is registered on the app. Sign-in from here (${graph.redirectUri()}) will be refused by Microsoft before you type anything. Use the live site, or have this URI added as an SPA redirect.`,
    },
    {
      label: "You are signed in to Microsoft",
      state:
        !configured || graph.tenantLooksWrong() || !graph.redirectRegistered()
          ? "waiting"
          : who
            ? "ok"
            : "todo",
      detail: who
        ? `${who} — held in this tab only, never written to the device.`
        : "Sign in below. Squawk writes as you, not as itself, so the portal's history shows a person.",
    },
    {
      label: "The site resolves",
      state: !who ? "waiting" : resolved ? "ok" : "todo",
      detail: resolved
        ? `${resolved.lists.length} list${resolved.lists.length === 1 ? "" : "s"} on it`
        : "Press “Read the portal” — everything up to the last button is a GET.",
    },
    {
      label: "The two lists and the evidence library are there",
      state: !resolved
        ? "waiting"
        : resolved.checkList && resolved.findingList && resolved.driveId
          ? "ok"
          : "todo",
      detail: !resolved
        ? "Checked when the portal is read."
        : [
            resolved.checkList ? null : "no list matching Check-points",
            resolved.findingList ? null : "no list matching Findings",
            resolved.driveId ? null : "no document library to put photographs in",
          ]
            .filter(Boolean)
            .join(" · ") ||
          `Writing to “${resolved.chose.checkList}” and “${resolved.chose.findingList}”, photographs to “${resolved.chose.drive}”. ${resolved.lists.length} lists on the site — check these are the right ones.`,
    },
    {
      label: "Every field has a column to go in",
      state: !resolved ? "waiting" : missing.length === 0 ? "ok" : "todo",
      detail: !resolved
        ? "Checked when the portal is read."
        : unjoinable.length
          ? `${unjoinable.join(" and ")} ${unjoinable.length === 1 ? "has" : "have"} no writable Title, which is the key every row is matched on. Existing rows can still be updated; NEW rows cannot be created there until that is fixed — see below.`
          : missing.length === 0
            ? "Nothing will be silently dropped."
            : `${missing.length} field${missing.length === 1 ? "" : "s"} would be skipped: ${missing.join(", ")}. Add the columns below, or accept the gap — the plan will keep saying so.`,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[80] flex justify-center overflow-y-auto py-[8vh]"
      style={{ background: "rgba(16,10,32,.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="h-fit w-[min(720px,92vw)] rounded-[20px] border p-[22px]"
        style={{ background: "var(--panel)", borderColor: "var(--line-2)", boxShadow: "var(--e3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <h3 className="text-[15px] font-bold">Sync to the portal</h3>
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--ink-4)" }}>
            <IconX width={15} height={15} />
          </button>
        </div>

        <p className="mb-3 text-[12px] leading-[1.55]" style={{ color: "var(--ink-2)" }}>
          Writes this visit&apos;s capture into the SharePoint lists, as <b>you</b> — not as
          Squawk — so the portal&apos;s history shows who did it. Nothing is written until you
          have read the plan and pressed the last button.
        </p>

        {/* --- readiness ------------------------------------------------ */}
        <ol className="mb-3">
          {steps.map((st, i) => (
            <li
              key={st.label}
              className="flex gap-[9px] border-b py-[7px] last:border-b-0"
              style={{ borderColor: "var(--line)" }}
            >
              <span
                aria-hidden="true"
                className="mt-[1px] flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full font-mono text-[9px]"
                style={
                  st.state === "ok"
                    ? { background: "var(--good-bg)", color: "var(--good)" }
                    : st.state === "todo"
                      ? { background: "var(--warn-bg)", color: "var(--warn)" }
                      : { background: "var(--sunken)", color: "var(--ink-4)" }
                }
              >
                {st.state === "ok" ? "✓" : st.state === "todo" ? "!" : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block text-[11.5px] font-semibold">
                  {st.label}
                  {/* The state in words as well as in colour. */}
                  <span className="ml-[6px] font-mono text-[9px] font-normal" style={{ color: "var(--ink-4)" }}>
                    {st.state === "ok" ? "DONE" : st.state === "todo" ? "TO DO" : "NOT CHECKED YET"}
                  </span>
                </b>
                <span className="mt-[1px] block text-[11px] leading-[1.5]" style={{ color: "var(--ink-3)" }}>
                  {st.detail}
                </span>
              </span>
            </li>
          ))}
        </ol>

        {!configured ? (
          <>
            <Note tone="plain">
              Everything else in Squawk works without this — the workbook export is unaffected. The
              sync needs one Entra ID app registration in the tenant that owns the site, and it never
              involves a client secret: it signs the auditor in and writes as them.
            </Note>
            <ol className="mb-3 list-decimal pl-5 text-[11.5px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
              <li>
                Entra ID → App registrations → New registration.
              </li>
              <li>
                Redirect URI: <b>Single-page application (SPA)</b> — not Web —{" "}
                <code className="font-mono text-[10.5px]">
                  {typeof window === "undefined" ? "https://…" : window.location.origin}/graph-callback
                </code>
                . SPA is what allows PKCE without a secret and the CORS the token call needs.
              </li>
              <li>
                API permissions → Microsoft Graph → <b>Delegated</b> →{" "}
                <code className="font-mono text-[10.5px]">Sites.ReadWrite.All</code> → grant admin
                consent.
              </li>
              <li>Do not create a client secret. There is nowhere to put one.</li>
              <li>
                Set{" "}
                {graph.graphMissing().map((v, i, all) => (
                  <span key={v}>
                    <code className="font-mono text-[10.5px]">{v}</code>
                    {i < all.length - 2 ? ", " : i === all.length - 2 ? " and " : ""}
                  </span>
                ))}{" "}
                in Vercel, then <b>redeploy</b>. They are read at build time — changing the variable
                without a new deploy changes nothing.
              </li>
            </ol>
          </>
        ) : (
          <>

            {/* --- sign in ------------------------------------------------ */}
            <div
              className="mb-3 flex flex-wrap items-center gap-2 rounded-[10px] border px-[11px] py-[9px] text-[11.5px]"
              style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
            >
              {who ? (
                <>
                  <span style={{ color: "var(--good)" }}>Signed in as {who}</span>
                  <span className="ml-auto flex gap-2">
                    <Btn onClick={() => { graph.signOut(); setWho(null); setResolved(null); setPlan(null); setStage("idle"); }}>
                      Sign out
                    </Btn>
                    <Btn variant="primary" onClick={read} disabled={stage === "reading" || stage === "writing"}>
                      {stage === "reading" ? "Reading the portal…" : "Read the portal and build a plan"}
                    </Btn>
                  </span>
                </>
              ) : (
                <>
                  <span style={{ color: "var(--ink-3)" }}>
                    Not signed in. Sign-in is held for this tab only and never stored on the device.
                  </span>
                  <Btn variant="primary" className="ml-auto" onClick={signIn}>
                    Sign in with Microsoft
                  </Btn>
                </>
              )}
            </div>

            {error && (
              <p
                className="mb-3 rounded-[10px] border px-[11px] py-[9px] text-[11.5px]"
                style={{ background: "var(--bad-bg)", borderColor: "var(--bad-line)", color: "var(--bad)" }}
              >
                {error}
              </p>
            )}

            {/* --- the plan ----------------------------------------------- */}
            {plan && totals && stage !== "done" && (
              <>
                <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Tile n={totals.checkpointsNew} label="check-points to add" />
                  <Tile n={totals.checkpointsChanged} label="check-points to update" />
                  <Tile n={totals.findingsNew} label="findings to add" />
                  <Tile n={totals.findingsChanged} label="findings to update" />
                  <Tile
                    n={totals.photographs}
                    label={sendPhotos ? "photographs to upload" : "photographs, not being sent"}
                  />
                  <Tile n={writes} label="writes in total" strong />
                </div>

                {!resolved?.findingList && (
                  <Note tone="warn">
                    No list called <b>Findings</b> on this site — its rows will not be written.
                    {resolved?.lists.length ? ` Lists seen: ${resolved.lists.join(", ")}.` : ""}
                  </Note>
                )}
                {!resolved?.checkList && (
                  <Note tone="warn">
                    No list called <b>Check-points</b> on this site — its rows will not be written.
                  </Note>
                )}

                {unjoinable.map((l) => (
                  <Note key={l} tone={blockedCreates.includes(l) ? "bad" : "warn"}>
                    <b>
                      {blockedCreates.includes(l)
                        ? `${l}: new rows cannot be created.`
                        : `${l}: updates only.`}
                    </b>{" "}
                    {joinRefusal(l)}
                    {blockedCreates.includes(l)
                      ? " This plan contains new rows for that list, so the write is blocked."
                      : " This plan only updates rows that are already there, which is safe — they are addressed by their item id and their Title does not change."}
                  </Note>
                ))}

                {missing.length > 0 && (
                  <Note tone="warn">
                    <b>{missing.length} field{missing.length === 1 ? " has" : "s have"} no column</b> and
                    will not be written: {missing.join(", ")}. The internal column names are read off
                    the lists themselves on every run, so this is what the portal actually has today —
                    not a stale mapping.
                  </Note>
                )}

                {/* The switch, next to the count it governs rather than in a
                    settings corner — this is the one screen where "are the
                    photographs going" is a live question. */}
                {plan.evidence.length > 0 && (
                  <label
                    className="mb-2 flex cursor-pointer items-start gap-[9px] rounded-[10px] border px-[11px] py-[9px] text-[11.5px] leading-[1.5]"
                    style={{ background: "var(--sunken)", borderColor: "var(--line-2)", color: "var(--ink-2)" }}
                  >
                    <input
                      type="checkbox"
                      checked={sendPhotos}
                      onChange={(e) => setSendPhotos(e.target.checked)}
                      className="mt-[2px] h-[15px] w-[15px] shrink-0"
                    />
                    <span>
                      <b>Also upload the {plan.evidence.length} photograph{plan.evidence.length === 1 ? "" : "s"}</b>{" "}
                      into <span className="font-mono text-[10.5px]">{plan.folder}</span>. Off by
                      default — the rows carry the audit, and the images are large, of a national
                      key point, and not yet wanted in the portal. The workbook export still
                      includes every one of them.
                    </span>
                  </label>
                )}

                {mismatches.length > 0 && (
                  <Note tone="warn">
                    <b>
                      {mismatches.length} value{mismatches.length === 1 ? "" : "s"} the portal&apos;s
                      own columns do not offer
                    </b>{" "}
                    and will go across as they are:{" "}
                    {mismatches
                      .map((m) => `${m.field} “${m.value}” (offered: ${m.offered.join(", ")})`)
                      .join("; ")}
                    . The options are read off each column on every run, so this is what the
                    portal accepts today.
                  </Note>
                )}

                {/* Going across, and worth saying anyway — see SyncPlan.warnings. */}
                {plan.warnings.map((w) => (
                  <Note key={w.what} tone="warn">
                    <b>{w.count} {w.what}</b> — {w.why}.
                  </Note>
                ))}

                {plan.skipped.map((s) => (
                  <Note key={s.what} tone="plain">
                    <b>{s.count} {s.what}</b> not going across — {s.why}.
                  </Note>
                ))}

                <details className="mb-3">
                  <summary className="cursor-pointer text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                    Every row, one line each ({plan.checkpoints.length + plan.findings.length})
                  </summary>
                  <ul className="mt-2 max-h-[240px] overflow-y-auto font-mono text-[10.5px]" style={{ color: "var(--ink-2)" }}>
                    {[...plan.findings, ...plan.checkpoints].map((r, i) => (
                      <li key={`${r.key}-${i}`} className="py-[2px]">
                        <span style={{ color: r.action === "create" ? "var(--good)" : "var(--ink-3)" }}>
                          {r.action === "create" ? "add   " : "update"}
                        </span>{" "}
                        {r.summary}
                      </li>
                    ))}
                  </ul>
                </details>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                    {progress ? `${progress.done}/${progress.total} — ${progress.what}` : "Nothing has been written yet."}
                  </span>
                  <Btn
                    variant="primary"
                    className="ml-auto"
                    onClick={run}
                    disabled={stage === "writing" || writes === 0 || blockedCreates.length > 0}
                  >
                    {stage === "writing"
                      ? "Writing…"
                      : blockedCreates.length
                        ? "Cannot create rows — no Title column"
                        : `Write ${writes} to the portal`}
                  </Btn>
                </div>
              </>
            )}

            {/* --- what happened ------------------------------------------ */}
            {stage === "done" && result && (
              <>
                <Note tone={result.failed.length ? "warn" : "good"}>
                  <b>
                    {result.written} of {totals?.writes ?? result.written} written.
                  </b>{" "}
                  {result.failed.length
                    ? `${result.failed.length} did not go across — each one named below.`
                    : "Everything in the plan reached the portal."}
                </Note>
                {result.failed.length > 0 && (
                  <ul className="mb-3 max-h-[200px] overflow-y-auto text-[11px]" style={{ color: "var(--bad)" }}>
                    {result.failed.map((f) => (
                      <li key={f.key} className="py-[2px]">
                        <span className="font-mono">{f.key}</span> — {f.why}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mb-3 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                  Nothing was removed from the tablet. Run it again at any time — rows already in the
                  portal are updated, not duplicated.
                </p>
                <Btn onClick={read}>Read the portal again</Btn>
              </>
            )}
          </>
        )}

        {/* The contract, in every state — before setup because it is what the
            site has to be built to, and after because it is what a missing
            column means. */}
        <Contract />
      </div>
    </div>
  );
}

/** WHAT THE SITE HAS TO CONTAIN, rendered from the same constants the sync
 *  matches on. Whoever builds the lists needs this exactly, and a screen that
 *  restated it in its own words would be a second copy to keep in step. */
function Contract() {
  const rows = [
    { list: "Check-points", alsoNamed: "Checkpoints · Check point · Check points", fields: columnContract(CHECK_FIELDS) },
    { list: "Findings", alsoNamed: "Finding", fields: columnContract(FINDING_FIELDS) },
  ];
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-[11.5px]" style={{ color: "var(--acc)" }}>
        What the SharePoint site has to contain
      </summary>
      <div className="mt-2 text-[11px] leading-[1.55]" style={{ color: "var(--ink-2)" }}>
        <p className="mb-2">
          Two lists and one document library, found by <b>display name</b>. <b>Title</b> is the join
          key in both lists — it is what makes a second sync update rather than duplicate. A column
          Squawk cannot find is reported in the plan and skipped, never guessed; a read-only or
          computed column counts as absent.
        </p>
        {rows.map((r) => (
          <div key={r.list} className="mb-2.5">
            <b className="block text-[11.5px]">
              List: {r.list}{" "}
              <span className="font-mono text-[9.5px] font-normal" style={{ color: "var(--ink-4)" }}>
                or {r.alsoNamed}
              </span>
            </b>
            <ul className="mt-1 pl-0">
              {r.fields.map((f) => (
                <li key={f.key} className="py-[1px]">
                  <span className="font-mono text-[10.5px]">{f.create}</span>
                  {f.alsoAccepts.length > 0 && (
                    <span className="text-[10px]" style={{ color: "var(--ink-4)" }}>
                      {" "}· or {f.alsoAccepts.join(" · ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p>
          Photographs go to a document library whose name contains <b>Document</b>, <b>Shared</b> or{" "}
          <b>Evidence</b>, in a folder named for the site.
        </p>
        <p className="mt-2" style={{ color: "var(--ink-3)" }}>
          Start every column as text, and dates as Date. A Choice column rejects any value not in its
          own list, which fails the write for the whole row — easier to tighten later than to debug.
        </p>
      </div>
    </details>
  );
}

function Tile({ n, label, strong }: { n: number; label: string; strong?: boolean }) {
  return (
    <div
      className="rounded-[10px] border px-[11px] py-[8px]"
      style={{
        background: strong ? "var(--acc-soft)" : "var(--sunken)",
        borderColor: strong ? "var(--acc-line)" : "var(--line-2)",
      }}
    >
      <b className="block font-mono text-[16px] tnum" style={{ color: strong ? "var(--acc)" : "var(--ink)" }}>
        {n}
      </b>
      <span className="text-[10px]" style={{ color: "var(--ink-3)" }}>
        {label}
      </span>
    </div>
  );
}

function Note({
  tone,
  children,
}: {
  /* "bad" is not a louder "warn". Warn is a gap somebody may accept — a field
     that will not be written. Bad is a refusal: the sync will not run at all
     until it is fixed. */
  tone: "warn" | "good" | "plain" | "bad";
  children: React.ReactNode;
}) {
  const s =
    tone === "warn"
      ? { background: "var(--warn-bg)", borderColor: "var(--warn-line)", color: "var(--warn)" }
      : tone === "bad"
        ? { background: "var(--bad-bg)", borderColor: "var(--bad-line)", color: "var(--bad)" }
        : tone === "good"
          ? { background: "var(--good-bg)", borderColor: "var(--good-line)", color: "var(--good)" }
          : { background: "var(--sunken)", borderColor: "var(--line-2)", color: "var(--ink-2)" };
  return (
    <p className="mb-2 rounded-[10px] border px-[11px] py-[8px] text-[11.5px] leading-[1.5]" style={s}>
      {children}
    </p>
  );
}
