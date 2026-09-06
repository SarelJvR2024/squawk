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

/* Comfortably above a downscaled photograph (300-600 KB) and well under the
   serverless body limit. A file over this is not a photograph this app made. */
const MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

/** `FALE/2026-09/KSIA-ELE-001_P01.jpg` and nothing else. The path is built by
 *  the client from data it owns, so it is validated rather than trusted: a
 *  traversal or an absolute path would put an object somewhere nobody looks. */
const PATH = /^[A-Z0-9]{2,6}\/\d{4}-\d{2}\/[A-Za-z0-9._-]{1,120}$/;

export async function GET() {
  return Response.json({ available: !!process.env.BLOB_READ_WRITE_TOKEN });
}

export async function POST(req: NextRequest) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
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
    return Response.json(
      { error: `The record store rejected the upload: ${message}` },
      { status: 502 }
    );
  }
}
