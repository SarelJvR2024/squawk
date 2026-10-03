"use client";

/** DAILY SITE CLOSEOUT, ON ITS OWN SCREEN — TK-003 form 8.
 *
 *  STILL THE SAME RECORD, NOT A SECOND ONE. Closeout fields live on `SiteDay`
 *  itself — the same record Attendance and the Daily diary already share —
 *  because this is the end-of-day reconciliation of that one day, not a
 *  separate thing that happens to fall on the same date. See the Diary
 *  screen's own note on why giving a section its own screen does not mean
 *  giving it a second container.
 *
 *  TWO QUESTIONS, NOT A CHECKLIST. Sarel's TK-003 form 8 reduces to: were
 *  there findings today, and are they all logged in sheet 9 yet? A "no" to
 *  the second with findings outstanding needs a note saying why, because an
 *  unexplained gap between what happened and what is logged is exactly the
 *  kind of thing a closeout exists to catch.
 *
 *  THE ACSA ESCORT SIGNS HERE TOO, OPTIONALLY — the same shape as the
 *  Immediate Safety Finding's ACSA sign-off, because ACSA is on site for this
 *  reconciliation the same way they are for everything else TPJV records
 *  against them. */

import { useMemo, useState } from "react";
import { useEntityCode, useSiteDays, useStore } from "@/lib/store";
import { closeoutGaps, dayText, localDate, unbackedCloseoutSignatures } from "@/lib/attendance";
import { siteCodeFor, siteFor } from "@/lib/sites";
import { useNow } from "@/lib/clock";
import { useFormsHubDeepLink } from "@/lib/deepLink";
import { SignaturePad } from "@/components/SignaturePad";
import { Btn, Empty, Field, Panel, Pill } from "@/components/ui/primitives";
import type { SiteDay } from "@/lib/types";

const inputCls = "min-h-[44px] w-full rounded-[9px] border px-3 py-2 text-[13px]";
const inputStyle = { background: "var(--bg)", borderColor: "var(--line)" } as const;

function hhmm(t: number): string {
  return new Date(t).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function CloseoutDayBody({
  day,
  pinned,
  signing,
  setSigning,
  copied,
  setCopied,
}: {
  day: SiteDay;
  pinned?: boolean;
  signing: string | null;
  setSigning: (id: string | null) => void;
  copied: string | null;
  setCopied: (id: string | null) => void;
}) {
  const entityCode = useEntityCode();
  const visitId = useStore((s) => s.visit);
  const auditor = useStore((s) => s.auditor);
  const patchDay = useStore((s) => s.updateSiteDay);
  const signLead = useStore((s) => s.signCloseoutLead);
  const signAcsa = useStore((s) => s.signCloseoutAcsa);

  const site = siteFor(entityCode);
  const gaps = closeoutGaps(day);
  const unbacked = unbackedCloseoutSignatures(day);

  async function copyDay() {
    const text = dayText(day, {
      siteName: site ? `${site.name} (${site.icao})` : entityCode,
      siteCode: siteCodeFor(entityCode),
      visitId,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(day.id);
      window.setTimeout(() => setCopied(null), 2500);
    } catch {
      window.prompt("Copy this closeout", text);
    }
  }

  return (
    <>
      <Field label="ANY FINDINGS TODAY?">
        <div className="flex flex-wrap gap-[6px]">
          <Btn
            variant={day.closeoutFindingsToday === true ? "primary" : "default"}
            onClick={() => patchDay(day.id, { closeoutFindingsToday: true })}
          >
            Yes
          </Btn>
          <Btn
            variant={day.closeoutFindingsToday === false ? "primary" : "default"}
            onClick={() =>
              patchDay(day.id, { closeoutFindingsToday: false, closeoutAllLoggedSheet9: null, closeoutNotes: "" })
            }
          >
            No
          </Btn>
        </div>
      </Field>

      {day.closeoutFindingsToday ? (
        <Field label="ALL LOGGED IN SHEET 9?">
          <div className="flex flex-wrap gap-[6px]">
            <Btn
              variant={day.closeoutAllLoggedSheet9 === true ? "primary" : "default"}
              onClick={() => patchDay(day.id, { closeoutAllLoggedSheet9: true })}
            >
              Yes
            </Btn>
            <Btn
              variant={day.closeoutAllLoggedSheet9 === false ? "primary" : "default"}
              onClick={() => patchDay(day.id, { closeoutAllLoggedSheet9: false })}
            >
              No
            </Btn>
          </div>
        </Field>
      ) : null}

      {day.closeoutFindingsToday && day.closeoutAllLoggedSheet9 === false ? (
        <Field label="WHY NOT, AND WHEN WILL IT BE">
          <textarea
            value={day.closeoutNotes}
            onChange={(e) => patchDay(day.id, { closeoutNotes: e.target.value })}
            rows={2}
            aria-label="Why findings are not yet logged in sheet 9"
            placeholder="Photographed on site, to be logged tomorrow morning…"
            className={inputCls}
            style={inputStyle}
          />
        </Field>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="TEAM LEAD SIGN-OFF">
          <input
            value={day.closeoutLeadName}
            onChange={(e) => patchDay(day.id, { closeoutLeadName: e.target.value })}
            aria-label="Team lead closing out the day"
            placeholder="Name of team lead"
            className={`mb-2 ${inputCls}`}
            style={inputStyle}
          />
          {signing === `${day.id}_LEAD` ? (
            <SignaturePad
              name={day.closeoutLeadName || auditor}
              onCancel={() => setSigning(null)}
              onSigned={(s) => {
                signLead(day.id, s);
                setSigning(null);
              }}
            />
          ) : day.closeoutLeadSignature ? (
            <div className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
              {day.closeoutLeadSignature.ref} · SIGNED {hhmm(day.closeoutLeadSignature.signedAt)} AS{" "}
              {day.closeoutLeadSignature.signedName.toUpperCase() || "—"}
              <Btn className="ml-2" onClick={() => setSigning(`${day.id}_LEAD`)}>
                Sign again
              </Btn>
            </div>
          ) : (
            <Btn
              variant="primary"
              disabled={day.closeoutFindingsToday === null}
              onClick={() => setSigning(`${day.id}_LEAD`)}
            >
              Sign
            </Btn>
          )}
        </Field>

        <Field label="ACSA ESCORT SIGN-OFF" hint="optional">
          <input
            value={day.closeoutAcsaName}
            onChange={(e) => patchDay(day.id, { closeoutAcsaName: e.target.value })}
            aria-label="ACSA escort closing out the day"
            placeholder="Name of ACSA escort"
            className={`mb-2 ${inputCls}`}
            style={inputStyle}
          />
          {signing === `${day.id}_ACSA` ? (
            <SignaturePad
              name={day.closeoutAcsaName || ""}
              onCancel={() => setSigning(null)}
              onSigned={(s) => {
                signAcsa(day.id, s);
                setSigning(null);
              }}
            />
          ) : day.closeoutAcsaSignature ? (
            <div className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
              {day.closeoutAcsaSignature.ref} · SIGNED {hhmm(day.closeoutAcsaSignature.signedAt)} AS{" "}
              {day.closeoutAcsaSignature.signedName.toUpperCase() || "—"}
              <Btn className="ml-2" onClick={() => setSigning(`${day.id}_ACSA`)}>
                Sign again
              </Btn>
            </div>
          ) : (
            <Btn onClick={() => setSigning(`${day.id}_ACSA`)}>Sign</Btn>
          )}
        </Field>
      </div>

      <div
        className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3"
        style={{ borderColor: "var(--line)" }}
      >
        <Btn onClick={() => void copyDay()}>{copied === day.id ? "Copied" : "Copy this closeout"}</Btn>
      </div>
      {unbacked.length ? (
        <p className="mt-2 font-mono text-[9px]" style={{ color: "var(--warn)" }}>
          {unbacked.length} SIGNATURE{unbacked.length > 1 ? "S" : ""} ON THIS DEVICE ONLY. THE RECORD
          COPY IS NOT WIRED YET — COPY THIS CLOSEOUT OUT BEFORE THE TABLET LEAVES SITE.
        </p>
      ) : null}
      {gaps.length && !pinned ? (
        <p className="mt-2 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
          STILL OWED: {gaps.join(", ").toUpperCase()}
        </p>
      ) : null}
    </>
  );
}

export default function CloseoutPage() {
  const days = useSiteDays();
  const openDay = useStore((s) => s.openSiteDay);

  const [openId, setOpenId] = useState<string | null>(null);
  const [signing, setSigning] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  useFormsHubDeepLink(setOpenId);

  const now = useNow();
  const today = now ? localDate(now) : "";
  const todaysDay = useMemo(() => (today ? days.find((d) => d.date === today) : undefined), [days, today]);

  return (
    <div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-3">
      <header className="mb-3">
        <h2 className="font-display text-[15px] font-semibold">Daily site closeout</h2>
        <p className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
          Were there findings today, are they all logged in sheet 9, and the team lead&rsquo;s sign-off
          that the reconciliation is accurate. Shares its record with Attendance and the Daily
          diary — one entry per day.
        </p>
      </header>

      <div data-record-id={todaysDay?.id} className="mb-4">
        <Panel tone="accent">
          {todaysDay ? (
            <CloseoutDayBody
              day={todaysDay}
              pinned
              signing={signing}
              setSigning={setSigning}
              copied={copied}
              setCopied={setCopied}
            />
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                No day opened yet.
              </p>
              <Btn variant="primary" disabled={!now} onClick={() => now && openDay(localDate(now))}>
                Open today
              </Btn>
            </div>
          )}
        </Panel>
      </div>

      {days.length === 0 ? (
        <Empty>
          <b>No day recorded.</b>
          <span>Open today&rsquo;s day above to start one.</span>
        </Empty>
      ) : null}

      {days
        .filter((d) => d.id !== todaysDay?.id)
        .map((day) => {
          const isOpen = openId === day.id;
          const gaps = closeoutGaps(day);
          return (
            <div key={day.id} data-record-id={day.id} className="mb-3">
              <Panel>
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : day.id)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px]">{day.date}</span>
                      {gaps.length ? (
                        <Pill tone="warn">{gaps.join(", ").toUpperCase()}</Pill>
                      ) : (
                        <Pill tone="accent">CLOSED OUT</Pill>
                      )}
                    </div>
                    <p className="mt-1 text-[13px]">
                      {day.closeoutFindingsToday === null
                        ? "Not yet answered"
                        : day.closeoutFindingsToday
                          ? `Findings today — all logged: ${
                              day.closeoutAllLoggedSheet9 === null ? "not answered" : day.closeoutAllLoggedSheet9 ? "yes" : "no"
                            }`
                          : "No findings today"}
                    </p>
                  </div>
                </button>

                {isOpen ? (
                  <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
                    <CloseoutDayBody
                      day={day}
                      signing={signing}
                      setSigning={setSigning}
                      copied={copied}
                      setCopied={setCopied}
                    />
                  </div>
                ) : null}
              </Panel>
            </div>
          );
        })}
      </div>
    </div>
  );
}
