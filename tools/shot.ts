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
      ['tutorial-start', 'stage=TUTORIAL&view=3,30,0'],
      ['tutorial-fast', 'stage=TUTORIAL&view=16,19,20'],
      ['hub-first', 'stage=HUB&cleared=TUTORIAL&view=6,11,0'],
      ['hub-all', 'stage=HUB&cleared=TUTORIAL,STAGE1,STAGE2,STAGE3,STAGE4&view=6,8,0'],
      ['s3-start', 'stage=STAGE3&view=5,49,0'],
      ['s3-tram', 'stage=STAGE3&view=19,31,90'],
      ['s3-late', 'stage=STAGE3&view=12,15,170'],
      ['s4-start', 'stage=STAGE4&view=47,5,0'],
      ['s4-koi', 'stage=STAGE4&view=30,8,60'],
      ['s4-snow', 'stage=STAGE4&view=17,9,3'],
      ['s5-start', 'stage=STAGE5&view=5,47,0'],
      ['s5-fan', 'stage=STAGE5&view=11,27,40'],
      ['s5-late', 'stage=STAGE5&view=13,15,90'],
      ['hub-stairs', 'stage=HUB&cleared=TUTORIAL,STAGE1,STAGE2,STAGE3,STAGE4,STAGE5&view=4,10,0'],
      ...[1, 3.5, 6, 9.5, 11.6, 14.3, 16.3, 18.2, 24].map((t): [string, string] => [`ending-${t}`, `ending=${t}&total=48210`]),
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
