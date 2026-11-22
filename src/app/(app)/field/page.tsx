import { redirect } from "next/navigation";

/** /field IS NOW /walk — build prompt 7 (22 Nov 2026): "Walk screen, replaces
 *  Inspection." Everything this screen used to render (the asset-system
 *  tree, the check sheet, the unassigned tray, the hazard modal, the + sheet)
 *  moved to src/app/(app)/walk/page.tsx, built on top of the new 3-state
 *  badge (Not started/Photos taken/Walked) and the photo counter against a
 *  target — see that file's own header comment.
 *
 *  THE ROUTE ITSELF IS LEFT STANDING, deliberately, same reasoning AppShell's
 *  own NAV comment already gives for every route in this app: nothing links
 *  to /field by name any more, but anything that still does — a bookmark, an
 *  old export, AppShell's NAV array and FlowStepper's FLOW_STEPS, both of
 *  which still point here (see AppShell.tsx's own "the routes are
 *  deliberately unchanged" comment) — must keep landing somewhere real
 *  rather than a 404. Renaming the nav tab and the URL together is build
 *  prompt 10's job ("New bottom bar, Home, route clean-up"), not this one's;
 *  until that lands, this is the one place the two meet. */
export default function FieldPage() {
  redirect("/walk");
}
