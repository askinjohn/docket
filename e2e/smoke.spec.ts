import { expect, test } from '@playwright/test';

const CORE = process.env['LM_CORE_URL'] ?? 'http://127.0.0.1:8787';
const WEB = process.env['LM_WEB_URL'] ?? 'http://127.0.0.1:4300';

test.describe('Docket smoke', () => {
  test('core health responds on localhost', async ({ request }) => {
    const res = await request.get(`${CORE}/health`);
    // Core may be offline in CI — soft-skip
    if (!res.ok()) {
      test.skip(true, 'Core not running — start with npm run core:dev');
      return;
    }
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe('docket-core');
  });

  test('web shell renders Docket chrome', async ({ page }) => {
    try {
      await page.goto(WEB, { waitUntil: 'domcontentloaded', timeout: 8_000 });
    } catch {
      test.skip(true, 'Web UI not running — start with npm run web:start');
      return;
    }
    await expect(page.getByText('Docket').first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: 'Inbox' })).toBeVisible();
  });
});
