import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.TURAS_UI_BASE_URL ?? "http://127.0.0.1:3000";
const hostname = new URL(baseURL).hostname;
if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname)) {
  throw new Error("UI tests require a local application origin");
}

export default defineConfig({
  testDir: "./tests/ui",
  testIgnore: process.env.TURAS_UI_LEGACY_ONLY === "1" ?
    ["**/knowledge.spec.ts", "**/research.spec.ts", "**/retrieval.spec.ts", "**/staffing-*.spec.ts", "**/execution-*.spec.ts", "**/report-*.spec.ts", "**/support-*.spec.ts", "**/expansion-*.spec.ts"] : [],
  timeout: 30_000,
  // UI scenarios share the local demo database, including mutable customer grants.
  workers: 1,
  use: { baseURL, screenshot: "off", trace: "off", video: "off" },
  projects: [
    { name: "webkit-desktop-light", use: { ...devices["Desktop Safari"], viewport: { width: process.env.TURAS_EXPANSION_UI_FIXTURE_READY === "1" ? 1280 : 1440, height: process.env.TURAS_EXPANSION_UI_FIXTURE_READY === "1" ? 800 : 900 }, colorScheme: "light" } },
    { name: "webkit-desktop-dark", use: { ...devices["Desktop Safari"], viewport: { width: process.env.TURAS_EXPANSION_UI_FIXTURE_READY === "1" ? 1280 : 1440, height: process.env.TURAS_EXPANSION_UI_FIXTURE_READY === "1" ? 800 : 900 }, colorScheme: "dark" } },
    { name: "webkit-mobile-light", use: { ...devices["Desktop Safari"], viewport: { width: 390, height: 844 }, colorScheme: "light" } },
    { name: "webkit-mobile-dark", use: { ...devices["Desktop Safari"], viewport: { width: 390, height: 844 }, colorScheme: "dark" } },
  ],
  // Feature runners own and supervise their already-started app.
   webServer: process.env.TURAS_EXECUTION_FIXTURE_READY === "1" || process.env.TURAS_REPORT_UI_READY === "1" ||
     process.env.TURAS_SUPPORT_UI_FIXTURE_READY === "1" || process.env.TURAS_EXPANSION_UI_FIXTURE_READY === "1" ? undefined : {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
