import { fillDiamond, fillEllipse, fillPrismSides, fillQuad, plotLine, TH, TW } from './pixel.ts';

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

/**
 * 人影：丸い頭、肩、腕、胴、脚の平らな姿（色はつけない）。h は背の高さ、pose で腕や脚を変える。
 * skirt ならスカートの裾が広がる（女の子）。左の縁を明るくして、闇から形を浮かせる
 */
function figure(ctx: Ctx, sx: number, g: number, h: number, pose: 'stand' | 'walk' | 'sit', frame = 0, alpha = 0.85, skirt = false): void {
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * alpha;
  const head = Math.max(4, Math.round(h * 0.3));
  const body = Math.round(h * 0.36);
  const legs = h - head - body;
  const top = g - h;
  // 頭（角を落とした四角）と首
  rect(ctx, sx - Math.floor(head / 2), top + 1, head, head - 1, C.shade);
  rect(ctx, sx - Math.floor(head / 2) + 1, top, head - 2, 1, C.shade);
  rect(ctx, sx - Math.floor(head / 2), top + 1, 1, head - 2, C.shadeEdge);
  // 胴（肩が少し広い）。腕は胴の両わきに
  const by = top + head;
  rect(ctx, sx - 2, by, 5, body, C.shade);
  rect(ctx, sx - 2, by, 1, body, C.shadeEdge);
  const swing = pose === 'walk' ? (frame % 2 === 0 ? 1 : -1) : 0;
  rect(ctx, sx - 3, by + 1 + Math.max(0, swing), 1, body - 2, C.shade);
  rect(ctx, sx + 3, by + 1 + Math.max(0, -swing), 1, body - 2, C.shade);
  if (skirt) {
    rect(ctx, sx - 3, by + body - 2, 7, 2, C.shade);
    rect(ctx, sx - 3, by + body - 2, 1, 2, C.shadeEdge);
  }
  if (pose === 'sit') {
    // 腰かけて、膝から先を前へ垂らす
    rect(ctx, sx - 2, by + body, 6, 2, C.shade);
    rect(ctx, sx + 2, by + body + 2, 2, Math.max(1, legs - 2), C.shade);
  } else if (pose === 'walk') {
    rect(ctx, sx - 2 + (swing > 0 ? 0 : 1), g - legs, 2, legs, C.shade);
    rect(ctx, sx + 1 - (swing > 0 ? 0 : 1), g - legs, 2, legs, C.shade);
  } else {
    rect(ctx, sx - 2, g - legs, 2, legs, C.shade);
    rect(ctx, sx + 1, g - legs, 2, legs, C.shade);
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

/**
 * 立て看板：2本の細い脚に、縁取りのある横長の板。板には字の帯（lines：[行, 左から, 長さ]）が書かれている。
 * 古い看板は字がかすれ、板の角が欠けている（chip）
 */
function sign(ctx: Ctx, sx: number, g: number, face: string, frame: string, ink: string, lines: number[][], chip = false): void {
  post(ctx, sx - 5, g, 22, frame, 1);
  post(ctx, sx + 5, g, 22, frame, 1);
  rect(ctx, sx - 8, g - 23, 17, 11, frame);
  rect(ctx, sx - 7, g - 22, 15, 9, face);
  for (const [y, x0, w] of lines) rect(ctx, sx - 6 + x0, g - 21 + y, w, 1, ink);
  if (chip) {
    rect(ctx, sx + 6, g - 23, 3, 2, C.bg);
    rect(ctx, sx + 8, g - 21, 1, 1, C.bg);
  }
}

/** 郵便ポスト：丸い屋根の箱が短い脚に乗っている。差し入れ口と、取り出し口の札。body は胴の色、shade は右の陰と屋根 */
function mailbox(ctx: Ctx, sx: number, g: number, body: string, shade: string, light: string): void {
  rect(ctx, sx - 1, g - 4, 3, 4, C.lampPole);
  rect(ctx, sx - 4, g - 17, 9, 13, body);
  rect(ctx, sx - 4, g - 17, 1, 13, light);
  rect(ctx, sx + 3, g - 17, 2, 13, shade);
  // 丸い屋根
  rect(ctx, sx - 5, g - 19, 11, 2, shade);
  rect(ctx, sx - 3, g - 20, 7, 1, shade);
  // 差し入れ口と札
  rect(ctx, sx - 2, g - 15, 5, 1, C.bg);
  rect(ctx, sx - 2, g - 11, 4, 3, C.paper);
}

/** バケツ：下すぼまりの胴、縁、つる（取っ手）。inner は中に見える物（水など） */
function bucket(ctx: Ctx, sx: number, g: number, body: string, dark: string, inner: string): void {
  for (let r = 0; r < 6; r++) {
    const w = r < 2 ? 5 : r < 4 ? 6 : 7;
    rect(ctx, sx - Math.floor(w / 2), g - 1 - r, w, 1, body);
    rect(ctx, sx + Math.ceil(w / 2) - 1, g - 1 - r, 1, 1, dark);
  }
  rect(ctx, sx - 4, g - 8, 8, 1, dark);
  rect(ctx, sx - 3, g - 7, 6, 1, inner);
  plotLine(ctx, sx - 4, g - 8, sx - 2, g - 11, C.metalDark);
  rect(ctx, sx - 2, g - 11, 4, 1, C.metalDark);
  plotLine(ctx, sx + 2, g - 11, sx + 3, g - 8, C.metalDark);
}

/** マスの中の点 (u, v)（マスの中心が 0、端が ±0.5。u は右下へ、v は左下へ）の、高さ h の画面の位置 */
function at(sx: number, g: number, u: number, v: number, h: number): { x: number; y: number } {
  return { x: Math.round(sx + (u - v) * (TW / 2)), y: Math.round(g + (u + v) * (TH / 2) - h) };
}

/**
 * マスの中の直方体（u0〜u1, v0〜v1, 高さ h0〜h1）。見える3つの面（上、左の手前、右の手前）を塗る。
 * box と違って細長い物（ソファの背もたれ、机の脚など）も組める。奥の物から順に描く
 */
function block(ctx: Ctx, sx: number, g: number, [u0, u1]: number[], [v0, v1]: number[], [h0, h1]: number[], top: string, left: string, right: string): void {
  const P = (u: number, v: number, h: number) => at(sx, g, u, v, h);
  fillQuad(ctx, [P(u0, v1, h0), P(u1, v1, h0), P(u1, v1, h1), P(u0, v1, h1)], left);
  fillQuad(ctx, [P(u1, v1, h0), P(u1, v0, h0), P(u1, v0, h1), P(u1, v1, h1)], right);
  fillQuad(ctx, [P(u0, v0, h1), P(u1, v0, h1), P(u1, v1, h1), P(u0, v1, h1)], top);
}

/** マスの中の線（2点を高さつきで結ぶ） */
function line3(ctx: Ctx, sx: number, g: number, a: number[], b: number[], color: string): void {
  const p = at(sx, g, a[0], a[1], a[2]);
  const q = at(sx, g, b[0], b[1], b[2]);
  plotLine(ctx, p.x, p.y, q.x, q.y, color);
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
  construct: T(26, (ctx, sx, g) => {
    // 工事の足場：丸太の柱と横木、筋かい、中ほどに渡した板。足もとに黄色と黒の柵
    for (const dx of [-8, 0, 8]) post(ctx, sx + dx, g, 24, C.woodLight, 1);
    for (const dy of [8, 16, 23]) rect(ctx, sx - 8, g - dy, 17, 1, C.woodLight);
    plotLine(ctx, sx - 8, g - 8, sx, g - 16, C.wood);
    plotLine(ctx, sx, g - 8, sx + 8, g - 16, C.wood);
    rect(ctx, sx - 8, g - 17, 17, 2, C.wood);
    for (let i = 0; i < 8; i++) rect(ctx, sx - 8 + i * 2, g - 4, 2, 2, i % 2 ? C.bg : C.yellow);
  }),
  footbridge: T(22, (ctx, sx, g) => {
    // 歩道橋：コンクリートの脚に、手すりのついた橋げた。橋げたはマスの並び（右下の向き）に沿って隣のマスまで渡す
    // （2マスおきに置くと、あいだのマスの上でつながって1本の橋になる）
    for (const u of [-0.15, 0.15]) block(ctx, sx, g, [u - 0.06, u + 0.06], [-0.06, 0.06], [0, 14], C.concreteTop, C.concrete, C.wallR);
    block(ctx, sx, g, [-1, 1], [-0.22, 0.22], [14, 17], C.metal, C.metalDark, C.lampPole);
    for (const v of [-0.22, 0.22]) {
      line3(ctx, sx, g, [-1, v, 22], [1, v, 22], C.metal);
      for (let u = -0.9; u <= 0.9; u += 0.3) line3(ctx, sx, g, [u, v, 17], [u, v, 22], C.metalDark);
    }
  }),
  culvert: T(10, (ctx, sx, g) => {
    // 暗渠の口：コンクリートの箱に、丸い管の口。底から細く水が流れ出ている
    box(ctx, sx, g + 2, 20, 8, C.concreteTop, C.concrete, C.wallR);
    fillEllipse(ctx, sx - 5, g - 3, 4, 4, C.concreteTop);
    fillEllipse(ctx, sx - 5, g - 3, 3, 3, C.bg);
    rect(ctx, sx - 6, g, 2, 4, C.waterLight);
  }, { foot: false }),
  weir: T(6, (ctx, sx, g, tickF) => {
    // 堰：低いコンクリートの段を、水が薄く越えて落ち、下に白い泡が立つ
    box(ctx, sx, g + 3, 22, 4, C.concreteTop, C.concrete, C.wallR);
    flat(ctx, sx, g - 1, 16, C.waterLight);
    for (let i = 0; i < 5; i++) {
      const x = sx - 10 + i * 2;
      rect(ctx, x, g + Math.floor(i / 2) - 1, 1, 3, C.waterLight);
    }
    for (const [dx, dy] of [[-9, 4], [-6, 5], [-3, 7], [-7, 6]]) rect(ctx, sx + dx + (Math.floor(tickF / 4 + dx) % 2), g + dy, 1, 1, C.white);
  }, { foot: false }),
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
  newsign: T(24, (ctx, sx, g) => sign(ctx, sx, g, '#c85a3a', C.wood, C.white, [[1, 1, 11], [3, 1, 8], [5, 1, 10]])),
  fadedsign: T(24, (ctx, sx, g) => sign(ctx, sx, g, '#8a6656', C.woodDark, '#b09080', [[1, 1, 6], [1, 9, 3], [4, 2, 7]])),
  sign_old: T(24, (ctx, sx, g) => sign(ctx, sx, g, '#7a6a52', C.woodDark, '#5a4c3a', [[2, 1, 9], [5, 3, 5]], true)),
  faded_poster: T(14, (ctx, sx, g) => {
    rect(ctx, sx - 4, g - 14, 8, 11, C.paperDark);
    rect(ctx, sx - 3, g - 12, 6, 3, '#8a6656');
  }),
  post_new: T(20, (ctx, sx, g) => mailbox(ctx, sx, g, '#b8392e', '#7e2620', '#d8584a')),
  post_faded: T(20, (ctx, sx, g) => mailbox(ctx, sx, g, '#8a4a40', '#5e322c', '#a0645a')),
  post_rust: T(20, (ctx, sx, g) => {
    mailbox(ctx, sx, g, C.rust, C.rustDark, '#94604a');
    for (const [dx, dy] of [[-2, -13], [1, -7], [-3, -6], [2, -16]]) rect(ctx, sx + dx, g + dy, 2, 1, C.rustDark);
  }),
  lot: T(4, (ctx, sx, g) => {
    // 空き地：むき出しの土に、まばらな草と小石。売地の札の杭が1本
    flat(ctx, sx, g + 3, 20, '#2a231f');
    for (const [dx, dy] of [[-6, 0], [4, -1], [-1, 2], [6, 2]]) {
      rect(ctx, sx + dx, g + dy - 2, 1, 2, C.grass);
      rect(ctx, sx + dx + 1, g + dy - 1, 1, 1, C.grass);
    }
    for (const [dx, dy] of [[-3, 0], [2, 1]]) rect(ctx, sx + dx, g + dy, 2, 1, C.concrete);
    post(ctx, sx + 2, g - 1, 8, C.woodLight, 1);
    rect(ctx, sx - 1, g - 11, 7, 4, C.paper);
    rect(ctx, sx, g - 10, 5, 1, C.red);
  }, { foot: false }),
  lot2: T(4, (ctx, sx, g) => {
    // 家の跡：土の上に、四角く残った基礎のコンクリート
    flat(ctx, sx, g + 3, 20, '#2a231f');
    box(ctx, sx, g + 4, 18, 2, C.concreteTop, C.concrete, C.wallR);
    flat(ctx, sx, g + 1, 12, '#2a231f');
    rect(ctx, sx - 2, g - 1, 1, 2, C.grass);
    rect(ctx, sx + 3, g, 1, 1, C.grass);
  }, { foot: false }),
  rickshaw: T(22, (ctx, sx, g) => {
    // 人力車：幌をかけた赤い座席、大きな車輪、前へ伸びる梶棒
    for (const v of [-0.18, 0.18]) line3(ctx, sx, g, [0.1, v, 8], [0.7, v, 1], C.wood);
    block(ctx, sx, g, [-0.35, -0.25], [-0.2, 0.2], [8, 18], '#5a4a44', '#4a3c38', '#382c28');
    block(ctx, sx, g, [-0.42, 0.05], [-0.24, 0.24], [18, 20], '#6a5850', '#4a3c38', '#382c28');
    block(ctx, sx, g, [-0.25, 0.1], [-0.2, 0.2], [6, 10], '#c8645a', C.red, '#7e2620');
    const c = at(sx, g, -0.1, 0.3, 6);
    fillEllipse(ctx, c.x, c.y, 6, 6, C.woodDark);
    fillEllipse(ctx, c.x, c.y, 5, 5, C.bg);
    for (const [dx, dy] of [[0, -5], [4, -3], [4, 3], [0, 5], [-4, 3], [-4, -3]]) plotLine(ctx, c.x, c.y, c.x + dx, c.y + dy, C.wood);
    rect(ctx, c.x - 1, c.y - 1, 2, 2, C.metal);
  }),
  trike: T(10, (ctx, sx, g) => bicycle(ctx, sx, g, C.red, 2)),
  bike: T(12, (ctx, sx, g) => bicycle(ctx, sx, g, C.blue, 2)),
  bicycle_old: T(12, (ctx, sx, g) => bicycle(ctx, sx, g, C.rust, 2)),
  trike_gone: T(2, (ctx, sx, g) => {
    // 三輪車があった所：そこだけ土埃が少なく、三つの車輪の跡が残っている
    flat(ctx, sx, g, 12, '#3a3530');
    for (const [dx, dy] of [[-4, -1], [3, -2], [1, 1]]) rect(ctx, sx + dx, g + dy - 1, 2, 1, C.rustDark);
  }),
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
  bucket: T(11, (ctx, sx, g) => bucket(ctx, sx, g, C.blue, '#34506c', C.waterLight)),
  bucket_water: T(11, (ctx, sx, g) => bucket(ctx, sx, g, C.metal, C.metalDark, C.waterLight)),
  leak_bucket: T(11, (ctx, sx, g, tickF) => {
    bucket(ctx, sx, g, C.metalDark, C.lampPole, C.water);
    rect(ctx, sx, g - 18 + (Math.floor(tickF / 2) % 10), 1, 2, C.waterLight);
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
  sofa: T(14, (ctx, sx, g) => {
    // 捨てられたソファ：背もたれ、座面、両わきの肘掛け
    const [top, left, right] = ['#7a5646', '#5a3e30', '#3e2a20'];
    block(ctx, sx, g, [-0.45, 0.45], [-0.42, -0.18], [0, 12], top, left, right);
    block(ctx, sx, g, [-0.45, -0.3], [-0.18, 0.4], [0, 8], top, left, right);
    block(ctx, sx, g, [-0.3, 0.3], [-0.18, 0.4], [0, 5], '#6a4a3a', left, right);
    line3(ctx, sx, g, [0, -0.18, 5], [0, 0.4, 5], right);
    block(ctx, sx, g, [0.3, 0.45], [-0.18, 0.4], [0, 8], top, left, right);
  }, { foot: false }),
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
  ac: T(12, (ctx, sx, g) => {
    // エアコンの室外機：手前の面に丸い送風口と格子、右の面に通気の筋
    block(ctx, sx, g, [-0.35, 0.35], [-0.2, 0.2], [0, 10], C.white, C.paperDark, C.dust);
    const c = at(sx, g, 0, 0.2, 5);
    fillEllipse(ctx, c.x - 1, c.y, 3, 3, C.metalDark);
    fillEllipse(ctx, c.x - 1, c.y, 2, 2, C.lampPole);
    rect(ctx, c.x - 4, c.y, 7, 1, C.metalDark);
    rect(ctx, c.x - 1, c.y - 3, 1, 7, C.metalDark);
    for (const h of [3, 5, 7]) line3(ctx, sx, g, [0.35, -0.15, h], [0.35, 0.15, h], C.wallR);
  }),
  crate: T(10, (ctx, sx, g) => {
    // 木箱：板の継ぎ目と、縁の補強
    block(ctx, sx, g, [-0.25, 0.25], [-0.25, 0.25], [0, 8], C.woodLight, C.wood, C.woodDark);
    for (const h of [3, 6]) {
      line3(ctx, sx, g, [-0.25, 0.25, h], [0.25, 0.25, h], C.woodDark);
      line3(ctx, sx, g, [0.25, 0.25, h], [0.25, -0.25, h], '#1a120e');
    }
    line3(ctx, sx, g, [0.25, 0.25, 0], [0.25, 0.25, 8], C.woodLight);
  }),
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
  cicada: T(3, (ctx, sx, g) => {
    // 蝉の抜け殻：茶色の胴と、透けた羽
    rect(ctx, sx - 1, g - 4, 3, 4, C.leafDry);
    rect(ctx, sx - 1, g - 4, 1, 1, '#a07a3e');
    rect(ctx, sx - 2, g - 3, 1, 2, C.paperDark);
    rect(ctx, sx + 2, g - 3, 1, 2, C.paperDark);
  }),
  sudare: T(18, (ctx, sx, g) => {
    for (let i = 0; i < 9; i++) rect(ctx, sx - 5 + i, g - 18, 1, 14, i % 2 ? C.leafDry : C.woodLight);
  }),
  furin: T(18, (ctx, sx, g, tickF) => {
    rect(ctx, sx, g - 22, 1, 4, C.lampPole);
    fillEllipse(ctx, sx, g - 16, 3, 2, C.glass);
    rect(ctx, sx + Math.round(Math.sin(tickF * 0.3)), g - 13, 1, 4, C.paper);
  }),
  katorisenko: T(6, (ctx, sx, g, tickF) => {
    // 蚊取り線香：皿の上の、渦を巻いた緑の線香。先から細い煙
    fillEllipse(ctx, sx, g - 1, 5, 2, C.metalDark);
    fillEllipse(ctx, sx, g - 2, 4, 2, '#3a5a3a');
    fillEllipse(ctx, sx, g - 2, 3, 1, C.metalDark);
    rect(ctx, sx - 2, g - 2, 3, 1, '#3a5a3a');
    rect(ctx, sx + 3, g - 3, 1, 1, '#c8603a');
    rect(ctx, sx + 3 + (Math.floor(tickF / 6) % 2), g - 7 - (Math.floor(tickF / 3) % 3), 1, 3, C.paperDark);
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
    // 食卓に残った食器：平皿、茶碗、箸
    fillEllipse(ctx, sx - 4, g - 13, 3, 1, C.white);
    rect(ctx, sx - 5, g - 13, 2, 1, C.paperDark);
    rect(ctx, sx + 1, g - 16, 4, 2, C.white);
    rect(ctx, sx + 2, g - 14, 2, 1, C.paperDark);
    rect(ctx, sx + 1, g - 16, 4, 1, C.paperDark);
    plotLine(ctx, sx - 2, g - 10, sx + 3, g - 12, '#8a5a3a');
    plotLine(ctx, sx - 2, g - 9, sx + 3, g - 11, '#6a4a2e');
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
  rice_cooker: T(10, (ctx, sx, g) => {
    // 炊飯器：丸みのある胴、ふた、取っ手、保温の赤い灯（消えている）
    rect(ctx, sx - 4, g - 7, 9, 7, C.white);
    rect(ctx, sx - 5, g - 6, 1, 5, C.white);
    rect(ctx, sx + 3, g - 7, 2, 7, C.paperDark);
    fillEllipse(ctx, sx, g - 8, 4, 1, C.paper);
    rect(ctx, sx - 4, g - 7, 9, 1, C.paperDark);
    rect(ctx, sx - 2, g - 11, 5, 1, C.paperDark);
    rect(ctx, sx - 2, g - 10, 1, 2, C.paperDark);
    rect(ctx, sx + 2, g - 10, 1, 2, C.paperDark);
    rect(ctx, sx - 2, g - 4, 2, 1, '#6a3a34');
  }),
  pot_left: T(8, (ctx, sx, g) => {
    // 置き去りの鍋：ふたとつまみ、両わきの取っ手
    rect(ctx, sx - 4, g - 5, 9, 5, C.metal);
    rect(ctx, sx + 3, g - 5, 2, 5, C.metalDark);
    fillEllipse(ctx, sx, g - 6, 5, 1, C.metalDark);
    fillEllipse(ctx, sx, g - 7, 4, 1, C.metal);
    rect(ctx, sx - 1, g - 9, 2, 1, C.lampPole);
    rect(ctx, sx - 6, g - 4, 2, 1, C.lampPole);
    rect(ctx, sx + 5, g - 4, 2, 1, C.lampPole);
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
  rubble: T(6, (ctx, sx, g) => {
    // 崩れたコンクリートの塊と、曲がって突き出た鉄筋
    box(ctx, sx - 3, g + 1, 8, 3, C.concreteTop, C.concrete, C.wallR);
    box(ctx, sx + 4, g + 2, 6, 2, C.concreteTop, C.concrete, C.wallR);
    box(ctx, sx, g - 2, 5, 3, C.concreteTop, C.concrete, C.wallR);
    plotLine(ctx, sx + 2, g - 4, sx + 5, g - 9, C.rust);
    plotLine(ctx, sx + 5, g - 9, sx + 7, g - 9, C.rust);
  }, { foot: false }),
  table_dusty: T(10, (ctx, sx, g) => {
    // 埃をかぶった座卓：4本の脚と天板。天板には白っぽい埃
    for (const [u, v] of [[-0.4, -0.3], [0.33, -0.3], [-0.4, 0.23], [0.33, 0.23]]) block(ctx, sx, g, [u, u + 0.07], [v, v + 0.07], [0, 6], C.wood, C.woodDark, C.woodDark);
    block(ctx, sx, g, [-0.45, 0.45], [-0.35, 0.35], [6, 8], C.dust, C.wood, C.woodDark);
    for (const [u, v] of [[-0.2, -0.1], [0.1, 0.15], [0.25, -0.2], [-0.1, 0.2]]) {
      const d = at(sx, g, u, v, 8);
      rect(ctx, d.x, d.y, 2, 1, '#7a7264');
    }
  }),
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
  girl_small: T(14, (ctx, sx, g) => figure(ctx, sx, g, 13, 'stand', 0, 0.85, true), { foot: false }),
  girl_tall: T(20, (ctx, sx, g) => figure(ctx, sx, g, 19, 'stand', 0, 0.85, true), { foot: false }),
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
