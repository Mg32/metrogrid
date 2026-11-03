import { drawText, GLYPH_H, textWidth } from './font.ts';
import { GIRL_FOOT_X, GIRL_FOOT_Y } from './girl.ts';
import { fillDiamond, fillEllipse, fillPrismSides, fillQuad, plotLine } from './pixel.ts';

/**
 * エンディング（企画書 第4.6節）。外から見た家が闇に浮かんでいる。
 * 少女が二階のベランダに出てきて手を挙げると、青い光をともないはじめ、画面が揺れる。これまでに溜めた得点がみるみる減っていき、
 * その光の粒が少女の手へ流れ込む（得点は「減っている」ではなく、少女の行為に「使われている」ように見せる。光の強さ・揺れの大きさ・
 * 家の窓という窓から漏れる同じ青い光（第4.5節）は、使われた割合に連動する）。
 * 得点を使い切っても響きはさらに高くまで上がっていき、ふっと止む。少女は手を下ろし、何気なく家の中へ戻って戸を閉める
 * （悲壮な決意には見せない。第4.7節）。そのあと何かが発動する音がして家全体が青白く光り、音が鳴りやむと光も家の中の明かりも消える。
 * 2 秒ほど静まったあとで轟音が聞こえはじめ、家は少しずつひしゃげ、
 * いろいろな場所から砂埃を上げて潰れていく。轟音と揺れが収まる頃には、ガレキだけが残る。
 * 得点の総計は、はじめは拠点と同じ位置・大きさで出しておき（何の数字か分かるように）、画面の上の真ん中へ動いて大きくなってから減っていく。
 * 少女が潰れる瞬間は映さない（戸を閉めたあとは、少女の姿はどこにも出ない）。
 *
 * 時刻はエンディングが始まってからの秒。
 */
export const ENDING = {
  /** 闇から家が見えてくる */
  fadeIn: 1.5,
  /** ベランダのガラス戸が開く／少女がベランダの手すりの前まで出てくる */
  doorOpen: [1.5, 2.1],
  walkOut: [2.1, 3.1],
  /** 手を挙げる */
  raise: 3.8,
  /** 得点が使われていく（光が強まり、響きが上がっていく） */
  light: [4.2, 10.2],
  /** 得点を使い切ったあとも響きはさらに高くまで上がり、ここで止む（揺れも止む） */
  climax: 13.2,
  /** 手を下ろす／家の中へ戻る／戸を閉める（光は少女と一緒に引いていく） */
  lower: 13.7,
  walkIn: [14.1, 15.1],
  doorClose: [15.1, 15.6],
  /** 少女が家に入ったあと、何かが発動する音（エコーが尾を引く） */
  trigger: 16.2,
  /** 発動の音が鳴りやむと、家の中の明かり（窓から漏れる青い光）がふっと消える（消えはじめ、消えきる） */
  lightsOut: [18.9, 19.1],
  /** 青白い光と明かりが消えて 2 秒ほど静まったあと、轟音が聞こえはじめ（揺れも始まる）、家が崩れていく */
  rumble: 21.1,
  collapse: [21.3, 28.0],
  /** 崩れ方が急に進む時刻（二階が潰れる、全体が潰れる、最後のひと崩れ）。砂埃と崩れる音が出る */
  jerks: [22.5, 24.5, 26.1],
  /** 揺れと砂埃が収まる */
  settle: 31.5,
  /** ここから先はガレキだけが残った静止画 */
  end: 34.5,
  /** ガレキの画面の下に、結びの文が浮かび上がる（出はじめ、出きる） */
  epilogue: [35.5, 37.5],
};

/**
 * 得点の総計が 0 のままエンディングに来たときの、別の演出（秒）。家は崩れない。
 * 少女がベランダに出てきて（ここまでは ENDING と同じ）、しばらくベランダの手すりの前に立っている。
 * 視点がそのまま上空へ昇っていき、家が画面の外へ出て星だけになったあと、ゆっくりと文が浮かび上がる。
 * 得点の総計の表示は、はじめは拠点と同じ位置に出ていて、少女が立っているあいだに消える
 */
export const ENDING_CALM = {
  /** 得点の総計の表示が消えていく */
  totalOut: [4.6, 5.6],
  /** 視点が上空へ昇っていく（昇りはじめ、止まる）。PAN_H ドットぶん */
  pan: [7.5, 14.5],
  /** 文が浮かび上がる（出はじめ、出きる） */
  text: [15.5, 19.5],
  /** ここから先は静止画 */
  end: 19.5,
};
/** 視点が昇る高さ（ドット）。家のいちばん上が画面の下の外へ出るまで */
const PAN_H = 300;

/** エンディングの長さ（秒）。得点の総計が 0 なら別の演出 */
export const endingEnd = (total: number): number => (total === 0 ? ENDING_CALM.end : ENDING.end);

/**
 * タイトルから始めるときの演出（押してからの秒）。少女が振り返り（turn）、玄関の引き戸に明かりがともって（door）、
 * 少女が戸口へ歩いて家の中へ消える（walk）。ロゴと案内の文は薄れて消え（logo）、画面が闇に沈む（fade）。end で拠点などへ。
 * 拠点（家の中）は闇から明るくなって始まる（renderer の FADE_IN）
 */
export const TITLE_OUT = {
  turn: 0.15,
  door: [0.1, 0.4],
  walk: [0.3, 1.1],
  logo: 0.5,
  fade: [0.9, 1.4],
  end: 1.4,
};

/**
 * ステージを初めてクリアして家に帰ってくる演出（結果の画面から拠点へ戻るとき。始まってからの秒）。
 * 外から見た家が闇から見えてきて（fade）、そのステージに当たる家の部分が、傷んだ姿から「最後に存在した姿」へ戻る
 * （restore。埃が舞い上がって消え、窓や門灯に明かりがともる）。そのあと少女が振り返って玄関へ入り（walk から TITLE_OUT と同じ動き）、
 * end で拠点へ
 */
export const HOMECOMING = {
  fade: 0.6,
  restore: [0.9, 3.3],
  walk: 3.8,
  end: 3.8 + TITLE_OUT.end,
};

/**
 * 家の部分（その部分が戻るステージの名前）。家は、はじめは長く放っておかれた姿で、ステージをクリアするたびに
 * そのステージに当たる部分が戻る。戻っても新品にはならず、もとからの傷み（割れた窓ガラスひとつ、欠けた瓦）は残る（企画書 第1.3節）。
 * どの部分がどのステージで戻るかは企画書で未決のため、拠点の入口（第3.2節の表）に合わせて仮に決めた：
 *   STAGE1 玄関（引き戸、門灯、敷石のまわりの草）  STAGE2 縁側のガラス戸（一階の右手前の窓）  STAGE3 居間の窓（一階の手前の窓）
 *   STAGE4 台所の窓と、一階の屋根（下屋）  STAGE5 二階（壁、窓、屋根）
 * 亀裂、傾き、たわみなど、崩壊を予告する傷みは描かない（第1.3節）
 */
export const HOUSE_PARTS = ['STAGE1', 'STAGE2', 'STAGE3', 'STAGE4', 'STAGE5'];

/** 家の見え方：部分ごとの戻り具合（0 は傷んだまま、1 は戻った）と、戻った部分の窓と門灯に明かりがともるか（タイトル） */
interface HouseLook {
  restored: (part: string) => number;
  lit: boolean;
  /** 得点の総計が 0 のときのエンディング（ENDING_CALM）：少女はベランダに出たまま戻らず、ガラス戸も開いたまま */
  calm?: boolean;
}

/** エンディング：すべての部分が戻っていて、明かりはついていない */
const ENDING_LOOK: HouseLook = { restored: () => 1, lit: false };
const CALM_LOOK: HouseLook = { ...ENDING_LOOK, calm: true };

export interface TitleOpts {
  /** 家の部分ごとの戻り具合（0〜1。HOUSE_PARTS） */
  restored: (part: string) => number;
  prompt: string | null;
  beatSec: number;
  /** 始めるキーを押してからの秒（TITLE_OUT。押す前は null） */
  exit?: number | null;
  /** 家に帰ってくる演出（HOMECOMING）：戻っていく部分と、始まってからの秒。このあいだはロゴも案内も出さない */
  home?: { part: string; sec: number } | null;
}

/** 描くのに要る絵（少女のコマは renderer が作って渡す） */
export interface EndingSprites {
  /** 正面（左下向き）の立ちと歩き */
  front: HTMLCanvasElement[];
  /** 背中（右上向き）の立ちと歩き */
  back: HTMLCanvasElement[];
  /** 手を挙げた正面 */
  raise: HTMLCanvasElement;
}

const W = 288;
const H = 288;

const C = {
  bg: '#07060b',
  lot: '#34322f',
  lotEdge: '#26241f',
  lotL: '#1b1a1e',
  lotR: '#141317',
  sidingL: '#43352b',
  sidingR: '#33281f',
  sidingLine: '#2a2019',
  plasterL: '#6a6357',
  plasterR: '#524c43',
  stain: '#4c473e',
  roof: '#3d424c',
  roofLine: '#2b2f37',
  roofRidge: '#4d535e',
  roofEdge: '#22252b',
  eave: '#2a2420',
  wood: '#3b2c24',
  woodDark: '#241a15',
  glass: '#1c2228',
  glassDim: '#2a3138',
  rail: '#5b544c',
  light: '#9cc6ff',
  lightCore: '#e6f2ff',
  /** 得点の総計（拠点の表示と同じ色：renderer の COLORS.gem） */
  gem: '#e3c56e',
  lightDeep: '#4f7fd0',
  warm: '#c9a467',
  warmDim: '#8a6c45',
  mote: '#5d5a66',
  dust: '#6f685e',
  dustLight: '#8d867a',
  // 傷んだ家：雨戸、むき出しの小舞（壁の下地）、苔、雑草、蔦
  amado: '#3e3530',
  lath: '#3a2f27',
  moss: '#3c4630',
  weed: '#46552f',
  weedDark: '#323e24',
  ivy: '#2f4a2e',
  ivyLight: '#46663f',
  text: '#e8e1d6',
  textDim: '#8d857a',
  rubbleTile: '#3a3f48',
  rubbleWood: '#4a3a2e',
  rubbleWoodDark: '#2e241d',
  rubblePlaster: '#6a6357',
  rubblePlasterDark: '#4a453d',
};

// ---- 家の形（グリッド座標 gx, gy と、地面からの高さ h ドット） ----
// 一階 x 0〜6、y 0〜5。二階は奥寄りの y 0〜3.6。二階の手前（+y）にベランダが張り出し、その下は一階の屋根（下屋）
const F1 = 26;
const F2 = 50;
const RIDGE = 68;
const BALCONY_H = 30;
const F2_FRONT = 3.6;
/** ベランダの床（手前の端）と、少女の立つ位置 */
const BALCONY_FRONT = 4.9;
// x は、ベランダのガラス戸の開く側（右の戸。BALCONY_DOOR の右半分）の中ほど。そこから出てきて、そこへ戻る
const GIRL_X = 3.35;
const GIRL_IN = 3.3;
const GIRL_OUT = 4.4;

/** 家の中心が画面のどこに来るか */
const OX = 138;
const OY = 132;

interface P {
  x: number;
  y: number;
}

/** 崩れ具合 c（0〜1）。高い所ほど縮み、真ん中がたわみ、+x 側へ傾いてひしゃげる */
function deform(gx: number, gy: number, h: number, c: number): { gx: number; gy: number; h: number } {
  if (c <= 0) return { gx, gy, h };
  const k = h / RIDGE;
  const sag = c * c * 12 * Math.sin((Math.PI * Math.min(Math.max(gx, 0), 6)) / 6) * k;
  return { gx: gx + c * 0.7 * k, gy: gy - c * 0.25 * k, h: Math.max(0, h * (1 - 0.9 * c) - sag) };
}

/** 崩れ具合の時間変化：きしんでたわみ、二階が潰れ、全体が潰れる。急に進むところで砂埃が上がる */
const JERKS = ENDING.jerks;
function collapseAt(t: number): number {
  const [t0, t1] = ENDING.collapse;
  if (t <= t0) return 0;
  if (t >= t1) return 1;
  const seg = (a: number, b: number, ca: number, cb: number, ease = (u: number) => u) =>
    t >= a && t < b ? ca + (cb - ca) * ease((t - a) / (b - a)) : null;
  const jump = (u: number) => 1 - (1 - u) ** 3;
  return (
    seg(t0, JERKS[0], 0, 0.1) ??
    seg(JERKS[0], JERKS[0] + 0.45, 0.1, 0.36, jump) ??
    seg(JERKS[0] + 0.45, JERKS[1], 0.36, 0.44) ??
    seg(JERKS[1], JERKS[1] + 0.5, 0.44, 0.78, jump) ??
    seg(JERKS[1] + 0.5, JERKS[2], 0.78, 0.84) ??
    seg(JERKS[2], JERKS[2] + 0.5, 0.84, 0.97, jump) ??
    0.97 + 0.03 * ((t - JERKS[2] - 0.5) / (t1 - JERKS[2] - 0.5))
  );
}

/** 0〜1 で返す決定的な乱数（同じ i なら同じ値） */
function hash(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 光の強さ（得点の使われた割合と同じ）。使い切ってからは、少女が家に入ったあとも家の中に灯っていて、発動の音が鳴りやむと消える */
function lightAt(t: number): number {
  const [a, b] = ENDING.light;
  if (t < a) return 0;
  if (t < b) return usedAt(t);
  const [o0, o1] = ENDING.lightsOut;
  return 1 - clamp01((t - o0) / (o1 - o0));
}

/** 得点の使われた割合：はじめはゆっくり、みるみる加速して、最後は一気に */
function usedAt(t: number): number {
  const u = clamp01((t - ENDING.light[0]) / (ENDING.light[1] - ENDING.light[0]));
  return u * u * (3 - 2 * u) * 0.35 + u ** 3 * 0.65;
}

/**
 * 得点の総計が 0 のときのエンディング（ENDING_CALM）。家は崩れず、少女はベランダに立ったまま、視点が上空へ昇っていく。
 * 空には星がまばらにあり、家より遠いのでゆっくり流れる（昇っていくのが分かるように）
 */
function drawCalmEnding(ctx: CanvasRenderingContext2D, t: number, sprites: EndingSprites, texts: EndingTexts): void {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const [p0, p1] = ENDING_CALM.pan;
  const u = clamp01((t - p0) / (p1 - p0));
  const pan = Math.round(PAN_H * u * u * (3 - 2 * u));

  // 星：家の上の空に。視点が昇ると、上から降りてくるように見える（家の 0.35 倍の速さ）
  const starShift = Math.round(pan * 0.35);
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(hash(i + 700) * W);
    const y = Math.floor(-PAN_H * 0.35 + hash(i + 800) * (H + PAN_H * 0.35)) + starShift;
    if (y < 0 || y >= H) continue;
    // ゆっくりまたたく（いくつかは時々消える）
    if (hash(i + 900 + Math.floor(t * 1.5)) < 0.12) continue;
    ctx.fillStyle = hash(i + 1000) < 0.25 ? C.text : C.textDim;
    ctx.fillRect(x, y, 1, 1);
  }

  ctx.save();
  ctx.translate(0, pan);
  const P = (gx: number, gy: number, h: number): P => ({ x: Math.round(OX + (gx - gy) * 12), y: Math.round(OY + (gx + gy) * 6 - h) });
  const quad = (pts: [number, number, number][], color: string) => fillQuad(ctx, pts.map(([x, y, h]) => P(x, y, h)), color);
  if (pan < H + 120) {
    lot(ctx);
    house(ctx, t, 0, quad, P, sprites, CALM_LOOK);
  }
  ctx.restore();

  // 結びの文：何も映らなくなった空の真ん中に、ゆっくりと
  const [e0, e1] = ENDING_CALM.text;
  if (t > e0) {
    ctx.globalAlpha = Math.ceil(clamp01((t - e0) / (e1 - e0)) * 16) / 16;
    const lines = texts.calmEpilogue;
    lines.forEach((line, i) => drawText(ctx, line, Math.round(W / 2 - textWidth(line, 1) / 2), Math.round(H / 2 - (lines.length * 12) / 2) + i * 12, 1, C.text));
    ctx.globalAlpha = 1;
  }

  // 闇から見えてくる（ENDING と同じ）
  if (t < ENDING.fadeIn) {
    ctx.globalAlpha = Math.ceil((1 - t / ENDING.fadeIn) * 16) / 16;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // 得点の総計：拠点と同じ位置に出ていて（0 のまま）、少女が立っているあいだに消える
  const [o0, o1] = ENDING_CALM.totalOut;
  const a = 1 - Math.ceil(clamp01((t - o0) / (o1 - o0)) * 4) / 4;
  if (a > 0) {
    const label = texts.total('0'.padStart(7, '0'));
    ctx.globalAlpha = a;
    drawText(ctx, label, TOTAL_AT.x + 1, TOTAL_AT.y + 1, 1, C.bg);
    drawText(ctx, label, TOTAL_AT.x, TOTAL_AT.y, 1, C.gem);
    ctx.globalAlpha = 1;
  }
}

/** 発動の音が鳴ると、家全体が青白く光り、音が鳴りやむまでに少しずつ弱まっていく（0〜1。滑らかに見えるよう16段階） */
function triggerGlow(t: number): number {
  const t0 = ENDING.trigger;
  const t1 = ENDING.lightsOut[1];
  if (t < t0 || t >= t1) return 0;
  const u = (t - t0) / (t1 - t0);
  return Math.ceil((1 - u) ** 2 * 16) / 16;
}

/** 光る家を描くための、家だけを描いておくバッファ（家の形・家の形のぬりつぶし） */
let houseLayer: HTMLCanvasElement | null = null;
let shapeLayer: HTMLCanvasElement | null = null;

/** 家を青白く光らせて描く（glow は 0〜1）。家の形に光を重ね、まわりに 1 ドット、淡い光をにじませる */
function glowingHouse(ctx: CanvasRenderingContext2D, glow: number, draw: (g: CanvasRenderingContext2D) => void): void {
  const layer = (c: HTMLCanvasElement | null) => {
    c ??= document.createElement('canvas');
    c.width = W;
    c.height = H;
    return c;
  };
  houseLayer = layer(houseLayer);
  shapeLayer = layer(shapeLayer);
  const g = houseLayer.getContext('2d')!;
  g.clearRect(0, 0, W, H);
  draw(g);
  // 家の形のぬりつぶし
  const s = shapeLayer.getContext('2d')!;
  s.clearRect(0, 0, W, H);
  s.drawImage(houseLayer, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = C.light;
  s.fillRect(0, 0, W, H);
  s.globalCompositeOperation = 'source-over';
  // まわりのにじみ
  ctx.globalAlpha = 0.5 * glow;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.drawImage(shapeLayer, dx, dy);
  // 家に光を重ねてから描く
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = 0.65 * glow;
  g.fillStyle = C.lightCore;
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.drawImage(houseLayer, 0, 0);
}

/** 画面の揺れの大きさ（ドット） */
function shakeAt(t: number): number {
  // 光の揺れは響きが止むと止み、轟音が聞こえはじめると轟音の揺れ
  let a = t < ENDING.climax ? lightAt(t) * 2 : 0;
  if (t >= ENDING.rumble) a = Math.max(a, 1 + clamp01((t - ENDING.rumble) / 2.5) * 2);
  for (const j of JERKS) if (t >= j) a = Math.max(a, 5 * Math.exp(-(t - j) * 2.2));
  const [, c1] = ENDING.collapse;
  if (t > c1) a = Math.min(a, 3 * (1 - clamp01((t - c1) / (ENDING.settle - 1 - c1))));
  return t > ENDING.settle ? 0 : a;
}

/** 砂埃のひとかたまり */
interface Puff {
  t0: number;
  gx: number;
  gy: number;
  h: number;
  life: number;
  r: number;
  drift: number;
}

const PUFFS: Puff[] = (() => {
  const puffs: Puff[] = [];
  let n = 0;
  const add = (t0: number, gx: number, gy: number, h: number, life: number, r: number) =>
    puffs.push({ t0, gx, gy, h, life, r, drift: hash(n++) * 2 - 1 });
  // きしみはじめ：屋根と窓から少し
  for (let i = 0; i < 6; i++) add(ENDING.collapse[0] + 0.2 + i * 0.18, hash(i + 10) * 6, 3.6 + hash(i + 20) * 1.4, 30 + hash(i + 30) * 30, 2.2, 3);
  // 潰れるたびに、家のいろいろな場所から
  JERKS.forEach((j, k) => {
    for (let i = 0; i < 20; i++) {
      const s = k * 100 + i;
      const onFront = hash(s) < 0.6;
      const gx = onFront ? hash(s + 1) * 6 : 6;
      const gy = onFront ? 5 : hash(s + 2) * 5;
      add(j + hash(s + 3) * 0.4, gx, gy, (1 - k * 0.35) * hash(s + 4) * 50, 3.5 + hash(s + 5) * 1.5, 7 + hash(s + 6) * 7);
    }
  });
  // 最後に地面すれすれに広がる大きな砂埃
  for (let i = 0; i < 16; i++) add(JERKS[2] + 0.4 + hash(i + 500) * 1.2, -1 + hash(i + 501) * 8, -1 + hash(i + 502) * 7, 2, 4.5, 8 + hash(i + 503) * 6);
  return puffs;
})();

/**
 * ガレキの山：一階の跡に、段々に盛り上がる（層 k の高さは k × MOUND_STEP）。
 * 層ごとの広がりは中心から外へ狭まっていく
 */
const MOUND_STEP = 5;
const MOUND_LAYERS = 5;
const MOUND_C = { x: 3, y: 2.6 };
const moundSize = (k: number) => ({ rx: 3.6 * (1 - k / (MOUND_LAYERS + 1)), ry: 3.0 * (1 - k / (MOUND_LAYERS + 1)) });
/** その場所のガレキの山の高さ */
function moundHeight(gx: number, gy: number): number {
  let h = 0;
  for (let k = 0; k < MOUND_LAYERS; k++) {
    const { rx, ry } = moundSize(k);
    if (Math.abs(gx - MOUND_C.x) + Math.abs(gy - MOUND_C.y) * (rx / ry) <= rx) h = (k + 1) * MOUND_STEP;
  }
  return h;
}

/** ガレキのひとかけ（山の上に積み重なる） */
interface Piece {
  kind: 'tile' | 'plank' | 'beam' | 'chunk';
  gx: number;
  gy: number;
  h: number;
  axis: 'x' | 'y';
  len: number;
  tilt: number;
  /** この崩れ具合を過ぎると見えてくる */
  appear: number;
}

const RUBBLE: Piece[] = (() => {
  const pieces: Piece[] = [];
  for (let i = 0; pieces.length < 130 && i < 1000; i++) {
    const gx = MOUND_C.x - 3.8 + hash(i * 7 + 1) * 7.6;
    const gy = MOUND_C.y - 3.2 + hash(i * 7 + 2) * 6.4;
    const h = moundHeight(gx, gy);
    if (h === 0) continue;
    const r = hash(i * 7 + 3);
    pieces.push({
      kind: r < 0.4 ? 'tile' : r < 0.65 ? 'plank' : r < 0.82 ? 'beam' : 'chunk',
      gx,
      gy,
      h,
      axis: hash(i * 7 + 5) < 0.5 ? 'x' : 'y',
      len: 0.4 + hash(i * 7 + 6) * 1.1,
      tilt: Math.round((hash(i * 7 + 7) - 0.5) * 12),
      appear: 0.55 + hash(i * 7 + 8) * 0.4,
    });
  }
  return pieces.sort((a, b) => a.gx + a.gy - (b.gx + b.gy));
})();

/**
 * エンディングを描く。t は始まってからの秒、total は使われる得点（これまでに溜めた得点）。
 * 少女の姿は、戸を閉めたあとは描かない
 */
/** エンディングに出す文（いまの言語の）。total は拠点と同じ得点の総計の表示。calmEpilogue は得点の総計が 0 のときの結びの文 */
export interface EndingTexts {
  total: (n: string) => string;
  epilogue: readonly string[];
  calmEpilogue: readonly string[];
}

export function drawEnding(ctx: CanvasRenderingContext2D, t: number, total: number, sprites: EndingSprites, texts: EndingTexts): void {
  if (total === 0) return drawCalmEnding(ctx, t, sprites, texts);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // 画面の揺れ（整数ドット）
  const amp = shakeAt(t);
  const f = Math.floor(t * 24);
  const sx = Math.round((hash(f) * 2 - 1) * amp);
  const sy = Math.round((hash(f + 9999) * 2 - 1) * amp * 0.6);
  const L = lightAt(t);
  const c = collapseAt(t);

  ctx.save();
  ctx.translate(sx, sy);
  const P = (gx: number, gy: number, h: number): P => {
    const d = deform(gx, gy, h, c);
    return { x: Math.round(OX + (d.gx - d.gy) * 12), y: Math.round(OY + (d.gx + d.gy) * 6 - d.h) };
  };
  const quad = (pts: [number, number, number][], color: string) => fillQuad(ctx, pts.map(([x, y, h]) => P(x, y, h)), color);

  // 家の建っていた土地（闇に浮かぶ板）
  lot(ctx);

  if (c < 0.97) {
    const glow = triggerGlow(t);
    if (glow > 0) glowingHouse(ctx, glow, (g) => house(g, t, L, (pts, color) => fillQuad(g, pts.map(([x, y, h]) => P(x, y, h)), color), P, sprites, ENDING_LOOK));
    else house(ctx, t, L, quad, P, sprites, ENDING_LOOK);
  }
  rubble(ctx, c);
  dust(ctx, t);
  if (c > 0 && c < 0.97) fallingTiles(ctx, t);

  // 少女の光：手から立ちのぼる光の柱と、少女を包む光
  if (L > 0 && t < ENDING.walkIn[0] + 0.3) {
    const g = P(GIRL_X, GIRL_OUT, BALCONY_H);
    girlLight(ctx, g.x, g.y, L, t);
  }
  ctx.restore();

  // 光が強いほど、画面全体がうっすら青い
  if (L > 0) {
    ctx.globalAlpha = L * 0.14;
    ctx.fillStyle = C.lightDeep;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // 結びの文：ガレキの画面の下に、小さく2行
  const [e0, e1] = ENDING.epilogue;
  if (t > e0) {
    ctx.globalAlpha = Math.ceil(clamp01((t - e0) / (e1 - e0)) * 4) / 4;
    texts.epilogue.forEach((line, i) => drawText(ctx, line, Math.round(W / 2 - textWidth(line, 1) / 2), 240 + i * 12, 1, C.text));
    ctx.globalAlpha = 1;
  }

  // 闇から見えてくる（拠点が闇に沈んでいくのと同じく16段階で滑らかに）
  if (t < ENDING.fadeIn) {
    ctx.globalAlpha = Math.ceil((1 - t / ENDING.fadeIn) * 16) / 16;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // 得点の総計は闇の上に描く（拠点が闇に沈むあいだも残っていた表示が、そのまま続いて見えるように）
  scoreCounter(ctx, t, total, L, texts.total);
}

/**
 * タイトル：闇に浮かぶ家と、その前に立つ少女。家はゆっくり上下に漂い、闇には細かな塵が漂う。
 * 家は、クリアしたステージに当たる部分だけが戻っていて（HOUSE_PARTS）、戻った部分の窓と門灯に暖かい明かりがともる。
 * 文字はタイトルのロゴと、prompt（はじめ方の一言。null なら出さない）だけ。
 * home なら家に帰ってくる演出（HOMECOMING）で、ロゴも案内も出さず、その部分が戻っていく
 */
export function drawTitle(ctx: CanvasRenderingContext2D, t: number, opts: TitleOpts, sprites: EndingSprites): void {
  const home = opts.home ?? null;
  const exit = home ? (home.sec >= HOMECOMING.walk ? home.sec - HOMECOMING.walk : null) : (opts.exit ?? null);
  const [r0, r1] = HOMECOMING.restore;
  const restoring = home ? clamp01((home.sec - r0) / (r1 - r0)) : 1;
  const restored = (part: string) => (home && part === home.part ? restoring : opts.restored(part));
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  motes(ctx, t);

  // 家と土地は、ゆっくり上下に漂う
  const bob = Math.round(Math.sin(t * 0.8) * 2);
  ctx.save();
  ctx.translate(0, bob + 18);
  const P = (gx: number, gy: number, h: number): P => ({ x: Math.round(OX + (gx - gy) * 12), y: Math.round(OY + (gx + gy) * 6 - h) });
  const quad = (pts: [number, number, number][], color: string) => fillQuad(ctx, pts.map(([x, y, h]) => P(x, y, h)), color);
  lot(ctx);
  house(ctx, 0, 0, quad, P, sprites, { restored, lit: true });
  // 明かりのともった窓と門灯の下の土に、うっすら光が落ちる
  const glows = [
    ...WINDOWS.filter((w) => w.h0 < F1).map((w) => ({ part: w.part, q: w.face === 'y' ? P((w.u0 + w.u1) / 2, 5.6, 0) : P(6.6, (w.u0 + w.u1) / 2, 0) })),
    { part: 'STAGE1', q: P(PORCH_LAMP.u, 5.5, 0) },
  ];
  for (const { part, q } of glows) {
    ctx.globalAlpha = (Math.ceil(restored(part) * 4) / 4) * 0.1;
    if (ctx.globalAlpha > 0) fillEllipse(ctx, q.x, q.y, 7, 2, C.warm);
    ctx.globalAlpha = 1;
  }
  // 敷石と壁の根もとに伸びた草（玄関が戻ると消える）
  weeds(ctx, P, Math.ceil((1 - restored('STAGE1')) * 4) / 4);
  // 戻っていく部分から、埃が舞い上がって消える
  if (home && restoring > 0 && restoring < 1) restoreMotes(ctx, P, home.part, restoring);
  if (exit !== null) {
    // 玄関の引き戸に明かりがともる（家の中で待っているものがある）
    const u0 = ENTRANCE.u0;
    const u1 = ENTRANCE.u1;
    const mid = (u0 + u1) / 2;
    ctx.globalAlpha = Math.ceil(clamp01((exit - TITLE_OUT.door[0]) / (TITLE_OUT.door[1] - TITLE_OUT.door[0])) * 4) / 4;
    quad([[u0, 5, 5], [u1, 5, 5], [u1, 5, ENTRANCE.h1], [u0, 5, ENTRANCE.h1]], C.warm);
    ctx.globalAlpha = 1;
    quad([[mid - 0.05, 5, 0], [mid + 0.05, 5, 0], [mid + 0.05, 5, ENTRANCE.h1], [mid - 0.05, 5, ENTRANCE.h1]], C.wood);
    ctx.globalAlpha = 0.12;
    fillEllipse(ctx, P(mid, 5.6, 0).x, P(mid, 5.6, 0).y, 9, 3, C.warm);
    ctx.globalAlpha = 1;
  }
  if (exit !== null && exit >= TITLE_OUT.turn) {
    // 振り返って戸口へ歩き、戸口をくぐると家の中の明かりに見えなくなる
    const [w0, w1] = TITLE_OUT.walk;
    const u = clamp01((exit - w0) / (w1 - w0));
    const gy = 6.2 - 1.2 * u;
    const g = P(1.2, gy, 0);
    const alpha = clamp01((gy - 5) / 0.5);
    const img = u > 0 && u < 1 ? sprites.back[1 + (Math.floor(exit * 8) % (sprites.back.length - 1))] : sprites.back[0];
    const a = Math.ceil(alpha * 4) / 4;
    if (a > 0) {
      ctx.globalAlpha = 0.35 * a;
      fillEllipse(ctx, g.x, g.y, 4, 1, '#000');
      ctx.globalAlpha = a;
      ctx.drawImage(img, g.x - GIRL_FOOT_X, g.y - GIRL_FOOT_Y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.globalAlpha = home ? 0 : 1 - Math.ceil(clamp01(exit / TITLE_OUT.logo) * 4) / 4;
    if (ctx.globalAlpha > 0) logo(ctx, t);
    ctx.globalAlpha = Math.ceil(clamp01((exit - TITLE_OUT.fade[0]) / (TITLE_OUT.fade[1] - TITLE_OUT.fade[0])) * 4) / 4;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    return;
  }
  // 少女：玄関の前の敷石に立って、拍に合わせて身体を揺らしている
  const g = P(1.2, 6.2, 0);
  const dip = (t % opts.beatSec) / opts.beatSec < 0.5 ? 1 : 0;
  ctx.globalAlpha = 0.35;
  fillEllipse(ctx, g.x, g.y, 4, 1, '#000');
  ctx.globalAlpha = 1;
  const img = sprites.front[0];
  // 腰から上だけを沈める（ステージ中の少女と同じ揺れ方）
  const waist = 17;
  ctx.drawImage(img, 0, waist, img.width, img.height - waist, g.x - GIRL_FOOT_X, g.y - GIRL_FOOT_Y + waist, img.width, img.height - waist);
  ctx.drawImage(img, 0, 0, img.width, waist, g.x - GIRL_FOOT_X, g.y - GIRL_FOOT_Y + dip, img.width, waist);
  ctx.restore();

  if (home) {
    // 闇から見えてくる
    ctx.globalAlpha = Math.ceil((1 - clamp01(home.sec / HOMECOMING.fade)) * 4) / 4;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    return;
  }
  logo(ctx, t);
  if (opts.prompt && exit === null && Math.floor(t * 1.6) % 2 === 0) {
    const scale = 1;
    const tw = textWidth(opts.prompt, scale);
    drawText(ctx, opts.prompt, Math.round(W / 2 - tw / 2) + 1, 247, scale, C.bg);
    drawText(ctx, opts.prompt, Math.round(W / 2 - tw / 2), 246, scale, C.text);
  }
}

/** タイトルのロゴ。大きな文字の下に、細い線を一本 */
function logo(ctx: CanvasRenderingContext2D, t: number): void {
  const text = 'METROGRID';
  const scale = 4;
  const tw = textWidth(text, scale);
  const x = Math.round(W / 2 - tw / 2);
  const y = 30;
  drawText(ctx, text, x + 2, y + 2, scale, '#000');
  drawText(ctx, text, x, y, scale, C.text);
  // 線は、ゆっくり左右へ伸び縮みする（呼吸のように）
  const half = Math.round(tw / 2 - 6 - Math.sin(t * 0.8) * 4);
  ctx.fillStyle = C.textDim;
  ctx.fillRect(W / 2 - half, y + GLYPH_H * scale + 6, half * 2, 1);
}

/** 闇に漂う細かな塵：ゆっくり上へ流れ、ときどき瞬く */
function motes(ctx: CanvasRenderingContext2D, t: number): void {
  for (let i = 0; i < 48; i++) {
    const x = Math.round((hash(i) * W + Math.sin(t * 0.3 + i) * 6 + W) % W);
    const y = Math.round((((hash(i + 100) * H - t * (4 + hash(i + 200) * 6)) % H) + H) % H);
    if (hash(i + 300 + Math.floor(t * 2)) < 0.15) continue;
    ctx.fillStyle = hash(i + 400) < 0.2 ? C.textDim : C.mote;
    ctx.fillRect(x, y, 1, 1);
  }
}

/** 家の建っていた土地：闇に浮かぶ板。上面は土と敷石 */
function lot(ctx: CanvasRenderingContext2D): void {
  const pt = (gx: number, gy: number, h = 0): P => ({ x: Math.round(OX + (gx - gy) * 12), y: Math.round(OY + (gx + gy) * 6 - h) });
  const [x0, x1, y0, y1] = [-1.5, 7.5, -1.5, 6.6];
  fillQuad(ctx, [pt(x0, y1), pt(x1, y1), pt(x1, y1, -8), pt(x0, y1, -8)], C.lotL);
  fillQuad(ctx, [pt(x1, y1), pt(x1, y0), pt(x1, y0, -8), pt(x1, y1, -8)], C.lotR);
  fillQuad(ctx, [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)], C.lotEdge);
  fillQuad(ctx, [pt(x0 + 0.15, y0 + 0.15), pt(x1 - 0.15, y0 + 0.15), pt(x1 - 0.15, y1 - 0.15), pt(x0 + 0.15, y1 - 0.15)], C.lot);
  // 玄関へ続く敷石
  for (let i = 0; i < 3; i++) {
    const q = pt(1.2, 5.5 + i * 0.4);
    fillDiamond(ctx, q.x, q.y - 2, 10, 5, C.lotEdge);
  }
}

/** 窓と戸の位置。face 'y' は +y の面（画面の左手前）、'x' は +x の面（右手前）。u はその面に沿った位置 */
/** part はその窓が戻るステージ（HOUSE_PARTS）。shutter なら、傷んでいるあいだは雨戸が閉まっている（ほかはガラスが割れている） */
const WINDOWS: { face: 'x' | 'y'; u0: number; u1: number; h0: number; h1: number; at: number; part: string; shutter?: boolean }[] = [
  { face: 'y', u0: 3.4, u1: 5.2, h0: 8, h1: 20, at: 0.15, part: 'STAGE3' },
  { face: 'x', u0: 3.2, u1: 4.5, h0: 8, h1: 20, at: 0.3, part: 'STAGE2', shutter: true },
  { face: 'x', u0: 0.7, u1: 2.3, h0: 8, h1: 20, at: 0.45, part: 'STAGE4' },
  { face: 'y', u0: 0.5, u1: 1.7, h0: 33, h1: 44, at: 0.55, part: 'STAGE5' },
  { face: 'y', u0: 4.3, u1: 5.5, h0: 33, h1: 44, at: 0.65, part: 'STAGE5', shutter: true },
  { face: 'x', u0: 1.0, u1: 2.6, h0: 33, h1: 45, at: 0.75, part: 'STAGE5' },
];
/** 玄関の脇の門灯（一階の手前の壁。u は壁に沿った位置） */
const PORCH_LAMP = { u: 2.2, h0: 9, h1: 14 };

/** 割れたガラス（窓の中の位置の割合 [u0, u1, h0, h1]）。窓ごとに少しずらす */
const BROKEN_PANES = [
  [0.08, 0.3, 0.45, 0.85],
  [0.6, 0.82, 0.1, 0.4],
  [0.62, 0.9, 0.55, 0.8],
];

/** 一階の屋根（下屋）と二階の屋根の、傷んでいるあいだだけ欠けている瓦 [gx, 斜面に沿った位置 0〜1]。苔は [gx, 位置, 幅] */
const LOWER_HOLES = [[2.0, 0.2], [3.2, 0.55], [4.5, 0.25], [5.4, 0.62], [1.5, 0.72]];
const LOWER_MOSS = [[0.2, 0.75, 0.9], [2.6, 0.8, 1.2], [4.0, 0.7, 0.8]];
const UPPER_HOLES = [[0.9, 0.3], [2.2, 0.62], [3.3, 0.22], [5.7, 0.5], [1.6, 0.8], [4.2, 0.7]];
const UPPER_MOSS = [[0.0, 0.1, 1.4], [3.0, 0.08, 1.0], [5.0, 0.15, 1.2]];

/** 草の生えている所 [gx, gy]（敷石のまわりと、壁の根もと） */
const WEEDS: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let i = 0; i < 10; i++) out.push([0.6 + hash(i + 700) * 1.3, 5.45 + hash(i + 710) * 1.0]);
  for (let i = 0; i < 12; i++) out.push([hash(i + 720) * 6, 5.08 + hash(i + 730) * 0.15]);
  for (let i = 0; i < 9; i++) out.push([6.08 + hash(i + 740) * 0.15, hash(i + 750) * 5]);
  for (let i = 0; i < 6; i++) out.push([-1.2 + hash(i + 760) * 8.4, 6.0 + hash(i + 770) * 0.5]);
  return out;
})();

/** 敷石と壁の根もとに伸びた草。a は濃さ（0 なら描かない） */
function weeds(ctx: CanvasRenderingContext2D, P: (gx: number, gy: number, h: number) => P, a: number): void {
  if (a <= 0) return;
  ctx.globalAlpha = a;
  for (const [i, [gx, gy]] of WEEDS.entries()) {
    const q = P(gx, gy, 0);
    for (let b = 0; b < 3; b++) {
      const h = 2 + Math.floor(hash(i * 3 + b + 800) * 5);
      ctx.fillStyle = b === 1 ? C.weed : C.weedDark;
      ctx.fillRect(q.x - 1 + b, q.y - h, 1, h);
    }
  }
  ctx.globalAlpha = 1;
}

/** 戻っていく部分のまわりの範囲 [gx0, gx1, gy0, gy1, h0, h1]（舞い上がる埃が出る所） */
const PART_AREAS: Record<string, number[][]> = {
  STAGE1: [[0.3, 2.5, 5, 5, 0, 20], [0.6, 1.9, 5.4, 6.4, 0, 2]],
  STAGE2: [[6, 6, 3.2, 4.5, 8, 20]],
  STAGE3: [[3.4, 5.2, 5, 5, 8, 20]],
  STAGE4: [[-0.3, 6.3, 4.4, 4.4, 24, 28], [6, 6, 0.7, 2.3, 8, 20]],
  STAGE5: [[0, 6, F2_FRONT, F2_FRONT, 30, 48], [6, 6, 0, F2_FRONT, 30, 48], [-0.4, 6.4, 3, 3, 56, 60]],
};

/** 部分が戻るとき、そこから埃が舞い上がって消える（u は 0〜1） */
function restoreMotes(ctx: CanvasRenderingContext2D, P: (gx: number, gy: number, h: number) => P, part: string, u: number): void {
  const areas = PART_AREAS[part] ?? [];
  for (let i = 0; i < 36; i++) {
    const [x0, x1, y0, y1, h0, h1] = areas[i % areas.length];
    // 1粒ごとに、舞い上がり始める時刻をずらす
    const k = clamp01((u - hash(i + 900) * 0.5) / 0.5);
    if (k <= 0 || k >= 1) continue;
    const q = P(x0 + (x1 - x0) * hash(i + 910), y0 + (y1 - y0) * hash(i + 920), h0 + (h1 - h0) * hash(i + 930));
    ctx.globalAlpha = Math.ceil((1 - k) * 4) / 4;
    ctx.fillStyle = hash(i + 940) < 0.3 ? C.warm : C.dustLight;
    ctx.fillRect(q.x + Math.round(Math.sin(k * 4 + i) * 2), q.y - Math.round(k * (10 + hash(i + 950) * 14)), 1, 1);
  }
  ctx.globalAlpha = 1;
}
/** 玄関の引き戸（一階の手前）とベランダのガラス戸（二階の手前） */
const ENTRANCE = { u0: 0.6, u1: 1.8, h0: 0, h1: 19 };
const BALCONY_DOOR = { u0: 2.3, u1: 3.7, h0: BALCONY_H, h1: 47 };

function house(
  ctx: CanvasRenderingContext2D,
  t: number,
  L: number,
  quad: (pts: [number, number, number][], color: string) => void,
  P: (gx: number, gy: number, h: number) => P,
  sprites: EndingSprites,
  look: HouseLook,
): void {
  const faceQuad = (face: 'x' | 'y', u0: number, u1: number, h0: number, h1: number, plane: number, color: string) =>
    face === 'y'
      ? quad([[u0, plane, h0], [u1, plane, h0], [u1, plane, h1], [u0, plane, h1]], color)
      : quad([[plane, u1, h0], [plane, u0, h0], [plane, u0, h1], [plane, u1, h1]], color);
  /** 部分の傷み（四分の一ずつ。0 なら戻っている）と、その濃さで重ねて描く */
  const worn = (part: string) => Math.ceil((1 - look.restored(part)) * 4) / 4;
  const overlay = (a: number, draw: () => void) => {
    if (a <= 0) return;
    ctx.globalAlpha = a;
    draw();
    ctx.globalAlpha = 1;
  };
  /** 屋根の斜面の上の四角（v は斜面に沿った位置 0〜1） */
  const lowerRoof = (g0: number, g1: number, v0: number, v1: number, color: string) => {
    const at = (v: number): [number, number] => [F2_FRONT + (5.4 - F2_FRONT) * v, F1 + 4 - 7 * v];
    const [a, b] = [at(v0), at(v1)];
    quad([[g0, a[0], a[1]], [g1, a[0], a[1]], [g1, b[0], b[1]], [g0, b[0], b[1]]], color);
  };
  const upperRoof = (g0: number, g1: number, v0: number, v1: number, color: string) => {
    const at = (v: number): [number, number] => [4.0 - 2.2 * v, F2 - 1 + (RIDGE - F2 + 1) * v];
    const [a, b] = [at(v0), at(v1)];
    quad([[g0, a[0], a[1]], [g1, a[0], a[1]], [g1, b[0], b[1]], [g0, b[0], b[1]]], color);
  };

  // 一階：古い下見板の壁
  quad([[0, 5, 0], [6, 5, 0], [6, 5, F1], [0, 5, F1]], C.sidingL);
  quad([[6, 5, 0], [6, 0, 0], [6, 0, F1], [6, 5, F1]], C.sidingR);
  for (let h = 4; h < F1; h += 4) {
    const a = P(0, 5, h);
    const b = P(6, 5, h);
    const d = P(6, 0, h);
    plotLine(ctx, a.x, a.y, b.x, b.y, C.sidingLine);
    plotLine(ctx, b.x, b.y, d.x, d.y, C.sidingLine);
  }
  // 二階：日に焼けて染みの浮いた漆喰の壁
  quad([[0, F2_FRONT, F1], [6, F2_FRONT, F1], [6, F2_FRONT, F2], [0, F2_FRONT, F2]], C.plasterL);
  quad([[6, F2_FRONT, F1], [6, 0, F1], [6, 0, F2], [6, F2_FRONT, F2]], C.plasterR);
  faceQuad('y', 5.0, 5.6, F1 + 2, F1 + 12, F2_FRONT, C.stain);
  faceQuad('x', 2.8, 3.3, F1 + 4, F1 + 16, 6, C.stain);
  // 二階が戻るまで：雨の筋の染みが増え、漆喰がはがれて下地の小舞がのぞく
  overlay(worn('STAGE5'), () => {
    faceQuad('y', 3.0, 3.4, F1 + 2, F2 - 2, F2_FRONT, C.stain);
    faceQuad('y', 0.2, 0.5, F1 + 1, F1 + 14, F2_FRONT, C.stain);
    faceQuad('x', 3.6, 4.0, F1 + 1, F2 - 3, 6, C.stain);
    for (const [face, u0, u1, h0, h1, plane] of [['y', 1.95, 2.55, F1 + 5, F1 + 12, F2_FRONT], ['x', 0.2, 0.75, F1 + 13, F1 + 20, 6]] as const) {
      faceQuad(face, u0, u1, h0, h1, plane, C.lath);
      for (let h = h0 + 1; h < h1; h += 2) faceQuad(face, u0, u1, h, h + 0.6, plane, C.woodDark);
    }
    // 右の壁を這い上がる蔦
    for (let k = 0; k < 40; k++) {
      const q = P(6, 2.3 + hash(k + 600) * 1.3, F1 + hash(k + 610) ** 2 * 22);
      ctx.fillStyle = hash(k + 620) < 0.4 ? C.ivyLight : C.ivy;
      ctx.fillRect(q.x, q.y, 2, 1);
    }
  });

  // 窓：ふだんは暗い（タイトルでは、戻った部分の窓に暖かい明かりがともる）。傷んでいるあいだは、ガラスが割れているか雨戸が閉まっている。
  // 光が強まると、家の窓という窓から少女と同じ青い光が漏れる
  for (const [i, w] of WINDOWS.entries()) {
    const plane = w.face === 'y' ? (w.h0 >= F1 ? F2_FRONT : 5) : 6;
    faceQuad(w.face, w.u0 - 0.08, w.u1 + 0.08, w.h0 - 1, w.h1 + 1, plane, C.woodDark);
    const glow = clamp01((L - w.at) / 0.2);
    faceQuad(w.face, w.u0, w.u1, w.h0, w.h1, plane, glow > 0 ? C.lightDeep : look.lit && look.restored(w.part) > 0 ? C.warm : C.glass);
    if (glow > 0) {
      ctx.globalAlpha = glow;
      faceQuad(w.face, w.u0, w.u1, w.h0, w.h1, plane, C.light);
      ctx.globalAlpha = 1;
    }
    // 格子
    const mid = (w.u0 + w.u1) / 2;
    faceQuad(w.face, mid - 0.04, mid + 0.04, w.h0, w.h1, plane, C.woodDark);
    overlay(glow > 0 ? 0 : worn(w.part), () => {
      const du = w.u1 - w.u0;
      const dh = w.h1 - w.h0;
      if (w.shutter) {
        // 閉まったままの雨戸：縦の板。一枚だけ板の継ぎ目が開いている
        faceQuad(w.face, w.u0, w.u1, w.h0, w.h1, plane, C.amado);
        for (let k = 1; k < 5; k++) faceQuad(w.face, w.u0 + (du * k) / 5 - 0.02, w.u0 + (du * k) / 5 + 0.02, w.h0, w.h1, plane, C.woodDark);
        faceQuad(w.face, w.u0 + (du * 3) / 5 - 0.04, w.u0 + (du * 3) / 5 + 0.04, w.h0 + 2, w.h1 - 3, plane, C.bg);
      } else {
        faceQuad(w.face, w.u0, w.u1, w.h0, w.h1, plane, C.glass);
        for (const [k, [a0, a1, b0, b1]] of BROKEN_PANES.entries()) {
          if ((i + k) % 3 === 2) continue;
          faceQuad(w.face, w.u0 + du * a0, w.u0 + du * a1, w.h0 + dh * b0, w.h0 + dh * b1, plane, C.bg);
        }
        faceQuad(w.face, mid - 0.04, mid + 0.04, w.h0, w.h1, plane, C.woodDark);
      }
    });
  }
  // 割れた窓ガラスがひとつ（家は最初からどこかボロボロ）
  faceQuad('y', 4.5, 4.75, 15, 19, 5, C.bg);

  // 玄関の引き戸
  faceQuad('y', ENTRANCE.u0 - 0.1, ENTRANCE.u1 + 0.1, ENTRANCE.h0, ENTRANCE.h1 + 2, 5, C.woodDark);
  faceQuad('y', ENTRANCE.u0, ENTRANCE.u1, 5, ENTRANCE.h1, 5, L > 0.1 ? C.lightDeep : C.glassDim);
  faceQuad('y', (ENTRANCE.u0 + ENTRANCE.u1) / 2 - 0.05, (ENTRANCE.u0 + ENTRANCE.u1) / 2 + 0.05, 0, ENTRANCE.h1, 5, C.wood);
  // 門灯（タイトルでは、玄関が戻るとともる）
  const lamp = PORCH_LAMP;
  faceQuad('y', lamp.u - 0.2, lamp.u + 0.2, lamp.h0 - 1, lamp.h1 + 1, 5, C.woodDark);
  faceQuad('y', lamp.u - 0.14, lamp.u + 0.14, lamp.h0, lamp.h1, 5, look.lit && look.restored('STAGE1') > 0 && L <= 0.1 ? C.warm : C.glassDim);
  // 玄関が戻るまで：引き戸のガラスが割れ、下のほうは泥はねで汚れ、門灯のガラスも割れている
  overlay(worn('STAGE1'), () => {
    faceQuad('y', ENTRANCE.u0, ENTRANCE.u1, 5, 8, 5, C.stain);
    faceQuad('y', ENTRANCE.u0 + 0.1, ENTRANCE.u0 + 0.42, 11, 16, 5, C.bg);
    faceQuad('y', ENTRANCE.u1 - 0.4, ENTRANCE.u1 - 0.12, 7, 10, 5, C.bg);
    faceQuad('y', lamp.u - 0.14, lamp.u + 0.14, lamp.h0, lamp.h1, 5, C.glass);
    faceQuad('y', lamp.u - 0.02, lamp.u + 0.14, lamp.h0, lamp.h0 + 3, 5, C.bg);
  });

  // ベランダのガラス戸：右の戸が開いて、中は暗い
  const open =
    t < ENDING.doorOpen[0]
      ? 0
      : t < ENDING.doorOpen[1]
        ? (t - ENDING.doorOpen[0]) / (ENDING.doorOpen[1] - ENDING.doorOpen[0])
        : t < ENDING.doorClose[0] || look.calm
          ? 1
          : 1 - clamp01((t - ENDING.doorClose[0]) / (ENDING.doorClose[1] - ENDING.doorClose[0]));
  const d = BALCONY_DOOR;
  const half = (d.u1 - d.u0) / 2;
  faceQuad('y', d.u0 - 0.1, d.u1 + 0.1, d.h0, d.h1 + 2, F2_FRONT, C.woodDark);
  faceQuad('y', d.u0, d.u1, d.h0, d.h1, F2_FRONT, C.bg);
  const doorGlass = L > 0.3 ? C.lightDeep : C.glassDim;
  faceQuad('y', d.u0, d.u0 + half, d.h0, d.h1, F2_FRONT, doorGlass);
  const slide = open * half;
  faceQuad('y', d.u0 + half + slide - 0.05, Math.min(d.u1 + slide, d.u1 + half), d.h0, d.h1, F2_FRONT, doorGlass);
  faceQuad('y', d.u0 + half + slide - 0.05, d.u0 + half + slide + 0.03, d.h0, d.h1, F2_FRONT, C.wood);

  // 一階の屋根（下屋）：二階の手前に張り出す瓦屋根。いくつか瓦が欠けている
  quad([[-0.3, F2_FRONT, F1 + 4], [6.3, F2_FRONT, F1 + 4], [6.3, 5.4, F1 - 3], [-0.3, 5.4, F1 - 3]], C.roof);
  quad([[6.3, 5.4, F1 - 3], [6.3, F2_FRONT, F1 + 4], [6.3, F2_FRONT, F1 + 2], [6.3, 5.4, F1 - 5]], C.roofEdge);
  for (const g of [-0.3, 1, 2.3, 3.6, 4.9, 6.2]) {
    const a = P(g, F2_FRONT, F1 + 4);
    const b = P(g, 5.4, F1 - 3);
    plotLine(ctx, a.x, a.y, b.x, b.y, C.roofLine);
  }
  quad([[0.6, 4.3, F1 + 1], [1.0, 4.3, F1 + 1], [1.0, 4.7, F1 - 1], [0.6, 4.7, F1 - 1]], C.bg);
  // 一階の屋根が戻るまで：欠けた瓦が増え、苔がついている
  overlay(worn('STAGE4'), () => {
    for (const [g, v, w] of LOWER_MOSS) lowerRoof(g, g + w, v, Math.min(1, v + 0.18), C.moss);
    for (const [g, v] of LOWER_HOLES) lowerRoof(g, g + 0.38, v, v + 0.2, C.bg);
  });

  // ベランダの床
  quad([[1.7, F2_FRONT, BALCONY_H], [4.3, F2_FRONT, BALCONY_H], [4.3, BALCONY_FRONT, BALCONY_H], [1.7, BALCONY_FRONT, BALCONY_H]], C.wood);
  quad([[1.7, BALCONY_FRONT, BALCONY_H], [4.3, BALCONY_FRONT, BALCONY_H], [4.3, BALCONY_FRONT, BALCONY_H - 2], [1.7, BALCONY_FRONT, BALCONY_H - 2]], C.woodDark);

  // 二階の屋根：棟は x 方向。奥の斜面（少しだけ見える）、手前の斜面、+x 側の妻
  quad([[-0.4, 1.8, RIDGE], [6.4, 1.8, RIDGE], [6.4, -0.4, F2 - 1], [-0.4, -0.4, F2 - 1]], C.roofLine);
  quad([[6, F2_FRONT, F2], [6, 0, F2], [6, 1.8, RIDGE - 2], [6, 1.8, RIDGE - 2]], C.plasterR);
  quad([[-0.4, 4.0, F2 - 1], [6.4, 4.0, F2 - 1], [6.4, 1.8, RIDGE], [-0.4, 1.8, RIDGE]], C.roof);
  for (let i = 1; i < 6; i++) {
    const g = -0.4 + (6.8 * i) / 6;
    const a = P(g, 4.0, F2 - 1);
    const b = P(g, 1.8, RIDGE);
    plotLine(ctx, a.x, a.y, b.x, b.y, C.roofLine);
  }
  for (const k of [0.33, 0.66]) {
    const a = P(-0.4, 4.0 - 2.2 * k, F2 - 1 + (RIDGE - F2 + 1) * k);
    const b = P(6.4, 4.0 - 2.2 * k, F2 - 1 + (RIDGE - F2 + 1) * k);
    plotLine(ctx, a.x, a.y, b.x, b.y, C.roofLine);
  }
  // 破風と棟
  const e0 = P(6.4, 4.0, F2 - 1);
  const e1 = P(6.4, 1.8, RIDGE);
  const e2 = P(6.4, -0.4, F2 - 1);
  plotLine(ctx, e0.x, e0.y, e1.x, e1.y, C.roofEdge);
  plotLine(ctx, e1.x, e1.y, e2.x, e2.y, C.roofEdge);
  const g0 = P(-0.4, 1.8, RIDGE);
  plotLine(ctx, g0.x, g0.y, e1.x, e1.y, C.roofRidge);
  plotLine(ctx, g0.x, g0.y - 1, e1.x, e1.y - 1, C.roofRidge);
  // 欠けた瓦
  quad([[4.6, 3.1, F2 + 6], [5.0, 3.1, F2 + 6], [5.0, 2.8, F2 + 9], [4.6, 2.8, F2 + 9]], C.bg);
  // 二階の屋根が戻るまで：欠けた瓦が増え、軒先に苔がついている
  overlay(worn('STAGE5'), () => {
    for (const [g, v, w] of UPPER_MOSS) upperRoof(g, g + w, v, v + 0.12, C.moss);
    for (const [g, v] of UPPER_HOLES) upperRoof(g, g + 0.4, v, v + 0.12, C.bg);
  });

  // 少女（ベランダ）。床の上、手すりより奥に描く。屋根のあとに描くのは、少女が軒より背が高く、軒の下で頭が欠けないように
  // （戸口より奥にいるあいだは見えないので、二階の壁や軒の前に出ることはない）
  const pose = girlPose(t, sprites, !!look.calm);
  if (pose) drawGirl(ctx, pose, P);

  // ベランダの手すり
  for (let i = 0; i <= 8; i++) {
    const g = 1.7 + (2.6 * i) / 8;
    const a = P(g, BALCONY_FRONT, BALCONY_H);
    const b = P(g, BALCONY_FRONT, BALCONY_H + 8);
    plotLine(ctx, a.x, a.y, b.x, b.y, C.rail);
  }
  for (const g of [F2_FRONT + 0.4, F2_FRONT + 0.8]) {
    const a = P(4.3, g, BALCONY_H);
    const b = P(4.3, g, BALCONY_H + 8);
    plotLine(ctx, a.x, a.y, b.x, b.y, C.rail);
  }
  const r0 = P(1.7, BALCONY_FRONT, BALCONY_H + 9);
  const r1 = P(4.3, BALCONY_FRONT, BALCONY_H + 9);
  const r2 = P(4.3, F2_FRONT, BALCONY_H + 9);
  plotLine(ctx, r0.x, r0.y, r1.x, r1.y, C.rail);
  plotLine(ctx, r1.x, r1.y, r2.x, r2.y, C.rail);

}

/** ベランダの少女：戸口から出てきて、手を挙げ、手を下ろして、家の中へ戻る。いないときは null */
function girlPose(t: number, sprites: EndingSprites, stay = false): { gy: number; img: HTMLCanvasElement; alpha: number } | null {
  const [o0, o1] = ENDING.walkOut;
  // stay なら（ENDING_CALM）、出てきたあとは手を挙げず、戻らずにずっと立っている
  const [i0, i1] = stay ? [Infinity, Infinity] : ENDING.walkIn;
  if (t < o0 || t >= i1) return null;
  let gy: number;
  let img: HTMLCanvasElement;
  let alpha: number;
  const walkFrame = (frames: HTMLCanvasElement[]) => frames[1 + (Math.floor(t * 8) % (frames.length - 1))];
  if (t < o1) {
    const u = (t - o0) / (o1 - o0);
    gy = GIRL_IN + (GIRL_OUT - GIRL_IN) * u;
    img = walkFrame(sprites.front);
  } else if (t < i0) {
    gy = GIRL_OUT;
    img = !stay && t >= ENDING.raise && t < ENDING.lower ? sprites.raise : sprites.front[0];
  } else {
    // 振り返って、ふだんどおりの足どりで戸口へ
    const u = (t - i0) / (i1 - i0);
    gy = GIRL_OUT + (GIRL_IN - GIRL_OUT) * u;
    img = walkFrame(sprites.back);
  }
  // 戸口の暗がりから浮かび上がり、戸口をくぐると暗がりに見えなくなる（戸口より奥では見せない。頭が戸の上の壁に欠けるので）
  alpha = clamp01((gy - F2_FRONT) / 0.3);
  return { gy, img, alpha };
}

function drawGirl(ctx: CanvasRenderingContext2D, pose: { gy: number; img: HTMLCanvasElement; alpha: number }, P: (gx: number, gy: number, h: number) => P): void {
  const p = P(GIRL_X, pose.gy, BALCONY_H);
  ctx.globalAlpha = pose.alpha;
  ctx.drawImage(pose.img, p.x - GIRL_FOOT_X, p.y - GIRL_FOOT_Y);
  ctx.globalAlpha = 1;
}

/** 少女を包む青い光と、挙げた手から立ちのぼる光の柱 */
function girlLight(ctx: CanvasRenderingContext2D, x: number, y: number, L: number, t: number): void {
  const cy = y - 12;
  for (let r = 3; r <= 3 + Math.round(L * 5); r++) {
    ctx.globalAlpha = 0.16 * L;
    fillEllipse(ctx, x, cy, r * 4, r * 3, C.light);
  }
  ctx.globalAlpha = 0.4 + L * 0.5;
  const w = 1 + Math.round(L * 3);
  ctx.fillStyle = C.light;
  const hand = { x: x + 7, y: y - 20 };
  if (t < ENDING.lower) ctx.fillRect(hand.x - Math.floor(w / 2), 0, w, hand.y);
  ctx.fillStyle = C.lightCore;
  if (t < ENDING.lower) ctx.fillRect(hand.x, 0, 1, hand.y);
  ctx.globalAlpha = 1;
}

/** 拠点の得点の総計の表示（renderer の hubTotal）の左上。エンディングのはじめは同じ位置・大きさで出す */
const TOTAL_AT = { x: 6, y: 13 };
/** 得点の総計が、拠点の位置から画面の上の真ん中へ動いて大きくなる（動きはじめ、大きくなる）。大きくなるのは手を挙げるとき */
const TOTAL_MOVE = [2.8, ENDING.raise];

/**
 * 使われていく得点：はじめは拠点と同じ「TOTAL 0000000」を同じ位置に出しておき、画面の上の真ん中へ動いて大きくなる。
 * それから数字が減り、その分の光の粒が少女の手へ流れ込む
 */
function scoreCounter(ctx: CanvasRenderingContext2D, t: number, total: number, L: number, totalText: (n: string) => string): void {
  const [a, b] = ENDING.light;
  if (t > ENDING.lower + 1) return;
  const left = Math.round(total * (1 - usedAt(t)));
  const label = String(left).padStart(7, '0');
  const scale = 2;
  const tw = textWidth(label, scale);
  const x = Math.round(W / 2 - tw / 2);
  const y = 22;
  const [m0, m1] = TOTAL_MOVE;
  if (t < m1) {
    // 拠点の表示のまま → 「TOTAL」が消えて、数字だけが真ん中へ動く（小さいまま。着いたところで大きくなる）
    const prefix = totalText('');
    const u = clamp01((t - m0) / (m1 - m0));
    const e = u * u * (3 - 2 * u);
    // 拠点の表示で数字が始まる位置（「TOTAL 」の幅だと、末尾の字間の 1 ドットぶん左にずれる）
    const from = { x: TOTAL_AT.x + textWidth(totalText(label), 1) - textWidth(label, 1), y: TOTAL_AT.y };
    const to = { x: Math.round(W / 2 - textWidth(label, 1) / 2), y: y + Math.round((GLYPH_H * scale - GLYPH_H) / 2) };
    const px = Math.round(from.x + (to.x - from.x) * e);
    const py = Math.round(from.y + (to.y - from.y) * e);
    ctx.globalAlpha = 1 - Math.ceil(clamp01(u / 0.4) * 4) / 4;
    if (ctx.globalAlpha > 0) {
      drawText(ctx, prefix, TOTAL_AT.x + 1, TOTAL_AT.y + 1, 1, C.bg);
      drawText(ctx, prefix, TOTAL_AT.x, TOTAL_AT.y, 1, C.gem);
    }
    ctx.globalAlpha = 1;
    drawText(ctx, label, px + 1, py + 1, 1, C.bg);
    drawText(ctx, label, px, py, 1, C.gem);
    return;
  }
  const appear = 1 - clamp01((t - ENDING.lower) / 1);
  ctx.globalAlpha = Math.ceil(appear * 4) / 4;
  drawText(ctx, label, x + 1, y + 1, scale, C.bg);
  drawText(ctx, label, x, y, scale, C.gem);
  ctx.globalAlpha = 1;
  // 光の粒：数字から少女の手へ。使われる勢いが強いほど多い
  if (t >= a && t < b) {
    const hand = { x: OX + (GIRL_X - GIRL_OUT) * 12 + 7, y: OY + (GIRL_X + GIRL_OUT) * 6 - BALCONY_H - 20 };
    const n = 6 + Math.round(L * 30);
    for (let i = 0; i < n; i++) {
      const k = (t * (0.6 + L) + hash(i)) % 1;
      const fromX = x + hash(i + 50) * tw;
      const px = Math.round(fromX + (hand.x - fromX) * k + Math.sin(k * Math.PI) * (hash(i + 70) - 0.5) * 40);
      const py = Math.round(y + GLYPH_H * scale + (hand.y - y - GLYPH_H * scale) * k);
      ctx.fillStyle = i % 3 === 0 ? C.lightCore : C.light;
      ctx.fillRect(px, py, 1, i % 4 === 0 ? 2 : 1);
    }
  }
}

/**
 * 砂埃：灰色の粒の雲が膨らみながら立ちのぼり、まばらになって消える。
 * 中心ほど粒が密で、外側と、時間がたつほどまばら（ディザの間引きで薄くする）
 */
function dust(ctx: CanvasRenderingContext2D, t: number): void {
  for (const [i, p] of PUFFS.entries()) {
    const k = (t - p.t0) / p.life;
    if (k < 0 || k >= 1) continue;
    const cx = Math.round(OX + (p.gx - p.gy) * 12 + p.drift * k * 14);
    const cy = Math.round(OY + (p.gx + p.gy) * 6 - p.h - k * 14);
    const rx = Math.round(p.r + k * 12);
    const ry = Math.max(1, Math.round(rx * 0.6));
    // 粒の並びは puff ごとにずらし、時間で少しずつ流す
    const seed = i * 7 + Math.floor(t * 6);
    for (let dy = -ry; dy <= ry; dy++) {
      for (let dx = -rx; dx <= rx; dx++) {
        const d = (dx / rx) ** 2 + (dy / ry) ** 2;
        if (d > 1) continue;
        const density = (1 - d) * (1 - k) * 1.6;
        if (hash((dx + 97) * 131 + (dy + 53) * 17 + seed) >= density) continue;
        ctx.fillStyle = dy < -ry / 3 ? C.dustLight : C.dust;
        ctx.fillRect(cx + dx, cy + dy, 1, 1);
      }
    }
  }
}

/** 崩れる間に屋根から落ちていく瓦のかけら */
function fallingTiles(ctx: CanvasRenderingContext2D, t: number): void {
  for (let j = 0; j < JERKS.length; j++) {
    for (let i = 0; i < 10; i++) {
      const s = j * 50 + i;
      const age = t - JERKS[j] - hash(s) * 0.3;
      if (age < 0 || age > 1.2) continue;
      const gx = hash(s + 1) * 7 - 0.5;
      const gy = 4 + hash(s + 2) * 1.5;
      const x = Math.round(OX + (gx - gy) * 12 + (hash(s + 3) - 0.5) * 20 * age);
      const y = Math.round(OY + (gx + gy) * 6 - 40 * (1 - j * 0.3) + 80 * age * age);
      ctx.fillStyle = C.rubbleTile;
      ctx.fillRect(x, y, 3, 2);
    }
  }
}

/** ガレキ：家が潰れていくにつれて現れ、最後はガレキの山だけが残る */
function rubble(ctx: CanvasRenderingContext2D, c: number): void {
  if (c < 0.5) return;
  const pt = (gx: number, gy: number, h: number): P => ({ x: Math.round(OX + (gx - gy) * 12), y: Math.round(OY + (gx + gy) * 6 - h) });
  // 山：下の層から。層ごとに手前の2面と上面
  const grow = clamp01((c - 0.5) / 0.45);
  for (let k = 0; k < MOUND_LAYERS; k++) {
    if (grow < k / MOUND_LAYERS) break;
    const { rx, ry } = moundSize(k);
    const h0 = k * MOUND_STEP;
    const h1 = h0 + MOUND_STEP;
    const [n, e, s, w] = [
      { x: MOUND_C.x, y: MOUND_C.y - ry },
      { x: MOUND_C.x + rx, y: MOUND_C.y },
      { x: MOUND_C.x, y: MOUND_C.y + ry },
      { x: MOUND_C.x - rx, y: MOUND_C.y },
    ];
    const at = (q: { x: number; y: number }, h: number) => pt(q.x, q.y, h);
    fillQuad(ctx, [at(w, h1), at(s, h1), at(s, h0), at(w, h0)], k % 2 ? C.rubblePlasterDark : C.rubbleWoodDark);
    fillQuad(ctx, [at(s, h1), at(e, h1), at(e, h0), at(s, h0)], C.lotR);
    fillQuad(ctx, [at(n, h1), at(e, h1), at(s, h1), at(w, h1)], k % 2 ? C.rubbleWoodDark : C.rubblePlasterDark);
  }
  for (const p of RUBBLE) {
    if (c < p.appear) continue;
    const ax = p.axis === 'x' ? 1 : 0;
    const ay = 1 - ax;
    const a = pt(p.gx, p.gy, p.h);
    const b = pt(p.gx + ax * p.len, p.gy + ay * p.len, p.h + p.tilt);
    switch (p.kind) {
      case 'tile':
        fillDiamond(ctx, a.x, a.y - 2, 8, 4, C.rubbleTile);
        fillDiamond(ctx, a.x, a.y - 3, 6, 3, C.roofRidge);
        break;
      case 'plank':
        fillQuad(ctx, [a, b, { x: b.x, y: b.y + 2 }, { x: a.x, y: a.y + 2 }], C.rubbleWood);
        break;
      case 'beam':
        fillQuad(ctx, [a, b, { x: b.x, y: b.y + 3 }, { x: a.x, y: a.y + 3 }], C.rubbleWoodDark);
        plotLine(ctx, a.x, a.y, b.x, b.y, C.rubbleWood);
        break;
      case 'chunk':
        fillPrismSides(ctx, a.x, a.y - 6, 10, 5, 4, C.rubblePlaster, C.rubblePlasterDark);
        fillDiamond(ctx, a.x, a.y - 6, 10, 5, C.rubblePlaster);
        break;
    }
  }
  // 山から突き出した柱が数本
  if (c < 0.9) return;
  for (const [gx, gy, len, lean] of [[2.2, 2.4, 22, 9], [4.0, 1.9, 18, -7], [3.4, 3.6, 14, 11]] as const) {
    const base = pt(gx, gy, moundHeight(gx, gy));
    plotLine(ctx, base.x, base.y, base.x + lean, base.y - len, C.rubbleWoodDark);
    plotLine(ctx, base.x + 1, base.y, base.x + lean + 1, base.y - len, C.rubbleWood);
  }
}
