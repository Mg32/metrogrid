import { expect, test, type Page } from '@playwright/test';
import { collectErrors, DESKTOP, dots, frames, game, MOBILE } from './helpers.ts';

/**
 * デスクトップのブラウザとスマホのブラウザで、同じ画面が表示されるか。
 * 画面（288x288）の各ドットの色を両方で読み、すべて一致することを確かめる（拡大の倍率は画面の大きさで変わってよい）
 */
const SCENES: { name: string; query: string; key?: string }[] = [
  { name: 'タイトル（はじめて）', query: 'title=0.5' },
  { name: 'タイトル（チュートリアル済み）', query: 'title=0.5&cleared=TUTORIAL,STAGE1' },
  { name: '記録を消すかの確認', query: 'title=0.5&cleared=TUTORIAL', key: 'Delete' },
  { name: 'チュートリアル（案内とボタン）', query: 'stage=TUTORIAL&view=3,30,0' },
  { name: 'ステージ', query: 'view=12,24,36' },
  { name: '拠点', query: 'stage=HUB&cleared=TUTORIAL&view=6,11,0' },
  { name: 'クリアの結果', query: 'clear=6' },
  { name: 'エンディング', query: 'ending=14.3&total=12345' },
];

/** 場面を開いて（key があれば押して）、画面の各ドットの色を読む */
async function capture(page: Page, scene: (typeof SCENES)[number]): Promise<number[]> {
  await page.goto(`/?seed=1&${scene.query}`);
  await frames(page);
  if (scene.key) {
    await page.keyboard.press(scene.key);
    await expect.poll(async () => (await game(page)).scene).toBe('confirm');
  }
  await frames(page);
  return dots(page);
}

// ページを場面ごとに作り直すと、並べて動かしたときに読み込みが重なって遅いので、デスクトップとスマホのページを1つずつ使い回す
test('デスクトップとスマホで同じ画面が表示される', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const desktop = await (await browser.newContext({ ...DESKTOP, baseURL })).newPage();
  const mobile = await (await browser.newContext({ ...MOBILE, baseURL })).newPage();
  const errors = [collectErrors(desktop), collectErrors(mobile)];
  for (const scene of SCENES) {
    await test.step(scene.name, async () => {
      const a = await capture(desktop, scene);
      const b = await capture(mobile, scene);
      expect(a.length).toBe(288 * 288);
      // 真っ暗な画面どうしを比べていないこと
      expect(new Set(a).size).toBeGreaterThan(8);
      expect.soft(a.filter((c, i) => c !== b[i]).length, `${scene.name}：色の違うドットの数`).toBe(0);
    });
  }
  expect(errors.flat()).toEqual([]);
});
