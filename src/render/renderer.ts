import { FLOW_JUMP, FlowHazard, PatrolHazard, PeriodicHazard, SwingHazard } from '../game/hazard.ts';
import type { Sim } from '../game/sim.ts';
import type { Cell, FloorStyle, PropKind, Stage } from '../game/stage.ts';
import { DIR_VEC, mod, TICKS_PER_BEAT, ZONE_INTERVAL, type Dir, type Vec, type Zone } from '../game/types.ts';
import { drawText, GLYPH_H, textWidth } from './font.ts';
import {
  ditherDiamond,
  fillDiamond,
  fillEllipse,
  fillPrismSides,
  fillQuad,
  iso as isoFlat,
  diamondRowWidth,
  makeSprite,
  plotLine,
  strokeDiamond,
  strokeIsoRing,
  strokeRect,
  TH,
  TW,
} from './pixel.ts';
import { drawEnding, drawTitle, type EndingTexts, type TitleOpts } from './ending.ts';
import { THINGS } from './things.ts';
import { lang, msg } from '../lang.ts';
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
/** スタートの後ろの階段（StageDef.stairs）の1段の高さ */
const STAIR_H = 6;
/** 拠点の二階への階段（stairs()）の段 i（0 が手前のいちばん低い段）の踏み面の真ん中：入口のマスからの x のずれ（マス。左上が負）と高さ（ドット） */
const STAIR_STEP_X = (i: number) => 0.35 - i * 0.32;
const STAIR_STEP_H = (i: number) => (i + 1) * 5;
/** 二階への階段を昇る：昇る段の数と、1段にかける秒（main.ts の UP_FADE のあいだに昇りきる） */
export const UPSTAIRS_STEPS = 6;
export const UPSTAIRS_STEP_SEC = 0.22;
/**
 * 階段のあるステージ（チュートリアル）の始まり：はじめは誰もいない。APPEAR_BARS 小節（曲は鳴らさない）で階段のいちばん下に
 * 少女が現れ、APPEAR_REST_BEATS 拍そのまま待ち（現れるときの効果音の余韻が消えるあたりまで）、次の1小節（曲の前奏。カウント）で
 * 1拍1段ずつ昇ってスタートに着く。main.ts は APPEAR_BARS 小節 + APPEAR_REST_BEATS 拍ぶん曲の頭を遅らせる
 */
export const APPEAR_BARS = 1;
export const APPEAR_REST_BEATS = 2;
/** 階段の、昇ってくる段より下に見える段の数（闇に溶けていく） */
const STAIRS_FADE = 3;
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
  // 土：公園の地面、草地
  dirt: [
    { edge: '#30291f', road: ['#4a3f31', '#3c3329', '#2f2821'] },
    { edge: '#3a3024', road: ['#5a4c39', '#4a3f30', '#3a3127'] },
    { edge: '#44382a', road: ['#6b5a43', '#584a37', '#45392c'] },
  ],
};

/**
 * 場面の置き分け（ステージ定義の tints）。道の色をこの色へ k の割合だけ寄せる。
 * 曲の進みや操作では変えず、場所ごとに決まっている（企画書 第4.1節）
 */
const TINTS: Record<string, { color: string; k: number }> = {
  // STAGE 1：昼 → 午後 → 日没前（上面が橙に染まる）
  n: { color: '#fff4dc', k: 0.06 },
  a: { color: '#e0b070', k: 0.14 },
  d: { color: '#f08a48', k: 0.3 },
  // STAGE 2：晴れ → 曇り → 雨（濡れて暗い）→ 雨上がり
  s: { color: '#e8f0d0', k: 0.06 },
  c: { color: '#8a909c', k: 0.2 },
  r: { color: '#1e3450', k: 0.32 },
  e: { color: '#a8c4d4', k: 0.16 },
  // STAGE 3：古い時代（すすけた茶）→ まだら → 新しい時代（冷たい灰）
  O: { color: '#b0905c', k: 0.2 },
  M: { color: '#9a9488', k: 0.08 },
  N: { color: '#7486a8', k: 0.14 },
  // STAGE 4：春 → 夏 → 秋 → 冬（雪）。季節の間（g）はどの季節の色も持たない
  p: { color: '#e0b4bc', k: 0.12 },
  u: { color: '#7eae6a', k: 0.14 },
  f: { color: '#c47a3a', k: 0.2 },
  w: { color: '#e4eaf0', k: 0.22 },
  g: { color: '#000000', k: 0 },
  // STAGE 5：夜逃げの夜 → 数年後（埃）→ さらに後（緑）→ 廃屋。記憶の断片（q）は色が抜けて淡い
  k: { color: '#2c3c6c', k: 0.26 },
  y: { color: '#8e7c60', k: 0.16 },
  l: { color: '#5c7c42', k: 0.18 },
  x: { color: '#76885a', k: 0.16 },
  q: { color: '#c4c4cc', k: 0.36 },
};

function mixColor(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(lerp((pa >> sh) & 255, (pb >> sh) & 255, k));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

function tinted(color: string, tint: string): string {
  const t = TINTS[tint];
  return t && t.k > 0 ? mixColor(color, t.color, t.k) : color;
}
const ROAD_LIGHT = FLOOR_LIGHT.alley;
const FLOOR_STYLES = Object.keys(FLOOR_LIGHT) as FloorStyle[];
/** 遊具の柱、ブランコの枠などの高さ */
const POLE_H = 26;
/**
 * 回旋塔の柱の高さと鎖の長さ（ドット）。輪は柱のまわりの長方形の道筋を回るので、柱からの距離が 1〜2.2 マスと変わる。
 * 鎖を長くして長さを変えずに吊り、離れるほど輪が少し持ち上がる（振り回されて外へ開く）ようにする
 */
const KAISENTO_H = 64;
const KAISENTO_CHAIN = 60;
/** 流されていく物が湧き口から跳び出す高さ（ドット） */
const FLOW_HOP = 9;
/** ステージのゴールの光の柱の高さ */
const BEACON_H = 72;
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
/** 床の高さ 1/4 段あたりのドット（1段 = 6 ドット） */
const PX_PER_UNIT = 1.5;
/** いま描いているステージの床の高さ（ドット）。world() の間だけ設定する。グリッドの小数の位置は、まわりの4マスからならす */
let elevation: (x: number, y: number) => number = () => 0;

/** グリッド座標 → 菱形の上の頂点。床の高さのぶん持ち上げる（高さのないステージでは pixel.ts の iso と同じ） */
function iso(x: number, y: number): { sx: number; sy: number } {
  const q = isoFlat(x, y);
  return { sx: q.sx, sy: q.sy - elevation(x, y) };
}

function makeElevation(stage: Stage): (x: number, y: number) => number {
  const h = (x: number, y: number) => stage.cell(x, y)?.height ?? 0;
  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const kx = x - x0;
    const ky = y - y0;
    const top = lerp(h(x0, y0), kx > 0 ? h(x0 + 1, y0) : 0, kx);
    const bottom = ky > 0 ? lerp(h(x0, y0 + 1), kx > 0 ? h(x0 + 1, y0 + 1) : 0, kx) : 0;
    return Math.round(lerp(top, bottom, ky) * PX_PER_UNIT);
  };
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
  /** 下りられるが戻れない縁（床の高さの一方通行）の印 */
  dropMark: '#e2d3b4',
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
  // 水辺の生き物、柿の実
  zari: '#a3442f',
  zariDark: '#6e2c20',
  kaki: '#d8752e',
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
/**
 * 拠点からステージへ移る演出（秒）。拠点の入口に入ると、入口のマスまで歩き切り、入口の色の光の柱に包まれて
 * 少女が溶けて消え（クリア演出と同じ CLEAR.glow〜CLEAR.gone）、画面が闇に沈む（fade〜end）。end で次のステージへ。
 * ステージでは、闇から明るくなり（カウントの1拍目）、カウントの頭 ARRIVE_BEATS 拍で少女がスタートに現れる
 */
export const LEAVE = { fade: 1.0, end: 1.5 };
const ARRIVE_BEATS = 2;
/**
 * 曲などの読み込みに時間がかかっているときの「LOADING...」（暗転してから delay 秒たっても読み込み中なら出す）。
 * period 秒ごとに、左から1文字ずつ stagger 秒遅れで、lift 秒かけて hop ドット跳ねる
 */
export const LOADING = { delay: 0.4, period: 1.6, stagger: 0.07, lift: 0.28, hop: 3 };

/** 拠点とチュートリアルが闇から明るくなる秒（タイトルや、Esc で戻る演出の闇から続けて始まるとき） */
export const FADE_IN = 0.5;

/**
 * Esc（HOME・SKIP・TITLE のボタン）で画面を戻る演出（秒）。曲が消えていくのに合わせて、道のタイルが少女から遠い順に
 * 沈んで消えていき（reach マスより遠いマスはいっせいに。1マス近づくごとに step 遅れ、1枚が消えきるまで fall）、
 * 最後に少女の立つマスと少女が消える。fade〜end で画面が闇に沈み、end で戻り先へ
 */
export const BACK = { reach: 10, step: 0.06, fall: 0.4, fade: 0.9, end: 1.3 };

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

/**
 * 拠点に新しい入口が現れる演出の進行（拠点に戻ってからの秒）。
 * まず視点が新しい入口へ動き（入口が画面の中央に来る）、新しいマスが、もとの床の側から入口へ向かって順に闇の下から
 * せり上がり、最後に入口が光を放つ。光が消えたら視点が少女へ戻る。演出のあいだは歩けない（main.ts）
 */
export const REVEAL = {
  /** 視点が入口へ動き始める。動ききるまで（戻るときも同じ） */
  look: 0.2,
  pan: 0.7,
  /** せり上がり始める（視点が動ききってから）。順番が1つ進むごとの遅れ。1マスがせり上がりきるまで */
  delay: 1.0,
  step: 0.14,
  rise: 0.5,
  /** 入口がせり上がりきってから、光が消えるまで */
  flash: 1.6,
};

/** 光が消えて、視点が少女へ戻り始める秒 */
function revealShown(order: ReadonlyMap<number, number>): number {
  return REVEAL.delay + Math.max(0, ...order.values()) * REVEAL.step + REVEAL.rise + REVEAL.flash;
}

/** 道がせり上がり始める秒と、せり上がりきる秒（拠点に戻ってからの秒。効果音に使う） */
export function revealRise(order: ReadonlyMap<number, number>): { rise: number; land: number } {
  return { rise: REVEAL.delay, land: revealShown(order) - REVEAL.flash };
}

/** 演出が終わる（視点が少女へ戻りきる）秒（order は hubReveal の結果） */
export function revealEnd(order: ReadonlyMap<number, number>): number {
  return revealShown(order) + REVEAL.pan;
}

/** 視点を入口へ寄せる割合（0 は少女、1 は入口）。拠点に戻ってからの秒 t で決まる */
function revealLook(order: ReadonlyMap<number, number>, t: number): number {
  const ease = (u: number) => u * u * (3 - 2 * u);
  return ease(clamp01((t - REVEAL.look) / REVEAL.pan)) * (1 - ease(clamp01((t - revealShown(order)) / REVEAL.pan)));
}


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

function makeRoadSprite(zone: Zone, light: number, style: FloorStyle, tint = ' '): HTMLCanvasElement {
  const raw = FLOOR_LIGHT[style][light];
  const pal = { edge: tinted(raw.edge, tint), road: raw.road.map((c) => tinted(c, tint)) };
  const seam = tinted(FLOOR_LIGHT[style][0].edge, tint);
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

/** 歩けない面のうち、床と一緒に描く平らな面（それ以外は家具の塊として立体物と一緒に描く） */
const SURFACES = new Set(['w', 'r', 's', 'p', 'g']);

/** 家具の塊の色：[上面, 左の面, 右の面] */
const FURNITURE: Record<string, [string, string, string]> = {
  F: ['#bdb39a', '#978a6c', '#7a6f56'], // 襖
  u: ['#7a6a8a', '#5a4e66', '#4a4054'], // 布団
  T: ['#5a4634', '#3b2c24', '#2e231c'], // 箪笥
  x: ['#8a7a5a', '#6a5c42', '#5a4e38'], // 荷造りの箱
  t: ['#5a4634', '#3b2c24', '#2e231c'], // 食卓
  R: ['#c8c4b8', '#9a968a', '#86827a'], // 冷蔵庫
  v: ['#8c9096', '#5f6268', '#4f5258'], // 流しとこんろ
  V: ['#3a3a40', '#26262c', '#1e1e24'], // テレビ
  C: ['#4a3426', '#3b2c24', '#241a15'], // 食器棚
  K: ['#8c9096', '#5f6268', '#4f5258'], // 流し
  L: ['#5a4634', '#3b2c24', '#2e231c'], // 倒れた柱
  b: ['#3e3226', '#2e2620', '#241e19'], // 朽ちた食卓
  G: ['#4b5a32', '#3a4628', '#2e3820'], // 草むら
};

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
  /** 少女の形の光（向きごと。GIRL_DIR の順） */
  private girlGlow: HTMLCanvasElement[];
  /** エンディングで手を挙げる少女 */
  private girlRaise: HTMLCanvasElement;
  /** 拠点に新しい入口が現れる演出（def の拠点を描くときだけ。order は stages/hub.ts の hubReveal）。main.ts が設定する */
  hubReveal: { def: Stage['def']; order: ReadonlyMap<number, number> } | null = null;
  /** ハブの入口の下に出す一言（クリア済みなど）。main.ts が設定する */
  portalNote: (stage: string) => string | null = () => null;
  /** 二階へ昇ると決めてからの秒（拠点が闇に沈んでいくあいだ。少女が階段を昇っていく）。それ以外は null。main.ts が設定する */
  upstairsSec: number | null = null;
  /** 開発用（?labels）：闇に浮かぶ物・小物・家具の塊に、番号と種類の札を出す（絵の直しを頼むときに物を指すため）。main.ts が設定する。リリースビルドでは札を描く処理ごと消える */
  devLabels = false;
  private lot: HTMLCanvasElement;
  /** ステージごとの、各マスの街灯の明るさ */
  private lightMaps = new WeakMap<Stage, Uint8Array>();
  private dropMaps = new WeakMap<Stage, Map<number, Dir[]>>();
  private tintedRoads = new Map<string, HTMLCanvasElement>();
  private surfaces = new Map<string, HTMLCanvasElement>();
  /** 高い床の側面（深さごとに、使うときに作って取っておく） */
  private slabs = new Map<number, HTMLCanvasElement>();
  private elevations = new WeakMap<Stage, (x: number, y: number) => number>();
  private thingMaps = new WeakMap<Stage, Map<number, string>>();

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
    this.girlGlow = this.girl.map((frames) => makeGlowSprite(frames[0]));
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

  /** 高い床の、地面まで伸びた側面の絵。左上が (sx - TW / 2, sy) */
  private slab(depth: number): HTMLCanvasElement {
    let sp = this.slabs.get(depth);
    if (!sp) {
      sp = makeSprite(TW, TH + depth + 1, (ctx) => fillSlabSides(ctx, TW / 2, 0, TW, TH, depth));
      this.slabs.set(depth, sp);
    }
    return sp;
  }

  /** 色合いつきの道のタイル（使うときに作って取っておく） */
  private road(cell: Cell, light: number): HTMLCanvasElement {
    if (cell.tint === ' ' || !TINTS[cell.tint]) return this.roads[cell.floor][light][cell.zone];
    const k = `${cell.floor}|${light}|${cell.zone}|${cell.tint}`;
    let sp = this.tintedRoads.get(k);
    if (!sp) {
      sp = makeRoadSprite(cell.zone, light, cell.floor, cell.tint);
      this.tintedRoads.set(k, sp);
    }
    return sp;
  }

  /** 拡大表示の配置（実画素）。自動テストでの検査用 */
  /** これまでに溜めた得点の総計（拠点の画面に出す）。main.ts が設定する */
  totalScore = 0;

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
    // 指（カーソル）の向きへ、枠が少しだけ寄る（手ごたえ。判定の中心 s.cx, s.cy は動かない）。つまみは枠の外へ出さない
    const dx = s.x - s.cx;
    const dy = s.y - s.cy;
    const d = Math.hypot(dx, dy);
    const k = d > 0 ? Math.min(d, STICK_RADIUS) / d : 0;
    const lean = d > 0 ? (Math.min(d, STICK_RADIUS) / STICK_RADIUS) * 2 : 0;
    const cx = Math.round(s.cx + (d > 0 ? (dx / d) * lean : 0));
    const cy = Math.round(s.cy + (d > 0 ? (dy / d) * lean * 0.5 : 0));
    const kx = s.cx + dx * k;
    const ky = s.cy + dy * k;
    const w = STICK_RADIUS * 2 + 8;
    const h = w / 2;
    const top = cy - h / 2;
    ctx.globalAlpha = 0.45;
    strokeDiamond(ctx, cx, top, w, h, COLORS.textDim);
    ctx.globalAlpha = 1;
    if (s.dir) {
      // 歩いている向きの辺を、枠と同じ行の並びで内側へ太く塗る（枠の外へはみ出さない）。
      // up は上→右の辺（上半分の右側）、right は右→下（下半分の右側）、down は下→左、left は左→上
      const lower = s.dir === 'right' || s.dir === 'down';
      const right = s.dir === 'up' || s.dir === 'right';
      ctx.fillStyle = COLORS.gem;
      for (let r = lower ? h / 2 : 0; r < (lower ? h : h / 2); r++) {
        const rw = diamondRowWidth(r, w, h);
        ctx.fillRect(right ? cx + rw / 2 - 3 : cx - rw / 2, top + r, 3, 1);
      }
    }
    ctx.globalAlpha = 0.7;
    fillDiamond(ctx, Math.round(kx), Math.round(ky) - 3, 12, 6, COLORS.text);
    ctx.globalAlpha = 1;
  }

  /**
   * タップできるボタン（バッファ上の矩形）。selected は選んでいる状態（確認の YES など）。
   * keyLabel は同じことができるキーの名前で、四角で囲んでラベルの左に添える。hover はマウスが上にある（下地と枠を明るくする）。
   * fade（0〜1）は現れる・消えるときの濃さ（確認の画面と一緒に、4段階で濃くなる）
   */
  buttons(list: { label: string; keyLabel: string; x: number; y: number; w: number; h: number; selected?: boolean; hover?: boolean }[], fade = 1): void {
    const ctx = this.lctx;
    const a = Math.ceil(clamp01(fade) * 4) / 4;
    if (a <= 0) return;
    for (const b of list) {
      ctx.globalAlpha = a;
      const color = b.selected ? COLORS.gem : COLORS.text;
      const capW = textWidth(b.keyLabel, 1) + 4;
      // ラベルのないボタンは、もとからある文字を枠で囲むだけ（下地を塗らない）。キーの名前は枠の下に
      if (b.label) {
        ctx.globalAlpha = 0.7 * a;
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        if (b.hover) {
          ctx.globalAlpha = 0.8 * a;
          ctx.fillStyle = COLORS.dot;
          ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
        }
        ctx.globalAlpha = a;
      }
      strokeRect(ctx, b.x, b.y, b.w, b.h, b.selected ? COLORS.gem : b.hover ? COLORS.text : COLORS.dot);
      if (b.label) {
        const x0 = Math.round(b.x + (b.w - capW - 4 - textWidth(b.label, 1)) / 2);
        this.keycap(b.keyLabel, x0, b.y + b.h / 2, color);
        this.text(b.label, x0 + capW + 4, b.y + b.h / 2, 1, color);
      } else {
        this.keycap(b.keyLabel, Math.round(b.x + b.w / 2 - capW / 2), b.y + b.h + 7, color);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** 四角で囲んだキーの名前。left は枠の左端、cy は文字の縦中央 */
  private keycap(key: string, left: number, cy: number, color: string): void {
    const top = Math.round(cy) - 4;
    strokeRect(this.lctx, left, top, textWidth(key, 1) + 4, 9, color);
    this.text(key, left + 2, top + 4.5, 1, color);
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
   * clearSec はゴールしてからの経過秒（クリア演出）。leaveSec は拠点で入口に入ってからの経過秒（LEAVE）。
   * backSec は Esc で戻り始めてからの経過秒（BACK）。プレイ中は null。
   * ステージ（stage）の曲の頭まで（songTime < 0）は、少女が現れる演出をする。songTime が -Infinity（曲を読み込んでいる
   * あいだ）なら、まだいない
   */
  world(
    sim: Sim,
    songTime: number,
    tickSec: number,
    clearSec: number | null = null,
    leaveSec: number | null = null,
    backSec: number | null = null,
  ): void {
    const ctx = this.lctx;
    const stage = sim.stage;
    const tickF = Math.max(0, songTime / tickSec);
    const now = Math.floor(tickF);

    // プレイヤーの補間位置
    const fromZone = stage.cell(sim.fromX, sim.fromY)!.zone;
    const slide = Math.min(ZONE_INTERVAL[fromZone], 2) * 0.6;
    // クリアしたあとは曲の時刻が止まる（ゴールに入った tick のまま）ので、演出の経過秒でゴールのマスまで歩き切る
    // 拠点で入口に入ったときも同じ（演出の経過秒で入口のマスまで歩き切る）
    const exitSec = clearSec ?? leaveSec;
    const k = clamp01((exitSec !== null ? exitSec / tickSec : tickF - sim.moveTick) / slide);
    let px = lerp(sim.fromX, sim.x, k);
    let py = lerp(sim.fromY, sim.y, k);
    // 歩きのコマは、位置の補間より長く、次に動ける拍まで（押し続ければ足が止まらない）
    const moved = sim.fromX !== sim.x || sim.fromY !== sim.y;
    let walk = moved ? clamp01((tickF - sim.moveTick) / ZONE_INTERVAL[fromZone]) : 1;
    let odd = (sim.x + sim.y) % 2 !== 0;
    // スタートの後ろの階段（カウントのあいだ、1拍1段ずつ昇ってくる）
    const stairs = this.stairsOf(sim);
    const climb = stairs && this.climbAt(sim, songTime, tickSec);
    if (stairs && climb) {
      px = stage.start.x + stairs.back.x * climb.k;
      py = stage.start.y + stairs.back.y * climb.k;
      walk = climb.walk;
      odd = climb.to % 2 !== 0;
    }
    let drop = climb ? Math.round(climb.k * STAIR_H) : 0;
    // 二階へ昇る：二階への階段（stairs() の段）を1段ずつ昇り、上の段ほど闇に溶ける。
    // 段 j の踏み面の真ん中は、入口のマスから左上へ STAIR_STEP_X(j) マス、高さ STAIR_STEP_H(j) ドット。少女は入口のマスの真ん中（床）から、段 1 → 段 6 と乗っていく
    const up = this.upstairsSec !== null && sim.status === 'portal' ? this.upstairsSec / UPSTAIRS_STEP_SEC : null;
    let upAlpha = 1;
    if (up !== null) {
      const s = Math.min(up, UPSTAIRS_STEPS);
      const i = Math.floor(s);
      const u = s - i;
      // 1段のうち、はじめの半分で次の段へ上がる
      const k = Math.min(1, u * 2);
      const at = (n: number) => (n === 0 ? { x: 0, h: 0 } : { x: STAIR_STEP_X(n), h: STAIR_STEP_H(n) });
      const a = at(i);
      const b = at(Math.min(i + 1, UPSTAIRS_STEPS));
      px = sim.x + lerp(a.x, b.x, k);
      py = sim.y;
      drop = -Math.round(lerp(a.h, b.h, k));
      walk = s < UPSTAIRS_STEPS ? u : 1;
      odd = i % 2 !== 0;
      upAlpha = 1 - s / (UPSTAIRS_STEPS + 1);
    }
    // ステージの始まり：カウントの頭の拍で、少女がスタートに現れる（チュートリアルは階段の演出 climb）
    const beatU = songTime / (tickSec * TICKS_PER_BEAT);
    const atStart = sim.x === stage.start.x && sim.y === stage.start.y && !moved;
    const arrive = stage.kind === 'stage' && songTime < 0 && atStart ? clamp01((beatU + 4) / ARRIVE_BEATS) : 1;

    // 床の高さ（このステージを描くあいだだけ。iso() が持ち上げる）
    elevation = this.elevationOf(stage);
    // カメラはプレイヤーを追う。拠点に新しい入口が現れる演出のあいだは、入口を中央に寄せてから少女へ戻す
    const p = iso(px, py);
    p.sy += drop;
    if (this.camSim !== sim) {
      this.camSim = sim;
      this.camX = p.sx;
      this.camY = p.sy;
    }
    const revealing = this.hubReveal?.def === stage.def ? this.hubReveal.order : null;
    const gate = revealing && this.revealGate(stage, revealing);
    const look = revealing && gate ? revealLook(revealing, songTime) : 0;
    if (gate && look > 0) {
      // 時刻だけで決める（静止表示でも同じ位置）。戻りきると look が 0 になり、少女を追う動きにそのままつながる
      const g = iso(gate.x, gate.y);
      this.camX = lerp(p.sx, g.sx, look);
      this.camY = lerp(p.sy, g.sy, look);
    } else if (up === null) {
      this.camX = lerp(this.camX, p.sx, 0.12);
      this.camY = lerp(this.camY, p.sy, 0.12);
    }
    // 二階への階段を昇っているあいだは、カメラを上り口に止めておく（少女だけが昇っていく）
    const offX = Math.round(LW / 2 - this.camX);
    const offY = Math.round(LH / 2 - this.camY - 8);
    ctx.save();
    ctx.translate(offX, offY);
    /**
     * 世界の座標 (sx, sy) に描く物が画面に入るか。above は sy から上へ、below は下へはみ出す高さ。
     * 大きなステージでは、画面の外のマスまで描くと重い（STAGE4・STAGE5）ので、外のマスは飛ばす
     */
    const onScreen = (sx: number, sy: number, above: number, below: number): boolean => {
      const x = sx + offX;
      const y = sy + offY;
      return x > -TW * 2 && x < LW + TW * 2 && y + below >= 0 && y - above < LH;
    };

    // クリア演出：扉から遠いマスほど遅れて、道が崩れて闇へ落ちていく。扉のマスだけが残る。null は崩れ落ちたあと
    const goal = stage.goal;
    // 拠点に新しい入口が現れる演出：まだ現れていないマスは null、せり上がっている途中は下にずらして薄く
    const reveal = this.hubReveal?.def === stage.def ? this.hubReveal.order : null;
    const landAt = (x: number, y: number) => {
      const k = reveal?.get(stage.index(x, y));
      return k === undefined ? null : REVEAL.delay + k * REVEAL.step + REVEAL.rise;
    };
    // Esc で戻る演出：少女から遠いマスほど先に沈んで消える（null は消えたあと）
    const sink = (x: number, y: number): { dy: number; alpha: number } | null => {
      if (backSec === null) return { dy: 0, alpha: 1 };
      const d = Math.min(Math.abs(x - sim.x) + Math.abs(y - sim.y), BACK.reach);
      const u = (backSec - (BACK.reach - d) * BACK.step) / BACK.fall;
      if (u <= 0) return { dy: 0, alpha: 1 };
      if (u >= 1) return null;
      return { dy: Math.round(u * u * 12), alpha: Math.ceil((1 - u) * 4) / 4 };
    };
    const crumble = (x: number, y: number): { dy: number; alpha: number } | null => {
      const f = fall(x, y);
      const b = sink(x, y);
      return f && b ? { dy: f.dy + b.dy, alpha: f.alpha * b.alpha } : null;
    };
    const fall = (x: number, y: number): { dy: number; alpha: number } | null => {
      const land = landAt(x, y);
      if (land !== null && songTime < land) {
        const u = 1 - (land - songTime) / REVEAL.rise;
        if (u <= 0) return null;
        return { dy: Math.round((1 - u) * (1 - u) * 24), alpha: Math.ceil(u * 4) / 4 };
      }
      if (clearSec === null || (x === goal.x && y === goal.y)) return { dy: 0, alpha: 1 };
      const dist = Math.abs(x - goal.x) + Math.abs(y - goal.y);
      const u = (clearSec - CLEAR.crumble - dist * CLEAR.crumbleStep) / CLEAR.fall;
      if (u <= 0) return { dy: 0, alpha: 1 };
      if (u >= 1) return null;
      return { dy: Math.round(u * u * 18), alpha: Math.ceil((1 - u) * 4) / 4 };
    };

    // 道（奥から手前へ）。斜めの1列ずつ、立体物と交互に描く（下の「奥行き順に描く」）
    const light = this.lightMap(stage);
    const things = this.thingMap(stage);
    // 流されていく物の湧き口（水の中の穴）
    const springs = new Set(sim.hazards.flatMap((h) => (h instanceof FlowHazard ? [stage.index(h.cells[0].x, h.cells[0].y)] : [])));
    const floorDiag = (d: number): void => {
      for (let x = 0; x <= d; x++) {
        const y = d - x;
        const cell = stage.cell(x, y);
        if (!cell) continue;
        const f = crumble(x, y);
        if (!f) continue;
        ctx.globalAlpha = f.alpha;
        const sx = iso(x, y).sx;
        const sy = iso(x, y).sy + f.dy;
        const rise = elevation(x, y);
        // 高い床の側面は地面まで下へ伸びる。道の上の印（矢印、線路など）は少し上へはみ出す
        if (!onScreen(sx, sy, 32, TH + FLOOR_THICK + rise + 1)) continue;
        if (cell.terrain === 'hole') ctx.drawImage(this.hole, sx - TW / 2, sy);
        if (cell.terrain === 'wall' && cell.obj?.type === 'prop') {
          // 小物の地面より下の部分（地面より上は立体物として後で描く）
          const kind = cell.obj.kind;
          if (kind === 'lot') ctx.drawImage(this.lot, sx - TW / 2, sy);
          else if (BLOCK_PROPS.has(kind)) ctx.drawImage(this.base, sx - TW / 2, sy);
          else ctx.drawImage(this.footing, sx - 6, sy + TH / 2 - 3);
        }
        if (cell.terrain === 'wall') {
          // 歩けない面（水面、屋根、雪の屋根、二階の壁、人影の足場）。家具の塊は立体物として後で描く
          if (cell.scenery && SURFACES.has(cell.scenery)) {
            if (rise > 0) ctx.drawImage(this.slab(FLOOR_THICK + rise), sx - TW / 2, sy);
            ctx.drawImage(this.surface(cell, tickF), sx - TW / 2, sy);
          }
          const th = things.get(stage.index(x, y));
          if (th && THINGS[th]?.foot && !cell.scenery) ctx.drawImage(this.footing, sx - 6, sy + TH / 2 - 3);
          continue;
        }
        if (cell.terrain !== 'floor') continue;
        // 高い床は、側面を地面まで伸ばす（企画書 第2.4節「床の高さ」）
        if (rise > 0) ctx.drawImage(this.slab(FLOOR_THICK + rise), sx - TW / 2, sy);
        // 水のさざ波は半拍ごとに動く
        if (cell.water) ctx.drawImage(this.water[mod(Math.floor(tickF / (TICKS_PER_BEAT / 2)), 2)][cell.zone], sx - TW / 2, sy);
        else ctx.drawImage(this.road(cell, light[stage.index(x, y)]), sx - TW / 2, sy);
        if (springs.has(stage.index(x, y))) this.spring(sx, sy + TH / 2);
        if (cell.climb) this.climbMark(sx, sy, cell.climb, stage, x, y);
        for (const d of this.dropMap(stage).get(stage.index(x, y)) ?? []) this.dropMark(sx, sy, d);

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
      ctx.globalAlpha = 1;
    };

    // 立体物は奥行き順に描く
    const sprites: { depth: number; draw: () => void }[] = [];
    const labels: { x: number; y: number; text: string; color: string }[] = [];
    const feet = p.sy + TH / 2;
    // 停止マスの上で、まだ1拍たっていない：足元を確かめるあいだ「WAIT」
    if (sim.status === 'playing' && stage.cell(sim.x, sim.y)?.obj?.type === 'stop' && sim.stillTicks < TICKS_PER_BEAT) {
      labels.push({ x: p.sx, y: p.sy - 26, text: msg().wait, color: COLORS.stopEdge });
    }

    for (let y = 0; y < stage.height; y++) {
      for (let x = 0; x < stage.width; x++) {
        const cell = stage.cell(x, y)!;
        const f = crumble(x, y);
        if (!f) continue;
        const sx = iso(x, y).sx;
        const sy = iso(x, y).sy + f.dy;
        // 背の高い物（街灯、人影、家具の塊など）は上へ大きくはみ出す
        if (!onScreen(sx, sy, 128, TH + FLOOR_THICK + elevation(x, y) + 8)) continue;
        const thing = cell.terrain === 'wall' ? things.get(stage.index(x, y)) : undefined;
        if (cell.terrain === 'wall' && cell.scenery && !SURFACES.has(cell.scenery)) {
          // 家具の塊：床（高さ 0）から、面の高さまでの箱。プレイヤーより手前で重なるときは透かす
          const base = isoFlat(x, y);
          const top = Math.round(cell.height * PX_PER_UNIT);
          const hides = x + y > px + py && Math.abs(base.sx - p.sx) < TW && base.sy - top < feet && base.sy + TH > feet - PLAYER_H;
          const kind = cell.scenery;
          sprites.push({
            depth: x + y,
            draw: () => {
              ctx.globalAlpha = (hides ? 0.45 : 1) * f.alpha;
              this.furniture(base.sx, base.sy + f.dy, top, kind);
              ctx.globalAlpha = 1;
            },
          });
        }
        if (thing && THINGS[thing]) {
          const info = THINGS[thing];
          const hides = x + y > px + py && Math.abs(sx - p.sx) < TW && sy - info.height < feet && sy + TH + FLOOR_THICK > feet - PLAYER_H;
          // 戸や窓は道のある側の面に描く：手前左（+y）に道がなく、手前右（+x）にあれば右の面
          const face = stage.cell(x, y + 1)?.terrain !== 'floor' && stage.cell(x + 1, y)?.terrain === 'floor' ? 'R' : 'L';
          sprites.push({
            depth: x + y + 0.1,
            draw: () => {
              ctx.globalAlpha = (hides ? 0.4 : 1) * f.alpha;
              info.draw(ctx, sx, sy + TH / 2, tickF, face);
              ctx.globalAlpha = 1;
            },
          });
        }
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
          sprites.push({ depth: x + y + 0.3, draw: () => this.goalDoor(sx, sy, pulse, COLORS.goal, true) });
        } else if (cell.obj?.type === 'portal') {
          // ハブの入口：その先の景色の色で光る戸口。近づくと行き先が出る
          const target = cell.obj.stage;
          const pulse = 1 - (tickF % TICKS_PER_BEAT) / TICKS_PER_BEAT;
          const land = landAt(x, y);
          const flash = land === null ? null : (songTime - land) / REVEAL.flash;
          const flashing = flash !== null && flash >= 0 && flash < 1;
          const flashColor = PORTAL_LIGHT[target] ?? COLORS.goal;
          sprites.push({
            depth: x + y + 0.3,
            draw: () => {
              ctx.globalAlpha = f.alpha;
              if (target === 'UPSTAIRS') this.stairs(sx, sy);
              else this.goalDoor(sx, sy, pulse, PORTAL_LIGHT[target]);
              ctx.globalAlpha = 1;
            },
          });
          if (flashing) {
            // 現れた入口の光。足もとから広がる輪は、入口のまわりのいくつものマスの床にかかるので、輪のドットを乗っているマスの列に
            // 分け、それぞれの列の道のすぐあと（その列に立つ物より前）に描く。入口のマスの順番でまとめて描くと、手前の列の道に隠れる
            for (const [d, dots] of this.revealRing(x, y, sx, sy, flash)) {
              sprites.push({
                depth: d + 0.05,
                draw: () => {
                  ctx.globalAlpha = 0.8 * (1 - flash);
                  ctx.fillStyle = flashColor;
                  for (const [dx, dy] of dots) ctx.fillRect(dx, dy, 2, 1);
                  ctx.globalAlpha = 1;
                },
              });
            }
            // 光の柱は戸口から上へ立つので、戸口のすぐあとに。二階への階段は光の柱を立てない（足もとの輪だけ）
            if (target !== 'UPSTAIRS') sprites.push({ depth: x + y + 0.35, draw: () => this.revealPillar(sx, sy, flash, flashColor) });
          }
          if (Math.max(Math.abs(x - px), Math.abs(y - py)) <= 3 && (flash === null || flash >= 0)) {
            labels.push({ x: sx, y: sy - 30, text: msg().stage(target), color: target === 'UPSTAIRS' ? COLORS.textDim : COLORS.text });
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
    // Esc で戻るときは、通り道のマスのうち少女にいちばん近いマスと一緒に薄れて消える（marks：危険物ごとの最初の立体物）
    const marks: { from: number; h: (typeof sim.hazards)[number] }[] = [];
    for (const [hazardIndex, h] of (clearSec === null ? sim.hazards : []).entries()) {
      marks.push({ from: sprites.length, h });
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
          const r = Math.min(Math.hypot(hx - h.pivot.x, hy - h.pivot.y) * CELL_LEN, KAISENTO_CHAIN);
          const lift = Math.round(KAISENTO_H - Math.sqrt(KAISENTO_CHAIN * KAISENTO_CHAIN - r * r));
          sprites.push({ depth: h.pivot.x + h.pivot.y + 0.5, draw: () => this.kaisentoPole(pv.sx, pv.sy + TH / 2) });
          sprites.push({
            depth: hx + hy + 0.5,
            draw: () => this.kaisentoRing(pv.sx, pv.sy + TH / 2, sx, sy + TH / 2, lift),
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
        } else if (h.look === 'zarigani') {
          const dir = { x: b.x - a.x, y: b.y - a.y };
          sprites.push({ depth: hx + hy + 0.5, draw: () => this.zarigani(sx, sy + TH / 2, dir, tickF) });
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
        if (h.look === 'tram') {
          // 路面電車：先頭が座席の位置、車体は走ってくる向きの後ろへ。線路の端から先（闇の上）では薄れて消えていく
          const u = h.seatAt(tickF);
          const v = Math.sign(h.seatAt(tickF + 0.5) - u) || 1;
          const head = along(u);
          const tail = along(u - v * 1.2);
          const over = Math.max(0, Math.abs(u) - (mid + 0.5));
          const alpha = clamp01(1 - over / 2.5);
          if (alpha > 0) {
            sprites.push({
              depth: Math.max(head.x + head.y, tail.x + tail.y) + 0.5,
              draw: () => {
                this.lctx.globalAlpha = alpha;
                this.tram(head, tail);
                this.lctx.globalAlpha = 1;
              },
            });
          }
          continue;
        }
        if (h.look === 'koinobori') {
          // 鯉のぼり：頭が座席の位置、胴は泳いでくる向きの後ろへ2マス
          const v = Math.sign(h.seatAt(tickF + 0.5) - h.seatAt(tickF)) || 1;
          const tail = along(h.seatAt(tickF) - v * 2);
          const n = hazardIndex;
          sprites.push({ depth: Math.max(seat.x + seat.y, tail.x + tail.y) + 0.5, draw: () => this.koinobori(seat, tail, tickF, n) });
          continue;
        }
        // 影：座席（錘・扇風機の頭）の真下に薄く。当たり判定のあるマスには濃く（座席が途中にあっても、どのマスが危険か分かるように）
        const hit = h.cellsAt(now)[0] ?? null;
        if (h.look === 'fan' && h.pivot) {
          const pv = h.pivot;
          const head = h.arc ? h.headAt(tickF) : seat;
          sprites.push({
            depth: Math.max(head.x + head.y, pv.x + pv.y) + 0.45,
            draw: () => {
              this.swingShadow(head, hit);
              this.fan(pv, head, tickF);
            },
          });
          continue;
        }
        sprites.push({
          depth: seat.x + seat.y + 0.45,
          draw: () => {
            this.swingShadow(seat, hit);
            if (h.look === 'pendulum') this.pendulum(ends, seat, h.reach);
            else this.swing(ends, seat, h.reach);
          },
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
        if ((h.look === 'kaki' || h.look === 'barrier') && h.pivot) {
          const c = h.cells[0];
          const pv = h.pivot;
          const look = h.look;
          sprites.push({
            depth: Math.max(c.x + c.y, pv.x + pv.y) + 0.4,
            draw: () => (look === 'kaki' ? this.kaki(pv, c, h, tickF, soon && now % 2 === 0) : this.barrier(pv, c, active, soon && now % 2 === 0)),
          });
          continue;
        }
        if (h.look === 'snow') {
          // 部品ごとに、乗っているマスの奥行きで描く（まとめて手前の順番で描くと、奥の雪煙や塊が手前の物に重なる）
          sprites.push(...this.snow(h, tickF, soon, now % 2 === 0));
          continue;
        }
        for (const c of h.cells) {
          const { sx, sy } = iso(c.x, c.y);
          sprites.push({ depth: c.x + c.y + 0.4, draw: () => this.periodic(sx, sy, active, soon && now % 2 === 0) });
        }
      } else if (h instanceof FlowHazard) {
        for (const it of h.itemsAt(tickF)) {
          if (it.age < 0) {
            // 湧き口の中に薄く見えている → その場で軽く跳び出す（跳んでいるあいだ湧き口のマスが危険）
            const c = h.cells[0];
            const { sx, sy } = iso(c.x, c.y);
            const u = (it.age + FLOW_JUMP) / FLOW_JUMP;
            const draw =
              u < 0
                ? () => this.flotsam(sx, sy + TH / 2, it.n, tickF, { alpha: 0.15 + 0.35 * (1 + it.age / (FLOW_JUMP + h.peek)), sunk: true })
                : () => this.flotsam(sx, sy + TH / 2, it.n, tickF, { lift: Math.round(Math.sin(Math.PI * u) * FLOW_HOP) });
            sprites.push({ depth: c.x + c.y + 0.45, draw });
            continue;
          }
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

    // Esc で戻るとき、少女は立っているマスと一緒に消える
    const own = backSec === null ? null : sink(sim.x, sim.y);
    const gone = backSec === null ? 1 : own ? own.alpha : 0;
    if (backSec !== null) {
      marks.forEach(({ from, h }, i) => {
        const cells = h instanceof PatrolHazard ? h.route : h instanceof SwingHazard || h instanceof PeriodicHazard || h instanceof FlowHazard ? h.cells : [];
        const alpha = Math.max(0, ...cells.map((c) => sink(c.x, c.y)?.alpha ?? 0));
        for (let j = from; j < (marks[i + 1]?.from ?? sprites.length); j++) {
          const draw = sprites[j].draw;
          sprites[j].draw = () => this.faded(alpha, draw);
        }
      });
    }

    if (up !== null) {
      // 階段（入口のマスに描く）より後に描く
      sprites.push({ depth: sim.x + sim.y + 0.5, draw: () => this.faded(upAlpha, () => this.player(p.sx, p.sy + TH / 2, 'left', walk, odd, tickF)) });
    } else if (exitSec !== null) {
      sprites.push({ depth: px + py + 0.5, draw: () => this.playerEntering(p.sx, p.sy + TH / 2, sim.facing, exitSec) });
    } else if (gone < 1) {
      const dy = own?.dy ?? 0;
      if (gone > 0) sprites.push({ depth: px + py + 0.5, draw: () => this.playerAppearing(p.sx, p.sy + TH / 2 + dy, sim.facing, gone) });
    } else if (climb && climb.appear < 1) {
      sprites.push({ depth: px + py + 0.5, draw: () => this.playerAppearing(p.sx, p.sy + TH / 2, sim.facing, climb.appear) });
    } else if (arrive < 1) {
      sprites.push({ depth: px + py + 0.5, draw: () => this.playerAppearing(p.sx, p.sy + TH / 2, sim.facing, arrive) });
    } else if (!(sim.stunned && Math.floor(tickF * 2) % 2 === 0)) {
      sprites.push({
        depth: px + py + 0.5,
        draw: () => this.player(p.sx, p.sy + TH / 2, sim.facing, walk, odd, tickF),
      });
    }

    // 足元のハイライトは、立っているマスの道の直後に。ただし枠の下半分は手前の列の道と重なって隠れるので、
    // 手前の列の道を描いたあとに描く（プレイヤーより後になるが、下半分は足より下なので重ならない。手前が段差で高いときを除く）
    if (stairs) {
      // 昇ってくる段の先にも数段あり、下の段ほど闇に溶ける。段の側面は1段下の段まで伸ばしてつなげる。
      // 昇ってくるあいだは、次に乗る段の縁が拍の頭で光って消える
      const road = this.road(stage.cell(stage.start.x, stage.start.y)!, light[stage.index(stage.start.x, stage.start.y)]);
      for (let j = 1; j <= stairs.n + STAIRS_FADE; j++) {
        const c = { x: stage.start.x + stairs.back.x * j, y: stage.start.y + stairs.back.y * j };
        const { sx, sy } = iso(c.x, c.y);
        const top = sy + j * STAIR_H;
        const b = sink(c.x, c.y);
        if (!b) continue;
        const alpha = (j <= stairs.n ? 1 - (j - 1) * 0.1 : (1 - (j - stairs.n) / (STAIRS_FADE + 1)) * 0.6) * b.alpha;
        sprites.push({
          depth: c.x + c.y,
          draw: () => {
            ctx.globalAlpha = alpha;
            fillSlabSides(ctx, sx, top, TW, TH, STAIR_H + FLOOR_THICK);
            ctx.drawImage(road, sx - TW / 2, top);
            ctx.globalAlpha = 1;
          },
        });
      }
      // 現れたあと前奏までそのまま待つあいだは光らせない（昇りはじめてから）
      if (climb && climb.climbing) {
        const c = { x: stage.start.x + stairs.back.x * climb.to, y: stage.start.y + stairs.back.y * climb.to };
        const { sx, sy } = iso(c.x, c.y);
        sprites.push({
          depth: c.x + c.y + 0.05,
          draw: () => {
            ctx.globalAlpha = 1 - climb.beat;
            strokeDiamond(ctx, sx, sy + climb.to * STAIR_H, TW, TH, COLORS.gem);
            ctx.globalAlpha = 1;
          },
        });
      }
    }
    // 階段を昇ってくるあいだと、現れるあいだは、足元の枠を出さない
    if (sim.status === 'playing' && !climb && arrive >= 1 && backSec === null) {
      const d = sim.x + sim.y;
      sprites.push({ depth: d + 0.05, draw: () => this.beatTile(sim, songTime / tickSec, false) });
      sprites.push({ depth: d + 0.501, draw: () => this.beatTile(sim, songTime / tickSec, true) });
    }

    // 奥行き順に描く：斜めの1列の道を描いたら、その列に立つ物を描き、次の列の道へ。
    // 闇の小物や家具の下の部分は、手前の列の道に隠れる（道より後にまとめて描くと、道の上にはみ出して見える）。
    // 動いている物（depth の小数部が 0.5 を超える）は、移る先の列の道の後に描く
    sprites.sort((a, b) => a.depth - b.depth);
    const diagOf = (depth: number) => Math.ceil(depth - 0.5 - 1e-6);
    const diags = stage.width + stage.height - 1;
    let next = 0;
    for (let d = 0; d < diags; d++) {
      floorDiag(d);
      while (next < sprites.length && diagOf(sprites[next].depth) <= d) sprites[next++].draw();
    }
    while (next < sprites.length) sprites[next++].draw();

    if (clearSec !== null) {
      const g = iso(goal.x, goal.y);
      this.clearLight(g.sx, g.sy + TH / 2, clearSec);
    }
    if (leaveSec !== null) {
      // 入口の色の光の柱
      const cell = stage.cell(sim.x, sim.y);
      const color = (cell?.obj?.type === 'portal' && PORTAL_LIGHT[cell.obj.stage]) || COLORS.goal;
      const g = iso(sim.x, sim.y);
      this.clearLight(g.sx, g.sy + TH / 2, leaveSec, color);
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
        labels.push({ x: sx, y: sy - 18, text: msg().stop, color: COLORS.warn });
      }
    }
    for (const l of labels) this.text(l.text, l.x, l.y, 1, l.color, 'center');
    if (import.meta.env.DEV && this.devLabels) {
      for (const l of devLabelList(stage, this.thingMap(stage))) {
        const { sx, sy } = iso(l.x, l.y);
        const y = sy + TH / 2 - l.height - 6;
        if (!onScreen(sx, y, 40, 8)) continue;
        const w = textWidth(l.text, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(Math.round(sx - w / 2) - 2, y - 4, w + 4, 8);
        this.text(l.text, sx, y, 1, '#ffd84a', 'center');
      }
    }

    ctx.restore();
    elevation = () => 0;

    // 闇に沈む（拠点の入口に入ったあと）／闇から明るくなる（ステージの始まり。カウントの1拍目）
    const dark =
      leaveSec !== null
        ? clamp01((leaveSec - LEAVE.fade) / (LEAVE.end - LEAVE.fade))
        : backSec !== null
          ? Math.max(clamp01((backSec - BACK.fade) / (BACK.end - BACK.fade)), stage.kind === 'stage' && songTime < 0 && atStart ? 1 - clamp01(beatU + 4) : 0)
          : stage.kind === 'stage' && songTime < 0 && atStart
          ? 1 - clamp01(beatU + 4)
          : 0;
    if (dark > 0) {
      ctx.globalAlpha = Math.ceil(dark * 4) / 4;
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, LW, LH);
      ctx.globalAlpha = 1;
    }
  }

  /**
   * draw を alpha の濃さで描く（中で globalAlpha を使う絵もまとめて薄めるよう、いったん別のバッファに描いてから重ねる）。
   * 道の位置合わせの平行移動（translate）はそのまま引き継ぐ
   */
  private faded(alpha: number, draw: () => void): void {
    if (alpha >= 1) return draw();
    if (alpha <= 0) return;
    const main = this.lctx;
    if (!this.fadeCtx) {
      const c = document.createElement('canvas');
      c.width = LW;
      c.height = LH;
      this.fadeCtx = c.getContext('2d')!;
    }
    const buf = this.fadeCtx;
    const m = main.getTransform();
    buf.setTransform(1, 0, 0, 1, 0, 0);
    buf.clearRect(0, 0, LW, LH);
    buf.setTransform(m);
    this.lctx = buf;
    try {
      draw();
    } finally {
      this.lctx = main;
    }
    main.save();
    main.setTransform(1, 0, 0, 1, 0, 0);
    main.globalAlpha = alpha;
    main.drawImage(buf.canvas, 0, 0);
    main.restore();
  }
  private fadeCtx: CanvasRenderingContext2D | null = null;

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

  /** 流されていく物の湧き口：水の中にあいた暗い穴。物はここに薄く見えてから跳び出す */
  private spring(cx: number, cy: number): void {
    const ctx = this.lctx;
    // 明るい縁と、奥の暗い穴
    fillEllipse(ctx, cx, cy, 8, 3, COLORS.waterLight);
    fillEllipse(ctx, cx, cy, 7, 2, COLORS.waterDeep);
    fillEllipse(ctx, cx, cy + 1, 5, 1, COLORS.bg);
  }

  /** 流されていく物：家から失われた物（人形、表札、子どもの靴）が、水面で揺れながら流れる */
  private flotsam(cx: number, cy: number, n: number, tickF: number, opts: { lift?: number; alpha?: number; sunk?: boolean } = {}): void {
    const ctx = this.lctx;
    const bob = opts.lift || opts.sunk ? 0 : Math.round(Math.sin(tickF * 0.9 + n) * 0.8);
    // 湧き口の中では、穴の底に沈んで見える
    const y = cy - 2 + bob - (opts.lift ?? 0) + (opts.sunk ? 3 : 0);
    const alpha = opts.alpha ?? 1;
    if (!opts.sunk) {
      ctx.globalAlpha = 0.5;
      fillEllipse(ctx, cx, cy, 5, 1, COLORS.waterDeep);
    }
    ctx.globalAlpha = alpha;
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
    ctx.globalAlpha = 1;
  }

  /** ステージの床の高さ（ドット）を返す関数 */
  private elevationOf(stage: Stage): (x: number, y: number) => number {
    let f = this.elevations.get(stage);
    if (!f) {
      f = stage.def.heights ? makeElevation(stage) : () => 0;
      this.elevations.set(stage, f);
    }
    return f;
  }

  /** 闇に浮かぶ物：マスの番号 → 種類 */
  private thingMap(stage: Stage): Map<number, string> {
    let m = this.thingMaps.get(stage);
    if (!m) {
      m = new Map((stage.def.things ?? []).map(([x, y, kind]) => [stage.index(x, y), kind]));
      this.thingMaps.set(stage, m);
    }
    return m;
  }

  /** 歩けない平らな面のタイル。水面はさざ波が動く */
  private surface(cell: Cell, tickF: number): HTMLCanvasElement {
    const kind = cell.scenery!;
    const frame = kind === 'w' ? mod(Math.floor(tickF / (TICKS_PER_BEAT / 2)), 2) : 0;
    const k = `${kind}|${cell.tint}|${cell.floor}|${frame}`;
    let sp = this.surfaces.get(k);
    if (!sp) {
      sp = makeSprite(TW, TH + FLOOR_THICK + 1, (ctx) => {
        const cx = TW / 2;
        fillSlabSides(ctx, cx, 0, TW, TH, FLOOR_THICK);
        if (kind === 'w') {
          fillDiamond(ctx, cx, 0, TW, TH, tinted(COLORS.waterDeep, cell.tint));
          fillDiamond(ctx, cx, 1, TW - 2, TH - 2, tinted(COLORS.water, cell.tint));
          ditherDiamond(ctx, cx, 1, TW - 2, TH - 2, COLORS.waterLight, (x, y) => (x - 2 * y + frame * 3 + 40) % 11 === 0 && x % 2 === 0);
        } else if (kind === 'r' || kind === 's') {
          // 歩かない屋根面：道より一段暗い瓦。雪の屋根は白く沈む
          const pal = FLOOR_LIGHT.roof[0];
          fillDiamond(ctx, cx, 0, TW, TH, tinted(pal.edge, cell.tint));
          fillDiamond(ctx, cx, 1, TW - 2, TH - 2, tinted(mixColor(pal.road[2], COLORS.bg, 0.25), cell.tint));
          ditherDiamond(ctx, cx, 1, TW - 2, TH - 2, COLORS.bg, (x, y) => (x - 2 * y + 48) % 6 === 0);
          if (kind === 's') {
            // 歩ける雪の斜面と見分けられるよう、歩かない雪の面は暗く沈める
            fillDiamond(ctx, cx, 1, TW - 4, TH - 3, mixColor(COLORS.snowShade, COLORS.bg, 0.68));
            ditherDiamond(ctx, cx, 1, TW - 4, TH - 3, mixColor(COLORS.snowShade, COLORS.bg, 0.4), (x, y) => (x * 3 + y * 5) % 7 === 0);
          }
        } else if (kind === 'p') {
          // 二階の壁の上端（窓の外のひさしの奥）
          fillDiamond(ctx, cx, 0, TW, TH, COLORS.facadeTop);
          ditherDiamond(ctx, cx, 0, TW, TH, COLORS.facadeSpeck, (x, y) => (x * 5 + y * 11) % 17 === 0);
        } else {
          // 人影の足場：別の時代の地面の切れ端
          const pal = FLOOR_LIGHT[cell.floor][0];
          fillDiamond(ctx, cx, 0, TW, TH, tinted(pal.edge, cell.tint));
          fillDiamond(ctx, cx, 1, TW - 4, TH - 2, tinted(pal.road[0], cell.tint));
        }
      });
      this.surfaces.set(k, sp);
    }
    return sp;
  }

  /** 家具の塊。sx, sy は床（高さ 0）での菱形の上の頂点、top は塊の高さ（ドット） */
  private furniture(sx: number, sy: number, top: number, kind: string): void {
    const ctx = this.lctx;
    const [t, l, r] = FURNITURE[kind] ?? FURNITURE.x;
    fillPrismSides(ctx, sx, sy - top, TW - 2, TH - 1, top, l, r);
    fillDiamond(ctx, sx, sy - top, TW - 2, TH - 1, t);
    if (kind === 'F') {
      // 襖の柄（少女の服と同じ系統の柄。企画書 第5章の手がかり）
      ditherDiamond(ctx, sx, sy - top, TW - 2, TH - 1, COLORS.fusumaPattern, (x, y) => (x * 3 + y * 5) % 7 === 0);
    }
  }

  /** 上れるマスの印：はしご（横木）、雨どい（縦の管）、雪の斜面（爪の跡） */
  private climbMark(sx: number, sy: number, kind: 'h' | 'g' | 's', stage: Stage, x: number, y: number): void {
    const ctx = this.lctx;
    // どちら向きに高くなっているか（はしごの横木はその向きに並べる）
    const h = stage.cell(x, y)!.height;
    const upY = (stage.cell(x, y - 1)?.height ?? 0) > h || (stage.cell(x, y + 1)?.height ?? 0) > h;
    if (kind === 'h') {
      for (const k of [-0.25, 0, 0.25]) {
        const a = upY ? { x: -0.3, y: k } : { x: k, y: -0.3 };
        const b = upY ? { x: 0.3, y: k } : { x: k, y: 0.3 };
        const pa = { x: sx + ((a.x - a.y) * TW) / 2, y: sy + TH / 2 + ((a.x + a.y) * TH) / 2 };
        const pb = { x: sx + ((b.x - b.y) * TW) / 2, y: sy + TH / 2 + ((b.x + b.y) * TH) / 2 };
        plotLine(ctx, Math.round(pa.x), Math.round(pa.y), Math.round(pb.x), Math.round(pb.y), COLORS.bridge);
      }
    } else if (kind === 'g') {
      fillEllipse(ctx, sx, sy + TH / 2, 3, 1, COLORS.antenna);
      ctx.fillStyle = COLORS.lampPole;
      ctx.fillRect(sx - 1, sy + TH / 2 - 1, 2, 1);
    } else {
      ctx.fillStyle = COLORS.snowShade;
      for (const dx of [-4, 0, 4]) ctx.fillRect(sx + dx, sy + TH / 2 - 1, 1, 2);
    }
  }

  /**
   * 床の高さの一方通行（企画書 第2.4節）：下りられるが、下りた先から戻れない辺。マスの番号 → その向き。
   * はしご・雨どいのない段差と斜面がこれに当たる
   */
  private dropMap(stage: Stage): Map<number, Dir[]> {
    let map = this.dropMaps.get(stage);
    if (map) return map;
    map = new Map();
    for (let y = 0; y < stage.height; y++) {
      for (let x = 0; x < stage.width; x++) {
        if (stage.cell(x, y)!.terrain !== 'floor') continue;
        for (const d of Object.keys(DIR_VEC) as Dir[]) {
          const nx = x + DIR_VEC[d].x;
          const ny = y + DIR_VEC[d].y;
          if (stage.cell(nx, ny)?.terrain !== 'floor') continue;
          if (!stage.canStep(x, y, nx, ny) || stage.canStep(nx, ny, x, y)) continue;
          const i = stage.index(x, y);
          map.set(i, [...(map.get(i) ?? []), d]);
        }
      }
    }
    this.dropMaps.set(stage, map);
    return map;
  }

  /**
   * 下りると戻れない縁の印：マスのその向きの縁の近くに、下る向きを指す山形を2つ（踏み外しそうな縁に引いた注意の線のように）。
   * 企画書 第2.4節は特殊マスの見た目を場所に合わせるとしているが、段差だけでは戻れるかどうか読めないので印を添える（仮）
   */
  private dropMark(sx: number, sy: number, dir: Dir): void {
    const ctx = this.lctx;
    const { x: dx, y: dy } = DIR_VEC[dir];
    // グリッドの向き → 画面上の向き（arrow と同じ。u は下る向き、v は縁に沿う向き）。u × 6 がマスの中心から縁の中ほど
    const ux = dx - dy;
    const uy = (dx + dy) / 2;
    const vx = -dy - dx;
    const vy = (dx - dy) / 2;
    const cy = sy + TH / 2;
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * 0.75;
    ctx.fillStyle = COLORS.dropMark;
    for (const tip of [5, 1]) {
      const tx = sx + ux * tip;
      const ty = cy + uy * tip;
      for (let k = 0; k < 3; k++) {
        ctx.fillRect(Math.round(tx - ux * k + vx * k), Math.round(ty - uy * k + vy * k), 2, 1);
        ctx.fillRect(Math.round(tx - ux * k - vx * k), Math.round(ty - uy * k - vy * k), 2, 1);
      }
    }
    ctx.globalAlpha = alpha;
  }

  /** 各マスの街灯の明るさ（街灯と玄関から 1マス以内: 2、2マス: 1） */
  private lightMap(stage: Stage): Uint8Array {
    let map = this.lightMaps.get(stage);
    if (map) return map;
    map = new Uint8Array(stage.width * stage.height);
    const things = this.thingMap(stage);
    for (let y = 0; y < stage.height; y++) {
      for (let x = 0; x < stage.width; x++) {
        const obj = stage.cell(x, y)!.obj;
        const th = things.get(stage.index(x, y));
        const lit = (th !== undefined && THINGS[th]?.light) || (obj?.type === 'prop' && ['lamp', 'entrance', 'lantern', 'engawa', 'window'].includes(obj.kind));
        if (!lit) continue;
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
    // 呼ぶ側の透明度（線路の端から先で薄れていく）に重ねる
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * 0.45;
    fillQuad(ctx, [pt(x0, y0, 0), pt(x1, y0, 0), pt(x1, y1, 0), pt(x0, y1, 0)], '#000');
    ctx.globalAlpha = a0 * 0.7;
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
    ctx.globalAlpha = a0;
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
   * 扇風機の首振り：pivot の台（闇に浮かぶ）に立ち、首を振って頭が道の上で弧を描く。head は頭のある位置（グリッド、小数）。
   * 頭の真下のマスが危険（cells の外にあるときは危険でない）
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
   * 振れる向きは道の斜めの向き（奥と手前）だが、立体のまま円を描かせると、手前へ振れたとき竿が長く、奥へ振れたとき短く見える。
   * そこで錘は、画面の上で支点を中心とする決まった半径の円を描く（正面から見た振り子と同じ、左右に対称な弧）。
   * 錘の左右の位置は真下のマスで決まり、高さだけが円から決まる
   */
  private pendulum(ends: { x: number; y: number }[], seat: { x: number; y: number }, reach: number): void {
    const ctx = this.lctx;
    const mid = { x: (ends[0].x + ends[1].x) / 2, y: (ends[0].y + ends[1].y) / 2 };
    const at = (gx: number, gy: number, h = 0) => {
      const q = iso(gx, gy);
      return { x: q.sx, y: q.sy + TH / 2 - h };
    };
    // 竿の長さ（画面のドット）。振り切ったときの傾きが MAX_SWING_ANGLE までになる長さ
    const half = TW / 2;
    const length = Math.max(36, Math.ceil((half * (reach + 0.5)) / Math.sin(MAX_SWING_ANGLE)));
    // 支点の高さ：振れ幅のどこでも、錘が真下の地面から LOW ドット以上離れる高さ。振れの向きに u マスずれると、
    // 真下の地面は画面で 6u 下がり、錘は円の上で支点から sqrt(length² - (12u)²) 下にある
    const LOW = 6;
    let pivotH = 0;
    for (let i = 0; i <= 40; i++) {
      const u = reach * (i / 20 - 1);
      const dx = Math.min(half * Math.abs(u), length);
      pivotH = Math.max(pivotH, LOW + Math.sqrt(length * length - dx * dx) - (TH / 2) * u);
    }
    const HANG = Math.ceil(pivotH) + 7;
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
    // 錘：画面の上で、支点を中心に円を描く（振り切るほど持ち上がる）
    const ground = at(seat.x, seat.y);
    const dx = Math.min(Math.abs(ground.x - top.x), length);
    const bob = { x: ground.x, y: Math.round(top.y - 7 + Math.sqrt(length * length - dx * dx)) };
    plotLine(ctx, top.x, top.y - 7, bob.x, bob.y, COLORS.brassDark);
    plotLine(ctx, top.x + 1, top.y - 7, bob.x + 1, bob.y, COLORS.brass);
    fillEllipse(ctx, bob.x, bob.y, 4, 4, COLORS.brassDark);
    fillEllipse(ctx, bob.x, bob.y, 3, 3, COLORS.brass);
    ctx.fillStyle = COLORS.brassLight;
    ctx.fillRect(bob.x - 2, bob.y - 2, 2, 1);
  }

  /**
   * 屋根から滑り落ちる雪：周期の [from, to) の間に、雪の塊が cells の先頭から末尾へ滑り落ちて闇へ消える（その間は cells のすべてが危険）。
   * pivot があれば、その屋根の軒（闇に浮かぶ瓦の端）から落ちてくる。ふだんは雪が少しずつ積もっていき、落ちる1拍前に震える。
   * 軒と積もる雪は軒のマス、雪煙と警告の枠は通り道のマスごと（その列の道のすぐあと）、塊はいる所のマスの奥行きで描く
   */
  private snow(h: PeriodicHazard, tickF: number, soon: boolean, blinkOn: boolean): { depth: number; draw: () => void }[] {
    const ctx = this.lctx;
    const parts: { depth: number; draw: () => void }[] = [];
    const path = [...(h.pivot ? [h.pivot] : []), ...h.cells];
    const point = (g: { x: number; y: number }, lift: number) => {
      const q = iso(g.x, g.y);
      return { x: q.sx, y: q.sy + TH / 2 - lift };
    };
    const EAVE = 9;
    const head = path[0];
    const phase = mod(tickF, h.period);
    const dur = h.to - h.from;
    const falling = phase >= h.from && phase < h.to;
    parts.push({
      depth: head.x + head.y + 0.4,
      draw: () => {
        if (h.pivot) {
          // 軒：上の屋根の瓦の端が、闇に少しだけのぞいている
          const e = point(h.pivot, EAVE);
          fillPrismSides(ctx, e.x, e.y - 3, 14, 6, 3, COLORS.slabMidL, COLORS.slabMidR);
          fillDiamond(ctx, e.x, e.y - 3, 14, 6, FLOOR_LIGHT.roof[0].road[0]);
        }
        if (falling) return;
        // 積もっていく雪
        const grow = mod(phase - h.to, h.period) / (h.period - dur);
        const r = 2 + Math.round(grow * 3);
        const shake = soon ? (Math.floor(tickF * 2) % 2 === 0 ? 1 : -1) : 0;
        const p0 = point(head, h.pivot ? EAVE + 1 : 0);
        fillEllipse(ctx, p0.x + shake, p0.y - 1, r + 1, Math.max(1, Math.round(r / 2)), COLORS.snowShade);
        fillEllipse(ctx, p0.x + shake, p0.y - 2, r, Math.max(1, Math.round(r / 2) - 1), COLORS.snow);
      },
    });
    for (const c of h.cells) {
      const q = iso(c.x, c.y);
      parts.push({
        depth: c.x + c.y + 0.05,
        draw: () => {
          if (soon && blinkOn) strokeDiamond(ctx, q.sx, q.sy + 2, TW - 8, TH - 4, COLORS.warn);
          // 滑り落ちている間：通り道に雪煙が立つ
          if (falling) ditherDiamond(ctx, q.sx, q.sy + 1, TW - 4, TH - 2, COLORS.snow, (x, y) => (x * 3 + y * 5 + Math.floor(tickF * 3)) % 7 === 0);
        },
      });
    }
    if (!falling) return parts;
    // 塊：先頭から末尾の先の闇へ滑っていく
    const u = (phase - h.from) / dur;
    const pos = u * path.length;
    const i = Math.min(Math.floor(pos), path.length - 1);
    const a = path[i];
    const b = path[i + 1] ?? { x: a.x * 2 - (path[i - 1]?.x ?? a.x), y: a.y * 2 - (path[i - 1]?.y ?? a.y) };
    const k = pos - i;
    const lift = h.pivot && i === 0 ? EAVE * (1 - k) : 0;
    const at = { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) };
    const q = point(at, lift);
    parts.push({
      depth: Math.round(at.x + at.y) + 0.4,
      draw: () => {
        ctx.globalAlpha = 0.4;
        fillEllipse(ctx, q.x, q.y + lift, 5, 1, '#000');
        ctx.globalAlpha = 1;
        fillEllipse(ctx, q.x, q.y - 3, 6, 4, COLORS.snowShade);
        fillEllipse(ctx, q.x - 1, q.y - 4, 5, 3, COLORS.snow);
      },
    });
    return parts;
  }

  /** ザリガニ：浸かった道を横切る。dir は進む向き（グリッド） */
  private zarigani(cx: number, cy: number, dir: { x: number; y: number }, tickF: number): void {
    const ctx = this.lctx;
    const ux = dir.x - dir.y;
    const uy = (dir.x + dir.y) / 2;
    const s = Math.sign(ux) || 1;
    ctx.globalAlpha = 0.35;
    fillEllipse(ctx, cx, cy, 5, 1, '#000');
    ctx.globalAlpha = 1;
    const y = cy - 3;
    fillEllipse(ctx, cx, y, 4, 2, COLORS.zari);
    fillEllipse(ctx, cx - s * 4, y + Math.round(uy), 2, 1, COLORS.zariDark);
    // はさみ：拍に合わせて開け閉め
    const open = Math.floor(tickF / 2) % 2 === 0 ? 1 : 0;
    ctx.fillStyle = COLORS.zari;
    ctx.fillRect(cx + s * 4, y - 2 - open, 3, 2);
    ctx.fillRect(cx + s * 4, y + 1 + open, 3, 2);
    ctx.fillStyle = COLORS.zariDark;
    for (const dx of [-2, 0, 2]) ctx.fillRect(cx + dx, y + 2, 1, 2);
  }

  /** 熟して落ちる柿の実：枝（pivot の木）に下がった実が、周期の [from, to) の間に道のマスへ落ちる */
  private kaki(pivot: Vec, target: Vec, h: PeriodicHazard, tickF: number, blink: boolean): void {
    const ctx = this.lctx;
    const p = iso(pivot.x, pivot.y);
    const tg = iso(target.x, target.y);
    const branch = { x: Math.round(lerp(p.sx, tg.sx, 0.6)), y: tg.sy + TH / 2 - 30 };
    const phase = mod(tickF, h.period);
    const falling = phase >= h.from && phase < h.to;
    if (blink) strokeDiamond(ctx, tg.sx, tg.sy + 2, TW - 8, TH - 4, COLORS.warn);
    ctx.fillStyle = COLORS.wood;
    ctx.fillRect(branch.x - 6, branch.y - 2, 12, 1);
    const u = falling ? (phase - h.from) / (h.to - h.from) : 0;
    const fx = Math.round(lerp(branch.x, tg.sx, u));
    const fy = Math.round(lerp(branch.y, tg.sy + TH / 2 - 3, u * u));
    if (falling) {
      ctx.globalAlpha = 0.4;
      fillEllipse(ctx, tg.sx, tg.sy + TH / 2, 4, 1, '#000');
      ctx.globalAlpha = 1;
    }
    fillEllipse(ctx, fx, fy, 2, 2, COLORS.kaki);
    ctx.fillStyle = COLORS.leaf;
    ctx.fillRect(fx - 1, fy - 3, 3, 1);
  }

  /** 踏切の遮断機：pivot の柱から、閉じているあいだ（危険）は道のマスの上へ赤白の棒が下りる */
  private barrier(pivot: Vec, target: Vec, down: boolean, blink: boolean): void {
    const ctx = this.lctx;
    const p = iso(pivot.x, pivot.y);
    const tg = iso(target.x, target.y);
    const ground = p.sy + TH / 2;
    ctx.drawImage(this.footing, p.sx - 6, ground - 3);
    ctx.fillStyle = '#d8d0c4';
    ctx.fillRect(p.sx - 1, ground - 14, 2, 14);
    // 警報灯：閉じる前と閉じているあいだ、交互に点く
    ctx.fillStyle = blink || down ? COLORS.warn : COLORS.lampPole;
    ctx.fillRect(p.sx - 3, ground - 16, 2, 2);
    ctx.fillStyle = !blink && down ? COLORS.warn : COLORS.lampPole;
    ctx.fillRect(p.sx + 1, ground - 16, 2, 2);
    const end = down ? { x: tg.sx + (tg.sx - p.sx) * 0.4, y: tg.sy + TH / 2 - 8 } : { x: p.sx + (tg.sx - p.sx) * 0.15, y: ground - 34 };
    const n = Math.max(1, Math.round(Math.hypot(end.x - p.sx, end.y - (ground - 12))));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(lerp(p.sx, end.x, i / n));
      const y = Math.round(lerp(ground - 12, end.y, i / n));
      ctx.fillStyle = Math.floor(i / 4) % 2 === 0 ? '#c9473b' : '#e8e1d6';
      ctx.fillRect(x, y, 1, 2);
    }
    if (blink) strokeDiamond(ctx, tg.sx, tg.sy + 2, TW - 8, TH - 4, COLORS.warn);
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
      const gx = STAIR_STEP_X(i);
      const top = STAIR_STEP_H(i);
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
  private goalDoor(sx: number, sy: number, pulse: number, light: string = COLORS.goal, beacon = false): void {
    const ctx = this.lctx;
    const g = sy + TH / 2;
    if (beacon) {
      // ステージのゴール：戸口から闇の上へ光の柱が立ち、拍に合わせて明滅する（離れた所からも、行き止まりの奥でも見つけられるように）
      const top = g - 22;
      for (let r = 0; r < BEACON_H; r += 2) {
        const fade = 1 - r / BEACON_H;
        ctx.fillStyle = light;
        ctx.globalAlpha = (0.18 + pulse * 0.14) * fade;
        ctx.fillRect(sx - 4, top - r - 2, 8, 2);
        ctx.globalAlpha = (0.5 + pulse * 0.4) * fade;
        ctx.fillRect(sx - 1, top - r - 2, 2, 2);
      }
    }
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

  /** 新しく現れる入口のマス（入口がなければ、最後に現れるマス） */
  private revealGate(stage: Stage, order: ReadonlyMap<number, number>): Vec | null {
    let gate: Vec | null = null;
    let last = -1;
    for (let y = 0; y < stage.height; y++) {
      for (let x = 0; x < stage.width; x++) {
        const k = order.get(stage.index(x, y));
        if (k === undefined) continue;
        if (stage.cell(x, y)?.obj?.type === 'portal') return { x, y };
        if (k > last) {
          last = k;
          gate = { x, y };
        }
      }
    }
    return gate;
  }

  /** 拠点に現れた入口が放つ光の柱。k は 0〜1（1 で消える） */
  private revealPillar(sx: number, sy: number, k: number, light: string): void {
    const ctx = this.lctx;
    const g = sy + TH / 2;
    const fade = 1 - k;
    ctx.fillStyle = light;
    for (let r = 0; r < BEACON_H; r += 2) {
      const a = fade * (1 - r / BEACON_H);
      ctx.globalAlpha = 0.3 * a;
      ctx.fillRect(sx - 6, g - 22 - r - 2, 12, 2);
      ctx.globalAlpha = 0.9 * a;
      ctx.fillRect(sx - 2, g - 22 - r - 2, 4, 2);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * 拠点に現れた入口 (x, y) の足もとから広がる輪（菱形の線。k は 0〜1 で、入口のマスの大きさから 3 マス幅まで広がる）のドットを、
   * 乗っているマスの斜めの列（x + y）ごとに分けて返す。sx, sy は入口のマスの上の頂点。ドットは幅 2・高さ 1
   */
  private revealRing(x: number, y: number, sx: number, sy: number, k: number): Map<number, [number, number][]> {
    const w = 2 * Math.round(TW / 2 + k * TW);
    const h = w / 2;
    const cy = sy + TH / 2;
    const top = cy - w / 4;
    const byDiag = new Map<number, [number, number][]>();
    for (let r = 0; r < h; r++) {
      const rw = diamondRowWidth(r, w, h);
      for (const left of [sx - rw / 2, sx + rw / 2 - 2]) {
        const dotY = top + r;
        // ドットの中心が、入口のマスの中心から何マスずれているか（iso の逆）
        const u = (left + 1 - sx) / (TW / 2);
        const v = (dotY + 0.5 - cy) / (TH / 2);
        const d = x + y + Math.floor((u + v) / 2 + 0.5) + Math.floor((v - u) / 2 + 0.5);
        let dots = byDiag.get(d);
        if (!dots) byDiag.set(d, (dots = []));
        dots.push([left, dotY]);
      }
    }
    return byDiag;
  }

  /** 回旋塔の柱 */
  private kaisentoPole(cx: number, ground: number): void {
    const ctx = this.lctx;
    ctx.globalAlpha = 0.45;
    fillEllipse(ctx, cx, ground, 3, 1, '#000');
    ctx.globalAlpha = 1;
    ctx.fillStyle = COLORS.rust;
    ctx.fillRect(cx - 1, ground - KAISENTO_H, 2, KAISENTO_H);
    ctx.fillStyle = COLORS.rustDark;
    ctx.fillRect(cx, ground - KAISENTO_H, 1, KAISENTO_H);
    ctx.fillStyle = COLORS.rustLight;
    ctx.fillRect(cx - 2, ground - KAISENTO_H - 2, 4, 2);
  }

  /** 回旋塔の輪（柱のてっぺんから鎖で吊られている）。輪の真下のマスが危険。lift は輪の高さ（ドット） */
  private kaisentoRing(pcx: number, pground: number, cx: number, ground: number, lift: number): void {
    const ctx = this.lctx;
    const ry = ground - lift;
    const r = 5;
    ctx.globalAlpha = 0.45;
    fillEllipse(ctx, cx, ground, r, 1, '#000');
    ctx.globalAlpha = 1;
    // 輪は水平。柱のてっぺんから、輪の左右の端へ鎖が2本
    plotLine(ctx, pcx, pground - KAISENTO_H, cx - r, ry, COLORS.rustDark);
    plotLine(ctx, pcx, pground - KAISENTO_H, cx + r, ry, COLORS.rustDark);
    strokeIsoRing(ctx, cx, ry, r, COLORS.rustDark, COLORS.rustLight);
  }

  /**
   * 箱ブランコ（振り子・扇風機も）の影。seat は座席の真下の位置（グリッド、小数）、hit は当たり判定のあるマス。
   * 座席の真下には薄い影がついていき、判定のあるマスには濃い影を落とす（振り切って判定がないときは薄い影だけ）
   */
  private swingShadow(seat: { x: number; y: number }, hit: Vec | null): void {
    const ctx = this.lctx;
    const s = iso(seat.x, seat.y);
    ctx.globalAlpha = 0.25;
    fillEllipse(ctx, s.sx, s.sy + TH / 2, 5, 1, '#000');
    if (hit) {
      const c = iso(hit.x, hit.y);
      ctx.globalAlpha = 0.6;
      fillEllipse(ctx, c.sx, c.sy + TH / 2, 7, 2, '#000');
    }
    ctx.globalAlpha = 1;
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
    // 吊り棒、座席（梁と平行な板）
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
  /** 足元のハイライト。front でないときは塗りと枠の上半分（と段差に隠れる下の辺）、front のときは枠の下半分（手前の列の道の上に描く） */
  private beatTile(sim: Sim, tick: number, front: boolean): void {
    const ctx = this.lctx;
    const interval = ZONE_INTERVAL[sim.stage.cell(sim.x, sim.y)!.zone];
    const beatPulse = 1 - mod(tick, TICKS_PER_BEAT) / TICKS_PER_BEAT;
    const countPulse = interval < TICKS_PER_BEAT ? (1 - mod(tick, interval) / interval) * 0.5 : 0;
    // 色数を増やさないよう、明るさは4段階
    const level = Math.floor(Math.max(beatPulse, countPulse) * 4) / 4;
    const downbeat = mod(Math.floor(tick / TICKS_PER_BEAT), 4) === 0;
    const color = downbeat ? COLORS.gem : COLORS.text;
    const { sx, sy } = iso(sim.x, sim.y);
    if (!front) {
      ctx.globalAlpha = 0.1 + level * 0.3;
      fillDiamond(ctx, sx, sy + 1, TW - 4, TH - 2, color);
    }
    ctx.globalAlpha = 0.25 + level * 0.75;
    if (!front) strokeDiamond(ctx, sx, sy, TW, TH, color, 0, TH / 2);
    // 枠の下半分の左右の辺：手前のマスが高い（段差が手前にある）ときは、その段に隠れるようプレイヤーと一緒に描く。
    // 同じ高さか低いときは、手前の道に隠れないよう、手前の列の道の後に描く
    const stage = sim.stage;
    const h = stage.cell(sim.x, sim.y)!.height;
    const higher = (x: number, y: number) => (stage.cell(x, y)?.height ?? -Infinity) > h;
    ctx.fillStyle = color;
    for (const [side, nx, ny] of [[-1, sim.x, sim.y + 1], [1, sim.x + 1, sim.y]] as const) {
      if (higher(nx, ny) === front) continue;
      for (let r = TH / 2; r < TH; r++) {
        const rw = diamondRowWidth(r, TW, TH);
        ctx.fillRect(side < 0 ? sx - rw / 2 : sx + rw / 2 - 2, sy + r, 2, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * 少女が現れる（チュートリアルの始まり。クリア演出の逆）：足元に光がたまり、少女の形の光が上から降りてきて、
   * 光が引くと少女が立っている。v は 0〜1
   */
  private playerAppearing(cx: number, cy: number, facing: Dir, v: number): void {
    if (v <= 0) return;
    const ctx = this.lctx;
    const left = cx - GIRL_FOOT_X;
    const top = cy - GIRL_FOOT_Y;
    const step = (x: number) => Math.round(x * 4) / 4;
    ctx.globalAlpha = step(Math.sin(Math.PI * v) * 0.4);
    fillDiamond(ctx, cx, cy - TH / 2 + 1, TW - 4, TH - 2, COLORS.goal);
    const glow = this.girlGlow[GIRL_DIR[facing]];
    if (v < 0.5) {
      ctx.globalAlpha = step(v * 2);
      ctx.drawImage(glow, left, top - Math.round((0.5 - v) * 24));
    } else {
      ctx.globalAlpha = 1;
      ctx.drawImage(this.girl[GIRL_DIR[facing]][0], left, top);
      ctx.globalAlpha = step(1 - (v - 0.5) * 2);
      ctx.drawImage(glow, left, top);
    }
    ctx.globalAlpha = 1;
  }

  /** クリア演出の少女：ゴールに入ってきた向きのまま立ち止まり、光に包まれて溶け、ふわりと浮いて消える */
  private playerEntering(cx: number, cy: number, facing: Dir, e: number): void {
    if (e >= CLEAR.gone) return;
    const ctx = this.lctx;
    const left = cx - GIRL_FOOT_X;
    const top = cy - GIRL_FOOT_Y;
    const u = clamp01((e - CLEAR.glow) / (CLEAR.gone - CLEAR.glow));
    const step = (v: number) => Math.round(v * 4) / 4;
    if (u < 0.5) {
      ctx.drawImage(this.girl[GIRL_DIR[facing]][0], left, top);
      ctx.globalAlpha = step(u * 2);
      ctx.drawImage(this.girlGlow[GIRL_DIR[facing]], left, top);
    } else {
      ctx.globalAlpha = step(1 - (u - 0.5) * 2);
      ctx.drawImage(this.girlGlow[GIRL_DIR[facing]], left, top - Math.round((u - 0.5) * 12));
    }
    ctx.globalAlpha = 1;
  }

  /** クリア演出の光：扉の足元に広がる光、扉から立ち上る光の柱、昇っていく光の粒 */
  private clearLight(cx: number, ground: number, e: number, color: string = COLORS.goal): void {
    const ctx = this.lctx;
    // 足元の光（扉のまわりのマスへ広がる）
    const spread = Math.min(TW * 2, 8 + Math.floor(e * 40) * 2);
    ctx.globalAlpha = 0.25;
    fillDiamond(ctx, cx, ground - spread / 4, spread, spread / 2, color);
    // 光の柱。芯は濃く、外側は薄い
    const w = Math.min(12, Math.floor(e * 24) * 2);
    if (w > 0) {
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = color;
      ctx.fillRect(cx - w / 2, ground - LH * 2, w, LH * 2 - 2);
      ctx.globalAlpha = 0.45;
      ctx.fillRect(cx - w / 4, ground - LH * 2, w / 2, LH * 2 - 2);
    }
    // 光の粒：柱のまわりを昇って消える。位置は番号から決める（毎フレーム同じ動き）
    ctx.fillStyle = color;
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

  /** 拠点の、これまでに溜めた得点の総計（エンディングで使われる値。エンディングのはじめも同じ位置・大きさで出す：ending.ts の TOTAL_AT） */
  hubTotal(): void {
    this.text(msg().total(String(this.totalScore).padStart(7, '0')), 6, 15, 1, COLORS.gem);
  }

  hud(sim: Sim, songTime: number, tickSec: number): void {
    const beatSec = tickSec * TICKS_PER_BEAT;

    // 拠点：時間も得点もない。拍の点と、操作の案内だけ
    if (sim.stage.kind === 'hub') {
      this.beatDots(songTime, beatSec);
      this.text(msg().hub, 6, 7, 1, COLORS.textDim);
      this.hubTotal();
      return;
    }
    if (sim.stage.kind === 'tutorial') {
      // 案内：いちばん近い1つを、近づいたときだけ画面の下に字幕で出す
      let best: { text: string; d: number } | null = null;
      for (const h of sim.stage.def.hints ?? []) {
        const d = Math.abs(h.x - sim.x) + Math.abs(h.y - sim.y);
        if (d <= 3 && (!best || d < best.d)) best = { text: h.text[lang()], d };
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

    const m = msg();
    this.text(m.score(String(sim.score).padStart(6, '0')), 6, 7, 1, COLORS.text);
    this.text(`×${sim.multiplier}`, 6, 15, 1, sim.multiplier > 1 ? COLORS.gem : COLORS.textDim);
    if (sim.misses > 0) this.text(m.miss(sim.misses), 6, 23, 1, COLORS.textDim);

    const remain = Math.max(0, sim.totalTicks * tickSec - Math.max(0, songTime));
    const mm = Math.floor(remain / 60);
    const ss = Math.floor(remain % 60);
    this.text(`${mm}:${String(ss).padStart(2, '0')}`, LW - 6, 7, 1, remain < 10 ? COLORS.warn : COLORS.text, 'right');
    const bar = Math.min(sim.stage.def.bars, Math.max(0, Math.floor(songTime / (beatSec * 4))) + 1);
    this.text(m.bar(bar, sim.stage.def.bars), LW - 6, 15, 1, COLORS.textDim, 'right');

    this.beatDots(songTime, beatSec);

    // カウントの数字は曲の頭の4拍だけ（チュートリアルの、少女が現れる小節では出さない）
    const n = Math.ceil(-songTime / beatSec);
    if (songTime < 0 && n <= 4) {
      this.text(String(n), LW / 2, LH / 2 - 36, 4, COLORS.text, 'center');
    }
  }

  /** スタートの後ろの階段（StageDef.stairs）：段数と、スタートから見て階段の下りていく向き（進む向きの反対） */
  private stairsOf(sim: Sim): { n: number; back: Vec } | null {
    const n = sim.stage.def.stairs;
    if (!n) return null;
    const f = DIR_VEC[sim.stage.startFacing()];
    return { n, back: { x: -f.x, y: -f.y } };
  }

  /**
   * 曲の頭まで（songTime < 0）の、階段での様子。k は補間した段（0 がスタート）、to は昇っていく先の段、
   * walk は歩きのコマの進み、beat は拍の中の進み（0〜1）、appear は現れる演出の進み（0 はまだいない、1 で現れ終わる）。
   * climbing は前奏で昇っているあいだ（現れるあいだと、現れてから前奏までそのまま待つあいだは false）。
   * 現れるあいだは階段のいちばん下に立ち、そのあと拍の頭で1段ずつ、歩くときと同じ速さで昇る。
   * songTime が -Infinity（曲を読み込んでいるあいだ）なら、まだいない。スタートから動いていないときだけ。それ以外は null
   */
  private climbAt(sim: Sim, songTime: number, tickSec: number): { k: number; to: number; walk: number; beat: number; appear: number; climbing: boolean } | null {
    const n = sim.stage.def.stairs ?? 0;
    if (!n || songTime >= 0 || sim.x !== sim.stage.start.x || sim.y !== sim.stage.start.y) return null;
    const u = songTime / (tickSec * TICKS_PER_BEAT);
    if (u < -n) return { k: n, to: n, walk: 1, beat: 0, appear: clamp01((u + n + APPEAR_BARS * 4 + APPEAR_REST_BEATS) / (APPEAR_BARS * 4)), climbing: false };
    const b = Math.floor(u);
    const beat = u - b;
    // 段から段へ動くのは、ふつうに1マス歩くときと同じ長さ（world の slide と同じ）
    const slide = (Math.min(ZONE_INTERVAL[0], 2) * 0.6) / TICKS_PER_BEAT;
    return { k: lerp(-b, -b - 1, clamp01(beat / slide)), to: -b - 1, walk: beat, beat, appear: 1, climbing: true };
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
  clearResult(sim: Sim, e: number, prompt: string): void {
    const t = e - CLEAR.panel;
    if (t < 0) return;
    const ctx = this.lctx;
    // 帯は光の柱が上下に見えるよう画面の中ほどだけ
    ctx.globalAlpha = Math.min(0.75, Math.ceil(t * 8) / 8);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 50, LW, 186);
    ctx.globalAlpha = 1;

    const m = msg();
    const title = m.clear;
    this.text([...title].slice(0, Math.floor(t / 0.08)).join(''), LW / 2 - textWidth(title, 3) / 2, 74, 3, COLORS.goal);
    if (t > 0.3) this.text(m.stage(sim.stage.def.name), LW / 2, 94, 1, COLORS.textDim, 'center');

    const remainBeats = sim.goalBeatsLeft;
    const rows = [
      { label: m.rowScore, value: sim.score - sim.goalBonus, y: 120, prefix: '' },
      { label: m.rowBonus, value: sim.goalBonus, y: 140, prefix: '+', note: m.beatsLeft(remainBeats) },
      { label: m.rowMiss, value: sim.misses, y: 166, prefix: '' },
      { label: m.rowTotal, value: sim.score, y: 196, prefix: '', big: true },
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
    if (e >= CLEAR.end && Math.floor(e * 2) % 2 === 0) this.text(prompt, LW / 2, 222, 1, COLORS.gem, 'center');
  }

  /** エンディング（ending.ts）。t は始まってからの秒、total は使われる得点 */
  ending(t: number, total: number, texts: EndingTexts): void {
    drawEnding(
      this.lctx,
      t,
      total,
      {
        front: this.girl[GIRL_DIR.down],
        back: this.girl[GIRL_DIR.up],
        raise: this.girlRaise,
      },
      texts,
    );
  }

  /**
   * タイトル（ending.ts の drawTitle）：闇に浮かぶ家と、その前に立つ少女。t は秒。
   * 家はクリアしたステージに当たる部分が戻っている。
   * home は家に帰ってくる演出（ending.ts の HOMECOMING）
   */
  title(t: number, opts: TitleOpts): void {
    drawTitle(this.lctx, t, opts, {
      front: this.girl[GIRL_DIR.down],
      back: this.girl[GIRL_DIR.up],
      raise: this.girlRaise,
    });
  }

  /** 読み込み中の「LOADING...」（画面の左下）。sec は暗転してからの秒。文字が左から順に跳ねる波を、LOADING.period ごとにくり返す */
  loading(sec: number): void {
    if (sec < LOADING.delay) return;
    const text = msg().loading;
    const t = (sec - LOADING.delay) % LOADING.period;
    [...text].forEach((ch, i) => {
      // 文字の左端：前の文字までの幅（字間を含む）
      const x = 6 + (i === 0 ? 0 : textWidth(text.slice(0, i), 1) + 1);
      const u = (t - i * LOADING.stagger) / LOADING.lift;
      const dy = u > 0 && u < 1 ? -Math.round(Math.sin(u * Math.PI) * LOADING.hop) : 0;
      this.text(ch, x, LH - 12 + dy, 1, COLORS.textDim);
    });
  }

  /** 画面全体を闇で覆う（v は 0〜1。色数を増やさないよう、ふだんは4段階。長く消えていくところは steps を増やして滑らかに） */
  darken(v: number, steps = 4): void {
    if (v <= 0) return;
    const ctx = this.lctx;
    ctx.globalAlpha = Math.ceil(clamp01(v) * steps) / steps;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, LW, LH);
    ctx.globalAlpha = 1;
  }

  /**
   * はい・いいえの確認（二階へ昇るか、記録を消すか）。はじめは「いいえ」が選ばれている。
   * 二階へ昇るとき（企画書 第2.3節）は、取り返しのつかないことが起きると意図的に予告する（問いの一文だけで、説明は足さない）。
   * 操作の案内も出さない：左右で選んで Enter。クリック・タップは YES を選んでから、もう一度で決まる（選んだほうに > が付く）。
   * fade（0〜1）で現れる・消えるときの濃さ。背景の暗さはなめらかに、文字は4段階で濃くなる
   */
  confirm(question: string, note: string | null, yes: boolean, fade = 1): void {
    const ctx = this.lctx;
    const k = clamp01(fade);
    if (k <= 0) return;
    ctx.globalAlpha = 0.8 * k;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, LW, LH);
    ctx.globalAlpha = Math.ceil(k * 4) / 4;
    this.text(question, LW / 2, LH / 2 - (note ? 30 : 16), 2, COLORS.text, 'center');
    if (note) this.text(note, LW / 2, LH / 2 - 10, 1, COLORS.textDim, 'center');
    this.text(msg().yes(yes), LW / 2 - 30, LH / 2 + 20, 2, yes ? COLORS.gem : COLORS.textDim, 'center');
    this.text(msg().no(!yes), LW / 2 + 34, LH / 2 + 20, 2, !yes ? COLORS.gem : COLORS.textDim, 'center');
    ctx.globalAlpha = 1;
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

/** 開発用の札（?labels）の一つ */
interface DevLabel {
  x: number;
  y: number;
  text: string;
  height: number;
}
/** ステージごとの札の一覧（開発のときだけ作る） */
let devLabelLists: WeakMap<Stage, DevLabel[]> | null = null;

/**
 * 開発用の札（?labels）の一覧。マスを奥の行から順に見て、闇に浮かぶ物（things）・小物（prop）・家具の塊（scenery。
 * 平らな面は除く）に 1 から番号を振る。同じ種類が隣り合って並ぶ物（戸、障子、家具の塊など）は、奥の端の1マスにだけ札を付ける。札の字は大文字にし、'_' は '-' にする（/gallery.html の名前と同じ書き方）
 */
function devLabelList(stage: Stage, things: Map<number, string>): DevLabel[] {
  devLabelLists ??= new WeakMap();
  let list = devLabelLists.get(stage);
  if (list) return list;
  list = [];
  const name = (kind: string) => kind.toUpperCase().replace(/_/g, '-');
  for (let y = 0; y < stage.height; y++) {
    for (let x = 0; x < stage.width; x++) {
      const cell = stage.cell(x, y)!;
      // 奥の隣（x-1 か y-1）が同じ種類なら、並びの続きとして札を付けない
      const kindAt = (cx: number, cy: number): string | undefined => {
        const c = stage.cell(cx, cy);
        if (!c || c.terrain !== 'wall') return undefined;
        return things.get(stage.index(cx, cy)) ?? (c.obj?.type === 'prop' ? c.obj.kind : undefined);
      };
      const continues = (kind: string) => kindAt(x - 1, y) === kind || kindAt(x, y - 1) === kind;
      const th = things.get(stage.index(x, y));
      if (th && !continues(th)) list.push({ x, y, text: `${list.length + 1} ${name(th)}`, height: THINGS[th]?.height ?? 8 });
      const obj = cell.obj;
      if (cell.terrain === 'wall' && obj?.type === 'prop' && !continues(obj.kind)) {
        const height = BLOCK_PROPS.has(obj.kind) ? FACADE_H : TALL_PROPS.has(obj.kind) ? POLE_H + 6 : 16;
        list.push({ x, y, text: `${list.length + 1} ${name(obj.kind)}`, height });
      }
      // 平らな面（水面・屋根など）は札を付けない（広くて札が並ぶだけなので）
      const sc = cell.terrain === 'wall' && cell.scenery && !SURFACES.has(cell.scenery) ? cell.scenery : undefined;
      if (sc && stage.cell(x - 1, y)?.scenery !== sc && stage.cell(x, y - 1)?.scenery !== sc) {
        list.push({ x, y, text: `${list.length + 1} ${name(sc)}`, height: Math.round(cell.height * PX_PER_UNIT) });
      }
    }
  }
  devLabelLists.set(stage, list);
  return list;
}
