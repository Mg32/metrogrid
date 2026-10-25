// STAGE 1 の地図を組み立て、上下を反転して src/game/stages/stage1.ts を書き出す
//   node tools/stagegen/stage1.ts          所要時間を表示するだけ（SHOW=1 で地図も表示）
//   node tools/stagegen/stage1.ts --write  src/game/stages/stage1.ts を上書きする（手で直した分は消える）
// 論理座標はスタートが下（y=29）。書き出し時に y → 30 - y で反転し、スタートを画面の奥（上）にする
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { Stage, type HazardDef, type StageDef } from '../../src/game/stage.ts';
import { distanceField } from '../bots/nav.ts';

const BARS = Number(process.env.BARS ?? 62);
const N = 31, C = 15;
const T: string[][] = Array.from({ length: N }, () => Array(N).fill('#'));
const O: string[][] = Array.from({ length: N }, () => Array(N).fill(' '));
const dOf = (x: number, y: number) => Math.max(Math.abs(x - C), Math.abs(y - C));
const each = (f: (x: number, y: number, d: number) => void) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) f(x, y, dOf(x, y)); };
const t = (x: number, y: number, ch: string) => { T[y][x] = ch; };
const o = (x: number, y: number, ch: string) => { O[y][x] = ch; };
const hazards: HazardDef[] = [];
const swing = (cells: [number, number][], axis: 'x' | 'y', period: number) => hazards.push({ type: 'swing', cells, axis, period });
const kaisento = (px: number, py: number, interval: number) => {
  t(px, py, '#'); o(px, py, 'T');
  hazards.push({ type: 'patrol', look: 'kaisento', pivot: [px, py], waypoints: [[px - 1, py - 1], [px + 1, py - 1], [px + 1, py + 1], [px - 1, py + 1]], loop: true, interval });
};

// 4つの環状の路地（各2車線）：A(d=13,12) B(d=10,9) C(d=7,6) D(d=4,3)。外側の車線が安全、内側の車線が景色の薄い速い道
each((x, y, d) => {
  if (d === 13 || d === 12 || d === 10 || d === 7 || d === 4) t(x, y, '.');
  if (d === 9) t(x, y, ',');
  if (d === 6) t(x, y, y < C || x < C ? ':' : ',');
  if (d === 3) t(x, y, ':');
});

// --- A：スタート周辺。道幅が広く、ほぼ安全。右下は欠けていて通れない（左回りに4分の3周） ---
for (let y = 27; y <= 28; y++) { t(22, y, ' '); t(23, y, ' '); }
for (let x = 14; x <= 16; x++) t(x, 29, '.');
o(15, 29, 'S'); o(15, 30, 'H'); o(13, 29, 'K'); o(17, 29, 'K'); o(18, 29, 'M'); o(11, 29, 'L');
for (let x = 4; x <= 11; x++) t(x, 3, ','); // 上辺の内側の車線だけ少し薄い
t(26, 15, '.'); // A→B
swing([[2, 18], [3, 18]], 'x', 32);
swing([[9, 2], [9, 3]], 'y', 28);

// --- B：右下が欠けている（右回りに4分の3周）。左上の角は公園の跡 ---
for (let x = 24; x <= 25; x++) { t(x, 20, ' '); t(x, 21, ' '); }
t(15, 24, '.'); t(15, 23, '.'); o(15, 23, 'B'); // B→C（遮断機。内側の車線のマスも安全にしてつなぐ）
t(7, 7, '.'); kaisento(6, 6, 8);
o(15, 25, 'P');
swing([[24, 10], [25, 10]], 'x', 24);
swing([[12, 24], [12, 25]], 'y', 20);

// --- C：左下が欠けている（左回りに4分の3周）。右上の角は公園の跡 ---
for (let y = 21; y <= 22; y++) { t(11, y, ' '); t(12, y, ' '); }
t(9, 15, '.'); t(10, 15, '.'); // C→D
t(20, 10, '.'); kaisento(21, 9, 8);
o(22, 18, 'P');
swing([[8, 18], [9, 18]], 'x', 20);
swing([[13, 8], [13, 9]], 'y', 16);
// ゴール手前の近道：C の上辺の内側の車線から D の上辺へ。一方通行、高危険、箱ブランコが横切る
t(18, 10, ':'); o(18, 10, 'v'); swing([[18, 10]], 'x', 8);

// --- D：左上が欠けている（下回りに4分の3周）。内側の車線は高危険で、ところどころ欠けている ---
for (let x = 11; x <= 12; x++) t(x, 13, ' ');
for (const [x, y] of [[14, 18], [18, 16], [16, 12]]) t(x, y, ' ');
t(15, 12, '.'); t(15, 13, '.'); // D→中心
swing([[18, 15], [19, 15]], 'x', 16);
swing([[15, 18], [15, 19]], 'y', 20);
swing([[15, 13]], 'x', 12);

// --- 中心：欠けに囲まれて立つ扉（ゴール） ---
each((x, y, d) => { if (d <= 1) t(x, y, ' '); });
t(15, 14, '.'); t(15, 15, '.'); o(15, 15, 'G');

// --- 得点マスの候補（文字ごとに2つ選ばれる） ---
for (const [x, y] of [[2, 2], [28, 2], [2, 28], [7, 3]]) o(x, y, 'a');
for (const [x, y] of [[6, 15], [15, 6], [24, 15], [15, 24]]) o(x, y, 'b');
for (const [x, y] of [[9, 9], [21, 21], [9, 15], [15, 9]]) o(x, y, 'c');
for (const [x, y] of [[12, 12], [18, 18], [12, 18], [18, 12]]) o(x, y, 'd');

// --- 小物 ---
for (const [x, y] of [[1, 20], [1, 6], [29, 10], [4, 22], [26, 8], [8, 1]]) o(x, y, 'L');
for (const [x, y] of [[6, 29], [24, 29], [10, 26], [12, 23], [4, 18], [1, 13]]) o(x, y, 'E');

// --- 上下を反転して書き出す ---
const F = (y: number) => N - 1 - y;
const flipObj: Record<string, string> = { '^': 'v', v: '^' };
const terrain = T.slice().reverse().map((r) => r.join(''));
const objects = O.slice().reverse().map((r) => r.map((c) => flipObj[c] ?? c).join(''));
const fl = (p: number[]) => [p[0], F(p[1])] as [number, number];
const flipped: HazardDef[] = hazards.map((h) => {
  if (h.type === 'patrol') return { ...h, waypoints: h.waypoints.map(fl), pivot: h.pivot && fl(h.pivot) };
  if (h.type === 'swing') return { ...h, cells: h.cells.map(fl).sort((a, b) => a[0] - b[0] || a[1] - b[1]) };
  return { ...h, cells: h.cells.map(fl) };
});

const scores = { a: { value: 100, decay: 1, pick: 2 }, b: { value: 300, decay: 2, pick: 2 }, c: { value: 500, decay: 3, pick: 2 }, d: { value: 800, decay: 5, pick: 2 } };
const def: StageDef = { name: 'STAGE1', bpm: 100, bars: BARS, terrain, objects, scores, hazards: flipped };
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
 * 玄関を出ると、闇の中に路地が4重の環になって巡っている。中心には欠けに囲まれて扉が一枚だけ立っていて、そこがゴール。
 * - 各環は4分の1が欠けていて通れず、4分の3周してから内側の環へ入る。
 * - 各環の外側の車線は景色がくっきりした安全な道、内側の車線は景色の薄い速い道。
 *   内側の環ほど薄く（八分 → 十六分）、欠けが増え、遊具が速く動く（第2.2節「ゴールに近いほど難しくなる」）。
 * - 安全な車線だけでゴールすると、曲の長さほぼいっぱいかかる。
 * - 環をまたぐ近道は、ゴール手前の1本だけ（遮断機つき・一方通行・高危険）。
 * - 危険物は撤去された公園の遊具（第5.3節）。回旋塔は角の空き地で回り、箱ブランコは路地を横切って揺れる。誰も乗っていない。
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
    a: { value: 100, decay: 1, pick: 2 },
    b: { value: 300, decay: 2, pick: 2 },
    c: { value: 500, decay: 3, pick: 2 },
    d: { value: 800, decay: 5, pick: 2 },
  },
  hazards: [
${flipped.map(h).join('\n')}
  ],
};
`;
  writeFileSync(OUT, src);
  console.log('wrote', path.relative(process.cwd(), OUT));
}
