import { redirect } from "next/navigation";

/** /review IS NOW /issues?filter=toReview — build prompt 8 (22 Nov 2026):
 *  "Issues screen = Follow-up/Review/Cleanup." The "Risk & root cause" tab
 *  — ReviewRiskTable/ReviewRiskPanel — moved to src/app/(app)/issues/
 *  page.tsx's "To review" filter, reused unchanged (same components, same
 *  props, same onChange-through-updateFinding division of labour) plus a
 *  phone-card view this screen never had (its own detail column was
 *  `hidden md:flex`). "By check" (a full check editor, redundant with the
 *  Checks screen since build prompt 3) and "Evidence" (redundant with the
 *  Evidence screen since build prompt 6) are not carried forward — both
 *  were already superseded by screens this redesign built earlier.
 *
 *  THE ROUTE ITSELF IS LEFT STANDING, same reasoning /field's own redirect
 *  (build prompt 7) and AppShell's own NAV comment already give — routes
 *  are "deliberately unchanged" until build prompt 10's own nav rewiring. */
export default function ReviewPage() {
  redirect("/issues?filter=toReview");
}
