import { expect, test } from '@playwright/test';
import { collectErrors, DESKTOP, frames, game } from './helpers.ts';

// キーボードだけで遊べるか（デスクトップの画面で。画面と操作は端末で分けていない）
test.use(DESKTOP);

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

  // チュートリアルの途中の Esc は、飛ばして拠点へ
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await game(page)).sim?.stage, { timeout: 5000 }).toBe('HUB');
  expect(errors).toEqual([]);
});

test('はじめてはチュートリアルから。Esc でスキップすると拠点へ、拠点の入口から STAGE 1 へ', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1');
  await frames(page);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await game(page)).sim?.stage, { timeout: 5000 }).toBe('TUTORIAL');
  // 曲を読み込んでいるあいだ（loading）のキーは効かない
  await expect.poll(async () => (await game(page)).scene, { timeout: 5000 }).toBe('play');

  await page.keyboard.press('Escape');
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

test('タイトルの RESET：確認で NO ならそのまま、YES なら記録を消してタイトルへ戻り、次はチュートリアルから', async ({ page }) => {
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

  // N でも「いいえ」
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await game(page)).scene).toBe('confirm');
  await page.keyboard.press('KeyN');
  await expect.poll(async () => (await game(page)).scene).toBe('title');

  // Y は YES を選んでから、もう一度で決まる
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await game(page)).scene).toBe('confirm');
  await page.keyboard.press('KeyY');
  await expect.poll(async () => (await game(page)).scene).toBe('confirm');
  await page.keyboard.press('KeyY');
  await expect.poll(async () => (await game(page)).scene).toBe('title');
  expect(await page.evaluate(() => [localStorage.getItem('metrogrid.cleared'), localStorage.getItem('metrogrid.total')])).toEqual([null, null]);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await game(page)).sim?.stage, { timeout: 5000 }).toBe('TUTORIAL');
  expect(errors).toEqual([]);
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

test('クリアしたあとはホームへ戻るだけ（R でやり直さない）', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1&clear=6');
  await frames(page);
  await page.keyboard.press('KeyR');
  await frames(page);
  expect((await game(page)).scene).toBe('result');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await game(page)).sim?.stage, { timeout: 5000 }).toBe('HUB');
  expect(errors).toEqual([]);
});
