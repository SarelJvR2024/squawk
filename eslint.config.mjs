import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Sibling worktrees for other in-flight branches live under here and
    // are not part of this checkout's own code — without this, `npm run
    // lint` recurses into all of them and the real signal for main gets
    // buried in noise from unrelated branches.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
