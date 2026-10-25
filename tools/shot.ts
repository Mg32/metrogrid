/**
 * 主要な場面のスクリーンショットを screenshots/ に保存する（見た目を変えたあとの確認用）。
 * 288x288 の画面を x2（576x576）で撮る。
 *
 *   npm run shot                                 既定の場面をすべて
 *   npm run shot -- --view 12,5,40 --name foo    任意の位置と tick（?view と同じ）。--stage STAGE2 でステージを選ぶ
 *   npm run shot -- --scale 1                    等倍で撮る
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const { values: args } = parseArgs({
  options: {
    view: { type: 'string' },
    name: { type: 'string', default: 'custom' },
    scale: { type: 'string', default: '2' },
    seed: { type: 'string', default: '1' },
    stage: { type: 'string' },
  },
});

/** 場面名と URL のクエリ。view は「X,Y,TICK」 */
const SCENES: [string, string][] = args.view
  ? [[args.name, `view=${args.view}${args.stage ? `&stage=${args.stage}` : ''}`]]
  : [
      ['title', ''],
      ['start', 'view=5,38,0'],
      ['early', 'view=12,31,40'],
      ['middle-kaisento', 'view=10,24,90'],
      ['middle-gate', 'view=16,19,110'],
      ['late', 'view=13,11,150'],
      ['goal', 'view=3,6,180'],
      ['clear-light', 'clear=0.7'],
      ['clear-crumble', 'clear=1.4'],
      ['clear-result', 'clear=6'],
      ['s2-start', 'stage=STAGE2&view=59,5,0'],
      ['s2-canal', 'stage=STAGE2&view=51,7,40'],
      ['s2-shishi', 'stage=STAGE2&view=37,9,92'],
      ['s2-rapids', 'stage=STAGE2&view=16,15,150'],
      ['s2-goal', 'stage=STAGE2&view=4,19,200'],
    ];

const scale = Number(args.scale);
const outDir = path.resolve(import.meta.dirname, '../screenshots');
await mkdir(outDir, { recursive: true });

const server = await createServer({ server: { port: 5181, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls!.local[0];
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' });

try {
  const page = await browser.newPage({ viewport: { width: 288 * scale, height: 288 * scale }, deviceScaleFactor: 1 });
  for (const [name, query] of SCENES) {
    await page.goto(`${base}?seed=${args.seed}&${query}`);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
    const file = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: file });
    console.log(path.relative(process.cwd(), file));
  }
} finally {
  await browser.close();
  await server.close();
}
