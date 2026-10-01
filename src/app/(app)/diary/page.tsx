"use client";

/** THE DAILY DIARY, ON ITS OWN SCREEN.
 *
 *  Sarel asked for Attendance, PPE, Interviews and the Daily diary as
 *  separate forms — the diary used to be a textarea buried at the bottom of
 *  the Attendance screen, after nine fields per person, which is a long way
 *  to scroll for the one thing somebody wants to update from the car at the
 *  end of the day.
 *
 *  STILL THE SAME RECORD, NOT A SECOND ONE. The diary is still `SiteDay.diary`
 *  — one record per site per calendar day, exactly as attendance is, and the
 *  store already refuses to open a second one for a date that has one. Giving
 *  the diary its own screen would be pointless if it also meant two
 *  containers disagreeing about which day it was. This screen opens or
 *  returns the same SiteDay Attendance does; it only puts the diary and its
 *  own header fields where they are quick to find. */

import { useMemo, useState } from "react";
import { useSiteDays, useStore } from "@/lib/store";
import { localDate } from "@/lib/attendance";
import { useNow } from "@/lib/clock";
import { AttachmentStrip, PhotoButton } from "@/components/Capture";
import { Btn, Empty, Field, Panel, Pill } from "@/components/ui/primitives";

const inputCls = "min-h-[44px] w-full rounded-[9px] border px-3 py-2 text-[13px]";
const inputStyle = { background: "var(--bg)", borderColor: "var(--line)" } as const;

export default function DiaryPage() {
  const days = useSiteDays();
  const auditor = useStore((s) => s.auditor);
  const openDay = useStore((s) => s.openSiteDay);
  const patchDay = useStore((s) => s.updateSiteDay);
  const addPhoto = useStore((s) => s.addDayAttachment);
  const removePhoto = useStore((s) => s.removeDayAttachment);
  const updatePhoto = useStore((s) => s.updateDayAttachment);

  const [openId, setOpenId] = useState<string | null>(null);
  const now = useNow();
  const today = now ? localDate(now) : "";
  const todaysDay = useMemo(() => (today ? days.find((d) => d.date === today) : undefined), [days, today]);

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-3">
      <header className="mb-3">
        <h2 className="font-display text-[15px] font-semibold">Daily diary</h2>
        <p className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
          What the day actually consisted of, in the words of whoever was there. Shares its record
          with Site attendance — one entry per day — so the two never disagree about which day it
          was.
        </p>
      </header>

      <Panel tone="accent" className="mb-4">
        {todaysDay ? (
          <>
            <Field label="LOCATION" hint="optional">
              <input
                value={todaysDay.location}
                onChange={(e) => patchDay(todaysDay.id, { location: e.target.value })}
                aria-label="Where today was spent"
                placeholder="MV rooms Pier B and C, AGL vault…"
                className={`mb-2 ${inputCls}`}
                style={inputStyle}
              />
            </Field>
            <Field label="PURPOSE" hint="optional">
              <input
                value={todaysDay.purpose}
                onChange={(e) => patchDay(todaysDay.id, { purpose: e.target.value })}
                aria-label="Purpose of today's visit"
                placeholder="Round 2 asset assurance walk…"
                className={`mb-2 ${inputCls}`}
                style={inputStyle}
              />
            </Field>
            <Field label="TODAY'S DIARY">
              <textarea
                value={todaysDay.diary}
                onChange={(e) => patchDay(todaysDay.id, { diary: e.target.value })}
                rows={5}
                aria-label="Today's diary"
                placeholder="Escorted from 07:10. MV rooms Pier B and C, AGL vault. Rain from 14:00, apron work stopped."
                className={inputCls}
                style={inputStyle}
              />
            </Field>
            <Field label="PHOTOGRAPHS">
              <div className="flex justify-end">
                <PhotoButton compact onCaptured={(m) => addPhoto(todaysDay.id, { ...m, createdBy: auditor })} />
              </div>
              {todaysDay.attachments.length > 0 ? (
                <div className="mt-2">
                  <AttachmentStrip
                    attachments={todaysDay.attachments}
                    thumbSize={40}
                    onRemove={(aid) => removePhoto(todaysDay.id, aid)}
                    onUpdate={(aid, p) => updatePhoto(todaysDay.id, aid, p)}
                  />
                </div>
              ) : null}
            </Field>
          </>
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
                      {!day.diary.trim() ? <Pill tone="warn">NO DIARY ENTRY</Pill> : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[13px]">
                      {day.diary.trim() || "Nothing recorded"}
                    </p>
                  </div>
                </button>

                {isOpen ? (
                  <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
                    <Field label="LOCATION" hint="optional">
                      <input
                        value={day.location}
                        onChange={(e) => patchDay(day.id, { location: e.target.value })}
                        aria-label={`Where ${day.date} was spent`}
                        className={`mb-2 ${inputCls}`}
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="PURPOSE" hint="optional">
                      <input
                        value={day.purpose}
                        onChange={(e) => patchDay(day.id, { purpose: e.target.value })}
                        aria-label={`Purpose of visit on ${day.date}`}
                        className={`mb-2 ${inputCls}`}
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="DIARY">
                      <textarea
                        value={day.diary}
                        onChange={(e) => patchDay(day.id, { diary: e.target.value })}
                        rows={5}
                        aria-label={`Diary for ${day.date}`}
                        className={inputCls}
                        style={inputStyle}
                      />
                    </Field>
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
                  </div>
                ) : null}
              </Panel>
            </div>
          );
        })}
    </div>
  );
}
