/* Resolve what Next resolves, so a suite can import the app's real modules.
 *
 *  Two things Node's own ESM loader does not do and webpack does:
 *
 *    "@/lib/x"     the tsconfig path alias, rooted at src/
 *    "./x.json"    a JSON import with no `with { type: "json" }` attribute
 *
 *  Neither is a behaviour change to the app — it is the same source, resolved
 *  the same way. The alternative was rewriting the app's imports to suit the
 *  test runner, which is the tail wagging the dog, or giving up and asserting
 *  against the source text instead of RUNNING it. Running it is worth a
 *  twenty-line loader. */

import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

export async function resolve(specifier, context, next) {
  let spec = specifier;
  if (spec.startsWith("@/")) spec = pathToFileURL(path.join(src, spec.slice(2))).href;

  /* Extensionless relative imports: try .ts, then .tsx, then leave it alone
     and let Node produce its own error, which is more use than ours. */
  if (/^[./]/.test(spec) && !path.extname(spec)) {
    const base = spec.startsWith("file:") ? fileURLToPath(spec) : spec;
    for (const ext of [".ts", ".tsx"]) {
      try {
        return await next(
          spec.startsWith("file:") ? `${spec}${ext}` : `${base}${ext}`,
          context
        );
      } catch {
        /* not that extension; fall through */
      }
    }
  }

  const result = await next(spec, context);
  if (result.url.endsWith(".json")) {
    return { ...result, importAttributes: { ...result.importAttributes, type: "json" } };
  }
  return result;
}
