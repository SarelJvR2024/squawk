/** The daily diary — the logic shared between the store and the /diary
 *  screen, kept out of both for the same reason src/lib/ppe.ts and
 *  src/lib/siteAccess.ts are: a second copy of "is this day's diary still
 *  owed, and what does it say" is how the register and the screen come to
 *  disagree. */

import type { DiaryCategory, DiaryEntry, SiteDay, Signature } from "@/lib/types";

export const DIARY_CATEGORIES: readonly DiaryCategory[] = [
  "weather",
  "people",
  "equipment",
  "progress",
  "risks",
  "issues",
  "general",
];

export const DIARY_CATEGORY_LABEL: Record<DiaryCategory, string> = {
  weather: "Weather",
  people: "People",
  equipment: "Equipment",
  progress: "Progress",
  risks: "Risks",
  issues: "Issues",
  general: "General",
};

export function isDiarySigned(day: SiteDay): boolean {
  return !!day.diarySignature?.blobKey;
}

/** Everything the day's diary is still owed. Separate from attendance.ts's
 *  dayGaps(), which folds this in — the diary and the attendance register
 *  share one record but are two different obligations on it. */
export function diaryGaps(day: SiteDay): string[] {
  const gaps: string[] = [];
  if (day.diaryEntries.length === 0) gaps.push("no diary entries");
  else if (!isDiarySigned(day)) gaps.push("diary not signed");
  return gaps;
}

export function unbackedDiarySignature(day: SiteDay): Signature[] {
  return day.diarySignature && !day.diarySignature.cloudUrl ? [day.diarySignature] : [];
}

function stamp(t: number): string {
  return new Date(t).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function hhmm(t: number): string {
  return new Date(t).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** The entries, oldest first — the order they actually happened in, not the
 *  order they were typed in (somebody filling in the morning's weather at
 *  lunchtime should not jump ahead of an issue logged at 09:00). */
export function sortedEntries(day: SiteDay): DiaryEntry[] {
  return [...day.diaryEntries].sort((a, b) => a.at - b.at);
}

/** The diary's own section of dayText() in src/lib/attendance.ts — kept
 *  here so the format and the data it reads from stay next to each other. */
export function diaryLines(day: SiteDay): string[] {
  const lines: string[] = [
    "",
    "DAILY DIARY",
    `Day            ${
      day.dayStart || day.dayEnd
        ? `${day.dayStart ? hhmm(day.dayStart) : "— not recorded —"} to ${day.dayEnd ? hhmm(day.dayEnd) : "— not recorded —"}`
        : "— not recorded —"
    }`,
  ];

  if (day.diaryEntries.length === 0) {
    lines.push("— not recorded —");
  } else {
    for (const e of sortedEntries(day)) {
      lines.push(
        `  ${hhmm(e.at)}  ${DIARY_CATEGORY_LABEL[e.category].toUpperCase().padEnd(10)}${e.text.trim() || "— not recorded —"}`
      );
    }
  }

  lines.push(
    `  Signed         ${
      day.diarySignature
        ? `${day.diarySignature.ref}, signed ${stamp(day.diarySignature.signedAt)} as "${day.diarySignature.signedName}"`
        : "NOT SIGNED"
    }`
  );

  return lines;
}
