import { drawText, GLYPH_H, textWidth } from './font.ts';
import { GIRL_FOOT_X, GIRL_FOOT_Y } from './girl.ts';
import { fillDiamond, fillEllipse, fillPrismSides, fillQuad, plotLine } from './pixel.ts';

/**
 * エンディング（企画書 第4.6節）。外から見た家が闇に浮かんでいる。
 * 少女が二階のベランダに出てきて手を挙げると、青い光をともないはじめ、画面が揺れる。これまでに溜めた得点がみるみる減っていき、
 * その光の粒が少女の手へ流れ込む（得点は「減っている」ではなく、少女の行為に「使われている」ように見せる。光の強さ・揺れの大きさ・
 * 家の窓という窓から漏れる同じ青い光（第4.5節）は、使われた割合に連動する）。
 * 轟音が聞こえはじめると、少女は手を下ろし、何気なく家の中へ戻って戸を閉める（悲壮な決意には見せない。第4.7節）。
 * 家は少しずつひしゃげ、いろいろな場所から砂埃を上げて潰れていく。轟音と揺れが収まる頃には、ガレキだけが残る。
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
  /** 得点が使われていく（光が強まる） */
  light: [4.2, 10.2],
  /** 轟音が聞こえはじめる（得点を使い切ったところ） */
  rumble: 10.2,
  /** 手を下ろす／家の中へ戻る／戸を閉める */
  lower: 10.7,
  walkIn: [11.1, 12.1],
  doorClose: [12.1, 12.6],
  /** 家が崩れていく */
  collapse: [12.8, 19.5],
  /** 崩れ方が急に進む時刻（二階が潰れる、全体が潰れる、最後のひと崩れ）。砂埃と崩れる音が出る */
  jerks: [14.0, 16.0, 17.6],
  /** 揺れと砂埃が収まる */
  settle: 23,
  /** ここから先はガレキだけが残った静止画（キーで次へ進める） */
  end: 26,
};

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
  lightDeep: '#4f7fd0',
  warm: '#c9a467',
  warmDim: '#8a6c45',
  mote: '#5d5a66',
  dust: '#6f685e',
  dustLight: '#8d867a',
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
const GIRL_X = 3;
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

/** 光の強さ（得点の使われた割合と同じ）。使い切ってからは戸を閉める頃に引いていく */
function lightAt(t: number): number {
  const [a, b] = ENDING.light;
  if (t < a) return 0;
  if (t < b) return usedAt(t);
  return 1 - clamp01((t - ENDING.doorClose[1]) / 1.5);
}

/** 得点の使われた割合：はじめはゆっくり、みるみる加速して、最後は一気に */
function usedAt(t: number): number {
  const u = clamp01((t - ENDING.light[0]) / (ENDING.light[1] - ENDING.light[0]));
  return u * u * (3 - 2 * u) * 0.35 + u ** 3 * 0.65;
}

/** 画面の揺れの大きさ（ドット） */
function shakeAt(t: number): number {
  let a = lightAt(t) * 2;
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
  for (let i = 0; i < 6; i++) add(13 + i * 0.18, hash(i + 10) * 6, 3.6 + hash(i + 20) * 1.4, 30 + hash(i + 30) * 30, 2.2, 3);
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
  for (let i = 0; i < 16; i++) add(18 + hash(i + 500) * 1.2, -1 + hash(i + 501) * 8, -1 + hash(i + 502) * 7, 2, 4.5, 8 + hash(i + 503) * 6);
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
export function drawEnding(ctx: CanvasRenderingContext2D, t: number, total: number, sprites: EndingSprites): void {
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

  if (c < 0.97) house(ctx, t, L, quad, P, sprites);
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

  scoreCounter(ctx, t, total, L);

  // 闇から見えてくる
  if (t < ENDING.fadeIn) {
    ctx.globalAlpha = Math.ceil((1 - t / ENDING.fadeIn) * 8) / 8;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

/**
 * タイトル：闇に浮かぶ家と、その前に立つ少女。家はゆっくり上下に漂い、闇には細かな塵が漂う。
 * cleared はクリアしたステージの数で、その数だけ窓に暖かい明かりがともる（拠点と同じく、家が少しずつ元に戻っていく）。
 * collapsed ならエンディングのあとで、家はなくガレキの山だけが残っていて、少女もいない。
 * 文字はタイトルのロゴと、prompt（はじめ方の一言。null なら出さない）だけ
 */
export function drawTitle(
  ctx: CanvasRenderingContext2D,
  t: number,
  opts: { cleared: number; collapsed: boolean; prompt: string | null; beatSec: number },
  sprites: EndingSprites,
): void {
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
  if (opts.collapsed) {
    rubble(ctx, 1);
  } else {
    house(ctx, 0, 0, quad, P, sprites, opts.cleared);
    // 明かりのともった窓の下の土に、うっすら光が落ちる
    for (const [i, w] of WINDOWS.entries()) {
      if (i >= opts.cleared || w.h0 >= F1) continue;
      const mid = (w.u0 + w.u1) / 2;
      const q = w.face === 'y' ? P(mid, 5.6, 0) : P(6.6, mid, 0);
      ctx.globalAlpha = 0.1;
      fillEllipse(ctx, q.x, q.y, 7, 2, C.warm);
      ctx.globalAlpha = 1;
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
  }
  ctx.restore();

  logo(ctx, t, opts.collapsed);
  if (opts.prompt && Math.floor(t * 1.6) % 2 === 0) {
    const scale = 1;
    const tw = textWidth(opts.prompt, scale);
    drawText(ctx, opts.prompt, Math.round(W / 2 - tw / 2) + 1, 257, scale, C.bg);
    drawText(ctx, opts.prompt, Math.round(W / 2 - tw / 2), 256, scale, C.text);
  }
}

/** タイトルのロゴ。大きな文字の下に、細い線を一本。エンディングのあとは色が沈む */
function logo(ctx: CanvasRenderingContext2D, t: number, collapsed: boolean): void {
  const text = 'METROGRID';
  const scale = 4;
  const tw = textWidth(text, scale);
  const x = Math.round(W / 2 - tw / 2);
  const y = 30;
  drawText(ctx, text, x + 2, y + 2, scale, '#000');
  drawText(ctx, text, x, y, scale, collapsed ? C.textDim : C.text);
  // 線は、ゆっくり左右へ伸び縮みする（呼吸のように）
  const half = Math.round(tw / 2 - 6 - Math.sin(t * 0.8) * 4);
  ctx.fillStyle = collapsed ? C.rubbleWoodDark : C.textDim;
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
const WINDOWS: { face: 'x' | 'y'; u0: number; u1: number; h0: number; h1: number; at: number }[] = [
  { face: 'y', u0: 3.4, u1: 5.2, h0: 8, h1: 20, at: 0.15 },
  { face: 'x', u0: 3.2, u1: 4.5, h0: 8, h1: 20, at: 0.3 },
  { face: 'x', u0: 0.7, u1: 2.3, h0: 8, h1: 20, at: 0.45 },
  { face: 'y', u0: 0.5, u1: 1.7, h0: 33, h1: 44, at: 0.55 },
  { face: 'y', u0: 4.3, u1: 5.5, h0: 33, h1: 44, at: 0.65 },
  { face: 'x', u0: 1.0, u1: 2.6, h0: 33, h1: 45, at: 0.75 },
];
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
  warm = 0,
): void {
  const faceQuad = (face: 'x' | 'y', u0: number, u1: number, h0: number, h1: number, plane: number, color: string) =>
    face === 'y'
      ? quad([[u0, plane, h0], [u1, plane, h0], [u1, plane, h1], [u0, plane, h1]], color)
      : quad([[plane, u1, h0], [plane, u0, h0], [plane, u0, h1], [plane, u1, h1]], color);

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

  // 窓：ふだんは暗い（タイトルでは、はじめの warm 枚に暖かい明かりがともる）。
  // 光が強まると、家の窓という窓から少女と同じ青い光が漏れる
  for (const [i, w] of WINDOWS.entries()) {
    const plane = w.face === 'y' ? (w.h0 >= F1 ? F2_FRONT : 5) : 6;
    faceQuad(w.face, w.u0 - 0.08, w.u1 + 0.08, w.h0 - 1, w.h1 + 1, plane, C.woodDark);
    const glow = clamp01((L - w.at) / 0.2);
    faceQuad(w.face, w.u0, w.u1, w.h0, w.h1, plane, glow > 0 ? C.lightDeep : i < warm ? C.warm : C.glass);
    if (glow > 0) {
      ctx.globalAlpha = glow;
      faceQuad(w.face, w.u0, w.u1, w.h0, w.h1, plane, C.light);
      ctx.globalAlpha = 1;
    }
    // 格子
    const mid = (w.u0 + w.u1) / 2;
    faceQuad(w.face, mid - 0.04, mid + 0.04, w.h0, w.h1, plane, C.woodDark);
  }
  // 割れた窓ガラスがひとつ（家は最初からどこかボロボロ）
  faceQuad('y', 4.5, 4.75, 15, 19, 5, C.bg);

  // 玄関の引き戸
  faceQuad('y', ENTRANCE.u0 - 0.1, ENTRANCE.u1 + 0.1, ENTRANCE.h0, ENTRANCE.h1 + 2, 5, C.woodDark);
  faceQuad('y', ENTRANCE.u0, ENTRANCE.u1, 5, ENTRANCE.h1, 5, L > 0.1 ? C.lightDeep : C.glassDim);
  faceQuad('y', (ENTRANCE.u0 + ENTRANCE.u1) / 2 - 0.05, (ENTRANCE.u0 + ENTRANCE.u1) / 2 + 0.05, 0, ENTRANCE.h1, 5, C.wood);

  // ベランダのガラス戸：右の戸が開いて、中は暗い
  const open =
    t < ENDING.doorOpen[0]
      ? 0
      : t < ENDING.doorOpen[1]
        ? (t - ENDING.doorOpen[0]) / (ENDING.doorOpen[1] - ENDING.doorOpen[0])
        : t < ENDING.doorClose[0]
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

  // 少女（ベランダ）。手すりより奥に描く
  girl(ctx, t, P, sprites);

  // ベランダ：床と手すり
  quad([[1.7, F2_FRONT, BALCONY_H], [4.3, F2_FRONT, BALCONY_H], [4.3, BALCONY_FRONT, BALCONY_H], [1.7, BALCONY_FRONT, BALCONY_H]], C.wood);
  quad([[1.7, BALCONY_FRONT, BALCONY_H], [4.3, BALCONY_FRONT, BALCONY_H], [4.3, BALCONY_FRONT, BALCONY_H - 2], [1.7, BALCONY_FRONT, BALCONY_H - 2]], C.woodDark);
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

}

/** ベランダの少女：戸口から出てきて、手を挙げ、手を下ろして、家の中へ戻る */
function girl(ctx: CanvasRenderingContext2D, t: number, P: (gx: number, gy: number, h: number) => P, sprites: EndingSprites): void {
  const [o0, o1] = ENDING.walkOut;
  const [i0, i1] = ENDING.walkIn;
  if (t < o0 || t >= i1) return;
  let gy: number;
  let img: HTMLCanvasElement;
  let alpha = 1;
  const walkFrame = (frames: HTMLCanvasElement[]) => frames[1 + (Math.floor(t * 8) % (frames.length - 1))];
  if (t < o1) {
    const u = (t - o0) / (o1 - o0);
    gy = GIRL_IN + (GIRL_OUT - GIRL_IN) * u;
    img = walkFrame(sprites.front);
    alpha = clamp01(u * 3);
  } else if (t < i0) {
    gy = GIRL_OUT;
    img = t >= ENDING.raise && t < ENDING.lower ? sprites.raise : sprites.front[0];
  } else {
    // 振り返って、ふだんどおりの足どりで戸口へ。戸口をくぐると暗がりに見えなくなる
    const u = (t - i0) / (i1 - i0);
    gy = GIRL_OUT + (GIRL_IN - GIRL_OUT) * u;
    img = walkFrame(sprites.back);
    alpha = clamp01((1 - u) * 3);
  }
  const p = P(GIRL_X, gy, BALCONY_H);
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, p.x - GIRL_FOOT_X, p.y - GIRL_FOOT_Y);
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

/** 使われていく得点：画面の上の数字が減り、その分の光の粒が少女の手へ流れ込む */
function scoreCounter(ctx: CanvasRenderingContext2D, t: number, total: number, L: number): void {
  const [a, b] = ENDING.light;
  if (t < a - 0.6 || t > ENDING.lower + 1) return;
  const appear = clamp01((t - (a - 0.6)) / 0.6) * (1 - clamp01((t - ENDING.lower) / 1));
  const left = Math.round(total * (1 - usedAt(t)));
  const label = String(left).padStart(7, '0');
  const scale = 2;
  const tw = textWidth(label, scale);
  const x = Math.round(W / 2 - tw / 2);
  const y = 22;
  ctx.globalAlpha = Math.ceil(appear * 4) / 4;
  drawText(ctx, label, x + 1, y + 1, scale, C.bg);
  drawText(ctx, label, x, y, scale, L > 0 ? C.lightCore : C.text);
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
