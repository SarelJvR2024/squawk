import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* A reset reaches every device, not just the one it was pressed on.
 *
 *  "Start again" only ever cleared the tablet it was pressed on — the shared
 *  record kept whatever it had, and the next sync (on this device or any
 *  other, automatic or by tapping Sync) pulled the old answers straight back
 *  in. Found live, the night before the real O.R. Tambo audit: a truncate of
 *  the shared Supabase table held for seconds before a second, never-reset
 *  tablet synced and pushed its own old answers right back in.
 *
 *  The fix pushes the reset itself, as a row every device already polls for,
 *  and checks it before anything else is applied on every sync — manual
 *  (the Sync button) and automatic alike, since both call the same
 *  function. See lib/shared.ts's pushReset and the boundary check inside
 *  useSharedRecord's sync().
 *
 *  Source-read, like reset.test.mjs and checkscreen.test.mjs. */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, "..", "src", ...p), "utf8");

const shared = src("lib", "shared.ts");
const panel = src("components", "ResetPanel.tsx");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
};

/* ---- the row a reset travels as ------------------------------------------ */

check(
  "reset is a row kind every device already polls for, not a new endpoint",
  /kind: "response" \| "verification" \| "finding" \| "hazard" \| "feedback" \| "capture" \| "adhoc" \| "reset"/.test(
    shared
  )
);

check(
  "pushReset is exported, and pushes nothing without a passphrase",
  /export async function pushReset\(entity: string, visit: string\): Promise<void> \{/.test(
    shared
  ) && /if \(!passphrase\) return;/.test(shared)
);

check(
  "the row it pushes is kind reset, scoped to the entity and visit asked for",
  /const row: SharedRow = \{ kind: "reset", id: "reset", updated_at: Date\.now\(\), payload: \{ at: Date\.now\(\) \} \};/.test(
    shared
  ) &&
    /body: JSON\.stringify\(\{ passphrase, entity, visit, since: null, records: \[row\] \}\)/.test(
      shared
    )
);

check(
  "a failed push is swallowed, not surfaced — the local wipe already happened",
  /export async function pushReset[\s\S]{0,700}catch \{/.test(shared)
);

/* ---- the boundary, checked before anything else is applied --------------- */

check(
  "the boundary is kept per entity+visit, separately from the pull cursor",
  /const resetBoundaryKey = \(entity: string, visit: string\) => `squawk-reset-boundary:\$\{entity\}\/\$\{visit\}`;/.test(
    shared
  )
);

check(
  "the boundary is the SERVER's clock on the reset row, never a device's own",
  /const resetRows = rows\.filter\(\(r\) => r\.kind === "reset"\);[\s\S]{0,400}Date\.parse\(r\.server_at \?\? ""\) \|\| 0/.test(
    shared
  )
);

check(
  "crossing the boundary runs the exact same wipe the Reset panel's own button does",
  /if \(boundary > storedBoundary\) \{[\s\S]{0,200}resetVisit\(\);[\s\S]{0,200}local\.set\(resetBoundaryKey\(entity, visit\), String\(boundary\)\);/.test(
    shared
  ),
  "the network pressing the same button a finger does is the whole point"
);

check(
  "resetVisit is read from the store so the boundary check can call it",
  /const resetVisit = useStore\(\(s\) => s\.resetVisit\);/.test(shared) &&
    /\[available, hydrated, entity, visit, importBundle, resetVisit\]/.test(shared)
);

check(
  "nothing at or before the boundary is ever applied, reset rows themselves aside",
  /const applicable = rows\.filter\(\s*\n\s*\(r\) => r\.kind !== "reset" && \(Date\.parse\(r\.server_at \?\? ""\) \|\| 0\) > boundary\s*\n\s*\);/.test(
    shared
  ),
  "a device offline across the reset must not un-wipe itself with its own first pull"
);

check(
  "the bundle this device imports is built only from what cleared the boundary",
  /if \(applicable\.length\) \{[\s\S]{0,300}bundleFromRows\(entity, visit, applicable\)/.test(shared)
);

/* ---- manual Sync and the automatic poll are the same code path ----------- */

check(
  "syncNow (the Sync button) and the interval/online poll both call the one sync()",
  /syncNow: \(\) => void sync\(\),/.test(shared) &&
    /const t = setInterval\(\(\) => void sync\(\), EVERY_MS\);/.test(shared),
  "one fix in sync() covers a tap on Sync and the automatic poll alike"
);

/* ---- the Reset panel actually broadcasts it ------------------------------ */

check(
  "ResetPanel imports pushReset from the shared-record module",
  /import \{ pushReset \} from "@\/lib\/shared";/.test(panel)
);

check(
  "go() pushes the reset after the local wipe, for either scope",
  /const go = \(\) => \{[\s\S]{0,900}void pushReset\(entity\.code, visitId\);/.test(panel)
);

console.log(
  failures === 0 ? "\nRESET SYNC OK" : `\n${failures} FAILURE${failures > 1 ? "S" : ""}`
);
process.exit(failures === 0 ? 0 : 1);
