// STAGE 5 の地図を組み立てて src/game/stages/stage5.ts を書き出す（企画書 第4.2節「STAGE 5：夜逃げから廃屋まで」）
//   node tools/stagegen/stage5.ts          所要時間を表示するだけ（SHOW=1 で地図も表示）
//   node tools/stagegen/stage5.ts --write  src/game/stages/stage5.ts を上書きする
//
// 作業座標：x＝横、y＝進む向き（y が大きいほどスタート側）。そのまま -y へ登る（画面では右上へ）。
// 夜逃げの夜の「物で埋まった広い部屋」から、間取りが消えた「開けた草地」の廃屋まで。年月の間は闇として空け、板一枚で渡る。
// 記憶の断片は、間の闇から横に大きく張り出して渡る。地図は企画のときのマス目の定義（2026-10-31）を移したもの。
import { build, Layout, report, write, type Kind, type P } from './lib.ts';

const BPM = 100;
const BARS = Number(process.env.BARS ?? 65);
const L = new Layout(44, 110);
const line = (pts: P[], k: Kind, h = 0) => L.path(pts, k, h);
/** 歩けない家具の塊。kind は scenery の1文字（描画で色と形が決まる）、hh は高さ（段） */
const furn = (kind: string, x0: number, y0: number, x1: number, y1: number, hh: number) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    L.remove(x, y);
    L.scenery.set(`${x},${y}`, { kind, h: hh });
  }
};
/** 記憶の断片のマス（色合いを分ける） */
const memory = new Set<string>();
const mark = (pts: P[]) => {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [[x0, y0], [x1, y1]] = [pts[i], pts[i + 1]];
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) memory.add(`${x},${y}`);
  }
};

// ── A 夜逃げの夜：物で埋まった広い部屋（和室 → 居間 → 台所）。家具の間を縫って歩く（密）
L.seg([14, 105], [14, 106], '.');
L.put('S', [14, 106]);
L.rect(10, 90, 30, 104, '.');
L.rect(32, 92, 37, 98, '.'); // 台所：戸口一つでつながる。部屋の奥から見えてくる
L.seg([29, 92], [31, 92], ',');
// 襖の仕切り：開いた所からしか抜けられない
furn('F', 10, 100, 25, 100, 1.8);
furn('F', 14, 94, 30, 94, 1.8);
furn('u', 11, 102, 13, 103, 0.4); // 布団
furn('T', 16, 103, 17, 104, 1.8); // 箪笥
furn('x', 20, 102, 21, 102, 0.8); // 荷造りの箱
furn('x', 24, 103, 24, 104, 0.8);
furn('T', 29, 101, 30, 103, 1.8);
furn('t', 18, 96, 21, 98, 0.8); // 食器の残った食卓（画面の焦点）
furn('R', 36, 92, 37, 92, 1.8); // 冷蔵庫
furn('v', 32, 98, 34, 98, 1.0); // 流しとこんろ
furn('x', 36, 97, 37, 98, 0.8);
furn('V', 27, 96, 28, 96, 1.0); // テレビ
furn('x', 12, 96, 12, 98, 0.8);
furn('C', 10, 91, 12, 92, 2.2); // 食器棚
furn('x', 22, 91, 23, 91, 0.8);
furn('K', 25, 90, 27, 91, 1.2); // 流し
// 居間の敷物（八分）：回りっぱなしの扇風機と柱時計の振り子。破れた襖から台所側へ抜けられる
for (let y = 96; y <= 98; y++) for (let x = 15; x <= 24; x++) if (!(x >= 18 && x <= 21)) L.seg([x, y], [x, y], ',');
for (const p of [[20, 94], [21, 94]] as P[]) {
  L.scenery.delete(`${p[0]},${p[1]}`);
  L.seg(p, p, ',');
}
L.rect(20, 95, 21, 95, ',');
// 扇風機は敷物の奥の真ん中に立ち（そのマスは台なので歩けない）、首を振って頭が敷物の真ん中の列の上で弧を描く。
// 頭は決まった長さの首の先にあるので、首の長さは変わらない（以前は一直線に往復させていて、首が伸び縮みして見えた）
L.remove(16, 96);
L.hazard({ type: 'swing', look: 'fan', pivot: [16, 96], arm: 1.2, sweep: 60, period: 30, cells: [[15, 97], [16, 97], [17, 97]] });
L.hazard({ type: 'swing', look: 'pendulum', axis: 'y', period: 34, cells: [[23, 96], [23, 97], [23, 98]] });
L.score('room', [15, 96], [22, 97], [17, 96], [10, 90], [30, 104]);
L.thing('dishes', [19, 97]);
L.thing('pendant_off', [20, 97]); // 天井の電灯は消えている（灯りのモチーフ）
L.thing('torn_fusuma', [19, 94]);
L.thing('calendar', [25, 100]);
L.thing('shoes_left', [31, 93]);
// 台所への寄り道（散らかった戸口を抜ける）：開いたままの冷蔵庫、置き去りの鍋、炊飯器
L.score('kitchen', [34, 96], [35, 94]);
L.thing('fridge_open', [38, 93]);
L.thing('rice_cooker', [38, 95]);
L.thing('pot_left', [33, 99]);
line([[30, 89], [36, 89], [36, 88]], '.'); // 台所の勝手口から外へ
// 年月の間：板一枚
line([[36, 87], [36, 79]], '.');

// 記憶の断片1：公園の空のブランコ（八分）。間の闇から西へ張り出して渡る
const PARK: P[] = [[9, 96], [4, 96], [4, 84], [14, 84], [14, 80], [20, 80], [20, 77]];
line(PARK, ',');
mark(PARK);
L.hazard({ type: 'swing', axis: 'y', period: 30, cells: [[4, 89], [4, 90], [4, 91]] });
L.hazard({ type: 'swing', axis: 'x', period: 30, cells: [[8, 84], [9, 84], [10, 84]] });
L.hazard({ type: 'swing', axis: 'x', period: 22, cells: [[16, 80], [17, 80], [18, 80]] });
L.thing('swingframe', [3, 90], [9, 85], [17, 81]);
L.score('park', [4, 93], [12, 84], [20, 79]);
L.thing('sandbox', [3, 86]);
L.thing('bench_old', [10, 85]);
L.thing('slide', [3, 92]);
L.thing('drinking_fountain', [5, 94]);

// ── B 数年後：埃、破れた障子、止まった扇風機（中）。床の抜けた部屋を突っ切る短い八分の近道（停止マス一つ）
line([[36, 78], [36, 76], [20, 76], [20, 68], [28, 68], [28, 63], [14, 63], [14, 60]], '.');
line([[24, 75], [24, 69]], ',');
L.put('P', [24, 72]);
L.thing('torn_shoji', [35, 77], [27, 77], [21, 70], [36, 75]);
L.thing('dust', [32, 71], [24, 67], [13, 62]);
L.thing('weed', [22, 74], [11, 64]);
L.thing('table_dusty', [25, 70]);
L.thing('fan_stopped', [18, 64]);
L.thing('leak_bucket', [21, 62]);
L.thing('fallen_frame', [17, 62]);
L.thing('dust_pile', [34, 78], [15, 81]);
L.thing('stopped_clock', [37, 76]);
line([[14, 59], [14, 51]], '.');

// 記憶の断片2：用水路（八分）。東へ張り出し、筋がずれる。深みは一つだけ。誰も映らない水面を、上流から物が流れてくる
const CANAL: P[] = [[29, 65], [38, 65], [38, 58], [41, 58], [41, 52], [36, 52], [36, 45], [34, 45]];
line(CANAL, ',');
mark(CANAL);
for (const k of memory) {
  const [x, y] = k.split(',').map(Number);
  if (y <= 66 && y >= 45 && x >= 29) L.water.add(k);
}
L.hole([38, 57]);
L.water.add('38,57');
// 流れ：誰も映らない水面を、上流（出口側）の湧き口から下流（入口側）へ物が流れてくる。水の筋の真っすぐな区間ごとに、
// 次の物が来るまでの間隔を「区間の長さの4倍＋湧き口から跳び出す時間」より長くとる
// （やりすごしてから入れば、次の物が跳び出す前に湧き口を抜けられる）。ぎりぎりだと次々に流れてきて忙しいので、少し（8 tick ほど）余計にあける。あけすぎると力まかせで抜けられる（1.5 倍で rush のクリア率が 60%）
const flow = (x: number, y0: number, y1: number, every: number) =>
  L.hazard({ type: 'flow', cells: Array.from({ length: y1 - y0 + 1 }, (_, i) => [x, y0 + i] as P), interval: 2, every });
flow(38, 58, 65, 42);
flow(41, 52, 58, 38);
flow(36, 45, 52, 42);
L.score('canal', [38, 61], [39, 52], [36, 47]);

// ── C さらに後：ツタ、錆び、背の高い草（中〜疎）。草むらの奥に得点のある寄り道
line([[14, 50], [14, 48], [30, 48], [30, 44], [34, 44], [34, 36], [26, 36], [26, 34]], '.');
L.thing('ivy', [13, 49], [22, 47], [29, 45], [33, 40], [13, 47]);
L.thing('drum_rust', [18, 47], [27, 37], [15, 47]);
L.thing('tallgrass', [16, 49], [31, 43], [35, 40], [12, 49], [26, 45]);
line([[25, 47], [25, 45]], ',');
L.score('later', [25, 46], [25, 45]);
line([[26, 33], [26, 25]], '.');

// 記憶の断片3：空の路面電車の通り（十六分、小節ゲート2つ）。東へ張り出す
const TRAM: P[] = [[35, 38], [38, 38], [38, 28], [29, 28], [29, 25]];
line(TRAM, ':');
mark(TRAM);
L.put('B', [38, 33], [33, 28]);
for (const [x, y] of [[36, 38], [37, 38], [38, 37], [38, 36], [38, 35], [38, 34], [38, 32], [38, 31], [38, 30], [38, 29]] as P[]) L.put('=', [x, y]);
L.score('tram', [38, 36], [31, 28]);
// 空の路面電車（揺れ型）。STAGE 3 とあわせて作品全体で2か所。振り切ると線路の端から闇へ走り去り、しばらく通りが空く。
// 線路の上ではプレイヤー（十六分）より速いので、走り去ったすぐ後ろについて行けば追いつかれない
L.hazard({ type: 'swing', look: 'tram', axis: 'y', period: 40, reach: 10, cells: Array.from({ length: 9 }, (_, i) => [38, 29 + i] as P) });

// ── D 廃屋：間取りが消えた、開けた草地（疎）。夜の部屋と同じ並びに、朽ちた食卓の跡だけが残る
L.rect(8, 6, 32, 24, '.');
for (let x = 13; x <= 30; x++) for (let y = 9; y <= 19; y++) L.remove(x, y); // 床が抜け落ちた大穴：まわりを回るしかない
furn('L', 14, 21, 18, 21, 0.5); // 倒れた柱
furn('b', 9, 12, 10, 13, 0.3); // 朽ちた食卓
furn('G', 28, 22, 29, 22, 1.4); // 草むら
furn('G', 31, 8, 31, 9, 1.4);
L.thing('skyhole', [22, 15]);
L.seg([18, 5], [18, 5], '.');
L.put('G', [18, 5]);
L.thing('stairs', [18, 4]);
L.thing('broken_window', [16, 5]); // 窓のモチーフ
L.thing('grassclump', [24, 25]);
L.thing('rubble', [23, 26]);
L.thing('dead_lamp', [22, 25]);
// 記憶の断片4：雪の屋根。東から、はしごで上がって大穴の上を滑り降りる（戻れない）
const roofCells = [...L.ramp([[31, 19], [30, 19]], 0.5, 1.5, '.', 'h'), ...L.ramp([[29, 19], [29, 14], [19, 14], [19, 9]], 1.5, 0.2, ',')];
for (const [x, y] of roofCells) memory.add(`${x},${y}`);
L.hazard({ type: 'periodic', look: 'snow', cells: [[29, 15], [29, 16]], period: 26, from: 0, to: 4 });
L.hazard({ type: 'periodic', look: 'snow', cells: [[25, 14], [24, 14]], period: 30, from: 12, to: 16 });
L.score('roof', [29, 17], [21, 14], [19, 11]);

const band = (x: number, y: number) => {
  if (memory.has(`${x},${y}`)) return 'q';
  return y >= 88 ? 'k' : y >= 79 ? 'g' : y >= 60 ? 'y' : y >= 51 ? 'g' : y >= 34 ? 'l' : y >= 25 ? 'g' : 'x';
};
const def = build(L, {
  name: 'STAGE5',
  theme: 'house',
  bpm: BPM,
  bars: BARS,
  scores: {
    room: { value: 150, decay: 1, pick: 4 },
    kitchen: { value: 200, decay: 1 },
    park: { value: 250, decay: 1, pick: 2 },
    canal: { value: 300, decay: 2, pick: 2 },
    later: { value: 300, decay: 1, pick: 1 },
    tram: { value: 500, decay: 3 },
    roof: { value: 600, decay: 3, pick: 2 },
  },
  floorOf: (x, y) => {
    if (memory.has(`${x},${y}`)) return y >= 77 ? 'd' : y >= 45 ? 'l' : y >= 25 && x >= 29 ? 'a' : 'r';
    if (y >= 90 && x >= 31) return 'w';
    if (y >= 90) return 't';
    if (y >= 79 && y <= 89) return 'w';
    if (y >= 60) return 'w';
    if (y >= 34) return (x + y) % 3 === 0 ? 'd' : 'w';
    return y >= 25 ? 'w' : 'd';
  },
  tintOf: band,
});
report(def);
write(
  def,
  'stage5',
  'stage5',
  `
STAGE 5 ｜ 入口：奥の和室 ｜ 夜逃げから廃屋まで（企画書 第4.2節。暫定合意）

夜逃げの夜の物で埋まった部屋から、壁も間取りも消えた草地の廃屋まで、進むほど年月が経つ。
記憶の断片へ入れば速いが危うく、朽ちていく現在を歩けば遅い、という選択がステージ全体の軸。
- 年月は場所で置き分ける（tints）。夜逃げの夜 → 数年後（埃、破れた障子、止まった扇風機）→ さらに後（ツタ、錆び、背の高い草）→ 廃屋。年月の間は闇として空け、板一枚で渡る。
- 夜の部屋は家具の間を縫って歩く。焦点は食器の残った食卓。食卓のまわりの敷物（八分）に、回りっぱなしの扇風機と柱時計の振り子。
  奥の台所への寄り道（開いたままの冷蔵庫、置き去りの鍋）は、部屋の後半で見えてくる。天井の電灯は消えている。
- 記憶の断片は、間の闇から横に張り出す近道で、元のステージの判断の型と危険物をそのまま持ち、人はいない（公園の空のブランコ、用水路、空の路面電車、雪の屋根）。
- 廃屋の真ん中には床が抜け落ちた大穴があり、安全な道はそのまわりを回る。記憶の雪の屋根は、はしごで上がって大穴の上を滑り降りる近道（床の高さは企画書 第2.4節）。
- ゴールは二階への階段の下。脇に割れた窓。ヘッドホンは見せない。
- 人影は0。
`,
);
