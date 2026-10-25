// STAGE 1 の地図を組み立てて src/game/stages/stage1.ts を書き出す
//   node tools/stagegen/stage1.ts          所要時間を表示するだけ（SHOW=1 で地図も表示）
//   node tools/stagegen/stage1.ts --write  src/game/stages/stage1.ts を上書きする（手で直した分は消える）
//
// 道以外（'#'）は闇で、描かれない。道は闇に浮かぶ。
// スタートは画面の下（y が大きい側）。横に延びる路地（x 方向）を折り返しながら -y へ登っていき、画面では斜め右上へ進む。
// 扉や家の入口は +x / +y 側の面しか見えないので、道がその側に来るように置く。
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { Stage, type HazardDef, type StageDef } from '../../src/game/stage.ts';
import { distanceField } from '../bots/nav.ts';

const BPM = 100;
const BARS = Number(process.env.BARS ?? 50);
const W = 25, H = 41;
const T: string[][] = Array.from({ length: H }, () => Array(W).fill('#'));
const O: string[][] = Array.from({ length: H }, () => Array(W).fill(' '));
const t = (x: number, y: number, ch: string) => { T[y][x] = ch; };
const o = (x: number, y: number, ch: string) => { O[y][x] = ch; };
const hline = (y: number, x0: number, x1: number, ch: string) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) t(x, y, ch); };
const hazards: HazardDef[] = [];
const swing = (cells: [number, number][], axis: 'x' | 'y', period: number) => hazards.push({ type: 'swing', cells, axis, period });
/** 回旋塔。柱のまわりの8マスを空き地（zone の床）にする */
const kaisento = (px: number, py: number, interval: number, zone: string) => {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) t(px + dx, py + dy, zone);
  t(px, py, '#'); o(px, py, 'T');
  hazards.push({ type: 'patrol', look: 'kaisento', pivot: [px, py], waypoints: [[px - 1, py - 1], [px + 1, py - 1], [px + 1, py + 1], [px - 1, py + 1]], loop: true, interval });
};

// 横に延びる路地（段）は 8 段。段 k は下の行 lo(k)（安全）と上の行 lo(k)-1 の2車線で、x = 3〜21。
// 段と段の間は2行の闇。偶数段は右へ、奇数段は左へ歩き、端の連絡路で次の段へ登る。
// 安全な道（下の行と端の連絡路）には危険物も欠けも置かない。ミスすると安全ゾーンに入った所まで戻されるので、
// 慣れていなくても安全な道を歩いていれば戻されない。危険物と欠けは、速い車線（上の行）と近道にだけある。
const X0 = 3, X1 = 21;
const lo = (k: number) => 36 - 4 * k;
const rightEnd = (k: number) => k % 2 === 0;
/** 段 k の上の行の車線。両端の2マスは連絡路への角なので安全 */
const lane = (k: number, ch: string) => { const y = lo(k) - 1; hline(y, X0 + 2, X1 - 2, ch); hline(y, X0, X0 + 1, '.'); hline(y, X1 - 1, X1, '.'); };
for (let k = 0; k < 8; k++) {
  hline(lo(k), X0, X1, '.');
  // 端の連絡路（段 k の上の行から段 k+1 の下の行へ、間の2行）
  if (k < 7) { const x = rightEnd(k) ? X1 : X0; t(x, lo(k) - 2, '.'); t(x, lo(k) - 3, '.'); }
}

// --- スタート周辺（段 0〜2）：道幅が広く全部安全。近道は危険ゾーンだが危険物はまばら ---
for (const k of [0, 1, 2]) hline(lo(k) - 1, X0, X1, '.');
for (const k of [0, 1]) { const x = rightEnd(k) ? X1 - 1 : X0 + 1; t(x, lo(k) - 2, '.'); t(x, lo(k) - 3, '.'); } // 連絡路も2車線
// 近道（段の途中から次の段へ）
t(15, lo(0) - 2, ','); t(15, lo(0) - 3, ',');
t(9, lo(1) - 2, ','); t(9, lo(1) - 3, ','); swing([[9, lo(1) - 3], [9, lo(1) - 2]], 'y', 28);
t(14, lo(2) - 2, ','); t(14, lo(2) - 3, ','); swing([[14, lo(2) - 3], [14, lo(2) - 2]], 'y', 24);

// --- 中間（段 3〜5）：上の行は八分の速い車線。小節ゲート、停止マス、回旋塔が現れる ---
for (const k of [3, 4, 5]) lane(k, ',');
for (const [x, y] of [[8, lo(3) - 1], [16, lo(4) - 1], [11, lo(5) - 1]]) t(x, y, ' '); // 速い車線の欠け
swing([[12, lo(3) - 1], [13, lo(3) - 1], [14, lo(3) - 1]], 'x', 20);
swing([[14, lo(5) - 1], [15, lo(5) - 1], [16, lo(5) - 1]], 'x', 20);
o(X0, lo(3) - 2, 'P'); // 連絡路の停止マス
kaisento(10, lo(3) - 2, 8, ','); // 空き地を抜ける近道
t(16, lo(4) - 2, ','); t(16, lo(4) - 3, ','); o(16, lo(4) - 3, 'B'); // 小節ゲートのある近道
t(8, lo(5) - 2, ','); t(8, lo(5) - 3, ','); swing([[8, lo(5) - 3], [8, lo(5) - 2]], 'y', 12);

// --- ゴール周辺（段 6〜7）：上の行は十六分。欠けが多く、近道は一方通行で遊具が速い ---
for (const k of [6, 7]) lane(k, ':');
for (const [x, y] of [[7, lo(6) - 1], [12, lo(6) - 1], [17, lo(6) - 1], [9, lo(7) - 1], [14, lo(7) - 1]]) t(x, y, ' ');
t(13, lo(6) - 2, ':'); t(13, lo(6) - 3, ':'); o(13, lo(6) - 2, '^'); swing([[13, lo(6) - 3], [13, lo(6) - 2]], 'y', 8);
swing([[18, lo(6) - 1], [19, lo(6) - 1]], 'x', 10);
swing([[5, lo(7) - 1], [6, lo(7) - 1], [7, lo(7) - 1]], 'x', 12);

// --- スタート：段 0 の下に玄関。少女の家の玄関から路地へ出る ---
const SX = 5;
t(SX, lo(0) + 1, '.'); t(SX, lo(0) + 2, '.');
o(SX, lo(0) + 2, 'S'); o(SX - 1, lo(0) + 2, 'H'); o(SX - 1, lo(0) + 1, 'K'); o(SX + 1, lo(0) + 2, 'M'); o(SX + 1, lo(0) + 3, 'L');

// --- ゴール：最後の段の左端から登った先、欠けに囲まれて扉が一枚だけ立っている ---
const GX = X0, GY = lo(7) - 5;
for (let y = GY; y <= lo(7) - 2; y++) t(GX, y, '.');
for (const [x, y] of [[GX - 1, GY], [GX + 1, GY], [GX - 1, GY + 1], [GX + 1, GY + 1], [GX, GY - 1]]) t(x, y, ' ');
o(GX, GY, 'G');

// 行き止まりの路地。-x へ伸びる先にはほかの家の入口、+x へ伸びる先には街灯
const spur = (cells: [number, number][], end: [number, number], prop: string) => {
  for (const [x, y] of cells) t(x, y, '.');
  o(end[0], end[1], prop);
};
spur([[2, lo(0)], [1, lo(0)]], [0, lo(0)], 'E');
spur([[22, lo(1)], [23, lo(1)]], [24, lo(1)], 'L');
spur([[2, lo(2) - 1], [1, lo(2) - 1]], [0, lo(2) - 1], 'E');
spur([[22, lo(3)], [23, lo(3)]], [24, lo(3)], 'L');
spur([[2, lo(4)], [1, lo(4)]], [0, lo(4)], 'E');
spur([[22, lo(5)], [23, lo(5)]], [24, lo(5)], 'L');
spur([[2, lo(6)], [1, lo(6)]], [0, lo(6)], 'E');
// 闇に浮かぶ街灯と、ほかの家の入口の断片（段の間の闇。入口は +y 側の段から見える）
for (const [x, y] of [[6, lo(0) - 2], [18, lo(1) - 3], [5, lo(2) - 3], [19, lo(3) - 3], [4, lo(4) - 3], [12, lo(5) - 3], [20, lo(6) - 3], [10, lo(7) - 2]]) o(x, y, 'L');
for (const [x, y] of [[11, lo(0) - 2], [17, lo(2) - 2], [6, lo(3) - 2], [12, lo(4) - 2], [16, lo(6) - 2]]) o(x, y, 'E');

// --- 得点マスの候補（文字ごとに4つの候補から2つ選ばれる） ---
for (const [x, y] of [[1, lo(0)], [23, lo(1)], [1, lo(2) - 1], [23, lo(3)]]) o(x, y, 'a');
for (const [x, y] of [[15, lo(0) - 3], [9, lo(1) - 3], [14, lo(2) - 3], [1, lo(4)]]) o(x, y, 'b');
for (const [x, y] of [[9, lo(3) - 3], [16, lo(4) - 2], [8, lo(5) - 3], [23, lo(5)]]) o(x, y, 'c');
for (const [x, y] of [[13, lo(6) - 3], [10, lo(6) - 1], [16, lo(7) - 1], [1, lo(6)]]) o(x, y, 'd');

for (const row of O) for (let x = 0; x < W; x++) if (row[x] === undefined) row[x] = ' ';
const terrain = T.map((r) => r.join(''));
const objects = O.map((r) => r.join(''));
const scores = { a: { value: 150, decay: 1, pick: 2 }, b: { value: 300, decay: 2, pick: 2 }, c: { value: 500, decay: 3, pick: 2 }, d: { value: 800, decay: 5, pick: 2 } };
const def: StageDef = { name: 'STAGE1', bpm: BPM, bars: BARS, terrain, objects, scores, hazards };
const st = new Stage(def);
const i = st.index(st.start.x, st.start.y);
console.log(`safe ${distanceField(st, { safeOnly: true })[i] / 4} beats, fast ${distanceField(st)[i] / 4} beats, song ${def.bars * 4}`);
if (process.env.SHOW) console.log(terrain.map((r, y) => `${String(y).padStart(2)} ${r}  ${objects[y]}`).join('\n'));

const OUT = path.resolve(import.meta.dirname, '../../src/game/stages/stage1.ts');
if (process.argv.includes('--write')) {
  const h = (x: HazardDef) => '    ' + JSON.stringify(x).replace(/"(\w+)":/g, '$1: ').replace(/"/g, "'").replace(/,(?=\S)/g, ', ') + ',';
  const src = `import type { StageDef } from '../stage.ts';

/**
 * STAGE 1 ｜ 入口：玄関 ｜ 景色：家の前の路地（企画書 第4.4節。入口・景色・危険物の割り当ては仮）
 *
 * 闇に浮かぶ玄関（画面の下）から、暗い路地が折り返しながら斜め上へ登っていく。登りきった先に、欠けに囲まれて扉が一枚だけ立っている（ゴール）。
 * 道の外は何もない闇。路地の端からは行き止まりの路地が闇へ伸び、その先にほかの家の入口や街灯が浮かんでいる。
 * - 横に延びる路地は8段。各段の下の車線は景色がくっきりした安全な道で、危険物も欠けもない（慣れていなくても、ここを歩けば戻されない）。
 * - 上の車線と段をまたぐ近道が危険ゾーン。上の段ほど薄く（八分 → 十六分）、欠けが増え、遊具が速く動く（第2.2節「ゴールに近いほど難しくなる」）。
 *   スタート周辺の3段は道幅が広く、全部安全。
 * - 安全な道だけでゴールすると、曲の長さほぼいっぱいかかる。
 * - 危険物は撤去された公園の遊具（第5.3節）。回旋塔は空き地で回り、箱ブランコは近道と速い車線を揺れる。誰も乗っていない。
 * - 得点マスは文字ごとに4つの候補から2つずつ、プレイのたびに選ばれる（第2.2節の丸暗記対策）。
 *
 * この地図は tools/stagegen/stage1.ts で組み立てて書き出したもの。調整はスクリプト側で行い --write で書き出し直すか、
 * ここを手で直す（その場合スクリプトとずれる）。npm test が整合性と通れるかを、npm run bots がバランスを確かめる。
 */
// prettier-ignore
export const stage1: StageDef = {
  name: 'STAGE1',
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
