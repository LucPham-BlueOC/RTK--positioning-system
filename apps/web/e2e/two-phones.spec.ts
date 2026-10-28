import { fromEnu } from '@rtk/shared';
import {
  devices,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

const A = { latitude: 21.0285, longitude: 105.8048 };
const b = fromEnu({ east: 20, north: 0 }, { lat: A.latitude, lon: A.longitude });
const B = { latitude: b.lat, longitude: b.lon };

type Position = { latitude: number; longitude: number };

const phones = new Map<BrowserContext, Position>();
let ticker: ReturnType<typeof setInterval> | undefined;
let tick = 0;

/**
 * Emulated geolocation fires once per change, so nudge every phone's position
 * by a negligible amount each second to mimic a 1 Hz GPS.
 */
function startTicker() {
  ticker ??= setInterval(() => {
    const jitter = ++tick % 2 ? 1e-9 : 0;
    for (const [ctx, at] of phones) {
      ctx.setGeolocation({ ...at, latitude: at.latitude + jitter, accuracy: 4 }).catch(() => {});
    }
  }, 1000);
}

async function phone(browser: Browser, at: Position) {
  const ctx = await browser.newContext({
    ...devices['Pixel 7'],
    baseURL: test.info().project.use.baseURL,
    geolocation: { ...at, accuracy: 4 },
    permissions: ['geolocation'],
  });
  phones.set(ctx, at);
  startTicker();
  return ctx.newPage();
}

test.afterEach(async () => {
  clearInterval(ticker);
  ticker = undefined;
  const all = [...phones.keys()];
  phones.clear();
  await Promise.all(all.map((c) => c.close()));
});

const metres = async (page: Page, testId: string) =>
  Number((await page.getByTestId(testId).innerText()).replace(/[^\d,]/g, '').replace(',', '.'));

test('two phones pair by code, see a 20 m distance, run a static session, compare and export', async ({
  browser,
}) => {
  const pa = await phone(browser, A);
  const pb = await phone(browser, B);

  await pa.goto('/');
  await pa.getByRole('button', { name: 'Tạo phòng mới' }).click();
  const code = (await pa.getByTestId('room-code').innerText()).trim();
  expect(code).toMatch(/^[A-Z2-9]{4}$/);
  await expect(pa).toHaveURL(new RegExp(`/r/${code}$`));

  // Second phone opens the QR link.
  await pb.goto(`/r/${code}`);
  await expect(pb.getByLabel('Mã phòng')).toHaveValue(code);
  await pb.getByLabel('Tên máy').fill('Máy B');
  await pb.getByRole('button', { name: 'Vào', exact: true }).click();

  for (const p of [pa, pb]) {
    await expect(p.getByTestId('device-0')).toContainText('Có tín hiệu', { timeout: 15_000 });
    await expect(p.getByTestId('device-1')).toContainText('Có tín hiệu', { timeout: 15_000 });
    await expect.poll(() => metres(p, 'live-distance'), { timeout: 15_000 }).toBeCloseTo(20, 1);
  }
  await expect(pa.getByTestId('live-distance').locator('..')).toContainText('± 5,66 m');

  // Tape distance entered on B shows on A.
  await pb.getByRole('tab', { name: 'So sánh' }).click();
  await pb.getByLabel('Khoảng cách thật, mét').fill('20,00');
  await pb.getByRole('button', { name: 'Lưu' }).click();
  await pa.getByRole('tab', { name: 'So sánh' }).click();
  await expect(pa.getByTestId('true-distance')).toHaveText('20,00 m');
  await expect(pa.getByTestId('error-stats')).toContainText('RMSE', { timeout: 10_000 });

  // Static session started on A runs on both phones.
  await pa.getByRole('tab', { name: 'Đo tĩnh' }).click();
  await pa.getByLabel('Thời lượng đo').selectOption('60');
  await pa.getByRole('button', { name: 'Bắt đầu đo' }).click();
  await pb.getByRole('tab', { name: 'Đo tĩnh' }).click();
  await expect(pb.getByTestId('static-countdown')).toBeVisible();
  await pa.waitForTimeout(8_000); // past the 3 s warm-up so samples count
  await pa.getByRole('button', { name: 'Dừng' }).click();
  await expect.poll(() => metres(pa, 'static-distance'), { timeout: 10_000 }).toBeCloseTo(20, 1);

  // CSV for the selected session parses and agrees with the screen.
  const dl = pa.waitForEvent('download');
  await pa.getByRole('link', { name: 'CSV cặp khoảng cách' }).click();
  const csv = await (await (await dl).createReadStream()).toArray();
  const [header, ...rows] = Buffer.concat(csv).toString().trim().split('\n');
  const cols = header!.split(',');
  expect(rows.length).toBeGreaterThan(0);
  const first = rows[0]!.split(',');
  expect(Number(first[cols.indexOf('distance_m')])).toBeCloseTo(20, 1);
  expect(Number(first[cols.indexOf('true_distance_m')])).toBe(20);
});

test('a laptop watches while two phones measure', async ({ browser }) => {
  const laptopCtx = await browser.newContext({
    ...devices['Desktop Chrome'],
    baseURL: test.info().project.use.baseURL,
  });
  const laptop = await laptopCtx.newPage();
  await laptop.goto('/');
  // No touch screen: watch-only is preselected.
  await expect(laptop.getByRole('radio', { name: /Chỉ xem/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await laptop.getByRole('button', { name: 'Tạo phòng mới' }).click();
  const code = (await laptop.getByTestId('room-code').innerText()).trim();
  await expect(laptop.getByAltText(`Mã QR vào phòng ${code}`)).toBeVisible();

  const [pa, pb] = [await phone(browser, A), await phone(browser, B)];
  for (const [p, name] of [
    [pa, 'Máy A'],
    [pb, 'Máy B'],
  ] as const) {
    await p.goto(`/r/${code}`);
    await expect(p.getByRole('radio', { name: /Máy đo/ })).toHaveAttribute('aria-checked', 'true');
    await p.getByLabel('Tên máy').fill(name);
    await p.getByRole('button', { name: 'Vào', exact: true }).click();
  }

  await expect(laptop.getByTestId('device-0')).toContainText('Máy A');
  await expect(laptop.getByTestId('device-1')).toContainText('Máy B');
  await expect.poll(() => metres(laptop, 'live-distance'), { timeout: 15_000 }).toBeCloseTo(20, 1);
  await expect(pa.getByText('1 máy đang xem')).toBeVisible();
  // Phones get no Kick button; the laptop does.
  await expect(pa.getByRole('button', { name: 'Kick' })).toHaveCount(0);

  // The laptop kicks Máy B straight away; a third phone takes the freed slot.
  await laptop.getByTestId('device-1').getByRole('button', { name: 'Kick' }).click();
  await expect(pb.getByText('Máy này đã bị kick khỏi phòng.')).toBeVisible();
  await expect(pb.getByRole('button', { name: 'Tạo phòng mới' })).toBeVisible();
  await expect(laptop.getByTestId('device-1')).toHaveCount(0);

  const pc = await phone(browser, B);
  await pc.goto(`/r/${code}`);
  await pc.getByLabel('Tên máy').fill('Máy C');
  await pc.getByRole('button', { name: 'Vào', exact: true }).click();
  await expect(laptop.getByTestId('device-1')).toContainText('Máy C');
  await laptopCtx.close();
});

test('a third phone is refused', async ({ browser }) => {
  const [p1, p2, p3] = await Promise.all([phone(browser, A), phone(browser, B), phone(browser, A)]);
  await p1.goto('/');
  await p1.getByRole('button', { name: 'Tạo phòng mới' }).click();
  const code = (await p1.getByTestId('room-code').innerText()).trim();
  for (const p of [p2, p3]) {
    await p.goto(`/r/${code}`);
    await p.getByRole('button', { name: 'Vào', exact: true }).click();
  }
  await expect(p2.getByTestId('room-code')).toBeVisible();
  await expect(p3.getByText(/Phòng đã đủ 2 máy đo/)).toBeVisible();
});
