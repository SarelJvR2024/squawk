import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* THE LINK BETWEEN FINDINGS AND INSPECTION. Sarel, after raising two
 *  findings from the Raise tab: "they're not reflecting in the inspections.
 *  Make sure that the link is maintained between asset systems and
 *  disciplines on findings and inspections, so that I can jump between the
 *  two tabs."
 *
 *  THE BUG: a finding raised through the Findings tab's own "Raise a
 *  finding" sheet very often carries no `checkId` at all — discipline and
 *  asset system are the only fields that sheet requires, by design (see
 *  RaiseFindingSheet.tsx's own header). The Inspection screen's per-check
 *  findings count (`findingsByCheck`, ex-`findingsHere`) only ever counted
 *  findings that DID carry a checkId, so a finding raised without one was
 *  invisible on Inspection no matter which asset system it was filed under
 *  — captured on one tab, silently absent from the other.
 *
 *  THE FIX, two parts: (1) a system's own findings count on Inspection now
 *  includes checkless findings too, scoped by the same discipline/location
 *  filter the checks and walk items already use, so it never disagrees with
 *  what else is on screen; (2) a jump link from that count back to the
 *  Findings tab, opened directly on the same discipline+system, using the
 *  exact `discipline|system` key Findings already addresses a system by.
 *
 *  Source-read, same pattern as field-search-prominence.test.mjs. */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const field = fs.readFileSync(path.join(root, "src", "app", "(app)", "field", "page.tsx"), "utf8");
const findings = fs.readFileSync(path.join(root, "src", "app", "(app)", "findings", "page.tsx"), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ---- Inspection: checkless findings now counted, not silently dropped --- */

check(
  "a per-system map of CHECKLESS findings exists (checkId null), not just the per-check one",
  /const checklessFindingsBySystem = useMemo/.test(field) && /if \(f\.checkId\) continue;/.test(field)
);

check(
  "checkless findings are scoped by the SAME filter axis (groupBy/activeFilter) the checks and walk items already use",
  /const own = \(groupBy === "area" \? f\.area : f\.discipline\)\?\.trim\(\);/.test(field)
);

check(
  "a system's findingsTotal is check-linked findings PLUS checkless ones — neither bucket alone",
  /const onChecks = b\.checks\.reduce\(\(n, c\) => n \+ \(findingsByCheck\.get\(c\.id\)\?\.length \?\? 0\), 0\);/.test(
    field
  ) && /findingsTotal: onChecks \+ checkless\.length,/.test(field)
);

check(
  "findingsByCheck holds the Finding objects themselves, not just a count, so their notes and photos can be read straight off it",
  /const findingsByCheck = useMemo\(\(\) => \{\s*const m = new Map<string, Finding\[\]>\(\);/.test(field)
);

check(
  "a raised finding's own description and photos render as a sibling of the check row's button, never nested inside it",
  /\{raisedFindings\.length > 0 && \(/.test(field) &&
    /<AttachmentStrip attachments=\{f\.attachments\} thumbSize=\{32\} \/>/.test(field)
);

check(
  "checkless findings filed under an asset system show their own description and photos too, not just the jump link",
  /\{gOpen && g\.checklessFindings\.length > 0 && \(/.test(field)
);

/* ---- issues raised either as a finding or on the walk: shown the same way --- */

check(
  "a walk item promoted to a finding (raiseFindingFromAdhoc) is excluded from the checkless-findings list — it is the same issue the walk item already shows, not a second, evidence-less one",
  /const promotedFindingIds = useMemo\(/.test(field) &&
    /it\.findingId\)\.filter\(\(id\): id is string => !!id\)/.test(field) &&
    /if \(promotedFindingIds\.has\(f\.id\)\) continue;/.test(field)
);

check(
  "a walk item's own photos and voice notes render as a full strip, the same treatment a finding's attachments get, not just a count",
  /it\.attachments\.length > 0 && \(/.test(field) &&
    /<AttachmentStrip attachments=\{it\.attachments\} thumbSize=\{32\} \/>/.test(field)
);

check(
  "the tree memo actually depends on the findings maps, so it recomputes when a finding is raised",
  /\}, \[visible, walkVisible, responses, findingsByCheck, checklessFindingsBySystem\]\);/.test(field)
);

check(
  "the old findingsHere (checkId-only) map is gone, not left behind as dead code beside the new one",
  !/const findingsHere = useMemo/.test(field)
);

/* ---- Inspection: the findings count is visible at a glance, and the jump
   link is wired without nesting an interactive element inside GroupRow's
   own <button> ---------------------------------------------------------- */

const groupRowOpen = field.indexOf("<GroupRow");
const groupRowClose = field.indexOf("</GroupRow>");
const jumpButton = field.indexOf("view in\n                      Findings");

check(
  "GroupRow is found once, in order, so the slices below mean what they say",
  groupRowOpen !== -1 && groupRowClose !== -1 && groupRowOpen < groupRowClose
);

check(
  "a findings Pill renders INSIDE the group header, so the count shows whether the group is open or shut",
  /g\.findingsTotal > 0 && \(\s*<Pill tone="warn">/.test(field.slice(groupRowOpen, groupRowClose))
);

check(
  "the jump control sits AFTER GroupRow closes, never nested inside its own <button> (invalid HTML, and a double-fire on tap)",
  jumpButton !== -1 && jumpButton > groupRowClose
);

check(
  "the jump navigates with router.push, the same mechanism AppShell's own ⌘K jump-to-check already uses",
  /router\.push\(\s*`\/findings\?open=\$\{encodeURIComponent\(/.test(field)
);

check(
  "the jump key is exactly discipline|system — the same key Findings already addresses one by",
  /`\$\{g\.checks\[0\]\?\.discipline \?\? g\.checklessFindings\[0\]\?\.discipline \?\? activeFilter \?\? ""\}\|\$\{g\.sys\}`/.test(
    field
  )
);

/* ---- Findings: honours the ?open= link on arrival ------------------------ */

check(
  "Findings reads the open= param with useSearchParams, the same hook Checks' own ?check= deep link uses",
  /import \{ useSearchParams \} from "next\/navigation"/.test(findings) &&
    /const openParam = params\.get\("open"\);/.test(findings)
);

check(
  "the link seeds activeKey AND expands that discipline — opening to the right system, not just scrolling near it",
  /setActiveKey\(openParam\);/.test(findings) && /setExpanded\(\[openParam\.split\("\|"\)\[0\]\]\);/.test(findings)
);

check(
  "the link is honoured once, not on every render — an auditor who navigates away afterwards is not dragged back to it",
  /const \[openedFrom, setOpenedFrom\] = useState<string \| null>\(null\);/.test(findings) &&
    /if \(openParam && openParam !== openedFrom\) \{/.test(findings)
);

check(
  "the page is wrapped in Suspense, which useSearchParams requires — the exact shape capture/page.tsx already uses",
  /function FindingsPageInner\(\)/.test(findings) &&
    /<Suspense fallback=\{<div className="p-6 text-\[12px\]">Loading…<\/div>\}>\s*<FindingsPageInner \/>/.test(
      findings
    )
);

console.log(failures === 0 ? "\nFINDINGS/INSPECTION LINK OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`);
process.exit(failures === 0 ? 0 : 1);
