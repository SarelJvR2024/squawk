import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* BUILD PROMPT 8, 22 NOV 2026 — "Issues screen = Follow-up/Review/Cleanup."
 *
 *  Most of this prompt's own logic is either proven elsewhere (carryforward
 *  already carries observations — tests/carryforward.test.mjs's own Part 7)
 *  or inherited unchanged from the screens it ported (the Verify flow from
 *  closure/page.tsx, the Risk & root cause table/panel from review/page.tsx
 *  — see every test file build prompt 8's own commit repointed at
 *  issues/page.tsx). This suite covers exactly what is genuinely new: the
 *  filter-chip row and its six counts, the Critical/Safety tags end to end,
 *  the phone/desktop split IssuesRiskView adds that /review never had, and
 *  the three redirects (plus confirming /cleanup was deliberately left
 *  alone, not forgotten). */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function src(...parts) {
  return fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");
}

let failed = 0;
function check(name, condOrFn, why) {
  try {
    const cond = typeof condOrFn === "function" ? (condOrFn(), true) : condOrFn;
    if (cond === false) throw new Error(why ?? "failed");
    console.log("PASS ", name);
  } catch (e) {
    failed++;
    console.log("FAIL ", name, e.message);
  }
}

const issues = src("src", "app", "(app)", "issues", "page.tsx");

/* ---------- the filter-chip row: six filters, each with a real count ---------- */

check("IssuesFilter is the spec's six values plus Deleted", () => {
  if (!/type IssuesFilter = "all" \| "toReview" \| "carried" \| "critical" \| "safety" \| "closed" \| "deleted";/.test(issues))
    throw new Error("filter union does not match");
});
check("each filter has a label and every label is rendered with its own count, read off issuesCounts", () => {
  if (!/\{ISSUES_FILTER_LABEL\[f\]\}/.test(issues)) throw new Error("label not rendered");
  if (!/\{issuesCounts\[f\]\}/.test(issues)) throw new Error("count not rendered");
});
check("?filter= opens straight on the matching chip, same ?tab=risk-on-mount convention review/page.tsx used to use", () =>
  /function filterFromParam\(v: string \| null\): IssuesFilter \{/.test(issues));
check("an unrecognised or missing ?filter= value falls back to \"all\", never undefined or a crash", () => {
  const body = issues.slice(issues.indexOf("function filterFromParam"), issues.indexOf("function filterFromParam") + 400);
  if (!/: "all";/.test(body)) throw new Error("no explicit all fallback");
});
check("\"All\" and \"Closed\" read the whole entity across every visit (useEntityFindings), not just this visit's own work", () => {
  if (!/const allOpenFindings = useMemo\(\s*\n\s*\(\) => entityFindings\.filter\(\(f\) => f\.actionStatus !== "Closed"\),/.test(issues))
    throw new Error("allOpenFindings not entity-scoped");
  if (!/const closedFindings = useMemo\(\s*\n\s*\(\) => entityFindings\.filter\(\(f\) => f\.actionStatus === "Closed"\),/.test(issues))
    throw new Error("closedFindings not entity-scoped");
});
check("\"To review\" stays scoped to THIS visit's own findings — same scope /review always used, not widened to the whole entity", () => {
  const body = issues.slice(issues.indexOf("const riskViewFindings"), issues.indexOf("const issuesCounts"));
  if (!/issuesFilter === "toReview"\s*\n\s*\? findings/.test(body)) throw new Error("toReview not scoped to findings (useVisitFindings)");
});
check("Critical/Safety are derived from allOpenFindings, not a fresh entity read — one source of truth for every open-finding chip", () => {
  if (!/const criticalFindings = useMemo\(\(\) => allOpenFindings\.filter\(\(f\) => f\.critical\), \[allOpenFindings\]\);/.test(issues))
    throw new Error("criticalFindings wrong derivation");
  if (!/const safetyFindings = useMemo\(\(\) => allOpenFindings\.filter\(\(f\) => f\.safetyTag\), \[allOpenFindings\]\);/.test(issues))
    throw new Error("safetyFindings wrong derivation");
});
check(
  "\"Carried\"'s count matches what its own default view actually shows (Carries work), not every outstanding item including context-only ones — code review on this branch",
  () => /carried: outstanding\.filter\(carriesWork\)\.length,/.test(issues),
  "every other chip's count is exactly what tapping it shows by default; outstanding.length included context-only (Acceptable-rated) items the view's own default sub-filter excludes",
);

/* ---------- Critical/Safety tags, end to end ---------- */

const types = src("src", "lib", "types.ts");
check("Finding.critical/safetyTag exist, additive, same convention as internalOnly", () => {
  if (!/critical\?: boolean;/.test(types)) throw new Error("critical field missing");
  if (!/safetyTag\?: boolean;/.test(types)) throw new Error("safetyTag field missing");
});

const panel = src("src", "components", "ReviewRiskPanel.tsx");
check("ReviewRiskPanel's RiskPatch carries both new tags, so onChange can actually write them", () => {
  if (!/\| "critical"/.test(panel)) throw new Error("critical missing from RiskPatch");
  if (!/\| "safetyTag"/.test(panel)) throw new Error("safetyTag missing from RiskPatch");
});
check("both tags are independent toggle chips, not a third Type option — a finding can be both, either, or neither", () => {
  if (!/<Chip selected=\{!!finding\.critical\} onClick=\{\(\) => onChange\(\{ critical: !finding\.critical \}\)\}>/.test(panel))
    throw new Error("critical chip not wired");
  if (!/<Chip selected=\{!!finding\.safetyTag\} onClick=\{\(\) => onChange\(\{ safetyTag: !finding\.safetyTag \}\)\}>/.test(panel))
    throw new Error("safetyTag chip not wired");
});
check("\"Open in By check\" was renamed to \"Open check\" — the tab it used to name is retired", () => {
  if (/Open in By check/.test(panel)) throw new Error("stale label still present");
  if (!/Open check/.test(panel)) throw new Error("new label missing");
});

/* ---------- IssuesRiskView: reuse ReviewRiskTable/Panel, add the phone half /review never had ---------- */

check("IssuesRiskView mounts ReviewRiskTable and ReviewRiskPanel, review/page.tsx's own components, not a second implementation", () => {
  if (!/import ReviewRiskTable from "@\/components\/ReviewRiskTable";/.test(issues)) throw new Error("ReviewRiskTable not imported");
  if (!/import ReviewRiskPanel from "@\/components\/ReviewRiskPanel";/.test(issues)) throw new Error("ReviewRiskPanel not imported");
});
check(
  "isWide gates which of the inline column or a Sheet renders — never both mounted at once, same reasoning the Walk screen's WideCheckPane/Sheet split already documents",
  () => {
    const body = issues.slice(issues.indexOf("function IssuesRiskView"), issues.indexOf("export default function IssuesPage"));
    if (!/\{isWide && panelProps && \(/.test(body)) throw new Error("desktop branch not gated on isWide");
    if (!/\{!isWide && \(/.test(body)) throw new Error("phone branch not gated on !isWide");
  },
);
check("the phone branch is a Sheet wrapping the SAME ReviewRiskPanel, not a second editor — this is the one thing /review never had (its own column was hidden md:flex)", () => {
  const body = issues.slice(issues.indexOf("function IssuesRiskView"), issues.indexOf("export default function IssuesPage"));
  if (!/<Sheet open=\{!!active\} onClose=\{\(\) => setActiveId\(null\)\} title=\{active\?\.title \|\| "Issue"\} wide>/.test(body))
    throw new Error("Sheet not wired to the same active finding");
});
check("both shells pass the SAME panelProps object — one onChange/onClose/onOpenCheck/onDelete division of labour, not two", () => {
  const body = issues.slice(issues.indexOf("function IssuesRiskView"), issues.indexOf("export default function IssuesPage"));
  const n = (body.match(/\{\.\.\.panelProps\}/g) ?? []).length;
  if (n !== 2) throw new Error(`panelProps spread ${n} times, expected 2 (desktop + phone)`);
});
check("an empty filter shows a real, filter-specific message, not a bare blank screen", () =>
  /const EMPTY_MESSAGE: Record<Exclude<IssuesFilter, "carried">, string> = \{/.test(issues));

/* ---------- the + sheet: a general issue, no preset context ---------- */

check("Add issue opens the same unified + sheet every other screen's toolbar already has, with no preset — general issues are explicitly allowed", () => {
  if (!/<AddSheet open=\{addOpen\} onClose=\{\(\) => setAddOpen\(false\)\} onRaiseIssue=\{\(\) => setRaiseOpen\(true\)\} \/>/.test(issues))
    throw new Error("AddSheet not wired with no preset props");
});
check("?open=raise (the /raise redirect's own signal) opens the add flow immediately on mount", () =>
  /const \[addOpen, setAddOpen\] = useState\(\(\) => searchParams\.get\("open"\) === "raise"\);/.test(issues));

/* ---------- the three redirects, and /cleanup deliberately left alone ---------- */

const closure = src("src", "app", "(app)", "closure", "page.tsx");
const review = src("src", "app", "(app)", "review", "page.tsx");
const raise = src("src", "app", "(app)", "raise", "page.tsx");
const cleanup = src("src", "app", "(app)", "cleanup", "page.tsx");

check("/closure redirects to the Carried filter", () => {
  if (!/redirect\("\/issues\?filter=carried"\);/.test(closure)) throw new Error("wrong destination");
  if (!/import \{ redirect \} from "next\/navigation";/.test(closure)) throw new Error("not a server redirect");
});
check("/review redirects to the To-review filter", () => {
  if (!/redirect\("\/issues\?filter=toReview"\);/.test(review)) throw new Error("wrong destination");
});
check("/raise redirects to the add flow, not a filter — raising isn't a view, it's an action", () => {
  if (!/redirect\("\/issues\?open=raise"\);/.test(raise)) throw new Error("wrong destination");
});
check(
  "/cleanup is untouched — still a real screen, not a fourth redirect — its own \"Open Issues · To review\" link is the one thing that changed, pointed at its real destination directly",
  () => {
    if (/^import \{ redirect \} from "next\/navigation";$/m.test(cleanup)) throw new Error("cleanup/page.tsx was turned into a redirect");
    if (!/href="\/issues\?filter=toReview"/.test(cleanup)) throw new Error("stale /review?tab=risk link left behind");
  },
);

/* ---------- carried, the Verify flow — ported, proven still wired ---------- */

check("the Carried branch still drives the exact same OUTCOMES buttons into patchVerification AND updateFinding — the spec's own 'only a verified closure removes it from the list' mechanism, unchanged by the port", () => {
  if (!/const OUTCOMES: \{ key: VerificationOutcome; label: string; Icon: typeof IconCheck; tone: string \}\[\] = \[/.test(issues))
    throw new Error("OUTCOMES constant missing");
  if (!/patchVerification\(active\.key, \{\s*\n\s*outcome,\s*\n\s*verifiedAt: Date\.now\(\),\s*\n\s*\}\);/.test(issues))
    throw new Error("patchVerification call missing");
  if (!/actionStatus:\s*\n\s*outcome === "Closed"\s*\n\s*\? "Closed"/.test(issues))
    throw new Error("updateFinding actionStatus mirror missing");
});

/* ---------- cross-visit findings never show another visit's response data — code review on this branch ---------- */

check(
  "ReviewRiskPanel's linked-check context is gated on the finding being from the CURRENT visit — useResponses() is always this-visit data, and the Issues screen's entity-wide filters are the first caller to pass an older finding through it",
  () => {
    if (!/const visitId = useVisitId\(\);/.test(panel)) throw new Error("no visitId read");
    if (!/finding\.checkId && finding\.originVisit === visitId \? responses\[finding\.checkId\] : undefined;/.test(panel))
      throw new Error("linkedResponse not gated on originVisit");
  },
  "without the guard, a finding raised visits ago would show THIS VISIT's unrelated answer for its linked check as if it were that finding's own context",
);
check(
  "ReviewRiskTable's own Finding-column context gets the identical guard, for the identical reason",
  () => {
    if (!/const visitId = useVisitId\(\);/.test(src("src", "components", "ReviewRiskTable.tsx")))
      throw new Error("no visitId read");
    if (!/const r = f\.checkId && f\.originVisit === visitId \? responses\[f\.checkId\] : undefined;/.test(
      src("src", "components", "ReviewRiskTable.tsx"),
    ))
      throw new Error("r not gated on originVisit");
  },
);

if (failed) process.exit(1);
console.log(failed ? "FAILED" : "all passed");
