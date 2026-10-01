"use client";

/** THE DAILY DIARY, ON ITS OWN SCREEN.
 *
 *  Sarel asked for Attendance, PPE, Interviews and the Daily diary as
 *  separate forms — the diary used to be a textarea buried at the bottom of
 *  the Attendance screen, after nine fields per person, which is a long way
 *  to scroll for the one thing somebody wants to update from the car at the
 *  end of the day.
 *
 *  STILL THE SAME RECORD, NOT A SECOND ONE. The diary is still part of
 *  `SiteDay` — one record per site per calendar day, exactly as attendance
 *  is, and the store already refuses to open a second one for a date that
 *  has one. Giving the diary its own screen would be pointless if it also
 *  meant two containers disagreeing about which day it was.
 *
 *  REBUILT 1 October 2026 from a single free-text field into dated,
 *  categorised entries — Sarel: "for each entry capture the category ie
 *  weather people equipment general progress risks isues etc. For each
 *  entry i should be allowed to capfure a time." Tapping a category adds a
 *  line; the time defaults to now and is correctable, same reasoning as an
 *  observation's capture time versus event time elsewhere in this app.
 *
 *  ONE SIGNATURE FOR THE WHOLE DAY, not per entry — an attestation that the
 *  log as it stands is an accurate record, cleared if an entry is added,
 *  changed or removed after signing. A "Delete" on this screen only ever
 *  removes one entry: there is deliberately no control that deletes the
 *  SiteDay record itself, because that would take the attendance register
 *  for the day with it. */

import { useMemo, useState } from "react";
import { useEntityCode, useSiteDays, useStore } from "@/lib/store";
import { dayText, localDate } from "@/lib/attendance";
import {
  DIARY_CATEGORIES,
  DIARY_CATEGORY_LABEL,
  diaryGaps,
  isDiarySigned,
  sortedEntries,
  unbackedDiarySignature,
} from "@/lib/diary";
import { siteCodeFor, siteFor } from "@/lib/sites";
import { useNow } from "@/lib/clock";
import { AttachmentStrip, PhotoButton } from "@/components/Capture";
import { SignaturePad } from "@/components/SignaturePad";
import { Btn, Empty, Field, Panel, Pill } from "@/components/ui/primitives";
import { IconCheck, IconX } from "@/components/ui/icons";
import type { DiaryCategory, SiteDay } from "@/lib/types";

const inputCls = "min-h-[44px] w-full rounded-[9px] border px-3 py-2 text-[13px]";
const inputStyle = { background: "var(--bg)", borderColor: "var(--line)" } as const;

function hhmm(t: number): string {
  return new Date(t).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** HH:MM for a <input type="time">, in the device's own timezone. */
function timeInputValue(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** An HH:MM typed into a time input, applied to the day's own date. */
function mergeTime(dateStr: string, v: string): number | null {
  const [hh, mm] = v.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(hh, mm, 0, 0);
  return d.getTime();
}

function DiaryDayBody({
  day,
  pinned,
  signing,
  setSigning,
  copied,
  setCopied,
  savedId,
  setSavedId,
  onSaved,
}: {
  day: SiteDay;
  pinned?: boolean;
  signing: string | null;
  setSigning: (id: string | null) => void;
  copied: string | null;
  setCopied: (id: string | null) => void;
  savedId: string | null;
  setSavedId: (id: string | null) => void;
  onSaved?: () => void;
}) {
  const entityCode = useEntityCode();
  const visitId = useStore((s) => s.visit);
  const auditor = useStore((s) => s.auditor);
  const patchDay = useStore((s) => s.updateSiteDay);
  const addEntry = useStore((s) => s.addDiaryEntry);
  const patchEntry = useStore((s) => s.updateDiaryEntry);
  const removeEntry = useStore((s) => s.removeDiaryEntry);
  const signDiary = useStore((s) => s.signDiary);
  const addPhoto = useStore((s) => s.addDayAttachment);
  const removePhoto = useStore((s) => s.removeDayAttachment);
  const updatePhoto = useStore((s) => s.updateDayAttachment);

  const site = siteFor(entityCode);
  const entries = sortedEntries(day);
  const unbacked = unbackedDiarySignature(day);

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
      window.prompt("Copy this diary", text);
    }
  }

  return (
    <>
      <Field label="LOCATION" hint="optional">
        <input
          value={day.location}
          onChange={(e) => patchDay(day.id, { location: e.target.value })}
          aria-label={`Where ${day.date} was spent`}
          placeholder="MV rooms Pier B and C, AGL vault…"
          className={`mb-2 ${inputCls}`}
          style={inputStyle}
        />
      </Field>
      <Field label="PURPOSE" hint="optional">
        <input
          value={day.purpose}
          onChange={(e) => patchDay(day.id, { purpose: e.target.value })}
          aria-label={`Purpose of visit on ${day.date}`}
          placeholder="Round 2 asset assurance walk…"
          className={`mb-2 ${inputCls}`}
          style={inputStyle}
        />
      </Field>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="DAY START" hint="optional">
          <input
            type="time"
            value={day.dayStart ? timeInputValue(day.dayStart) : ""}
            onChange={(e) =>
              patchDay(day.id, { dayStart: e.target.value ? mergeTime(day.date, e.target.value) : null })
            }
            aria-label={`Start time for ${day.date}`}
            className={inputCls}
            style={inputStyle}
          />
        </Field>
        <Field label="DAY END" hint="optional">
          <input
            type="time"
            value={day.dayEnd ? timeInputValue(day.dayEnd) : ""}
            onChange={(e) =>
              patchDay(day.id, { dayEnd: e.target.value ? mergeTime(day.date, e.target.value) : null })
            }
            aria-label={`End time for ${day.date}`}
            className={inputCls}
            style={inputStyle}
          />
        </Field>
      </div>

      {/* ADD A LINE. One tap per category — the time is stamped and
          correctable afterwards, the same pattern as every other "add"
          control in this app. */}
      <Field label="ADD AN ENTRY" hint={`${entries.length} so far`}>
        <div className="flex flex-wrap gap-[6px]">
          {DIARY_CATEGORIES.map((cat) => (
            <Btn key={cat} onClick={() => addEntry(day.id, cat)}>
              + {DIARY_CATEGORY_LABEL[cat]}
            </Btn>
          ))}
        </div>
      </Field>

      {entries.map((e) => (
        <div
          key={e.id}
          className="mb-2 rounded-[9px] border p-2.5"
          style={{ background: "var(--sunken)", borderColor: "var(--line)" }}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <Pill tone="accent">{DIARY_CATEGORY_LABEL[e.category]}</Pill>
            <Btn onClick={() => removeEntry(day.id, e.id)}>
              <IconX /> Delete
            </Btn>
          </div>
          <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="TIME">
              <input
                type="time"
                value={timeInputValue(e.at)}
                onChange={(ev) => {
                  const t = mergeTime(day.date, ev.target.value);
                  if (t !== null) patchEntry(day.id, e.id, { at: t });
                }}
                aria-label={`Time for this ${DIARY_CATEGORY_LABEL[e.category].toLowerCase()} entry`}
                className={inputCls}
                style={inputStyle}
              />
            </Field>
            <Field label="CATEGORY">
              <select
                value={e.category}
                onChange={(ev) => patchEntry(day.id, e.id, { category: ev.target.value as DiaryCategory })}
                aria-label="Category for this entry"
                className={inputCls}
                style={inputStyle}
              >
                {DIARY_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {DIARY_CATEGORY_LABEL[cat]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <textarea
            value={e.text}
            onChange={(ev) => patchEntry(day.id, e.id, { text: ev.target.value })}
            rows={2}
            aria-label="What happened"
            placeholder="What happened"
            className={inputCls}
            style={inputStyle}
          />
        </div>
      ))}
      {entries.length === 0 ? (
        <p className="mb-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
          Nothing logged yet. Tap a category above.
        </p>
      ) : null}

      <Field label="PHOTOGRAPHS">
        <div className="flex justify-end">
          <PhotoButton compact onCaptured={(m) => addPhoto(day.id, { ...m, createdBy: auditor })} />
        </div>
        {day.attachments.length > 0 ? (
          <div className="mt-2">
            <AttachmentStrip
              attachments={day.attachments}
              thumbSize={40}
              onRemove={(aid) => removePhoto(day.id, aid)}
              onUpdate={(aid, p) => updatePhoto(day.id, aid, p)}
            />
          </div>
        ) : null}
      </Field>

      <Field label="SIGN OFF THE DAY">
        {signing === day.id ? (
          <>
            <p className="mb-2 text-[11.5px] leading-[1.5]" style={{ color: "var(--ink-2)" }}>
              By signing, {auditor.trim() || "the signatory"} confirms this is an accurate record of
              the day.
            </p>
            <SignaturePad
              name={auditor}
              onCancel={() => setSigning(null)}
              onSigned={(s) => {
                signDiary(day.id, s);
                setSigning(null);
              }}
            />
          </>
        ) : isDiarySigned(day) ? (
          <div className="font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
            {day.diarySignature?.ref} · SIGNED {hhmm(day.diarySignature!.signedAt)} AS{" "}
            {day.diarySignature?.signedName.toUpperCase() || "—"}
            <Btn className="ml-2" onClick={() => setSigning(day.id)}>
              Sign again
            </Btn>
          </div>
        ) : (
          <Btn variant="primary" disabled={entries.length === 0} onClick={() => setSigning(day.id)}>
            Sign
          </Btn>
        )}
      </Field>

      <div
        className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3"
        style={{ borderColor: "var(--line)" }}
      >
        <Btn
          variant="primary"
          onClick={() => {
            /* Every field here already writes to the store the instant it
               changes — this gives the deliberate "I'm done with this one"
               moment that was missing, not something the data needed. */
            onSaved?.();
            setSavedId(day.id);
            window.setTimeout(() => setSavedId(null), 2500);
          }}
        >
          <IconCheck /> Save{!pinned ? " & close" : ""}
        </Btn>
        <Btn onClick={() => void copyDay()}>{copied === day.id ? "Copied" : "Copy this diary"}</Btn>
      </div>
      {unbacked.length ? (
        <p className="mt-2 font-mono text-[9px]" style={{ color: "var(--warn)" }}>
          THE DIARY SIGNATURE IS ON THIS DEVICE ONLY. THE RECORD COPY IS NOT WIRED YET — COPY THIS
          DIARY OUT BEFORE THE TABLET LEAVES SITE.
        </p>
      ) : null}
      {savedId === day.id ? (
        <p className="mt-2 font-mono text-[9px]" style={{ color: "var(--acc)" }}>
          ✓ SAVED
        </p>
      ) : null}
    </>
  );
}

export default function DiaryPage() {
  const days = useSiteDays();
  const openDay = useStore((s) => s.openSiteDay);

  const [openId, setOpenId] = useState<string | null>(null);
  const [signing, setSigning] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const now = useNow();
  const today = now ? localDate(now) : "";
  const todaysDay = useMemo(() => (today ? days.find((d) => d.date === today) : undefined), [days, today]);

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-3">
      <header className="mb-3">
        <h2 className="font-display text-[15px] font-semibold">Daily diary</h2>
        <p className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
          What the day actually consisted of — weather, people, equipment, progress, risks and
          issues, each dated and timed. Shares its record with Site attendance — one entry per day
          — so the two never disagree about which day it was.
        </p>
      </header>

      <Panel tone="accent" className="mb-4">
        {todaysDay ? (
          <DiaryDayBody
            day={todaysDay}
            pinned
            signing={signing}
            setSigning={setSigning}
            copied={copied}
            setCopied={setCopied}
            savedId={savedId}
            setSavedId={setSavedId}
          />
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              No entry opened for today yet.
            </p>
            <Btn variant="primary" disabled={!now} onClick={() => now && openDay(localDate(now))}>
              Open today
            </Btn>
          </div>
        )}
      </Panel>

      {days.length === 0 ? (
        <Empty>
          <b>No diary entries recorded.</b>
          <span>Open today&rsquo;s entry above to start one.</span>
        </Empty>
      ) : null}

      {days
        .filter((d) => d.id !== todaysDay?.id)
        .map((day) => {
          const isOpen = openId === day.id;
          const gaps = diaryGaps(day);
          return (
            <div key={day.id} className="mb-3">
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
                        <Pill tone="accent">COMPLETE</Pill>
                      )}
                      {savedId === day.id ? <Pill tone="accent">✓ SAVED</Pill> : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[13px]">
                      {day.diaryEntries.length === 0
                        ? "Nothing recorded"
                        : sortedEntries(day)
                            .map((e) => `${DIARY_CATEGORY_LABEL[e.category]}: ${e.text.trim() || "—"}`)
                            .join(" · ")}
                    </p>
                  </div>
                </button>

                {isOpen ? (
                  <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
                    <DiaryDayBody
                      day={day}
                      signing={signing}
                      setSigning={setSigning}
                      copied={copied}
                      setCopied={setCopied}
                      savedId={savedId}
                      setSavedId={setSavedId}
                      onSaved={() => setOpenId(null)}
                    />
                  </div>
                ) : null}
              </Panel>
            </div>
          );
        })}
    </div>
  );
}
