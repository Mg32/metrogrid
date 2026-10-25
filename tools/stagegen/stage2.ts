// STAGE 2 の地図を組み立てて src/game/stages/stage2.ts を書き出す
//   node tools/stagegen/stage2.ts          所要時間を表示するだけ（SHOW=1 で地図も表示）
//   node tools/stagegen/stage2.ts --write  src/game/stages/stage2.ts を上書きする（手で直した分は消える）
//
// 道以外（'#'）は闇で、描かれない。道は闇に浮かぶ。
// スタート（縁側）は画面の下。STAGE1 とは逆に、段を折り返しながら -x へ登っていき、画面では斜め左上へ進む。
// 段と段の間の闇を用水路が流れていて、上流（ゴール側）から流されてくる物が下流へ流れていく。
// 組み立ては「進む向き p（スタートから 0, 1, …）」と「横 l」で考え、グリッドには x = XO − p、y = l で置く。
// 扉や小物の見える面は +x / +y 側なので、道が小物の −p 側（x の大きい側）か +l 側に来るように置く。
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { Stage, type HazardDef, type StageDef } from '../../src/game/stage.ts';
import { distanceField } from '../bots/nav.ts';

const BPM = 120;
const BARS = Number(process.env.BARS ?? 64);
const RUNGS = 11;
/** 段 k の下の行（安全）の p。上の行は +1、段の間（用水路の流れる闇）は +2〜+4 */
const lo = (k: number) => 4 + 5 * k;
const PMAX = lo(RUNGS - 1) + 7;
const XO = PMAX;
const W = PMAX + 1, H = 23;
const L0 = 3, L1 = 19;

const T: string[][] = Array.from({ length: H }, () => Array(W).fill('#'));
const O: string[][] = Array.from({ length: H }, () => Array(W).fill(' '));
const t = (p: number, l: number, ch: string) => { T[l][XO - p] = ch; };
const o = (p: number, l: number, ch: string) => { O[l][XO - p] = ch; };
const at = (p: number, l: number): [number, number] => [XO - p, l];
const row = (p: number, l0: number, l1: number, ch: string) => { for (let l = Math.min(l0, l1); l <= Math.max(l0, l1); l++) t(p, l, ch); };
const hazards: HazardDef[] = [];
/** 鹿威し：台（闇の上）から、隣の道のマスへ竹筒が打ち下ろされる。周期 period のうち [from, to) が危険 */
const shishi = (p: number, l: number, pivot: [number, number], period: number, from: number, to: number) =>
  hazards.push({ type: 'periodic', look: 'shishiodoshi', cells: [at(p, l)], pivot: at(...pivot), period, from, to });

// 段は 11 段。段 k は下の行 lo(k)（安全）と上の行 lo(k)+1 の2行で、l = 3〜19。
// 偶数段は +l へ、奇数段は −l へ歩き、端の連絡路（段の間の3行）で次の段へ登る。
// 安全な道（下の行と端の連絡路）には危険物も欠けも置かない（慣れていなくても、安全な道を歩けば戻されない）。
const rightEnd = (k: number) => k % 2 === 0;
for (let k = 0; k < RUNGS; k++) {
  row(lo(k), L0, L1, '.');
  // 上の行の両端の2マスは連絡路への角なので安全。中ほどの車線は段ごとに決める
  row(lo(k) + 1, L0, L0 + 1, '.');
  row(lo(k) + 1, L1 - 1, L1, '.');
  if (k < RUNGS - 1) { const l = rightEnd(k) ? L1 : L0; for (let d = 2; d <= 4; d++) t(lo(k) + d, l, '.'); }
}
const lane = (k: number, ch: string) => row(lo(k) + 1, L0 + 2, L1 - 2, ch);
// スタート周辺（段 0〜3）：2行とも安全で道幅が広い
for (const k of [0, 1, 2, 3]) lane(k, '.');
// 中間（段 4〜7）：上の行は八分の小径。鹿威しが打ち下ろされ、ところどころ踏み石が抜けている
for (const k of [4, 5, 6, 7]) lane(k, ',');
// ゴール周辺（段 8〜10）：上の行は十六分。抜けが多い
for (const k of [8, 9, 10]) lane(k, ':');
for (const [k, l] of [[5, 12], [6, 7], [7, 14], [8, 6], [8, 11], [8, 16], [9, 9], [9, 14], [10, 7], [10, 12], [10, 15]]) t(lo(k) + 1, l, ' ');

// --- 用水路：段の間の闇を流れる。段とは橋で交わる。水の中は歩けて速いが、上流から物が流されてくる ---
// 段 k と段 k+1 の間の用水路の横位置。下流（スタート側）の端と上流の端は橋（段の上の行と、次の段の下の行）
const CANAL = [11, 7, 14, 9, 13, 6, 12, 8, 15, 10];
CANAL.forEach((c, k) => {
  const rapid = k >= 7;
  for (let d = 2; d <= 4; d++) t(lo(k) + d, c, rapid ? '=' : '~');
  o(lo(k) + 1, c, '_');
  o(lo(k + 1), c, '_');
  // 上流 → 下流
  const cells = [4, 3, 2].map((d) => at(lo(k) + d, c));
  hazards.push(rapid ? { type: 'flow', cells, interval: 1, every: 9 } : { type: 'flow', cells, interval: 2, every: k < 3 ? 20 : 14 });
});

// --- 鹿威し：中間とゴール周辺の速い小径に打ち下ろされる。台は小径の奥（段の間の闇）に浮かぶ ---
shishi(lo(4) + 1, 9, [lo(4) + 2, 9], 16, 12, 16);
shishi(lo(5) + 1, 14, [lo(5) + 2, 14], 16, 4, 8);
shishi(lo(6) + 1, 10, [lo(6) + 2, 10], 16, 8, 12);
shishi(lo(7) + 1, 6, [lo(7) + 2, 6], 16, 0, 4);
shishi(lo(7) + 1, 11, [lo(7) + 2, 11], 16, 8, 12);
shishi(lo(9) + 1, 12, [lo(9) + 2, 12], 8, 4, 6);
shishi(lo(10) + 1, 9, [lo(10) + 2, 9], 8, 0, 2);
// ぐらつく踏み石（停止マス）：中間の連絡路
o(lo(5) + 3, L0, 'P');
o(lo(6) + 3, L1, 'P');

// --- スタート：縁側から庭へ降りる ---
const SL = 5;
t(2, SL, '.'); t(3, SL, '.');
o(2, SL, 'S');
o(2, SL - 1, 'V'); o(3, SL - 1, 'V'); o(1, SL - 1, 'V'); o(1, SL, 'O');

// --- ゴール：最後の段の端から登った先、抜けに囲まれて扉が一枚だけ立っている ---
const GP = lo(RUNGS - 1) + 5;
const GL = rightEnd(RUNGS - 1) ? L1 : L0;
for (let p = lo(RUNGS - 1) + 2; p <= GP; p++) t(p, GL, '.');
for (const [p, l] of [[GP, GL - 1], [GP, GL + 1], [GP - 1, GL - 1], [GP - 1, GL + 1], [GP + 1, GL]]) t(p, l, ' ');
o(GP, GL, 'G');

// 行き止まりの小径。−l へ伸びる先には隣家の勝手口、+l へ伸びる先には石灯籠や植木
const spur = (cells: [number, number][], end: [number, number], prop: string) => {
  for (const [p, l] of cells) t(p, l, '.');
  o(end[0], end[1], prop);
};
spur([[lo(1), 2], [lo(1), 1]], [lo(1), 0], 'E');
spur([[lo(2), 20], [lo(2), 21]], [lo(2), 22], 'O');
spur([[lo(3) + 1, 2], [lo(3) + 1, 1]], [lo(3) + 1, 0], 'E');
spur([[lo(4), 20], [lo(4), 21]], [lo(4), 22], 'Q');
spur([[lo(5), 2], [lo(5), 1]], [lo(5), 0], 'E');
spur([[lo(6) + 1, 20], [lo(6) + 1, 21]], [lo(6) + 1, 22], 'O');
spur([[lo(7), 2], [lo(7), 1]], [lo(7), 0], 'E');
spur([[lo(8), 20], [lo(8), 21]], [lo(8), 22], 'Q');
// 段の間の闇に浮かぶ石灯籠・植木・隣家の塀（用水路と鹿威しの台を避ける）
const used = new Set(hazards.flatMap((h) => (h.type === 'periodic' && h.pivot ? [h.pivot.join()] : [])));
const deco = (p: number, l: number, prop: string) => {
  if (T[l][XO - p] !== '#' || used.has(at(p, l).join())) throw new Error(`飾りの位置 (${p},${l}) が空いていない`);
  o(p, l, prop);
};
for (const [k, l, prop] of [
  [0, 5, 'O'], [0, 16, 'Y'], [1, 12, 'Q'], [1, 17, 'Y'], [2, 4, 'Y'], [2, 10, 'O'], [3, 15, 'Q'], [3, 5, 'Y'],
  [4, 16, 'O'], [5, 8, 'Y'], [5, 4, 'Q'], [6, 15, 'Y'], [7, 17, 'O'], [8, 5, 'Q'], [9, 16, 'O'], [9, 5, 'Y'],
] as [number, number, string][]) deco(lo(k) + 3, l, prop);

// --- 得点マスの候補（文字ごとに4つの候補から2つ選ばれる） ---
for (const [p, l] of [[lo(1), 1], [lo(2), 21], [lo(3) + 1, 1], [lo(4), 21]]) o(p, l, 'a');
for (const [p, l] of [[lo(0) + 3, CANAL[0]], [lo(1) + 3, CANAL[1]], [lo(2) + 3, CANAL[2]], [lo(5), 1]]) o(p, l, 'b');
for (const [p, l] of [[lo(4) + 1, 12], [lo(5) + 1, 8], [lo(6) + 3, CANAL[6]], [lo(6) + 1, 21]]) o(p, l, 'c');
for (const [p, l] of [[lo(8) + 3, CANAL[8]], [lo(9) + 1, 7], [lo(8) + 1, 13], [lo(7) + 3, CANAL[7]]]) o(p, l, 'd');

const terrain = T.map((r) => r.join(''));
const objects = O.map((r) => r.join(''));
const scores = { a: { value: 150, decay: 1, pick: 2 }, b: { value: 300, decay: 2, pick: 2 }, c: { value: 500, decay: 3, pick: 2 }, d: { value: 800, decay: 5, pick: 2 } };
const def: StageDef = { name: 'STAGE2', theme: 'garden', bpm: BPM, bars: BARS, terrain, objects, scores, hazards };
const st = new Stage(def);
const i = st.index(st.start.x, st.start.y);
console.log(`safe ${distanceField(st, { safeOnly: true })[i] / 4} beats, fast ${distanceField(st)[i] / 4} beats, song ${def.bars * 4}`);
if (process.env.SHOW) console.log(terrain.map((r, y) => `${String(y).padStart(2)} ${r}  ${objects[y]}`).join('\n'));

const OUT = path.resolve(import.meta.dirname, '../../src/game/stages/stage2.ts');
if (process.argv.includes('--write')) {
  const h = (x: HazardDef) => '    ' + JSON.stringify(x).replace(/"(\w+)":/g, '$1: ').replace(/"/g, "'").replace(/,(?=\S)/g, ', ') + ',';
  const src = `import type { StageDef } from '../stage.ts';

/**
 * STAGE 2 ｜ 入口：縁側 ｜ 景色：庭と、隣家との間を流れる用水路（企画書 第4.4節。入口・景色・危険物の割り当ては仮）
 *
 * 縁側（画面の下）から庭へ降りると、飛び石の小径が折り返しながら斜め左上へ登っていく。登りきった先に扉が一枚だけ立っている（ゴール）。
 * 段と段の間の闇を用水路が流れていて、小径とは橋で交わる。
 * - 小径は11段。各段の下の行は安全な道で、危険物も抜けもない（慣れていなくても、ここを歩けば戻されない）。
 * - 用水路は浅く、歩いて入れる。水の中は速い（八分。上流の3本は十六分の早瀬）ので、段を飛ばして登る近道になる。
 *   そのかわり上流から、家から失われた物（人形、表札、子どもの靴）が流されてくる（第5.3節「流されていく物」をステージ全体で使う）。
 *   橋の上で待って、流れてくる物の切れ目に水へ入る。
 * - 上の行は速い小径（中間は八分、ゴール周辺は十六分）。鹿威しが拍に合わせて打ち下ろされ、踏み石の抜けた所がある。
 * - 連絡路にはぐらつく踏み石（停止マス。第5.4節の見た目の案）がある。
 * - 危険物の割り当て（流されていく物、鹿威し）は企画書の候補から選んだ仮のもの。水車は使っていない。
 * - 得点マスは文字ごとに4つの候補から2つずつ、プレイのたびに選ばれる（第2.2節の丸暗記対策）。
 *
 * この地図は tools/stagegen/stage2.ts で組み立てて書き出したもの。調整はスクリプト側で行い --write で書き出し直すか、
 * ここを手で直す（その場合スクリプトとずれる）。npm test が整合性と通れるかを、npm run bots がバランスを確かめる。
 */
// prettier-ignore
export const stage2: StageDef = {
  name: 'STAGE2',
  theme: 'garden',
  bpm: ${def.bpm},
  bars: ${def.bars},
  terrain: [
${terrain.map((r) => `    '${r}',`).join('\n')}
  ],
  objects: [
${objects.map((r) => `    '${r}',`).join('\n')}
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
