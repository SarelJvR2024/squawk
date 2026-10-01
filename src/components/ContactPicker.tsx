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
}: {
  entityCode: string;
  placeholder?: string;
  onAdd: (p: PickedPerson) => void;
}) {
  const contacts = useContacts();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const hit = contacts.filter((c) =>
      [`${c.name} ${c.surname}`, c.role, c.department, c.discipline].some((v) =>
        v.toLowerCase().includes(s)
      )
    );
    /* This site's own people first — a KSIA auditor typing "T" is almost
       always looking for someone at KSIA, not a namesake at Bram Fischer. */
    return hit
      .sort((a, b) => (a.site === entityCode ? 0 : 1) - (b.site === entityCode ? 0 : 1))
      .slice(0, 8);
  }, [contacts, q, entityCode]);

  function pick(c: Contact) {
    onAdd({
      contactId: c.id,
      name: `${c.name} ${c.surname}`.trim(),
      organisation: c.department.trim(),
      role: c.role.trim(),
    });
    setQ("");
    setOpen(false);
  }

  function addTyped() {
    const name = q.trim();
    if (!name) return;
    onAdd({ name });
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
        aria-label="Add a person — search the directory or type a new name"
        placeholder={placeholder ?? "Search the people directory, or type a new name"}
        className="min-h-[44px] w-full rounded-[9px] border px-3 text-[13px] outline-none"
        style={{ background: "var(--bg)", borderColor: "var(--line)" }}
      />

      {open && q.trim() ? (
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
                  {[c.role, c.department].filter((v) => v.trim()).join(" · ") || "no role on file"}
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
