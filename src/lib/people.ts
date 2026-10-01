/** The people directory — site tagging and what a pick carries through — kept
 *  out of the screen and out of ContactPicker for the same reason every other
 *  register's lib module is: both need the same answer to "is this contact
 *  relevant here" and "what do I show as their organisation", and a second
 *  copy of either is how the directory and the picker come to disagree about
 *  who belongs at a given site. */

import type { Contact } from "@/lib/types";

/** A contact tagged this way is not based at one airport — a TPJV engineer
 *  who covers every site, say — and is relevant wherever the directory or
 *  ContactPicker is open, not just at the one site stored in `site` on
 *  everyone else's row. Sarel: "allow to select airports all as an option."
 *
 *  Deliberately not the same thing as Corporate/head-office. Corporate is a
 *  PLACE — programme.json already has one entity of kind "head-office" — and
 *  this is a SCOPE. Folding "applies everywhere" into the existing Corporate
 *  field would be a second meaning for it, which is exactly the drift the
 *  Corporate field was built to avoid in the first place. */
export const SITE_ALL = "ALL";

export function siteLabel(site: string): string {
  return site === SITE_ALL ? "All airports" : site;
}

/** Whether a contact belongs at the given site — tagged for it directly, or
 *  tagged for every site. Every screen that filters a contact list by the
 *  entity in view reads this rather than comparing `c.site` itself, so a
 *  contact tagged ALL cannot be left out of one screen's filter while another
 *  screen remembers it. */
export function contactAtSite(c: Contact, entityCode: string): boolean {
  return c.site === entityCode || c.site === SITE_ALL;
}

/** What a register entry shows as "organisation" when this contact is
 *  picked — the employer, not the org unit. Falls back to department for a
 *  contact entered before the company field existed, rather than handing the
 *  entry an empty string for data that is still useful. */
export function contactOrganisation(c: Contact): string {
  return c.company.trim() || c.department.trim();
}

/** Every field search should match against — kept here so the directory's
 *  own search and anything else that searches contacts cannot drift apart on
 *  which fields count. */
export function contactSearchFields(c: Contact): string[] {
  return [c.name, c.surname, c.role, c.discipline, c.company, c.department, c.location];
}
