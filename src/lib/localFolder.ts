"use client";

/** Save a copy of every photograph to a folder on the device itself, one
 *  subfolder per audit (entity + visit) — Sarel: "change it so that photos
 *  are saved on the local device in a folder per audit automatically."
 *
 *  THE HARD LIMIT, FIRST. No browser lets a web page write to the local
 *  filesystem with zero interaction, ever — that is a security boundary, not
 *  a setting, and nothing here gets around it. What exists instead is the
 *  File System Access API: the person grants a folder ONCE, through its own
 *  picker, and every write after that happens with no further prompt, until
 *  permission is revoked (cleared site data, a different browser profile).
 *  "Automatic" means automatic after that one grant, never before it.
 *
 *  AND IT ONLY EXISTS IN SOME BROWSERS. Chrome and Edge have it, on desktop
 *  and Android. Safari does not implement it at all — no directory picker,
 *  no persisted write access — so this is unavailable on iPadOS/iOS
 *  wholesale, whatever is granted elsewhere. `supportsLocalFolder()` is the
 *  one gate everything else in this file assumes has already been checked;
 *  callers on an unsupported browser see the capture pipeline behave exactly
 *  as it always has (IndexedDB only), same as every other optional affordance
 *  in this app (assist, transcribe, dictation) when its own service or API
 *  is missing.
 *
 *  The folder handle is stored in IndexedDB via idb-keyval, same store media
 *  blobs live in (see media.ts) — a FileSystemDirectoryHandle is structured-
 *  cloneable, so it survives a reload the same way everything else here does. */

import { get as idbGet, set as idbSet } from "idb-keyval";

const HANDLE_KEY = "squawk-local-folder-handle";

/* The DOM lib TypeScript ships does not carry the File System Access API —
   it is still origin-trial-shaped in the spec process. Scoped to this file
   only, not a global augmentation, so a real, fuller type arriving later in
   `lib.dom.d.ts` simply shadows this without anything to unpick. */
interface FsDirectoryHandle {
  readonly kind: "directory";
  readonly name: string;
  queryPermission(opts: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(opts: { mode: "readwrite" }): Promise<PermissionState>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FsDirectoryHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FsFileHandle>;
}
interface FsFileHandle {
  readonly kind: "file";
  createWritable(): Promise<FsWritable>;
}
interface FsWritable {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}
type WindowWithFsAccess = Window & {
  showDirectoryPicker?: (opts?: { mode?: "read" | "readwrite" }) => Promise<FsDirectoryHandle>;
};

export function supportsLocalFolder(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export type FolderStatus =
  | { state: "unsupported" }
  | { state: "not-set" }
  | { state: "needs-permission"; name: string }
  | { state: "connected"; name: string };

/** Read-only — never prompts. `queryPermission` (unlike `requestPermission`)
 *  is allowed to run with no user gesture, which is what makes it safe to
 *  call from an effect on page load rather than only from a click. */
export async function getFolderStatus(): Promise<FolderStatus> {
  if (!supportsLocalFolder()) return { state: "unsupported" };
  const handle = (await idbGet(HANDLE_KEY)) as FsDirectoryHandle | undefined;
  if (!handle) return { state: "not-set" };
  try {
    const perm = await handle.queryPermission({ mode: "readwrite" });
    return perm === "granted"
      ? { state: "connected", name: handle.name }
      : { state: "needs-permission", name: handle.name };
  } catch {
    /* The handle itself is unusable (a cleared/rotated profile can leave a
       stale one behind) — same as never having picked one. */
    return { state: "not-set" };
  }
}

/** MUST be called from a click handler — both `showDirectoryPicker` and
 *  `requestPermission` throw outside a user gesture. Re-picking replaces
 *  whatever folder was set before; this app never silently redirects
 *  writes from one folder to another without the person choosing that. */
export async function requestFolder(): Promise<{ ok: boolean; name?: string; error?: string }> {
  const win = window as WindowWithFsAccess;
  if (!win.showDirectoryPicker) return { ok: false, error: "This browser does not support saving to a folder." };
  try {
    const handle = await win.showDirectoryPicker({ mode: "readwrite" });
    await idbSet(HANDLE_KEY, handle);
    return { ok: true, name: handle.name };
  } catch (e) {
    /* Cancelling the picker throws AbortError — not a failure worth saying
       anything about, the person just changed their mind. */
    if (e instanceof Error && e.name === "AbortError") return { ok: false };
    return { ok: false, error: e instanceof Error ? e.message : "Could not open the folder picker." };
  }
}

/** Re-asks for permission on the ALREADY-PICKED folder (no new picker) —
 *  for the "needs-permission" state, where the handle survived a reload but
 *  the browser wants it re-confirmed. Also needs a user gesture. */
export async function reconnectFolder(): Promise<{ ok: boolean; error?: string }> {
  const handle = (await idbGet(HANDLE_KEY)) as FsDirectoryHandle | undefined;
  if (!handle) return { ok: false, error: "No folder was ever chosen." };
  try {
    const perm = await handle.requestPermission({ mode: "readwrite" });
    return perm === "granted" ? { ok: true } : { ok: false, error: "Permission was not granted." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reconnect the folder." };
  }
}

/** Characters no common filesystem (Windows included, the strictest of the
 *  three this app's users are on) accepts in a name, plus leading/trailing
 *  dots and spaces, which Windows silently strips in a way that can collide
 *  two different audits into one folder. */
function sanitizeName(raw: string): string {
  const cleaned = raw.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/^[.\s]+|[.\s]+$/g, "");
  return cleaned || "untitled";
}

/** Best-effort, and silent on failure BY DESIGN. This is a convenience copy
 *  on top of the real record — every photograph is already safe in
 *  IndexedDB the moment `putBlob` returns, same as before this file existed.
 *  A revoked permission, a deleted folder, a full disk, a browser that lost
 *  the handle across an update — none of that may ever cost an auditor a
 *  photograph, so the caller (Capture.tsx) fires this and moves on; it never
 *  awaits it before confirming a capture, and it never retries or surfaces
 *  an error from it. Returns whether it actually wrote the file, which
 *  exists for tests and Pre-flight's own status row to call directly, not
 *  for the capture path to branch on. */
export async function savePhotoToFolder(
  entityCode: string,
  visitId: string,
  filename: string,
  blob: Blob
): Promise<boolean> {
  try {
    const handle = (await idbGet(HANDLE_KEY)) as FsDirectoryHandle | undefined;
    if (!handle) return false;
    if ((await handle.queryPermission({ mode: "readwrite" })) !== "granted") return false;

    const auditFolder = sanitizeName(`${entityCode}-${visitId}`);
    const dir = await handle.getDirectoryHandle(auditFolder, { create: true });
    const fileHandle = await dir.getFileHandle(sanitizeName(filename), { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}
