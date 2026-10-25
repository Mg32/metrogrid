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

  const before = (await game(page)).sim!;
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await game(page)).sim!.x, { timeout: 3000 }).toBeGreaterThan(before.x);
  await page.keyboard.up('ArrowRight');

  await page.keyboard.press('Escape');
  await frames(page);
  expect((await game(page)).scene).toBe('title');
  expect(errors).toEqual([]);
});

test('静止表示（?view）でエラーが出ない', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1&view=17,3,36');
  await frames(page);
  const g = await game(page);
  expect(g.scene).toBe('view');
  expect([g.sim!.x, g.sim!.y]).toEqual([17, 3]);
  expect(errors).toEqual([]);
});
