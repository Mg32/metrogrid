/**
 * 主要な場面のスクリーンショットを screenshots/ に保存する（見た目を変えたあとの確認用）。
 * 288x288 の画面を x2（576x576）で撮る。
 *
 *   npm run shot                                 既定の場面をすべて
 *   npm run shot -- --view 12,5,40 --name foo    任意の位置と tick（?view と同じ）。--stage STAGE2 でステージを選ぶ
 *   npm run shot -- --scale 1                    等倍で撮る
 *   npm run shot -- --query 'ending=24;total=1' --name foo   任意の URL のクエリで撮る（& の代わりに ; で区切れる。Windows のシェル用）
 *   npm run shot -- --only hub                   名前がそれで始まる場面だけ
 *   npm run shot -- --lang en                    画面の言語（既定は日本語。名前が -en で終わる場面は英語で撮る）
 *   npm run shot -- --labels                     物に番号と種類の札を出して撮る（?labels）
 *   npm run shot -- --only gallery               闇に浮かぶ物の一覧（gallery.html）だけ
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const { values: args } = parseArgs({
  options: {
    view: { type: 'string' },
    query: { type: 'string' },
    name: { type: 'string', default: 'custom' },
    scale: { type: 'string', default: '2' },
    seed: { type: 'string', default: '1' },
    stage: { type: 'string' },
    only: { type: 'string' },
    lang: { type: 'string', default: 'ja' },
    labels: { type: 'boolean', default: false },
  },
});

/** 場面名と URL のクエリ。view は「X,Y,TICK」 */
const SCENES: [string, string][] = args.query
  ? [[args.name, args.query.replaceAll(';', '&')]]
  : args.view
  ? [[args.name, `view=${args.view}${args.stage ? `&stage=${args.stage}` : ''}`]]
  : [
      ['title', 'title=0.5'],
      // 英語の画面（文の多い場面だけ）
      ['title-en', 'title=0.5&lang=en'],
      ['tutorial-start-en', 'stage=TUTORIAL&view=3,30,0&lang=en'],
      ['tutorial-fast-en', 'stage=TUTORIAL&view=16,19,20&lang=en'],
      ['hub-all-en', 'stage=HUB&cleared=TUTORIAL,STAGE1,STAGE2,STAGE3,STAGE4&total=48210&view=6,8,0&lang=en'],
      ['clear-result-en', 'clear=6&lang=en'],
      ['title-progress', 'title=0.5&cleared=TUTORIAL,STAGE1,STAGE2,STAGE3'],
      ['title-all', 'title=0.5&cleared=TUTORIAL,STAGE1,STAGE2,STAGE3,STAGE4,STAGE5'],
      // 家に帰ってくる演出（STAGE5 を初めてクリアしたところ。二階が戻っていく。秒は HOMECOMING）
      ['home-1', 'home=STAGE5&title=1.2&cleared=TUTORIAL,STAGE1,STAGE2,STAGE3,STAGE4'],
      ['home-2', 'home=STAGE5&title=2.2&cleared=TUTORIAL,STAGE1,STAGE2,STAGE3,STAGE4'],
      ['home-3', 'home=STAGE5&title=3.5&cleared=TUTORIAL,STAGE1,STAGE2,STAGE3,STAGE4'],
      ['home-4', 'home=STAGE5&title=4.3&cleared=TUTORIAL,STAGE1,STAGE2,STAGE3,STAGE4'],
      ['home-stage1', 'home=STAGE1&title=4.75&cleared=TUTORIAL,STAGE1'],
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
      // チュートリアルの冒頭：階段のいちばん下に少女が現れ（tick -32〜-17、曲はまだ鳴らない）、
      // カウント（曲の前奏。tick -16〜-1）のあいだに1拍1段ずつ昇ってくる（100 BPM）
      ['tutorial-appear-1', 'stage=TUTORIAL&view=3,31,-28'],
      ['tutorial-appear-2', 'stage=TUTORIAL&view=3,31,-22'],
      ['tutorial-climb-1', 'stage=TUTORIAL&view=3,31,-15'],
      ['tutorial-climb-2', 'stage=TUTORIAL&view=3,31,-6'],
      ['tutorial-start', 'stage=TUTORIAL&view=3,30,0'],
      ['tutorial-fast', 'stage=TUTORIAL&view=16,19,20'],
      ['hub-first', 'stage=HUB&cleared=TUTORIAL&view=6,11,0'],
      // 拠点に新しい入口が現れる演出（STAGE2 を初めてクリアして戻ったところ。116 BPM で 1tick ≒ 0.13 秒）
      ['hub-reveal-1', 'stage=HUB&cleared=TUTORIAL,STAGE1,STAGE2&reveal=STAGE2&view=6,8,10'],
      ['hub-reveal-2', 'stage=HUB&cleared=TUTORIAL,STAGE1,STAGE2&reveal=STAGE2&view=6,8,14'],
      ['hub-reveal-3', 'stage=HUB&cleared=TUTORIAL,STAGE1,STAGE2&reveal=STAGE2&view=6,8,18'],
      ['hub-reveal-stairs', 'stage=HUB&cleared=TUTORIAL,STAGE1,STAGE2,STAGE3,STAGE4,STAGE5&reveal=STAGE5&view=6,10,14'],
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
      ['s4-gutter', 'stage=STAGE4&view=2,11,260'],
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
      ...[1, 2.7, 3.3, 4.05, 6, 9.5, 12, 13.3, 14.6, 16.3, 17.5, 18, 19.3, 20.5, 22.7, 24.7, 26.3, 32, 38].map((t): [string, string] => [`ending-${t}`, `ending=${t}&total=48210`]),
      ['ending-38-en', 'ending=38&total=48210&lang=en'],
      ...[1, 3.5, 6, 9, 11, 13, 16, 20].map((t): [string, string] => [`ending-calm-${t}`, `ending=${t}&total=0`]),
      ['ending-calm-20-en', 'ending=20&total=0&lang=en'],
      // 闇に浮かぶ物の一覧（gallery.html。画面の大きさではなく一覧の大きさで撮る）
      ['gallery', ''],
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
  for (const [name, query] of SCENES.filter(([n]) => !args.only || n.startsWith(args.only))) {
    const file = path.join(outDir, `${name}.png`);
    if (name === 'gallery') {
      await page.goto(`${base}gallery.html?still&scale=${scale}`);
      await page.locator('canvas').screenshot({ path: file });
      console.log(path.relative(process.cwd(), file));
      continue;
    }
    const lang = query.includes('lang=') ? '' : `&lang=${args.lang}`;
    await page.goto(`${base}?seed=${args.seed}&${query}${lang}${args.labels ? '&labels' : ''}`);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
    await page.screenshot({ path: file });
    console.log(path.relative(process.cwd(), file));
  }
} finally {
  await browser.close();
  await server.close();
}
