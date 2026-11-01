import type { Page } from '@playwright/test';

/** main.ts が開発サーバーで公開している状態 */
export interface GameHandle {
  scene: string;
  sim: { tick: number; x: number; y: number; status: string; misses: number; stage: string } | null;
  layout: { scale: number; ox: number; oy: number; width: number; height: number };
}

export async function game(page: Page): Promise<GameHandle> {
  return page.evaluate(() => {
    const g = (window as unknown as { __game: { scene: string; sim: (Omit<NonNullable<GameHandle['sim']>, 'stage'> & { stage: { def: { name: string } } }) | null; layout: GameHandle['layout'] } }).__game;
    const s = g.sim;
    return {
      scene: g.scene,
      sim: s && { tick: s.tick, x: s.x, y: s.y, status: s.status, misses: s.misses, stage: s.stage.def.name },
      layout: g.layout,
    };
  });
}

/** ページのエラーとコンソールのエラーを集める */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  return errors;
}

/** 数フレーム描画を進める */
export async function frames(page: Page, n = 3): Promise<void> {
  for (let i = 0; i < n; i++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
}

/** デスクトップのブラウザ（マウスとキーボード） */
export const DESKTOP = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };
/** スマホのブラウザ（タッチ） */
export const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true };

/** 288x288 のバッファ上の点 → ページ上の座標 */
export async function client(page: Page, bx: number, by: number): Promise<{ x: number; y: number }> {
  const { layout } = await game(page);
  const dpr = await page.evaluate(() => devicePixelRatio);
  return { x: (layout.ox + bx * layout.scale) / dpr, y: (layout.oy + by * layout.scale) / dpr };
}

/** 表示されている 288x288 の画面の各ドットの色（拡大された各ドットの左上の画素） */
export async function dots(page: Page): Promise<number[]> {
  const layout = (await game(page)).layout;
  return page.evaluate(({ scale, ox, oy, width, height }) => {
    const ctx = document.querySelector('canvas')!.getContext('2d')!;
    const img = ctx.getImageData(ox, oy, width * scale, height * scale).data;
    const out: number[] = [];
    for (let by = 0; by < height; by++) {
      for (let bx = 0; bx < width; bx++) {
        const i = (by * scale * width * scale + bx * scale) * 4;
        out.push((img[i] << 16) | (img[i + 1] << 8) | img[i + 2]);
      }
    }
    return out;
  }, layout);
}
