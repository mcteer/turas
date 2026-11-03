import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base, webServer: undefined, testIgnore: [], testMatch: ['mobile-layout.spec.ts'], timeout: 180_000,
  projects: [...['light', 'dark'].map(colorScheme => ({
    name: `iphone-webkit-${colorScheme}`,
    use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit' as const, colorScheme: colorScheme as 'light' | 'dark' },
  })), ...['light', 'dark'].map(colorScheme => ({
    name: `desktop-webkit-${colorScheme}`,
    use: { ...devices['Desktop Safari'], colorScheme: colorScheme as 'light' | 'dark' },
  }))],
});
