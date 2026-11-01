// STAGE 3 の地図を組み立てて src/game/stages/stage3.ts を書き出す（企画書 第4.2節「STAGE 3：時代の重なった通り」）
//   node tools/stagegen/stage3.ts          所要時間を表示するだけ（SHOW=1 で地図も表示）
//   node tools/stagegen/stage3.ts --write  src/game/stages/stage3.ts を上書きする
//
// 作業座標：x＝横、y＝進む向き（y が大きいほどスタート側）。そのまま -y へ登る（画面では右上へ）。
// 時代：スタート側がいちばん古く、ゴールへ進むほど新しくなる。地図は企画のときのマス目の定義（2026-10-31）を移したもの。
import { createRandom } from '../../src/game/random.ts';
import { build, Layout, report, write, type P } from './lib.ts';

const BPM = 116;
const BARS = Number(process.env.BARS ?? 64);
const L = new Layout(40, 66);

const RISK: [P[], ',' | ':'][] = [];
const bars: P[] = [];

// ── 街区1：いちばん古い時代（土の道と石畳、木の電柱、塗りたての看板、若木、空き地）。表通りは路面電車の線路（伝聞なので薄い）
const SAFE1: P[] = [[8, 63], [8, 57], [18, 57], [18, 60], [26, 60], [26, 56], [31, 56], [31, 50], [27, 50], [27, 48], [18, 48], [18, 44]];
const TRAM: P[] = [[13, 56], [13, 53], [23, 53], [23, 49]];
RISK.push([TRAM, ',']);
RISK.push([[[26, 61], [33, 61], [33, 53], [32, 53]], ',']); // 裏の通り
L.seg([8, 64], [8, 64], '.');
L.put('S', [8, 64]);
L.thing('entrance', [7, 64]);
L.score('old', [16, 53], [23, 51], [30, 61]);
bars.push([33, 57]);
L.thing('sapling', [7, 57]);
L.thing('newsign', [17, 58], [25, 57]);
L.thing('lot', [29, 52]);
L.thing('post_new', [11, 58]);
L.thing('rickshaw', [28, 62]);
L.thing('trike', [19, 55]); // 1組目の家族：三輪車
const SAFE1b: P[] = [[18, 44], [18, 42]];
L.put('B', [18, 43]); // 境目：踏切（小節ゲート）

// ── 街区2：時代がまだらに混ざる（石畳とアスファルトのまだら、色あせた看板、中くらいの木、建築中の家）。左右に一本ずつ抜け道
const SAFE2: P[] = [[18, 42], [18, 39], [14, 39], [14, 36], [7, 36], [7, 31], [12, 31], [12, 28], [19, 28], [19, 33], [24, 33], [24, 35], [31, 35], [31, 29], [25, 29], [25, 26], [30, 26], [30, 23]];
RISK.push([[[17, 40], [10, 40], [10, 32], [8, 32]], ',']);
RISK.push([[[25, 33], [34, 33], [34, 27], [26, 27]], ',']);
bars.push([10, 38], [34, 30], [30, 33], [13, 40], [30, 27]);
L.score('mixed', [13, 40], [10, 34], [34, 31], [28, 27]);
L.thing('midtree', [9, 29]);
L.thing('fadedsign', [15, 30], [26, 36]);
L.thing('post_faded', [20, 31]);
L.thing('construct', [22, 38]);
L.thing('bike', [13, 27]); // 2組目の家族：自転車
L.thing('girl_small', [37, 30]); // 人影①：小さな女の子（古い石畳の切れ端の上）
const SAFE2b: P[] = [[30, 23], [30, 21]];
L.thing('footbridge', [29, 22], [31, 22]); // 境目：歩道橋

// ── 街区3：いちばん新しい時代（アスファルト、コンクリートの電柱、シャッター、大木、取り壊し跡）。新しい大通り（十六分・薄い、信号が小節ゲート）
const SAFE3: P[] = [[30, 21], [30, 16], [27, 16], [27, 12], [31, 12], [31, 10], [21, 10], [21, 18], [15, 18], [15, 11], [9, 11], [9, 15], [6, 15], [6, 7], [12, 7], [12, 5], [19, 5], [19, 3]];
RISK.push([[[31, 19], [33, 19], [33, 9], [16, 9], [16, 11]], ':']);
RISK.push([[[26, 13], [22, 13]], ',']);
RISK.push([[[14, 14], [10, 14]], ',']);
L.put('B', [33, 15], [20, 9]);
bars.push([33, 12], [26, 9], [12, 14], [33, 17], [22, 9]);
L.score('new', [33, 17], [29, 9], [24, 13], [18, 9]);
L.thing('bigtree', [7, 9]);
L.thing('shutter', [17, 16], [29, 14]);
L.thing('post_rust', [24, 11]);
L.thing('lot2', [10, 9]);
L.thing('trike_gone', [7, 13]); // 3組目の家族：何もない玄関先
L.thing('girl_tall', [36, 6]); // 人影②：背の伸びた女の子（少し前の時代の地面の上）
L.seg([19, 2], [19, 2], '.');
L.put('G', [19, 2]);

for (const [pts, ch] of RISK) L.path(pts, ch);
for (const pts of [SAFE1, SAFE1b, SAFE2, SAFE2b, SAFE3]) L.path(pts, '.');
// 線路（見た目）：表通りに枕木とレール
for (let i = 0; i + 1 < TRAM.length; i++) {
  const [[x0, y0], [x1, y1]] = [TRAM[i], TRAM[i + 1]];
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) if (!L.obj.has(`${x},${y}`)) L.put('=', [x, y]);
}
// 路面電車（揺れ型）：もう走っていない路線の車両が、半透明で表通りを行き来する。振り切ると線路の端から闇へ走り去り、
// しばらく表通りが空く。電車はプレイヤー（八分）より遅い（周期 > 4π × 振れ幅）ので、手前の端から闇へ走り去ったのを
// 見送ってから歩き出せば、戻ってくる電車に後ろから追いつかれない。
// 往復する巡回型にすると、1本道で正面から鉢合わせて抜けられなくなる（企画書 第2.2節）
L.hazard({ type: 'swing', look: 'tram', axis: 'x', period: 86, reach: 6, cells: Array.from({ length: 9 }, (_, i) => [14 + i, 53] as P) });
// 街区の抜け道の危険物：踏切の遮断機（定位置型）。企画書では未決（第4.2節 STAGE 3「街区の抜け道に置く危険物」）。
// 実装のために仮に決めた（検討ログで、STAGE 3 の定位置型の候補として了承されていた物）。遮断機の柱は道の脇の闇に立つ
const rand = createRandom(31);
for (const [i, [x, y]] of bars.entries()) {
  const pivot = ([[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as P[]).find(([px, py]) => !L.has(px, py))!;
  const period = 36 + (i % 3) * 4;
  const from = Math.floor(rand() * 16);
  L.hazard({ type: 'periodic', look: 'barrier', cells: [[x, y]], pivot, period, from, to: from + 14 });
}

// ── 時代の割り当て（混濁：境目の近くで前後の時代がまだらに入り込む）。2 古い、1 まだら、0 新しい
const era = new Map<string, number>();
const noise = createRandom(7);
for (let y = 0; y < L.H; y++) {
  for (let x = 0; x < L.W; x++) {
    const base = y >= 43 ? 2 : y >= 23 ? 1 : 0;
    let e = base;
    const r = noise();
    if (base === 2 && y < 50 && r < 0.25) e = 1;
    if (base === 1 && y > 36 && r < 0.2) e = 2;
    if (base === 1 && y < 30 && r < 0.3) e = 0;
    if (base === 0 && y > 16 && r < 0.2) e = 1;
    era.set(`${x},${y}`, e);
  }
}
for (const p of ['26,59', '27,59', '26,58']) era.set(p, 0); // 古い街に、アスファルトの継ぎ当て
for (const p of ['8,13', '9,13', '8,12']) era.set(p, 2); // 新しい街に、古い石畳の切れ端
// 人影の足場：別の時代の地面が、闇をはさんで一切れだけある（渡れない）
for (const [x, y] of [[36, 29], [37, 29], [36, 30], [37, 30]] as P[]) era.set(`${x},${y}`, 2);
for (const [x, y] of [[36, 6], [37, 6], [36, 7], [37, 7]] as P[]) era.set(`${x},${y}`, 1);
L.sceneryRect(36, 29, 37, 30, 'g');
L.sceneryRect(36, 6, 37, 7, 'g');

// ── モチーフ：ゴールの居間の窓の下に、そろえた小さな運動靴と門灯
L.thing('home_window', [18, 1]);
L.thing('kid_shoes', [17, 2]);
L.thing('gate_lamp', [20, 1]);
// 安全な道を8拍進むごとに1本ずつ通り過ぎる電柱（古い区間は木、新しい区間はコンクリート）
const wpole: P[] = [[7, 60], [12, 56], [17, 60], [25, 59], [30, 55], [30, 49], [24, 47], [17, 46], [17, 38], [6, 33], [21, 32], [27, 34], [30, 31], [20, 17]];
const cpole: P[] = [[12, 35], [11, 30], [18, 27], [24, 29], [29, 25], [29, 18], [26, 12], [30, 11], [22, 11], [14, 17], [13, 10], [8, 14], [5, 10], [11, 6], [17, 4]];
L.thing('wpole', ...wpole);
L.thing('cpole', ...cpole);
L.thing('bicycle_old', [1, 25]);
L.thing('faded_poster', [33, 28]);

const eraOf = (x: number, y: number) => era.get(`${x},${y}`) ?? 0;
const def = build(L, {
  name: 'STAGE3',
  theme: 'street',
  bpm: BPM,
  bars: BARS,
  scores: {
    old: { value: 200, decay: 1, pick: 2 },
    mixed: { value: 300, decay: 2, pick: 3 },
    new: { value: 550, decay: 3, pick: 3 },
  },
  floorOf: (x, y) => {
    const e = eraOf(x, y);
    if (e === 2) return (x * 7 + y * 3) % 5 === 0 ? 'd' : 's';
    if (e === 1) return (x + y) % 3 === 0 ? 'a' : 's';
    return 'a';
  },
  tintOf: (x, y) => ['N', 'M', 'O'][eraOf(x, y)],
});
report(def);
write(
  def,
  'stage3',
  'stage3',
  `
STAGE 3 ｜ 入口：居間の窓 ｜ 時代の重なった通り（企画書 第4.2節。暫定合意）

古い街区から新しい街区へ進む。スタートがいちばん古い時代、ゴールへ進むほど新しくなる。境目では前後の時代の地面と小物が混ざる。
- 新しい時代ほど移り変わりが速く、家が追いきれないので景色が薄い。伝聞でしか知らない路面電車の線路は、古い時代の中でも薄い（八分）。
- 木、電柱、看板、空き地、玄関先の物（三輪車 → 自転車 → 何もない玄関先）が、時代が進むごとに変わる。
- 踏切（小節ゲート）と歩道橋は、全員が通る時代の境目。新しい大通り（十六分）には信号の小節ゲートが2つある。
- 危険物は路面電車（表通りを往復する。両端の安全な道で待てる）と、抜け道の踏切の遮断機。遮断機は企画書では未決で、実装のために仮に決めた。
- 人影は2（最後の家族の女の子。街区2の奥で小さな姿、新しい街区で背の伸びた姿）。どちらも闇をはさんだ別の時代の地面の切れ端に立つ。
- ゴールは現在のこの家の居間の窓。窓の下にそろえた小さな運動靴と門灯。
`,
);
