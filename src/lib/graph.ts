"use client";

/** Microsoft Graph, under the auditor's own sign-in.
 *
 *  WHY THERE IS NO CLIENT SECRET ANYWHERE IN HERE. The alternative design —
 *  an app-only registration with a secret in Vercel — would give Squawk
 *  standing write access to the whole SharePoint site whether anybody was
 *  using it or not, and every write would be attributed to "Squawk" rather
 *  than to a person. On an audit trail that is the wrong answer twice. This
 *  signs the AUDITOR in, writes as them, and can do nothing they could not do
 *  themselves in a browser.
 *
 *  So: authorization code flow with PKCE, public client, no secret. The only
 *  configuration is a client id and a tenant, and neither is a credential —
 *  a client id is public by design in this flow.
 *
 *  THE ACCESS TOKEN IS HELD IN MEMORY AND NOWHERE ELSE. Not in the store, not
 *  in localStorage, not in IndexedDB. A reload signs you out. That is a
 *  deliberate cost: this is a tablet carried around a national key point, and
 *  a bearer token for a document library sitting in browser storage on it is
 *  worth more to somebody than the tablet is. The sync is a thing you do once
 *  at the end of an audit, so signing in again is a button, not a burden.
 *
 *  No MSAL. The whole flow is ninety lines and this way there is no second
 *  token cache with its own storage policy to reason about — which is the
 *  entire point of the paragraph above. */

/** Configured at build time. Neither value is secret. Absent means the sync is
 *  simply not offered, and the app is completely usable without it. */
export const GRAPH_CLIENT_ID = process.env.NEXT_PUBLIC_GRAPH_CLIENT_ID ?? "";
/** A tenant id, or "organizations" for any work account. */
export const GRAPH_TENANT = process.env.NEXT_PUBLIC_GRAPH_TENANT ?? "organizations";
/** The SharePoint host and site path the audit portal lives at. */
export const GRAPH_SITE = process.env.NEXT_PUBLIC_GRAPH_SITE ?? "";

export function graphConfigured(): boolean {
  return !!GRAPH_CLIENT_ID && !!GRAPH_SITE;
}

/** What is missing, in the words of somebody who has to go and set it. */
export function graphMissing(): string[] {
  const out: string[] = [];
  if (!GRAPH_CLIENT_ID) out.push("NEXT_PUBLIC_GRAPH_CLIENT_ID");
  if (!GRAPH_SITE) out.push("NEXT_PUBLIC_GRAPH_SITE");
  return out;
}

/* ------------------------------------------------------------------- auth */

/** In memory, for this tab, until the tab goes away. See the header. */
let token: { value: string; expires: number; who: string } | null = null;

export function signedInAs(): string | null {
  return token && token.expires > Date.now() ? token.who : null;
}

export function signOut(): void {
  token = null;
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/** The scope. `Sites.ReadWrite.All` is delegated — it grants what the signed-in
 *  auditor already has, never more. An auditor with read-only access to the
 *  portal stays read-only, and Graph, not this code, enforces that. */
const SCOPE = "https://graph.microsoft.com/Sites.ReadWrite.All openid profile";

/** Opens the Microsoft sign-in in a popup and resolves once a token is held.
 *
 *  A popup rather than a full redirect: the app's state is in IndexedDB and
 *  would survive a redirect, but an auditor mid-sentence in an observation
 *  field would not thank us for finding out. */
export async function signIn(): Promise<string> {
  if (!graphConfigured()) throw new Error("Microsoft Graph is not configured for this deployment.");
  const { verifier, challenge } = await pkce();
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const redirect = `${window.location.origin}/graph-callback`;

  const url =
    `https://login.microsoftonline.com/${encodeURIComponent(GRAPH_TENANT)}/oauth2/v2.0/authorize` +
    `?client_id=${encodeURIComponent(GRAPH_CLIENT_ID)}` +
    `&response_type=code&response_mode=query` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    `&scope=${encodeURIComponent(SCOPE)}` +
    `&code_challenge=${challenge}&code_challenge_method=S256` +
    `&state=${state}`;

  const win = window.open(url, "graph-signin", "width=520,height=680");
  if (!win) throw new Error("The sign-in window was blocked. Allow pop-ups for this site and try again.");

  const code = await new Promise<string>((resolve, reject) => {
    const timer = setInterval(() => {
      if (win.closed) {
        clearInterval(timer);
        window.removeEventListener("message", onMessage);
        reject(new Error("Sign-in was cancelled."));
      }
    }, 500);
    function onMessage(e: MessageEvent) {
      /* Same origin only. The callback page is ours; anything else talking to
         this listener is not something to take an authorization code from. */
      if (e.origin !== window.location.origin) return;
      const d = e.data as { squawkGraph?: { code?: string; state?: string; error?: string } };
      if (!d?.squawkGraph) return;
      clearInterval(timer);
      window.removeEventListener("message", onMessage);
      if (d.squawkGraph.error) reject(new Error(d.squawkGraph.error));
      else if (d.squawkGraph.state !== state) reject(new Error("Sign-in state did not match. Try again."));
      else if (d.squawkGraph.code) resolve(d.squawkGraph.code);
      else reject(new Error("Sign-in returned nothing usable."));
    }
    window.addEventListener("message", onMessage);
  });

  const body = new URLSearchParams({
    client_id: GRAPH_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirect,
    code_verifier: verifier,
    scope: SCOPE,
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(GRAPH_TENANT)}/oauth2/v2.0/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }
  );
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
    id_token?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description?.split("\n")[0] ?? "Microsoft did not return a token.");
  }
  token = {
    value: json.access_token,
    expires: Date.now() + (json.expires_in ?? 3600) * 1000 - 60_000,
    who: whoFrom(json.id_token) ?? "signed in",
  };
  return token.who;
}

/** The name off the id token, for the "signed in as" line. Best effort — this
 *  is a label, and nothing is authorised on the strength of it. */
function whoFrom(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const part = idToken.split(".")[1];
    const claims = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as {
      preferred_username?: string;
      name?: string;
    };
    return claims.preferred_username ?? claims.name ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ calls */

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!token || token.expires <= Date.now()) {
    throw new GraphError("Signed out. Sign in to Microsoft again.", 401, path);
  }
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token.value}`,
      ...(init?.body && !(init.body instanceof Blob) ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    /* The whole message, not a status code. "403" tells an auditor nothing;
       "you do not have permission to write to this list" tells them who to
       ring. */
    let detail = `${res.status} ${res.statusText}`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j.error?.message) detail = j.error.message;
    } catch {
      /* a non-JSON body; the status is what we have */
    }
    throw new GraphError(detail, res.status, path);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Every page of a collection. A site with 324 check-points returns them 200 at
 *  a time, and a sync that read only the first page would cheerfully create
 *  duplicates of everything after it. */
async function all<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = path;
  while (next) {
    const page: { value: T[]; "@odata.nextLink"?: string } = await call(next);
    out.push(...page.value);
    const link = page["@odata.nextLink"];
    next = link ? link.replace("https://graph.microsoft.com/v1.0", "") : null;
  }
  return out;
}

export interface GraphSite {
  id: string;
  displayName?: string;
  webUrl: string;
}

/** Resolve `tpjv.sharepoint.com:/sites/ACSA-Asset-Assurance` to a site id. */
export async function resolveSite(): Promise<GraphSite> {
  const [host, ...rest] = GRAPH_SITE.replace(/^https?:\/\//, "").split("/");
  const serverRelative = "/" + rest.join("/");
  return call<GraphSite>(`/sites/${host}:${serverRelative}`);
}

export interface GraphList {
  id: string;
  displayName: string;
  name: string;
}

export async function lists(siteId: string): Promise<GraphList[]> {
  return all<GraphList>(`/sites/${siteId}/lists?$select=id,name,displayName&$top=200`);
}

export interface GraphColumn {
  /** The INTERNAL name — what a write actually addresses. */
  name: string;
  displayName: string;
  readOnly?: boolean;
}

/** The internal column names, read at run time.
 *
 *  This is the whole reason the sync does not carry a hardcoded field map.
 *  SharePoint's internal names are not its display names — a column shown as
 *  "Risk priority" can be `field_7`, or `RiskPriority`, or the internal name of
 *  whatever it was first called before somebody renamed it. Guessing produces a
 *  200 OK that writes nothing, which is the worst failure available: it looks
 *  like it worked.
 *
 *  So the map is built from the list itself on every run, and a column that is
 *  not there is named and the sync refuses to start. */
export async function columns(siteId: string, listId: string): Promise<GraphColumn[]> {
  return all<GraphColumn>(
    `/sites/${siteId}/lists/${listId}/columns?$select=name,displayName,readOnly&$top=200`
  );
}

export interface GraphItem {
  id: string;
  fields: Record<string, unknown>;
}

export async function items(siteId: string, listId: string, select: string[]): Promise<GraphItem[]> {
  const expand = `fields($select=${select.join(",")})`;
  return all<GraphItem>(`/sites/${siteId}/lists/${listId}/items?$expand=${expand}&$top=200`);
}

export async function createItem(
  siteId: string,
  listId: string,
  fields: Record<string, unknown>
): Promise<GraphItem> {
  return call<GraphItem>(`/sites/${siteId}/lists/${listId}/items`, {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
}

export async function updateItem(
  siteId: string,
  listId: string,
  itemId: string,
  fields: Record<string, unknown>
): Promise<void> {
  await call(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
}

/** Upload one photograph into the evidence library.
 *
 *  `@microsoft.graph.conflictBehavior=replace` on purpose: the reference
 *  `KSIA-ELE-001_P01.jpg` names one image for the life of the audit, so a
 *  second upload of it is the same photograph again, not a different one.
 *  `rename` would quietly produce `..._P01 1.jpg` and break the cross-reference
 *  the workbook prints. */
export async function uploadEvidence(
  driveId: string,
  folderPath: string,
  filename: string,
  blob: Blob
): Promise<{ webUrl: string }> {
  const path = `${folderPath}/${filename}`.replace(/^\/+/, "");
  return call<{ webUrl: string }>(
    `/drives/${driveId}/root:/${encodeURI(path)}:/content?@microsoft.graph.conflictBehavior=replace`,
    { method: "PUT", body: blob, headers: { "Content-Type": blob.type || "image/jpeg" } }
  );
}

export interface GraphDrive {
  id: string;
  name: string;
}

export async function drives(siteId: string): Promise<GraphDrive[]> {
  return all<GraphDrive>(`/sites/${siteId}/drives?$select=id,name&$top=100`);
}

/** Create the folder if it is not there, and say nothing if it is. */
export async function ensureFolder(driveId: string, folderPath: string): Promise<void> {
  const clean = folderPath.replace(/^\/+|\/+$/g, "");
  try {
    await call(`/drives/${driveId}/root:/${encodeURI(clean)}`);
    return;
  } catch (e) {
    if (!(e instanceof GraphError) || e.status !== 404) throw e;
  }
  const cut = clean.lastIndexOf("/");
  const parent = cut < 0 ? "" : clean.slice(0, cut);
  const name = cut < 0 ? clean : clean.slice(cut + 1);
  if (parent) await ensureFolder(driveId, parent);
  await call(`/drives/${driveId}/root:/${encodeURI(parent)}:/children`, {
    method: "POST",
    body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
  }).catch((e) => {
    /* Somebody else created it between the check and the create. That is the
       outcome we wanted, so it is not an error. */
    if (!(e instanceof GraphError) || e.status !== 409) throw e;
  });
}
