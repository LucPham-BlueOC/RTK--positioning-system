import { expect, test } from '@playwright/test';
import { CORS_MOCK_PORT, CORS_NO_EPHEMERIS_PORT } from '../playwright.config';

const at = (port: number, path: string) => `http://localhost:${port}${path}`;

test('the /cors page shows connection, station, per-satellite error and a quick test', async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    geolocation: { latitude: 10.7672, longitude: 106.6844, accuracy: 5 },
    permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  await page.goto(at(CORS_MOCK_PORT, '/cors'));

  await expect(page.getByText('Đã kết nối (mock)')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Trạm 2001')).toBeVisible();
  await expect(page.getByText('MOCK-RX (1.0)')).toBeVisible();

  const chart = page.locator('section', { hasText: 'Sai số trạm theo vệ tinh' });
  for (const prefix of ['G', 'E', 'C']) {
    await expect(
      chart.locator('td.font-mono', { hasText: new RegExp(`^${prefix}\\d{2}$`) }).first(),
    ).toBeVisible({
      timeout: 15_000,
    });
  }
  await expect(chart.locator('.recharts-line').first()).toBeVisible();

  await page.getByRole('button', { name: 'Đo 10 giây' }).click();
  const quick = page.locator('section', { hasText: 'Đo thử máy này' });
  // 0.001° of latitude north of the station is about 110.6 m.
  await expect(quick.getByText('Cách trạm')).toBeVisible({ timeout: 10_000 });
  await expect(quick).toContainText('110,');
  await ctx.close();
});

test('a station without ephemeris says why no error is computed', async ({ page }) => {
  await page.goto(at(CORS_NO_EPHEMERIS_PORT, '/cors'));
  await expect(page.getByText('Đã kết nối (mock)')).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText('Trạm không phát quỹ đạo vệ tinh, không tính được sai số.').first(),
  ).toBeVisible({ timeout: 15_000 });
});

test('without CORS configured the page explains the setup', async ({ page }) => {
  await page.goto('/cors');
  await expect(page.getByText('Module CORS đang tắt')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Về màn chính' }).click();
  await expect(page.getByRole('button', { name: 'Tạo phòng mới' })).toBeVisible();
});

test('the room screen does not change when CORS is on', async ({ page }) => {
  await page.goto(at(CORS_MOCK_PORT, '/'));
  await page.getByLabel('Tên máy').fill('Máy tính');
  await page.getByRole('radio', { name: /Chỉ xem/ }).click();
  await page.getByRole('button', { name: 'Tạo phòng mới' }).click();
  await expect(page.getByTestId('room-code')).toBeVisible();
  await page.waitForTimeout(2000);
  await expect(page.locator('body')).not.toContainText('CORS');
});
