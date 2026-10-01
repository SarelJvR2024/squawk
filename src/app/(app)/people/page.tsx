"use client";

/** THE PEOPLE DIRECTORY — TPJV and ACSA contacts, per site and Corporate.
 *
 *  Sarel: "People directory — TPJV and ACSA contacts, per site and
 *  corporate." Then, on scoping it:
 *
 *  ONE FLAT LIST, TAGGED BY SITE. Not a separate bucket per airport plus a
 *  Corporate bucket bolted on — one list, each person carrying which site they
 *  are based at. Corporate is not a special case invented for this screen:
 *  programme.json already has one entity of kind "head-office" (CO), and a
 *  second spelling of "this person is at Corporate" is how the two drift.
 *
 *  ENTERED ONCE, NOT RE-TYPED EVERY AUDIT. A person's role at KSIA does not
 *  change between the March and September visit, so unlike a finding this
 *  record carries no `originVisit` at all — see Contact in src/lib/types.ts.
 *  It is read the same on every visit opened at that site.
 *
 *  A STANDALONE REFERENCE LIST, FOR NOW. ISF's "Airport contact" field and the
 *  other free-text name fields elsewhere are not wired to this yet — Sarel,
 *  same conversation: "standalone reference list for v1." Picking a name here
 *  to fill one of those in is a deliberately separate step. */

import { useMemo, useState } from "react";
import { useContacts, useEntityCode, useStore } from "@/lib/store";
import { ALL_DISCIPLINES } from "@/lib/register";
import { ENTITIES, entity as entityOf } from "@/lib/programme";
import { Btn, Empty, Field, Panel, Pill } from "@/components/ui/primitives";
import { IconPlus, IconX } from "@/components/ui/icons";
import type { Contact } from "@/lib/types";

const blankDraft = (site: string) => ({
  site,
  name: "",
  surname: "",
  role: "",
  discipline: "",
  department: "",
  location: "",
});

function SiteSelect({
  value,
  onChange,
  includeAll,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  includeAll?: boolean;
  ariaLabel: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className="min-h-[44px] w-full rounded-[9px] border px-3 text-[12.5px] outline-none"
      style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
    >
      {includeAll && <option value="">All sites</option>}
      {ENTITIES.map((e) => (
        <option key={e.code} value={e.code}>
          {e.kind === "head-office" ? `${e.short} — Corporate` : `${e.short} — ${e.name}`}
        </option>
      ))}
    </select>
  );
}

function DisciplineSelect({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className="min-h-[44px] w-full rounded-[9px] border px-3 text-[12.5px] outline-none"
      style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
    >
      <option value="">Not discipline-specific</option>
      {ALL_DISCIPLINES.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>
  );
}

export default function PeoplePage() {
  const entityCode = useEntityCode();
  const contacts = useContacts();
  const addContact = useStore((s) => s.addContact);
  const updateContact = useStore((s) => s.updateContact);
  const removeContact = useStore((s) => s.removeContact);

  const [draft, setDraft] = useState(() => blankDraft(entityCode));
  const [siteFilter, setSiteFilter] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const canAdd = draft.name.trim() && draft.surname.trim();

  const submit = () => {
    if (!canAdd) return;
    addContact({
      ...draft,
      name: draft.name.trim(),
      surname: draft.surname.trim(),
      role: draft.role.trim(),
      department: draft.department.trim(),
      location: draft.location.trim(),
    });
    setDraft(blankDraft(draft.site));
  };

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return contacts.filter((c) => {
      if (siteFilter && c.site !== siteFilter) return false;
      if (!s) return true;
      return [c.name, c.surname, c.role, c.discipline, c.department, c.location]
        .some((v) => v.toLowerCase().includes(s));
    });
  }, [contacts, siteFilter, q]);

  const groups = useMemo(() => {
    const by = new Map<string, Contact[]>();
    for (const c of visible) {
      const g = by.get(c.site) ?? [];
      g.push(c);
      by.set(c.site, g);
    }
    for (const g of by.values()) g.sort((a, b) => a.surname.localeCompare(b.surname));
    return [...by.entries()].sort(([a], [b]) => {
      /* Corporate last — a directory opened at an airport is almost always
         somebody looking for a person AT that airport; head-office contacts
         are the ones worth scrolling past, not the ones worth leading with. */
      const ea = entityOf(a);
      const eb = entityOf(b);
      if ((ea.kind === "head-office") !== (eb.kind === "head-office")) {
        return ea.kind === "head-office" ? 1 : -1;
      }
      return ea.short.localeCompare(eb.short);
    });
  }, [visible]);

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-3">
      <header className="mb-3">
        <h2 className="font-display text-[15px] font-semibold">People directory</h2>
        <p className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
          TPJV and ACSA contacts, per site and Corporate. Entered once — a person&rsquo;s
          role here does not change between audit cycles, so it is not re-typed every
          visit.
        </p>
      </header>

      <Panel className="mb-4">
        <Field label="ADD A CONTACT" hint="name and surname are the only fields needed">
          <div className="grid grid-cols-2 gap-[8px]">
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="Name"
              aria-label="Name"
              className="min-h-[44px] rounded-[9px] border px-3 text-[12.5px] outline-none"
              style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
            />
            <input
              value={draft.surname}
              onChange={(e) => setDraft((d) => ({ ...d, surname: e.target.value }))}
              placeholder="Surname"
              aria-label="Surname"
              className="min-h-[44px] rounded-[9px] border px-3 text-[12.5px] outline-none"
              style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
            />
            <input
              value={draft.role}
              onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
              placeholder="Role — e.g. Airport Duty Manager"
              aria-label="Role"
              className="col-span-2 min-h-[44px] rounded-[9px] border px-3 text-[12.5px] outline-none"
              style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
            />
            <DisciplineSelect
              value={draft.discipline}
              onChange={(v) => setDraft((d) => ({ ...d, discipline: v }))}
              ariaLabel="Discipline for the new contact"
            />
            <input
              value={draft.department}
              onChange={(e) => setDraft((d) => ({ ...d, department: e.target.value }))}
              placeholder="Department"
              aria-label="Department"
              className="min-h-[44px] rounded-[9px] border px-3 text-[12.5px] outline-none"
              style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
            />
            <input
              value={draft.location}
              onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
              placeholder="Location"
              aria-label="Location"
              className="min-h-[44px] rounded-[9px] border px-3 text-[12.5px] outline-none"
              style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
            />
            <SiteSelect
              value={draft.site}
              onChange={(v) => setDraft((d) => ({ ...d, site: v }))}
              ariaLabel="Site for the new contact"
            />
          </div>
          <Btn
            variant="primary"
            onClick={submit}
            disabled={!canAdd}
            className="mt-[10px] w-full justify-center"
          >
            <IconPlus width={13} height={13} />
            Add contact
          </Btn>
        </Field>
      </Panel>

      <div className="mb-3 flex flex-wrap gap-[8px]">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, role, department…"
          aria-label="Search the directory"
          className="min-h-[44px] min-w-[180px] flex-1 rounded-[9px] border px-3 text-[12.5px] outline-none"
          style={{ background: "var(--panel)", borderColor: "var(--line-2)" }}
        />
        <div className="min-w-[160px]">
          <SiteSelect
            value={siteFilter}
            onChange={setSiteFilter}
            includeAll
            ariaLabel="Filter by site"
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <Empty>
          {contacts.length === 0
            ? "No contacts yet. Add the first one above."
            : "Nothing matches that search."}
        </Empty>
      ) : (
        groups.map(([site, people]) => {
          const e = entityOf(site);
          return (
            <div key={site} className="mb-4">
              <div className="mb-[6px] flex items-center gap-[7px]">
                <b className="font-display text-[11px] font-semibold" style={{ color: "var(--ink-3)" }}>
                  {e.kind === "head-office" ? "CORPORATE" : e.short}
                </b>
                <Pill>{people.length}</Pill>
              </div>
              {people.map((c) => {
                const open = openId === c.id;
                return (
                  <Panel key={c.id} className="mb-[8px]">
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : c.id)}
                      className="flex w-full items-start justify-between gap-3 text-left"
                    >
                      <div className="min-w-0">
                        <b className="font-display text-[13px] font-semibold">
                          {c.name} {c.surname}
                        </b>
                        {(c.role || c.discipline) && (
                          <p className="mt-[2px] text-[11px]" style={{ color: "var(--ink-3)" }}>
                            {[c.role, c.discipline].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-[10.5px]" style={{ color: "var(--ink-4)" }}>
                        {open ? "Close" : "Edit"}
                      </span>
                    </button>

                    {open && (
                      <div className="mt-[10px] border-t pt-[10px]" style={{ borderColor: "var(--line-2)" }}>
                        <div className="grid grid-cols-2 gap-[8px]">
                          <input
                            value={c.name}
                            onChange={(e) => updateContact(c.id, { name: e.target.value })}
                            aria-label="Name"
                            className="min-h-[44px] rounded-[9px] border px-3 text-[12.5px] outline-none"
                            style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
                          />
                          <input
                            value={c.surname}
                            onChange={(e) => updateContact(c.id, { surname: e.target.value })}
                            aria-label="Surname"
                            className="min-h-[44px] rounded-[9px] border px-3 text-[12.5px] outline-none"
                            style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
                          />
                          <input
                            value={c.role}
                            onChange={(e) => updateContact(c.id, { role: e.target.value })}
                            placeholder="Role"
                            aria-label="Role"
                            className="col-span-2 min-h-[44px] rounded-[9px] border px-3 text-[12.5px] outline-none"
                            style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
                          />
                          <DisciplineSelect
                            value={c.discipline}
                            onChange={(v) => updateContact(c.id, { discipline: v })}
                            ariaLabel="Discipline"
                          />
                          <input
                            value={c.department}
                            onChange={(e) => updateContact(c.id, { department: e.target.value })}
                            placeholder="Department"
                            aria-label="Department"
                            className="min-h-[44px] rounded-[9px] border px-3 text-[12.5px] outline-none"
                            style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
                          />
                          <input
                            value={c.location}
                            onChange={(e) => updateContact(c.id, { location: e.target.value })}
                            placeholder="Location"
                            aria-label="Location"
                            className="min-h-[44px] rounded-[9px] border px-3 text-[12.5px] outline-none"
                            style={{ background: "var(--sunken)", borderColor: "var(--line-2)" }}
                          />
                          <SiteSelect
                            value={c.site}
                            onChange={(v) => updateContact(c.id, { site: v })}
                            ariaLabel="Site"
                          />
                        </div>
                        <div className="mt-[10px] flex justify-end">
                          <Btn variant="danger" onClick={() => { removeContact(c.id); setOpenId(null); }}>
                            <IconX width={13} height={13} />
                            Remove
                          </Btn>
                        </div>
                      </div>
                    )}
                  </Panel>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}
