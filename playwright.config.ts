import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  use: {
    baseURL: process.env['LM_WEB_URL'] ?? 'http://127.0.0.1:4300',
    trace: 'on-first-retry',
  },
  reporter: [['list']],
});
