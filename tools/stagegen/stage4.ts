// STAGE 4 の地図を組み立てて src/game/stages/stage4.ts を書き出す
//   node tools/stagegen/stage4.ts          所要時間を表示するだけ（SHOW=1 で地図も表示）
//   node tools/stagegen/stage4.ts --write  src/game/stages/stage4.ts を上書きする（手で直した分は消える）
//
// 道以外（'#'）は闇で、描かれない。道は闇に浮かぶ。
// スタート（台所の勝手口）は画面の下。家の裏手に連なる屋根の棟を、折り返しながら -x へ登っていき、画面では斜め左上へ進む。
// 屋根と屋根の間は物干し台の板でつながっている。屋根の斜面を近道すると、上の屋根から雪が滑り落ちてくる。
// 組み立ては「進む向き p（スタートから 0, 1, …）」と「横 l」で考え、グリッドには x = XO − p、y = l で置く。
// 扉や小物の見える面は +x / +y 側なので、道が小物の −p 側（x の大きい側）か +l 側に来るように置く。
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
const XO = PMAX;
const W = PMAX + 1, H = 23;
const L0 = 3, L1 = 19;

const T: string[][] = Array.from({ length: H }, () => Array(W).fill('#'));
const O: string[][] = Array.from({ length: H }, () => Array(W).fill(' '));
const F: string[][] = Array.from({ length: H }, () => Array(W).fill('r'));
const t = (p: number, l: number, ch: string) => { T[l][XO - p] = ch; };
const o = (p: number, l: number, ch: string) => { O[l][XO - p] = ch; };
const f = (p: number, l: number, ch: string) => { F[l][XO - p] = ch; };
const at = (p: number, l: number): [number, number] => [XO - p, l];
const row = (p: number, l0: number, l1: number, ch: string) => { for (let l = Math.min(l0, l1); l <= Math.max(l0, l1); l++) t(p, l, ch); };
const hazards: HazardDef[] = [];
/** 色あせた鯉のぼり：段の上の行（速い道）の l0〜l1 を、3マス分の胴で往復して泳ぐ */
const koinobori = (k: number, interval: number, l0 = L0 + 2, l1 = L1 - 2) =>
  hazards.push({ type: 'patrol', look: 'koinobori', length: 3, interval, waypoints: [at(lo(k) + 1, l0), at(lo(k) + 1, l1)] });
/** 屋根から滑り落ちる雪：cells（上 → 下）を、周期 period のうち [0, dur) の間に滑り落ちる */
const snow = (cells: [number, number][], period: number, dur: number, pivot?: [number, number]) =>
  hazards.push({ type: 'periodic', look: 'snow', cells: cells.map(([p, l]) => at(p, l)), period, from: 0, to: dur, ...(pivot ? { pivot: at(...pivot) } : {}) });

// 屋根の棟は 11 段。段 k は下の行 lo(k)（安全。棟の上の歩み板）と上の行 lo(k)+1（瓦の斜面）の2行で、l = 3〜19。
// 偶数段は +l へ、奇数段は −l へ歩き、端の連絡路（物干し台の板）で次の段へ登る。
// 安全な道（下の行と端の連絡路）には危険物も欠けも置かない（慣れていなくても、安全な道を歩けば戻されない）。
const rightEnd = (k: number) => k % 2 === 0;
for (let k = 0; k < RUNGS; k++) {
  row(lo(k), L0, L1, '.');
  row(lo(k) + 1, L0, L0 + 1, '.');
  row(lo(k) + 1, L1 - 1, L1, '.');
  if (k < RUNGS - 1) {
    const l = rightEnd(k) ? L1 : L0;
    for (const d of [2, 3]) { t(lo(k) + d, l, '.'); f(lo(k) + d, l, 'w'); }
  }
}
const lane = (k: number, ch: string) => row(lo(k) + 1, L0 + 2, L1 - 2, ch);
// スタート周辺（段 0〜2）：2行とも安全で道幅が広い
for (const k of [0, 1, 2]) lane(k, '.');
// 中間（段 3〜6）：上の行は八分。鯉のぼりが泳ぐ
for (const k of [3, 4, 5, 6]) lane(k, ',');
koinobori(3, 2);
koinobori(5, 2);
// ゴール周辺（段 7〜10）：上の行は十六分。瓦の抜けが多く、上の屋根の軒から雪が落ちてくる
for (const k of [7, 8, 9, 10]) lane(k, ':');
// 十六分の道では、端で折り返してくる鯉のぼりと鉢合わせないよう、道の中ほどだけを泳ぐ
koinobori(8, 1, 8, 13);
for (const [k, l] of [[4, 7], [4, 15], [6, 9], [7, 6], [7, 12], [9, 6], [9, 14], [10, 9], [10, 15]]) t(lo(k) + 1, l, ' ');
snow([[lo(7) + 1, 9]], 26, 4, [lo(7) + 2, 9]);
snow([[lo(9) + 1, 11]], 22, 4, [lo(9) + 2, 11]);
snow([[lo(10) + 1, 12]], 26, 4, [lo(10) + 2, 12]);
// 段の間の近道（一方通行・危険）：上の屋根の斜面を滑り降りるように登る。雪が滑り落ちてくる所もある
const cut = (k: number, l: number, ch: string, period?: number) => {
  t(lo(k) + 2, l, ch); t(lo(k) + 3, l, ch); o(lo(k) + 2, l, '<');
  if (period) snow([[lo(k) + 3, l], [lo(k) + 2, l]], period, 6);
};
cut(0, 11, ',');
cut(2, 9, ',', 22);
cut(5, 10, ',', 26);
cut(7, 13, ':', 18);
cut(9, 8, ':', 18);

// --- スタート：台所の勝手口から屋根へ出る ---
const SL = 5;
t(2, SL, '.'); t(3, SL, '.');
f(2, SL, 'w'); f(3, SL, 'w');
o(2, SL, 'S'); o(2, SL - 1, 'E'); o(3, SL - 1, 'L');

// --- ゴール：最後の段の端から登った先、欠けに囲まれて扉が一枚だけ立っている ---
const GP = lo(RUNGS - 1) + 5;
const GL = rightEnd(RUNGS - 1) ? L1 : L0;
for (let p = lo(RUNGS - 1) + 2; p <= GP; p++) { t(p, GL, '.'); f(p, GL, 'w'); }
for (const [p, l] of [[GP, GL - 1], [GP, GL + 1], [GP - 1, GL - 1], [GP - 1, GL + 1], [GP + 1, GL]]) t(p, l, ' ');
o(GP, GL, 'G');

// 行き止まりの物干し台。端に物干し、アンテナ、煙突が立つ
const spur = (cells: [number, number][], end: [number, number], prop: string) => {
  for (const [p, l] of cells) { t(p, l, '.'); f(p, l, 'w'); }
  o(end[0], end[1], prop);
};
spur([[lo(1), 2], [lo(1), 1]], [lo(1), 0], 'F');
spur([[lo(3) + 1, 2], [lo(3) + 1, 1]], [lo(3) + 1, 0], 'X');
spur([[lo(5), 2], [lo(5), 1]], [lo(5), 0], 'F');
spur([[lo(8), 2], [lo(8), 1]], [lo(8), 0], 'C');
spur([[lo(2), 20]], [lo(2), 21], 'X');
spur([[lo(5) + 1, 20]], [lo(5) + 1, 21], 'L');
// 段の間の闇に浮かぶアンテナ・煙突・物干し・街灯
const deco = (p: number, l: number, prop: string) => {
  if (T[l][XO - p] !== '#') throw new Error(`飾りの位置 (${p},${l}) が空いていない`);
  o(p, l, prop);
};
for (const [k, l, prop] of [
  [0, 5, 'X'], [0, 15, 'C'], [1, 7, 'F'], [1, 14, 'X'], [2, 4, 'L'], [2, 13, 'X'], [3, 6, 'C'], [3, 15, 'X'],
  [4, 5, 'F'], [4, 14, 'X'], [5, 15, 'L'], [5, 6, 'X'], [6, 12, 'C'], [7, 5, 'X'], [8, 15, 'F'], [9, 12, 'X'],
] as [number, number, string][]) deco(lo(k) + 2, l, prop);

// --- 得点マスの候補（文字ごとに4つの候補から2つ選ばれる） ---
for (const [p, l] of [[lo(1), 1], [lo(3) + 1, 1], [lo(2), 20], [lo(5), 1]]) o(p, l, 'a');
for (const [p, l] of [[lo(0) + 3, 11], [lo(2) + 3, 9], [lo(3) + 1, 8], [lo(4) + 1, 13]]) o(p, l, 'b');
for (const [p, l] of [[lo(5) + 3, 10], [lo(5) + 1, 12], [lo(6) + 1, 6], [lo(5) + 1, 20]]) o(p, l, 'c');
for (const [p, l] of [[lo(7) + 3, 13], [lo(8) + 1, 10], [lo(9) + 3, 8], [lo(10) + 1, 6]]) o(p, l, 'd');

const terrain = T.map((r) => r.join(''));
const objects = O.map((r) => r.join(''));
const floors = F.map((r) => r.join(''));
const scores = { a: { value: 150, decay: 1, pick: 2 }, b: { value: 300, decay: 2, pick: 2 }, c: { value: 500, decay: 3, pick: 2 }, d: { value: 800, decay: 5, pick: 2 } };
const def: StageDef = { name: 'STAGE4', theme: 'roof', bpm: BPM, bars: BARS, terrain, objects, floors, scores, hazards };
const st = new Stage(def);
const i = st.index(st.start.x, st.start.y);
console.log(`safe ${distanceField(st, { safeOnly: true })[i] / 4} beats, fast ${distanceField(st)[i] / 4} beats, song ${def.bars * 4}`);
if (process.env.SHOW) console.log(terrain.map((r, y) => `${String(y).padStart(2)} ${r}  ${objects[y]}`).join('\n'));

const OUT = path.resolve(import.meta.dirname, '../../src/game/stages/stage4.ts');
if (process.argv.includes('--write')) {
  const h = (x: HazardDef) => '    ' + JSON.stringify(x).replace(/"(\w+)":/g, '$1: ').replace(/"/g, "'").replace(/,(?=\S)/g, ', ') + ',';
  const src = `import type { StageDef } from '../stage.ts';

/**
 * STAGE 4 ｜ 入口：台所の勝手口 ｜ 景色：裏手の屋根の連なり（企画書 第4.4節。入口・景色・危険物の割り当ては仮）
 *
 * 台所の勝手口（画面の下）から屋根へ出ると、瓦屋根の棟が折り返しながら斜め左上へ連なっていく。登りきった先に扉が一枚だけ立っている（ゴール）。
 * 屋根と屋根の間は物干し台の板でつながり、テレビのアンテナ、煙突、物干しが闇に浮かぶ。
 * - 棟は11段。各段の下の行（棟の上の歩み板）は安全な道で、危険物も欠けもない（慣れていなくても、ここを歩けば戻されない）。
 * - 上の行（瓦の斜面）は速い道（中間は八分、ゴール周辺は十六分）。竿から外れた色あせた鯉のぼりが、3マス分の胴で斜面を往復して泳ぐ
 *   （第5.3節「色あせた鯉のぼり」。巡回型）。同じ向きに歩けば追いつかれず、鉢合わせたら下の行へよければよい。
 * - 段の間には一方通行の近道（上の屋根の斜面）がある。上の屋根から雪が滑り落ちてくる所がある（第5.3節「屋根から滑り落ちる雪」。定位置型）。
 *   ゴール周辺では上の屋根の軒から速い道へも雪が落ちてくる。落ちる1拍前に点滅して知らせる。
 * - 瓦の抜けた所（欠け）がある。
 * - 危険物の割り当て（鯉のぼり、雪）は企画書の候補から選んだ仮のもの。
 * - 得点マスは文字ごとに4つの候補から2つずつ、プレイのたびに選ばれる（第2.2節の丸暗記対策）。
 *
 * この地図は tools/stagegen/stage4.ts で組み立てて書き出したもの。調整はスクリプト側で行い --write で書き出し直すか、
 * ここを手で直す（その場合スクリプトとずれる）。npm test が整合性と通れるかを、npm run bots がバランスを確かめる。
 */
// prettier-ignore
export const stage4: StageDef = {
  name: 'STAGE4',
  theme: 'roof',
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
