/* Squawk's service worker — the reason the app opens on an apron.
 *
 *  Everything else in this repo is careful about not losing captured work:
 *  IndexedDB holds the audit, photographs survive a reload, the sync queue
 *  waits for signal. All of it assumed the app had already loaded. It had not
 *  earned that assumption. Without this file, an auditor standing airside at
 *  King Shaka with no signal who closes the tab — or whose phone drops the page
 *  from memory, which iOS does aggressively — gets a browser error page and
 *  cannot reach a single thing they have captured.
 *
 *  Hand-written rather than generated, and no build step, because the strategy
 *  matters more than the coverage here and it should be readable by whoever
 *  inherits this:
 *
 *    navigations      cache first, revalidate behind it. A stale shell is not
 *                     dangerous — the audit is in IndexedDB, not in the HTML —
 *                     and an auditor mid-walkabout must never wait on a network
 *                     timeout to open a screen.
 *    /_next/static/*  cache first, forever. The filenames are content-hashed,
 *                     so a new build is new URLs and this can never go stale.
 *    everything else  network first, fall back to cache.
 *
 *  WHAT IS DELIBERATELY NEVER CACHED, and why each one would be a defect:
 *
 *    /api/*           the assist, transcribe and photo routes. They are
 *                     key-gated and their answers are one-shot; a cached
 *                     availability probe would tell an auditor a model is
 *                     configured on a deployment where it is not.
 *    /graph-callback  the OAuth redirect. It carries an authorisation code and
 *                     a state parameter in the URL. Serving a stale one is
 *                     replaying somebody's sign-in.
 *    cross-origin     the fonts, and — the one that matters — Vercel Blob.
 *                     Photographs of a national key point are already held
 *                     deliberately in IndexedDB with `access: "private"` on the
 *                     store. They are not being copied into a second cache by
 *                     this file as a side effect of a routing rule.
 *    non-GET          nothing that changes state is ever answered from a cache.
 */

/* Bump this to retire every cache from the previous build. Activation deletes
   anything not carrying the current prefix. */
const VERSION = "squawk-v1";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;

/* The seven screens, precached on install so the FIRST offline launch works
   rather than the second.
 *
 *  `/` IS DELIBERATELY NOT ONE OF THEM. It is a server redirect to /capture, so
 *  caching it stores the redirected response under the key "/" — and handing a
 *  response with the redirected flag set back to a navigation is a hard error
 *  in every browser, which would have turned the home screen into a blank page
 *  on exactly the launch this file exists to make work. The manifest starts at
 *  /capture, and a bare `/` typed offline falls back to it below. */
const ROUTES = [
  "/capture",
  "/field",
  "/findings",
  "/hazards",
  "/closure",
  "/dashboard",
  "/review",
];

const untouched = (url) =>
  url.origin !== self.location.origin ||
  url.pathname.startsWith("/api/") ||
  url.pathname.startsWith("/graph-callback");

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      /* Best effort, one route at a time. A single 404 must not fail the whole
         install and leave the app with no worker at all — that is the failure
         this file exists to prevent, arriving by a different door. */
      await Promise.all(
        ROUTES.map((path) =>
          cache
            .add(new Request(path, { cache: "reload" }))
            .catch(() => undefined)
        )
      );
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

/* A new build is live and the auditor is not mid-capture: the page asks for the
   swap rather than this file taking it. Swapping under a running session can
   leave the page asking the old build for chunks the new cache does not hold. */
self.addEventListener("message", (event) => {
  if (event.data === "squawk:activate-update") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (untouched(url)) return;

  if (req.mode === "navigate") {
    event.respondWith(navigation(event, req, url));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(event, req, ASSETS));
    return;
  }

  event.respondWith(networkFirst(event, req, ASSETS));
});

/** The shell. Cached copy immediately, network in the background.
 *
 *  Keyed on the PATH, not the full URL: `/capture?check=KSIA-ELE-014` is the
 *  same screen as `/capture`, and caching every query string an auditor
 *  generates would fill the cache with hundreds of copies of one page. */
async function navigation(event, req, url) {
  const cache = await caches.open(SHELL);
  const key = new Request(url.origin + url.pathname);
  const hit = await cache.match(key);

  const fromNetwork = fetch(req)
    .then(async (res) => {
      if (!res.ok) return res;
      /* A SHELL IS NEVER STORED AHEAD OF THE BUILD IT POINTS AT.
       *
       *  This is the bug that door was left open by. A deploy lands; the
       *  auditor opens the app with signal and is served the cached shell
       *  instantly while the NEW html is written behind them; they walk out to
       *  the apron and lose signal; iOS drops the tab; they reopen — and now
       *  get the new shell, which asks for chunk filenames that were never
       *  fetched, because only the html was revalidated. Content-hashed assets
       *  cannot go stale, but they can be ABSENT, and absent offline is a blank
       *  page airside with the whole audit sitting unreachable in IndexedDB.
       *  Exactly the failure this file exists to prevent, arriving by a
       *  different door.
       *
       *  So an update is promoted only once the build it names can actually be
       *  served. The first copy of a screen needs no such gate: the page is
       *  about to request those chunks itself and cacheFirst will store them,
       *  and making a first paint wait on the whole build would be paying an
       *  apron for a problem that only deploys have. */
      if (hit) await promote(cache, key, res.clone());
      else await cache.put(key, res.clone());
      return res;
    })
    .catch(() => null);

  if (hit) {
    event.waitUntil(fromNetwork);
    return hit;
  }

  const res = await fromNetwork;
  /* Last resort: any screen at all beats a browser error page, because from
     any screen the nav reaches the rest of the app. */
  return (
    res ?? (await cache.match(new Request(url.origin + "/capture"))) ?? Response.error()
  );
}

/** Store a newer shell ONLY if every asset it names can be served offline.
 *
 *  Returns false and leaves the previous shell in place otherwise — a shell one
 *  build ahead of its own chunks is worse than a shell one build behind, which
 *  is merely old and works.
 *
 *  Assets already held are skipped, so the steady state is a text parse and a
 *  few cache lookups; only a real deploy does any fetching. */
async function promote(cache, key, res) {
  let html;
  try {
    html = await res.clone().text();
  } catch (err) {
    return false;
  }
  const urls = [...new Set(html.match(/\/_next\/static\/[^"'\s>\\)]+/g) ?? [])];
  const assets = await caches.open(ASSETS);
  for (const u of urls) {
    if (await assets.match(u)) continue;
    let fresh = null;
    try {
      fresh = await fetch(u);
    } catch (err) {
      fresh = null;
    }
    /* One asset short is a blank page, so it is all of them or none. */
    if (!fresh || !fresh.ok) return false;
    await assets.put(u, fresh.clone());
  }
  await cache.put(key, res);
  return true;
}

/** Content-hashed and immutable. If it is in the cache it is correct. */
async function cacheFirst(event, req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) event.waitUntil(cache.put(req, res.clone()));
    return res;
  } catch (err) {
    return Response.error();
  }
}

/** Everything else: fresh where there is signal, cached where there is not. */
async function networkFirst(event, req, name) {
  const cache = await caches.open(name);
  try {
    const res = await fetch(req);
    if (res.ok) event.waitUntil(cache.put(req, res.clone()));
    return res;
  } catch (err) {
    return (await cache.match(req)) ?? Response.error();
  }
}
