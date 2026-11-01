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
      ['title-progress', 'cleared=TUTORIAL,STAGE1,STAGE2,STAGE3'],
      ['tutorial-stop', 'stage=TUTORIAL&view=11,13,60'],
      ['tutorial-stop-on', 'stage=TUTORIAL&view=11,11,60'],
      // STAGE 1：家の前の路地と公園（昼 → 午後 → 日没前）
      ['start', 'view=13,50,0'],
      ['s1-crossing', 'view=13,45,16'],
      ['s1-park', 'view=12,38,60'],
      ['s1-park-kid', 'view=32,35,70'],
      ['middle-kaisento', 'view=21,20,90'],
      ['middle-gate', 'view=30,16,110'],
      ['late', 'view=7,13,120'],
      ['goal', 'view=7,6,150'],
      ['clear-light', 'clear=0.7'],
      ['clear-crumble', 'clear=1.4'],
      ['clear-result', 'clear=6'],
      // STAGE 2：池と用水路（晴れ → 曇り → 雨 → 雨上がり。左上へ登る）
      ['s2-start', 'stage=STAGE2&view=77,33,0'],
      ['s2-pond', 'stage=STAGE2&view=58,14,40'],
      ['s2-canal', 'stage=STAGE2&view=45,18,80'],
      ['s2-rapids', 'stage=STAGE2&view=13,19,150'],
      ['s2-goal', 'stage=STAGE2&view=3,5,200'],
      ['tutorial-start', 'stage=TUTORIAL&view=3,30,0'],
      ['tutorial-fast', 'stage=TUTORIAL&view=16,19,20'],
      ['hub-first', 'stage=HUB&cleared=TUTORIAL&view=6,11,0'],
      ['hub-all', 'stage=HUB&cleared=TUTORIAL,STAGE1,STAGE2,STAGE3,STAGE4&total=48210&view=6,8,0'],
      // STAGE 3：時代の重なった通り
      ['s3-start', 'stage=STAGE3&view=9,65,0'],
      ['s3-tram', 'stage=STAGE3&view=19,55,50'],
      ['s3-mixed', 'stage=STAGE3&view=21,36,100'],
      ['s3-late', 'stage=STAGE3&view=22,11,170'],
      ['s3-goal', 'stage=STAGE3&view=20,4,200'],
      // STAGE 4：屋根の連なり（床の高さ、春 → 夏 → 秋 → 冬）
      ['s4-start', 'stage=STAGE4&view=5,105,0'],
      ['s4-platform', 'stage=STAGE4&view=14,95,30'],
      ['s4-koi', 'stage=STAGE4&view=16,91,40'],
      ['s4-summer', 'stage=STAGE4&view=15,76,100'],
      ['s4-autumn', 'stage=STAGE4&view=29,55,150'],
      ['s4-autumn2', 'stage=STAGE4&view=26,37,200'],
      ['s4-snow', 'stage=STAGE4&view=21,11,250'],
      ['s4-goal', 'stage=STAGE4&view=13,4,280'],
      // STAGE 5：夜逃げから廃屋まで
      ['s5-start', 'stage=STAGE5&view=15,107,0'],
      ['s5-fan', 'stage=STAGE5&view=17,98,30'],
      ['s5-kitchen', 'stage=STAGE5&view=35,96,40'],
      ['s5-park', 'stage=STAGE5&view=5,91,60'],
      ['s5-years', 'stage=STAGE5&view=25,73,90'],
      ['s5-canal', 'stage=STAGE5&view=39,63,110'],
      ['s5-tram', 'stage=STAGE5&view=39,34,140'],
      ['s5-ruin', 'stage=STAGE5&view=11,16,170'],
      ['s5-roof', 'stage=STAGE5&view=25,15,180'],
      ['s5-goal', 'stage=STAGE5&view=19,6,200'],
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
