import type { Page } from '@playwright/test';

/** main.ts が開発サーバーで公開している状態 */
export interface GameHandle {
  scene: string;
  sim: { tick: number; x: number; y: number; status: string; misses: number } | null;
  layout: { scale: number; ox: number; oy: number; width: number; height: number };
}

export async function game(page: Page): Promise<GameHandle> {
  return page.evaluate(() => {
    const g = (window as unknown as { __game: GameHandle }).__game;
    const s = g.sim;
    return {
      scene: g.scene,
      sim: s && { tick: s.tick, x: s.x, y: s.y, status: s.status, misses: s.misses },
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
