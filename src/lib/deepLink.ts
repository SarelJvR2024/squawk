/** OPENING A RECORD LINKED FROM THE FORMS HUB.
 *
 *  Sarel: "display all completed forms in a timeline and allow to click and
 *  view and edit them." Every register screen already keeps one `openId`
 *  state that expands a single row — /forms just sent you to the general
 *  screen and left you to find the row again. This reads `?open=<id>` once,
 *  hands it to that same `openId` setter, and scrolls the row into view, so
 *  the click from the hub actually lands you on the record rather than near
 *  it.
 *
 *  Plain `window.location`/`history`, not `useSearchParams`, so a screen
 *  that reads it does not get pulled out of static generation — this is a
 *  one-off read on mount, not routing state the rest of the page reacts to.
 *  The param is stripped afterwards so refreshing or coming back from the
 *  record does not reopen it every time. */

import { useEffect } from "react";

export function useFormsHubDeepLink(setOpenId: (id: string) => void): void {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("open");
    if (!id) return;

    setOpenId(id);

    const url = new URL(window.location.href);
    url.searchParams.delete("open");
    window.history.replaceState({}, "", url);

    /* The matching row may not exist in the DOM yet — the store rehydrates
       from IndexedDB after first paint. A few spaced attempts cover that
       without polling forever for an id that was never going to appear. */
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const el = document.querySelector(`[data-record-id="${CSS.escape(id)}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        window.clearInterval(timer);
      } else if (tries >= 10) {
        window.clearInterval(timer);
      }
    }, 200);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
