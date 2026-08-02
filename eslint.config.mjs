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
    "dist/**",
    ".vinext/**",
    "out/**",
    "build/**",
    "db/**",
    "examples/**",
    "worker/**",
    "scripts/**",
    "vite.config.ts",
    "drizzle.config.ts",
    "tests/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
