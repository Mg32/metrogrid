import { FlowHazard, PatrolHazard, PeriodicHazard, SwingHazard } from '../game/hazard.ts';
import { GOAL_BONUS_PER_BEAT, type Sim } from '../game/sim.ts';
import type { FloorStyle, PropKind, Stage } from '../game/stage.ts';
import { DIR_VEC, mod, TICKS_PER_BEAT, ZONE_INTERVAL, type Dir, type Vec, type Zone } from '../game/types.ts';
import { drawText, GLYPH_H, textWidth } from './font.ts';
import {
  ditherDiamond,
  fillDiamond,
  fillEllipse,
  fillPrismSides,
  fillQuad,
  iso,
  makeSprite,
  plotLine,
  strokeDiamond,
  strokeIsoRing,
  TH,
  TW,
} from './pixel.ts';
import { drawEnding, drawTitle } from './ending.ts';
import { STICK_RADIUS } from '../touch.ts';
import { GIRL_FOOT_X, GIRL_FOOT_Y, GIRL_FRAMES, GIRL_H, GIRL_RAISE, GIRL_W, GIRL_WAIST_Y, paintGirl } from './girl.ts';

/**
 * 288x288 のバッファに描き、実画素で整数倍（見た目で x1〜x4）に拡大して表示する。
 * ぼやけを防ぐため、バッファへの描画はすべて整数座標の fillRect / drawImage で行う（パスやアンチエイリアスを使わない）。
 */
const LW = 288;
const LH = 288;
const MAX_SCALE = 4;
/** 闇に浮かぶ道の板の厚み */
const FLOOR_THICK = 6;
const PLAYER_H = 21;

/** 床の見た目ごと・街灯の明るさの段階ごとの道の色（0: 闇、1: 街灯から2マス、2: 街灯のすぐそば）。各段階はゾーン別 */
const FLOOR_LIGHT: Record<FloorStyle, { edge: string; road: string[] }[]> = {
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
  // 家の中：古い板の間、土間（三和土）、日に焼けた畳
  wood: [
    { edge: '#2e241e', road: ['#4a3a2e', '#3c2f26', '#2e241e'] },
    { edge: '#3a2c22', road: ['#5a4634', '#4a3a2c', '#382c22'] },
    { edge: '#46342a', road: ['#6b533c', '#574432', '#433427'] },
  ],
  tataki: [
    { edge: '#34322f', road: ['#4b4843', '#3e3b37', '#312f2c'] },
    { edge: '#3c3934', road: ['#58544c', '#48453f', '#393632'] },
    { edge: '#46423a', road: ['#686256', '#555047', '#423e38'] },
  ],
  tatami: [
    { edge: '#2f2c1e', road: ['#545037', '#45422e', '#363425'] },
    { edge: '#38331f', road: ['#625c3d', '#504b33', '#3f3b29'] },
    { edge: '#423b22', road: ['#736b45', '#5e5839', '#49442e'] },
  ],
  // 通り：古い石畳と、新しいアスファルト（時代が重なっている）
  cobble: [
    { edge: '#36332f', road: ['#57524a', '#47433d', '#383530'] },
    { edge: '#3e3a33', road: ['#655e53', '#524c44', '#403c36'] },
    { edge: '#4a443a', road: ['#776d5e', '#61594d', '#4a453c'] },
  ],
  asphalt: [
    { edge: '#2a2a30', road: ['#3e3f47', '#33343b', '#292a30'] },
    { edge: '#323138', road: ['#4a4952', '#3d3c44', '#302f36'] },
    { edge: '#3c3a3e', road: ['#5a5759', '#4a4749', '#3a383a'] },
  ],
  // 屋根：いぶし銀の瓦
  roof: [
    { edge: '#2c2f37', road: ['#474c58', '#3b3f49', '#2f323a'] },
    { edge: '#33363d', road: ['#535866', '#454a55', '#363a42'] },
    { edge: '#3d3e42', road: ['#626670', '#52555e', '#404349'] },
  ],
};
const ROAD_LIGHT = FLOOR_LIGHT.alley;
const FLOOR_STYLES = Object.keys(FLOOR_LIGHT) as FloorStyle[];
/** 遊具の柱、ブランコの枠などの高さ */
const POLE_H = 26;
const FRAME_H = 22;
/** 振り子を描くときの、グリッドの1マスの長さ（高さのドットと同じ単位にそろえる。クォータービューでの1マスの見た目の長さ） */
const CELL_LEN = 14;
/** 振り切ったときの竿の傾き（真下からの角度）の上限 */
const MAX_SWING_ANGLE = (70 * Math.PI) / 180;

/**
 * 振り子の竿の長さ（ドット）。振れ幅 reach（マス）を、MAX_SWING_ANGLE までの傾きで振り切れる長さ。
 * minLength より短くはしない
 */
function pendulumLength(reach: number, minLength: number): number {
  return Math.max(minLength, Math.ceil(((reach + 0.5) * CELL_LEN) / Math.sin(MAX_SWING_ANGLE)));
}

/**
 * 支点の高さ pivotH（ドット）から長さ length の竿で吊った錘が、振れの向きに u マス（支点の真下が 0）ずれたときの、錘の高さ（ドット）。
 * 錘は支点を中心とする円の上を動くので、竿の長さは変わらず、振れるほど持ち上がる。
 * 錘の真下（地面に落とした位置）は u のままなので、危険なマス（錘の真下のマス）と見た目がずれない
 */
function pendulumHeight(u: number, length: number, pivotH: number): number {
  const d = Math.min(Math.abs(u) * CELL_LEN, length);
  return pivotH - Math.sqrt(length * length - d * d);
}
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
  // 停止マス（ぐらつく踏み石）
  stop: '#c2b8a0',
  stopSide: '#6d6658',
  stopMark: '#4a4438',
  stopEdge: '#e0a050',
  stopReady: '#9fc98a',
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
  // 通り
  rail: '#7a7670',
  tramGreen: '#3f6a52',
  tramGreenDark: '#2e5040',
  tramCream: '#d8cfb4',
  tramCreamDark: '#b3aa90',
  tramRoof: '#8a8478',
  tramWindow: '#c9d8c0',
  shutter: '#6d6f73',
  shutterDark: '#4f5155',
  signboard: '#8a3a2e',
  // 家の中
  getabako: '#4a3426',
  windowGlass: '#7e98a8',
  sinkTop: '#8c9096',
  fusuma: '#bdb39a',
  fusumaPattern: '#978a6c',
  // 屋根の連なり
  roofShine: '#5f6573',
  antenna: '#85878c',
  brick: '#6e4a3e',
  brickDark: '#4f342c',
  cloth: '#9c9584',
  snow: '#e4e8ec',
  snowShade: '#a9b2be',
  // 色あせた鯉のぼり（真鯉・緋鯉・子鯉）：[胴, 模様, 腹]
  koi: [
    ['#4a4c55', '#33343b', '#8f8a80'],
    ['#94605a', '#6f4540', '#b3a597'],
    ['#566c86', '#3f5066', '#a3a59f'],
  ],
  koiEye: '#cfc8b8',
  // 家の中の物
  brass: '#b08a3c',
  brassDark: '#7a5e28',
  brassLight: '#e0c47a',
  dial: '#d6cdb6',
  fanBody: '#9fb2a4',
  fanDark: '#6f8274',
  fanGuard: '#8e9394',
  fanBlade: '#cfdcd4',
};

/** ハブの入口の光の色（行き先の景色の色） */
const PORTAL_LIGHT: Record<string, string> = {
  STAGE1: '#e8d9b0',
  STAGE2: '#b8d8b0',
  STAGE3: '#c0c8e8',
  STAGE4: '#d8dce8',
  STAGE5: '#e8c8b8',
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

function makeRoadSprite(zone: Zone, light: number, style: FloorStyle): HTMLCanvasElement {
  const pal = FLOOR_LIGHT[style][light];
  const seam = FLOOR_LIGHT[style][0].edge;
  return makeSprite(TW, TH + FLOOR_THICK + 1, (ctx) => {
    const cx = TW / 2;
    fillSlabSides(ctx, cx, 0, TW, TH, FLOOR_THICK);
    fillDiamond(ctx, cx, 0, TW, TH, pal.edge);
    fillDiamond(ctx, cx, 1, TW - 4, TH - 2, pal.road[zone]);
    // 床の模様（タイルの間隔 12,6 で周期がそろう式にして、継ぎ目でずれないようにする）
    if (style === 'wood') {
      // 板の継ぎ目（x 方向に延びる板）
      ditherDiamond(ctx, cx, 1, TW - 4, TH - 2, seam, (x, y) => (x - 2 * y + 48) % 8 === 0);
    } else if (style === 'tatami') {
      ditherDiamond(ctx, cx, 1, TW - 4, TH - 2, pal.edge, (x, y) => (x + 2 * y) % 4 === 0 && y % 2 === 0);
    } else if (style === 'cobble') {
      ditherDiamond(ctx, cx, 1, TW - 4, TH - 2, seam, (x, y) => (x + 2 * y) % 6 === 0 || (x - 2 * y + 48) % 6 === 0);
    } else if (style === 'roof') {
      // 瓦の列（x 方向に並ぶ）。列の継ぎ目と、丸い瓦の背の光
      ditherDiamond(ctx, cx, 1, TW - 4, TH - 2, seam, (x, y) => (x - 2 * y + 48) % 6 === 0);
      ditherDiamond(ctx, cx, 1, TW - 4, TH - 2, COLORS.roofShine, (x, y) => (x - 2 * y + 48) % 6 === 3 && x % 2 === 0);
    } else if (style === 'tataki' || style === 'asphalt') {
      ditherDiamond(ctx, cx, 1, TW - 4, TH - 2, pal.edge, (x, y) => (x * 7 + y * 13) % 17 === 0);
    }
    if (zone === 0) {
      if (style === 'garden') {
        // 飛び石：中ほどに平たい石が1枚
        fillDiamond(ctx, cx, 3, TW - 10, TH - 6, COLORS.stepStone);
        fillDiamond(ctx, cx, 3, TW - 12, TH - 7, COLORS.stepStoneTop);
        ditherDiamond(ctx, cx, 1, TW - 4, TH - 2, COLORS.moss, (x, y) => (x * 5 + y * 11) % 19 === 0);
      } else if (style === 'alley') {
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
    fillDiamond(ctx, cx, 0, TW, TH, FLOOR_LIGHT.garden[0].edge);
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
const BLOCK_PROPS = new Set<PropKind>(['entrance', 'door', 'engawa', 'fence', 'shop', 'window', 'getabako', 'sink', 'fusuma']);
/** 背の高い小物（プレイヤーに重なるときに透かす範囲が広い） */
const TALL_PROPS = new Set<PropKind>(['lamp', 'pole', 'antenna', 'chimney']);

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
  /** 道のタイル：[床の見た目][明るさ][ゾーン] */
  private roads = {} as Record<FloorStyle, HTMLCanvasElement[][]>;
  /** 水のマス：[さざ波のコマ][ゾーン] */
  private water: HTMLCanvasElement[][];
  private facade: HTMLCanvasElement;
  private base: HTMLCanvasElement;
  private footing: HTMLCanvasElement;
  private hole: HTMLCanvasElement;
  /** 少女：[正面, 背面][立ち, 歩き]、左右反転したものも */
  private girl: HTMLCanvasElement[][];
  private girlGlow: HTMLCanvasElement;
  /** エンディングで手を挙げる少女 */
  private girlRaise: HTMLCanvasElement;
  /** ハブの入口の下に出す一言（クリア済みなど）。main.ts が設定する */
  portalNote: (stage: string) => string | null = () => null;
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
    for (const style of FLOOR_STYLES) {
      this.roads[style] = [0, 1, 2].map((light) => [0, 1, 2].map((z) => makeRoadSprite(z as Zone, light, style)));
    }
    this.water = [0, 1].map((frame) => [0, 1, 2].map((z) => makeWaterSprite(z as Zone, frame)));
    this.facade = makeFacadeSprite();
    this.base = makeBaseSprite();
    this.footing = makeFootingSprite();
    this.hole = makeHoleSprite();
    this.lot = makeLotSprite();
    this.girl = makeGirlSprites();
    this.girlGlow = makeGlowSprite(this.girl[GIRL_DIR.up][0]);
    this.girlRaise = makeSprite(GIRL_W, GIRL_H, (ctx) => paintGirl(ctx, GIRL_RAISE));

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
  /** これまでに溜めた得点の総計（拠点の画面に出す）。main.ts が設定する */
  totalScore = 0;
  /** タッチで遊んでいるか（ボタンを出し、キーの案内を出さない）。main.ts が設定する */
  touchUI = false;

  /** ページ上の座標（clientX, clientY）→ 288x288 のバッファ上の座標 */
  toBuffer(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.main.getBoundingClientRect();
    const dx = (clientX - rect.left) * (this.main.width / rect.width);
    const dy = (clientY - rect.top) * (this.main.height / rect.height);
    return { x: (dx - this.ox) / this.scale, y: (dy - this.oy) / this.scale };
  }

  /**
   * タッチで歩くときの目印：指を置いた中心に菱形の枠（タイルと同じ向き）、指の位置に小さな菱形。
   * 歩いている向きの辺（右上の辺なら up）を明るくする。指で隠れても、指のまわりからはみ出して見える大きさにする
   */
  stick(s: { cx: number; cy: number; x: number; y: number; dir: Dir | null }): void {
    const ctx = this.lctx;
    const cx = Math.round(s.cx);
    const cy = Math.round(s.cy);
    const w = STICK_RADIUS * 2 + 8;
    const h = w / 2;
    const top = cy - h / 2;
    ctx.globalAlpha = 0.45;
    strokeDiamond(ctx, cx, top, w, h, COLORS.textDim);
    ctx.globalAlpha = 1;
    if (s.dir) {
      // 菱形の頂点：上・右・下・左。up は上→右の辺、right は右→下、down は下→左、left は左→上
      const v = [
        [cx, top],
        [cx + w / 2, cy],
        [cx, top + h],
        [cx - w / 2, cy],
      ];
      const i = { up: 0, right: 1, down: 2, left: 3 }[s.dir];
      const [a, b] = [v[i], v[(i + 1) % 4]];
      plotLine(ctx, a[0], a[1], b[0], b[1], COLORS.gem);
      // 内側にもう1本重ねて太くする
      const inward = [1, -1, -1, 1][i];
      plotLine(ctx, a[0], a[1] + inward, b[0], b[1] + inward, COLORS.gem);
    }
    ctx.globalAlpha = 0.7;
    fillDiamond(ctx, Math.round(s.x), Math.round(s.y) - 3, 12, 6, COLORS.text);
    ctx.globalAlpha = 1;
  }

  /** タッチ用のボタン（バッファ上の矩形）。selected は選んでいる状態（確認の YES など） */
  buttons(list: { label: string; x: number; y: number; w: number; h: number; selected?: boolean }[]): void {
    const ctx = this.lctx;
    for (const b of list) {
      // ラベルのないボタンは、もとからある文字を枠で囲むだけ（下地を塗らない）
      if (b.label) {
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.globalAlpha = 1;
      }
      const edge = b.selected ? COLORS.gem : COLORS.dot;
      ctx.fillStyle = edge;
      ctx.fillRect(b.x, b.y, b.w, 1);
      ctx.fillRect(b.x, b.y + b.h - 1, b.w, 1);
      ctx.fillRect(b.x, b.y, 1, b.h);
      ctx.fillRect(b.x + b.w - 1, b.y, 1, b.h);
      this.text(b.label, b.x + b.w / 2, b.y + b.h / 2, 1, b.selected ? COLORS.gem : COLORS.text, 'center');
    }
  }

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
        else ctx.drawImage(this.roads[cell.floor][light[stage.index(x, y)]][cell.zone], sx - TW / 2, sy);

        const obj = cell.obj;
        if (obj?.type === 'bridge') {
          this.bridge(sx, sy, stage.cell(x - 1, y)?.water || stage.cell(x + 1, y)?.water ? 'x' : 'y');
        } else if (obj?.type === 'rail') {
          const along = stage.cell(x - 1, y)?.obj?.type === 'rail' || stage.cell(x + 1, y)?.obj?.type === 'rail' ? 'x' : 'y';
          this.rails(sx, sy, along);
        } else if (obj?.type === 'stop') {
          const on = sim.x === x && sim.y === y;
          this.stopTile(sx, sy, on ? (sim.stillTicks >= TICKS_PER_BEAT ? 'ready' : 'waiting') : 'idle', tickF);
        } else if (obj?.type === 'oneway') {
          this.arrow(sx, sy + TH / 2, DIR_VEC[obj.dir].x, DIR_VEC[obj.dir].y);
        }
      }
    }
    ctx.globalAlpha = 1;

    if (sim.status === 'playing') this.beatTile(sim, songTime / tickSec);

    // 立体物は奥行き順に描く
    const sprites: { depth: number; draw: () => void }[] = [];
    const labels: { x: number; y: number; text: string; color: string }[] = [];
    const feet = p.sy + TH / 2;
    // 停止マスの上で、まだ1拍たっていない：足元を確かめるあいだ「WAIT」
    if (sim.status === 'playing' && stage.cell(sim.x, sim.y)?.obj?.type === 'stop' && sim.stillTicks < TICKS_PER_BEAT) {
      labels.push({ x: p.sx, y: p.sy - 26, text: 'WAIT', color: COLORS.stopEdge });
    }

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
          const height = BLOCK_PROPS.has(kind) ? FACADE_H : TALL_PROPS.has(kind) ? POLE_H + 6 : 16;
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
        } else if (cell.obj?.type === 'portal') {
          // ハブの入口：その先の景色の色で光る戸口。近づくと行き先が出る
          const target = cell.obj.stage;
          const pulse = 1 - (tickF % TICKS_PER_BEAT) / TICKS_PER_BEAT;
          sprites.push({
            depth: x + y + 0.3,
            draw: () => (target === 'UPSTAIRS' ? this.stairs(sx, sy) : this.goalDoor(sx, sy, pulse, PORTAL_LIGHT[target])),
          });
          if (Math.max(Math.abs(x - px), Math.abs(y - py)) <= 3) {
            labels.push({ x: sx, y: sy - 30, text: target.replace(/(\d+)$/, ' $1'), color: target === 'UPSTAIRS' ? COLORS.textDim : COLORS.text });
            const note = this.portalNote(target);
            if (note) labels.push({ x: sx, y: sy - 22, text: note, color: COLORS.gem });
          }
        }
      }
    }

    for (const s of sim.scores) {
      // クリア演出のあいだは、残った得点マスは道と一緒に消えるので出さない
      if (!s.alive || clearSec !== null) continue;
      const { sx, sy } = iso(s.x, s.y);
      const bob = Math.round(Math.sin(tickF * 0.4 + s.x));
      sprites.push({ depth: s.x + s.y + 0.3, draw: () => this.gem(sx, sy + TH / 2 - 3 + bob) });
      labels.push({ x: sx, y: sy - 8, text: String(s.value), color: COLORS.gem });
    }

    // 遊具はゴールした瞬間に消える
    for (const [hazardIndex, h] of (clearSec === null ? sim.hazards : []).entries()) {
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
        } else if (h.look === 'tram' || h.look === 'koinobori') {
          // 路面電車・鯉のぼり：先頭と、通ってきたマスにまたがる胴。向きは先頭の進む向き
          const back = h.posAtStep(step - h.length);
          const prev = h.posAtStep(step - h.length + 1);
          const tail = { x: lerp(back.x, prev.x, hk), y: lerp(back.y, prev.y, hk) };
          const head = { x: hx, y: hy };
          const n = hazardIndex;
          sprites.push({
            depth: Math.max(hx + hy, tail.x + tail.y) + 0.5,
            draw: () => (h.look === 'tram' ? this.tram(head, tail) : this.koinobori(head, tail, tickF, n)),
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
        if (h.look === 'fan' && h.pivot) {
          const pv = h.pivot;
          sprites.push({ depth: Math.max(seat.x + seat.y, pv.x + pv.y) + 0.45, draw: () => this.fan(pv, seat, tickF) });
          continue;
        }
        sprites.push({
          depth: seat.x + seat.y + 0.45,
          draw: () => (h.look === 'pendulum' ? this.pendulum(ends, seat, h.reach) : this.swing(ends, seat, h.reach)),
        });
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
        if (h.look === 'snow') {
          const depth = Math.max(...h.cells.map((c) => c.x + c.y)) + 0.4;
          sprites.push({ depth, draw: () => this.snow(h, tickF, soon, now % 2 === 0) });
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

  /**
   * 停止マス（企画書 第5.4節の案「ぐらつく踏み石」）：一段高い淡い色の踏み石に、一時停止の記号（‖）。拍ごとに縁が琥珀色に光る。
   * 乗って1拍たつまでは石がぐらつき（waiting）、1拍たつと落ち着いて緑がかる（ready。進んでよい）
   */
  private stopTile(sx: number, sy: number, state: 'idle' | 'waiting' | 'ready', tickF: number): void {
    const ctx = this.lctx;
    const beat = mod(tickF, TICKS_PER_BEAT) / TICKS_PER_BEAT;
    // 縁の光：拍の頭で強く、次の拍までに引く
    if (state !== 'ready') {
      ctx.globalAlpha = 0.6 + 0.4 * (1 - beat);
      strokeDiamond(ctx, sx, sy, TW, TH, COLORS.stopEdge);
      ctx.globalAlpha = 1;
    }
    const wobble = state === 'waiting' ? (Math.floor(tickF * 2) % 2 === 0 ? -1 : 1) : 0;
    const top = sy + 2 - 2;
    const cx = sx + wobble;
    fillPrismSides(ctx, cx, top, TW - 6, TH - 3, 2, COLORS.stopSide, COLORS.stopSide);
    fillDiamond(ctx, cx, top, TW - 6, TH - 3, state === 'ready' ? COLORS.stopReady : COLORS.stop);
    // 一時停止の記号
    ctx.fillStyle = COLORS.stopMark;
    const my = top + Math.floor((TH - 3) / 2);
    ctx.fillRect(cx - 3, my - 2, 2, 4);
    ctx.fillRect(cx + 1, my - 2, 2, 4);
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
        if (obj?.type !== 'prop' || !['lamp', 'entrance', 'lantern', 'engawa', 'window'].includes(obj.kind)) continue;
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
      case 'shop':
        // 商店：シャッターの下りた店先と、色あせた看板
        ctx.drawImage(this.facade, sx - TW / 2, sy - FACADE_H);
        for (let i = 1; i <= 10; i++) {
          for (let r = 0; r < 13; r++) fillFaceColumn(ctx, face, sx, sy, i, r, 1, r % 2 === 0 ? COLORS.shutter : COLORS.shutterDark);
          fillFaceColumn(ctx, face, sx, sy, i, 14, 4, COLORS.signboard);
        }
        return;
      case 'window':
        // 居間の窓：壁に開いた窓から、部屋の明かりが漏れる
        ctx.drawImage(this.facade, sx - TW / 2, sy - FACADE_H);
        for (let i = 2; i <= 9; i++) {
          fillFaceColumn(ctx, face, sx, sy, i, 6, 10, i === 2 || i === 9 || i === 5 ? COLORS.wood : COLORS.windowGlass);
          fillFaceColumn(ctx, face, sx, sy, i, 5, 1, COLORS.wood);
        }
        return;
      case 'pole': {
        // 電柱：腕木と碍子
        const top = ground - POLE_H - 6;
        ctx.fillStyle = COLORS.concrete;
        ctx.fillRect(sx - 1, top, 3, POLE_H + 6);
        ctx.fillStyle = COLORS.woodDark;
        ctx.fillRect(sx - 6, top + 4, 13, 2);
        ctx.fillStyle = COLORS.concreteTop;
        for (const dx of [-6, 0, 6]) ctx.fillRect(sx + dx, top + 2, 1, 2);
        return;
      }
      case 'antenna': {
        // テレビのアンテナ：細い竿の先に、長さの違う横木が並ぶ
        const top = ground - POLE_H - 4;
        ctx.fillStyle = COLORS.antenna;
        ctx.fillRect(sx, top, 1, POLE_H + 4);
        for (const [dy, w] of [[2, 11], [5, 9], [8, 7], [11, 5]]) ctx.fillRect(sx - Math.floor(w / 2), top + dy, w, 1);
        ctx.fillStyle = COLORS.lampPole;
        ctx.fillRect(sx - 6, top + 3, 13, 1);
        return;
      }
      case 'laundry':
        // 物干し：2本の柱に竿を渡し、色あせた手ぬぐいが一枚だけ掛かっている
        ctx.fillStyle = COLORS.woodDark;
        ctx.fillRect(sx - 7, ground - 17, 2, 17);
        ctx.fillRect(sx + 5, ground - 17, 2, 17);
        ctx.fillStyle = COLORS.antenna;
        ctx.fillRect(sx - 8, ground - 16, 16, 1);
        ctx.fillStyle = COLORS.cloth;
        ctx.fillRect(sx - 1, ground - 15, 4, 7);
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(sx + 2, ground - 9, 1, 1);
        return;
      case 'chimney':
        // 煙突：煉瓦の角柱。てっぺんに縁
        ctx.fillStyle = COLORS.brick;
        ctx.fillRect(sx - 3, ground - POLE_H - 4, 6, POLE_H + 4);
        ctx.fillStyle = COLORS.brickDark;
        ctx.fillRect(sx, ground - POLE_H - 4, 3, POLE_H + 4);
        for (let r = ground - POLE_H; r < ground; r += 4) ctx.fillRect(sx - 3, r, 3, 1);
        ctx.fillStyle = COLORS.stone;
        ctx.fillRect(sx - 4, ground - POLE_H - 6, 8, 2);
        return;
      case 'sink':
        // 台所の流し台：木の台に、くすんだステンレスの天板
        fillPrismSides(ctx, sx, sy - 12, TW - 6, TH - 3, 12, COLORS.getabako, COLORS.wood);
        fillDiamond(ctx, sx, sy - 12, TW - 6, TH - 3, COLORS.sinkTop);
        fillDiamond(ctx, sx, sy - 10, TW - 14, TH - 7, COLORS.glassDim);
        return;
      case 'fusuma':
        // 襖：二枚の襖。日に焼けた紙に、少し濃い色の小さな柄
        ctx.drawImage(this.facade, sx - TW / 2, sy - FACADE_H);
        for (let i = 1; i <= 10; i++) {
          const frame = i === 1 || i === 5 || i === 6 || i === 10;
          for (let r = 0; r < 17; r++) {
            const color = frame || r === 0 || r === 16 ? COLORS.woodDark : (i * 3 + r * 5) % 7 === 0 ? COLORS.fusumaPattern : COLORS.fusuma;
            fillFaceColumn(ctx, face, sx, sy, i, r, 1, color);
          }
        }
        // 引手
        fillFaceColumn(ctx, face, sx, sy, 3, 8, 2, COLORS.woodDark);
        fillFaceColumn(ctx, face, sx, sy, 8, 8, 2, COLORS.woodDark);
        return;
      case 'getabako':
        // 下駄箱：低い木の箱
        fillPrismSides(ctx, sx, sy - 12, TW - 6, TH - 3, 12, COLORS.getabako, COLORS.wood);
        fillDiamond(ctx, sx, sy - 12, TW - 6, TH - 3, COLORS.bridge);
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

  /** 線路：枕木と2本のレール。along は線路の延びる向き */
  private rails(sx: number, sy: number, along: 'x' | 'y'): void {
    const ctx = this.lctx;
    const pt = (u: number, v: number) => {
      const gx = along === 'x' ? u : v;
      const gy = along === 'x' ? v : u;
      return { x: Math.round(sx + ((gx - gy) * TW) / 2), y: Math.round(sy + TH / 2 + ((gx + gy) * TH) / 2) };
    };
    for (const u of [-0.25, 0.25]) {
      const a = pt(u, -0.35);
      const b = pt(u, 0.35);
      plotLine(ctx, a.x, a.y, b.x, b.y, COLORS.woodDark);
    }
    for (const v of [-0.2, 0.2]) {
      const a = pt(-0.5, v);
      const b = pt(0.5, v);
      plotLine(ctx, a.x, a.y, b.x, b.y, COLORS.rail);
    }
  }

  /**
   * 路面電車：もう走っていない路線の車両が、半透明で線路を往復する。head は先頭、tail は最後尾のマス（グリッド、小数）。
   * 車体は線路の向きに長い箱。見える面（+x、+y、上面）だけ塗る
   */
  private tram(head: { x: number; y: number }, tail: { x: number; y: number }): void {
    const ctx = this.lctx;
    const x0 = Math.min(head.x, tail.x) - 0.45;
    const x1 = Math.max(head.x, tail.x) + 0.45;
    const y0 = Math.min(head.y, tail.y) - 0.4;
    const y1 = Math.max(head.y, tail.y) + 0.4;
    const pt = (gx: number, gy: number, h: number) => {
      const q = iso(gx, gy);
      return { x: q.sx, y: q.sy + TH / 2 - h };
    };
    const BODY = 14;
    const ROOF = 17;
    ctx.globalAlpha = 0.45;
    fillQuad(ctx, [pt(x0, y0, 0), pt(x1, y0, 0), pt(x1, y1, 0), pt(x0, y1, 0)], '#000');
    ctx.globalAlpha = 0.7;
    // +y の面（画面の左手前）と +x の面（右手前）。下半分は緑、窓の帯、上は白
    fillQuad(ctx, [pt(x0, y1, 0), pt(x1, y1, 0), pt(x1, y1, BODY), pt(x0, y1, BODY)], COLORS.tramGreen);
    fillQuad(ctx, [pt(x1, y1, 0), pt(x1, y0, 0), pt(x1, y0, BODY), pt(x1, y1, BODY)], COLORS.tramGreenDark);
    fillQuad(ctx, [pt(x0, y1, 7), pt(x1, y1, 7), pt(x1, y1, 12), pt(x0, y1, 12)], COLORS.tramWindow);
    fillQuad(ctx, [pt(x1, y1, 7), pt(x1, y0, 7), pt(x1, y0, 12), pt(x1, y1, 12)], COLORS.tramWindow);
    fillQuad(ctx, [pt(x0, y1, BODY), pt(x1, y1, BODY), pt(x1, y1, ROOF), pt(x0, y1, ROOF)], COLORS.tramCream);
    fillQuad(ctx, [pt(x1, y1, BODY), pt(x1, y0, BODY), pt(x1, y0, ROOF), pt(x1, y1, ROOF)], COLORS.tramCreamDark);
    fillQuad(ctx, [pt(x0, y0, ROOF), pt(x1, y0, ROOF), pt(x1, y1, ROOF), pt(x0, y1, ROOF)], COLORS.tramRoof);
    // 屋根の上の集電ポール
    const c = pt((x0 + x1) / 2, (y0 + y1) / 2, ROOF);
    plotLine(ctx, c.x, c.y, c.x + 6, c.y - 10, COLORS.lampPole);
    ctx.globalAlpha = 1;
  }

  /**
   * 色あせた鯉のぼり：竿から外れて、屋根の高さを泳ぐ。head は頭、tail は尾のマス（グリッド、小数）。
   * かわいくしない：色のあせた、ほつれた布の胴が波打つ。n で真鯉・緋鯉・子鯉の色を変える
   */
  private koinobori(head: { x: number; y: number }, tail: { x: number; y: number }, tickF: number, n: number): void {
    const ctx = this.lctx;
    const [body, dark, belly] = COLORS.koi[mod(n, COLORS.koi.length)];
    const LIFT = 15;
    // 胴は頭と尾のマスから半マスずつはみ出す
    const dx = head.x - tail.x;
    const dy = head.y - tail.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const h0 = iso(head.x + ux * 0.45, head.y + uy * 0.45);
    const t0 = iso(tail.x - ux * 0.45, tail.y - uy * 0.45);
    for (const g of [head, tail]) {
      const q = iso(g.x, g.y);
      ctx.globalAlpha = 0.3;
      fillEllipse(ctx, q.sx, q.sy + TH / 2, 4, 1, '#000');
    }
    ctx.globalAlpha = 1;
    const hx = h0.sx;
    const hy = h0.sy + TH / 2 - LIFT;
    const tx = t0.sx;
    const ty = t0.sy + TH / 2 - LIFT;
    const span = Math.max(1, Math.abs(tx - hx));
    const step = tx >= hx ? 1 : -1;
    for (let i = 0; i <= span; i++) {
      const k = i / span; // 0: 口 → 1: 尾
      const x = hx + i * step;
      const y = Math.round(lerp(hy, ty, k) + Math.sin(k * 6 - tickF * 0.6) * 1.6 * k);
      // 尾は二股に割れ、ほつれている
      if (k > 0.86) {
        ctx.fillStyle = body;
        const spread = Math.round((k - 0.86) * 20);
        ctx.fillRect(x, y - 1 - spread, 1, 2);
        if ((i + n) % 3 !== 0) ctx.fillRect(x, y + spread, 1, 2);
        continue;
      }
      const r = Math.round(lerp(4, 2, k));
      ctx.fillStyle = body;
      ctx.fillRect(x, y - r, 1, r * 2);
      ctx.fillStyle = belly;
      ctx.fillRect(x, y + r - 1, 1, 1);
      // 鱗の模様と、布のほころび
      if (i % 4 === 2 && k > 0.2) {
        ctx.fillStyle = dark;
        ctx.fillRect(x, y - r + 1, 1, r - 1);
      }
      if ((i * 7 + n * 3) % 11 === 0 && k > 0.3) {
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(x, y - r + 2, 1, 1);
      }
    }
    // 口の輪と、くすんだ目玉
    const my = Math.round(hy);
    ctx.fillStyle = dark;
    ctx.fillRect(hx, my - 4, 1, 8);
    const ex = hx + step * 3;
    ctx.fillStyle = COLORS.koiEye;
    ctx.fillRect(ex - (step < 0 ? 1 : 0), my - 3, 2, 2);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(ex, my - 2, 1, 1);
  }

  /**
   * 扇風機の首振り：pivot の台（段の間の闇に浮かぶ）に立ち、首を振って頭が道の上を往復する。head は頭のある位置（グリッド、小数）。
   * 頭の真下のマスが危険（振り切って cells の外にあるときは危険でない）
   */
  private fan(pivot: Vec, head: { x: number; y: number }, tickF: number): void {
    const ctx = this.lctx;
    const pv = iso(pivot.x, pivot.y);
    const ground = pv.sy + TH / 2;
    const hd = iso(head.x, head.y);
    const hg = hd.sy + TH / 2;
    const STAND = 26;
    const LIFT = 12;
    ctx.drawImage(this.footing, pv.sx - 6, ground - 3);
    fillEllipse(ctx, pv.sx, ground - 1, 5, 2, COLORS.fanDark);
    ctx.fillStyle = COLORS.fanBody;
    ctx.fillRect(pv.sx - 1, ground - STAND, 3, STAND);
    ctx.fillStyle = COLORS.fanDark;
    ctx.fillRect(pv.sx + 1, ground - STAND, 1, STAND);
    // 首の付け根（モーターの箱）
    ctx.fillStyle = COLORS.fanBody;
    ctx.fillRect(pv.sx - 3, ground - STAND - 4, 7, 5);
    ctx.globalAlpha = 0.35;
    fillEllipse(ctx, hd.sx, hg, 5, 2, '#000');
    ctx.globalAlpha = 1;
    // 首：付け根から、道の上へ突き出した頭まで
    const c = { x: hd.sx, y: hg - LIFT };
    plotLine(ctx, pv.sx, ground - STAND - 2, c.x, c.y, COLORS.fanDark);
    plotLine(ctx, pv.sx, ground - STAND - 1, c.x, c.y + 1, COLORS.fanBody);
    // 羽根のおおい（網）と、回る3枚の羽根
    fillEllipse(ctx, c.x, c.y, 7, 6, COLORS.fanGuard);
    fillEllipse(ctx, c.x, c.y, 6, 5, COLORS.fanDark);
    for (let j = 0; j < 3; j++) {
      const a = tickF * 1.3 + (j * 2 * Math.PI) / 3;
      plotLine(ctx, c.x, c.y, Math.round(c.x + Math.cos(a) * 5), Math.round(c.y + Math.sin(a) * 4), COLORS.fanBlade);
      plotLine(ctx, c.x, c.y, Math.round(c.x + Math.cos(a + 0.4) * 4), Math.round(c.y + Math.sin(a + 0.4) * 3), COLORS.fanBlade);
    }
    for (const dy of [-3, 0, 3]) {
      ctx.fillStyle = COLORS.fanGuard;
      ctx.fillRect(c.x - 5, c.y + dy, 1, 1);
      ctx.fillRect(c.x + 5, c.y + dy, 1, 1);
    }
    ctx.fillStyle = COLORS.fanBody;
    ctx.fillRect(c.x - 1, c.y - 1, 2, 2);
  }

  /**
   * 柱時計の振り子：闇に浮かぶ柱時計から長い竿が下り、先の錘が道の上を横切るように揺れる。
   * ends は振れ幅の両端（グリッド座標）、seat は錘の真下の位置、reach は振れ幅（マス）。錘の真下のマスが危険。
   * 錘は時計の中の支点を中心に、決まった長さの竿で円を描いて揺れる
   */
  private pendulum(ends: { x: number; y: number }[], seat: { x: number; y: number }, reach: number): void {
    const ctx = this.lctx;
    const mid = { x: (ends[0].x + ends[1].x) / 2, y: (ends[0].y + ends[1].y) / 2 };
    const at = (gx: number, gy: number, h = 0) => {
      const q = iso(gx, gy);
      return { x: q.sx, y: q.sy + TH / 2 - h };
    };
    // 錘のいちばん低い所が地面から 6 ドット。支点（時計の振り子の窓の上）はその竿の長さだけ上
    const LOW = 6;
    const length = pendulumLength(reach, 46);
    const HANG = LOW + length + 7;
    const top = at(mid.x, mid.y, HANG);
    // 時計の箱：文字盤と、振り子の窓。下は闇へ竿が抜けている
    ctx.fillStyle = COLORS.woodDark;
    ctx.fillRect(top.x - 8, top.y - 24, 16, 26);
    ctx.fillStyle = COLORS.wood;
    ctx.fillRect(top.x - 7, top.y - 23, 14, 24);
    ctx.fillStyle = COLORS.woodDark;
    ctx.fillRect(top.x - 9, top.y - 26, 18, 3);
    fillEllipse(ctx, top.x, top.y - 15, 5, 5, COLORS.dial);
    ctx.fillStyle = COLORS.woodDark;
    ctx.fillRect(top.x, top.y - 19, 1, 4);
    ctx.fillRect(top.x, top.y - 15, 3, 1);
    ctx.fillStyle = COLORS.glassDim;
    ctx.fillRect(top.x - 4, top.y - 8, 8, 9);
    // 錘：支点を中心に円を描く（振り切るほど持ち上がる）
    const u = seat.x - mid.x + (seat.y - mid.y);
    const s = at(seat.x, seat.y);
    const bob = at(seat.x, seat.y, Math.round(pendulumHeight(u, length, HANG - 7)));
    ctx.globalAlpha = 0.45;
    fillEllipse(ctx, s.x, s.y, 5, 1, '#000');
    ctx.globalAlpha = 1;
    plotLine(ctx, top.x, top.y - 7, bob.x, bob.y, COLORS.brassDark);
    plotLine(ctx, top.x + 1, top.y - 7, bob.x + 1, bob.y, COLORS.brass);
    fillEllipse(ctx, bob.x, bob.y, 4, 4, COLORS.brassDark);
    fillEllipse(ctx, bob.x, bob.y, 3, 3, COLORS.brass);
    ctx.fillStyle = COLORS.brassLight;
    ctx.fillRect(bob.x - 2, bob.y - 2, 2, 1);
  }

  /**
   * 屋根から滑り落ちる雪：周期の [from, to) の間に、雪の塊が cells の先頭から末尾へ滑り落ちて闇へ消える（その間は cells のすべてが危険）。
   * pivot があれば、その屋根の軒（闇に浮かぶ瓦の端）から落ちてくる。ふだんは雪が少しずつ積もっていき、落ちる1拍前に震える
   */
  private snow(h: PeriodicHazard, tickF: number, soon: boolean, blinkOn: boolean): void {
    const ctx = this.lctx;
    const path = [...(h.pivot ? [h.pivot] : []), ...h.cells];
    const point = (g: { x: number; y: number }, lift: number) => {
      const q = iso(g.x, g.y);
      return { x: q.sx, y: q.sy + TH / 2 - lift };
    };
    const EAVE = 9;
    if (h.pivot) {
      // 軒：上の屋根の瓦の端が、闇に少しだけのぞいている
      const e = point(h.pivot, EAVE);
      fillPrismSides(ctx, e.x, e.y - 3, 14, 6, 3, COLORS.slabMidL, COLORS.slabMidR);
      fillDiamond(ctx, e.x, e.y - 3, 14, 6, FLOOR_LIGHT.roof[0].road[0]);
    }
    if (soon && blinkOn) for (const c of h.cells) strokeDiamond(ctx, iso(c.x, c.y).sx, iso(c.x, c.y).sy + 2, TW - 8, TH - 4, COLORS.warn);
    const phase = mod(tickF, h.period);
    const dur = h.to - h.from;
    if (phase < h.from || phase >= h.to) {
      // 積もっていく雪
      const grow = mod(phase - h.to, h.period) / (h.period - dur);
      const r = 2 + Math.round(grow * 3);
      const shake = soon ? (Math.floor(tickF * 2) % 2 === 0 ? 1 : -1) : 0;
      const p0 = point(path[0], h.pivot ? EAVE + 1 : 0);
      fillEllipse(ctx, p0.x + shake, p0.y - 1, r + 1, Math.max(1, Math.round(r / 2)), COLORS.snowShade);
      fillEllipse(ctx, p0.x + shake, p0.y - 2, r, Math.max(1, Math.round(r / 2) - 1), COLORS.snow);
      return;
    }
    // 滑り落ちている間：通り道に雪煙が立ち、塊が先頭から末尾の先の闇へ滑っていく
    const u = (phase - h.from) / dur;
    for (const c of h.cells) {
      const q = iso(c.x, c.y);
      ditherDiamond(ctx, q.sx, q.sy + 1, TW - 4, TH - 2, COLORS.snow, (x, y) => (x * 3 + y * 5 + Math.floor(tickF * 3)) % 7 === 0);
    }
    const pos = u * path.length;
    const i = Math.min(Math.floor(pos), path.length - 1);
    const a = path[i];
    const b = path[i + 1] ?? { x: a.x * 2 - (path[i - 1]?.x ?? a.x), y: a.y * 2 - (path[i - 1]?.y ?? a.y) };
    const k = pos - i;
    const lift = h.pivot && i === 0 ? EAVE * (1 - k) : 0;
    const q = point({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) }, lift);
    ctx.globalAlpha = 0.4;
    fillEllipse(ctx, q.x, q.y + lift, 5, 1, '#000');
    ctx.globalAlpha = 1;
    fillEllipse(ctx, q.x, q.y - 3, 6, 4, COLORS.snowShade);
    fillEllipse(ctx, q.x - 1, q.y - 4, 5, 3, COLORS.snow);
  }

  /**
   * 拠点の、二階への階段（ステージ5をクリアすると現れる）。上り口のマスから -x へ昇っていき、上のほうは闇に溶けている。
   * 二階は最後まで閉じている（企画書 第4.4節）ので、昇った先は描かない
   */
  private stairs(sx: number, sy: number): void {
    const ctx = this.lctx;
    const STEPS = 7;
    // 奥（高い段）から手前へ
    for (let i = STEPS - 1; i >= 0; i--) {
      const gx = 0.35 - i * 0.32;
      const top = (i + 1) * 5;
      const pt = (dx: number, dy: number, h: number) => ({
        x: Math.round(sx + ((gx + dx - dy) * TW) / 2),
        y: Math.round(sy + TH / 2 + ((gx + dx + dy) * TH) / 2 - h),
      });
      ctx.globalAlpha = Math.max(0, 1 - i / STEPS);
      // 踏み面と、手前（+x）の蹴込み
      fillQuad(ctx, [pt(-0.16, -0.42, top), pt(0.16, -0.42, top), pt(0.16, 0.42, top), pt(-0.16, 0.42, top)], COLORS.bridge);
      fillQuad(ctx, [pt(0.16, 0.42, top), pt(0.16, -0.42, top), pt(0.16, -0.42, top - 5), pt(0.16, 0.42, top - 5)], COLORS.woodDark);
      fillQuad(ctx, [pt(-0.16, 0.42, top), pt(0.16, 0.42, top), pt(0.16, 0.42, 0), pt(-0.16, 0.42, 0)], COLORS.wood);
    }
    ctx.globalAlpha = 1;
  }

  /** ゴール：欠けに囲まれて一枚だけ立つ扉。開いた戸口から光が漏れる。ハブの入口も同じ形で、光の色が行き先の景色の色 */
  private goalDoor(sx: number, sy: number, pulse: number, light: string = COLORS.goal): void {
    const ctx = this.lctx;
    const g = sy + TH / 2;
    ctx.globalAlpha = 0.25 + pulse * 0.2;
    fillDiamond(ctx, sx, sy + 2, TW - 8, TH - 4, light);
    for (let r = 0; r < 18; r += 2) {
      ctx.globalAlpha = (0.45 + pulse * 0.35) * (1 - r / 24);
      ctx.fillStyle = light;
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
   * ends は振れ幅の両端（グリッド座標）、seat は座席の真下の位置、reach は振れ幅（マス）。
   * 座席は梁を中心に、決まった長さの吊り棒で円を描いて揺れる。枠の高さは、振れ幅を吊り棒で振り切れる高さにする
   */
  private swing(ends: { x: number; y: number }[], seat: { x: number; y: number }, reach: number): void {
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
    // 座席のいちばん低い所が地面から LOW。梁はその吊り棒の長さだけ上
    const LOW = 9;
    const length = pendulumLength(reach, FRAME_H - LOW);
    const frameH = LOW + length;
    const u = seat.x - mid.x + (seat.y - mid.y);
    const lift = Math.round(pendulumHeight(u, length, frameH));
    // 枠：両側の A 字の脚（揺れる向きに開く）と、その上に渡した梁
    const spread = 0.35 * (frameH / FRAME_H);
    for (const k of [-0.7, 0.7]) {
      const px = mid.x + perp.x * k;
      const py = mid.y + perp.y * k;
      const apex = at(px, py, frameH);
      for (const [a, color] of [[-spread, COLORS.rust], [spread, COLORS.rustDark]] as const) {
        const foot = at(px + along.x * a, py + along.y * a);
        plotLine(ctx, foot.x, foot.y, apex.x, apex.y, color);
      }
    }
    const beam = [-0.7, 0.7].map((k) => at(mid.x + perp.x * k, mid.y + perp.y * k, frameH));
    plotLine(ctx, beam[0].x, beam[0].y, beam[1].x, beam[1].y, COLORS.rustLight);
    // 座席の影、吊り棒、座席（梁と平行な板）
    const s = at(seat.x, seat.y);
    ctx.globalAlpha = 0.45;
    fillEllipse(ctx, s.x, s.y, 5, 1, '#000');
    ctx.globalAlpha = 1;
    for (const k of [-0.3, 0.3]) {
      const hook = at(mid.x + perp.x * k, mid.y + perp.y * k, frameH);
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
    const beatSec = tickSec * TICKS_PER_BEAT;

    // 拠点：時間も得点もない。拍の点と、操作の案内だけ
    if (sim.stage.kind === 'hub') {
      this.beatDots(songTime, beatSec);
      this.text('HOME', 6, 7, 1, COLORS.textDim);
      // これまでに溜めた得点の総計（エンディングで使われる値）
      this.text(`TOTAL ${String(this.totalScore).padStart(7, '0')}`, 6, 15, 1, COLORS.gem);
      this.text('WALK INTO A GLOWING DOOR', LW / 2, LH - 14, 1, COLORS.textDim, 'center');
      if (!this.touchUI) this.text('ESC: TITLE', LW - 6, 7, 1, COLORS.textDim, 'right');
      return;
    }
    if (sim.stage.kind === 'tutorial') {
      if (!this.touchUI) this.text('S: SKIP TUTORIAL', LW / 2, LH - 10, 1, COLORS.textDim, 'center');
      // 案内：いちばん近い1つを、近づいたときだけ画面の下に字幕で出す
      let best: { text: string; d: number } | null = null;
      for (const h of sim.stage.def.hints ?? []) {
        const d = Math.abs(h.x - sim.x) + Math.abs(h.y - sim.y);
        if (d <= 3 && (!best || d < best.d)) best = { text: (this.touchUI && h.touch) || h.text, d };
      }
      if (best) {
        const ctx = this.lctx;
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, LH - 44, LW, 18);
        ctx.globalAlpha = 1;
        this.text(best.text, LW / 2, LH - 35, 1, COLORS.goal, 'center');
      }
    }

    this.text(`SCORE ${String(sim.score).padStart(6, '0')}`, 6, 7, 1, COLORS.text);
    this.text(`*${sim.multiplier}`, 6, 15, 1, sim.multiplier > 1 ? COLORS.gem : COLORS.textDim);
    if (sim.misses > 0) this.text(`MISS ${sim.misses}`, 6, 23, 1, COLORS.textDim);

    const remain = Math.max(0, sim.totalTicks * tickSec - Math.max(0, songTime));
    const mm = Math.floor(remain / 60);
    const ss = Math.floor(remain % 60);
    this.text(`${mm}:${String(ss).padStart(2, '0')}`, LW - 6, 7, 1, remain < 10 ? COLORS.warn : COLORS.text, 'right');
    const bar = Math.min(sim.stage.def.bars, Math.max(0, Math.floor(songTime / (beatSec * 4))) + 1);
    this.text(`BAR ${bar}/${sim.stage.def.bars}`, LW - 6, 15, 1, COLORS.textDim, 'right');

    this.beatDots(songTime, beatSec);
    const zone = sim.stage.cell(sim.x, sim.y)!.zone;
    this.text(ZONE_LABEL[zone], LW / 2, 15, 1, zone === 0 ? COLORS.textDim : COLORS.warn, 'center');

    if (songTime < 0) {
      const n = Math.ceil(-songTime / beatSec);
      this.text(String(n), LW / 2, LH / 2 - 36, 4, COLORS.text, 'center');
    }
  }

  /** 拍の表示：4つの点のうち今の拍が光る */
  private beatDots(songTime: number, beatSec: number): void {
    const beat = Math.floor(songTime / beatSec);
    const beatInBar = ((beat % 4) + 4) % 4;
    const fresh = songTime / beatSec - beat < 0.25;
    for (let i = 0; i < 4; i++) {
      const cx = LW / 2 - 12 + i * 8;
      const on = i === beatInBar;
      const color = on ? (i === 0 ? COLORS.gem : COLORS.text) : COLORS.dot;
      const r = on && fresh ? 2 : 1;
      fillEllipse(this.lctx, cx, 7, r, r, color);
    }
  }

  /** クリアの結果の欄。e はゴールしてからの秒。CLEAR.panel から出て、得点を1行ずつ数え上げる。prompt は数え終わったあとの操作の案内 */
  clearResult(sim: Sim, e: number, note: string | null, prompt: string): void {
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
    if (e >= CLEAR.end && Math.floor(e * 2) % 2 === 0) this.text(prompt, LW / 2, 222, 1, COLORS.gem, 'center');
  }

  /** エンディング（ending.ts）。t は始まってからの秒、total は使われる得点 */
  ending(t: number, total: number): void {
    drawEnding(this.lctx, t, total, {
      front: this.girl[GIRL_DIR.down],
      back: this.girl[GIRL_DIR.up],
      raise: this.girlRaise,
    });
  }

  /**
   * タイトル（ending.ts の drawTitle）：闇に浮かぶ家と、その前に立つ少女。t は秒。
   * cleared はクリアしたステージの数（その数だけ窓に明かりがともる）。collapsed はエンディングのあと（ガレキだけが残る）
   */
  title(t: number, opts: { cleared: number; collapsed: boolean; prompt: string | null; beatSec: number }): void {
    drawTitle(this.lctx, t, opts, {
      front: this.girl[GIRL_DIR.down],
      back: this.girl[GIRL_DIR.up],
      raise: this.girlRaise,
    });
  }

  /**
   * はい・いいえの確認（二階へ昇るか、記録を消すか）。はじめは「いいえ」が選ばれている。
   * 二階へ昇るとき（企画書 第2.3節）は、取り返しのつかないことが起きると意図的に予告する
   */
  confirm(question: string, note: string, yes: boolean): void {
    const ctx = this.lctx;
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, LW, LH);
    ctx.globalAlpha = 1;
    this.text(question, LW / 2, LH / 2 - 30, 2, COLORS.text, 'center');
    this.text(note, LW / 2, LH / 2 - 10, 1, COLORS.textDim, 'center');
    this.text(yes ? '> YES' : '  YES', LW / 2 - 30, LH / 2 + 20, 2, yes ? COLORS.gem : COLORS.textDim, 'center');
    this.text(!yes ? '> NO' : '  NO', LW / 2 + 34, LH / 2 + 20, 2, !yes ? COLORS.gem : COLORS.textDim, 'center');
    this.text(this.touchUI ? 'TAP YES TWICE TO GO' : 'LEFT / RIGHT, ENTER (OR CLICK YES TWICE)', LW / 2, LH / 2 + 46, 1, COLORS.textDim, 'center');
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
