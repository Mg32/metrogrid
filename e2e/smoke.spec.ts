import { collectErrors, expect, frames, game, LOAD_MS, test } from './helpers.ts';

// 操作しない場面（URL パラメータでの静止表示など）でエラーが出ないか

test('拠点の入口は、前のステージをクリアすると増える', async ({ page }) => {
  const portals = () =>
    page.evaluate(() => {
      const g = (window as unknown as { __game: { sim: { stage: { def: { objects: string[] } } } } }).__game;
      return g.sim.stage.def.objects.join('').replace(/[^1-9]/g, '').split('').sort().join('');
    });
  await page.goto('/?seed=1&stage=HUB&cleared=TUTORIAL&view=6,10,0');
  await frames(page);
  expect(await portals()).toBe('1');
  await page.goto('/?seed=1&stage=HUB&cleared=TUTORIAL,STAGE1,STAGE2&view=6,10,0');
  await frames(page);
  expect(await portals()).toBe('123');
  await page.goto('/?seed=1&stage=HUB&cleared=TUTORIAL,STAGE1,STAGE2,STAGE3,STAGE4&view=6,10,0');
  await frames(page);
  expect(await portals()).toBe('12345');
});

test('?upstairs：すべてクリアした拠点の階段の前から始まり、記録は保存しない', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1&upstairs');
  // 曲の読み込みを待つ。テストを並べて動かすと時間がかかることがあるので長めに
  await expect.poll(async () => (await game(page)).scene, { timeout: LOAD_MS }).toBe('play');
  const g = await game(page);
  expect(g.sim?.stage).toBe('HUB');
  // 階段の上り口（3,10）の隣に立っている
  expect(Math.abs(g.sim!.x - 3) + Math.abs(g.sim!.y - 10)).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('metrogrid.cleared'))).toBeNull();
  expect(errors).toEqual([]);
});

test('エンディング（?ending）でエラーが出ない', async ({ page }) => {
  const errors = collectErrors(page);
  for (const sec of [3.5, 6, 14.3, 24]) {
    await page.goto(`/?seed=1&ending=${sec}&total=12345`);
    await frames(page);
    expect((await game(page)).scene).toBe('ending');
  }
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
