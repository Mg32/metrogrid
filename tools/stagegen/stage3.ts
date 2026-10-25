// STAGE 3 の地図を組み立てて src/game/stages/stage3.ts を書き出す
//   node tools/stagegen/stage3.ts          所要時間を表示するだけ（SHOW=1 で地図も表示）
//   node tools/stagegen/stage3.ts --write  src/game/stages/stage3.ts を上書きする（手で直した分は消える）
//
// 道以外（'#'）は闇で、描かれない。道は闇に浮かぶ。
// スタート（居間の窓）は画面の下。横に延びる通り（x 方向）を折り返しながら -y へ登っていき、画面では斜め右上へ進む。
// 通りの右端の外側を、もう走っていない路面電車の線路が縦に通っている。いくつかの段には踏切があり、線路に入れば段を飛ばして登れる。
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
/** 線路の x */
const TRACK = 22;

const T: string[][] = Array.from({ length: H }, () => Array(W).fill('#'));
const O: string[][] = Array.from({ length: H }, () => Array(W).fill(' '));
const F: string[][] = Array.from({ length: H }, () => Array(W).fill(' '));
const t = (x: number, p: number, ch: string) => { T[YO - p][x] = ch; };
const o = (x: number, p: number, ch: string) => { O[YO - p][x] = ch; };
const at = (x: number, p: number): [number, number] => [x, YO - p];
const row = (p: number, x0: number, x1: number, ch: string) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) t(x, p, ch); };
const hazards: HazardDef[] = [];
const swing = (cells: [number, number][], axis: 'x' | 'y', period: number) =>
  hazards.push({ type: 'swing', cells: cells.map(([x, p]) => at(x, p)).sort((a, b) => a[0] - b[0] || a[1] - b[1]), axis, period });

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
// 中間（段 3〜6）：上の行は八分。撤去された遊具（箱ブランコ）が揺れている
for (const k of [3, 4, 5, 6]) lane(k, ',');
swing([[7, lo(3) + 1], [8, lo(3) + 1], [9, lo(3) + 1]], 'x', 20);
swing([[12, lo(4) + 1], [13, lo(4) + 1], [14, lo(4) + 1]], 'x', 20);
swing([[6, lo(6) + 1], [7, lo(6) + 1], [8, lo(6) + 1]], 'x', 16);
// ゴール周辺（段 7〜10）：上の行は十六分。欠けが多い
for (const k of [7, 8, 9, 10]) lane(k, ':');
for (const [k, x] of [[4, 8], [5, 11], [6, 14], [7, 6], [7, 12], [8, 9], [8, 6], [9, 7], [9, 13], [10, 10], [10, 15]]) t(x, lo(k) + 1, ' ');
swing([[14, lo(8) + 1], [15, lo(8) + 1], [16, lo(8) + 1]], 'x', 12);
// 段の間の近道（一方通行・危険）
const cut = (k: number, x: number, ch: string, period?: number) => {
  t(x, lo(k) + 2, ch); t(x, lo(k) + 3, ch); o(x, lo(k) + 2, '^');
  if (period) swing([[x, lo(k) + 2], [x, lo(k) + 3]], 'y', period);
};
cut(0, 11, ',');
cut(2, 9, ',', 24);
cut(5, 10, ',', 16);
cut(7, 13, ':', 8);
cut(9, 8, ':', 8);

// --- 路面電車：通りの右端の外側の線路を、半透明の車両が往復している（全体で1箇所） ---
// 線路は危険ゾーン。踏切（小節ゲート。1小節に1回しか渡れない）のある段から入れる
// 線路は中ほどの段 3〜8 の脇だけ（両端は闇に途切れている）
const TRACK_P0 = lo(3) - 1, TRACK_P1 = lo(8) + 1;
for (let p = TRACK_P0; p <= TRACK_P1; p++) { t(TRACK, p, ':'); o(TRACK, p, '='); }
const CROSSINGS = [3, 6, 8];
for (const k of CROSSINGS) {
  t(20, lo(k), ','); t(21, lo(k), ','); o(21, lo(k), 'B');
}
// 線路は十六分のゾーンで、電車も十六分で進む。同じ向きに歩き続ければ追いつかれないが、鉢合わせると逃げ場がない
hazards.push({ type: 'patrol', look: 'tram', length: 2, interval: 1, waypoints: [at(TRACK, TRACK_P0), at(TRACK, TRACK_P1)] });

// --- スタート：居間の窓から通りへ降りる ---
const SX = 5;
t(SX, 2, '.'); t(SX, 3, '.');
o(SX, 2, 'S'); o(SX - 1, 2, 'N'); o(SX - 1, 3, 'L');

// --- ゴール：最後の段の端から登った先、欠けに囲まれて扉が一枚だけ立っている ---
const GP = lo(RUNGS - 1) + 5;
const GX = rightEnd(RUNGS - 1) ? X1 : X0;
for (let p = lo(RUNGS - 1) + 2; p <= GP; p++) t(GX, p, '.');
for (const [x, p] of [[GX - 1, GP], [GX + 1, GP], [GX - 1, GP - 1], [GX + 1, GP - 1], [GX, GP + 1]]) t(x, p, ' ');
o(GX, GP, 'G');

// 行き止まりの路地。−x へ伸びる先には商店（シャッター）、+x へ伸びる先には電柱や街灯
const spur = (cells: [number, number][], end: [number, number], prop: string) => {
  for (const [x, p] of cells) t(x, p, '.');
  o(end[0], end[1], prop);
};
spur([[2, lo(1)], [1, lo(1)]], [0, lo(1)], 'Z');
spur([[2, lo(3) + 1], [1, lo(3) + 1]], [0, lo(3) + 1], 'Z');
spur([[2, lo(5)], [1, lo(5)]], [0, lo(5)], 'Z');
spur([[2, lo(8)], [1, lo(8)]], [0, lo(8)], 'Z');
spur([[20, lo(2)]], [21, lo(2)], 'U');
spur([[20, lo(5) + 1]], [21, lo(5) + 1], 'L');
// 段の間の闇に浮かぶ商店・電柱・街灯・郵便ポスト。商店は +y 側（下の段）から見える
const deco = (x: number, p: number, prop: string) => {
  if (T[YO - p][x] !== '#') throw new Error(`飾りの位置 (${x},${p}) が空いていない`);
  o(x, p, prop);
};
for (const [k, x, prop] of [
  [0, 5, 'Z'], [0, 15, 'U'], [1, 7, 'L'], [1, 14, 'Z'], [2, 4, 'U'], [2, 13, 'Z'], [3, 6, 'Z'], [3, 15, 'L'],
  [4, 5, 'U'], [4, 14, 'Z'], [5, 15, 'M'], [5, 6, 'Z'], [6, 12, 'U'], [7, 5, 'Z'], [8, 15, 'L'], [9, 12, 'Z'],
] as [number, number, string][]) deco(x, lo(k) + 2, prop);

// 床の見た目：古い石畳と新しいアスファルトがまだらに重なる（時代の重なり）。線路は石畳
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) F[y][x] = (Math.floor(x / 4) + Math.floor((YO - y) / 3) * 2) % 3 === 0 ? 's' : 'a';
for (let p = 0; p <= PMAX; p++) F[YO - p][TRACK] = 's';

// --- 得点マスの候補（文字ごとに4つの候補から2つ選ばれる） ---
for (const [x, p] of [[1, lo(1)], [1, lo(3) + 1], [20, lo(2)], [1, lo(5)]]) o(x, p, 'a');
for (const [x, p] of [[11, lo(0) + 3], [9, lo(2) + 3], [TRACK, lo(3)], [TRACK, lo(4)]]) o(x, p, 'b');
for (const [x, p] of [[10, lo(5) + 3], [TRACK, lo(5)], [11, lo(4) + 1], [9, lo(6) + 1]]) o(x, p, 'c');
for (const [x, p] of [[13, lo(7) + 3], [TRACK, lo(7) + 2], [11, lo(8) + 1], [8, lo(9) + 3]]) o(x, p, 'd');

const terrain = T.map((r) => r.join(''));
const objects = O.map((r) => r.join(''));
const floors = F.map((r) => r.join(''));
const scores = { a: { value: 150, decay: 1, pick: 2 }, b: { value: 300, decay: 2, pick: 2 }, c: { value: 500, decay: 3, pick: 2 }, d: { value: 800, decay: 5, pick: 2 } };
const def: StageDef = { name: 'STAGE3', theme: 'street', bpm: BPM, bars: BARS, terrain, objects, floors, scores, hazards };
const st = new Stage(def);
const i = st.index(st.start.x, st.start.y);
console.log(`safe ${distanceField(st, { safeOnly: true })[i] / 4} beats, fast ${distanceField(st)[i] / 4} beats, song ${def.bars * 4}`);
if (process.env.SHOW) console.log(terrain.map((r, y) => `${String(y).padStart(2)} ${r}  ${objects[y]}`).join('\n'));

const OUT = path.resolve(import.meta.dirname, '../../src/game/stages/stage3.ts');
if (process.argv.includes('--write')) {
  const h = (x: HazardDef) => '    ' + JSON.stringify(x).replace(/"(\w+)":/g, '$1: ').replace(/"/g, "'").replace(/,(?=\S)/g, ', ') + ',';
  const src = `import type { StageDef } from '../stage.ts';

/**
 * STAGE 3 ｜ 入口：居間の窓 ｜ 景色：時代の重なった通り（企画書 第4.4節。入口・景色・危険物の割り当ては仮）
 *
 * 居間の窓（画面の下）から通りへ降りると、横丁が折り返しながら斜め右上へ登っていく。登りきった先に扉が一枚だけ立っている（ゴール）。
 * 古い石畳と新しいアスファルトがまだらに重なり、シャッターの下りた商店、電柱、街灯が闇に浮かぶ。
 * - 横丁は11段。各段の下の行は安全な道で、危険物も欠けもない（慣れていなくても、ここを歩けば戻されない）。
 * - 上の行は速い道（中間は八分、ゴール周辺は十六分）。撤去された公園の遊具（箱ブランコ）が揺れ、欠けた所がある。
 * - 段の間には一方通行の近道がある。
 * - 通りの右端の外側を、もう走っていない路面電車の線路が縦に通っている。半透明の車両（2両分の長さ）が線路を往復している
 *   （第5.3節「路面電車」。全体で1箇所）。いくつかの段には踏切（小節ゲート。1小節に1回しか渡れない）があり、
 *   線路に入れば段をいくつも飛ばして登れるが、電車と鉢合わせると逃げ場がない。
 * - 危険物の割り当て（路面電車、箱ブランコ、踏切）は企画書の候補から選んだ仮のもの。「時代の境目」（提案・未評価）は使っていない。
 * - 得点マスは文字ごとに4つの候補から2つずつ、プレイのたびに選ばれる（第2.2節の丸暗記対策）。
 *
 * この地図は tools/stagegen/stage3.ts で組み立てて書き出したもの。調整はスクリプト側で行い --write で書き出し直すか、
 * ここを手で直す（その場合スクリプトとずれる）。npm test が整合性と通れるかを、npm run bots がバランスを確かめる。
 */
// prettier-ignore
export const stage3: StageDef = {
  name: 'STAGE3',
  theme: 'street',
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
