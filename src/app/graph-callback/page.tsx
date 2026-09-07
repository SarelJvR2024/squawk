"use client";

import { useEffect } from "react";

/** Where Microsoft sends the sign-in popup back to.
 *
 *  It hands the authorization code to the window that opened it and closes.
 *  The code is worthless on its own — it only redeems against the PKCE
 *  verifier held in the opener's memory, which never left that tab — so this
 *  page holds nothing worth having even for the moment it is open.
 *
 *  `window.location.origin` as the postMessage target, never "*".
 *
 *  No state: the one line below is true whether the window closes itself or
 *  the browser refuses to, which is the only thing that varies here. */
export default function GraphCallback() {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (!window.opener) return;
    window.opener.postMessage(
      {
        squawkGraph: {
          code: q.get("code") ?? undefined,
          state: q.get("state") ?? undefined,
          error: q.get("error_description") ?? q.get("error") ?? undefined,
        },
      },
      window.location.origin
    );
    window.close();
  }, []);

  return (
    <main style={{ font: "14px system-ui", padding: 32, color: "#16131f" }}>
      Signing in — you can close this window.
    </main>
  );
}
