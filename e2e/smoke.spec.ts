import { expect, test } from '@playwright/test';
import { collectErrors, frames, game } from './helpers.ts';

test('タイトルから始めて歩ける', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1');
  await frames(page);
  expect((await game(page)).scene).toBe('title');

  await page.keyboard.press('Enter');
  // カウント（1小節 = 2秒）が終わるまで待つ
  await expect.poll(async () => (await game(page)).sim?.tick ?? -1, { timeout: 5000 }).toBeGreaterThan(0);
  expect((await game(page)).scene).toBe('play');

  // スタート（玄関の前）からは上（画面の右上）へ道が続いている
  const before = (await game(page)).sim!;
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await game(page)).sim!.y, { timeout: 3000 }).toBeLessThan(before.y);
  await page.keyboard.up('ArrowUp');

  await page.keyboard.press('Escape');
  await frames(page);
  expect((await game(page)).scene).toBe('title');
  expect(errors).toEqual([]);
});

test('クリア演出（?clear）でエラーが出ない', async ({ page }) => {
  const errors = collectErrors(page);
  for (const sec of [0.7, 1.4, 6]) {
    await page.goto(`/?seed=1&clear=${sec}`);
    await frames(page);
    const g = await game(page);
    expect(g.scene).toBe('result');
    expect(g.sim!.status).toBe('cleared');
  }
  expect(errors).toEqual([]);
});

test('静止表示（?view）でエラーが出ない', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1&view=12,24,36');
  await frames(page);
  const g = await game(page);
  expect(g.scene).toBe('view');
  expect([g.sim!.x, g.sim!.y]).toEqual([12, 24]);
  expect(errors).toEqual([]);
});
