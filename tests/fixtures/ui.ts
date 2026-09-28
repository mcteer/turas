import type { Page } from "@playwright/test";

export type DemoAccount = "mcteer" | "panel" | "partner";

const accountVariables: Record<DemoAccount, readonly [string, string]> = {
  mcteer: ["TURAS_DEMO_USERNAME", "TURAS_DEMO_PASSWORD"],
  panel: ["PANEL_USERNAME", "PANEL_PASSWORD"],
  partner: ["PARTNER_USERNAME", "PARTNER_PASSWORD"],
};

export function testCredentials(account: DemoAccount): { username: string; password: string } {
  const [usernameKey, passwordKey] = accountVariables[account];
  const username = process.env[usernameKey];
  const password = process.env[passwordKey];
  if (!username || !password || username !== account) {
    throw new Error(`Missing local test credentials for ${account}`);
  }
  return { username, password };
}

export async function signIn(page: Page, account: DemoAccount): Promise<void> {
  const { username, password } = testCredentials(account);
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname === "/s");
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/login", { waitUntil: "load", timeout: 15_000 });
}

export async function sanitizedScreenshot(page: Page, path: string): Promise<void> {
  await page.locator("input[type=password]").evaluateAll((inputs) => {
    for (const input of inputs) (input as HTMLInputElement).value = "";
  });
  await page.screenshot({ path });
}
