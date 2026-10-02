import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// The checker owns app startup and its disposable database, never a host browser.
export default defineConfig({
  ...base,
  webServer: undefined,
  timeout: 60_000,
  testIgnore: [],
  testMatch: ["workspace-design.spec.ts", "staffing-design.spec.ts", "shell.spec.ts", "chat.spec.ts",
    "legacy-layout.spec.ts", "profiles.spec.ts", "plans-authoring.spec.ts", "knowledge.spec.ts", "research.spec.ts"],
});
