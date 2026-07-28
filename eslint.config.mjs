import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // `const { payload: _payload, ...rest } = row` is the idiomatic way to
      // omit a field; the underscore marks it as intentionally discarded.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated build output — the OpenNext Cloudflare bundle. Linting it
    // reports thousands of problems in code we neither wrote nor can fix.
    ".open-next/**",
    ".wrangler/**",
    "cloudflare-env.d.ts",
    // Third-party GPLv3 engine artifacts staged by scripts/fetch-engine-assets.mjs.
    // Not ours to lint or reformat — and reformatting a GPL artifact in place
    // would blur exactly the boundary NFR-L3 depends on staying crisp.
    "public/engine/**",
  ]),
]);

export default eslintConfig;
