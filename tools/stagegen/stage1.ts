// STAGE 1 の地図を組み立て、上下を反転して src/game/stages/stage1.ts を書き出す
//   node tools/stagegen/stage1.ts          所要時間を表示するだけ（SHOW=1 で地図も表示）
//   node tools/stagegen/stage1.ts --write  src/game/stages/stage1.ts を上書きする（手で直した分は消える）
//
// 道以外（'#'）は闇で、描かれない。道は闇に浮かぶ。
// 前半は論理座標（スタートが下）で組み、反転（y → 30 - y）してスタートを画面の奥に置く。
// 後半の「反転後」の部分は、画面に見える向き（扉は +x / +y 側からしか見えない）を考えて最終座標で置く。
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { Stage, type HazardDef, type StageDef } from '../../src/game/stage.ts';
import { distanceField } from '../bots/nav.ts';

const BPM = 100;
const BARS = Number(process.env.BARS ?? 52);
const N = 31, C = 15;
let T: string[][] = Array.from({ length: N }, () => Array(N).fill('#'));
let O: string[][] = Array.from({ length: N }, () => Array(N).fill(' '));
const dOf = (x: number, y: number) => Math.max(Math.abs(x - C), Math.abs(y - C));
const each = (f: (x: number, y: number, d: number) => void) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) f(x, y, dOf(x, y)); };
const t = (x: number, y: number, ch: string) => { T[y][x] = ch; };
const o = (x: number, y: number, ch: string) => { O[y][x] = ch; };
const hazards: HazardDef[] = [];
const swing = (cells: [number, number][], axis: 'x' | 'y', period: number) => hazards.push({ type: 'swing', cells, axis, period });
/** 回旋塔。柱のまわりの8マスを、空き地として床にする */
const kaisento = (px: number, py: number, interval: number) => {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (T[py + dy][px + dx] === '#') t(px + dx, py + dy, '.');
  t(px, py, '#'); o(px, py, 'T');
  hazards.push({ type: 'patrol', look: 'kaisento', pivot: [px, py], waypoints: [[px - 1, py - 1], [px + 1, py - 1], [px + 1, py + 1], [px - 1, py + 1]], loop: true, interval });
};

// 3つの環状の路地（各2車線）。環と環の間は2マスの闇
//   R1 (d=12 外, d=11 内)  R2 (d=8 外, d=7 内)  R3 (d=4 外, d=3 内)  中心 d<=1
// 外側の車線は景色がくっきりした安全な道、内側の車線は外の環ほど安全寄り、内の環ほど薄い
each((x, y, d) => {
  if (d === 12 || d === 11 || d === 8 || d === 4) t(x, y, '.');
  if (d === 7) t(x, y, ',');
  if (d === 3) t(x, y, ':');
});

// --- R1：スタート周辺。道幅が広く、ほぼ安全。入ってすぐ右が欠けていて、ほぼ1周する ---
for (let y = 26; y <= 27; y++) { t(17, y, ' '); t(18, y, ' '); }
each((x, y, d) => { if (d === 11 && y === 4 && x >= 6 && x <= 24) t(x, y, ','); }); // 上辺の内側の車線は景色が薄い
t(20, 25, '.'); t(20, 24, '.'); o(20, 25, 'B'); // R1→R2（遮断機）
o(9, 27, 'P');
kaisento(4, 4, 8); // 左上の角の空き地
swing([[3, 18], [4, 18]], 'x', 28);
swing([[20, 3], [20, 4]], 'y', 24);
swing([[26, 12], [27, 12]], 'x', 24);

// --- R2：内側の車線は八分。右下が欠けていて、左回りにほぼ1周する ---
for (let y = 20; y <= 21; y++) { t(22, y, ' '); t(23, y, ' '); }
for (const [x, y] of [[12, 8], [8, 17]]) t(x, y, ' '); // 内側の車線の欠け
t(22, 18, '.'); t(21, 18, '.'); t(20, 18, '.'); // R2→R3
o(7, 15, 'P');
kaisento(8, 22, 8); // 左下の角の空き地
swing([[13, 22], [13, 23]], 'y', 20);
swing([[18, 7], [18, 8]], 'y', 20);
swing([[22, 12], [23, 12]], 'x', 20);
// 近道：R2 の左辺から R3 の左辺へ。一方通行、高危険、箱ブランコが横切る
t(9, 15, ':'); t(10, 15, ':'); o(10, 15, '>'); swing([[10, 15]], 'y', 8);

// --- R3：内側の車線は十六分で、ところどころ欠けている。右辺の入口のすぐ上が欠けていて、ほぼ1周する ---
for (let y = 16; y <= 17; y++) { t(18, y, ' '); t(19, y, ' '); }
for (const [x, y] of [[12, 12], [16, 18]]) t(x, y, ' ');
t(18, 15, '.'); t(17, 15, '.'); t(16, 15, '.'); // R3→中心
swing([[11, 13], [12, 13]], 'x', 20);
swing([[17, 11], [17, 12]], 'y', 20);
swing([[14, 18], [14, 19]], 'y', 20);

// --- 中心：欠けに囲まれて立つ扉（ゴール） ---
each((x, y, d) => { if (d <= 1) t(x, y, ' '); });
t(16, 15, '.'); t(15, 15, '.'); o(15, 15, 'G');

// --- 得点マスの候補（文字ごとに2つ選ばれる）。a は反転後に置く ---
for (const [x, y] of [[8, 15], [15, 8], [22, 15], [15, 22]]) o(x, y, 'b');
for (const [x, y] of [[11, 11], [19, 11], [11, 19], [7, 7]]) o(x, y, 'c');
for (const [x, y] of [[13, 12], [18, 12], [12, 18], [18, 18]]) o(x, y, 'd');

// === 上下を反転 ===
const F = (y: number) => N - 1 - y;
const flipObj: Record<string, string> = { '^': 'v', v: '^' };
T = T.slice().reverse();
O = O.slice().reverse().map((r) => r.map((c) => flipObj[c] ?? c));
const fl = (p: number[]) => [p[0], F(p[1])] as [number, number];
const flipped: HazardDef[] = hazards.map((h) => {
  if (h.type === 'patrol') return { ...h, waypoints: h.waypoints.map(fl), pivot: h.pivot && fl(h.pivot) };
  if (h.type === 'swing') return { ...h, cells: h.cells.map(fl).sort((a, b) => a[0] - b[0] || a[1] - b[1]) };
  return { ...h, cells: h.cells.map(fl) };
});

// === 反転後の座標で置くもの ===
// 玄関：R1 の上辺から闇へ短い道が伸び、その先に少女の家の玄関が浮かんでいる
t(15, 2, '.'); t(15, 1, '.');
o(15, 1, 'S'); o(15, 0, 'H'); o(14, 1, 'K'); o(16, 1, 'K'); o(17, 2, 'M'); o(13, 2, 'L');
// 行き止まりの路地。奥（-x / -y）へ伸びる先にはほかの家の入口、手前（+x / +y）へ伸びる先には街灯
const spur = (cells: [number, number][], end: [number, number], prop: string) => {
  for (const [x, y] of cells) t(x, y, '.');
  o(end[0], end[1], prop);
};
spur([[2, 9], [1, 9]], [0, 9], 'E');
spur([[2, 21], [1, 21]], [0, 21], 'E');
spur([[8, 2], [8, 1]], [8, 0], 'E');
spur([[22, 2], [22, 1]], [22, 0], 'E');
spur([[28, 16], [29, 16]], [30, 16], 'L');
spur([[10, 28], [10, 29]], [10, 30], 'L');
for (const [x, y] of [[1, 9], [1, 21], [8, 1], [29, 16]]) o(x, y, 'a');
// 闇に浮かぶ街灯と、ほかの家の入口の断片
for (const [x, y] of [[5, 15], [25, 9], [15, 25], [9, 20], [21, 10], [29, 24]]) o(x, y, 'L');
for (const [x, y] of [[12, 6], [6, 12]]) o(x, y, 'E');

const terrain = T.map((r) => r.join(''));
const objects = O.map((r) => r.join(''));
const scores = { a: { value: 150, decay: 1, pick: 2 }, b: { value: 300, decay: 2, pick: 2 }, c: { value: 500, decay: 3, pick: 2 }, d: { value: 800, decay: 5, pick: 2 } };
const def: StageDef = { name: 'STAGE1', bpm: BPM, bars: BARS, terrain, objects, scores, hazards: flipped };
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
 * 闇に浮かぶ玄関から、暗い路地が伸びている。路地は闇の中で3重の環を描き、中心には欠けに囲まれて扉が一枚だけ立っている（ゴール）。
 * 道の外は何もない闇。外側の環からは行き止まりの路地が闇へ伸び、その先にほかの家の入口や街灯が浮かんでいる。
 * - 各環は入ってすぐの所が欠けていて通れず、ほぼ1周してから内側の環へ渡る。
 * - 各環の外側の車線は景色がくっきりした安全な道、内側の車線は景色の薄い速い道。
 *   内側の環ほど薄く（八分 → 十六分）、欠けが増え、遊具が速く動く（第2.2節「ゴールに近いほど難しくなる」）。
 * - 安全な車線だけでゴールすると、曲の長さほぼいっぱいかかる。
 * - 環をまたぐ近道は、2つ目の環から3つ目の環への1本だけ（一方通行・高危険）。
 * - 危険物は撤去された公園の遊具（第5.3節）。回旋塔は角の空き地で回り、箱ブランコは路地を横切って揺れる。誰も乗っていない。
 * - 得点マスは文字ごとに4つの候補から2つずつ、プレイのたびに選ばれる（第2.2節の丸暗記対策）。a は行き止まりの路地の先。
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
${flipped.map(h).join('\n')}
  ],
};
`;
  writeFileSync(OUT, src);
  console.log('wrote', path.relative(process.cwd(), OUT));
}
