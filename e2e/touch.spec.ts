import { expect, test, type Page } from '@playwright/test';
import { collectErrors, frames, game } from './helpers.ts';

// スマホ（タッチ）での操作
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });

/** 288x288 のバッファ上の点 → ページ上の座標 */
async function client(page: Page, bx: number, by: number): Promise<{ x: number; y: number }> {
  const { layout } = await game(page);
  const dpr = await page.evaluate(() => devicePixelRatio);
  return { x: (layout.ox + bx * layout.scale) / dpr, y: (layout.oy + by * layout.scale) / dpr };
}

/** 指を置いたままにする（離さない） */
async function holdTouch(page: Page, bx: number, by: number): Promise<void> {
  const p = await client(page, bx, by);
  await page.evaluate(({ x, y }) => {
    const canvas = document.querySelector('canvas')!;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }));
  }, p);
}

test('タップで始め、ボタンでチュートリアルを飛ばし、指を置いた方へ歩いて入口に入る', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1');
  await frames(page);
  const c = await client(page, 144, 144);
  await page.touchscreen.tap(c.x, c.y);
  await expect.poll(async () => (await game(page)).sim?.stage, { timeout: 5000 }).toBe('TUTORIAL');

  // 右下の SKIP ボタン
  const skip = await client(page, 288 - 32, 288 - 12);
  await page.touchscreen.tap(skip.x, skip.y);
  await expect.poll(async () => (await game(page)).sim?.stage, { timeout: 5000 }).toBe('HUB');
  await expect.poll(async () => (await game(page)).scene, { timeout: 5000 }).toBe('play');

  // 少女の左下に指を置いたままにすると、下（画面の左下）へ歩いて玄関の戸（STAGE 1 の入口）に入る
  await holdTouch(page, 100, 190);
  await expect.poll(async () => (await game(page)).sim?.stage, { timeout: 8000 }).toBe('STAGE1');
  expect(errors).toEqual([]);
});

test('ステージ中に HOME ボタンをタップすると拠点に戻る（?stage で直接始めたときも）', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1&stage=STAGE1&autostart');
  await expect.poll(async () => (await game(page)).scene, { timeout: 5000 }).toBe('play');
  // 左下の HOME ボタン
  const home = await client(page, 30, 288 - 15);
  await page.touchscreen.tap(home.x, home.y);
  await expect.poll(async () => (await game(page)).sim?.stage, { timeout: 5000 }).toBe('HUB');
  // 拠点では STAGE 1 の入口の前に立っている
  const g = await game(page);
  expect([g.sim!.x, g.sim!.y]).toEqual([6, 13]);
  expect(errors).toEqual([]);
});
