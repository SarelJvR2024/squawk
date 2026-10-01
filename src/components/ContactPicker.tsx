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
 *  ONE PICK, ONE ROW. This does not batch several people into one state
 *  before handing them to the caller — each pick fires `onAdd` immediately,
 *  the same instant a typed name used to. The screen using it still owns
 *  "create a row when a person is added"; this only owns finding the person. */

import { useMemo, useState } from "react";
import { useContacts } from "@/lib/store";
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
}

export default function ContactPicker({
  entityCode,
  placeholder,
  onAdd,
  disabled,
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
}) {
  const contacts = useContacts();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const hit = contacts.filter((c) =>
      [`${c.name} ${c.surname}`, c.role, c.company, c.department, c.discipline].some((v) =>
        v.toLowerCase().includes(s)
      )
    );
    /* This site's own people first, and a contact tagged for every airport
       right alongside them — a KSIA auditor typing "T" is almost always
       looking for someone relevant at KSIA, not a namesake at Bram Fischer. */
    const here = (c: Contact) => c.site === entityCode || c.site === SITE_ALL;
    return hit.sort((a, b) => (here(a) ? 0 : 1) - (here(b) ? 0 : 1)).slice(0, 8);
  }, [contacts, q, entityCode]);

  function pick(c: Contact) {
    onAdd({
      contactId: c.id,
      name: `${c.name} ${c.surname}`.trim(),
      organisation: contactOrganisation(c),
      role: c.role.trim(),
    });
    setQ("");
    setOpen(false);
  }

  function addTyped() {
    const name = q.trim();
    if (!name) return;
    /* Explicit empty strings, not an absent key. The seed this becomes gets
       spread over a blank entry in the store (`{ organisation: "", ...seed
       }`), and a spread copies an explicitly-undefined key same as any
       other — it does not fall back to the default the way `??` would. A
       caller that then reads `p.organisation` straight off this object
       without its own `?? ""` would otherwise hand the store `undefined`
       for a field typed as `string`. */
    onAdd({ name, organisation: "", role: "" });
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
