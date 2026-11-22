import { redirect } from "next/navigation";

/** /closure IS NOW /issues?filter=carried — build prompt 8 (22 Nov 2026):
 *  "Issues screen = Follow-up/Review/Cleanup." Everything this screen used
 *  to render (the asset-system worklist, the audit-round timeline, the
 *  Verify flow) moved to src/app/(app)/issues/page.tsx's "Carried" filter,
 *  carried over essentially unchanged — see that file's own header comment.
 *
 *  THE ROUTE ITSELF IS LEFT STANDING, same reasoning /field's own redirect
 *  (build prompt 7) and AppShell's own NAV comment already give: nothing
 *  links to /closure by name any more, but AppShell's NAV and FlowStepper's
 *  FLOW_STEPS still do (routes are "deliberately unchanged" — nav rewiring
 *  is build prompt 10's job, not this one's), so the URL has to keep
 *  landing somewhere real. */
export default function ClosurePage() {
  redirect("/issues?filter=carried");
}
