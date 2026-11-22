import { redirect } from "next/navigation";

/** /raise IS NOW /issues?open=raise — build prompt 8 (22 Nov 2026): "Issues
 *  screen = Follow-up/Review/Cleanup... It replaces Raise a finding...".
 *  Build prompt 5 already built the real replacement for this screen's own
 *  flow — AddSheet's "Issue" option, which hands off to RaiseFindingSheet,
 *  the exact same fields and save shape this screen's own header says it
 *  kept. `?open=raise` tells the Issues screen to open that same flow
 *  immediately, with no preset context — "general issues (no check, no
 *  asset system) are allowed" is exactly what opening it from here, with
 *  nothing already known, already gives for free.
 *
 *  THE ROUTE ITSELF IS LEFT STANDING, same reasoning /field's own redirect
 *  (build prompt 7) and AppShell's own NAV comment already give — routes
 *  are "deliberately unchanged" until build prompt 10's own nav rewiring;
 *  AppShell's NAV still points here today. */
export default function RaisePage() {
  redirect("/issues?open=raise");
}
