"use client";

/** ADD A PERSON — search the people directory, or type a name it does not have.
 *
 *  Every form that lists people (attendance, PPE checks, interviews, site
 *  access) used to ask for a bare name and leave organisation and role to be
 *  typed out by hand for every single person, every single day — the thing
 *  Sarel pointed at and said "doesn't work". The directory already carries
 *  that detail once per person, programme-wide (see Contact in
 *  src/lib/types.ts); this is what reads it back.
 *
 *  STILL JUST AS FAST FOR SOMEBODY NOT ON FILE. Not everyone who signs a
 *  register is in the directory yet — a visiting ACSA engineer seen once,
 *  a delivery driver — so typing a name the search does not match is never
 *  blocked; it is offered as its own row, exactly as "just a name" always
 *  worked here. Picking a known contact is the fast path, not the only path.
 *
 *  A TYPED NAME JOINS THE DIRECTORY, ON THE SPOT. Sarel: "any person we
 *  capture in any form should be added to our people register so they can be
 *  selected and added to any other instance of any other form." Until this,
 *  a name typed here lived only inside that one record — the next form, or
 *  even the same form tomorrow, asked the auditor to type it all over again,
 *  and the directory never grew from the one place people are actually met.
 *  Typing now calls addContact() itself rather than just handing the name to
 *  the caller, so the SECOND time anyone types a close match anywhere it is
 *  a pick, not a retype. Role/company/discipline start blank — only a name
 *  was offered — and are filled in later from the People screen, the same as
 *  any contact added there with gaps.
 *
 *  ONE PICK, ONE ROW. This does not batch several people into one state
 *  before handing them to the caller — each pick fires `onAdd` immediately,
 *  the same instant a typed name used to. The screen using it still owns
 *  "create a row when a person is added"; this only owns finding the person. */

import { useMemo, useState } from "react";
import { useContacts, useStore } from "@/lib/store";
import { SITE_ALL, contactOrganisation } from "@/lib/people";
import type { Contact } from "@/lib/types";

export interface PickedPerson {
  /** Set when the person came from the directory — carried through so the
   *  form's own entry can keep the link without this component knowing why
   *  any particular screen wants it. */
  contactId?: string;
  name: string;
  organisation?: string;
  role?: string;
  /** Carried through from the directory when the contact has them on file —
   *  absent rather than "" for a typed name, so a caller that wants to tell
   *  "known, but blank" apart from "not looked up at all" still can. */
  phone?: string;
  email?: string;
}

export default function ContactPicker({
  entityCode,
  placeholder,
  onAdd,
  disabled,
  filterContacts,
}: {
  entityCode: string;
  placeholder?: string;
  onAdd: (p: PickedPerson) => void;
  /** Blocks the control outright rather than letting the caller silently
   *  drop the add — a day that is closed, or a clock that has not loaded
   *  yet, is exactly the case a plain early-return in the handler used to
   *  swallow: the input cleared as though the person had been added, and
   *  nobody was. A disabled input cannot be typed into or submitted at all,
   *  so there is nothing for the handler to drop. */
  disabled?: boolean;
  /** Narrows the directory this one picker searches — the daily diary's
   *  "who worked today" only wants the TPJV team, where every other caller
   *  wants the whole directory. Typing a name the filter would exclude still
   *  works exactly as it always has; this only narrows matches, it is not a
   *  second gate on what gets added. */
  filterContacts?: (c: Contact) => boolean;
}) {
  const contacts = useContacts();
  const addContact = useStore((s) => s.addContact);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const pool = filterContacts ? contacts.filter(filterContacts) : contacts;
    const hit = pool.filter((c) =>
      [`${c.name} ${c.surname}`, c.role, c.company, c.department, c.discipline].some((v) =>
        v.toLowerCase().includes(s)
      )
    );
    /* This site's own people first, and a contact tagged for every airport
       right alongside them — a KSIA auditor typing "T" is almost always
       looking for someone relevant at KSIA, not a namesake at Bram Fischer. */
    const here = (c: Contact) => c.site === entityCode || c.site === SITE_ALL;
    return hit.sort((a, b) => (here(a) ? 0 : 1) - (here(b) ? 0 : 1)).slice(0, 8);
  }, [contacts, q, entityCode, filterContacts]);

  function pick(c: Contact) {
    onAdd({
      contactId: c.id,
      name: `${c.name} ${c.surname}`.trim(),
      organisation: contactOrganisation(c),
      role: c.role.trim(),
      phone: c.phone.trim(),
      email: c.email.trim(),
    });
    setQ("");
    setOpen(false);
  }

  function addTyped() {
    const name = q.trim();
    if (!name) return;
    /* First word is the given name, the rest is the surname — the same split
       a one-word name already handles correctly, since `rest` is just "" and
       Contact.surname reads as "", not undefined. A name typed with no space
       at all ("Prince") is rare enough on a signed register that asking for
       it to be split correctly is wrong more often than leaving it as a
       given name with no surname on file — both are visible and fixable from
       the People screen, which is where a blank field everywhere else in
       this directory already gets filled in. */
    const [first, ...restWords] = name.split(/\s+/);
    const contactId = addContact({
      site: entityCode,
      name: first ?? name,
      surname: restWords.join(" "),
      role: "",
      discipline: "",
      company: "",
      department: "",
      location: "",
      phone: "",
      email: "",
    });
    /* Explicit empty strings, not an absent key. The seed this becomes gets
       spread over a blank entry in the store (`{ organisation: "", ...seed
       }`), and a spread copies an explicitly-undefined key same as any
       other — it does not fall back to the default the way `??` would. A
       caller that then reads `p.organisation` straight off this object
       without its own `?? ""` would otherwise hand the store `undefined`
       for a field typed as `string`. */
    onAdd({ contactId, name, organisation: "", role: "" });
    setQ("");
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        /* The delay is so a tap on a result below survives the blur that tap
           itself causes — without it the list vanishes before the click
           registers, and nothing is ever picked by touch. */
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (matches.length > 0) pick(matches[0]);
          else addTyped();
        }}
        disabled={disabled}
        aria-label="Add a person — search the directory or type a new name"
        placeholder={placeholder ?? "Search the people directory, or type a new name"}
        className="min-h-[44px] w-full rounded-[9px] border px-3 text-[13px] outline-none disabled:opacity-50"
        style={{ background: "var(--bg)", borderColor: "var(--line)" }}
      />

      {open && !disabled && q.trim() ? (
        <div
          className="absolute z-10 mt-1 max-h-[260px] w-full overflow-y-auto rounded-[9px] border shadow-lg"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
        >
          {matches.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c)}
              className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-[12.5px]"
            >
              <span className="min-w-0 flex-1">
                <b className="block truncate">
                  {c.name} {c.surname}
                </b>
                <span className="block truncate text-[10.5px]" style={{ color: "var(--ink-3)" }}>
                  {[c.role, c.company || c.department].filter((v) => v.trim()).join(" · ") ||
                    "no role on file"}
                </span>
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={addTyped}
            className="flex min-h-[44px] w-full items-center gap-2 border-t px-3 py-2 text-left text-[12.5px]"
            style={{ borderColor: "var(--line-2)", color: "var(--acc)" }}
          >
            + Add &ldquo;{q.trim()}&rdquo; as a new person
          </button>
        </div>
      ) : null}
    </div>
  );
}
