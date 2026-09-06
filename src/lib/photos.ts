/** What a photograph is called, everywhere.
 *
 *  `KSIA-ELE-001_P01` — the check-point's portal id and a sequence number. One
 *  identifier that has to mean the same image in four places:
 *
 *    the tablet          the working copy the auditor captions and looks at
 *    the record store    the object name in cloud storage
 *    the workbook        the File column of the Photographs sheet, and the
 *                        Photograph files column on every finding
 *    the report          the anchor a Word template will place the image at
 *
 *  Pure, and deliberately in its own module rather than in the store: the
 *  workbook writer needs it and has no business importing a client store to
 *  build a filename. */

import type { Attachment } from "./types";

/** The next reference for a record — `KSIA-ELE-001_P03`.
 *
 *  Numbering continues from the highest ever used, not from the count, so a
 *  reference is never reused after a deletion. `KSIA-ELE-001_P02` must mean one
 *  image for the life of the audit: if it could come to mean a second one, a
 *  finding evidenced by P02 in March would silently be evidenced by a different
 *  photograph in September, and nothing on screen or in the workbook would say
 *  so. A gap in the numbering is the cheap price. */
export function nextPhotoRef(prefix: string, existing: Attachment[]): string {
  let highest = 0;
  for (const a of existing) {
    const n = /_P(\d+)$/.exec(a.ref ?? "");
    if (n) highest = Math.max(highest, Number(n[1]));
  }
  return `${prefix}_P${String(highest + 1).padStart(2, "0")}`;
}

/** The file this photograph is written as, in the zip and in the blob store.
 *  Everything is downscaled to JPEG on capture — see preparePhoto. */
export function photoFilename(a: Attachment): string {
  return `${a.ref ?? a.id}.jpg`;
}

/** Where the record copy lives: `FALE/2026-09/KSIA-ELE-001_P01.jpg`.
 *
 *  Foldered by audit so the store is browsable by site and visit rather than
 *  being one flat heap of thousands of files. */
export function photoObjectPath(
  entityCode: string,
  visitId: string,
  a: Attachment
): string {
  return `${entityCode}/${visitId}/${photoFilename(a)}`;
}

/* ------------------------------------------------------------- the zip -----

   The workbook indexes the photographs; this produces the photographs
   themselves. Deliberately a separate download from the workbook, so an
   auditor can send the index without a hundred megabytes of images attached
   and fetch the images when somebody asks for them.

   fflate is already the only runtime dependency this project has beyond the
   framework, and it writes zips. No new one is needed. */

import { zipSync, strToU8 } from "fflate";

export interface PhotoFile {
  name: string;
  bytes: Uint8Array;
}

/** A zip of the images, with a manifest naming every one.
 *
 *  The manifest exists because a folder of JPEGs on its own says nothing: it
 *  carries the caption, the check-point and when each was taken, so the zip
 *  remains readable if it is ever separated from the workbook — which, being a
 *  separate download, it will be. */
export function buildPhotoZip(
  files: PhotoFile[],
  manifest: string,
  folder = "photographs"
): Uint8Array {
  const entries: Record<string, Uint8Array> = {
    [`${folder}/MANIFEST.csv`]: strToU8(manifest),
  };
  for (const f of files) entries[`${folder}/${f.name}`] = f.bytes;
  /* level 0: JPEGs are already compressed, and deflating them again costs
     seconds on a tablet for about a percent. */
  return zipSync(entries, { level: 0 });
}
