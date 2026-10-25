// STAGE 5 の地図を組み立てて src/game/stages/stage5.ts を書き出す
//   node tools/stagegen/stage5.ts          所要時間を表示するだけ（SHOW=1 で地図も表示）
//   node tools/stagegen/stage5.ts --write  src/game/stages/stage5.ts を上書きする（手で直した分は消える）
//
// 道以外（'#'）は闇で、描かれない。道は闇に浮かぶ。
// スタート（奥の和室の襖）は画面の下。折り返しながら -y へ登っていき、画面では斜め右上へ進む。
// 家に近い場所。これまでのステージの景色（路地、庭、通り、屋根）と家の中の床が、別のつながり方でつぎはぎに並ぶ。
// 危険物は家の中の物（柱時計の振り子と扇風機の首振り）。
// 組み立ては「進む向き p（スタートから 0, 1, …）」と「横 x」で考え、グリッドには y = YO − p で置く。
// 扉や小物の見える面は +x / +y 側なので、道が小物の +x 側か −p 側（y の大きい側）に来るように置く。
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { Stage, type HazardDef, type StageDef } from '../../src/game/stage.ts';
import { distanceField } from '../bots/nav.ts';

const BPM = 120;
const BARS = Number(process.env.BARS ?? 64);
const RUNGS = 11;
/** 段 k の下の行（安全）の p。上の行は +1、段の間（闇）は +2、+3 */
const lo = (k: number) => 4 + 4 * k;
const PMAX = lo(RUNGS - 1) + 7;
const YO = PMAX;
const W = 24, H = PMAX + 1;
const X0 = 3, X1 = 19;

const T: string[][] = Array.from({ length: H }, () => Array(W).fill('#'));
const O: string[][] = Array.from({ length: H }, () => Array(W).fill(' '));
const t = (x: number, p: number, ch: string) => { T[YO - p][x] = ch; };
const o = (x: number, p: number, ch: string) => { O[YO - p][x] = ch; };
const at = (x: number, p: number): [number, number] => [x, YO - p];
const row = (p: number, x0: number, x1: number, ch: string) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) t(x, p, ch); };
const hazards: HazardDef[] = [];
/** 柱時計の振り子：闇に浮かぶ時計から下りた竿の先の錘が、cells の上を period tick で1往復する */
const pendulum = (cells: [number, number][], axis: 'x' | 'y', period: number) =>
  hazards.push({ type: 'swing', look: 'pendulum', cells: cells.map(([x, p]) => at(x, p)).sort((a, b) => a[0] - b[0] || a[1] - b[1]), axis, period });
/**
 * 扇風機の首振り：段の間の闇（pivot）に立ち、首を振って、頭が速い道の上を period tick で1往復する。
 * 頭の真下のマスが危険。振り切ると頭は危険なマスの外に出る（箱ブランコと同じ揺れ方）
 */
const fan = (k: number, x: number, period: number) =>
  hazards.push({ type: 'swing', look: 'fan', pivot: at(x, lo(k) + 2), axis: 'x', period, cells: [at(x - 1, lo(k) + 1), at(x, lo(k) + 1), at(x + 1, lo(k) + 1)] });

// 段は 11 段。段 k は下の行 lo(k)（安全）と上の行 lo(k)+1 の2行で、x = 3〜19。
// 偶数段は +x へ、奇数段は −x へ歩き、端の連絡路（段の間の2行）で次の段へ登る。
// 安全な道（下の行と端の連絡路）には危険物も欠けも置かない（慣れていなくても、安全な道を歩けば戻されない）。
const rightEnd = (k: number) => k % 2 === 0;
for (let k = 0; k < RUNGS; k++) {
  row(lo(k), X0, X1, '.');
  row(lo(k) + 1, X0, X0 + 1, '.');
  row(lo(k) + 1, X1 - 1, X1, '.');
  if (k < RUNGS - 1) { const x = rightEnd(k) ? X1 : X0; t(x, lo(k) + 2, '.'); t(x, lo(k) + 3, '.'); }
}
const lane = (k: number, ch: string) => row(lo(k) + 1, X0 + 2, X1 - 2, ch);
// スタート周辺（段 0〜2）：2行とも安全で道幅が広い
for (const k of [0, 1, 2]) lane(k, '.');
// 中間（段 3〜6）：上の行は八分。柱時計の振り子が揺れ、扇風機が首を振る
for (const k of [3, 4, 5, 6]) lane(k, ',');
pendulum([[7, lo(3) + 1], [8, lo(3) + 1], [9, lo(3) + 1]], 'x', 22);
pendulum([[12, lo(4) + 1], [13, lo(4) + 1], [14, lo(4) + 1]], 'x', 18);
fan(5, 11, 30);
pendulum([[6, lo(6) + 1], [7, lo(6) + 1], [8, lo(6) + 1]], 'x', 26);
fan(6, 14, 26);
// ゴール周辺（段 7〜10）：上の行は十六分。欠けが多い
for (const k of [7, 8, 9, 10]) lane(k, ':');
for (const [k, x] of [[4, 8], [5, 6], [5, 15], [6, 11], [7, 6], [7, 14], [8, 9], [8, 6], [9, 7], [9, 16], [10, 10], [10, 15]]) t(x, lo(k) + 1, ' ');
fan(7, 10, 18);
pendulum([[14, lo(8) + 1], [15, lo(8) + 1], [16, lo(8) + 1]], 'x', 14);
fan(9, 12, 18);
pendulum([[6, lo(10) + 1], [7, lo(10) + 1], [8, lo(10) + 1]], 'x', 14);
// 段の間の近道（一方通行・危険）。振り子が横切る所もある
const cut = (k: number, x: number, ch: string, period?: number) => {
  t(x, lo(k) + 2, ch); t(x, lo(k) + 3, ch); o(x, lo(k) + 2, '^');
  if (period) pendulum([[x, lo(k) + 2], [x, lo(k) + 3]], 'y', period);
};
cut(0, 9, ',');
cut(2, 11, ',', 22);
cut(5, 8, ',', 18);
cut(7, 13, ':', 10);
cut(9, 9, ':', 10);

// --- スタート：奥の和室の襖を開けると、闇の中へ道が続いている ---
const SX = 5;
t(SX, 2, '.'); t(SX, 3, '.');
o(SX, 2, 'S'); o(SX - 1, 2, 'A'); o(SX - 1, 3, 'A');

// --- ゴール：最後の段の端から登った先、欠けに囲まれて扉が一枚だけ立っている ---
const GP = lo(RUNGS - 1) + 5;
const GX = rightEnd(RUNGS - 1) ? X1 : X0;
for (let p = lo(RUNGS - 1) + 2; p <= GP; p++) t(GX, p, '.');
for (const [x, p] of [[GX - 1, GP], [GX + 1, GP], [GX - 1, GP - 1], [GX + 1, GP - 1], [GX, GP + 1]]) t(x, p, ' ');
o(GX, GP, 'G');

// 行き止まりの路地。これまでの景色で見た物が、別のつながり方で闇に浮かぶ
const spur = (cells: [number, number][], end: [number, number], prop: string) => {
  for (const [x, p] of cells) t(x, p, '.');
  o(end[0], end[1], prop);
};
spur([[2, lo(1)], [1, lo(1)]], [0, lo(1)], 'H');
spur([[2, lo(3) + 1], [1, lo(3) + 1]], [0, lo(3) + 1], 'V');
spur([[2, lo(5)], [1, lo(5)]], [0, lo(5)], 'Z');
spur([[2, lo(8)], [1, lo(8)]], [0, lo(8)], 'N');
spur([[20, lo(2)]], [21, lo(2)], 'O');
spur([[20, lo(5) + 1]], [21, lo(5) + 1], 'X');
const deco = (x: number, p: number, prop: string) => {
  if (T[YO - p][x] !== '#') throw new Error(`飾りの位置 (${x},${p}) が空いていない`);
  o(x, p, prop);
};
for (const [k, x, prop] of [
  [0, 5, 'E'], [0, 15, 'L'], [1, 7, 'Q'], [1, 14, 'V'], [2, 4, 'U'], [2, 14, 'Z'], [3, 5, 'N'], [3, 16, 'O'],
  [4, 5, 'F'], [4, 16, 'E'], [5, 15, 'M'], [5, 5, 'Y'], [6, 7, 'C'], [7, 4, 'J'], [8, 16, 'L'], [9, 14, 'A'],
] as [number, number, string][]) deco(x, lo(k) + 2, prop);

// 床の見た目：段ごとに、これまでの景色（路地、庭、石畳、アスファルト、瓦屋根）と家の中（畳、板の間、土間）がつぎはぎに並ぶ。
// 1段の中でも、真ん中で別の景色につながっている
const PATCH = ['t', 'l', 'g', 's', 'w', 'r', 'a', 'c', 'g', 'l', 't', 'w'];
const F: string[][] = Array.from({ length: H }, () => Array(W).fill('t'));
for (let p = 0; p <= PMAX; p++) {
  const k = Math.max(0, Math.floor((p - lo(0)) / 4));
  for (let x = 0; x < W; x++) F[YO - p][x] = PATCH[(k + (x > 11 ? 1 : 0)) % PATCH.length];
}

// --- 得点マスの候補（文字ごとに4つの候補から2つ選ばれる） ---
for (const [x, p] of [[1, lo(1)], [1, lo(3) + 1], [20, lo(2)], [1, lo(5)]]) o(x, p, 'a');
for (const [x, p] of [[9, lo(0) + 3], [11, lo(2) + 3], [10, lo(3) + 1], [16, lo(4) + 1]]) o(x, p, 'b');
for (const [x, p] of [[8, lo(5) + 3], [20, lo(5) + 1], [12, lo(5) + 1], [9, lo(6) + 1]]) o(x, p, 'c');
for (const [x, p] of [[13, lo(7) + 3], [11, lo(8) + 1], [9, lo(9) + 3], [13, lo(10) + 1]]) o(x, p, 'd');

const terrain = T.map((r) => r.join(''));
const objects = O.map((r) => r.join(''));
const floors = F.map((r) => r.join(''));
const scores = { a: { value: 150, decay: 1, pick: 2 }, b: { value: 300, decay: 2, pick: 2 }, c: { value: 500, decay: 3, pick: 2 }, d: { value: 800, decay: 5, pick: 2 } };
const def: StageDef = { name: 'STAGE5', theme: 'house', bpm: BPM, bars: BARS, terrain, objects, floors, scores, hazards };
const st = new Stage(def);
const i = st.index(st.start.x, st.start.y);
console.log(`safe ${distanceField(st, { safeOnly: true })[i] / 4} beats, fast ${distanceField(st)[i] / 4} beats, song ${def.bars * 4}`);
if (process.env.SHOW) console.log(terrain.map((r, y) => `${String(y).padStart(2)} ${r}  ${objects[y]}`).join('\n'));

const OUT = path.resolve(import.meta.dirname, '../../src/game/stages/stage5.ts');
if (process.argv.includes('--write')) {
  const h = (x: HazardDef) => '    ' + JSON.stringify(x).replace(/"(\w+)":/g, '$1: ').replace(/"/g, "'").replace(/,(?=\S)/g, ', ') + ',';
  const src = `import type { StageDef } from '../stage.ts';

/**
 * STAGE 5 ｜ 入口：奥の和室 ｜ 景色：家に近い場所。これまでの景色が別のつながり方で再登場（企画書 第4.4節。入口・景色・危険物の割り当ては仮）
 *
 * 奥の和室の襖（画面の下）を開けると、闇の中を道が折り返しながら斜め右上へ登っていく。登りきった先に扉が一枚だけ立っている（ゴール）。
 * 段ごとに、これまでの景色（路地、庭、石畳、アスファルト、瓦屋根）と家の中（畳、板の間、土間）の床がつぎはぎに並び、
 * 玄関、縁側、商店、窓、石灯籠、アンテナなど、これまでに見た物が別のつながり方で闇に浮かぶ。
 * - 道は11段。各段の下の行は安全な道で、危険物も欠けもない（慣れていなくても、ここを歩けば戻されない）。
 * - 上の行は速い道（中間は八分、ゴール周辺は十六分）。家の中の物が危険物になる（第4.4節・第5.3節）：
 *   柱時計の振り子（闇に浮かぶ時計から下りた錘が、道の上を横切るように揺れる。定位置型）と、
 *   扇風機の首振り（段の間の闇に立つ扇風機が首を振り、頭が速い道の上を往復する。定位置型）。
 * - 段の間には一方通行の近道があり、振り子が横切る所もある。
 * - 危険物の割り当て（振り子、扇風機）は企画書の候補から選んだ仮のもの。二階への階段とエンディング（第2.3節・第4.6節）はまだない。
 * - 得点マスは文字ごとに4つの候補から2つずつ、プレイのたびに選ばれる（第2.2節の丸暗記対策）。
 *
 * この地図は tools/stagegen/stage5.ts で組み立てて書き出したもの。調整はスクリプト側で行い --write で書き出し直すか、
 * ここを手で直す（その場合スクリプトとずれる）。npm test が整合性と通れるかを、npm run bots がバランスを確かめる。
 */
// prettier-ignore
export const stage5: StageDef = {
  name: 'STAGE5',
  theme: 'house',
  bpm: ${def.bpm},
  bars: ${def.bars},
  terrain: [
${terrain.map((r) => `    '${r}',`).join('\n')}
  ],
  objects: [
${objects.map((r) => `    '${r}',`).join('\n')}
  ],
  floors: [
${floors.map((r) => `    '${r}',`).join('\n')}
  ],
  scores: {
${Object.entries(scores).map(([k, v]) => `    ${k}: { value: ${v.value}, decay: ${v.decay}, pick: ${v.pick} },`).join('\n')}
  },
  hazards: [
${hazards.map(h).join('\n')}
  ],
};
`;
  writeFileSync(OUT, src);
  console.log('wrote', path.relative(process.cwd(), OUT));
}
