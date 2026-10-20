/* THE SHARED FILTER DISCLOSURE (src/components/ui/FilterBar.tsx), and the
 *  three things an audit of it was asked to prove rather than assume:
 *
 *    1. "Show all statuses" — or whichever chip in a group reads "All" —
 *       resets ONLY that group's own axis. Discipline must survive a status
 *       clear, and a status pick must survive a discipline clear. FilterBar
 *       itself cannot get this wrong on its own (`ChipRow` calls exactly
 *       `group.onChange(o.key)`, nothing else — see FilterBar.tsx), so what
 *       this guards is the four screens that WIRE it: a copy-pasted onChange
 *       that quietly called the neighbouring axis's setter would still type-
 *       check and still render, and would only ever be noticed by someone
 *       clearing one filter and watching another one change too.
 *
 *    2. Forms (src/app/(app)/forms/page.tsx) tells "nothing recorded yet"
 *       apart from "nothing survives the filter" — two different facts that
 *       were one message before this pass (both read "No forms recorded
 *       yet.", even with records sitting one tap away behind a filter).
 *
 *    3. Clearing a filter is a read-side operation. Every onChange a
 *       FilterBar group is given in these four screens resolves to a plain
 *       `useState` setter declared in that same file — never a store action
 *       that writes a record (`addFinding`, `commit`, `patch`, and the rest
 *       of src/lib/store.ts's long list of mutators).
 *
 *  Source-read, matching tests/checksfilter.test.mjs and the FilterBar
 *  section of tests/carryforward.test.mjs — FilterBar's own groups are short,
 *  literal arrays and reading them is more reliable here than mounting four
 *  screens to click every chip. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const filterBar = src("components", "ui", "FilterBar.tsx");
const capture = src("app", "(app)", "capture", "page.tsx");
const review = src("app", "(app)", "review", "page.tsx");
const closure = src("app", "(app)", "closure", "page.tsx");
const forms = src("app", "(app)", "forms", "page.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* --------------------------------- Part 1: FilterBar itself never bundles */

check(
  "a chip's onChange is the one thing ChipRow ever calls, with no side door",
  /onClick=\{\(\) => group\.onChange\(o\.key\)\}/.test(filterBar),
  "if this ever reached into a second prop too, every screen below would inherit the bug silently"
);

/* ----------------------- Part 2: the four screens wire it without crossing */

/* Capture and Review each give FilterBar exactly one group (status) —
   discipline lives in its own DisciplineSelect, outside FilterBar entirely,
   so there is no second axis inside the same control for a copy-pasted
   onChange to reach into. That separation is itself the guard; this just
   confirms it is still true. */
for (const [name, page] of [
  ["capture", capture],
  ["review", review],
]) {
  check(
    `${name}'s FilterBar has one group (status), discipline is a separate control`,
    /groups=\{\[\s*\{\s*options: \(/.test(page) &&
      (page.match(/onChange: \(k\) => setFilter\(k as Filter\),/g) ?? []).length === 1 &&
      /<DisciplineSelect/.test(page),
    "a second group here would mean a second axis inside the one control a bundled reset could reach"
  );
}

/* Closure and Forms give FilterBar two groups each — discipline/status, and
   Form/Status — so this is the real test: each group's onChange must name a
   DIFFERENT setter, never the one beside it. */
check(
  "closure's discipline group and status group call different setters",
  /onChange: setDiscipline,/.test(closure) &&
    /onChange: \(k\) => setFilter\(k as Filter\),/.test(closure) &&
    at(closure, "onChange: setDiscipline,") !== -1 &&
    at(closure, "onChange: (k) => setFilter(k as Filter),") !== -1,
  "clearing the status axis must never also clear which discipline is in view"
);
check(
  "forms' Form group and Status group call different setters",
  /onChange: \(k\) => setFilter\(k as FormKind \| "all"\),/.test(forms) &&
    /onChange: \(k\) => setStatus\(k as StatusFilter\),/.test(forms),
  "'Show all statuses' must never also drop back to every form kind"
);

function at(hay, needle) {
  return hay.indexOf(needle);
}

/* Every setter named above is a plain useState setter declared in the same
   file — not a store action, and not shared between two groups under a
   different name. Written out per screen rather than derived, the same way
   checksfilter.test.mjs reads a short literal array directly: four screens
   is few enough that a generic setter-finder would be more code than it
   saves, and less obviously correct on review. */
check(
  "capture's status setter is local UI state",
  /const \[filter, setFilter\] = useState<Filter>\("all"\);/.test(capture)
);
check(
  "review's status setter is local UI state",
  /const \[filter, setFilter\] = useState<Filter>\("all"\);/.test(review)
);
check(
  "closure's discipline AND status setters are both local UI state, not store actions",
  /const \[filter, setFilter\] = useState<Filter>\("all"\);/.test(closure) &&
    /const \[discipline, setDiscipline\] = useState<string>\("all"\);/.test(closure)
);
check(
  "forms' Form AND Status setters are both local UI state, not store actions",
  /const \[filter, setFilter\] = useState<FormKind \| "all">\("all"\);/.test(forms) &&
    /const \[status, setStatus\] = useState<StatusFilter>\("all"\);/.test(forms)
);

/* ---------------------------- Part 3: clearing a filter creates nothing */

/* The positive case above (every onChange resolves to a useState setter) is
   most of this already — a useState setter cannot write to the persisted
   store at all, which a store action could. This is the same fact asked the
   other way round: none of the four screens' FilterBar `groups` blocks
   mentions a store mutator by name. Scoped to the `groups={[` ... `]}`
   block itself (not the whole file, which legitimately calls plenty of
   mutators elsewhere, e.g. Capture's own Save) so a real record-creating
   call anywhere else in the screen cannot produce a false pass here. */
const MUTATORS = [
  "addFinding",
  "addHazard",
  "commit",
  "patch(",
  "patchSystem",
  "setCompliance",
  "addAttachment",
  "removeAttachment",
  "openAudit",
  "addVisit",
];
function groupsBlock(page) {
  const start = page.indexOf("groups={[");
  if (start === -1) return "";
  // balance the brackets rather than guess a line count — these blocks are
  // short (a handful of FilterGroup object literals) so a simple counter is
  // enough and does not depend on formatting staying exactly as it is today.
  let depth = 0;
  for (let i = start; i < page.length; i++) {
    if (page[i] === "[") depth++;
    if (page[i] === "]") {
      depth--;
      if (depth === 0) return page.slice(start, i + 1);
    }
  }
  return page.slice(start);
}
for (const [name, page] of [
  ["capture", capture],
  ["review", review],
  ["closure", closure],
  ["forms", forms],
]) {
  const block = groupsBlock(page);
  const poss = name.endsWith("s") ? `${name}'` : `${name}'s`;
  check(
    `${poss} FilterBar groups block is non-empty (the extraction above actually found it)`,
    block.length > 20,
    "an empty slice would make the next check pass for the wrong reason"
  );
  check(
    `${poss} FilterBar groups block calls no record-mutating store action`,
    MUTATORS.every((m) => !block.includes(m)),
    "clearing a filter must stay a read-side operation"
  );
}

/* --------------------------- Part 4: Forms' two different empty states */

check(
  "an audit with no forms at all says so",
  /rows\.length === 0[\s\S]{0,40}<Empty>[\s\S]{0,60}No forms recorded yet\./.test(forms),
  "this is the case Start one from the tiles above actually answers"
);
check(
  "an audit WITH forms, filtered down to none, says a different thing",
  /Nothing matches this filter\./.test(forms) &&
    at(forms, "Nothing matches this filter.") > at(forms, "No forms recorded yet."),
  "the same string for both hides real records behind what reads as an empty audit"
);
check(
  "the two messages are mutually exclusive branches, not the same block twice",
  /rows\.length === 0 \? \(/.test(forms) && /\) : \(/.test(forms),
  "two unconditional <Empty>s stacked would both show at once instead of choosing"
);
check(
  "clearing the filter from that second empty state resets both axes, not a third partial one",
  /Clear it to see every record/.test(forms) &&
    /setFilter\("all"\);\s*\n\s*setStatus\("all"\);/.test(forms)
);

console.log(failures === 0 ? "\nFILTER BAR OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exitCode = failures ? 1 : 0;
