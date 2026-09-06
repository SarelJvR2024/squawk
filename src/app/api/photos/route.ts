import type { NextRequest } from "next/server";
import { put } from "@vercel/blob";

/* The record copy of a photograph.
 *
 *  A tablet is a capture device, not a records system. Browser storage is
 *  evicted under pressure, cleared with site data, and gone with the device —
 *  and an ACSA finding challenged in six months is evidenced by the photograph
 *  or by nothing. So every photograph is also written to a blob store, and that
 *  copy is the record.
 *
 *  Two things this route will not do.
 *
 *  It does not delete the local copy, and nothing downstream of it does either.
 *  The device keeps its own — the auditor is offline on an apron more often
 *  than not, and evidence that needs a network to look at is evidence they
 *  cannot check while standing in front of the asset.
 *
 *  It does not make the object public. `access: "private"` — these are
 *  photographs of a national key point, and a public blob URL is a URL anybody
 *  who ever sees it can keep. Reading one back needs a signed URL, which is a
 *  route to build when somebody actually needs to; the local copy serves the
 *  app today.
 *
 *  Without BLOB_READ_WRITE_TOKEN the route reports itself unavailable and the
 *  app carries on exactly as before: capture, caption, export, all local. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The token, whatever Vercel called it.
 *
 *  Creating a blob store offers a "Custom Environment Variable Prefix", so a
 *  project with several stores can tell them apart — a store named with the
 *  prefix SQUAWK_BLOB produces SQUAWK_BLOB_READ_WRITE_TOKEN, not the default
 *  BLOB_READ_WRITE_TOKEN. Reading only the default name means a correctly
 *  created store looks to the app exactly like no store at all, and the app is
 *  built to go quiet in that case: nothing uploads, nothing errors, and the
 *  only clue is a header that keeps saying photographs are on the device only.
 *
 *  So take any *_READ_WRITE_TOKEN, preferring the default when both exist. The
 *  prefix is the deployment's business, not this route's. */
/** Every variable that looks like a blob token, by NAME, sorted.
 *
 *  Sorted because the first version of this walked `Object.entries(process.env)`
 *  and took the first match, which is insertion order — fine with one store and
 *  a coin toss with two. A project that has had two stores has two tokens, and
 *  picking the wrong one fails in a way that reads like a broken upload rather
 *  than like the wrong store: a Private upload to a store created Public is
 *  refused, and the message says nothing about which token was used.
 *
 *  Values never leave the server. Names do, because the name is the thing a
 *  deployment has to look at to fix this. */
function blobTokenNames(): string[] {
  return Object.keys(process.env)
    .filter((k) => k.endsWith("_READ_WRITE_TOKEN") && process.env[k])
    .sort();
}

/** The variable this route will use — or nothing, when the deployment has not
 *  said which.
 *
 *  Three ways to be sure, in order:
 *    1. BLOB_TOKEN_VAR names the variable outright.
 *    2. BLOB_READ_WRITE_TOKEN, the default name, exists.
 *    3. Exactly one *_READ_WRITE_TOKEN exists, so there is nothing to choose.
 *
 *  With two candidates and none of the above this returns undefined ON PURPOSE.
 *  Alphabetical order would be deterministic and still wrong: this deployment
 *  has SQUAWK_BLOB_READ_WRITE_TOKEN from a store created Public and
 *  SQUAWK_READ_WRITE_TOKEN from the Private one that replaced it, and "BLOB"
 *  sorts first — so the tidy-looking rule picks the store nobody meant.
 *
 *  Writing evidence to a store nobody chose is worse than not writing it. The
 *  photograph stays on the device either way; a record copy in a forgotten
 *  store is a record nobody will ever look in. So it refuses, and says which
 *  names it can see. */
function blobTokenName(): string | undefined {
  const named = process.env.BLOB_TOKEN_VAR;
  if (named && process.env[named]) return named;
  if (process.env.BLOB_READ_WRITE_TOKEN) return "BLOB_READ_WRITE_TOKEN";
  const names = blobTokenNames();
  return names.length === 1 ? names[0] : undefined;
}

/** True when there are several candidates and nothing says which to use. */
function blobAmbiguous(): boolean {
  return !blobTokenName() && blobTokenNames().length > 1;
}

function blobToken(): string | undefined {
  const name = blobTokenName();
  return name ? process.env[name] : undefined;
}

/** What to tell somebody looking at two tokens. */
const AMBIGUOUS_REASON = (names: string[]) =>
  `This deployment has ${names.length} blob tokens set — ${names.join(", ")} — and nothing says which store the photographs belong in. Nothing has been uploaded, because a record copy in the wrong store is a record nobody will find. Delete the token of the store you replaced, or set BLOB_TOKEN_VAR to the name of the one you mean.`;

/* Comfortably above a downscaled photograph (300-600 KB) and well under the
   serverless body limit. A file over this is not a photograph this app made. */
const MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

/** `FALE/2026-09/KSIA-ELE-001_P01.jpg` and nothing else. The path is built by
 *  the client from data it owns, so it is validated rather than trusted: a
 *  traversal or an absolute path would put an object somewhere nobody looks. */
const PATH = /^[A-Z0-9]{2,6}\/\d{4}-\d{2}\/[A-Za-z0-9._-]{1,120}$/;

export async function GET() {
  const names = blobTokenNames();
  const via = blobTokenName();
  return Response.json({
    available: !!via,
    /* Named so a deployment can see WHICH variable was picked up, without the
       value ever leaving the server. Getting this wrong is silent otherwise. */
    via: via ?? null,
    /* And every OTHER candidate, because two tokens means two stores and only
       one of them is the one somebody meant. A stale token left behind from a
       store that was recreated is the failure this reports. */
    candidates: names,
    ambiguous: blobAmbiguous(),
    reason: blobAmbiguous() ? AMBIGUOUS_REASON(names) : null,
  });
}

export async function POST(req: NextRequest) {
  const token = blobToken();
  if (!token) {
    /* Two different silences, and they need two different answers. No store at
       all is the documented, supported state — the app is local-only and says
       so. Two stores and no choice is a misconfiguration somebody has to fix,
       and it must not read like the first. */
    if (blobAmbiguous()) {
      return Response.json(
        { error: AMBIGUOUS_REASON(blobTokenNames()), available: false },
        { status: 503 }
      );
    }
    return Response.json(
      {
        error: "No record store is configured for this deployment.",
        available: false,
      },
      { status: 503 }
    );
  }

  let file: File | null = null;
  let pathname = "";
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
    pathname = String(form.get("pathname") ?? "");
  } catch {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }

  if (!file || file.size === 0) {
    return Response.json({ error: "No image was sent." }, { status: 400 });
  }
  if (!PATH.test(pathname)) {
    return Response.json({ error: "That is not a photograph path." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB and the limit is 8 MB.` },
      { status: 413 }
    );
  }
  const type = file.type || "image/jpeg";
  if (!ALLOWED.includes(type)) {
    return Response.json({ error: `${type} is not an image type this stores.` }, { status: 400 });
  }

  try {
    const blob = await put(pathname, file, {
      access: "private",
      contentType: type,
      token,
      /* The path already carries the audit and the check-point; a random suffix
         would break the one thing this naming exists for — that the workbook's
         File column and the stored object are the same string. */
      addRandomSuffix: false,
      /* Re-uploading the same reference replaces it rather than failing. A
         retry after a dropped connection is the common case, and a duplicate
         object under a mangled name would be worse than an overwrite: the
         reference means one image, so the newest bytes for that reference are
         the right ones. */
      allowOverwrite: true,
    });
    return Response.json({ url: blob.url, pathname: blob.pathname });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    console.error("photo upload", pathname, message);
    /* A store created as Public cannot take a private blob. Say that, rather
       than passing on an SDK message nobody can act on — and do NOT quietly
       retry as public. Whether photographs of a national key point sit on a
       URL anybody can keep is not a decision this route makes on a retry. */
    const publicStore = /private|access/i.test(message);
    /* Name the variable the upload used. Without it "the record store rejected
       it" is unactionable on a project with two stores — which is exactly the
       project this is, one Public store having been created before the Private
       one. The name is not a secret; the token it points at never leaves. */
    const via = blobTokenName();
    const others = blobTokenNames().filter((n) => n !== via);
    const which = via ? ` (using ${via}${others.length ? `; also set: ${others.join(", ")}` : ""})` : "";
    return Response.json(
      {
        error: publicStore
          ? `The record store will not accept a private upload${which}. It was probably created with Access: Public — these are site photographs and they are stored privately by design. Create the store as Private, and delete the token of any store you replaced.`
          : `The record store rejected the upload${which}: ${message}`,
      },
      { status: 502 }
    );
  }
}
