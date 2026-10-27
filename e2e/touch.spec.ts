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

/** (bx0, by0) に指を置き、(bx1, by1) までずらしたままにする（離さない） */
async function slide(page: Page, bx0: number, by0: number, bx1: number, by1: number): Promise<void> {
  const a = await client(page, bx0, by0);
  const b = await client(page, bx1, by1);
  await page.evaluate(({ a, b }) => {
    const canvas = document.querySelector('canvas')!;
    const ev = (type: string, p: { x: number; y: number }) =>
      new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: p.x, clientY: p.y, bubbles: true });
    canvas.dispatchEvent(ev('pointerdown', a));
    canvas.dispatchEvent(ev('pointermove', b));
  }, { a, b });
}

test('タップで始め、ボタンでチュートリアルを飛ばし、指をずらした向きへ歩いて入口に入る', async ({ page }) => {
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

  // 画面の下のほうに指を置いて左下へずらすと、下（画面の左下）へ歩いて玄関の戸（STAGE 1 の入口）に入る
  await slide(page, 150, 230, 138, 237);
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
