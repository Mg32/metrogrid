import { fillDiamond, fillEllipse, fillPrismSides, plotLine, TH, TW } from './pixel.ts';

/**
 * 闇に浮かぶ物（ステージ定義の things）。物語の物、区間の小物、人影。
 * どれも整数座標の fillRect だけで、形の型（箱、柱、茂み、人影、地面に置いた物）を組み合わせて描く。
 * sx は菱形の中心、g は台座の上面の中心（地面）の y
 */
type Ctx = CanvasRenderingContext2D;

const C = {
  bg: '#07060b',
  wood: '#3b2c24',
  woodDark: '#241a15',
  woodLight: '#5a4634',
  plaster: '#8c8678',
  wallL: '#3a3338',
  wallR: '#2b262c',
  wallTop: '#2a2731',
  glass: '#4f5961',
  glassLit: '#c9b878',
  lampPole: '#34333a',
  lampLight: '#f3e7b0',
  concrete: '#5a5650',
  concreteTop: '#77726a',
  metal: '#85878c',
  metalDark: '#55575c',
  rust: '#7d4a36',
  rustDark: '#4e2f25',
  leaf: '#2f4a2e',
  leafLight: '#46663f',
  leafDry: '#7a5a2e',
  autumn: '#a0522d',
  grass: '#4b5a32',
  paper: '#b9b2a0',
  paperDark: '#8f8875',
  cloth: '#9c9584',
  red: '#a8453a',
  yellow: '#c9a43a',
  blue: '#4c6a8a',
  white: '#d8d4c8',
  snow: '#e4e8ec',
  snowShade: '#a9b2be',
  water: '#22384a',
  waterLight: '#5d7e95',
  dust: '#5e574c',
  // 人影：色のない平面的な姿（少女と存在の質を分ける。企画書 第4.1節）
  shade: '#7c7a80',
  shadeEdge: '#9a989e',
};

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

/** 地面に立つ箱。w は上面の菱形の幅、h は高さ */
function box(ctx: Ctx, sx: number, g: number, w: number, h: number, top: string, left: string, right: string): void {
  const th = w / 2;
  fillPrismSides(ctx, sx, g - h - th / 2, w, th, h, left, right);
  fillDiamond(ctx, sx, g - h - th / 2, w, th, top);
}

/** 細い柱。先に横木などを描くときの頂点を返す */
function post(ctx: Ctx, sx: number, g: number, h: number, color: string, w = 2): number {
  rect(ctx, sx - Math.floor(w / 2), g - h, w, h, color);
  return g - h;
}

/** 地面に平らに置いた物（菱形） */
function flat(ctx: Ctx, sx: number, g: number, w: number, color: string, lift = 0): void {
  fillDiamond(ctx, sx, g - w / 4 - lift, w, w / 2, color);
}

/** 家の入口の断片のような壁ひと切れ。面の色と、窓や戸の帯 */
function wallPiece(ctx: Ctx, sx: number, g: number, h: number, band?: { color: string; from: number; to: number }): void {
  box(ctx, sx, g + TH / 2, TW, h, C.wallTop, C.wallL, C.wallR);
  if (band) {
    for (let i = 2; i < TW / 2 - 1; i++) {
      // 手前左の面（+y 向き）に帯を描く
      const x = sx - TW / 2 + i;
      const ground = g + Math.floor(i / 2);
      rect(ctx, x, ground - band.to, 1, band.to - band.from, band.color);
    }
  }
}

/** 人影：頭、胴、脚の平らな姿。h は背の高さ、pose で腕や脚を変える */
function figure(ctx: Ctx, sx: number, g: number, h: number, pose: 'stand' | 'walk' | 'sit', frame = 0, alpha = 0.85): void {
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * alpha;
  const head = Math.max(3, Math.round(h * 0.28));
  const body = Math.round(h * 0.4);
  const legs = h - head - body;
  const top = g - h;
  rect(ctx, sx - Math.floor(head / 2), top, head, head, C.shade);
  rect(ctx, sx - 2, top + head, 4, body, C.shade);
  rect(ctx, sx - 2, top + head, 1, body, C.shadeEdge);
  if (pose === 'sit') {
    rect(ctx, sx - 2, top + head + body, 5, 2, C.shade);
    rect(ctx, sx + 2, top + head + body, 2, legs, C.shade);
  } else if (pose === 'walk') {
    const s = frame % 2 === 0 ? 1 : -1;
    rect(ctx, sx - 2 + (s > 0 ? 0 : 1), g - legs, 1, legs, C.shade);
    rect(ctx, sx + 1 - (s > 0 ? 0 : 1), g - legs, 1, legs, C.shade);
  } else {
    rect(ctx, sx - 2, g - legs, 1, legs, C.shade);
    rect(ctx, sx + 1, g - legs, 1, legs, C.shade);
  }
  ctx.globalAlpha = a;
}

function lamp(ctx: Ctx, sx: number, g: number, lit: boolean, h = 26): void {
  const top = post(ctx, sx, g, h, C.lampPole);
  rect(ctx, sx - 1, top, 6, 1, C.lampPole);
  rect(ctx, sx + 3, top + 1, 3, 2, lit ? C.lampLight : C.metalDark);
  if (lit) {
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * 0.35;
    rect(ctx, sx + 1, top + 3, 7, 1, C.lampLight);
    rect(ctx, sx + 2, top + 4, 5, 1, C.lampLight);
    ctx.globalAlpha = a;
  }
}

function tree(ctx: Ctx, sx: number, g: number, h: number, r: number, leaf: string, light: string): void {
  post(ctx, sx, g, h, C.wood, 2);
  fillEllipse(ctx, sx, g - h, r, Math.ceil(r * 0.8), leaf);
  fillEllipse(ctx, sx - 2, g - h - 2, Math.ceil(r / 2), Math.ceil(r / 3), light);
}

function pole(ctx: Ctx, sx: number, g: number, color: string, arm: string): void {
  const top = post(ctx, sx, g, 32, color, 3);
  rect(ctx, sx - 6, top + 4, 13, 2, arm);
  for (const dx of [-6, 0, 6]) rect(ctx, sx + dx, top + 2, 1, 2, C.concreteTop);
}

function sign(ctx: Ctx, sx: number, g: number, face: string, frame: string): void {
  post(ctx, sx - 4, g, 12, frame);
  post(ctx, sx + 4, g, 12, frame);
  rect(ctx, sx - 6, g - 20, 13, 9, frame);
  rect(ctx, sx - 5, g - 19, 11, 7, face);
}

function bush(ctx: Ctx, sx: number, g: number, rx: number, ry: number, color: string, light: string): void {
  fillEllipse(ctx, sx, g - ry, rx, ry, color);
  fillEllipse(ctx, sx - 2, g - ry - 2, Math.ceil(rx / 2), Math.ceil(ry / 2), light);
}

function shoes(ctx: Ctx, sx: number, g: number, color: string, apart = 3): void {
  for (const dx of [-apart, apart - 3]) {
    rect(ctx, sx + dx, g - 2, 4, 2, color);
    rect(ctx, sx + dx, g - 1, 4, 1, C.white);
  }
}

function bicycle(ctx: Ctx, sx: number, g: number, color: string, wheels = 2): void {
  for (let i = 0; i < wheels; i++) fillEllipse(ctx, sx - 4 + i * 8, g - 3, 3, 3, C.metalDark);
  for (let i = 0; i < wheels; i++) fillEllipse(ctx, sx - 4 + i * 8, g - 3, 2, 2, C.bg);
  plotLine(ctx, sx - 4, g - 3, sx, g - 8, color);
  plotLine(ctx, sx, g - 8, sx + 4, g - 3, color);
  rect(ctx, sx - 1, g - 9, 3, 1, color);
}

export interface ThingInfo {
  /** 足もとに小さな台座を描く（闇に浮かぶ）。面の上の物や、闇そのものに浮かぶ物は描かない */
  foot: boolean;
  /** 高さ（プレイヤーに重なるときに透かす範囲） */
  height: number;
  /** まわりの道を照らす灯り */
  light?: boolean;
  draw: (ctx: Ctx, sx: number, g: number, tickF: number) => void;
}

const T = (height: number, draw: ThingInfo['draw'], opts: Partial<Omit<ThingInfo, 'draw' | 'height'>> = {}): ThingInfo => ({
  foot: opts.foot ?? true,
  light: opts.light,
  height,
  draw,
});

export const THINGS: Record<string, ThingInfo> = {
  // ---- 家、戸口、窓 ----
  entrance: T(22, (ctx, sx, g) => wallPiece(ctx, sx, g, 20, { color: C.glass, from: 3, to: 16 }), { foot: false, light: true }),
  door: T(22, (ctx, sx, g) => wallPiece(ctx, sx, g, 20, { color: C.wood, from: 1, to: 15 }), { foot: false }),
  house: T(24, (ctx, sx, g) => wallPiece(ctx, sx, g, 22), { foot: false }),
  home_window: T(24, (ctx, sx, g) => wallPiece(ctx, sx, g, 22, { color: C.glassLit, from: 8, to: 17 }), { foot: false, light: true }),
  window: T(24, (ctx, sx, g) => wallPiece(ctx, sx, g, 22, { color: C.glassLit, from: 6, to: 18 }), { foot: false, light: true }),
  broken_window: T(24, (ctx, sx, g) => {
    wallPiece(ctx, sx, g, 22, { color: C.bg, from: 8, to: 17 });
    plotLine(ctx, sx - 9, g - 15, sx - 4, g - 9, C.glass);
  }, { foot: false }),
  shoji: T(18, (ctx, sx, g) => wallPiece(ctx, sx, g, 16, { color: C.paper, from: 2, to: 15 }), { foot: false }),
  torn_shoji: T(18, (ctx, sx, g) => {
    wallPiece(ctx, sx, g, 16, { color: C.paperDark, from: 2, to: 15 });
    rect(ctx, sx - 7, g - 11, 3, 4, C.bg);
  }, { foot: false }),
  glass_door: T(20, (ctx, sx, g) => wallPiece(ctx, sx, g, 18, { color: C.glass, from: 1, to: 17 }), { foot: false, light: true }),
  amado: T(18, (ctx, sx, g) => wallPiece(ctx, sx, g, 16, { color: C.woodDark, from: 1, to: 15 }), { foot: false }),
  kido: T(14, (ctx, sx, g) => {
    post(ctx, sx - 5, g, 14, C.wood);
    post(ctx, sx + 5, g, 14, C.wood);
    rect(ctx, sx - 4, g - 12, 9, 10, C.woodLight);
  }),
  storage_shed: T(18, (ctx, sx, g) => box(ctx, sx, g + 2, 18, 14, C.metal, C.metalDark, C.lampPole), { foot: false }),
  shutter: T(22, (ctx, sx, g) => wallPiece(ctx, sx, g, 20, { color: C.metal, from: 1, to: 14 }), { foot: false }),
  construct: T(24, (ctx, sx, g) => {
    for (const dx of [-7, 0, 7]) post(ctx, sx + dx, g, 22, C.woodLight);
    for (const dy of [8, 16]) rect(ctx, sx - 8, g - dy, 17, 1, C.woodLight);
  }),
  footbridge: T(16, (ctx, sx, g) => {
    for (const dx of [-6, 6]) post(ctx, sx + dx, g, 16, C.metalDark);
    rect(ctx, sx - 7, g - 16, 15, 2, C.metal);
  }),
  culvert: T(10, (ctx, sx, g) => {
    box(ctx, sx, g + 2, 20, 8, C.concreteTop, C.concrete, C.wallR);
    fillEllipse(ctx, sx - 4, g - 4, 3, 3, C.bg);
  }, { foot: false }),
  weir: T(6, (ctx, sx, g) => box(ctx, sx, g + 3, 22, 4, C.concreteTop, C.concrete, C.wallR), { foot: false }),
  stairs: T(30, (ctx, sx, g) => {
    for (let i = 0; i < 6; i++) box(ctx, sx - i * 2, g - i * 4, 16, 3, C.woodLight, C.wood, C.woodDark);
  }, { foot: false }),
  skyhole: T(0, (ctx, sx, g, tickF) => {
    // 天井だった所に開いた穴から差す光（大穴の闇の上に、淡い光の柱）
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * (0.12 + 0.04 * Math.sin(tickF * 0.1));
    for (let i = 0; i < 40; i++) rect(ctx, sx - 6 + Math.floor(i / 8), g - 40 + i, 12, 1, C.lampLight);
    ctx.globalAlpha = a;
  }, { foot: false }),

  // ---- 灯り ----
  lamp: T(32, (ctx, sx, g) => lamp(ctx, sx, g, true), { light: true }),
  lamp_off: T(32, (ctx, sx, g) => lamp(ctx, sx, g, false)),
  dead_lamp: T(28, (ctx, sx, g) => {
    plotLine(ctx, sx, g, sx + 6, g - 22, C.lampPole);
    rect(ctx, sx + 6, g - 23, 4, 2, C.metalDark);
  }),
  gate_lamp: T(18, (ctx, sx, g) => {
    post(ctx, sx, g, 14, C.concrete, 4);
    rect(ctx, sx - 2, g - 18, 5, 4, C.lampLight);
  }, { light: true }),
  porch_lamp: T(20, (ctx, sx, g) => {
    post(ctx, sx, g, 16, C.wood);
    rect(ctx, sx - 2, g - 20, 5, 4, C.lampLight);
  }, { light: true }),
  porch_lamp_snow: T(20, (ctx, sx, g) => {
    post(ctx, sx, g, 16, C.wood);
    rect(ctx, sx - 2, g - 20, 5, 4, C.lampLight);
    rect(ctx, sx - 3, g - 21, 7, 1, C.snow);
  }, { light: true }),
  pendant_off: T(0, (ctx, sx, g) => {
    // 食卓の上に下がった、消えた電灯
    rect(ctx, sx, g - 36, 1, 14, C.lampPole);
    fillEllipse(ctx, sx, g - 21, 5, 2, C.metalDark);
  }, { foot: false }),
  lantern: T(22, (ctx, sx, g) => {
    rect(ctx, sx - 4, g - 3, 8, 3, C.concrete);
    rect(ctx, sx - 1, g - 9, 3, 6, C.concreteTop);
    rect(ctx, sx - 3, g - 16, 6, 5, C.concreteTop);
    rect(ctx, sx - 1, g - 15, 2, 3, C.lampLight);
    rect(ctx, sx - 5, g - 18, 10, 2, C.concrete);
  }, { light: true }),

  // ---- 電柱、看板、街の物 ----
  wpole: T(34, (ctx, sx, g) => pole(ctx, sx, g, C.woodLight, C.woodDark)),
  cpole: T(34, (ctx, sx, g) => pole(ctx, sx, g, C.concrete, C.metalDark)),
  mirror: T(28, (ctx, sx, g) => {
    post(ctx, sx, g, 24, C.metal);
    fillEllipse(ctx, sx + 2, g - 26, 5, 4, C.yellow);
    fillEllipse(ctx, sx + 2, g - 26, 3, 3, C.glass);
  }),
  newsign: T(20, (ctx, sx, g) => sign(ctx, sx, g, '#c85a3a', C.wood)),
  fadedsign: T(20, (ctx, sx, g) => sign(ctx, sx, g, '#8a6656', C.woodDark)),
  sign_old: T(20, (ctx, sx, g) => sign(ctx, sx, g, '#7a6a52', C.woodDark)),
  faded_poster: T(14, (ctx, sx, g) => {
    rect(ctx, sx - 4, g - 14, 8, 11, C.paperDark);
    rect(ctx, sx - 3, g - 12, 6, 3, '#8a6656');
  }),
  post_new: T(16, (ctx, sx, g) => {
    rect(ctx, sx - 3, g - 16, 6, 12, '#b8392e');
    post(ctx, sx, g, 4, C.lampPole);
  }),
  post_faded: T(16, (ctx, sx, g) => {
    rect(ctx, sx - 3, g - 16, 6, 12, '#8a4a40');
    post(ctx, sx, g, 4, C.lampPole);
  }),
  post_rust: T(16, (ctx, sx, g) => {
    rect(ctx, sx - 3, g - 16, 6, 12, C.rust);
    rect(ctx, sx - 1, g - 12, 2, 2, C.rustDark);
    post(ctx, sx, g, 4, C.lampPole);
  }),
  lot: T(2, (ctx, sx, g) => flat(ctx, sx, g + 3, 20, '#2a231f'), { foot: false }),
  lot2: T(4, (ctx, sx, g) => {
    flat(ctx, sx, g + 3, 20, '#2a231f');
    rect(ctx, sx - 6, g - 2, 4, 2, C.concrete);
    rect(ctx, sx + 2, g - 1, 5, 1, C.concrete);
  }, { foot: false }),
  rickshaw: T(14, (ctx, sx, g) => {
    fillEllipse(ctx, sx - 2, g - 5, 5, 5, C.woodDark);
    fillEllipse(ctx, sx - 2, g - 5, 3, 3, C.bg);
    rect(ctx, sx, g - 12, 8, 6, C.red);
    plotLine(ctx, sx + 8, g - 7, sx + 14, g - 2, C.wood);
  }),
  trike: T(10, (ctx, sx, g) => bicycle(ctx, sx, g, C.red, 2)),
  bike: T(12, (ctx, sx, g) => bicycle(ctx, sx, g, C.blue, 2)),
  bicycle_old: T(12, (ctx, sx, g) => bicycle(ctx, sx, g, C.rust, 2)),
  trike_gone: T(2, (ctx, sx, g) => flat(ctx, sx, g, 10, C.concreteTop)),
  sapling: T(14, (ctx, sx, g) => tree(ctx, sx, g, 8, 4, C.leafLight, '#6a8a52')),
  midtree: T(22, (ctx, sx, g) => tree(ctx, sx, g, 14, 7, C.leaf, C.leafLight)),
  bigtree: T(34, (ctx, sx, g) => tree(ctx, sx, g, 20, 11, C.leaf, C.leafLight)),
  tree: T(26, (ctx, sx, g) => tree(ctx, sx, g, 16, 8, C.leaf, C.leafLight)),
  greentree: T(30, (ctx, sx, g) => tree(ctx, sx, g, 18, 11, '#2e5a2a', '#4a7a40')),
  persimmon_tree: T(30, (ctx, sx, g) => {
    tree(ctx, sx, g, 18, 10, '#5a4a26', C.leafDry);
    for (const [dx, dy] of [[-4, -20], [3, -16], [6, -22], [-1, -14]]) rect(ctx, sx + dx, g + dy, 2, 2, '#d8752e');
  }),
  plant: T(12, (ctx, sx, g) => bush(ctx, sx, g, 6, 5, C.leaf, C.leafLight)),
  canopy: T(16, (ctx, sx, g) => bush(ctx, sx, g - 6, 9, 6, '#2e5a2a', '#4a7a40'), { foot: false }),
  flower_pot: T(8, (ctx, sx, g) => {
    rect(ctx, sx - 3, g - 5, 6, 5, C.rust);
    fillEllipse(ctx, sx, g - 7, 3, 2, C.leafLight);
  }),
  pot: T(8, (ctx, sx, g) => {
    rect(ctx, sx - 3, g - 5, 6, 5, C.rust);
    fillEllipse(ctx, sx, g - 7, 3, 2, C.leaf);
  }),

  // ---- 子どもの履き物、家の物 ----
  kid_sandal: T(3, (ctx, sx, g) => shoes(ctx, sx, g, '#c96a7a', 4)),
  sandals: T(3, (ctx, sx, g) => shoes(ctx, sx, g, '#8a6a4a')),
  kutsu: T(3, (ctx, sx, g) => shoes(ctx, sx, g, C.red, 2)),
  kid_shoes: T(3, (ctx, sx, g) => shoes(ctx, sx, g, C.white, 2)),
  boots: T(8, (ctx, sx, g) => {
    for (const dx of [-4, 1]) {
      rect(ctx, sx + dx, g - 8, 3, 8, '#e0b830');
      rect(ctx, sx + dx, g - 1, 4, 1, '#b08a20');
    }
  }),
  shoes_left: T(3, (ctx, sx, g) => shoes(ctx, sx, g, '#6a6a7a', 2)),
  umbrella: T(14, (ctx, sx, g) => {
    plotLine(ctx, sx - 3, g, sx + 2, g - 13, C.wood);
    fillEllipse(ctx, sx + 1, g - 9, 3, 5, C.blue);
  }),
  umbrella_open: T(14, (ctx, sx, g) => {
    post(ctx, sx, g, 10, C.wood, 1);
    fillEllipse(ctx, sx, g - 11, 7, 3, C.red);
  }),
  umbrella_stand: T(12, (ctx, sx, g) => {
    rect(ctx, sx - 3, g - 8, 6, 8, C.metalDark);
    plotLine(ctx, sx - 1, g - 8, sx - 2, g - 14, C.blue);
    plotLine(ctx, sx + 1, g - 8, sx + 2, g - 13, C.red);
  }),
  bucket: T(7, (ctx, sx, g) => {
    rect(ctx, sx - 3, g - 6, 6, 6, C.blue);
    rect(ctx, sx - 3, g - 6, 6, 1, C.waterLight);
  }),
  bucket_water: T(7, (ctx, sx, g) => {
    rect(ctx, sx - 3, g - 6, 6, 6, C.metal);
    rect(ctx, sx - 2, g - 6, 4, 1, C.waterLight);
  }),
  leak_bucket: T(7, (ctx, sx, g, tickF) => {
    rect(ctx, sx - 3, g - 6, 6, 6, C.metalDark);
    rect(ctx, sx, g - 14 + (Math.floor(tickF / 2) % 8), 1, 1, C.waterLight);
  }),
  water_gauge: T(18, (ctx, sx, g) => {
    post(ctx, sx, g, 18, C.white, 2);
    for (let y = 2; y < 18; y += 4) rect(ctx, sx + 1, g - y, 2, 1, C.red);
  }),
  gutter_overflow: T(22, (ctx, sx, g, tickF) => {
    post(ctx, sx, g, 22, C.metalDark, 2);
    for (let i = 0; i < 3; i++) rect(ctx, sx + 2, g - 20 + ((Math.floor(tickF) + i * 6) % 18), 1, 2, C.waterLight);
  }),
  drip_marks: T(1, (ctx, sx, g) => {
    for (const [dx, dy] of [[-4, 0], [2, -1], [5, 1]]) rect(ctx, sx + dx, g + dy, 2, 1, C.waterLight);
  }, { foot: false }),
  puddle: T(1, (ctx, sx, g) => fillEllipse(ctx, sx, g, 6, 2, C.water), { foot: false }),
  broom: T(18, (ctx, sx, g) => {
    plotLine(ctx, sx - 2, g - 18, sx + 1, g - 4, C.woodLight);
    rect(ctx, sx - 1, g - 4, 5, 4, C.leafDry);
  }),
  laundry_line: T(18, (ctx, sx, g) => {
    post(ctx, sx - 7, g, 17, C.woodDark);
    post(ctx, sx + 7, g, 17, C.woodDark);
    rect(ctx, sx - 8, g - 16, 16, 1, C.metal);
    rect(ctx, sx - 4, g - 15, 4, 7, C.white);
    rect(ctx, sx + 1, g - 15, 3, 5, C.blue);
  }),
  laundry: T(18, (ctx, sx, g) => {
    post(ctx, sx - 7, g, 17, C.woodDark);
    post(ctx, sx + 7, g, 17, C.woodDark);
    rect(ctx, sx - 8, g - 16, 16, 1, C.metal);
    rect(ctx, sx - 1, g - 15, 4, 7, C.cloth);
  }),
  kite_on_wire: T(30, (ctx, sx, g) => {
    rect(ctx, sx - 12, g - 30, 24, 1, C.lampPole);
    plotLine(ctx, sx - 2, g - 29, sx + 2, g - 24, C.lampPole);
    rect(ctx, sx, g - 28, 5, 5, C.red);
    plotLine(ctx, sx + 2, g - 23, sx + 4, g - 16, C.paperDark);
  }, { foot: false }),
  kite_tangled: T(16, (ctx, sx, g) => {
    rect(ctx, sx - 2, g - 14, 5, 5, C.yellow);
    plotLine(ctx, sx, g - 9, sx + 5, g - 2, C.paperDark);
  }),
  sofa: T(10, (ctx, sx, g) => box(ctx, sx, g + 2, 18, 8, '#6a4a3a', '#4a3226', '#3a261c'), { foot: false }),
  seat: T(4, (ctx, sx, g) => box(ctx, sx, g, 10, 2, '#8a5a4a', '#5a3a2e', '#4a2e24')),
  seat_snow: T(4, (ctx, sx, g) => {
    box(ctx, sx, g, 10, 2, '#8a5a4a', '#5a3a2e', '#4a2e24');
    flat(ctx, sx, g - 2, 10, C.snow);
  }),
  telescope: T(12, (ctx, sx, g) => {
    plotLine(ctx, sx - 3, g, sx, g - 7, C.metalDark);
    plotLine(ctx, sx + 3, g, sx, g - 7, C.metalDark);
    plotLine(ctx, sx - 4, g - 6, sx + 5, g - 11, C.metal);
  }),
  telescope_snow: T(12, (ctx, sx, g) => {
    plotLine(ctx, sx - 3, g, sx, g - 7, C.metalDark);
    plotLine(ctx, sx + 3, g, sx, g - 7, C.metalDark);
    plotLine(ctx, sx - 4, g - 6, sx + 5, g - 11, C.metal);
    rect(ctx, sx - 3, g - 9, 6, 1, C.snow);
  }),
  basket_empty: T(8, (ctx, sx, g) => {
    rect(ctx, sx - 4, g - 6, 8, 5, C.leafDry);
    rect(ctx, sx - 3, g - 5, 6, 1, C.bg);
  }),
  kitchen_dark: T(22, (ctx, sx, g) => wallPiece(ctx, sx, g, 20, { color: C.bg, from: 2, to: 14 }), { foot: false }),
  scuff: T(1, (ctx, sx, g) => plotLine(ctx, sx - 3, g - 1, sx + 3, g - 3, C.metal), { foot: false }),
  sticker: T(0, (ctx, sx, g) => rect(ctx, sx - 2, g - 6, 3, 3, '#c9a0a0'), { foot: false }),
  ac: T(10, (ctx, sx, g) => box(ctx, sx, g, 12, 7, C.white, C.paperDark, C.dust)),
  crate: T(8, (ctx, sx, g) => box(ctx, sx, g, 10, 6, C.woodLight, C.wood, C.woodDark)),
  antenna: T(32, (ctx, sx, g) => {
    const top = post(ctx, sx, g, 30, C.metal, 1);
    for (const [dy, w] of [[2, 11], [5, 9], [8, 7], [11, 5]]) rect(ctx, sx - Math.floor(w / 2), top + dy, w, 1, C.metal);
  }),
  leaf: T(2, (ctx, sx, g) => {
    for (const [dx, dy] of [[-4, 0], [1, -1], [4, 1], [-1, 2]]) rect(ctx, sx + dx, g + dy, 2, 1, C.autumn);
  }, { foot: false }),
  leaves: T(2, (ctx, sx, g) => {
    for (const [dx, dy] of [[-5, 0], [-1, -1], [3, 1], [5, -1], [0, 2]]) rect(ctx, sx + dx, g + dy, 2, 1, C.autumn);
  }, { foot: false }),
  leaves_pile: T(5, (ctx, sx, g) => fillEllipse(ctx, sx, g - 2, 6, 3, C.autumn)),
  dry_persimmon: T(14, (ctx, sx, g) => {
    rect(ctx, sx - 5, g - 14, 11, 1, C.wood);
    for (const dx of [-4, -1, 2, 5]) {
      rect(ctx, sx + dx, g - 13, 1, 4, C.wood);
      rect(ctx, sx + dx - 1, g - 9, 3, 3, '#b8602a');
    }
  }),
  cicada: T(3, (ctx, sx, g) => rect(ctx, sx - 1, g - 3, 3, 3, C.leafDry)),
  sudare: T(18, (ctx, sx, g) => {
    for (let i = 0; i < 9; i++) rect(ctx, sx - 5 + i, g - 18, 1, 14, i % 2 ? C.leafDry : C.woodLight);
  }),
  furin: T(18, (ctx, sx, g, tickF) => {
    rect(ctx, sx, g - 22, 1, 4, C.lampPole);
    fillEllipse(ctx, sx, g - 16, 3, 2, C.glass);
    rect(ctx, sx + Math.round(Math.sin(tickF * 0.3)), g - 13, 1, 4, C.paper);
  }),
  katorisenko: T(4, (ctx, sx, g, tickF) => {
    fillEllipse(ctx, sx, g - 1, 4, 2, '#3a5a3a');
    rect(ctx, sx + 1, g - 6 - (Math.floor(tickF / 3) % 3), 1, 2, C.paperDark);
  }),
  icicle: T(10, (ctx, sx, g) => {
    for (const [dx, len] of [[-3, 6], [0, 9], [3, 5]]) rect(ctx, sx + dx, g - 12, 1, len, C.snow);
  }, { foot: false }),
  buried_pole: T(10, (ctx, sx, g) => {
    plotLine(ctx, sx - 8, g - 2, sx + 8, g - 6, C.metal);
    fillEllipse(ctx, sx - 2, g - 3, 4, 1, C.snow);
  }, { foot: false }),

  // ---- 夜逃げの部屋と、朽ちていく家 ----
  dishes: T(0, (ctx, sx, g) => {
    for (const [dx, dy] of [[-4, -14], [2, -15], [-1, -12]]) fillEllipse(ctx, sx + dx, g + dy, 2, 1, C.white);
  }, { foot: false }),
  torn_fusuma: T(0, (ctx, sx, g) => rect(ctx, sx - 3, g - 16, 4, 6, C.bg), { foot: false }),
  calendar: T(0, (ctx, sx, g) => {
    rect(ctx, sx - 3, g - 22, 6, 7, C.white);
    rect(ctx, sx - 3, g - 22, 6, 2, C.red);
  }, { foot: false }),
  fridge_open: T(22, (ctx, sx, g) => {
    box(ctx, sx, g, 12, 20, C.white, C.paperDark, C.dust);
    rect(ctx, sx - 5, g - 18, 4, 9, C.lampLight);
  }),
  rice_cooker: T(8, (ctx, sx, g) => {
    rect(ctx, sx - 3, g - 7, 7, 6, C.white);
    rect(ctx, sx - 3, g - 8, 7, 1, C.paperDark);
  }),
  pot_left: T(6, (ctx, sx, g) => {
    rect(ctx, sx - 4, g - 5, 8, 4, C.metal);
    rect(ctx, sx - 6, g - 4, 2, 1, C.metalDark);
  }),
  swingframe: T(22, (ctx, sx, g) => {
    plotLine(ctx, sx - 8, g, sx - 5, g - 22, C.rust);
    plotLine(ctx, sx + 8, g, sx + 5, g - 22, C.rust);
    rect(ctx, sx - 5, g - 22, 11, 2, C.rust);
    rect(ctx, sx - 2, g - 20, 1, 12, C.metalDark);
    rect(ctx, sx + 2, g - 20, 1, 12, C.metalDark);
    rect(ctx, sx - 3, g - 8, 7, 2, '#5d6b55');
  }),
  sandbox: T(3, (ctx, sx, g) => {
    box(ctx, sx, g + 3, 20, 2, '#8a7a5a', C.wood, C.woodDark);
  }, { foot: false }),
  bench_old: T(8, (ctx, sx, g) => {
    rect(ctx, sx - 7, g - 6, 14, 2, C.woodLight);
    for (const dx of [-6, 5]) rect(ctx, sx + dx, g - 4, 1, 4, C.metalDark);
  }),
  slide: T(18, (ctx, sx, g) => {
    post(ctx, sx - 6, g, 16, C.rust);
    plotLine(ctx, sx - 6, g - 16, sx + 7, g - 1, C.metal);
    plotLine(ctx, sx - 6, g - 15, sx + 7, g, C.metalDark);
  }),
  drinking_fountain: T(12, (ctx, sx, g) => {
    rect(ctx, sx - 2, g - 10, 4, 10, C.concrete);
    rect(ctx, sx - 3, g - 12, 6, 2, C.concreteTop);
  }),
  dust: T(2, (ctx, sx, g) => fillEllipse(ctx, sx, g - 1, 5, 1, C.dust), { foot: false }),
  dust_pile: T(4, (ctx, sx, g) => fillEllipse(ctx, sx, g - 2, 6, 3, C.dust)),
  weed: T(8, (ctx, sx, g) => {
    for (const dx of [-3, -1, 1, 3]) plotLine(ctx, sx + dx, g, sx + dx * 2, g - 8, C.grass);
  }, { foot: false }),
  tallgrass: T(14, (ctx, sx, g) => {
    for (const dx of [-5, -3, -1, 1, 3, 5]) plotLine(ctx, sx + dx, g, sx + dx + (dx % 3), g - 13, C.grass);
  }),
  grassclump: T(10, (ctx, sx, g) => bush(ctx, sx, g, 7, 4, C.grass, '#6a7a42'), { foot: false }),
  ivy: T(14, (ctx, sx, g) => {
    post(ctx, sx, g, 14, C.woodDark);
    for (const [dx, dy] of [[-2, -12], [1, -9], [-1, -6], [2, -3]]) rect(ctx, sx + dx, g + dy, 2, 2, C.leaf);
  }),
  rust: T(12, (ctx, sx, g) => {
    box(ctx, sx, g, 12, 10, C.rust, C.rustDark, '#3a2219');
  }),
  rubble: T(5, (ctx, sx, g) => {
    for (const [dx, dy, w] of [[-5, 0, 4], [0, -1, 5], [3, 1, 3], [-2, -3, 3]]) rect(ctx, sx + dx, g + dy - 2, w, 2, C.concrete);
  }, { foot: false }),
  table_dusty: T(8, (ctx, sx, g) => box(ctx, sx, g, 14, 6, C.dust, C.wood, C.woodDark)),
  fan_stopped: T(22, (ctx, sx, g) => {
    post(ctx, sx, g, 18, '#9fb2a4', 2);
    fillEllipse(ctx, sx, g - 20, 5, 5, '#6f8274');
    fillEllipse(ctx, sx, g - 20, 3, 3, C.dust);
  }),
  fallen_frame: T(3, (ctx, sx, g) => {
    flat(ctx, sx, g, 10, C.wood);
    flat(ctx, sx, g, 6, C.paperDark);
  }, { foot: false }),
  stopped_clock: T(22, (ctx, sx, g) => {
    rect(ctx, sx - 4, g - 22, 8, 22, C.wood);
    fillEllipse(ctx, sx, g - 17, 3, 3, C.paper);
    rect(ctx, sx, g - 19, 1, 2, C.woodDark);
  }),

  // ---- 遠く（届かない場所の輪郭）----
  faraway: T(0, (ctx, sx, g) => {
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * 0.35;
    rect(ctx, sx - 12, g - 30, 24, 30, '#1a1a2a');
    rect(ctx, sx - 4, g - 40, 3, 10, '#1a1a2a');
    ctx.globalAlpha = a;
  }, { foot: false }),

  // ---- 人影（色のない平面的な姿。少女に関心を向けず、渡れない場所にいる）----
  kid_swing: T(20, (ctx, sx, g, tickF) => {
    const u = Math.round(Math.sin((tickF / 30) * 2 * Math.PI) * 4);
    plotLine(ctx, sx - 8, g, sx - 5, g - 24, C.rust);
    plotLine(ctx, sx + 8, g, sx + 5, g - 24, C.rust);
    rect(ctx, sx - 5, g - 24, 11, 2, C.rust);
    plotLine(ctx, sx, g - 22, sx + u, g - 8, C.metalDark);
    figure(ctx, sx + u, g - 6, 13, 'sit');
  }),
  kid_walk: T(16, (ctx, sx, g, tickF) => figure(ctx, sx, g, 14, 'walk', Math.floor(tickF / 4))),
  girl_small: T(14, (ctx, sx, g) => figure(ctx, sx, g, 12, 'stand'), { foot: false }),
  girl_tall: T(20, (ctx, sx, g) => figure(ctx, sx, g, 18, 'stand'), { foot: false }),
  kid_reflect: T(0, (ctx, sx, g) => {
    // 水面に映る子：逆さで淡い
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * 0.4;
    rect(ctx, sx - 2, g - 2, 4, 4, C.shadeEdge);
    rect(ctx, sx - 2, g + 2, 4, 5, C.shade);
    rect(ctx, sx - 1, g + 7, 3, 3, C.shade);
    ctx.globalAlpha = a;
  }, { foot: false }),
  kid_puddle: T(0, (ctx, sx, g) => {
    fillEllipse(ctx, sx, g, 7, 2, C.water);
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * 0.45;
    // 傘の子が映る（黄色は使わない）
    fillEllipse(ctx, sx, g + 1, 4, 1, C.shadeEdge);
    rect(ctx, sx - 1, g, 2, 3, C.shade);
    ctx.globalAlpha = a;
  }, { foot: false }),
};

/** 小物の足もとの台座を描く範囲（菱形の幅） */
export const FOOT_W = 12;
