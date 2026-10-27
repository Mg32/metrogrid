import { expect, test } from '@playwright/test';
import { collectErrors, frames, game } from './helpers.ts';

test('タイトルから始めて歩ける', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1');
  await frames(page);
  expect((await game(page)).scene).toBe('title');

  await page.keyboard.press('Enter');
  // カウント（1小節 = 2.4秒）が終わるまで待つ。テストを並べて動かすと、音の出力が動き出すまでに1秒以上かかることがあるので長めに
  await expect.poll(async () => (await game(page)).sim?.tick ?? -1, { timeout: 10000 }).toBeGreaterThan(0);
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

test('はじめてはチュートリアルから。S でスキップすると拠点へ、拠点の入口から STAGE 1 へ', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1');
  await frames(page);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await game(page)).sim?.stage, { timeout: 5000 }).toBe('TUTORIAL');

  await page.keyboard.press('KeyS');
  await expect.poll(async () => (await game(page)).sim?.stage, { timeout: 5000 }).toBe('HUB');
  await expect.poll(async () => (await game(page)).scene, { timeout: 5000 }).toBe('play');

  // 拠点のスタートから下（画面の左手前）へ歩くと、玄関の戸（STAGE 1 の入口）に入る
  await page.keyboard.down('ArrowDown');
  await expect.poll(async () => (await game(page)).sim?.stage, { timeout: 8000 }).toBe('STAGE1');
  await page.keyboard.up('ArrowDown');

  // スキップした記録が残り、次からはタイトルからまっすぐ拠点へ
  await page.goto('/?seed=1');
  await frames(page);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await game(page)).sim?.stage, { timeout: 5000 }).toBe('HUB');
  expect(errors).toEqual([]);
});

test('タイトルの RESET：確認で NO ならそのまま、YES なら記録を消してチュートリアルから', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1');
  await page.evaluate(() => {
    localStorage.setItem('metrogrid.cleared', JSON.stringify(['TUTORIAL', 'STAGE1']));
    localStorage.setItem('metrogrid.total', '12345');
  });
  await page.goto('/?seed=1');
  await frames(page);
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await game(page)).scene).toBe('confirm');
  await page.keyboard.press('Enter'); // はじめは NO
  await expect.poll(async () => (await game(page)).scene).toBe('title');
  expect(await page.evaluate(() => localStorage.getItem('metrogrid.total'))).toBe('12345');

  await page.keyboard.press('Delete');
  await expect.poll(async () => (await game(page)).scene).toBe('confirm');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await game(page)).sim?.stage, { timeout: 5000 }).toBe('TUTORIAL');
  expect(await page.evaluate(() => [localStorage.getItem('metrogrid.cleared'), localStorage.getItem('metrogrid.total')])).toEqual([null, null]);
  expect(errors).toEqual([]);
});

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

test('二階への階段：確認で NO なら拠点に戻り、YES ならエンディング', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1&stage=HUB&cleared=TUTORIAL,STAGE1,STAGE2,STAGE3,STAGE4,STAGE5&autostart');
  await expect.poll(async () => (await game(page)).scene, { timeout: 5000 }).toBe('play');
  // スタートから左（画面の左上）へ歩くと、階段の上り口
  await page.keyboard.down('ArrowLeft');
  await expect.poll(async () => (await game(page)).scene, { timeout: 8000 }).toBe('confirm');
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.press('Enter'); // はじめは NO が選ばれている
  await expect.poll(async () => (await game(page)).scene, { timeout: 5000 }).toBe('play');
  expect((await game(page)).sim?.stage).toBe('HUB');

  await page.keyboard.down('ArrowLeft');
  await expect.poll(async () => (await game(page)).scene, { timeout: 8000 }).toBe('confirm');
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.press('ArrowLeft'); // YES
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await game(page)).scene, { timeout: 5000 }).toBe('ending');
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
