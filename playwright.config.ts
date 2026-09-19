import { defineConfig, devices, webkit } from "@playwright/test";
import { dirname, join } from "node:path";

// Next development normalizes browser navigations to localhost. Keep the
// browser origin stable through the login redirect so its host-only session
// cookie remains available after sign-in.
const localUrl = "http://localhost:3100";
const webkitDirectory = dirname(webkit.executablePath());

export default defineConfig({
  testDir: "./tests/ui",
  workers: 1,
  retries: 0,
  timeout: 20_000,
  expect: { timeout: 5_000 },
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? localUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    env: {
      ...process.env,
      TURAS_DEMO_USERNAME: "playwright-owner",
      TURAS_DEMO_PASSWORD: "playwright-password",
      TURAS_SESSION_SECRET: "playwright-session-secret",
    },
    url: localUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{
    name: "webkit",
    use: {
      ...devices["Desktop Safari"],
      // Load Playwright's matching framework directly. The shell launcher on
      // this Mac selected system WebKit and failed before the browser started.
      launchOptions: process.platform === "darwin" ? {
        executablePath: join(webkitDirectory, "Playwright.app/Contents/MacOS/Playwright"),
        env: {
          ...process.env,
          DYLD_FRAMEWORK_PATH: webkitDirectory,
          DYLD_LIBRARY_PATH: webkitDirectory,
        },
      } : {},
    },
  }],
});
