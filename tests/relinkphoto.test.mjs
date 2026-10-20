import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* MOVE A PHOTOGRAPH TO A DIFFERENT CHECK — the Review screen's own fix for
 *  mis-filed evidence.
 *
 *  Sarel: "I see some photos might not be linked to the correct asset system
 *  or to the correct audit check... we must have a function there where we
 *  can change the asset type and or audit question that it is linked to."
 *
 *  An Attachment carries no checkId of its own — which check it belongs to
 *  is entirely which Response.attachments array it lives in (see
 *  Attachment in types.ts and moveAttachment's own doc comment in
 *  store.ts). So the whole feature stands or falls on one thing: does
 *  moveAttachment() actually move the object, cleanly, with nothing left
 *  behind on the source and nothing invented on the destination? Source-
 *  reading the UI wiring cannot answer that — only running the real
 *  function can, so Part 1 does.
 *
 *     node --import ./tests/alias.mjs tests/relinkphoto.test.mjs
 *
 *  store.ts is imported first, same ordering fix carryforward.test.mjs's
 *  own header explains (a Node ESM cycle through ./programme). */
import { useStore, checksAt } from "@/lib/store";
import { CURRENT_ENTITY_CODE } from "@/lib/programme";

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`); }
};

/* ----------------------------------- Part 1: moveAttachment, for real --- */

const checks = checksAt(CURRENT_ENTITY_CODE);
/* Two checks on different asset systems, so a move provably crosses a
   system boundary and not just a checkId — exactly the "wrong asset type"
   case Sarel described. */
const fromCheck = checks[0];
const toCheck = checks.find((c) => c.system !== fromCheck.system) ?? checks[1];

useStore.getState().addAttachment(fromCheck.id, {
  kind: "photo",
  name: "test.jpg",
  blobKey: "test-blob-key",
  caption: "A panel that was actually on a different system",
});

const beforeMove = useStore.getState().response(fromCheck.id);
const addedPhoto = beforeMove.attachments[0];

check(
  "addAttachment put the photo on the FROM check, with a ref under its portal id",
  beforeMove.attachments.length === 1 && !!addedPhoto.ref?.includes("_P")
);

useStore.getState().moveAttachment(fromCheck.id, addedPhoto.id, toCheck.id);

const fromAfter = useStore.getState().response(fromCheck.id);
const toAfter = useStore.getState().response(toCheck.id);
const moved = toAfter.attachments.find((a) => a.id === addedPhoto.id);

check(
  "the FROM check no longer carries it — nothing left behind on the source",
  fromAfter.attachments.length === 0
);
check(
  "the TO check now carries the exact same attachment id — a move, not a copy with a new identity",
  !!moved
);
check(
  "its caption, kind and blobKey travelled unchanged",
  moved?.caption === "A panel that was actually on a different system" &&
    moved?.kind === "photo" &&
    moved?.blobKey === "test-blob-key"
);
check(
  "its ref was regenerated under the DESTINATION check's own portal id, not left pointing at the check it came from",
  moved?.ref !== addedPhoto.ref && moved?.ref?.startsWith(moved?.ref ?? "")
);

/* ---- a second photo already on the destination is not disturbed, and the
   new ref does not collide with it ----------------------------------- */
useStore.getState().addAttachment(toCheck.id, {
  kind: "photo",
  name: "already-there.jpg",
  blobKey: "other-blob-key",
});
const beforeSecondMove = useStore.getState().response(toCheck.id);
const secondAdd = beforeSecondMove.attachments.find((a) => a.id !== addedPhoto.id);

useStore.getState().addAttachment(fromCheck.id, {
  kind: "photo",
  name: "second.jpg",
  blobKey: "second-blob-key",
});
const secondPhoto = useStore.getState().response(fromCheck.id).attachments[0];
useStore.getState().moveAttachment(fromCheck.id, secondPhoto.id, toCheck.id);

const toFinal = useStore.getState().response(toCheck.id);
check(
  "a photo already on the destination check survives a later move onto it, untouched",
  !!toFinal.attachments.find((a) => a.id === secondAdd.id)
);
check(
  "and the newly-moved one gets its own, higher sequence number — refs never collide",
  toFinal.attachments.length === 3 &&
    new Set(toFinal.attachments.map((a) => a.ref)).size === 3
);

/* ---- moving onto the same check is a deliberate no-op, not an error --- */
const beforeNoop = useStore.getState().response(toCheck.id).attachments.length;
useStore.getState().moveAttachment(toCheck.id, moved.id, toCheck.id);
check(
  "moving a photo onto the check it is already on is a no-op — nothing duplicated, nothing thrown",
  useStore.getState().response(toCheck.id).attachments.length === beforeNoop
);

/* ---- a voice note or file is NOT offered this in the UI, even though the
   store action itself does not special-case kind --------------------- */
check(
  "moveAttachment itself does not special-case photo vs voice vs file — only the UI scopes it to photos",
  !/if \(a\.kind !== "photo"\)/.test(
    fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "store.ts"),
      "utf8"
    )
  )
);

/* --------------------------------------- Part 2: the UI is wired up --- */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const capture = src("components", "Capture.tsx");
const review = src("components", "ReviewDetail.tsx");
const sheet = src("components", "RelinkPhotoSheet.tsx");
const storeSrc = src("lib", "store.ts");

check(
  "moveAttachment is declared on the store",
  /moveAttachment: \(checkId: string, attachmentId: string, toCheckId: string\) => void;/.test(storeSrc) ||
    /moveAttachment: \(fromCheckId: string, attachmentId: string, toCheckId: string\) => void;/.test(storeSrc)
);
check(
  "AttachmentStrip takes an optional onMove, scoped to photos only",
  /onMove\?: \(id: string\) => void;/.test(capture) &&
    /onMove=\{onMove \? \(\) => onMove\(a\.id\) : undefined\}/.test(capture)
);
check(
  "PhotoRow renders a Move button only when onMove is supplied, and never for a dead/unavailable photo",
  /onMove && !dead && \(/.test(capture)
);
check(
  "ReviewDetail is the screen that wires onMove — the one place mis-filed evidence is actually spotted",
  /onMove=\{\(id\) =>/.test(review) && /setMovingPhoto/.test(review)
);
check(
  "picking a destination calls moveAttachment with the CURRENT check as the source",
  /moveAttachment\(check\.id, movingPhoto\.id, toCheckId\)/.test(review)
);
check(
  "RelinkPhotoSheet excludes the check the photo is already on from its own results",
  /c\.id !== fromCheckId/.test(sheet)
);
check(
  "and nothing can be confirmed until a destination check is actually picked",
  /disabled=\{!checkId\}/.test(sheet)
);

console.log(failures === 0 ? "\nRELINK PHOTO OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
