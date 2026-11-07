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

/** 壁の面に描く帯（戸、窓、桟など）。from〜to は地面からの高さ、i0〜i1 は面の奥の角から数えた列（面は 12 列） */
type Band = { color: string; from: number; to: number; i0?: number; i1?: number };

/** 壁の断片（高さ h）に、帯を face の面に描く：L は手前左の面（+y 向き）、R は手前右の面（+x 向き） */
function wallPiece(ctx: Ctx, sx: number, g: number, h: number, face: Face = 'L', ...bands: Band[]): void {
  box(ctx, sx, g + TH / 2, TW, h, C.wallTop, C.wallL, C.wallR);
  for (const band of bands) faceBand(ctx, sx, g, face, band);
}

/**
 * 板一枚の建具（障子、ガラス戸、雨戸）：壁の箱は描かず、face の面（道に面した側）に立つ薄い板だけ。
 * 奥の端の列を暗くして、板の厚みを見せる
 */
function panel(ctx: Ctx, sx: number, g: number, h: number, face: Face, ...bands: Band[]): void {
  faceBand(ctx, sx, g, face, { color: C.wallL, from: 0, to: h, i0: 0, i1: TW / 2 });
  for (const band of bands) faceBand(ctx, sx, g, face, band);
  faceBand(ctx, sx, g, face, { color: C.woodDark, from: 0, to: h, i0: 0, i1: 1 });
}

/** 壁の面の帯。壁の底は台座の高さぶん下（g + TH/2 から、奥の角から列ごとに半ドットずつ下がる） */
function faceBand(ctx: Ctx, sx: number, g: number, face: Face, band: Band): void {
  for (let i = band.i0 ?? 2; i < (band.i1 ?? TW / 2 - 2); i++) {
    const x = face === 'L' ? sx - TW / 2 + i : sx + TW / 2 - 1 - i;
    const ground = g + TH / 2 + Math.floor(i / 2);
    rect(ctx, x, ground - band.to, 1, band.to - band.from, band.color);
  }
}

/** 壁（高さ h）の上にのせる瓦の軒。壁より少し張り出し、壁の上 3 ドットを覆う */
function eave(ctx: Ctx, sx: number, g: number, h: number): void {
  box(ctx, sx, g + TH / 2 - h + 3, TW + 4, 3, '#4a4e5c', '#363a46', '#2a2d38');
}

/**
 * 人影：丸い頭、肩、腕、胴、脚の平らな姿（色はつけない）。h は背の高さ、pose で腕や脚を変える。
 * skirt ならスカートの裾が広がる（女の子）
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
  // 胴（肩が少し広い）。腕は胴の両わきに
  const by = top + head;
  rect(ctx, sx - 2, by, 5, body, C.shade);
  const swing = pose === 'walk' ? (frame % 2 === 0 ? 1 : -1) : 0;
  rect(ctx, sx - 3, by + 1 + Math.max(0, swing), 1, body - 2, C.shade);
  rect(ctx, sx + 3, by + 1 + Math.max(0, -swing), 1, body - 2, C.shade);
  if (skirt) {
    rect(ctx, sx - 3, by + body - 2, 7, 2, C.shade);
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

/**
 * 物の上に積もった雪：上の縁が丸くふくらみ、下の縁は陰になって少し垂れる。てっぺんに光る粒。
 * x, y は積もる面の左端、w は幅
 */
function snowCap(ctx: Ctx, x: number, y: number, w: number): void {
  rect(ctx, x - 1, y, w + 2, 1, C.snowShade);
  rect(ctx, x - 1, y - 1, w + 2, 1, C.snow);
  rect(ctx, x, y - 2, w, 1, C.snow);
  if (w > 4) rect(ctx, x + 1, y - 3, w - 3, 1, C.snow);
  rect(ctx, x + 1, y - 2, 1, 1, '#ffffff');
  rect(ctx, x + w - 1, y + 1, 1, 1, C.snowShade);
}

/** 決まった並びの疑似乱数（0〜1）。葉の粒など、毎回同じ所に描きたいもの */
const hash01 = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * 葉の茂み：いくつもの房（lobes：[中心の dx, dy, 半径]）を重ねる。房ごとに下に濃い陰、左上に明るい面、
 * 全体に葉の粒（明暗の点）を散らして、丸の組み合わせに見えないようにする
 */
function foliage(ctx: Ctx, cx: number, cy: number, lobes: number[][], leaf: string, light: string, seed = 0): void {
  const dark = dim(leaf, 0.62);
  for (const [dx, dy, r] of lobes) fillEllipse(ctx, cx + dx, cy + dy + 1, r, Math.ceil(r * 0.8), dark);
  for (const [dx, dy, r] of lobes) fillEllipse(ctx, cx + dx, cy + dy, r - 1, Math.max(1, Math.ceil((r - 1) * 0.8)), leaf);
  for (const [dx, dy, r] of lobes) {
    if (r < 3) continue;
    fillEllipse(ctx, cx + dx - Math.round(r / 3), cy + dy - Math.round(r / 3), Math.ceil(r / 2.5), Math.ceil(r / 3.5), light);
  }
  // 葉先：房の上の縁に沿って、明るい小さな筋（2ドット）を間をあけて並べる。暗い所は房の陰だけにする
  lobes.forEach(([dx, dy, r], k) => {
    if (r < 3) return;
    for (let i = 0; i < 3; i++) {
      const a = Math.PI * (1.15 + 0.35 * i + 0.1 * hash01(seed * 31 + k * 7 + i));
      const x = Math.round(cx + dx + Math.cos(a) * (r - 2));
      const y = Math.round(cy + dy + Math.sin(a) * (r - 2) * 0.8);
      rect(ctx, x, y, 2, 1, dim(light, 1.15));
    }
  });
}

/** 幹：根元が少し広がり、左に明るい面。上で左右へ枝を分ける（枝先は葉に隠れる） */
function trunk(ctx: Ctx, sx: number, g: number, h: number, spread: number, w = 3): void {
  rect(ctx, sx - 1, g - h, w, h, C.wood);
  rect(ctx, sx - 1, g - h, 1, h, C.woodLight);
  rect(ctx, sx - 2, g - 1, w + 2, 1, C.wood);
  plotLine(ctx, sx, g - h + 3, sx - spread, g - h - 2, C.wood);
  plotLine(ctx, sx + 1, g - h + 4, sx + spread, g - h - 1, C.wood);
}

/** 広葉樹：幹と枝の上に、大きさの違う房を重ねた茂み */
function tree(ctx: Ctx, sx: number, g: number, h: number, r: number, leaf: string, light: string, seed = 0): void {
  trunk(ctx, sx, g, h, Math.round(r * 0.5), r > 8 ? 3 : 2);
  const q = (k: number) => Math.round(r * k);
  foliage(ctx, sx, g - h - q(0.3), [
    [-q(0.55), q(0.1), q(0.6)], [q(0.55), q(0.15), q(0.6)], [0, -q(0.35), q(0.7)],
    [-q(0.3), -q(0.75), q(0.5)], [q(0.35), -q(0.7), q(0.5)], [0, q(0.2), q(0.55)],
  ], leaf, light, seed);
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
  // 脚の根元の小さな足と、板を留める横木
  rect(ctx, sx - 6, g - 1, 3, 1, frame);
  rect(ctx, sx + 4, g - 1, 3, 1, frame);
  rect(ctx, sx - 5, g - 9, 11, 1, frame);
  rect(ctx, sx - 8, g - 23, 17, 11, frame);
  rect(ctx, sx - 8, g - 23, 17, 1, dim(frame, 1.5));
  rect(ctx, sx - 7, g - 22, 15, 9, face);
  rect(ctx, sx - 7, g - 22, 15, 1, dim(face, 1.15));
  rect(ctx, sx - 7, g - 14, 15, 1, dim(face, 0.85));
  for (const [y, x0, w] of lines) rect(ctx, sx - 6 + x0, g - 21 + y, w, 1, ink);
  for (const x of [-7, 7]) rect(ctx, sx + x, g - 21, 1, 1, C.metal);
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

/** 文字の並びで描く小さな絵（'.' は描かない）。pal は文字 → 色 */
function sprite(ctx: Ctx, x: number, y: number, rows: string[], pal: Record<string, string>): void {
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const color = pal[row[c]];
      if (color) rect(ctx, x + c, y + r, 1, 1, color);
    }
  });
}

/** #rrggbb を k 倍の明るさに */
function dim(color: string, k: number): string {
  return '#' + [1, 3, 5].map((i) => Math.min(255, Math.round(parseInt(color.slice(i, i + 2), 16) * k)).toString(16).padStart(2, '0')).join('');
}

/**
 * 左右そろえて脱いだ履き物：横から見た形（rows。つま先は右）を2つ。奥の片方は暗くし、上へずらして手前と重ならないようにする
 */
function pair(ctx: Ctx, sx: number, g: number, rows: string[], pal: Record<string, string>): void {
  const x = sx - Math.floor(rows[0].length / 2);
  const back = Object.fromEntries(Object.entries(pal).map(([k, v]) => [k, dim(v, 0.62)]));
  sprite(ctx, x + 2, g - rows.length - 2, rows, back);
  sprite(ctx, x - 1, g - rows.length + 1, rows, pal);
}

/**
 * 左右そろえて脱いだサンダル：上から見た形（rows。つま先が上）を、左右を折り返して並べる。足の裏の形の底と帯で、
 * 一目でサンダルと分かるようにする
 */
function pairTop(ctx: Ctx, sx: number, g: number, rows: string[], pal: Record<string, string>): void {
  const w = rows[0].length;
  const y = g - rows.length + 1;
  sprite(ctx, sx - w - 1, y, rows, pal);
  sprite(ctx, sx + 1, y - 1, rows.map((r) => [...r].reverse().join('')), pal);
}

/** 草の葉：根元（sx + dx, g）から高さ h。途中から先が bend だけ横へしなる */
function blade(ctx: Ctx, sx: number, g: number, dx: number, h: number, bend: number, color: string): void {
  const mx = sx + dx + Math.round(bend * 0.3);
  const my = g - Math.round(h * 0.6);
  plotLine(ctx, sx + dx, g, mx, my, color);
  plotLine(ctx, mx, my, sx + dx + bend, g - h, color);
}

/** 落ち葉の色（赤、橙、黄、茶） */
const LEAF_COLORS = ['#b8452a', '#d0782e', '#c9a03a', '#8a5a2e', '#a0522d'];
/** 落ち葉1枚。k で形（楓の手のひら、楕円の葉）と色を選ぶ。葉の付け根（柄）は暗い */
function fallenLeaf(ctx: Ctx, x: number, y: number, k: number): void {
  const shapes = [['x.x', 'xxx', '.s.'], ['.xx', 'xxx', 's..'], ['xx.', 'xxx', '..s'], ['.x.', 'xxx', 'x.x']];
  const color = LEAF_COLORS[(k * 3 + 1) % LEAF_COLORS.length];
  sprite(ctx, x, y, shapes[k % shapes.length], { x: color, s: dim(color, 0.55) });
  rect(ctx, x + 1, y + 1, 1, 1, dim(color, 1.25));
}

/** 埃の塊：灰色のふわふわした塊。縁がほつれ、上に白っぽい綿毛、細い糸くずが出る */
function fluff(ctx: Ctx, sx: number, g: number, rx: number, ry: number): void {
  fillEllipse(ctx, sx, g - ry, rx, ry, '#4e4a44');
  fillEllipse(ctx, sx - 1, g - ry - 1, Math.max(1, rx - 2), Math.max(1, ry - 1), '#6e695f');
  for (const [dx, dy] of [[-rx, 0], [rx, -1], [-rx + 1, -ry - 1], [rx - 1, -ry], [0, -ry * 2]]) rect(ctx, sx + dx, g - ry + dy, 1, 1, '#5e5a52');
  for (const [dx, dy] of [[-1, -ry - 1], [1, -ry], [-2, -ry]]) rect(ctx, sx + dx, g - ry + dy, 1, 1, '#9a948a');
  plotLine(ctx, sx + rx - 1, g - ry, sx + rx + 2, g - ry - 2, '#8a857a');
}

/** 舞う埃：光の中をゆっくり上っていく細かな粒 */
function motes(ctx: Ctx, sx: number, g: number, tickF: number, n: number): void {
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * 0.7;
  for (let i = 0; i < n; i++) {
    const rise = (tickF * 0.25 + i * 7) % 16;
    rect(ctx, sx - 6 + ((i * 5) % 13) + Math.round(Math.sin(tickF * 0.06 + i * 2)), g - 3 - rise, 1, 1, '#b8b2a4');
  }
  ctx.globalAlpha = a;
}

/** 物干し：2本の柱にたるんだ竿（紐）。items の洗濯物を洗濯ばさみで吊るす（[種類, 竿の上の位置, 色]） */
function clothesline(ctx: Ctx, sx: number, g: number, items: [string, number, string][]): void {
  post(ctx, sx - 9, g, 18, C.woodDark);
  post(ctx, sx + 9, g, 18, C.woodDark);
  plotLine(ctx, sx - 9, g - 17, sx, g - 16, C.metal);
  plotLine(ctx, sx, g - 16, sx + 9, g - 17, C.metal);
  const SHAPES: Record<string, string[]> = {
    // T シャツ：袖と首まわり
    shirt: ['xx.xx', 'xxxxx', 'xxxxs', '.xxx.', '.xxs.', '.xxs.'],
    // 半ズボン：腰と2本の脚
    pants: ['xxxx', 'xxxs', 'xx.s', 'xs.s'],
    // タオル：竿に掛けて垂らし、2本の縞
    towel: ['xxxx', 'xxxs', 'yyyy', 'xxxs', 'yyyy', 'xxxs', 'xxxs'],
    // 靴下：かかとで曲がる
    sock: ['xx', 'xs', 'xs', 'xxs', '.xx'],
  };
  for (const [kind, dx, color] of items) {
    const rows = SHAPES[kind];
    const x = sx + dx;
    const y = g - 16 + (Math.abs(dx) < 4 ? 1 : 0);
    sprite(ctx, x, y, rows, { x: color, s: dim(color, 0.72), y: dim(color, 0.55) });
    // 洗濯ばさみ
    rect(ctx, x, y - 1, 1, 2, C.yellow);
    rect(ctx, x + rows[0].length - 1, y - 1, 1, 2, C.yellow);
  }
}

/** 鉢：明るい上の縁と、下すぼまりの素焼きの胴（右に陰）。土の上（植わる所）の y を返す */
function flowerpot(ctx: Ctx, sx: number, g: number): number {
  for (let r = 0; r < 5; r++) {
    const w = 7 - Math.floor(r / 2);
    const x = sx - Math.floor(w / 2);
    rect(ctx, x, g - 1 - r, w, 1, '#9a4e2e');
    rect(ctx, x + w - 1, g - 1 - r, 1, 1, '#6e3420');
    rect(ctx, x, g - 1 - r, 1, 1, '#b8683e');
  }
  rect(ctx, sx - 4, g - 8, 9, 2, '#b8683e');
  rect(ctx, sx - 4, g - 8, 9, 1, '#d08050');
  rect(ctx, sx + 4, g - 7, 1, 1, '#7e3c24');
  rect(ctx, sx - 3, g - 8, 7, 1, '#3a2418');
  return g - 8;
}

/** 鉢の植物：根元から放射に伸びる茎と、先の尖った葉（明るい面つき） */
function potPlant(ctx: Ctx, sx: number, top: number, leaf: string, light: string): void {
  for (const [dx, dy] of [[-5, -5], [-3, -8], [0, -9], [3, -7], [5, -4]]) {
    plotLine(ctx, sx, top, sx + Math.round(dx / 2), top + Math.round(dy / 2), dim(leaf, 0.8));
    fillEllipse(ctx, sx + dx, top + dy, 2, 1, leaf);
    rect(ctx, sx + dx - 1, top + dy - 1, 2, 1, light);
  }
  for (const [dx, dy] of [[-2, -3], [2, -3]]) rect(ctx, sx + dx, top + dy, 2, 2, leaf);
}

function bicycle(ctx: Ctx, sx: number, g: number, color: string, wheels = 2): void {
  for (let i = 0; i < wheels; i++) fillEllipse(ctx, sx - 4 + i * 8, g - 3, 3, 3, C.metalDark);
  for (let i = 0; i < wheels; i++) fillEllipse(ctx, sx - 4 + i * 8, g - 3, 2, 2, C.bg);
  plotLine(ctx, sx - 4, g - 3, sx, g - 8, color);
  plotLine(ctx, sx, g - 8, sx + 4, g - 3, color);
  rect(ctx, sx - 1, g - 9, 3, 1, color);
}

/** 戸や窓を描く面（L：手前左、+y 向き。R：手前右、+x 向き）。描画側が、道のある側を選んで渡す */
export type Face = 'L' | 'R';

export interface ThingInfo {
  /** 足もとに小さな台座を描く（闇に浮かぶ）。面の上の物や、闇そのものに浮かぶ物は描かない */
  foot: boolean;
  /** 高さ（プレイヤーに重なるときに透かす範囲） */
  height: number;
  /** まわりの道を照らす灯り */
  light?: boolean;
  draw: (ctx: Ctx, sx: number, g: number, tickF: number, face: Face) => void;
}

const T = (height: number, draw: ThingInfo['draw'], opts: Partial<Omit<ThingInfo, 'draw' | 'height'>> = {}): ThingInfo => ({
  foot: opts.foot ?? true,
  light: opts.light,
  height,
  draw,
});

export const THINGS: Record<string, ThingInfo> = {
  // ---- 家、戸口、窓 ----
  entrance: T(22, (ctx, sx, g, _t, face) => {
    // 家の玄関：明かりのともった格子のガラス戸（下に板の腰、まん中で引き違い）。わきに表札、上に軒
    wallPiece(ctx, sx, g, 20, face,
      { color: C.woodDark, from: 0, to: 16, i0: 2, i1: 10 },
      { color: '#c9b878', from: 4, to: 15, i0: 3, i1: 9 },
      { color: C.wood, from: 1, to: 4, i0: 3, i1: 9 },
      { color: C.woodDark, from: 1, to: 15, i0: 6, i1: 7 },
      { color: '#8a7a50', from: 8, to: 9, i0: 3, i1: 9 },
      { color: '#8a7a50', from: 12, to: 13, i0: 3, i1: 9 },
      { color: C.paper, from: 9, to: 12, i0: 10, i1: 11 });
    eave(ctx, sx, g, 20);
  }, { foot: false, light: true }),
  door: T(22, (ctx, sx, g, _t, face) => {
    // よその家の戸口：木の引き戸。上に細いガラスの欄間、横の桟、引き手。上に軒
    wallPiece(ctx, sx, g, 20, face,
      { color: C.woodDark, from: 0, to: 16, i0: 2, i1: 10 },
      { color: '#5a4634', from: 1, to: 15, i0: 3, i1: 9 },
      { color: C.glass, from: 12, to: 15, i0: 3, i1: 9 },
      { color: C.woodDark, from: 1, to: 15, i0: 6, i1: 7 },
      { color: C.woodDark, from: 5, to: 6, i0: 3, i1: 9 },
      { color: C.woodDark, from: 11, to: 12, i0: 3, i1: 9 },
      { color: C.metal, from: 7, to: 9, i0: 5, i1: 6 });
    eave(ctx, sx, g, 20);
  }, { foot: false }),
  house: T(24, (ctx, sx, g, _t, face) => {
    // 家の壁の断片：瓦の軒をのせ、明かりの消えた小窓（格子つき）がひとつ
    wallPiece(ctx, sx, g, 20, face, { color: '#5a5a66', from: 2, to: 10, i0: 3, i1: 9 }, { color: '#22222a', from: 3, to: 9, i0: 4, i1: 8 }, { color: '#5a5a66', from: 6, to: 7, i0: 4, i1: 8 });
    box(ctx, sx, g + TH / 2 - 17, TW + 4, 3, '#4a4e5c', '#363a46', '#2a2d38');
  }, { foot: false }),
  home_window: T(24, (ctx, sx, g, _t, face) => {
    // 明かりのついた窓：木の枠に十字の桟、片側に寄せたカーテン、下に窓台。上に軒
    wallPiece(ctx, sx, g, 22, face,
      { color: C.woodDark, from: 7, to: 17, i0: 2, i1: 10 },
      { color: C.glassLit, from: 8, to: 16, i0: 3, i1: 9 },
      { color: '#a88a60', from: 8, to: 16, i0: 3, i1: 4 },
      { color: C.woodDark, from: 8, to: 16, i0: 6, i1: 7 },
      { color: C.woodDark, from: 12, to: 13, i0: 3, i1: 9 },
      { color: C.concreteTop, from: 6, to: 7, i0: 1, i1: 11 });
    eave(ctx, sx, g, 22);
  }, { foot: false, light: true }),
  window: T(24, (ctx, sx, g, _t, face) => {
    // 明かりのついた窓：両側に寄せたカーテン、まん中の桟、窓台。上に軒
    wallPiece(ctx, sx, g, 22, face,
      { color: C.woodDark, from: 6, to: 18, i0: 2, i1: 10 },
      { color: C.glassLit, from: 7, to: 17, i0: 3, i1: 9 },
      { color: '#b88a8a', from: 7, to: 17, i0: 3, i1: 4 },
      { color: '#b88a8a', from: 7, to: 17, i0: 8, i1: 9 },
      { color: C.woodDark, from: 7, to: 17, i0: 6, i1: 7 },
      { color: C.concreteTop, from: 5, to: 6, i0: 1, i1: 11 });
    eave(ctx, sx, g, 22);
  }, { foot: false, light: true }),
  broken_window: T(24, (ctx, sx, g, _t, face) => {
    // 割れた窓：枠の中は闇。縁にとがったガラスの破片が残り、斜めに板が一枚打ちつけてある。上に軒
    wallPiece(ctx, sx, g, 22, face,
      { color: C.woodDark, from: 7, to: 17, i0: 2, i1: 10 },
      { color: C.bg, from: 8, to: 16, i0: 3, i1: 9 },
      { color: C.concrete, from: 6, to: 7, i0: 1, i1: 11 });
    // 残った破片（枠の上と下から、ぎざぎざに）
    for (const [i, from, to] of [[3, 13, 16], [4, 14, 16], [5, 15, 16], [7, 12, 16], [8, 14, 16], [3, 8, 11], [4, 8, 9], [8, 8, 10]]) {
      faceBand(ctx, sx, g, face, { color: C.glass, from, to, i0: i, i1: i + 1 });
    }
    faceBand(ctx, sx, g, face, { color: '#8a9aa4', from: 14, to: 15, i0: 3, i1: 4 });
    // 打ちつけた板
    for (let i = 2; i < 10; i++) faceBand(ctx, sx, g, face, { color: i % 3 === 0 ? C.wood : C.woodLight, from: 15 - i, to: 17 - i, i0: i, i1: i + 1 });
    eave(ctx, sx, g, 22);
  }, { foot: false }),
  shoji: T(18, (ctx, sx, g, _t, face) => {
    // 障子：木の枠に、細い組子の升目と白い紙。下に板の腰、上に鴨居
    panel(ctx, sx, g, 16, face,
      { color: C.wood, from: 0, to: 13, i0: 1, i1: 11 },
      { color: C.paper, from: 2, to: 13, i0: 2, i1: 10 },
      { color: C.woodLight, from: 0, to: 2, i0: 2, i1: 10 },
      ...[4, 6, 8].map((i) => ({ color: '#9a8e74', from: 2, to: 13, i0: i, i1: i + 1 })),
      ...[5, 8, 11].map((h) => ({ color: '#9a8e74', from: h, to: h + 1, i0: 2, i1: 10 })),
      { color: C.woodDark, from: 13, to: 16, i0: 0, i1: 12 });
  }, { foot: false }),
  torn_shoji: T(18, (ctx, sx, g, _t, face) => {
    // 破れた障子：黄ばんでしみの出た紙。升目のいくつかが破れて闇がのぞき、破れた紙が垂れ下がる
    panel(ctx, sx, g, 16, face,
      { color: C.wood, from: 0, to: 13, i0: 1, i1: 11 },
      { color: '#a49c86', from: 2, to: 13, i0: 2, i1: 10 },
      { color: C.woodLight, from: 0, to: 2, i0: 2, i1: 10 },
      { color: '#8a8270', from: 5, to: 8, i0: 7, i1: 9 },
      { color: C.bg, from: 9, to: 12, i0: 2, i1: 4 },
      { color: C.bg, from: 3, to: 6, i0: 5, i1: 6 },
      { color: C.bg, from: 6, to: 8, i0: 8, i1: 10 },
      { color: '#c8c0aa', from: 7, to: 9, i0: 3, i1: 4 },
      { color: '#c8c0aa', from: 5, to: 6, i0: 8, i1: 9 },
      ...[4, 6, 8].map((i) => ({ color: '#7a6e56', from: 2, to: 13, i0: i, i1: i + 1 })),
      ...[5, 8, 11].map((h) => ({ color: '#7a6e56', from: h, to: h + 1, i0: 2, i1: 10 })),
      { color: C.woodDark, from: 13, to: 16, i0: 0, i1: 12 });
  }, { foot: false }),
  glass_door: T(20, (ctx, sx, g, _t, face) => {
    // 縁側のガラス戸：木の枠に大きなガラス。ガラスに斜めの光が映り、腰の高さに桟、下に敷居、上に鴨居
    panel(ctx, sx, g, 18, face,
      { color: C.wood, from: 0, to: 15, i0: 1, i1: 11 },
      { color: C.glass, from: 1, to: 14, i0: 2, i1: 10 },
      { color: C.wood, from: 5, to: 6, i0: 2, i1: 10 },
      { color: C.wood, from: 1, to: 14, i0: 6, i1: 7 },
      { color: C.woodDark, from: 0, to: 1, i0: 0, i1: 12 },
      { color: C.woodDark, from: 15, to: 18, i0: 0, i1: 12 });
    // 映りこんだ光（斜めの筋）
    for (let i = 2; i < 6; i++) faceBand(ctx, sx, g, face, { color: '#7a8a94', from: 6 + i * 2, to: 8 + i * 2, i0: i, i1: i + 1 });
    for (let i = 7; i < 10; i++) faceBand(ctx, sx, g, face, { color: '#66747e', from: i - 1, to: i + 1, i0: i, i1: i + 1 });
  }, { foot: false, light: true }),
  amado: T(18, (ctx, sx, g, _t, face) => {
    // 閉じた雨戸：縦に張った板と、上下の横の桟。板の継ぎ目が明るく、下のほうは雨で黒ずむ。上に鴨居
    panel(ctx, sx, g, 16, face,
      { color: '#4a382c', from: 0, to: 13, i0: 1, i1: 11 },
      ...[3, 6, 9].map((i) => ({ color: '#5e4a3a', from: 0, to: 13, i0: i, i1: i + 1 })),
      { color: C.woodDark, from: 3, to: 4, i0: 1, i1: 11 },
      { color: C.woodDark, from: 10, to: 11, i0: 1, i1: 11 },
      { color: '#33281f', from: 0, to: 2, i0: 1, i1: 11 },
      { color: C.woodDark, from: 13, to: 16, i0: 0, i1: 12 });
  }, { foot: false }),
  kido: T(20, (ctx, sx, g) => {
    // 庭の木戸：2本の柱に小さな板屋根。戸は縦の板を並べ、上下と中ほどに横の桟、掛け金
    post(ctx, sx - 6, g, 16, C.woodDark, 2);
    post(ctx, sx + 6, g, 16, C.woodDark, 2);
    rect(ctx, sx - 7, g - 17, 15, 1, C.woodDark);
    rect(ctx, sx - 8, g - 18, 17, 1, '#363a46');
    rect(ctx, sx - 7, g - 19, 15, 1, '#4a4e5c');
    rect(ctx, sx - 5, g - 20, 11, 1, '#5a5e6c');
    for (let i = 0; i < 9; i++) rect(ctx, sx - 4 + i, g - 15, 1, 13, i % 2 ? C.wood : C.woodLight);
    for (const y of [14, 9, 4]) rect(ctx, sx - 4, g - y, 9, 1, C.woodDark);
    rect(ctx, sx + 3, g - 10, 2, 1, C.metal);
  }),
  storage_shed: T(20, (ctx, sx, g) => {
    // 金物の物置：縦の波板の壁、手前に2枚の引き戸（取っ手）、少し張り出した屋根。裾に錆
    block(ctx, sx, g, [-0.36, 0.36], [-0.3, 0.3], [0, 14], C.metal, C.metalDark, C.lampPole);
    for (let u = -0.3; u < 0.34; u += 0.08) line3(ctx, sx, g, [u, 0.3, 1], [u, 0.3, 13], '#6a6c72');
    for (let v = -0.24; v < 0.28; v += 0.08) line3(ctx, sx, g, [0.36, v, 1], [0.36, v, 13], '#2a2a30');
    line3(ctx, sx, g, [0, 0.3, 0], [0, 0.3, 13], C.lampPole);
    for (const u of [-0.06, 0.06]) line3(ctx, sx, g, [u, 0.3, 6], [u, 0.3, 8], '#c8ccd2');
    line3(ctx, sx, g, [-0.36, 0.3, 1], [0.36, 0.3, 1], C.rustDark);
    block(ctx, sx, g, [-0.42, 0.42], [-0.36, 0.38], [14, 16], '#9a9ca2', '#6a6c72', '#4a4c52');
  }, { foot: false }),
  shutter: T(22, (ctx, sx, g, _t, face) => {
    // 閉じたシャッター：上に巻き取りの箱、横に細かな波板の筋、両わきの溝、下の端の金具。ところどころ錆が垂れる。上に軒
    wallPiece(ctx, sx, g, 20, face,
      { color: C.metalDark, from: 0, to: 16, i0: 1, i1: 11 },
      ...Array.from({ length: 12 }, (_, k) => ({ color: k % 2 ? '#6a6c72' : '#a4a6ac', from: 1 + k, to: 2 + k, i0: 2, i1: 10 })),
      { color: C.lampPole, from: 13, to: 16, i0: 1, i1: 11 },
      { color: C.lampPole, from: 0, to: 1, i0: 2, i1: 10 },
      { color: '#7a5a4a', from: 7, to: 12, i0: 4, i1: 5 },
      { color: '#6a4c40', from: 2, to: 8, i0: 8, i1: 9 });
    eave(ctx, sx, g, 20);
  }, { foot: false }),
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
  culvert: T(4, (ctx, sx, g, tickF) => {
    // 暗渠の口：用水路が道の下へもぐる所。水路の端を低いコンクリートの縁で囲い、上に鉄の格子の蓋（グレーチング）。
    // 格子のすき間から、下を流れる水が光る
    const P = (u: number, v: number, h: number) => at(sx, g, u, v, h);
    block(ctx, sx, g, [-0.48, 0.48], [-0.48, 0.48], [-6, 3], C.concreteTop, C.concrete, C.wallR);
    fillQuad(ctx, [P(-0.36, -0.36, 3), P(0.36, -0.36, 3), P(0.36, 0.36, 3), P(-0.36, 0.36, 3)], '#141a20');
    for (let k = 0; k < 8; k++) {
      const u = -0.33 + k * 0.095;
      const glint = (k * 5 + Math.floor(tickF / 4)) % 8 < 3;
      line3(ctx, sx, g, [u + 0.045, -0.33, 3], [u + 0.045, 0.33, 3], glint ? C.waterLight : C.water);
      line3(ctx, sx, g, [u, -0.36, 3], [u, 0.36, 3], C.metalDark);
    }
    line3(ctx, sx, g, [-0.36, 0.36, 3], [0.36, 0.36, 3], C.metal);
    line3(ctx, sx, g, [0.36, -0.36, 3], [0.36, 0.36, 3], C.lampPole);
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
  gate_lamp: T(22, (ctx, sx, g) => {
    // 門灯：門柱（笠石のついたコンクリートの柱）の上に、屋根のついた四角い灯り。すりガラスがともる
    rect(ctx, sx - 2, g - 14, 5, 14, C.concrete);
    rect(ctx, sx - 2, g - 14, 1, 14, C.concreteTop);
    rect(ctx, sx + 2, g - 14, 1, 14, C.wallR);
    rect(ctx, sx - 3, g - 15, 7, 1, C.concreteTop);
    rect(ctx, sx - 2, g - 21, 5, 5, C.lampPole);
    rect(ctx, sx - 1, g - 20, 3, 3, C.lampLight);
    rect(ctx, sx, g - 20, 1, 3, '#d8c890');
    rect(ctx, sx - 3, g - 22, 7, 1, C.lampPole);
    rect(ctx, sx - 1, g - 23, 3, 1, C.lampPole);
  }, { light: true }),
  porch_lamp: T(20, (ctx, sx, g) => {
    // 玄関の灯り：木の柱の腕に、屋根と枠のついた灯り（4枚のすりガラス）を吊るす
    post(ctx, sx, g, 18, C.wood);
    rect(ctx, sx - 1, g - 18, 1, 18, C.woodLight);
    rect(ctx, sx, g - 18, 5, 1, C.woodDark);
    rect(ctx, sx + 4, g - 17, 1, 1, C.lampPole);
    rect(ctx, sx + 2, g - 16, 5, 1, C.lampPole);
    rect(ctx, sx + 2, g - 15, 5, 5, C.lampPole);
    rect(ctx, sx + 3, g - 15, 3, 4, C.lampLight);
    rect(ctx, sx + 4, g - 15, 1, 4, '#d8c890');
    rect(ctx, sx + 3, g - 10, 3, 1, C.lampPole);
  }, { light: true }),
  porch_lamp_snow: T(22, (ctx, sx, g) => {
    // 玄関の灯り：木の柱の腕に、屋根と枠のついた灯り（4枚のすりガラス）を吊るす。屋根と腕に雪が厚く積もり、つららが一本
    post(ctx, sx, g, 18, C.wood);
    rect(ctx, sx - 1, g - 18, 1, 18, C.woodLight);
    rect(ctx, sx, g - 18, 5, 1, C.woodDark);
    rect(ctx, sx + 4, g - 17, 1, 1, C.lampPole);
    rect(ctx, sx + 2, g - 16, 5, 1, C.lampPole);
    rect(ctx, sx + 2, g - 15, 5, 5, C.lampPole);
    rect(ctx, sx + 3, g - 15, 3, 4, C.lampLight);
    rect(ctx, sx + 4, g - 15, 1, 4, '#d8c890');
    rect(ctx, sx + 3, g - 10, 3, 1, C.lampPole);
    snowCap(ctx, sx + 1, g - 17, 7);
    snowCap(ctx, sx - 2, g - 19, 4);
    rect(ctx, sx + 6, g - 10, 1, 3, '#c8dce8');
    rect(ctx, sx + 6, g - 7, 1, 1, '#f0f8ff');
  }, { light: true }),
  pendant_off: T(0, (ctx, sx, g) => {
    // 食卓の上に下がった、消えた電灯：天井の受け金から下がるコード、乳白の笠（左に光の当たり）と縁、
    // 笠の下の消えた電球、引き紐と先の玉
    rect(ctx, sx - 1, g - 38, 3, 1, C.metalDark);
    rect(ctx, sx, g - 37, 1, 13, C.lampPole);
    for (const [r, w] of [[0, 3], [1, 5], [2, 7], [3, 9], [4, 11]]) {
      rect(ctx, sx - Math.floor(w / 2), g - 24 + r, w, 1, '#8a8470');
      rect(ctx, sx - Math.floor(w / 2), g - 24 + r, 2, 1, '#aaa48e');
    }
    rect(ctx, sx - 5, g - 19, 11, 1, '#5a5444');
    rect(ctx, sx - 1, g - 18, 2, 2, '#5a5a50');
    rect(ctx, sx + 3, g - 18, 1, 6, C.paperDark);
    rect(ctx, sx + 3, g - 12, 1, 1, C.metal);
  }, { foot: false }),
  lantern: T(24, (ctx, sx, g) => {
    // 石灯籠：広い基礎、細い竿、中台の上に灯りのともる火袋（四角い窓）、反りのある大きな笠、てっぺんの宝珠。石の粒
    rect(ctx, sx - 5, g - 2, 10, 2, C.concrete);
    rect(ctx, sx - 4, g - 3, 8, 1, C.concreteTop);
    rect(ctx, sx - 1, g - 9, 3, 6, C.concreteTop);
    rect(ctx, sx + 1, g - 9, 1, 6, C.concrete);
    rect(ctx, sx - 4, g - 11, 8, 2, C.concreteTop);
    rect(ctx, sx - 4, g - 10, 8, 1, C.concrete);
    rect(ctx, sx - 3, g - 16, 6, 5, C.concreteTop);
    rect(ctx, sx - 2, g - 15, 4, 3, C.lampLight);
    rect(ctx, sx, g - 15, 1, 3, '#d8c890');
    rect(ctx, sx + 2, g - 16, 1, 5, C.concrete);
    rect(ctx, sx - 6, g - 18, 12, 2, C.concrete);
    rect(ctx, sx - 5, g - 19, 10, 1, C.concreteTop);
    rect(ctx, sx - 7, g - 17, 1, 1, C.concrete);
    rect(ctx, sx + 6, g - 17, 1, 1, C.concrete);
    rect(ctx, sx - 3, g - 20, 6, 1, C.concreteTop);
    rect(ctx, sx - 1, g - 22, 2, 2, C.concreteTop);
    rect(ctx, sx, g - 23, 1, 1, C.concreteTop);
    for (const [dx, dy] of [[-3, -1], [2, -2], [0, -6], [-3, -10], [3, -18], [-4, -18]]) rect(ctx, sx + dx, g + dy, 1, 1, '#4a4640');
  }, { light: true }),
  // ---- 電柱、看板、街の物 ----
  wpole: T(34, (ctx, sx, g) => pole(ctx, sx, g, C.woodLight, C.woodDark)),
  cpole: T(34, (ctx, sx, g) => pole(ctx, sx, g, C.concrete, C.metalDark)),
  mirror: T(30, (ctx, sx, g) => {
    // カーブミラー：橙の支柱の先の腕に、橙の縁の丸い鏡と、上のひさし。鏡には道が映り、斜めの光の筋
    rect(ctx, sx - 2, g - 1, 4, 1, C.metalDark);
    rect(ctx, sx - 1, g - 24, 2, 23, '#c8642e');
    rect(ctx, sx - 1, g - 24, 1, 23, '#e0844a');
    rect(ctx, sx, g - 25, 3, 1, '#c8642e');
    fillEllipse(ctx, sx + 3, g - 26, 6, 5, '#d8742e');
    fillEllipse(ctx, sx + 3, g - 26, 5, 4, '#5a6a78');
    fillEllipse(ctx, sx + 3, g - 24, 4, 2, '#4a4844');
    rect(ctx, sx + 1, g - 24, 5, 1, '#7a7870');
    plotLine(ctx, sx + 1, g - 27, sx + 4, g - 30, '#b8c8d4');
    rect(ctx, sx - 2, g - 32, 10, 1, '#a8542a');
    rect(ctx, sx - 1, g - 31, 8, 1, '#7a3a1e');
  }),
  newsign: T(24, (ctx, sx, g) => {
    // 新しい立て看板：赤い板に白い字の帯と、右を指す黄色い矢印
    sign(ctx, sx, g, '#c85a3a', C.wood, C.white, [[1, 1, 8], [3, 1, 6], [5, 1, 7]]);
    rect(ctx, sx + 3, g - 18, 3, 1, C.yellow);
    rect(ctx, sx + 5, g - 19, 1, 3, C.yellow);
    rect(ctx, sx + 6, g - 18, 1, 1, C.yellow);
  }),
  fadedsign: T(24, (ctx, sx, g) => {
    // 色あせた立て看板：日の当たる上半分ほど色が抜け、字は途切れる。端に貼り紙のはがれた跡
    sign(ctx, sx, g, '#8a6656', C.woodDark, '#b09080', [[1, 1, 6], [1, 9, 3], [4, 2, 7]]);
    rect(ctx, sx - 7, g - 22, 15, 3, '#9a7a6a');
    rect(ctx, sx - 6, g - 20, 6, 1, '#b8a090');
    rect(ctx, sx + 3, g - 17, 4, 3, '#a89a88');
    rect(ctx, sx + 3, g - 17, 1, 1, '#6a5246');
  }),
  sign_old: T(24, (ctx, sx, g) => {
    // 古い立て看板：日に焼けて色の抜けた板。ペンキがはがれて木地がのぞき、字はかすれて途切れる。
    // 釘から錆が垂れ、下の縁は苔と泥で黒ずむ。右上の角は欠け、片方の脚は短く少し傾く
    post(ctx, sx - 5, g, 22, C.woodDark, 1);
    post(ctx, sx + 5, g, 21, C.woodDark, 1);
    rect(ctx, sx - 8, g - 23, 17, 11, '#3a2c22');
    rect(ctx, sx - 7, g - 22, 15, 9, '#7a6a52');
    for (const [y, x0, w] of [[1, 0, 6], [3, 5, 9], [6, 1, 7], [7, 9, 5]]) rect(ctx, sx - 7 + x0, g - 22 + y, w, 1, '#6c5c46');
    for (const [x, y, w, h] of [[1, 2, 3, 2], [10, 5, 3, 2], [6, 7, 2, 1], [12, 1, 1, 2]]) rect(ctx, sx - 7 + x, g - 22 + y, w, h, '#a2926e');
    for (const [y, x0, w] of [[2, 5, 2], [2, 8, 3], [5, 2, 3], [5, 6, 1], [5, 8, 1]]) rect(ctx, sx - 7 + x0, g - 22 + y, w, 1, '#4e4232');
    for (const x of [-6, 3]) {
      rect(ctx, sx + x, g - 22, 1, 1, C.metalDark);
      rect(ctx, sx + x, g - 21, 1, 3, '#6e3a26');
      rect(ctx, sx + x, g - 18, 1, 1, '#5a3a2a');
    }
    rect(ctx, sx - 7, g - 14, 15, 1, '#3e3e28');
    rect(ctx, sx - 6, g - 15, 5, 1, '#55553a');
    rect(ctx, sx + 2, g - 15, 2, 1, '#55553a');
    rect(ctx, sx + 6, g - 23, 3, 2, C.bg);
    rect(ctx, sx + 8, g - 21, 1, 1, C.bg);
  }),
  faded_poster: T(20, (ctx, sx, g) => {
    // 色あせたポスター：杭に打った板に貼られ、日に焼けて青みが抜けた絵（人の顔の丸）と題字の帯。
    // 四隅のテープ、めくれて垂れた角
    post(ctx, sx, g, 18, C.woodDark, 2);
    rect(ctx, sx - 6, g - 20, 12, 15, C.wood);
    rect(ctx, sx - 5, g - 19, 10, 13, '#c8bca0');
    rect(ctx, sx - 5, g - 19, 10, 3, '#a87a6a');
    rect(ctx, sx - 4, g - 18, 6, 1, '#e0d0c0');
    fillEllipse(ctx, sx, g - 12, 3, 3, '#8a9aa0');
    rect(ctx, sx - 1, g - 13, 1, 1, '#5a6470');
    rect(ctx, sx + 1, g - 13, 1, 1, '#5a6470');
    rect(ctx, sx - 4, g - 8, 8, 1, '#8a7a6a');
    for (const [dx, dy] of [[-5, -19], [4, -19], [-5, -7]]) rect(ctx, sx + dx, g + dy, 1, 1, '#e8e0c8');
    rect(ctx, sx + 3, g - 7, 3, 1, C.wood);
    rect(ctx, sx + 4, g - 6, 2, 2, '#a89c80');
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
  sapling: T(16, (ctx, sx, g) => {
    // 若木：細い幹を添え木に結び、まばらな葉の房が二つ三つ
    rect(ctx, sx + 2, g - 12, 1, 12, C.woodLight);
    rect(ctx, sx, g - 8, 3, 1, C.paperDark);
    rect(ctx, sx, g - 10, 1, 10, C.wood);
    foliage(ctx, sx, g - 12, [[-2, 1, 3], [2, 0, 3], [0, -2, 3]], C.leafLight, '#6a8a52', 1);
  }),
  midtree: T(24, (ctx, sx, g) => tree(ctx, sx, g, 12, 8, C.leaf, C.leafLight, 2)),
  bigtree: T(36, (ctx, sx, g) => {
    // 大きな木：太い幹から枝が横へ張り出し、横に広い茂み
    trunk(ctx, sx, g, 18, 7, 4);
    foliage(ctx, sx, g - 22, [[-8, 2, 6], [8, 3, 6], [-4, -3, 7], [4, -4, 7], [0, -9, 6], [-9, -5, 4], [9, -4, 4], [0, 2, 5]], C.leaf, C.leafLight, 3);
  }),
  tree: T(28, (ctx, sx, g) => tree(ctx, sx, g, 14, 9, C.leaf, C.leafLight, 4)),
  greentree: T(32, (ctx, sx, g) => {
    // 庭の松：曲がった幹から段になって横へ伸びる枝に、平たい葉の段がのる
    const stem: [number, number][] = [[0, 0], [-1, -6], [1, -11], [-1, -16], [0, -21]];
    for (let i = 1; i < stem.length; i++) {
      plotLine(ctx, sx + stem[i - 1][0], g + stem[i - 1][1], sx + stem[i][0], g + stem[i][1], C.wood);
      plotLine(ctx, sx + stem[i - 1][0] + 1, g + stem[i - 1][1], sx + stem[i][0] + 1, g + stem[i][1], C.woodDark);
    }
    for (const [x0, y0, x1, y1] of [[0, -9, -7, -11], [1, -14, 8, -16], [0, -19, -5, -22]]) plotLine(ctx, sx + x0, g + y0, sx + x1, g + y1, C.wood);
    for (const [dx, dy, rx] of [[-7, -12, 6], [7, -17, 6], [-4, -23, 5], [1, -27, 4]]) {
      fillEllipse(ctx, sx + dx, g + dy + 1, rx, 2, '#1e3a1c');
      fillEllipse(ctx, sx + dx, g + dy, rx - 1, 2, '#2e5a2a');
      fillEllipse(ctx, sx + dx - 1, g + dy - 1, Math.ceil(rx / 2), 1, '#4a7a40');
      for (let i = -rx + 1; i < rx; i += 2) rect(ctx, sx + dx + i, g + dy + 2, 1, 1, '#2e5a2a');
    }
  }),
  persimmon_tree: T(32, (ctx, sx, g) => {
    // 柿の木：葉の落ちかけた枝がのぞき、まばらな枯れ色の葉に、へたのついた橙の実がいくつも下がる
    trunk(ctx, sx, g, 16, 6, 3);
    for (const [x1, y1] of [[-8, -24], [7, -25], [-3, -30], [9, -19]]) plotLine(ctx, sx, g - 16, sx + x1, g + y1, C.wood);
    foliage(ctx, sx, g - 22, [[-6, 1, 4], [6, 0, 4], [-2, -5, 4], [4, -6, 3], [0, 2, 3]], '#5a4a26', C.leafDry, 5);
    for (const [dx, dy] of [[-5, -20], [3, -16], [7, -23], [-1, -14], [-7, -26], [2, -27], [8, -18]]) {
      rect(ctx, sx + dx, g + dy, 3, 3, '#d8752e');
      rect(ctx, sx + dx, g + dy, 1, 1, '#f0a050');
      rect(ctx, sx + dx + 1, g + dy - 1, 1, 1, '#3a4a22');
    }
  }),
  plant: T(12, (ctx, sx, g) => {
    // 植え込み：低い株立ちの茂み。根元に細い幹がのぞく
    rect(ctx, sx - 2, g - 3, 1, 3, C.wood);
    rect(ctx, sx + 2, g - 3, 1, 3, C.wood);
    foliage(ctx, sx, g - 6, [[-3, 1, 4], [3, 1, 4], [0, -2, 4], [0, 2, 3]], C.leaf, C.leafLight, 6);
  }),
  canopy: T(16, (ctx, sx, g) => {
    // 屋根に覆いかぶさる庭木の梢：奥から伸びた枝の先の葉の房。下の縁から葉が垂れ下がる
    plotLine(ctx, sx - 10, g - 14, sx + 2, g - 9, C.wood);
    foliage(ctx, sx, g - 8, [[-6, -1, 5], [5, 0, 5], [0, -4, 6], [-2, 3, 4], [6, 3, 3]], '#2e5a2a', '#4a7a40', 7);
    for (const dx of [-7, -3, 2, 6]) rect(ctx, sx + dx, g - 2 + (dx & 1), 1, 2, '#2e5a2a');
  }, { foot: false }),
  flower_pot: T(14, (ctx, sx, g) => {
    // 花の鉢：素焼きの鉢に、葉と、赤と黄色の小さな花が3つ
    const top = flowerpot(ctx, sx, g);
    potPlant(ctx, sx, top, C.leaf, C.leafLight);
    for (const [dx, dy, color] of [[-4, -7, '#d8504a'], [1, -9, C.yellow], [4, -6, '#d8504a']] as [number, number, string][]) {
      rect(ctx, sx + dx - 1, top + dy, 3, 1, color);
      rect(ctx, sx + dx, top + dy - 1, 1, 3, color);
      rect(ctx, sx + dx, top + dy, 1, 1, '#f0e0a0');
    }
  }),
  pot: T(14, (ctx, sx, g) => {
    // 植木鉢：素焼きの鉢に、先の尖った葉の株
    const top = flowerpot(ctx, sx, g);
    potPlant(ctx, sx, top, '#3a5a34', '#5a7a46');
  }),
  // ---- 子どもの履き物、家の物 ----
  kid_sandal: T(8, (ctx, sx, g) => pairTop(ctx, sx, g, ['.oo.', 'otto', 'bbbb', 'otto', 'bfbb', 'otto', '.bb.', '.oo.'],
    // 子どものサンダル：桃色の縁どりの底（中敷きは白）に、甲を渡る帯が2本（片方に黄色い花）と、かかとの帯
    { o: '#c85a78', t: '#f4ece4', b: '#e0708c', f: C.yellow })),
  sandals: T(8, (ctx, sx, g) => pairTop(ctx, sx, g, ['.oo..', 'otbto', 'obtbo', 'btttb', 'ottto', 'ottto', '.ooo.', '.oo..'],
    // 大人の鼻緒のサンダル：茶色の縁どりの底（中敷きは明るい）に、指の股から左右へ分かれる紺の鼻緒
    { o: '#6a4a30', t: '#d8c098', b: '#3a4a7a' })),
  kutsu: T(7, (ctx, sx, g) => pair(ctx, sx, g, ['kkk.....', 'uuubbb..', 'uuuwbuu.', 'uuuuuuuh', 'ssssssss'],
    // 女の子の赤い靴：かかとの小さな口、甲を渡る濃い赤のストラップと金のボタン。光るつま先と、こげ茶の底
    { k: '#2a1010', u: '#d04030', b: '#7e2620', w: '#f0d060', h: '#f08a7a', s: '#4a2a20' })),
  kid_shoes: T(6, (ctx, sx, g) => pair(ctx, sx, g, ['kkk.....', 'uuulxl..', 'uuuuxlu.', 'uyyyyuuu', 'ssssssss'],
    // 子どもの運動靴：白い布の甲に、交差した靴紐と青い線。赤いゴムの底
    { k: '#3a3640', u: '#e8e4dc', l: '#7a8aa8', x: '#b0bccc', y: C.blue, s: '#c8504a' })),
  boots: T(12, (ctx, sx, g) => pair(ctx, sx, g, ['pkkkkk..', 'urrrrr..', 'huuuuu..', 'huuuuu..', 'huuuuu..', 'huuuuu..', 'huuuuuu.', 'huuuuuuu', 'huuuuuuh', 'ssssssss'],
    // 黄色い長靴：長い筒の口（中が暗い）と明るい縁取り、後ろのつまみ。左に光、つま先が丸く、黒っぽいゴムの底
    { k: '#3a2a08', p: '#a88a20', r: '#f4dc70', u: '#e0b830', h: '#f8e890', s: '#4a3a14' })),
  shoes_left: T(7, (ctx, sx, g) => pair(ctx, sx, g, ['.kkk......', 'uuuulxl...', 'uuuuuxlu..', 'uuuuuuuuuh', 'sss..sssss'],
    // 置いていかれた大人の革靴：かかとの口、交差した明るい靴紐、光るつま先。かかとと底の間に土踏まず
    { k: '#140c08', u: '#7a5034', l: '#e0d0b0', x: '#a08060', h: '#d0a070', s: '#1e1612' })),
  umbrella: T(20, (ctx, sx, g) => {
    // 巻いてとめた傘を立てかけてある：先の石突きから細長く広がる布（右にひだの陰）、留め紐、上で曲がる柄。
    // 布は一本のまっすぐな軸のまわりに、行ごとの幅だけ変えて描く
    const [x0, y0, x1, y1] = [sx - 4, g - 1, sx + 1, g - 15];
    const axis = (y: number) => x0 + ((y0 - y) / (y0 - y1)) * (x1 - x0);
    rect(ctx, x0, y0, 1, 1, C.metal);
    for (let y = y0 - 1; y >= y1; y--) {
      const t = (y0 - y) / (y0 - y1);
      const w = t < 0.15 ? 1 : t < 0.35 ? 2 : t < 0.85 ? 3 : 2;
      const x = Math.round(axis(y) - (w - 1) / 2);
      rect(ctx, x, y, w, 1, C.blue);
      if (w > 1) rect(ctx, x + w - 1, y, 1, 1, '#2a4a6a');
      if (Math.abs(t - 0.55) < 0.04) rect(ctx, x, y, w, 1, C.white);
    }
    for (let y = y1 - 1; y >= y1 - 3; y--) rect(ctx, Math.round(axis(y)), y, 1, 1, C.metalDark);
    const top = { x: Math.round(axis(y1 - 4)), y: y1 - 4 };
    rect(ctx, top.x, top.y, 4, 1, C.woodLight);
    rect(ctx, top.x + 3, top.y + 1, 1, 2, C.woodLight);
  }),
  umbrella_open: T(16, (ctx, sx, g) => {
    // 開いたまま転がった傘：一色の布を傾けて地面に伏せる。てっぺんから骨の筋が放射に走り、縁は骨と骨の間で
    // 内へくぼんで波打つ。左に光、縁の近くは内側の陰。布の内側から柄がまっすぐ突き出て、先が曲がる
    const cx = sx - 1;
    const cy = g - 6;
    const t = -0.35;
    const [c, n] = [Math.cos(t), Math.sin(t)];
    const RX = 8.5;
    const RY = 7;
    const ribs = 6;
    for (let dy = -10; dy <= 3; dy++) {
      for (let dx = -10; dx <= 10; dx++) {
        const along = dx * c + dy * n;
        const up = -dx * n + dy * c;
        if ((along / RX) ** 2 + (up / RY) ** 2 > 1) continue;
        // 縁のくぼみ：骨の先（縁の上で等しい間隔）から離れるほど、縁が上へ下がる
        const phase = ((along + RX) / (2 * RX)) * ribs;
        const dip = 1.6 * Math.sin(Math.PI * (phase - Math.floor(phase)));
        if (up > -dip) continue;
        const color = up > -dip - 1.2 ? '#6a2420' : along < -RX * 0.3 && up < -RY * 0.5 ? '#c85a4a' : '#a8453a';
        rect(ctx, cx + dx, cy + dy, 1, 1, color);
      }
    }
    const apex = { x: cx + Math.round(RY * n), y: cy - Math.round(RY * c) };
    for (let k = 0; k <= ribs; k++) {
      const along = -RX + (2 * RX * k) / ribs;
      const up = -Math.sqrt(Math.max(0, 1 - (along / RX) ** 2)) * RY * 0.25 - 0.5;
      plotLine(ctx, apex.x, apex.y, cx + Math.round(along * c - up * n), cy + Math.round(along * n + up * c), '#7e2e26');
    }
    rect(ctx, apex.x, apex.y - 1, 1, 2, C.metal);
    const shaft = { x: cx + Math.round(-n * 8), y: cy + Math.round(c * 8) };
    plotLine(ctx, cx, cy, shaft.x, shaft.y, C.metalDark);
    rect(ctx, shaft.x, shaft.y, 3, 1, C.woodLight);
    rect(ctx, shaft.x + 2, shaft.y - 2, 1, 2, C.woodLight);
  }),
  umbrella_stand: T(18, (ctx, sx, g) => {
    // 傘立て：金物の筒に、巻いた傘が3本。曲がった柄が上へ突き出る
    const umbrella = (x: number, top: number, color: string, shade: string) => {
      rect(ctx, x - 1, top, 3, 1, C.woodDark);
      rect(ctx, x - 1, top + 1, 1, 1, C.woodDark);
      rect(ctx, x + 1, top + 1, 1, 3, C.woodDark);
      rect(ctx, x + 1, top + 4, 1, 1, color);
      rect(ctx, x, top + 5, 3, 9, color);
      rect(ctx, x + 2, top + 5, 1, 9, shade);
    };
    umbrella(sx - 3, g - 18, C.blue, '#2a4a6a');
    umbrella(sx + 1, g - 17, '#b8c4cc', '#8a96a0');
    umbrella(sx - 1, g - 15, C.red, '#7e2620');
    rect(ctx, sx - 4, g - 8, 9, 8, C.metalDark);
    rect(ctx, sx - 4, g - 8, 1, 8, C.metal);
    rect(ctx, sx + 4, g - 8, 1, 8, C.lampPole);
    rect(ctx, sx - 4, g - 9, 9, 1, C.metal);
    rect(ctx, sx - 4, g - 4, 9, 1, C.lampPole);
  }),
  bucket: T(11, (ctx, sx, g) => bucket(ctx, sx, g, C.blue, '#34506c', C.waterLight)),
  bucket_water: T(11, (ctx, sx, g) => bucket(ctx, sx, g, C.metal, C.metalDark, C.waterLight)),
  leak_bucket: T(11, (ctx, sx, g, tickF) => {
    // 雨漏りを受けるバケツ：上から滴がすっと落ち、水面で小さくはねる
    bucket(ctx, sx, g, C.metalDark, C.lampPole, C.water);
    const t = tickF % 20;
    if (t < 4) rect(ctx, sx, g - 20 + Math.round(t * 3), 1, 2, C.waterLight);
    else if (t < 6) {
      rect(ctx, sx - 2, g - 9, 1, 1, C.waterLight);
      rect(ctx, sx + 2, g - 9, 1, 1, C.waterLight);
    }
  }),
  water_gauge: T(22, (ctx, sx, g, tickF) => {
    // 量水標：水に立てた白い板に、黒い目盛りと赤い印。足もとの水面に波紋
    const k = Math.floor(tickF / 8) % 2;
    fillEllipse(ctx, sx, g, 6 + k, 2, C.waterLight);
    fillEllipse(ctx, sx, g, 5 + k, 1, C.water);
    rect(ctx, sx - 2, g - 21, 4, 21, C.white);
    rect(ctx, sx + 1, g - 21, 1, 21, C.paperDark);
    for (let y = 1; y < 20; y += 2) rect(ctx, sx - 2, g - y - 1, y % 10 === 9 ? 3 : 2, 1, '#2a2830');
    for (const y of [5, 15]) rect(ctx, sx, g - y - 3, 2, 2, C.red);
    rect(ctx, sx - 2, g - 22, 4, 1, C.metal);
    rect(ctx, sx - 3, g - 1, 6, 1, C.waterLight);
  }, { foot: false }),
  gutter_overflow: T(26, (ctx, sx, g, tickF) => {
    // 雨どいからあふれる水：瓦の軒の切れ端の縁に沿って、半円の樋が掛かる。詰まった樋のまん中から、水が縁を越えて
    // 幕のように落ち、下ではね返る。樋の端から縦の樋が地面へ下りる
    const P = (u: number, v: number, h: number) => at(sx, g, u, v, h);
    block(ctx, sx, g, [-0.5, 0.5], [-0.5, -0.1], [21, 24], '#4a4e5c', '#363a46', '#2a2d38');
    block(ctx, sx, g, [-0.5, 0.5], [-0.1, 0.02], [19, 21], C.metal, C.metalDark, C.lampPole);
    line3(ctx, sx, g, [-0.5, 0.02, 21], [0.5, 0.02, 21], C.concreteTop);
    block(ctx, sx, g, [0.36, 0.44], [-0.08, 0.0], [0, 19], C.metal, C.metalDark, C.lampPole);
    for (const h of [6, 13]) line3(ctx, sx, g, [0.34, 0.0, h], [0.46, 0.0, h], C.lampPole);
    // あふれる水：樋の縁の一か所から、地面まで
    const top = P(-0.12, 0.02, 21);
    const foot = P(-0.12, 0.02, 0);
    rect(ctx, top.x - 2, top.y - 1, 4, 1, C.waterLight);
    for (let i = 0; i < 8; i++) {
      const k = (Math.floor(tickF * 1.5) + i * 3) % (foot.y - top.y);
      rect(ctx, top.x - 1 + (i % 3), top.y + k, 1, 2, C.waterLight);
    }
    fillEllipse(ctx, foot.x, foot.y, 5, 1, C.water);
    const f = Math.floor(tickF / 3) % 2;
    for (const [dx, dy] of [[-4, -1], [3, -2], [-2, -3], [2, 0]]) rect(ctx, foot.x + dx + f, foot.y + dy - f, 1, 1, C.white);
  }, { foot: false }),
  drip_marks: T(1, (ctx, sx, g) => {
    for (const [dx, dy] of [[-4, 0], [2, -1], [5, 1]]) rect(ctx, sx + dx, g + dy, 2, 1, C.waterLight);
  }, { foot: false }),
  puddle: T(1, (ctx, sx, g) => fillEllipse(ctx, sx, g, 6, 2, C.water), { foot: false }),
  broom: T(24, (ctx, sx, g) => {
    // 竹ぼうき：節のある竹の柄を斜めに立てかけ、根元を縄で束ねた細い枝が扇のように広がる。
    // 柄は一本のまっすぐな軸の上に、行ごとに2ドットの幅で描く（節も同じ軸の上）
    const [x0, y0, x1, y1] = [sx - 5, g - 24, sx, g - 10];
    for (let y = y0; y <= y1; y++) {
      const x = Math.round(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
      const node = [3, 8, 12].includes(y - y0);
      rect(ctx, x, y, 1, 1, node ? '#5a5430' : '#a8a060');
      rect(ctx, x + 1, y, 1, 1, node ? '#5a5430' : '#7a7440');
    }
    // 穂先は柄の軸の延長（地面との交わり）を中心に、扇のように開く
    const fx = Math.round(x1 + ((g - y1) / (y1 - y0)) * (x1 - x0));
    for (let k = -5; k <= 5; k++) plotLine(ctx, x1, y1 + 1, fx + k, g, k % 2 ? C.leafDry : '#5a4020');
    rect(ctx, x1 - 1, y1 - 1, 4, 3, '#6a4a2a');
    rect(ctx, x1 - 1, y1 - 1, 4, 1, '#8a6a3a');
  }),
  laundry_line: T(18, (ctx, sx, g) => clothesline(ctx, sx, g, [['shirt', -7, C.white], ['towel', -1, C.blue], ['sock', 4, '#c8504a'], ['sock', 7, '#c8504a']])),
  laundry: T(18, (ctx, sx, g) => clothesline(ctx, sx, g, [['shirt', -7, '#8a9aa8'], ['pants', -1, '#6a6458'], ['towel', 4, C.cloth]])),
  kite_on_wire: T(30, (ctx, sx, g) => {
    // 電線に引っかかった凧：電柱の腕木から電線がたるんで延び、ひし形の凧が糸でぶら下がって尾を垂らしている
    post(ctx, sx - 3, g, 30, C.lampPole, 2);
    rect(ctx, sx - 9, g - 27, 12, 1, C.lampPole);
    rect(ctx, sx - 8, g - 28, 1, 1, C.metal);
    rect(ctx, sx + 1, g - 28, 1, 1, C.metal);
    plotLine(ctx, sx - 8, g - 27, sx - 16, g - 25, C.metalDark);
    plotLine(ctx, sx + 1, g - 27, sx + 8, g - 24, C.metalDark);
    plotLine(ctx, sx + 8, g - 24, sx + 16, g - 26, C.metalDark);
    // 凧：上が短く下が長いひし形。骨（縦と横）が透ける
    const kx = sx + 8;
    const ky = g - 21;
    rect(ctx, kx, g - 23, 1, 2, C.paperDark);
    const half = [0, 1, 2, 3, 3, 2, 2, 1, 1, 0];
    half.forEach((w, r) => rect(ctx, kx - w, ky + r, w * 2 + 1, 1, r < 4 ? C.red : '#a83a30'));
    rect(ctx, kx, ky + 1, 1, 8, '#e0b0a0');
    rect(ctx, kx - 2, ky + 3, 5, 1, '#e0b0a0');
    // 尾：折れ曲がりながら垂れ、ところどころに結んだ紙
    const tail: [number, number][] = [[kx, ky + 10], [kx - 2, ky + 13], [kx + 1, ky + 16], [kx - 1, ky + 19]];
    for (let i = 1; i < tail.length; i++) plotLine(ctx, tail[i - 1][0], tail[i - 1][1], tail[i][0], tail[i][1], C.paperDark);
    for (const [x, y] of tail.slice(1)) rect(ctx, x - 1, y, 3, 1, C.yellow);
  }),
  kite_tangled: T(14, (ctx, sx, g) => {
    // 落ちた凧：屋根の上に、傾いたひし形の凧（縦と横の骨）。尾は結んだ紙を三つつけて垂れ、ゆるんだ糸が一本のびる
    plotLine(ctx, sx + 1, g - 12, sx + 9, g - 3, C.paperDark);
    const half = [0, 1, 2, 3, 4, 3, 3, 2, 2, 1, 1, 0];
    const x0 = sx - 3;
    const y0 = g - 15;
    half.forEach((w, r) => rect(ctx, x0 + Math.floor(r / 3) - w, y0 + r, w * 2 + 1, 1, r < 5 ? C.yellow : '#b8942e'));
    plotLine(ctx, x0, y0 + 1, x0 + 3, y0 + 10, '#e8d8a0');
    rect(ctx, x0 - 3, y0 + 4, 8, 1, '#e8d8a0');
    const tail: [number, number][] = [[x0 + 3, y0 + 11], [x0 + 1, y0 + 13], [x0 - 2, y0 + 14], [x0 - 5, y0 + 14]];
    for (let i = 1; i < tail.length; i++) plotLine(ctx, tail[i - 1][0], tail[i - 1][1], tail[i][0], tail[i][1], C.paperDark);
    for (const [x, y] of tail.slice(1)) rect(ctx, x - 1, y - 1, 2, 2, C.red);
  }),
  sofa: T(14, (ctx, sx, g) => {
    // 捨てられたソファ（左下を向く）：奥に背もたれ、座面のクッション（まん中に継ぎ目）、両わきの肘掛け
    const [top, left, right] = ['#7a5646', '#5a3e30', '#3e2a20'];
    block(ctx, sx, g, [-0.45, 0.45], [-0.42, -0.18], [0, 12], top, left, right);
    block(ctx, sx, g, [-0.45, -0.3], [-0.18, 0.4], [0, 8], top, left, right);
    block(ctx, sx, g, [-0.3, 0.3], [-0.18, 0.4], [0, 5], '#8a6452', left, right);
    line3(ctx, sx, g, [0, -0.18, 5], [0, 0.4, 5], right);
    block(ctx, sx, g, [0.3, 0.45], [-0.18, 0.4], [0, 8], top, left, right);
  }, { foot: false }),
  sofa_back: T(14, (ctx, sx, g) => {
    // 後ろから見たソファ（右上を向く。sofa と向かい合わせに置く）：手前に背もたれの裏（布の張り目と短い脚）、
    // その向こうに肘掛けと座面
    const [top, left, right] = ['#7a5646', '#5a3e30', '#3e2a20'];
    block(ctx, sx, g, [-0.45, -0.3], [-0.4, 0.18], [0, 8], top, left, right);
    block(ctx, sx, g, [-0.3, 0.3], [-0.4, 0.18], [0, 5], '#8a6452', left, right);
    block(ctx, sx, g, [0.3, 0.45], [-0.4, 0.18], [0, 8], top, left, right);
    block(ctx, sx, g, [-0.45, 0.45], [0.18, 0.42], [1, 12], top, left, right);
    line3(ctx, sx, g, [-0.4, 0.42, 9], [0.4, 0.42, 9], '#4a3226');
    line3(ctx, sx, g, [0, 0.42, 2], [0, 0.42, 9], '#4a3226');
    for (const u of [-0.42, 0.4]) line3(ctx, sx, g, [u, 0.4, 0], [u, 0.4, 1], C.woodDark);
  }, { foot: false }),
  seat: T(5, (ctx, sx, g) => {
    // 座布団：ふっくらした四角い布団。四隅に房、まん中に綴じ糸
    block(ctx, sx, g, [-0.25, 0.25], [-0.25, 0.25], [0, 3], '#8a5a4a', '#5a3a2e', '#4a2e24');
    const c = at(sx, g, 0, 0, 3);
    rect(ctx, c.x, c.y, 1, 1, '#c8a060');
    for (const [u, v] of [[-0.25, 0.25], [0.25, 0.25], [0.25, -0.25]]) {
      const p = at(sx, g, u, v, 2);
      rect(ctx, p.x, p.y, 1, 1, '#c8a060');
    }
  }),
  seat_snow: T(7, (ctx, sx, g) => {
    // 雪をかぶった座布団：ふっくらした雪の山が布団を覆い、縁からだけ布の色がのぞく
    block(ctx, sx, g, [-0.25, 0.25], [-0.25, 0.25], [0, 3], '#8a5a4a', '#5a3a2e', '#4a2e24');
    const c = at(sx, g, 0, 0, 3);
    fillEllipse(ctx, c.x, c.y, 6, 2, C.snowShade);
    fillEllipse(ctx, c.x, c.y - 1, 5, 2, C.snow);
    fillEllipse(ctx, c.x - 1, c.y - 2, 3, 1, '#ffffff');
    rect(ctx, c.x + 3, c.y - 1, 1, 1, C.snowShade);
  }),
  telescope: T(18, (ctx, sx, g) => {
    // 三脚の上の望遠鏡：太い筒が斜め上を向き、先にひさしとレンズの光、手前の端に接眼鏡。筒の上に小さなファインダー
    plotLine(ctx, sx, g - 9, sx - 5, g, C.metalDark);
    plotLine(ctx, sx, g - 9, sx + 5, g, C.metalDark);
    plotLine(ctx, sx, g - 9, sx + 1, g + 1, C.lampPole);
    rect(ctx, sx - 1, g - 11, 3, 2, C.lampPole);
    plotLine(ctx, sx - 6, g - 10, sx + 6, g - 16, '#c8ccd2');
    plotLine(ctx, sx - 6, g - 9, sx + 6, g - 15, C.metal);
    plotLine(ctx, sx - 6, g - 8, sx + 6, g - 14, C.metalDark);
    rect(ctx, sx + 6, g - 18, 3, 6, C.lampPole);
    rect(ctx, sx + 8, g - 17, 1, 3, '#9ad0e8');
    rect(ctx, sx - 8, g - 10, 2, 3, C.lampPole);
    plotLine(ctx, sx - 2, g - 13, sx + 2, g - 15, C.lampPole);
  }),
  telescope_snow: T(18, (ctx, sx, g) => {
    // 三脚の上の望遠鏡：太い筒が斜め上を向き、先にひさしとレンズの光、手前の端に接眼鏡。筒の上に小さなファインダー
    plotLine(ctx, sx, g - 9, sx - 5, g, C.metalDark);
    plotLine(ctx, sx, g - 9, sx + 5, g, C.metalDark);
    plotLine(ctx, sx, g - 9, sx + 1, g + 1, C.lampPole);
    rect(ctx, sx - 1, g - 11, 3, 2, C.lampPole);
    plotLine(ctx, sx - 6, g - 10, sx + 6, g - 16, '#c8ccd2');
    plotLine(ctx, sx - 6, g - 9, sx + 6, g - 15, C.metal);
    plotLine(ctx, sx - 6, g - 8, sx + 6, g - 14, C.metalDark);
    rect(ctx, sx + 6, g - 18, 3, 6, C.lampPole);
    rect(ctx, sx + 8, g - 17, 1, 3, '#9ad0e8');
    rect(ctx, sx - 8, g - 10, 2, 3, C.lampPole);
    plotLine(ctx, sx - 2, g - 13, sx + 2, g - 15, C.lampPole);
    // 筒の上とひさしに積もった雪（上がふくらみ、下は陰）、三脚の足もとの雪だまり
    plotLine(ctx, sx - 5, g - 11, sx + 5, g - 17, C.snow);
    plotLine(ctx, sx - 4, g - 12, sx + 4, g - 17, C.snow);
    plotLine(ctx, sx - 3, g - 13, sx + 2, g - 16, '#ffffff');
    snowCap(ctx, sx + 6, g - 18, 3);
    rect(ctx, sx - 1, g - 12, 3, 1, C.snow);
    fillEllipse(ctx, sx, g, 7, 2, C.snowShade);
    fillEllipse(ctx, sx - 1, g - 1, 6, 1, C.snow);
  }),
  basket_empty: T(14, (ctx, sx, g) => {
    // 空の籠：上から中の暗い底がのぞき、胴は編み目（明暗の互い違い）、上の縁は太く巻いてある。上に持ち手の弧
    fillEllipse(ctx, sx, g - 9, 5, 2, '#2a1e14');
    for (let r = 0; r < 8; r++) {
      const w = 11 - Math.floor(r / 3) * 2;
      const x = sx - Math.floor(w / 2);
      for (let c = 0; c < w; c++) rect(ctx, x + c, g - 8 + r, 1, 1, (c + (r >> 1)) % 2 ? '#7a5a30' : '#a8804a');
    }
    rect(ctx, sx - 6, g - 9, 12, 1, '#b8905a');
    rect(ctx, sx - 6, g - 8, 12, 1, '#8a6a3a');
    plotLine(ctx, sx - 5, g - 9, sx - 3, g - 14, '#8a6a3a');
    rect(ctx, sx - 3, g - 15, 7, 1, '#a8804a');
    plotLine(ctx, sx + 4, g - 14, sx + 5, g - 9, '#7a5a30');
  }),
  kitchen_dark: T(22, (ctx, sx, g, _t, face) => {
    // 明かりの消えた勝手口：すりガラスの入った戸が半分開いて、奥の暗い台所がのぞく。わきに小窓。上に軒
    wallPiece(ctx, sx, g, 20, face,
      { color: C.woodDark, from: 0, to: 15, i0: 2, i1: 9 },
      { color: C.bg, from: 1, to: 14, i0: 3, i1: 8 },
      { color: '#4a4048', from: 1, to: 14, i0: 3, i1: 5 },
      { color: '#6a6670', from: 7, to: 13, i0: 3, i1: 5 },
      { color: C.metal, from: 6, to: 7, i0: 4, i1: 5 },
      { color: C.woodDark, from: 9, to: 14, i0: 9, i1: 11 },
      { color: '#5a5660', from: 10, to: 13, i0: 9, i1: 10 });
    eave(ctx, sx, g, 20);
  }, { foot: false }),
  step: T(10, (ctx, sx, g) => {
    // 勝手口の踏み台：木の箱を二段に重ねた台。板の継ぎ目と、踏まれてすり減った白っぽい所
    block(ctx, sx, g, [-0.3, 0.3], [-0.25, 0.25], [0, 4], C.woodLight, C.wood, C.woodDark);
    block(ctx, sx, g, [-0.3, 0.3], [-0.25, 0.0], [4, 8], C.woodLight, C.wood, C.woodDark);
    line3(ctx, sx, g, [-0.3, 0.25, 2], [0.3, 0.25, 2], C.woodDark);
    line3(ctx, sx, g, [-0.3, 0, 6], [0.3, 0, 6], C.woodDark);
    for (const [u, v, h] of [[0, -0.12, 8], [0.05, 0.12, 4]]) {
      const p = at(sx, g, u, v, h);
      rect(ctx, p.x - 1, p.y, 3, 1, '#8a7458');
    }
  }),
  height_marks: T(26, (ctx, sx, g) => {
    // 柱の背くらべ：木の柱に、背の高さを刻んだ横の傷が何本も。下のほうに色あせた星のシールが一枚
    rect(ctx, sx - 2, g - 26, 5, 26, C.woodLight);
    rect(ctx, sx - 2, g - 26, 1, 26, '#7a6248');
    rect(ctx, sx + 2, g - 26, 1, 26, C.wood);
    rect(ctx, sx, g - 22, 1, 6, '#4e3c2c');
    for (const y of [11, 13, 16, 18, 21]) {
      rect(ctx, sx - 2, g - y, 4, 1, '#2a1e16');
      rect(ctx, sx + 2, g - y, 2, 1, '#2a1e16');
    }
    rect(ctx, sx - 1, g - 7, 3, 3, '#c89a6a');
    rect(ctx, sx, g - 8, 1, 5, '#c89a6a');
    rect(ctx, sx - 2, g - 6, 5, 1, '#c89a6a');
    rect(ctx, sx, g - 6, 1, 1, '#e8c890');
  }),
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
  leaf: T(3, (ctx, sx, g) => {
    // 落ち葉：楓や楕円の葉が、色も向きもばらばらに散る
    for (const [dx, dy, k] of [[-6, -1, 0], [-1, -2, 1], [3, 0, 2], [-3, 1, 3]]) fallenLeaf(ctx, sx + dx, g + dy, k);
  }, { foot: false }),
  leaves: T(3, (ctx, sx, g) => {
    // 落ち葉：吹き寄せられた葉が重なり合う
    for (const [dx, dy, k] of [[-8, 0, 3], [-5, -2, 0], [-1, -1, 1], [2, -3, 2], [4, 0, 4], [-3, 1, 5], [6, -2, 6]]) fallenLeaf(ctx, sx + dx, g + dy, k);
  }, { foot: false }),
  leaves_pile: T(8, (ctx, sx, g) => {
    // 落ち葉の山：掃き集めた葉が小山になる。下は暗い茶色、上に色とりどりの葉が積み重なる
    fillEllipse(ctx, sx, g - 3, 8, 3, '#4a3420');
    fillEllipse(ctx, sx, g - 4, 6, 2, '#6a4a2a');
    for (const [dx, dy, k] of [[-8, -3, 1], [-5, -5, 2], [-2, -7, 0], [1, -6, 3], [4, -4, 4], [-4, -2, 5], [2, -3, 6], [5, -2, 7], [-1, -4, 8]]) {
      fallenLeaf(ctx, sx + dx, g + dy, k);
    }
  }),
  cicada: T(16, (ctx, sx, g) => {
    // 蝉の抜け殻：木の幹（樹皮の筋）にしがみついた、透けた飴色の殻を上から見る。左右にとび出した大きな目、
    // ふくらんだ背（まっすぐ割れている）、節のある腹、幹をつかむ6本の脚
    rect(ctx, sx - 3, g - 16, 6, 16, '#4a3a2c');
    rect(ctx, sx - 3, g - 16, 1, 16, '#5e4c3a');
    for (const [x, y, h] of [[-1, -15, 4], [1, -9, 5], [-2, -5, 3], [2, -14, 3]]) rect(ctx, sx + x, g + y, 1, h, '#3a2c20');
    sprite(ctx, sx - 4, g - 13, ['l.....l', 'eaaaaae', '.ahkha.', 'laakaal', '.aaaaa.', 'laasaal', '.aaaaa.', '..asa..', '...a...'], {
      a: '#a0702e', h: '#d8a858', k: '#3a2410', l: '#6a4a20', e: '#5a3a18', s: '#7a5222',
    });
  }),
  sudare: T(22, (ctx, sx, g) => {
    // すだれ：軒の横木から2本の紐で吊るした、細い葦を横に並べて編んだ簾。縦に編み糸、すき間から闇が透ける。
    // 裾は少し巻き上げて、赤い紐で留めてある
    rect(ctx, sx - 8, g - 23, 17, 2, C.woodDark);
    for (const dx of [-5, 5]) rect(ctx, sx + dx, g - 21, 1, 2, C.metal);
    rect(ctx, sx - 7, g - 19, 15, 1, C.woodLight);
    for (let y = 0; y < 13; y++) rect(ctx, sx - 6, g - 18 + y, 13, 1, y % 2 ? '#4a3e24' : '#a8935a');
    for (const dx of [-4, 0, 4]) rect(ctx, sx + dx, g - 18, 1, 13, '#5a4628');
    rect(ctx, sx - 7, g - 5, 15, 2, '#c0a868');
    rect(ctx, sx - 7, g - 4, 15, 1, '#8a7440');
    for (const dx of [-4, 4]) rect(ctx, sx + dx, g - 6, 1, 4, '#9a3a2a');
  }, { foot: false }),
  furin: T(18, (ctx, sx, g, tickF) => {
    rect(ctx, sx, g - 22, 1, 4, C.lampPole);
    fillEllipse(ctx, sx, g - 16, 3, 2, C.glass);
    rect(ctx, sx + Math.round(Math.sin(tickF * 0.3)), g - 13, 1, 4, C.paper);
  }),
  katorisenko: T(10, (ctx, sx, g, tickF) => {
    // 蚊取り線香：金物の皿の上の、渦を巻いた緑の線香（巻きの間から皿がのぞく）。外の端に赤い火と灰、
    // そこから細い煙がゆらぎながら上る
    fillEllipse(ctx, sx, g - 1, 8, 2, C.metalDark);
    fillEllipse(ctx, sx, g - 2, 7, 2, C.metal);
    const cx = sx;
    const cy = g - 6;
    let last: { x: number; y: number } | null = null;
    let end = { x: cx, y: cy };
    for (let t = 0.6; t <= 15.5; t += 0.15) {
      const r = t * 0.4;
      const q = { x: Math.round(cx + Math.cos(t) * r), y: Math.round(cy + Math.sin(t) * r * 0.75) };
      if (last) plotLine(ctx, last.x, last.y, q.x, q.y, Math.sin(t) > 0.3 ? '#2a4a2a' : '#4a7a40');
      last = q;
      end = q;
    }
    rect(ctx, cx, cy, 1, 1, C.lampPole);
    rect(ctx, end.x, end.y, 1, 1, '#e8603a');
    rect(ctx, end.x - 1, end.y, 1, 1, C.paperDark);
    for (let i = 0; i < 5; i++) {
      const y = end.y - 2 - i * 2 - (Math.floor(tickF / 3) % 2);
      rect(ctx, end.x + Math.round(Math.sin(tickF * 0.15 + i) * 1.5), y, 1, 2, C.paperDark);
    }
  }),
  icicle: T(20, (ctx, sx, g, tickF) => {
    // つらら：雪の厚く積もった軒先から、長さの違うつららが何本も下がる。根元は太く先は細く、左に光の筋、
    // 右に青い陰。いちばん長い先から、ときどき滴が落ちる
    rect(ctx, sx - 10, g - 20, 21, 2, '#363a46');
    rect(ctx, sx - 11, g - 22, 23, 2, C.snow);
    rect(ctx, sx - 10, g - 23, 20, 1, C.snow);
    rect(ctx, sx - 7, g - 24, 6, 1, C.snow);
    rect(ctx, sx + 2, g - 24, 5, 1, C.snow);
    rect(ctx, sx - 5, g - 24, 1, 1, '#ffffff');
    rect(ctx, sx - 11, g - 20, 23, 1, C.snowShade);
    for (const [dx, len] of [[-8, 6], [-5, 11], [-2, 7], [1, 14], [4, 8], [7, 5]]) {
      for (let y = 0; y < len; y++) {
        const w = y < len * 0.3 ? 3 : y < len * 0.7 ? 2 : 1;
        const x = sx + dx - Math.floor(w / 2);
        rect(ctx, x, g - 19 + y, w, 1, '#c8dce8');
        if (w > 1) {
          rect(ctx, x, g - 19 + y, 1, 1, '#f0f8ff');
          rect(ctx, x + w - 1, g - 19 + y, 1, 1, '#8aa0b4');
        }
      }
    }
    const drop = Math.floor(tickF) % 16;
    if (drop < 6) rect(ctx, sx + 1, g - 5 + drop, 1, 1, '#c8dce8');
  }, { foot: false }),
  buried_pole: T(16, (ctx, sx, g) => {
    // 雪に埋もれたポール：赤と白に塗り分けた道の目印の棒が、雪の吹きだまりから斜めに突き出す。頭にも雪がのる
    fillEllipse(ctx, sx, g - 1, 9, 3, C.snowShade);
    fillEllipse(ctx, sx - 1, g - 2, 8, 2, C.snow);
    for (let r = 0; r < 14; r++) {
      const x = sx - 1 + Math.round(r * 0.3);
      rect(ctx, x, g - 3 - r, 2, 1, Math.floor(r / 3) % 2 ? C.white : C.red);
      rect(ctx, x + 1, g - 3 - r, 1, 1, Math.floor(r / 3) % 2 ? C.paperDark : '#7e2620');
    }
    rect(ctx, sx + 2, g - 17, 3, 1, C.snow);
    fillEllipse(ctx, sx - 3, g - 1, 5, 1, C.snow);
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
    // 壁に掛けたままの古いカレンダー：釘から紐で斜めに下がった、黄ばんだ紙の束（下と右に重なった紙の厚み）。
    // 上に色あせた赤い綴じの帯とリング、日付の升目はかすれ、ひとつに赤い丸。右下の角がめくれている
    rect(ctx, sx, g - 32, 1, 1, C.metal);
    plotLine(ctx, sx, g - 31, sx - 3, g - 28, C.paperDark);
    plotLine(ctx, sx, g - 31, sx + 3, g - 27, C.paperDark);
    const row = (r: number) => ({ x: sx - 5 + Math.floor(r / 4), y: g - 28 + r });
    for (const [k, color] of [[2, '#5a5244'], [1, '#7a705c']] as [number, string][]) {
      for (let r = 0; r < 12; r++) rect(ctx, row(r).x + k, row(r).y + k, 9, 1, color);
    }
    for (let r = 0; r < 12; r++) {
      const { x, y } = row(r);
      rect(ctx, x, y, r === 11 ? 7 : 9, 1, r < 3 ? '#8a3a30' : '#c8bc9a');
    }
    for (const dx of [2, 6]) rect(ctx, row(0).x + dx, row(0).y - 1, 1, 2, C.metal);
    for (const r of [5, 7, 9]) rect(ctx, row(r).x + 1, row(r).y, 7, 1, '#a89c7a');
    for (let r = 4; r < 11; r++) for (const dx of [3, 6]) rect(ctx, row(r).x + dx, row(r).y, 1, 1, '#a89c7a');
    rect(ctx, row(6).x + 4, row(6).y, 2, 1, '#b04a3a');
    rect(ctx, row(8).x + 1, row(8).y, 2, 2, '#a89870');
    rect(ctx, row(10).x + 7, row(10).y, 2, 1, '#e0d6b8');
    rect(ctx, row(11).x + 7, row(11).y, 1, 1, '#e0d6b8');
  }, { foot: false }),
  fridge_open: T(26, (ctx, sx, g) => {
    // 開いたままの冷蔵庫：上は冷凍室の扉（取っ手つき）、下の扉は開いたまま。まだ灯る庫内灯が棚に残った瓶を照らし、
    // 床へ光が漏れる。開いた扉の内側にも棚
    const P = (u: number, v: number, h: number) => at(sx, g, u, v, h);
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * 0.22;
    fillQuad(ctx, [P(-0.25, 0.3, 0), P(0.28, 0.3, 0), P(0.45, 1.0, 0), P(-0.2, 1.0, 0)], C.lampLight);
    ctx.globalAlpha = a;
    block(ctx, sx, g, [-0.3, 0.3], [-0.3, 0.3], [0, 24], C.white, C.paperDark, C.dust);
    fillQuad(ctx, [P(-0.26, 0.3, 1), P(0.26, 0.3, 1), P(0.26, 0.3, 15), P(-0.26, 0.3, 15)], '#d8c890');
    for (const h of [5, 10]) line3(ctx, sx, g, [-0.26, 0.3, h], [0.26, 0.3, h], '#9a8a5a');
    for (const [u, h, color] of [[-0.18, 6, '#6a8a5a'], [-0.05, 6, '#b8603a'], [0.12, 11, '#e8e4dc'], [-0.15, 11, '#8a6a9a']] as [number, number, string][]) {
      const p = P(u, 0.3, h);
      rect(ctx, p.x, p.y - 3, 2, 3, color);
    }
    line3(ctx, sx, g, [-0.3, 0.3, 16], [0.3, 0.3, 16], C.dust);
    line3(ctx, sx, g, [0.22, 0.3, 18], [0.22, 0.3, 21], C.metalDark);
    block(ctx, sx, g, [-0.34, -0.29], [0.3, 0.74], [1, 15], C.white, C.paperDark, C.paper);
    for (const h of [5, 10]) line3(ctx, sx, g, [-0.29, 0.36, h], [-0.29, 0.7, h], C.paperDark);
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
  slide: T(24, (ctx, sx, g) => {
    // すべり台：奥の梯子（2本の手すりと段）を上ると小さな踊り場と囲いの手すり。そこから手前へ金属の滑る面が下りて、
    // 裾が平らに伸びる。滑る面の両側に低い縁
    const P = (u: number, v: number, h: number) => at(sx, g, u, v, h);
    for (const v of [-0.12, 0.12]) line3(ctx, sx, g, [-0.48, v, 0], [-0.4, v, 18], C.rust);
    for (const h of [4, 8, 12, 16]) {
      const u = -0.48 + (h / 18) * 0.08;
      line3(ctx, sx, g, [u, -0.12, h], [u, 0.12, h], C.rustDark);
    }
    block(ctx, sx, g, [-0.42, -0.22], [-0.14, 0.14], [17, 18], '#9a5a3a', C.rust, C.rustDark);
    for (const v of [-0.14, 0.14]) {
      line3(ctx, sx, g, [-0.42, v, 18], [-0.42, v, 23], C.rust);
      line3(ctx, sx, g, [-0.42, v, 23], [-0.24, v, 21], C.rust);
    }
    line3(ctx, sx, g, [0.3, 0, 0], [0.3, 0, 4], C.metalDark);
    fillQuad(ctx, [P(-0.22, -0.12, 18), P(-0.22, 0.12, 18), P(0.32, 0.12, 4), P(0.32, -0.12, 4)], C.metal);
    fillQuad(ctx, [P(0.32, -0.12, 4), P(0.32, 0.12, 4), P(0.5, 0.12, 3), P(0.5, -0.12, 3)], C.metal);
    line3(ctx, sx, g, [-0.2, 0, 18], [0.48, 0, 3], '#c8ccd2');
    for (const v of [-0.13, 0.13]) {
      line3(ctx, sx, g, [-0.22, v, 20], [0.32, v, 6], C.metalDark);
      line3(ctx, sx, g, [0.32, v, 6], [0.5, v, 4], C.metalDark);
    }
  }),
  drinking_fountain: T(18, (ctx, sx, g, tickF) => {
    // 公園の水飲み場：小石の混じった洗い出しのコンクリートの柱に、浅い受け皿。上向きの蛇口から水が弧を描いて
    // 受け皿へ落ちる。足もとは水がこぼれて黒くしみる
    fillEllipse(ctx, sx, g + 1, 7, 2, '#2a3440');
    block(ctx, sx, g, [-0.15, 0.15], [-0.15, 0.15], [0, 12], C.concreteTop, C.concrete, C.wallR);
    for (const [u, v, h, color] of [[-0.05, 0.15, 3, '#8a857c'], [0.1, 0.15, 8, '#8a857c'], [0.15, 0.05, 5, '#3e3b36'], [-0.1, 0.15, 10, '#3e3b36'], [0.15, -0.08, 9, '#8a857c']] as [number, number, number, string][]) {
      const p = at(sx, g, u, v, h);
      rect(ctx, p.x, p.y, 1, 1, color);
    }
    block(ctx, sx, g, [-0.32, 0.32], [-0.32, 0.32], [12, 15], C.concreteTop, C.concrete, C.wallR);
    const P = (u: number, v: number, h: number) => at(sx, g, u, v, h);
    fillQuad(ctx, [P(-0.24, -0.24, 15), P(0.24, -0.24, 15), P(0.24, 0.24, 15), P(-0.24, 0.24, 15)], '#3a3832');
    fillQuad(ctx, [P(-0.18, -0.1, 15), P(0.18, -0.1, 15), P(0.18, 0.2, 15), P(-0.18, 0.2, 15)], '#3a5a6a');
    const n = P(-0.05, -0.12, 15);
    rect(ctx, n.x, n.y - 3, 1, 3, C.metal);
    rect(ctx, n.x, n.y - 4, 2, 1, C.metal);
    for (let i = 0; i < 5; i++) {
      const t = ((tickF / 6 + i / 5) % 1);
      rect(ctx, Math.round(n.x + 1 + t * 5), Math.round(n.y - 4 - Math.sin(Math.PI * t) * 4 + t * 3), 1, 1, C.waterLight);
    }
  }),
  dust: T(10, (ctx, sx, g, tickF) => {
    // 床の埃：ふわふわした灰色の塊が二つ三つ。上を細かな埃が舞う
    fluff(ctx, sx - 2, g, 4, 2);
    fluff(ctx, sx + 4, g + 1, 2, 1);
    fluff(ctx, sx - 6, g + 1, 2, 1);
    motes(ctx, sx, g, tickF, 4);
  }, { foot: false }),
  dust_pile: T(12, (ctx, sx, g, tickF) => {
    // 吹き寄せられた埃の山：綿ぼこりの小山に、紙の切れ端と糸くずが絡む。上を細かな埃が舞う
    fluff(ctx, sx, g, 7, 3);
    rect(ctx, sx + 2, g - 6, 3, 1, C.paper);
    rect(ctx, sx + 3, g - 5, 2, 1, C.paperDark);
    plotLine(ctx, sx - 5, g - 4, sx - 1, g - 7, '#2e2a26');
    motes(ctx, sx, g, tickF, 6);
  }),
  weed: T(12, (ctx, sx, g) => {
    // 道ばたの雑草：地面に張りつくぎざぎざの葉が放射に広がり、まん中から細い茎。黄色い花と、白い綿毛の玉。枯れた葉が一枚
    for (const [dx, dy, color] of [[-4, -1, '#3e5a2c'], [4, -1, '#3e5a2c'], [-2, 0, '#56723a'], [2, 0, '#4a6634'], [0, -2, '#2e4424']] as [number, number, string][]) {
      fillEllipse(ctx, sx + dx, g + dy, 3, 1, color);
      rect(ctx, sx + dx + (dx < 0 ? -3 : 3), g + dy - 1, 1, 1, color);
    }
    blade(ctx, sx, g - 1, 0, 9, -2, '#5a6a3a');
    blade(ctx, sx, g - 1, 1, 7, 3, '#5a6a3a');
    blade(ctx, sx, g, -3, 5, -3, '#8a7a4a');
    rect(ctx, sx - 3, g - 11, 3, 2, C.yellow);
    rect(ctx, sx - 2, g - 12, 1, 1, C.yellow);
    rect(ctx, sx - 2, g - 11, 1, 1, '#a07a20');
    fillEllipse(ctx, sx + 4, g - 9, 2, 2, '#c8c4b8');
    rect(ctx, sx + 4, g - 9, 1, 1, '#e8e4dc');
  }, { foot: false }),
  tallgrass: T(18, (ctx, sx, g) => {
    // 伸びた草むら：長さも向きもばらばらの葉に、枯れた葉がまじる。何本かの穂（エノコログサ）が重く垂れる
    const blades: [number, number, number, string][] = [[-5, 10, -4, '#3e5228'], [-4, 14, -2, '#4b5a32'], [-2, 16, 2, '#5a6a3a'], [-1, 11, -3, '#6a7442'],
      [0, 17, 1, '#4b5a32'], [1, 13, 4, '#8a7a4a'], [2, 15, 3, '#3e5228'], [3, 11, 5, '#5a6a3a'], [4, 8, 3, '#7a6a3a'], [5, 12, -1, '#4b5a32'], [-3, 7, -4, '#6a7442']];
    // 根元は株の中でばらつかせ（奥の葉ほど上）、暗い株元で隠す
    fillEllipse(ctx, sx, g, 6, 2, '#2a3420');
    blades.forEach(([dx, h, bend, color], k) => blade(ctx, sx, g + [0, -1, 1, -2, 0, 1, -1, 2, 0, -1, 1][k], dx, h, bend, color));
    for (const [dx, dy, color] of [[-4, 1, '#3e5228'], [2, 2, '#4b5a32'], [5, 0, '#3e5228'], [-1, 2, '#5a6a3a']] as [number, number, string][]) {
      blade(ctx, sx, g + dy, dx, 3, dx > 0 ? 1 : -1, color);
    }
    for (const [dx, h, bend] of [[-2, 16, 2], [0, 17, 1], [-4, 14, -2]]) {
      const x = sx + dx + bend;
      rect(ctx, x - 1, g - h - 3, 2, 4, '#a0a060');
      rect(ctx, x - 1, g - h - 3, 1, 1, '#c8c88a');
    }
  }),
  grassclump: T(12, (ctx, sx, g) => {
    // 草の株：根元の暗い茂みから、細い葉が四方へ弧を描いて垂れる。外側の葉の先は枯れて色が抜ける
    fillEllipse(ctx, sx, g - 1, 6, 2, '#2e3a22');
    const blades: [number, number, number, string][] = [[-5, 6, -4, '#6a7442'], [-4, 9, -3, '#4b5a32'], [-2, 11, -2, '#5a6a3a'], [-1, 8, -1, '#3e5228'],
      [0, 12, 0, '#4b5a32'], [1, 9, 2, '#5a6a3a'], [2, 11, 3, '#3e5228'], [4, 8, 4, '#6a7442'], [5, 6, 4, '#8a7a4a']];
    blades.forEach(([dx, h, bend, color], k) => {
      // 根元は株の中でばらつかせ（奥の葉ほど上）
      const base = g - 1 + [1, -1, 0, -2, -1, 0, -2, 1, 0][k];
      blade(ctx, sx, base, dx, h, bend, color);
      if (Math.abs(dx) >= 4) rect(ctx, sx + dx + bend, base - h, 1, 1, '#a89a6a');
    });
    for (const [dx, color] of [[-3, '#3e5228'], [0, '#4b5a32'], [3, '#3e5228']] as [number, string][]) blade(ctx, sx, g + 1, dx, 3, dx, color);
  }, { foot: false }),
  ivy: T(20, (ctx, sx, g) => {
    // ツタの絡んだ杭：古い木の杭（切り口と木目）に、つるが巻きつきながら上る。三つに分かれた葉が重なり、
    // 色は濃い緑・明るい緑・紅葉しかけた赤。先は杭から垂れ下がる
    rect(ctx, sx - 2, g - 18, 4, 18, '#4a3a2c');
    rect(ctx, sx - 2, g - 18, 1, 18, '#5e4c3a');
    rect(ctx, sx - 2, g - 19, 4, 1, '#7a6650');
    rect(ctx, sx, g - 15, 1, 5, '#3a2c20');
    const vine: [number, number][] = [[2, 0], [-2, -5], [2, -9], [-2, -13], [1, -17], [4, -19], [6, -14]];
    for (let i = 1; i < vine.length; i++) plotLine(ctx, sx + vine[i - 1][0], g + vine[i - 1][1], sx + vine[i][0], g + vine[i][1], '#3a4a24');
    const colors = [C.leaf, C.leafLight, '#5a7a3a', '#8a4a2a'];
    for (const [k, [dx, dy]] of [[-4, -3], [2, -6], [-4, -10], [2, -12], [-3, -16], [3, -19], [5, -15], [6, -11], [-1, -1]].entries()) {
      sprite(ctx, sx + dx - 1, g + dy - 1, ['x.x', 'xxx', '.x.'], { x: colors[k % colors.length] });
      rect(ctx, sx + dx - 1, g + dy - 1, 1, 1, dim(colors[k % colors.length], 1.3));
    }
  }),
  drum_rust: T(18, (ctx, sx, g) => {
    // 錆びたドラム缶：丸い胴（左が明るく右が暗い）を一周する2本のたが、上のふたの縁と栓。塗装（青）はほとんど錆に食われ、
    // 胴に一つへこみと、垂れた錆の筋
    const bottom = (c: number) => g + Math.round(Math.sqrt(Math.max(0, 1 - ((c - 5.5) / 6) ** 2)) * 2) - 1;
    for (let c = 0; c < 12; c++) {
      const color = c < 2 ? '#a86a48' : c < 6 ? C.rust : c < 9 ? '#64382a' : '#3a2219';
      rect(ctx, sx - 6 + c, bottom(c) - 14, 1, 15, color);
      for (const h of [4, 9]) {
        rect(ctx, sx - 6 + c, bottom(c) - h - 1, 1, 1, dim(color, 1.5));
        rect(ctx, sx - 6 + c, bottom(c) - h, 1, 1, dim(color, 0.6));
      }
    }
    for (const [dx, dy, w, h] of [[-4, -12, 3, 2], [-5, -6, 2, 2], [1, -3, 2, 1]]) rect(ctx, sx + dx, g + dy, w, h, '#4a5a6a');
    for (const dx of [-2, 3]) rect(ctx, sx + dx, g - 13, 1, 5, '#4e2a1c');
    rect(ctx, sx + 1, g - 8, 2, 2, '#3a2219');
    rect(ctx, sx + 1, g - 8, 1, 1, '#22140e');
    // ふた：明るい縁の輪と、少しくぼんだ面、栓
    fillEllipse(ctx, sx, g - 16, 6, 2, '#b07a52');
    fillEllipse(ctx, sx, g - 16, 5, 1, '#5a3424');
    rect(ctx, sx + 2, g - 16, 2, 1, C.metalDark);
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
  fan_stopped: T(26, (ctx, sx, g) => {
    // 止まった扇風機：丸い台（ボタンが3つ）に支柱と高さの留め具。その上に、網のガード（外の輪、内の輪、放射状の骨）
    // の中の3枚の羽根と、まん中の留め具。後ろにモーター。全体に埃をかぶってくすむ
    fillEllipse(ctx, sx, g - 1, 5, 2, '#6a7a70');
    fillEllipse(ctx, sx, g - 2, 4, 1, '#8a9a90');
    for (const dx of [-2, 0, 2]) rect(ctx, sx + dx, g - 1, 1, 1, '#c8d0c8');
    rect(ctx, sx - 1, g - 14, 2, 12, '#9fb2a4');
    rect(ctx, sx - 1, g - 14, 1, 12, '#b8c8bc');
    rect(ctx, sx - 2, g - 9, 4, 1, C.metalDark);
    rect(ctx, sx - 2, g - 18, 5, 4, '#6f8274');
    const cy = g - 21;
    fillEllipse(ctx, sx, cy, 7, 7, '#9aa8a0');
    fillEllipse(ctx, sx, cy, 6, 6, '#1c1e22');
    for (const k of [0, 1, 2]) {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3 + 0.4;
      fillEllipse(ctx, sx + Math.round(Math.cos(a) * 3), cy + Math.round(Math.sin(a) * 3), 2, 2, '#a8c0b4');
    }
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * 2 * Math.PI;
      rect(ctx, sx + Math.round(Math.cos(a) * 4), cy + Math.round(Math.sin(a) * 4), 1, 1, '#7a8a80');
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * 2 * Math.PI;
      plotLine(ctx, sx + Math.round(Math.cos(a) * 2), cy + Math.round(Math.sin(a) * 2), sx + Math.round(Math.cos(a) * 6), cy + Math.round(Math.sin(a) * 6), '#6a7870');
    }
    fillEllipse(ctx, sx, cy, 1, 1, '#d8e0d8');
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * 0.3;
    fillEllipse(ctx, sx, cy - 3, 6, 3, C.dust);
    ctx.globalAlpha = a;
  }),
  fallen_frame: T(4, (ctx, sx, g) => {
    // 落ちて割れた額：床にあお向けに落ちた金色の額縁。色あせた写真の上のガラスに、ひびが一点から放射に走る。
    // 額縁の手前の一辺は外れてずれ、奥の角は割れて欠ける。まわりにガラスの破片
    const P = (u: number, v: number, h: number) => at(sx, g, u, v, h);
    block(ctx, sx, g, [-0.46, 0.4], [-0.34, 0.2], [0, 1], '#a8844a', '#7a5a30', '#5a4020');
    fillQuad(ctx, [P(-0.37, -0.25, 1), P(0.32, -0.25, 1), P(0.32, 0.2, 1), P(-0.37, 0.2, 1)], '#6a6250');
    fillQuad(ctx, [P(-0.16, -0.12, 1), P(0.04, -0.12, 1), P(0.04, 0.14, 1), P(-0.16, 0.14, 1)], '#8a7a60');
    const o = P(-0.04, -0.02, 1);
    for (const [u, v] of [[-0.37, -0.2], [0.28, -0.25], [0.32, 0.12], [-0.28, 0.2], [0.08, 0.2]]) {
      const q = P(u, v, 1);
      plotLine(ctx, o.x, o.y, q.x, q.y, '#c8d0d8');
    }
    block(ctx, sx, g, [-0.36, 0.5], [0.3, 0.38], [0, 1], '#a8844a', '#7a5a30', '#5a4020');
    const c = P(0.4, -0.34, 1);
    rect(ctx, c.x - 2, c.y, 4, 2, C.bg);
    for (const [u, v] of [[0.6, 0.0], [-0.55, 0.3], [0.5, -0.45], [0.15, 0.55], [-0.2, -0.5]]) {
      const q = P(u, v, 0);
      rect(ctx, q.x, q.y, 1, 1, '#c8d0d8');
    }
  }, { foot: false }),
  stopped_clock: T(28, (ctx, sx, g) => {
    // 止まった柱時計：木の箱（左が明るく右が暗い）の頭に飾りの笠。丸い文字盤に12の目盛りと、止まった2本の針。
    // 下のガラス窓の中に、真鍮の振り子がまっすぐ下がったまま。わきに鍵穴、足もとに台
    rect(ctx, sx - 5, g - 2, 11, 2, C.woodDark);
    rect(ctx, sx - 4, g - 24, 9, 22, C.wood);
    rect(ctx, sx - 4, g - 24, 1, 22, C.woodLight);
    rect(ctx, sx + 4, g - 24, 1, 22, C.woodDark);
    rect(ctx, sx - 5, g - 25, 11, 1, C.woodDark);
    rect(ctx, sx - 4, g - 26, 9, 1, C.wood);
    rect(ctx, sx - 2, g - 27, 5, 1, C.woodLight);
    fillEllipse(ctx, sx, g - 20, 3, 3, C.paper);
    for (const [dx, dy] of [[0, -3], [3, 0], [0, 3], [-3, 0]]) rect(ctx, sx + dx, g - 20 + dy, 1, 1, '#4a3e30');
    plotLine(ctx, sx, g - 20, sx, g - 22, '#2a1e16');
    plotLine(ctx, sx, g - 20, sx + 2, g - 19, '#2a1e16');
    rect(ctx, sx - 2, g - 15, 5, 11, '#1a1612');
    rect(ctx, sx - 2, g - 15, 1, 3, C.glass);
    rect(ctx, sx, g - 15, 1, 7, '#a08040');
    fillEllipse(ctx, sx, g - 7, 1, 1, C.yellow);
    rect(ctx, sx - 3, g - 16, 7, 1, C.woodDark);
    rect(ctx, sx + 3, g - 11, 1, 1, C.metal);
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
};

/** 小物の足もとの台座を描く範囲（菱形の幅） */
export const FOOT_W = 12;
