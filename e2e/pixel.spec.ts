import { expect, test } from '@playwright/test';
import { frames, game } from './helpers.ts';

/**
 * 288x288 の画面が、実画素で整数倍に拡大され、ぼやけずに表示されているか。
 * 表示されたキャンバスの画素を読み、元の1ドットが k×k の同じ色のかたまりになっているかを全ドット調べる。
 */
const CASES = [
  { viewport: { width: 400, height: 320 }, dpr: 1, scale: 1 },
  { viewport: { width: 1440, height: 810 }, dpr: 1, scale: 2 },
  { viewport: { width: 1920, height: 1080 }, dpr: 1, scale: 3 },
  { viewport: { width: 1300, height: 1250 }, dpr: 1, scale: 4 },
  { viewport: { width: 1280, height: 720 }, dpr: 1.25, scale: 3 },
  { viewport: { width: 800, height: 600 }, dpr: 2, scale: 4 },
];

for (const c of CASES) {
  test.describe(`${c.viewport.width}x${c.viewport.height} @${c.dpr}x`, () => {
    test.use({ viewport: c.viewport, deviceScaleFactor: c.dpr });

    test(`x${c.scale}（実画素）でドットがくっきり表示される`, async ({ page }) => {
      await page.goto('/?seed=1&view=10,9,20');
      await frames(page, 5);
      const { layout } = await game(page);
      expect(layout.scale).toBe(c.scale);

      const result = await page.evaluate(({ scale, ox, oy, width, height }) => {
        const canvas = document.querySelector('canvas')!;
        const ctx = canvas.getContext('2d')!;
        const img = ctx.getImageData(ox, oy, width * scale, height * scale).data;
        const w = width * scale;
        let bad = 0;
        const colors = new Set<number>();
        for (let by = 0; by < height; by++) {
          for (let bx = 0; bx < width; bx++) {
            const i0 = ((by * scale) * w + bx * scale) * 4;
            const c0 = (img[i0] << 16) | (img[i0 + 1] << 8) | img[i0 + 2];
            colors.add(c0);
            for (let dy = 0; dy < scale; dy++) {
              for (let dx = 0; dx < scale; dx++) {
                const i = ((by * scale + dy) * w + bx * scale + dx) * 4;
                if (((img[i] << 16) | (img[i + 1] << 8) | img[i + 2]) !== c0) bad++;
              }
            }
          }
        }
        return { bad, colors: colors.size, canvas: [canvas.width, canvas.height] };
      }, layout);

      expect(result.bad).toBe(0);
      // アンチエイリアスがあると中間色が大量に出る
      expect(result.colors).toBeLessThan(100);
      // キャンバスの実画素がウィンドウの実画素と一致している
      expect(result.canvas).toEqual([Math.round(c.viewport.width * c.dpr), Math.round(c.viewport.height * c.dpr)]);
    });
  });
}
