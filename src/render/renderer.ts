import { FlowHazard, PatrolHazard, PeriodicHazard, SwingHazard } from '../game/hazard.ts';
import { GOAL_BONUS_PER_BEAT, type Sim } from '../game/sim.ts';
import type { PropKind, Stage } from '../game/stage.ts';
import { DIR_VEC, mod, TICKS_PER_BEAT, ZONE_INTERVAL, type Dir, type Vec, type Zone } from '../game/types.ts';
import { drawText, GLYPH_H, textWidth } from './font.ts';
import { GIRL_FOOT_X, GIRL_FOOT_Y, GIRL_FRAMES, GIRL_H, GIRL_W, GIRL_WAIST_Y, paintGirl } from './girl.ts';

/**
 * 288x288 のバッファに描き、実画素で整数倍（見た目で x1〜x4）に拡大して表示する。
 * ぼやけを防ぐため、バッファへの描画はすべて整数座標の fillRect / drawImage で行う（パスやアンチエイリアスを使わない）。
 */
const LW = 288;
const LH = 288;
const MAX_SCALE = 4;
/** クォータービューのタイル（上面の菱形）の幅と高さ */
const TW = 24;
const TH = 12;
/** 闇に浮かぶ道の板の厚み */
const FLOOR_THICK = 6;
const PLAYER_H = 21;

type Theme = 'alley' | 'garden';
/** 景色ごと・街灯の明るさの段階ごとの道の色（0: 闇、1: 街灯から2マス、2: 街灯のすぐそば）。各段階はゾーン別 */
const THEME_LIGHT: Record<Theme, { edge: string; road: string[] }[]> = {
  alley: [
    { edge: '#3a3741', road: ['#56525e', '#46434e', '#36343d'] },
    { edge: '#433e40', road: ['#625b5e', '#4f4a4c', '#3c393c'] },
    { edge: '#4d4640', road: ['#73695f', '#5b534c', '#443f3c'] },
  ],
  // 庭：苔と土
  garden: [
    { edge: '#2f3830', road: ['#414b40', '#363e36', '#2b312c'] },
    { edge: '#38402f', road: ['#4d5640', '#404836', '#32372d'] },
    { edge: '#434630', road: ['#5c6145', '#4b4f3a', '#3a3c30'] },
  ],
};
const ROAD_LIGHT = THEME_LIGHT.alley;
/** 遊具の柱、ブランコの枠などの高さ */
const POLE_H = 26;
const FRAME_H = 22;
/** ほかの家の入口の断片と玄関の高さ */
const FACADE_H = 20;

const COLORS = {
  bg: '#07060b',
  roadSpeck: '#625e6a',
  roadSideL: '#24222a',
  roadSideR: '#2c2933',
  slabMidL: '#17151c',
  slabMidR: '#1b1921',
  slabDeepL: '#0e0d12',
  slabDeepR: '#100f15',
  holeRim: '#3a3741',
  // 家の入口の断片（土壁と瓦の庇のつもり）
  facadeTop: '#2a2731',
  facadeSpeck: '#34303b',
  facadeL: '#3a3338',
  facadeR: '#2b262c',
  hazard: '#a54a3e',
  hazardL: '#6e2c25',
  hazardR: '#843830',
  gem: '#e3c56e',
  gemDark: '#9c7f35',
  goal: '#cfe3f0',
  stop: '#77707f',
  stopReady: '#b8b0c0',
  arrow: '#26242c',
  text: '#e8e1d6',
  textDim: '#8d857a',
  accent: '#7fa3c4',
  warn: '#d0675a',
  dot: '#3a3640',
  // 錆びた遊具
  rust: '#7d4a36',
  rustDark: '#4e2f25',
  rustLight: '#a0674a',
  seatPaint: '#5d6b55',
  // 家の入口
  wood: '#3b2c24',
  woodDark: '#241a15',
  glass: '#4f5961',
  glassDim: '#343a40',
  concrete: '#5a5650',
  concreteTop: '#77726a',
  mailbox: '#6b3029',
  lampPole: '#34333a',
  lampLight: '#f3e7b0',
  dirt: '#2a231f',
  dirtSpeck: '#362d27',
  // 庭と用水路
  stepStone: '#4f524e',
  stepStoneTop: '#686a63',
  moss: '#556347',
  water: '#22384a',
  waterDeep: '#152330',
  waterLight: '#5d7e95',
  bridge: '#5a4634',
  bridgeDark: '#3b2d22',
  bamboo: '#8a9a4f',
  bambooDark: '#5c6a35',
  stone: '#6d6b64',
  stoneDark: '#4a4945',
  leaf: '#2f4a2e',
  leafLight: '#46663f',
  plaster: '#8c8678',
  shoji: '#b9b2a0',
  doll: '#a8453a',
  dollFace: '#e8dccb',
  shoe: '#b84a4a',
  shoeSole: '#e3dccf',
};

/**
 * クリア演出の進行（ゴールしてからの秒）。
 * 扉から光の柱が立ち、少女は光に溶けて扉の向こうへ消える。道は扉から遠い順に崩れて闇へ落ち、扉だけが残る。
 * そのあと結果の欄が出て、得点を1行ずつ数え上げる
 */
export const CLEAR = {
  /** 少女が光に包まれ始める／消えきる */
  glow: 0.35,
  gone: 1.3,
  /** 道が崩れ始める。扉から1マス離れるごとの遅れ。1マスが落ちきるまで */
  crumble: 0.6,
  crumbleStep: 0.05,
  fall: 0.5,
  /** 結果の欄が出る。各行が出る時刻（欄が出てから）。行の数え上げにかかる秒 */
  panel: 2.0,
  rows: [0.5, 1.1, 1.7, 2.2],
  count: 0.5,
  /** すべて数え終わる（ゴールしてからの秒） */
  end: 4.7,
};

const ZONE_LABEL: Record<Zone, string> = { 0: 'SAFE 1/4', 1: 'RISK 1/8', 2: 'HIGH 1/16' };

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

/** グリッド座標 → 菱形の上の頂点（ワールドのピクセル座標） */
function iso(x: number, y: number): { sx: number; sy: number } {
  return { sx: Math.round(((x - y) * TW) / 2), sy: Math.round(((x + y) * TH) / 2) };
}

// ---- ドット単位の図形（w:h = 2:1 の菱形が基本） ----

function diamondRowWidth(r: number, w: number, h: number): number {
  return Math.round((w * (Math.min(r, h - 1 - r) + 1)) / (h / 2));
}

function fillDiamond(ctx: CanvasRenderingContext2D, cx: number, top: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  for (let r = 0; r < h; r++) {
    const rw = diamondRowWidth(r, w, h);
    ctx.fillRect(cx - rw / 2, top + r, rw, 1);
  }
}

function strokeDiamond(ctx: CanvasRenderingContext2D, cx: number, top: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  for (let r = 0; r < h; r++) {
    const rw = diamondRowWidth(r, w, h);
    ctx.fillRect(cx - rw / 2, top + r, 2, 1);
    ctx.fillRect(cx + rw / 2 - 2, top + r, 2, 1);
  }
}

/** 菱形を上面とする角柱の左右の側面 */
function fillPrismSides(
  ctx: CanvasRenderingContext2D,
  cx: number,
  top: number,
  w: number,
  h: number,
  depth: number,
  left: string,
  right: string,
): void {
  for (let i = 0; i < w / 2; i++) {
    ctx.fillStyle = left;
    ctx.fillRect(cx - w / 2 + i, top + h - Math.ceil((w / 2 - i) / 2), 1, depth + 1);
    ctx.fillStyle = right;
    ctx.fillRect(cx + i, top + h - Math.ceil((i + 1) / 2), 1, depth + 1);
  }
}

/** 菱形の内側の各ドットに対して pred が真なら塗る（ディザ用） */
function ditherDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  top: number,
  w: number,
  h: number,
  color: string,
  pred: (x: number, y: number) => boolean,
): void {
  ctx.fillStyle = color;
  for (let r = 0; r < h; r++) {
    const rw = diamondRowWidth(r, w, h);
    for (let x = cx - rw / 2; x < cx + rw / 2; x++) if (pred(x, top + r)) ctx.fillRect(x, top + r, 1, 1);
  }
}

function fillEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string): void {
  ctx.fillStyle = color;
  for (let dy = -ry; dy <= ry; dy++) {
    const hw = Math.round(rx * Math.sqrt(1 - (dy / (ry + 0.5)) ** 2));
    ctx.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
  }
}

/** 凸な四角形を塗る（行ごとに左右の端を求めて fillRect） */
function fillQuad(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], color: string): void {
  ctx.fillStyle = color;
  const ys = pts.map((p) => p.y);
  for (let y = Math.round(Math.min(...ys)); y <= Math.round(Math.max(...ys)); y++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (a.y === b.y) {
        if (Math.round(a.y) === y) {
          lo = Math.min(lo, a.x, b.x);
          hi = Math.max(hi, a.x, b.x);
        }
        continue;
      }
      const k = (y - a.y) / (b.y - a.y);
      if (k < 0 || k > 1) continue;
      const x = a.x + (b.x - a.x) * k;
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
    if (lo <= hi) ctx.fillRect(Math.round(lo), y, Math.round(hi) - Math.round(lo) + 1, 1);
  }
}

/** 水平な円をクォータービューで見た輪（横:縦 = 2:1 の楕円の線）。奥の半分と手前の半分で色を分ける */
function strokeIsoRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, back: string, front: string): void {
  const ry = rx / 2;
  const n = Math.ceil(rx * 8);
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    ctx.fillStyle = Math.sin(a) > 0 ? front : back;
    ctx.fillRect(Math.round(cx + rx * Math.cos(a)), Math.round(cy + ry * Math.sin(a)), 1, 1);
  }
}

function makeSprite(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  return c;
}

/**
 * 道のタイル。景色が薄い（危険な）ほど暗く、闇が透けて見える。
 * ディザの模様は (x + 2y) で決めるので、タイルどうしの継ぎ目でもずれない（タイルの間隔 12,6 で周期がそろう）。
 */
/** 闇に浮かぶ板の側面。下へいくほど闇に溶ける */
function fillSlabSides(ctx: CanvasRenderingContext2D, cx: number, top: number, w: number, h: number, depth: number): void {
  fillPrismSides(ctx, cx, top, w, h, depth, COLORS.slabDeepL, COLORS.slabDeepR);
  fillPrismSides(ctx, cx, top, w, h, Math.ceil((depth * 2) / 3), COLORS.slabMidL, COLORS.slabMidR);
  fillPrismSides(ctx, cx, top, w, h, Math.ceil(depth / 3), COLORS.roadSideL, COLORS.roadSideR);
}

function makeRoadSprite(zone: Zone, light: number, theme: Theme): HTMLCanvasElement {
  const pal = THEME_LIGHT[theme][light];
  return makeSprite(TW, TH + FLOOR_THICK + 1, (ctx) => {
    const cx = TW / 2;
    fillSlabSides(ctx, cx, 0, TW, TH, FLOOR_THICK);
    fillDiamond(ctx, cx, 0, TW, TH, pal.edge);
    fillDiamond(ctx, cx, 1, TW - 4, TH - 2, pal.road[zone]);
    if (zone === 0) {
      if (theme === 'garden') {
        // 飛び石：中ほどに平たい石が1枚
        fillDiamond(ctx, cx, 3, TW - 10, TH - 6, COLORS.stepStone);
        fillDiamond(ctx, cx, 3, TW - 12, TH - 7, COLORS.stepStoneTop);
        ditherDiamond(ctx, cx, 1, TW - 4, TH - 2, COLORS.moss, (x, y) => (x * 5 + y * 11) % 19 === 0);
      } else {
        ditherDiamond(ctx, cx, 1, TW - 4, TH - 2, COLORS.roadSpeck, (x, y) => (x * 7 + y * 13) % 23 === 0);
      }
    } else {
      const period = zone === 1 ? 8 : 4;
      ditherDiamond(ctx, cx, 0, TW, TH, COLORS.bg, (x, y) => (x + 2 * y) % period === 0);
    }
  });
}

/**
 * 用水路の水のマス。岸（縁）の内側が一段低い水面で、さざ波の模様が frame（拍の半分ごとに 0/1）で動く。
 * 流れの速い所（高危険）ほど白い筋が多く、闇が透ける
 */
function makeWaterSprite(zone: Zone, frame: number): HTMLCanvasElement {
  return makeSprite(TW, TH + FLOOR_THICK + 1, (ctx) => {
    const cx = TW / 2;
    fillSlabSides(ctx, cx, 0, TW, TH, FLOOR_THICK);
    fillDiamond(ctx, cx, 0, TW, TH, THEME_LIGHT.garden[0].edge);
    fillDiamond(ctx, cx, 1, TW - 4, TH - 2, COLORS.waterDeep);
    fillDiamond(ctx, cx, 2, TW - 6, TH - 3, COLORS.water);
    const period = zone === 2 ? 5 : 9;
    ditherDiamond(ctx, cx, 2, TW - 6, TH - 3, COLORS.waterLight, (x, y) => (x - 2 * y + frame * 3 + 40) % period === 0 && x % 2 === 0);
    ditherDiamond(ctx, cx, 0, TW, TH, COLORS.bg, (x, y) => (x + 2 * y) % (zone === 2 ? 4 : 8) === 0);
  });
}

/**
 * 闇に浮かぶ、家の入口の断片（壁ひと切れ）の地面より上。扉は wallCell で側面に描く。
 * 地面より下の板（makeBaseSprite）は道と一緒に奥から順に描く。立体物と一緒に後から描くと、手前の道にかぶさる
 */
function makeFacadeSprite(): HTMLCanvasElement {
  return makeSprite(TW, FACADE_H + TH + 1, (ctx) => {
    const cx = TW / 2;
    fillPrismSides(ctx, cx, 0, TW, TH, FACADE_H, COLORS.facadeL, COLORS.facadeR);
    fillDiamond(ctx, cx, 0, TW, TH, COLORS.facadeTop);
    ditherDiamond(ctx, cx, 0, TW, TH, COLORS.facadeSpeck, (x, y) => (x * 5 + y * 11) % 17 === 0);
  });
}

/** マスいっぱいの箱として描く小物（地面より下に板がある）。それ以外の小物は小さな台座に立つ */
const BLOCK_PROPS = new Set<PropKind>(['entrance', 'door', 'engawa', 'fence']);

/** 入口の断片の下の板（地面より下）。道のタイルと同じ位置に描く */
function makeBaseSprite(): HTMLCanvasElement {
  return makeSprite(TW, TH + FLOOR_THICK + 1, (ctx) => fillSlabSides(ctx, TW / 2, 0, TW, TH, FLOOR_THICK));
}

/** 空き地の地面（遊具の柱が立つ） */
function makeLotSprite(): HTMLCanvasElement {
  return makeSprite(TW, TH + FLOOR_THICK + 1, (ctx) => {
    const cx = TW / 2;
    fillSlabSides(ctx, cx, 0, TW, TH, FLOOR_THICK);
    fillDiamond(ctx, cx, 0, TW, TH, COLORS.dirt);
    ditherDiamond(ctx, cx, 0, TW, TH, COLORS.dirtSpeck, (x, y) => (x * 3 + y * 7) % 11 === 0);
  });
}

/** 少女：[向き][コマ] */
function makeGirlSprites(): HTMLCanvasElement[][] {
  return GIRL_FRAMES.map((frames) => frames.map((rows) => makeSprite(GIRL_W, GIRL_H, (ctx) => paintGirl(ctx, rows))));
}

/** 光に溶けていく少女（クリア演出）：絵の形だけを光の色で塗ったもの */
function makeGlowSprite(src: HTMLCanvasElement): HTMLCanvasElement {
  return makeSprite(src.width, src.height, (ctx) => {
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = COLORS.goal;
    ctx.fillRect(0, 0, src.width, src.height);
  });
}

/** 進む方向 → GIRL_FRAMES の向き（画面上の斜め） */
const GIRL_DIR: Record<Dir, number> = { down: 0, right: 1, left: 2, up: 3 };

/** 闇に浮かぶ小物（街灯、門柱、郵便受け）の小さな台座。上面の中心が (6, 3) */
function makeFootingSprite(): HTMLCanvasElement {
  return makeSprite(12, 6 + 4, (ctx) => {
    fillSlabSides(ctx, 6, 0, 12, 6, 3);
    fillDiamond(ctx, 6, 0, 12, 6, ROAD_LIGHT[0].edge);
  });
}

/**
 * 景色の欠けた場所（踏むとミス）。道がそこだけ抜け落ちていて、奥の道の板の断面が見え、破片が闇へ落ちていく。
 * 道の端（通れない闇）と見分けられるように、破片を描く
 */
function makeHoleSprite(): HTMLCanvasElement {
  return makeSprite(TW, TH + 10, (ctx) => {
    const cx = TW / 2;
    ctx.fillStyle = COLORS.holeRim;
    ctx.fillRect(cx - 4, TH / 2 + 2, 2, 1);
    ctx.fillRect(cx + 3, TH / 2 + 4, 1, 1);
    ctx.fillStyle = COLORS.slabMidL;
    ctx.fillRect(cx - 1, TH / 2 + 6, 2, 1);
    ctx.fillRect(cx + 5, TH / 2 + 8, 1, 1);
  });
}

/**
 * 区画の側面に縦1列ずつ塗る（扉などを描く用）。side 'L' は +y 向きの面、'R' は +x 向きの面。
 * i は面の左端から数えた列（0〜TW/2-1）、bottom は地面からの高さ、height は塗る高さ。
 */
function fillFaceColumn(
  ctx: CanvasRenderingContext2D,
  side: 'L' | 'R',
  sx: number,
  sy: number,
  i: number,
  bottom: number,
  height: number,
  color: string,
): void {
  const x = side === 'L' ? sx - TW / 2 + i : sx + i;
  const ground = sy + (side === 'L' ? TH / 2 + Math.floor(i / 2) : TH - Math.ceil((i + 1) / 2));
  ctx.fillStyle = color;
  ctx.fillRect(x, ground - bottom - height + 1, 1, height);
}

/** 線分（ドット単位） */
function plotLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string): void {
  ctx.fillStyle = color;
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let k = 0; k <= n; k++) ctx.fillRect(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), 1, 1);
}

export class Renderer {
  private main: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private low: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  private devW = 0;
  private devH = 0;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private camX = 0;
  private camY = 0;
  private camSim: Sim | null = null;
  /** [明るさ][ゾーン] */
  /** 道のタイル：[景色][明るさ][ゾーン] */
  private roads = {} as Record<Theme, HTMLCanvasElement[][]>;
  /** 水のマス：[さざ波のコマ][ゾーン] */
  private water: HTMLCanvasElement[][];
  private facade: HTMLCanvasElement;
  private base: HTMLCanvasElement;
  private footing: HTMLCanvasElement;
  private hole: HTMLCanvasElement;
  /** 少女：[正面, 背面][立ち, 歩き]、左右反転したものも */
  private girl: HTMLCanvasElement[][];
  private girlGlow: HTMLCanvasElement;
  private lot: HTMLCanvasElement;
  /** ステージごとの、各マスの街灯の明るさ */
  private lightMaps = new WeakMap<Stage, Uint8Array>();

  constructor(main: HTMLCanvasElement) {
    this.main = main;
    this.mctx = main.getContext('2d')!;
    this.low = document.createElement('canvas');
    this.low.width = LW;
    this.low.height = LH;
    this.lctx = this.low.getContext('2d')!;
    for (const theme of ['alley', 'garden'] as Theme[]) {
      this.roads[theme] = [0, 1, 2].map((light) => [0, 1, 2].map((z) => makeRoadSprite(z as Zone, light, theme)));
    }
    this.water = [0, 1].map((frame) => [0, 1, 2].map((z) => makeWaterSprite(z as Zone, frame)));
    this.facade = makeFacadeSprite();
    this.base = makeBaseSprite();
    this.footing = makeFootingSprite();
    this.hole = makeHoleSprite();
    this.lot = makeLotSprite();
    this.girl = makeGirlSprites();
    this.girlGlow = makeGlowSprite(this.girl[GIRL_DIR.up][0]);

    // キャンバスの実画素サイズを正確に取る（CSSピクセル × dpr の丸め誤差でぼやけないように）
    // devicePixelContentBoxSize がCSSサイズ×dprと食い違う環境（高DPIのエミュレーションなど）では計算値を使う
    const ro = new ResizeObserver(([entry]) => {
      const box = entry.devicePixelContentBoxSize?.[0];
      const estW = Math.round(entry.contentRect.width * devicePixelRatio);
      const estH = Math.round(entry.contentRect.height * devicePixelRatio);
      const ok = box && Math.abs(box.inlineSize - estW) <= 1 && Math.abs(box.blockSize - estH) <= 1;
      this.devW = ok ? box.inlineSize : estW;
      this.devH = ok ? box.blockSize : estH;
    });
    try {
      ro.observe(main, { box: 'device-pixel-content-box' });
    } catch {
      ro.observe(main);
    }
  }

  /** 拡大表示の配置（実画素）。自動テストでの検査用 */
  get layout(): { scale: number; ox: number; oy: number; width: number; height: number } {
    return { scale: this.scale, ox: this.ox, oy: this.oy, width: LW, height: LH };
  }

  begin(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.devW || Math.round(this.main.clientWidth * dpr);
    const h = this.devH || Math.round(this.main.clientHeight * dpr);
    if (this.main.width !== w || this.main.height !== h) {
      this.main.width = w;
      this.main.height = h;
    }
    // 実画素で整数倍。上限は見た目で x4 まで
    const fit = Math.floor(Math.min(w / LW, h / LH));
    this.scale = Math.max(1, Math.min(Math.floor(MAX_SCALE * dpr), fit));
    this.ox = Math.floor((w - LW * this.scale) / 2);
    this.oy = Math.floor((h - LH * this.scale) / 2);

    this.lctx.fillStyle = COLORS.bg;
    this.lctx.fillRect(0, 0, LW, LH);
  }

  present(): void {
    const ctx = this.mctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.main.width, this.main.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.low, this.ox, this.oy, LW * this.scale, LH * this.scale);
  }

  // ---- 世界 ----

  /**
   * songTime はカウント中なら負（足元のハイライトはカウント中も拍に合わせる）。
   * clearSec はゴールしてからの経過秒（クリア演出）。プレイ中は null
   */
  world(sim: Sim, songTime: number, tickSec: number, clearSec: number | null = null): void {
    const ctx = this.lctx;
    const stage = sim.stage;
    const tickF = Math.max(0, songTime / tickSec);
    const now = Math.floor(tickF);

    // プレイヤーの補間位置
    const fromZone = stage.cell(sim.fromX, sim.fromY)!.zone;
    const slide = Math.min(ZONE_INTERVAL[fromZone], 2) * 0.6;
    const k = clamp01((tickF - sim.moveTick) / slide);
    const px = lerp(sim.fromX, sim.x, k);
    const py = lerp(sim.fromY, sim.y, k);
    // 歩きのコマは、位置の補間より長く、次に動ける拍まで（押し続ければ足が止まらない）
    const moved = sim.fromX !== sim.x || sim.fromY !== sim.y;
    const walk = moved ? clamp01((tickF - sim.moveTick) / ZONE_INTERVAL[fromZone]) : 1;

    // カメラはプレイヤーを追う
    const p = iso(px, py);
    if (this.camSim !== sim) {
      this.camSim = sim;
      this.camX = p.sx;
      this.camY = p.sy;
    }
    this.camX = lerp(this.camX, p.sx, 0.12);
    this.camY = lerp(this.camY, p.sy, 0.12);
    const offX = Math.round(LW / 2 - this.camX);
    const offY = Math.round(LH / 2 - this.camY - 8);
    ctx.save();
    ctx.translate(offX, offY);

    // クリア演出：扉から遠いマスほど遅れて、道が崩れて闇へ落ちていく。扉のマスだけが残る。null は崩れ落ちたあと
    const goal = stage.goal;
    const crumble = (x: number, y: number): { dy: number; alpha: number } | null => {
      if (clearSec === null || (x === goal.x && y === goal.y)) return { dy: 0, alpha: 1 };
      const dist = Math.abs(x - goal.x) + Math.abs(y - goal.y);
      const u = (clearSec - CLEAR.crumble - dist * CLEAR.crumbleStep) / CLEAR.fall;
      if (u <= 0) return { dy: 0, alpha: 1 };
      if (u >= 1) return null;
      return { dy: Math.round(u * u * 18), alpha: Math.ceil((1 - u) * 4) / 4 };
    };

    // 道（奥から手前へ）
    const light = this.lightMap(stage);
    const theme = stage.def.theme ?? 'alley';
    for (let d = 0; d < stage.width + stage.height - 1; d++) {
      for (let x = 0; x <= d; x++) {
        const y = d - x;
        const cell = stage.cell(x, y);
        if (!cell) continue;
        const f = crumble(x, y);
        if (!f) continue;
        ctx.globalAlpha = f.alpha;
        const sx = iso(x, y).sx;
        const sy = iso(x, y).sy + f.dy;
        if (cell.terrain === 'hole') ctx.drawImage(this.hole, sx - TW / 2, sy);
        if (cell.terrain === 'wall' && cell.obj?.type === 'prop') {
          // 小物の地面より下の部分（地面より上は立体物として後で描く）
          const kind = cell.obj.kind;
          if (kind === 'lot') ctx.drawImage(this.lot, sx - TW / 2, sy);
          else if (BLOCK_PROPS.has(kind)) ctx.drawImage(this.base, sx - TW / 2, sy);
          else ctx.drawImage(this.footing, sx - 6, sy + TH / 2 - 3);
        }
        if (cell.terrain !== 'floor') continue;
        // 水のさざ波は半拍ごとに動く
        if (cell.water) ctx.drawImage(this.water[mod(Math.floor(tickF / (TICKS_PER_BEAT / 2)), 2)][cell.zone], sx - TW / 2, sy);
        else ctx.drawImage(this.roads[theme][light[stage.index(x, y)]][cell.zone], sx - TW / 2, sy);

        const obj = cell.obj;
        if (obj?.type === 'bridge') {
          this.bridge(sx, sy, stage.cell(x - 1, y)?.water || stage.cell(x + 1, y)?.water ? 'x' : 'y');
        } else if (obj?.type === 'stop') {
          const ready = sim.x === x && sim.y === y && sim.stillTicks >= TICKS_PER_BEAT;
          fillDiamond(ctx, sx, sy + 3, TW / 2, TH / 2, ready ? COLORS.stopReady : COLORS.stop);
        } else if (obj?.type === 'oneway') {
          this.arrow(sx, sy + TH / 2, DIR_VEC[obj.dir].x, DIR_VEC[obj.dir].y);
        }
      }
    }
    ctx.globalAlpha = 1;

    if (sim.status === 'playing') this.beatTile(sim, songTime / tickSec);

    // 立体物は奥行き順に描く
    const sprites: { depth: number; draw: () => void }[] = [];
    const feet = p.sy + TH / 2;

    for (let y = 0; y < stage.height; y++) {
      for (let x = 0; x < stage.width; x++) {
        const cell = stage.cell(x, y)!;
        const f = crumble(x, y);
        if (!f) continue;
        const sx = iso(x, y).sx;
        const sy = iso(x, y).sy + f.dy;
        // 道の外は闇で何も描かない。小物だけが闇に浮かぶ
        if (cell.terrain === 'wall' && cell.obj?.type === 'prop' && cell.obj.kind !== 'lot') {
          const kind = cell.obj.kind;
          const height = kind === 'entrance' || kind === 'door' || kind === 'engawa' ? FACADE_H : kind === 'lamp' ? POLE_H : 16;
          // プレイヤーより手前でプレイヤーに重なるものは透かす
          const hides =
            x + y > px + py && Math.abs(sx - p.sx) < TW && sy - height < feet && sy + TH + FLOOR_THICK > feet - PLAYER_H;
          // 扉は通れる側（見える面）に描く
          const face: 'L' | 'R' = stage.cell(x, y + 1)?.terrain === 'floor' ? 'L' : 'R';
          sprites.push({
            depth: x + y,
            draw: () => {
              ctx.globalAlpha = (hides ? 0.4 : 1) * f.alpha;
              this.wallCell(sx, sy, kind, face);
              ctx.globalAlpha = 1;
            },
          });
        } else if (cell.obj?.type === 'gate') {
          const closed = sim.isGateClosed(x, y, now);
          sprites.push({
            depth: x + y + 0.2,
            draw: () => {
              ctx.globalAlpha = f.alpha;
              this.gate(sx, sy, closed);
              ctx.globalAlpha = 1;
            },
          });
        } else if (cell.obj?.type === 'goal') {
          const pulse = clearSec !== null ? 1 : 1 - (tickF % TICKS_PER_BEAT) / TICKS_PER_BEAT;
          sprites.push({ depth: x + y + 0.3, draw: () => this.goalDoor(sx, sy, pulse) });
        }
      }
    }

    const labels: { x: number; y: number; text: string; color: string }[] = [];

    for (const s of sim.scores) {
      // クリア演出のあいだは、残った得点マスは道と一緒に消えるので出さない
      if (!s.alive || clearSec !== null) continue;
      const { sx, sy } = iso(s.x, s.y);
      const bob = Math.round(Math.sin(tickF * 0.4 + s.x));
      sprites.push({ depth: s.x + s.y + 0.3, draw: () => this.gem(sx, sy + TH / 2 - 3 + bob) });
      labels.push({ x: sx, y: sy - 8, text: String(s.value), color: COLORS.gem });
    }

    // 遊具はゴールした瞬間に消える
    for (const h of clearSec === null ? sim.hazards : []) {
      if (h instanceof PatrolHazard) {
        const step = Math.floor(tickF / h.interval);
        const a = h.posAtStep(step - 1);
        const b = h.posAtStep(step);
        const hk = tickF < h.interval ? 1 : clamp01((tickF - step * h.interval) / (Math.min(h.interval, 2) * 0.6));
        const hx = lerp(a.x, b.x, hk);
        const hy = lerp(a.y, b.y, hk);
        const { sx, sy } = iso(hx, hy);
        if (h.look === 'kaisento' && h.pivot) {
          // 回旋塔：柱のてっぺんから鎖で吊った輪が、柱のまわりを回る
          const pv = iso(h.pivot.x, h.pivot.y);
          sprites.push({ depth: h.pivot.x + h.pivot.y + 0.5, draw: () => this.kaisentoPole(pv.sx, pv.sy + TH / 2) });
          sprites.push({
            depth: hx + hy + 0.5,
            draw: () => this.kaisentoRing(pv.sx, pv.sy + TH / 2, sx, sy + TH / 2),
          });
        } else {
          sprites.push({ depth: hx + hy + 0.5, draw: () => this.patrol(sx, sy + TH / 2, tickF) });
        }
      } else if (h instanceof SwingHazard) {
        const mid = (h.cells.length - 1) / 2;
        const base = h.cells[0];
        const along = (u: number) =>
          h.axis === 'x' ? { x: base.x + mid + u, y: base.y } : { x: base.x, y: base.y + mid + u };
        const seat = along(h.seatAt(tickF));
        const ends = [along(-(h.reach + 0.5)), along(h.reach + 0.5)];
        sprites.push({ depth: seat.x + seat.y + 0.45, draw: () => this.swing(ends, seat) });
      } else if (h instanceof PeriodicHazard) {
        const active = h.isActive(now);
        // 1拍前から予告して点滅する
        const soon = !active && h.isActive(now + TICKS_PER_BEAT);
        if (h.look === 'shishiodoshi' && h.pivot) {
          const c = h.cells[0];
          const pv = h.pivot;
          sprites.push({
            depth: Math.max(c.x + c.y, pv.x + pv.y) + 0.4,
            draw: () => this.shishiodoshi(pv, c, h, tickF, soon && now % 2 === 0),
          });
          continue;
        }
        for (const c of h.cells) {
          const { sx, sy } = iso(c.x, c.y);
          sprites.push({ depth: c.x + c.y + 0.4, draw: () => this.periodic(sx, sy, active, soon && now % 2 === 0) });
        }
      } else if (h instanceof FlowHazard) {
        for (const it of h.itemsAt(tickF)) {
          // マスの間をなめらかに流れる。最後のマスの先へは半マス流れて消える
          const i = Math.floor(it.pos);
          const a = h.cells[i];
          const b = h.cells[i + 1] ?? { x: a.x * 2 - h.cells[i - 1].x, y: a.y * 2 - h.cells[i - 1].y };
          const u = it.pos - i;
          if (i === h.cells.length - 1 && u > 0.5) continue;
          const fx = lerp(a.x, b.x, u);
          const fy = lerp(a.y, b.y, u);
          const { sx, sy } = iso(fx, fy);
          sprites.push({ depth: fx + fy + 0.45, draw: () => this.flotsam(sx, sy + TH / 2, it.n, tickF) });
        }
      }
    }

    if (clearSec !== null) {
      sprites.push({ depth: px + py + 0.5, draw: () => this.playerEntering(p.sx, p.sy + TH / 2, clearSec) });
    } else if (!(sim.stunned && Math.floor(tickF * 2) % 2 === 0)) {
      sprites.push({
        depth: px + py + 0.5,
        draw: () => this.player(p.sx, p.sy + TH / 2, sim.facing, walk, (sim.x + sim.y) % 2 !== 0, tickF),
      });
    }

    sprites.sort((a, b) => a.depth - b.depth);
    for (const s of sprites) s.draw();

    if (clearSec !== null) {
      const g = iso(goal.x, goal.y);
      this.clearLight(g.sx, g.sy + TH / 2, clearSec);
    }

    // 演出：ミスの輪、得点の表示
    for (const ev of sim.events) {
      const age = (tickF - ev.tick) * tickSec;
      if (age < 0 || age > 0.8) continue;
      const { sx, sy } = iso(ev.x, ev.y);
      if (ev.kind === 'miss' && age < 0.5) {
        this.ring(sx, sy + TH / 2, 5 + age * 30, 2.5 + age * 15, COLORS.warn);
      } else if (ev.kind === 'pickup') {
        labels.push({ x: sx, y: sy - 12 - Math.round(age * 16), text: `+${ev.amount}`, color: COLORS.text });
      } else if (ev.kind === 'bounce' && age < 0.3) {
        labels.push({ x: sx, y: sy - 18, text: 'STOP!', color: COLORS.warn });
      }
    }
    for (const l of labels) this.text(l.text, l.x, l.y, 1, l.color, 'center');

    ctx.restore();
  }

  private ring(cx: number, cy: number, rx: number, ry: number, color: string): void {
    const ctx = this.lctx;
    ctx.fillStyle = color;
    const n = Math.max(12, Math.round(rx * 2));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ctx.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 1, 1);
    }
  }

  private arrow(cx: number, cy: number, dx: number, dy: number): void {
    // グリッドの向き → 画面上の向き（2:1 の斜め）
    const ux = dx - dy;
    const uy = (dx + dy) / 2;
    const vx = -dy - dx;
    const vy = (dx - dy) / 2;
    const ctx = this.lctx;
    ctx.fillStyle = COLORS.arrow;
    const tipX = cx + ux * 4;
    const tipY = cy + uy * 4;
    for (let k = 0; k < 8; k++) ctx.fillRect(Math.round(tipX - ux * k), Math.round(tipY - uy * k), 2, 1);
    for (let k = 1; k < 4; k++) {
      ctx.fillRect(Math.round(tipX - ux * k + vx * k), Math.round(tipY - uy * k + vy * k), 2, 1);
      ctx.fillRect(Math.round(tipX - ux * k - vx * k), Math.round(tipY - uy * k - vy * k), 2, 1);
    }
  }

  private gate(sx: number, sy: number, closed: boolean): void {
    // 踏切の遮断機。閉じているあいだは赤白の棒が下りている
    const ctx = this.lctx;
    const lx = sx - TW / 2 + 2;
    const ly = sy + TH / 2;
    ctx.fillStyle = '#d8d0c4';
    ctx.fillRect(lx - 1, ly - 11, 2, 11);
    if (closed) {
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = Math.floor(i / 2) % 2 === 0 ? '#c9473b' : '#e8e1d6';
        ctx.fillRect(lx + i * 2, ly - 8 + Math.floor(i / 2) * 1 + (i % 2), 2, 2);
      }
    } else {
      ctx.fillStyle = '#c9473b';
      ctx.fillRect(lx - 1, ly - 20, 2, 9);
    }
  }

  /** 用水路にかかる板の橋。板の継ぎ目は流れの向き（canal）に平行 */
  private bridge(sx: number, sy: number, canal: 'x' | 'y'): void {
    const ctx = this.lctx;
    fillDiamond(ctx, sx, sy + 1, TW - 2, TH - 1, COLORS.bridgeDark);
    fillDiamond(ctx, sx, sy + 1, TW - 4, TH - 2, COLORS.bridge);
    // 継ぎ目：流れの向きに平行な線を3本
    for (const k of [-0.25, 0, 0.25]) {
      const a = canal === 'x' ? { x: -0.4, y: k } : { x: k, y: -0.4 };
      const b = canal === 'x' ? { x: 0.4, y: k } : { x: k, y: 0.4 };
      const pa = { x: sx + ((a.x - a.y) * TW) / 2, y: sy + TH / 2 + ((a.x + a.y) * TH) / 2 };
      const pb = { x: sx + ((b.x - b.y) * TW) / 2, y: sy + TH / 2 + ((b.x + b.y) * TH) / 2 };
      plotLine(ctx, Math.round(pa.x), Math.round(pa.y), Math.round(pb.x), Math.round(pb.y), COLORS.bridgeDark);
    }
  }

  /**
   * 鹿威し：台（pivot、闇に浮かぶ）の上で竹筒が水を受けてゆっくり傾き、いっぱいになると道のマス（target）へ打ち下ろす。
   * 打ち下ろしている間（周期の [from, to)）がそのマスの危険
   */
  private shishiodoshi(pivot: Vec, target: Vec, h: PeriodicHazard, tickF: number, blink: boolean): void {
    const ctx = this.lctx;
    const p = iso(pivot.x, pivot.y);
    const tg = iso(target.x, target.y);
    const ground = p.sy + TH / 2;
    // 台座と2本の支柱
    ctx.drawImage(this.footing, p.sx - 6, ground - 3);
    ctx.fillStyle = COLORS.woodDark;
    ctx.fillRect(p.sx - 4, ground - 12, 2, 12);
    ctx.fillRect(p.sx + 2, ground - 12, 2, 12);
    // 傾き a：0 は筒口が上（水を受ける）、1 は打ち下ろした所
    const phase = mod(tickF, h.period);
    const down = phase >= h.from && phase < h.to;
    const rest = h.period - (h.to - h.from);
    const a = down ? 1 : 0.4 * (mod(phase - h.to, h.period) / rest);
    const axle = { x: p.sx, y: ground - 11 };
    const hit = { x: tg.sx, y: tg.sy + TH / 2 - 2 };
    const raised = { x: axle.x + (hit.x - axle.x) * 0.7, y: axle.y - 9 };
    const front = { x: Math.round(lerp(raised.x, hit.x, a)), y: Math.round(lerp(raised.y, hit.y, a)) };
    // 竹筒の後ろ（台の向こう側）は前の半分の長さ
    const back = { x: Math.round(axle.x + (axle.x - front.x) * 0.5), y: Math.round(axle.y + (axle.y - front.y) * 0.5) };
    if (blink) strokeDiamond(ctx, tg.sx, tg.sy + 2, TW - 8, TH - 4, COLORS.warn);
    plotLine(ctx, back.x, back.y + 1, front.x, front.y + 1, COLORS.bambooDark);
    plotLine(ctx, back.x, back.y, front.x, front.y, COLORS.bamboo);
    ctx.fillStyle = COLORS.woodDark;
    ctx.fillRect(axle.x - 1, axle.y - 1, 2, 2);
  }

  /** 流されていく物：家から失われた物（人形、表札、子どもの靴）が、水面で揺れながら流れる */
  private flotsam(cx: number, cy: number, n: number, tickF: number): void {
    const ctx = this.lctx;
    const bob = Math.round(Math.sin(tickF * 0.9 + n) * 0.8);
    const y = cy - 2 + bob;
    ctx.globalAlpha = 0.5;
    fillEllipse(ctx, cx, cy, 5, 1, COLORS.waterDeep);
    ctx.globalAlpha = 1;
    switch (mod(n, 3)) {
      case 0: // 人形（着物の胴と白い顔、黒髪）
        ctx.fillStyle = COLORS.doll;
        ctx.fillRect(cx - 2, y - 5, 5, 5);
        ctx.fillStyle = COLORS.dollFace;
        ctx.fillRect(cx - 1, y - 8, 3, 3);
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(cx - 2, y - 9, 5, 2);
        break;
      case 1: // 表札（木の板に墨の名前）
        ctx.fillStyle = COLORS.wood;
        ctx.fillRect(cx - 5, y - 3, 10, 3);
        ctx.fillStyle = COLORS.bridge;
        ctx.fillRect(cx - 5, y - 4, 10, 1);
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(cx - 3, y - 3, 6, 1);
        break;
      default: // 子どもの靴（赤い甲と白い底）
        ctx.fillStyle = COLORS.shoeSole;
        ctx.fillRect(cx - 4, y - 1, 8, 1);
        ctx.fillStyle = COLORS.shoe;
        ctx.fillRect(cx - 4, y - 3, 6, 2);
        ctx.fillRect(cx - 3, y - 5, 3, 2);
        break;
    }
  }

  /** 各マスの街灯の明るさ（街灯と玄関から 1マス以内: 2、2マス: 1） */
  private lightMap(stage: Stage): Uint8Array {
    let map = this.lightMaps.get(stage);
    if (map) return map;
    map = new Uint8Array(stage.width * stage.height);
    for (let y = 0; y < stage.height; y++) {
      for (let x = 0; x < stage.width; x++) {
        const obj = stage.cell(x, y)!.obj;
        if (obj?.type !== 'prop' || !['lamp', 'entrance', 'lantern', 'engawa'].includes(obj.kind)) continue;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (!stage.cell(x + dx, y + dy)) continue;
            const i = stage.index(x + dx, y + dy);
            map[i] = Math.max(map[i], Math.max(Math.abs(dx), Math.abs(dy)) <= 1 ? 2 : 1);
          }
        }
      }
    }
    this.lightMaps.set(stage, map);
    return map;
  }

  /** 闇に浮かぶ小物 */
  private wallCell(sx: number, sy: number, kind: PropKind, face: 'L' | 'R'): void {
    const ctx = this.lctx;
    const ground = sy + TH / 2; // 台座の上面の中心（台座は道と一緒に描いてある）
    switch (kind) {
      case 'entrance':
      case 'door':
        ctx.drawImage(this.facade, sx - TW / 2, sy - FACADE_H);
        this.slidingDoor(sx, sy, face, kind === 'entrance');
        return;
      case 'engawa':
        // 縁側：障子の閉まった壁の前に、板張りの縁が張り出している
        ctx.drawImage(this.facade, sx - TW / 2, sy - FACADE_H);
        for (let i = 1; i <= 10; i++) {
          fillFaceColumn(ctx, face, sx, sy, i, 5, 13, i % 3 === 1 ? COLORS.wood : COLORS.shoji);
          for (const r of [8, 12, 16]) fillFaceColumn(ctx, face, sx, sy, i, r, 1, COLORS.wood);
          fillFaceColumn(ctx, face, sx, sy, i, 0, 4, i % 2 === 0 ? COLORS.bridge : COLORS.bridgeDark);
        }
        return;
      case 'fence': {
        // 隣家のブロック塀のひと切れ：x 方向に延びる薄い塀
        const H = 14;
        const pt = (gx: number, gy: number, h: number) => ({ x: sx + ((gx - gy) * TW) / 2, y: ground + ((gx + gy) * TH) / 2 - h });
        const [a, b, b2] = [pt(-0.5, 0.1, 0), pt(0.5, 0.1, 0), pt(0.5, -0.1, 0)];
        const up = (q: { x: number; y: number }) => ({ x: q.x, y: q.y - H });
        fillQuad(ctx, [a, b, up(b), up(a)], COLORS.plaster); // 手前（+y）の面
        fillQuad(ctx, [b, b2, up(b2), up(b)], COLORS.concrete); // 端（+x）の面
        fillQuad(ctx, [up(a), up(b), up(b2), pt(-0.5, -0.1, H)], COLORS.concreteTop);
        for (const r of [5, 10]) plotLine(ctx, Math.round(a.x), Math.round(a.y - r), Math.round(b.x), Math.round(b.y - r), COLORS.stoneDark);
        return;
      }
      case 'lantern':
        // 石灯籠：台、竿、火袋（灯っている）、笠
        ctx.fillStyle = COLORS.stoneDark;
        ctx.fillRect(sx - 4, ground - 3, 8, 3);
        ctx.fillStyle = COLORS.stone;
        ctx.fillRect(sx - 1, ground - 9, 3, 6);
        ctx.fillRect(sx - 4, ground - 11, 8, 2);
        ctx.fillRect(sx - 3, ground - 16, 6, 5);
        ctx.fillStyle = COLORS.lampLight;
        ctx.fillRect(sx - 1, ground - 15, 2, 3);
        ctx.fillStyle = COLORS.stoneDark;
        ctx.fillRect(sx - 5, ground - 18, 10, 2);
        ctx.fillRect(sx - 3, ground - 19, 6, 1);
        ctx.fillRect(sx - 1, ground - 21, 2, 2);
        return;
      case 'shrub':
        // 植木：刈り込んだ丸い茂み
        fillEllipse(ctx, sx, ground - 6, 7, 5, COLORS.leaf);
        fillEllipse(ctx, sx - 2, ground - 8, 4, 3, COLORS.leafLight);
        return;
      case 'pillar':
        // 門柱
        ctx.fillStyle = COLORS.concrete;
        ctx.fillRect(sx - 3, ground - 14, 6, 14);
        ctx.fillStyle = COLORS.facadeR;
        ctx.fillRect(sx, ground - 14, 3, 14);
        ctx.fillStyle = COLORS.concreteTop;
        ctx.fillRect(sx - 4, ground - 16, 8, 2);
        return;
      case 'mailbox':
        ctx.fillStyle = COLORS.lampPole;
        ctx.fillRect(sx - 1, ground - 8, 2, 8);
        ctx.fillStyle = COLORS.mailbox;
        ctx.fillRect(sx - 4, ground - 14, 8, 6);
        ctx.fillStyle = COLORS.woodDark;
        ctx.fillRect(sx - 3, ground - 12, 6, 1);
        return;
      case 'lamp': {
        const top = ground - POLE_H;
        ctx.fillStyle = COLORS.lampPole;
        ctx.fillRect(sx - 1, top, 2, POLE_H);
        ctx.fillRect(sx - 1, top, 6, 1);
        ctx.fillStyle = COLORS.lampLight;
        ctx.fillRect(sx + 3, top + 1, 3, 2);
        ctx.globalAlpha *= 0.35;
        ctx.fillRect(sx + 1, top + 3, 7, 1);
        ctx.fillRect(sx + 2, top + 4, 5, 1);
        ctx.globalAlpha /= 0.35;
        return;
      }
    }
  }

  /** 引き戸。entrance は少女の家の玄関（すりガラスがところどころ割れている） */
  private slidingDoor(sx: number, sy: number, face: 'L' | 'R', entrance: boolean): void {
    const ctx = this.lctx;
    const broken = new Set(['4,9', '7,6', '8,11']);
    for (let i = 2; i <= 9; i++) {
      const frame = i === 2 || i === 9 || i === 5 || i === 6;
      fillFaceColumn(ctx, face, sx, sy, i, 0, 16, COLORS.woodDark);
      if (frame) continue;
      fillFaceColumn(ctx, face, sx, sy, i, 1, 4, COLORS.wood);
      for (let r = 5; r <= 14; r++) {
        const color = r % 3 === 2 ? COLORS.wood : entrance && broken.has(`${i},${r}`) ? COLORS.bg : entrance ? COLORS.glass : COLORS.glassDim;
        fillFaceColumn(ctx, face, sx, sy, i, r, 1, color);
      }
    }
    if (entrance) fillFaceColumn(ctx, face, sx, sy, 11, 9, 2, COLORS.textDim); // 表札
  }

  /** ゴール：欠けに囲まれて一枚だけ立つ扉。開いた戸口から光が漏れる */
  private goalDoor(sx: number, sy: number, pulse: number): void {
    const ctx = this.lctx;
    const g = sy + TH / 2;
    ctx.globalAlpha = 0.25 + pulse * 0.2;
    fillDiamond(ctx, sx, sy + 2, TW - 8, TH - 4, COLORS.goal);
    for (let r = 0; r < 18; r += 2) {
      ctx.globalAlpha = (0.45 + pulse * 0.35) * (1 - r / 24);
      ctx.fillStyle = COLORS.goal;
      ctx.fillRect(sx - 3, g - r - 2, 6, 2);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = COLORS.woodDark;
    ctx.fillRect(sx - 5, g - 20, 2, 20);
    ctx.fillRect(sx + 3, g - 20, 2, 20);
    ctx.fillStyle = COLORS.wood;
    ctx.fillRect(sx - 6, g - 22, 12, 2);
  }

  /** 回旋塔の柱 */
  private kaisentoPole(cx: number, ground: number): void {
    const ctx = this.lctx;
    ctx.globalAlpha = 0.45;
    fillEllipse(ctx, cx, ground, 3, 1, '#000');
    ctx.globalAlpha = 1;
    ctx.fillStyle = COLORS.rust;
    ctx.fillRect(cx - 1, ground - POLE_H, 2, POLE_H);
    ctx.fillStyle = COLORS.rustDark;
    ctx.fillRect(cx, ground - POLE_H, 1, POLE_H);
    ctx.fillStyle = COLORS.rustLight;
    ctx.fillRect(cx - 2, ground - POLE_H - 2, 4, 2);
  }

  /** 回旋塔の輪（柱のてっぺんから鎖で吊られている）。輪の真下のマスが危険 */
  private kaisentoRing(pcx: number, pground: number, cx: number, ground: number): void {
    const ctx = this.lctx;
    const ry = ground - 8;
    const r = 5;
    ctx.globalAlpha = 0.45;
    fillEllipse(ctx, cx, ground, r, 1, '#000');
    ctx.globalAlpha = 1;
    // 輪は水平。柱のてっぺんから、輪の左右の端へ鎖が2本
    plotLine(ctx, pcx, pground - POLE_H, cx - r, ry, COLORS.rustDark);
    plotLine(ctx, pcx, pground - POLE_H, cx + r, ry, COLORS.rustDark);
    strokeIsoRing(ctx, cx, ry, r, COLORS.rustDark, COLORS.rustLight);
  }

  /**
   * 箱ブランコ。枠の梁は揺れる向きと直角に渡してあり、座席が振り子のように揺れる。
   * ends は振れ幅の両端（グリッド座標）、seat は座席の位置
   */
  private swing(ends: { x: number; y: number }[], seat: { x: number; y: number }): void {
    const ctx = this.lctx;
    const mid = { x: (ends[0].x + ends[1].x) / 2, y: (ends[0].y + ends[1].y) / 2 };
    // 揺れる向きと直角の向き（グリッド）
    const along = { x: Math.sign(ends[1].x - ends[0].x), y: Math.sign(ends[1].y - ends[0].y) };
    const perp = { x: along.y, y: along.x };
    // グリッド上の点 → 画面（h は地面からの高さ）
    const at = (gx: number, gy: number, h = 0) => {
      const q = iso(gx, gy);
      return { x: q.sx, y: q.sy + TH / 2 - h };
    };
    const swingOut = Math.abs(seat.x - mid.x + (seat.y - mid.y));
    const seatLift = 5 + Math.round(swingOut * 3);
    // 枠：両側の A 字の脚（揺れる向きに開く）と、その上に渡した梁
    for (const k of [-0.7, 0.7]) {
      const px = mid.x + perp.x * k;
      const py = mid.y + perp.y * k;
      const apex = at(px, py, FRAME_H);
      for (const [a, color] of [[-0.35, COLORS.rust], [0.35, COLORS.rustDark]] as const) {
        const foot = at(px + along.x * a, py + along.y * a);
        plotLine(ctx, foot.x, foot.y, apex.x, apex.y, color);
      }
    }
    const beam = [-0.7, 0.7].map((k) => at(mid.x + perp.x * k, mid.y + perp.y * k, FRAME_H));
    plotLine(ctx, beam[0].x, beam[0].y, beam[1].x, beam[1].y, COLORS.rustLight);
    // 座席の影、吊り棒、座席（梁と平行な板）
    const s = at(seat.x, seat.y);
    ctx.globalAlpha = 0.45;
    fillEllipse(ctx, s.x, s.y, 5, 1, '#000');
    ctx.globalAlpha = 1;
    const lift = seatLift + 4;
    for (const k of [-0.3, 0.3]) {
      const hook = at(mid.x + perp.x * k, mid.y + perp.y * k, FRAME_H);
      const hang = at(seat.x + perp.x * k, seat.y + perp.y * k, lift);
      plotLine(ctx, hook.x, hook.y, hang.x, hang.y, COLORS.rustDark);
    }
    const corner = (kp: number, ka: number, h: number) =>
      at(seat.x + perp.x * kp + along.x * ka, seat.y + perp.y * kp + along.y * ka, h);
    const plank = (h: number) => [corner(-0.35, -0.15, h), corner(0.35, -0.15, h), corner(0.35, 0.15, h), corner(-0.35, 0.15, h)];
    fillQuad(ctx, plank(lift - 1), COLORS.rust); // 板の厚み
    fillQuad(ctx, plank(lift), COLORS.seatPaint);
  }

  private gem(cx: number, bottom: number): void {
    const ctx = this.lctx;
    const rows = [2, 4, 6, 4, 2];
    for (let i = 0; i < rows.length; i++) {
      const w = rows[i];
      ctx.fillStyle = COLORS.gem;
      ctx.fillRect(cx - w / 2, bottom - rows.length + i, w, 1);
      if (i >= 2) {
        ctx.fillStyle = COLORS.gemDark;
        ctx.fillRect(cx, bottom - rows.length + i, w / 2, 1);
      }
    }
  }

  private patrol(cx: number, cy: number, tickF: number): void {
    const ctx = this.lctx;
    ctx.globalAlpha = 0.45;
    fillEllipse(ctx, cx, cy, 5, 1, '#000');
    ctx.globalAlpha = 1;
    const top = cy - 13 + Math.round(Math.sin(tickF * 0.8));
    fillPrismSides(ctx, cx, top, 12, 6, 6, COLORS.hazardL, COLORS.hazardR);
    fillDiamond(ctx, cx, top, 12, 6, COLORS.hazard);
  }

  private periodic(sx: number, sy: number, active: boolean, blink: boolean): void {
    const ctx = this.lctx;
    if (active) {
      ctx.fillStyle = COLORS.hazardL;
      ctx.fillRect(sx - 2, sy - 11, 2, 11 + TH / 2);
      ctx.fillStyle = COLORS.hazardR;
      ctx.fillRect(sx, sy - 11, 2, 11 + TH / 2);
      ctx.fillStyle = COLORS.hazard;
      ctx.fillRect(sx - 2, sy - 13, 4, 2);
    } else {
      strokeDiamond(ctx, sx, sy + 2, TW - 8, TH - 4, blink ? COLORS.warn : COLORS.hazardL);
    }
  }

  /**
   * 足元のマスを拍に合わせて光らせる（拍の頭で光って次の拍までに引く）。小節の頭は金色（HUD の拍の点と同じ）。
   * 八分・十六分のゾーンでは、動ける各カウントにも弱く光り、細かく刻んでいることを足元で見せる。
   * tick はカウント中なら負
   */
  private beatTile(sim: Sim, tick: number): void {
    const ctx = this.lctx;
    const interval = ZONE_INTERVAL[sim.stage.cell(sim.x, sim.y)!.zone];
    const beatPulse = 1 - mod(tick, TICKS_PER_BEAT) / TICKS_PER_BEAT;
    const countPulse = interval < TICKS_PER_BEAT ? (1 - mod(tick, interval) / interval) * 0.5 : 0;
    // 色数を増やさないよう、明るさは4段階
    const level = Math.floor(Math.max(beatPulse, countPulse) * 4) / 4;
    const downbeat = mod(Math.floor(tick / TICKS_PER_BEAT), 4) === 0;
    const color = downbeat ? COLORS.gem : COLORS.text;
    const { sx, sy } = iso(sim.x, sim.y);
    ctx.globalAlpha = 0.1 + level * 0.3;
    fillDiamond(ctx, sx, sy + 1, TW - 4, TH - 2, color);
    ctx.globalAlpha = 0.25 + level * 0.75;
    strokeDiamond(ctx, sx, sy, TW, TH, color);
    ctx.globalAlpha = 1;
  }

  /** クリア演出の少女：扉の前で奥を向き、光に包まれて溶け、ふわりと浮いて消える */
  private playerEntering(cx: number, cy: number, e: number): void {
    if (e >= CLEAR.gone) return;
    const ctx = this.lctx;
    const left = cx - GIRL_FOOT_X;
    const top = cy - GIRL_FOOT_Y;
    const u = clamp01((e - CLEAR.glow) / (CLEAR.gone - CLEAR.glow));
    const step = (v: number) => Math.round(v * 4) / 4;
    if (u < 0.5) {
      ctx.drawImage(this.girl[GIRL_DIR.up][0], left, top);
      ctx.globalAlpha = step(u * 2);
      ctx.drawImage(this.girlGlow, left, top);
    } else {
      ctx.globalAlpha = step(1 - (u - 0.5) * 2);
      ctx.drawImage(this.girlGlow, left, top - Math.round((u - 0.5) * 12));
    }
    ctx.globalAlpha = 1;
  }

  /** クリア演出の光：扉の足元に広がる光、扉から立ち上る光の柱、昇っていく光の粒 */
  private clearLight(cx: number, ground: number, e: number): void {
    const ctx = this.lctx;
    // 足元の光（扉のまわりのマスへ広がる）
    const spread = Math.min(TW * 2, 8 + Math.floor(e * 40) * 2);
    ctx.globalAlpha = 0.25;
    fillDiamond(ctx, cx, ground - spread / 4, spread, spread / 2, COLORS.goal);
    // 光の柱。芯は濃く、外側は薄い
    const w = Math.min(12, Math.floor(e * 24) * 2);
    if (w > 0) {
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = COLORS.goal;
      ctx.fillRect(cx - w / 2, ground - LH * 2, w, LH * 2 - 2);
      ctx.globalAlpha = 0.45;
      ctx.fillRect(cx - w / 4, ground - LH * 2, w / 2, LH * 2 - 2);
    }
    // 光の粒：柱のまわりを昇って消える。位置は番号から決める（毎フレーム同じ動き）
    ctx.fillStyle = COLORS.goal;
    for (let i = 0; i < 24; i++) {
      const life = 1.6;
      const age = e - 0.2 - ((i * 0.137) % life);
      if (age < 0) continue;
      const a = age % life;
      const x = cx + ((i * 7) % 15) - 7 + Math.round(Math.sin(a * 3 + i) * 2);
      const y = ground - 4 - Math.round(a * 40);
      ctx.globalAlpha = Math.ceil((1 - a / life) * 3) / 3;
      ctx.fillRect(x, y, 1, i % 3 === 0 ? 2 : 1);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * 少女。向きは斜め見下ろしの画面に合わせる（上・左へ進むときは背面で奥へ歩く）。
   * 1マス進むあいだに歩きのコマを3つ送り、マスの偶奇で左右の足を入れ替える。止まっていれば立ちのコマ
   * 拍に乗って体を揺らす：拍の頭から半拍は頭と胴を1ドット沈め、残りの半拍で戻す。脚は地面に残す
   * step: 移動の進み具合 0〜1（1 で止まっている）
   */
  private player(cx: number, cy: number, facing: Dir, step: number, odd: boolean, tickF: number): void {
    const ctx = this.lctx;
    ctx.globalAlpha = 0.45;
    fillEllipse(ctx, cx, cy, 4, 1, '#000');
    ctx.globalAlpha = 1;
    const frame = step < 1 ? 1 + Math.min(2, Math.floor(step * 3)) + (odd ? 3 : 0) : 0;
    const img = this.girl[GIRL_DIR[facing]][frame];
    const left = cx - GIRL_FOOT_X;
    const top = cy - GIRL_FOOT_Y;
    const dip = mod(tickF, TICKS_PER_BEAT) < TICKS_PER_BEAT / 2 ? 1 : 0;
    const w = GIRL_WAIST_Y;
    ctx.drawImage(img, 0, w, GIRL_W, GIRL_H - w, left, top + w, GIRL_W, GIRL_H - w);
    ctx.drawImage(img, 0, 0, GIRL_W, w, left, top + dip, GIRL_W, w);
  }

  // ---- 文字・HUD ----

  /** (x, y) の y は文字の縦中央。scale は整数 */
  text(text: string, x: number, y: number, scale: number, color: string, align: 'left' | 'center' | 'right' = 'left'): void {
    const w = textWidth(text, scale);
    const left = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
    const top = Math.round(y - (GLYPH_H * scale) / 2);
    drawText(this.lctx, text, left + 1, top + 1, scale, COLORS.bg);
    drawText(this.lctx, text, left, top, scale, color);
  }

  hud(sim: Sim, songTime: number, tickSec: number): void {
    const ctx = this.lctx;
    const beatSec = tickSec * TICKS_PER_BEAT;

    this.text(`SCORE ${String(sim.score).padStart(6, '0')}`, 6, 7, 1, COLORS.text);
    this.text(`*${sim.multiplier}`, 6, 15, 1, sim.multiplier > 1 ? COLORS.gem : COLORS.textDim);
    if (sim.misses > 0) this.text(`MISS ${sim.misses}`, 6, 23, 1, COLORS.textDim);

    const remain = Math.max(0, sim.totalTicks * tickSec - Math.max(0, songTime));
    const mm = Math.floor(remain / 60);
    const ss = Math.floor(remain % 60);
    this.text(`${mm}:${String(ss).padStart(2, '0')}`, LW - 6, 7, 1, remain < 10 ? COLORS.warn : COLORS.text, 'right');
    const bar = Math.min(sim.stage.def.bars, Math.max(0, Math.floor(songTime / (beatSec * 4))) + 1);
    this.text(`BAR ${bar}/${sim.stage.def.bars}`, LW - 6, 15, 1, COLORS.textDim, 'right');

    // 拍の表示：4つの点のうち今の拍が光る
    const beat = Math.floor(songTime / beatSec);
    const beatInBar = ((beat % 4) + 4) % 4;
    const fresh = songTime / beatSec - beat < 0.25;
    for (let i = 0; i < 4; i++) {
      const cx = LW / 2 - 12 + i * 8;
      const on = i === beatInBar;
      const color = on ? (i === 0 ? COLORS.gem : COLORS.text) : COLORS.dot;
      const r = on && fresh ? 2 : 1;
      fillEllipse(ctx, cx, 7, r, r, color);
    }
    const zone = sim.stage.cell(sim.x, sim.y)!.zone;
    this.text(ZONE_LABEL[zone], LW / 2, 15, 1, zone === 0 ? COLORS.textDim : COLORS.warn, 'center');

    if (songTime < 0) {
      const n = Math.ceil(-songTime / beatSec);
      this.text(String(n), LW / 2, LH / 2 - 36, 4, COLORS.text, 'center');
    }
  }

  /** クリアの結果の欄。e はゴールしてからの秒。CLEAR.panel から出て、得点を1行ずつ数え上げる */
  clearResult(sim: Sim, e: number, note: string | null = null): void {
    const t = e - CLEAR.panel;
    if (t < 0) return;
    const ctx = this.lctx;
    // 帯は光の柱が上下に見えるよう画面の中ほどだけ
    ctx.globalAlpha = Math.min(0.75, Math.ceil(t * 8) / 8);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 50, LW, 186);
    ctx.globalAlpha = 1;

    const title = 'CLEAR';
    this.text(title.slice(0, Math.floor(t / 0.08)), LW / 2 - textWidth(title, 3) / 2, 74, 3, COLORS.goal);
    if (t > 0.3) this.text(sim.stage.def.name.replace(/(\d+)$/, ' $1'), LW / 2, 94, 1, COLORS.textDim, 'center');

    const remainBeats = sim.goalBonus / GOAL_BONUS_PER_BEAT;
    const rows = [
      { label: 'SCORE', value: sim.score - sim.goalBonus, y: 120, prefix: '' },
      { label: 'GOAL BONUS', value: sim.goalBonus, y: 140, prefix: '+', note: `${remainBeats} BEATS LEFT` },
      { label: 'MISS', value: sim.misses, y: 166, prefix: '' },
      { label: 'TOTAL', value: sim.score, y: 196, prefix: '', big: true },
    ];
    rows.forEach((r, i) => {
      const rt = t - CLEAR.rows[i];
      if (rt < 0) return;
      const shown = Math.round(r.value * clamp01(rt / CLEAR.count));
      const done = rt >= CLEAR.count;
      const scale = r.big ? 2 : 1;
      const color = r.big ? (done && Math.floor(rt * 6) % 2 === 0 && rt < CLEAR.count + 0.6 ? COLORS.text : COLORS.gem) : COLORS.text;
      this.text(r.label, 64, r.y, scale, r.big ? COLORS.gem : COLORS.textDim);
      this.text(`${r.prefix}${shown}`, LW - 64, r.y, scale, color, 'right');
      if (r.note && done) this.text(r.note, LW - 64, r.y + 9, 1, COLORS.textDim, 'right');
    });
    if (e >= CLEAR.end && note) this.text(note, LW / 2, 104, 1, COLORS.goal, 'center');
    if (e >= CLEAR.end && Math.floor(e * 2) % 2 === 0) this.text('ENTER: RETRY   ESC: TITLE', LW / 2, 222, 1, COLORS.gem, 'center');
  }

  overlay(lines: { text: string; scale?: number; color?: string }[]): void {
    const ctx = this.lctx;
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, LW, LH);
    ctx.globalAlpha = 1;
    const lineH = (l: { scale?: number }) => GLYPH_H * (l.scale ?? 1) + 5;
    const total = lines.reduce((s, l) => s + lineH(l), 0);
    let y = Math.round(LH / 2 - total / 2);
    for (const l of lines) {
      const h = lineH(l);
      if (l.text) this.text(l.text, LW / 2, y + h / 2, l.scale ?? 1, l.color ?? COLORS.text, 'center');
      y += h;
    }
  }
}
