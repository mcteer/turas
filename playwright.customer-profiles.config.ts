import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({ ...base, webServer: undefined, timeout: 60000,
  testIgnore: [], testMatch: ['customer-profile-bugs.spec.ts','profiles.spec.ts','legacy-layout.spec.ts'] });
