import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 15_000,
    hookTimeout: 15_000,
    isolate: true,
    fileParallelism: false,
    ...(process.env.TURAS_PARTNERS_OWNED === "1" ? { setupFiles: ["tests/fixtures/partners/rate-reset.ts"] } : {}),
    ...(process.env.TURAS_GAPS_OWNED === "1" ? { setupFiles: ["tests/fixtures/gaps/rate-reset.ts"] } : {}),
    ...(process.env.TURAS_OWNED_REGRESSION_SETUP === "1" ? { setupFiles: ["tests/fixtures/regression-rate-reset.ts"] } : {}),
    ...(process.env.TURAS_GAPS_REGRESSION_KIND ? { setupFiles: ["tests/fixtures/gaps/regression-rate-reset.ts"] } : {}),
    exclude: [...configDefaults.exclude,"local-artifacts/**"],
  },
});
