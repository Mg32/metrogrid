import type { Page } from '@playwright/test';
import { client, collectErrors, DESKTOP, expect, frames, game, MOBILE, LOAD_MS, test } from './helpers.ts';

/**
 * タップだけ・マウスだけで遊べるか。画面と操作は端末で分けていないので、遊ぶ流れ（タップ、ずらして歩く、ボタン）は
 * マウス（デスクトップの画面）とタッチ（スマホの画面）の両方で確かめる。ほかのボタンは同じ処理を通るので、タッチだけで確かめる
 * （E2E を軽くするため）。押す場所は 288x288 のバッファ上の座標で指定する
 */
const POINTERS = [
  { name: 'マウス', device: DESKTOP, type: 'mouse' },
  { name: 'タッチ', device: MOBILE, type: 'touch' },
] as const;

/** 画面の下の隅のボタン（左は Esc、右は R などのボタン）、タイトルの右上の言語のボタン、確認の YES・NO */
const LEFT_BTN = [34, 288 - 15] as const;
const RIGHT_BTN = [288 - 34, 288 - 15] as const;
const LANG_BTN = [288 - 30, 15] as const;
const YES_BTN = [114, 164] as const;
const NO_BTN = [178, 164] as const;

for (const p of POINTERS) {
  test.describe(p.name, () => {
    test.use(p.device);

    /** タップ（マウスならクリック） */
    const tap = async (page: Page, [bx, by]: readonly [number, number]) => {
      const c = await client(page, bx, by);
      if (p.type === 'touch') await page.touchscreen.tap(c.x, c.y);
      else await page.mouse.click(c.x, c.y);
    };

    /** (bx0, by0) に指を置き（マウスなら押し）、(bx1, by1) までずらしたままにする（離さない） */
    const slide = async (page: Page, bx0: number, by0: number, bx1: number, by1: number) => {
      const a = await client(page, bx0, by0);
      const b = await client(page, bx1, by1);
      if (p.type === 'mouse') {
        await page.mouse.move(a.x, a.y);
        await page.mouse.down();
        await page.mouse.move(b.x, b.y);
        return;
      }
      await page.evaluate(({ a, b }) => {
        const canvas = document.querySelector('canvas')!;
        const ev = (type: string, q: { x: number; y: number }) =>
          new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: q.x, clientY: q.y, bubbles: true });
        canvas.dispatchEvent(ev('pointerdown', a));
        canvas.dispatchEvent(ev('pointermove', b));
      }, { a, b });
    };

    /** ずらしていた指を離す */
    const release = async (page: Page) => {
      if (p.type === 'mouse') await page.mouse.up();
      else await page.evaluate(() => document.querySelector('canvas')!.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', bubbles: true })));
    };

    test('タップで始め、SKIP でチュートリアルを飛ばし、ずらして歩いて入口に入り、HOME で拠点の入口の前へ戻る', async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto('/?seed=1');
      await frames(page);
      await tap(page, [144, 144]);
      await expect.poll(async () => (await game(page)).sim?.stage, { timeout: LOAD_MS }).toBe('TUTORIAL');
      // 曲を読み込んでいるあいだ（loading）のボタンは効かない
      await expect.poll(async () => (await game(page)).scene, { timeout: LOAD_MS }).toBe('play');

      await tap(page, LEFT_BTN);
      await expect.poll(async () => (await game(page)).sim?.stage, { timeout: LOAD_MS }).toBe('HUB');
      await expect.poll(async () => (await game(page)).scene, { timeout: LOAD_MS }).toBe('play');

      // 画面の下のほうに指を置いて左下へずらすと、下（画面の左下）へ歩いて玄関の戸（STAGE 1 の入口）に入る
      await slide(page, 150, 230, 138, 237);
      await expect.poll(async () => (await game(page)).sim?.stage, { timeout: LOAD_MS }).toBe('STAGE1');
      await release(page);
      await expect.poll(async () => (await game(page)).scene, { timeout: LOAD_MS }).toBe('play');

      await tap(page, LEFT_BTN);
      await expect.poll(async () => (await game(page)).sim?.stage, { timeout: LOAD_MS }).toBe('HUB');
      const g = await game(page);
      expect([g.sim!.x, g.sim!.y]).toEqual([6, 13]);
      expect(errors).toEqual([]);
    });

    if (p.type === 'touch') {
      test('タイトルの右上のボタンで、日本語と英語が切り替わる（始まらない）', async ({ page }) => {
        const errors = collectErrors(page);
        await page.goto('/?seed=1');
        await frames(page);
        const first = (await game(page)).lang;
        await tap(page, LANG_BTN);
        await frames(page);
        expect((await game(page)).lang).toBe(first === 'ja' ? 'en' : 'ja');
        await tap(page, LANG_BTN);
        await frames(page);
        expect((await game(page)).lang).toBe(first);
        expect((await game(page)).scene).toBe('title');
        expect(errors).toEqual([]);
      });

      test('タイトルの SKIP TUTORIAL で、チュートリアルを飛ばして拠点へ', async ({ page }) => {
        const errors = collectErrors(page);
        await page.goto('/?seed=1');
        await frames(page);
        await tap(page, [288 - 40, 288 - 15]);
        await expect.poll(async () => (await game(page)).sim?.stage, { timeout: LOAD_MS }).toBe('HUB');
        expect(await page.evaluate(() => localStorage.getItem('metrogrid.cleared'))).toContain('TUTORIAL');
        expect(errors).toEqual([]);
      });

      test('タイトルの RESET：NO ならそのまま、YES を2回で記録を消す', async ({ page }) => {
        const errors = collectErrors(page);
        await page.goto('/?seed=1');
        await page.evaluate(() => localStorage.setItem('metrogrid.cleared', JSON.stringify(['TUTORIAL', 'STAGE1'])));
        await page.goto('/?seed=1');
        await frames(page);
        await tap(page, LEFT_BTN);
        await expect.poll(async () => (await game(page)).scene).toBe('confirm');
        await tap(page, NO_BTN);
        await expect.poll(async () => (await game(page)).scene).toBe('title');
        expect(await page.evaluate(() => localStorage.getItem('metrogrid.cleared'))).not.toBeNull();

        await tap(page, LEFT_BTN);
        await expect.poll(async () => (await game(page)).scene).toBe('confirm');
        await tap(page, YES_BTN);
        await frames(page);
        expect((await game(page)).scene).toBe('confirm');
        await tap(page, YES_BTN);
        await expect.poll(async () => (await game(page)).scene).toBe('title');
        expect(await page.evaluate(() => localStorage.getItem('metrogrid.cleared'))).toBeNull();
        expect(errors).toEqual([]);
      });

      test('ステージ中の RETRY で、はじめからやり直す', async ({ page }) => {
        const errors = collectErrors(page);
        await page.goto('/?seed=1&stage=STAGE1&autostart');
        await expect.poll(async () => (await game(page)).sim?.tick ?? -1, { timeout: LOAD_MS }).toBeGreaterThan(8);
        await tap(page, RIGHT_BTN);
        await expect.poll(async () => (await game(page)).sim?.tick ?? 99, { timeout: LOAD_MS }).toBeLessThan(8);
        expect((await game(page)).sim?.stage).toBe('STAGE1');
        expect(errors).toEqual([]);
      });
    }
  });
}
