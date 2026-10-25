import { PatrolHazard, PeriodicHazard, SwingHazard } from '../game/hazard.ts';
import type { Sim } from '../game/sim.ts';
import type { PropKind, Stage } from '../game/stage.ts';
import { DIR_VEC, mod, TICKS_PER_BEAT, ZONE_INTERVAL, type Dir, type Zone } from '../game/types.ts';
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

/** 街灯の明るさの段階ごとの道の色（0: 闇、1: 街灯から2マス、2: 街灯のすぐそば）。各段階はゾーン別 */
const ROAD_LIGHT = [
  { edge: '#3a3741', road: ['#56525e', '#46434e', '#36343d'] },
  { edge: '#433e40', road: ['#625b5e', '#4f4a4c', '#3c393c'] },
  { edge: '#4d4640', road: ['#73695f', '#5b534c', '#443f3c'] },
] as const;
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

function makeRoadSprite(zone: Zone, light: number): HTMLCanvasElement {
  return makeSprite(TW, TH + FLOOR_THICK + 1, (ctx) => {
    const cx = TW / 2;
    fillSlabSides(ctx, cx, 0, TW, TH, FLOOR_THICK);
    fillDiamond(ctx, cx, 0, TW, TH, ROAD_LIGHT[light].edge);
    fillDiamond(ctx, cx, 1, TW - 4, TH - 2, ROAD_LIGHT[light].road[zone]);
    if (zone === 0) {
      ditherDiamond(ctx, cx, 1, TW - 4, TH - 2, COLORS.roadSpeck, (x, y) => (x * 7 + y * 13) % 23 === 0);
    } else {
      const period = zone === 1 ? 8 : 4;
      ditherDiamond(ctx, cx, 0, TW, TH, COLORS.bg, (x, y) => (x + 2 * y) % period === 0);
    }
  });
}

/** 闇に浮かぶ、家の入口の断片（壁ひと切れ）。扉は wallCell で側面に描く */
function makeFacadeSprite(): HTMLCanvasElement {
  return makeSprite(TW, FACADE_H + TH + FLOOR_THICK + 1, (ctx) => {
    const cx = TW / 2;
    fillSlabSides(ctx, cx, 0, TW, TH, FACADE_H + FLOOR_THICK);
    fillPrismSides(ctx, cx, 0, TW, TH, FACADE_H, COLORS.facadeL, COLORS.facadeR);
    fillDiamond(ctx, cx, 0, TW, TH, COLORS.facadeTop);
    ditherDiamond(ctx, cx, 0, TW, TH, COLORS.facadeSpeck, (x, y) => (x * 5 + y * 11) % 17 === 0);
  });
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
  private roads: HTMLCanvasElement[][];
  private facade: HTMLCanvasElement;
  private footing: HTMLCanvasElement;
  private hole: HTMLCanvasElement;
  /** 少女：[正面, 背面][立ち, 歩き]、左右反転したものも */
  private girl: HTMLCanvasElement[][];
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
    this.roads = [0, 1, 2].map((light) => [0, 1, 2].map((z) => makeRoadSprite(z as Zone, light)));
    this.facade = makeFacadeSprite();
    this.footing = makeFootingSprite();
    this.hole = makeHoleSprite();
    this.lot = makeLotSprite();
    this.girl = makeGirlSprites();

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

  world(sim: Sim, songTime: number, tickSec: number): void {
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

    // 道（奥から手前へ）
    const light = this.lightMap(stage);
    for (let d = 0; d < stage.width + stage.height - 1; d++) {
      for (let x = 0; x <= d; x++) {
        const y = d - x;
        const cell = stage.cell(x, y);
        if (!cell) continue;
        const { sx, sy } = iso(x, y);
        if (cell.terrain === 'hole') ctx.drawImage(this.hole, sx - TW / 2, sy);
        if (cell.terrain === 'wall' && cell.obj?.type === 'prop' && cell.obj.kind === 'lot') ctx.drawImage(this.lot, sx - TW / 2, sy);
        if (cell.terrain !== 'floor') continue;
        ctx.drawImage(this.roads[light[stage.index(x, y)]][cell.zone], sx - TW / 2, sy);

        const obj = cell.obj;
        if (obj?.type === 'stop') {
          const ready = sim.x === x && sim.y === y && sim.stillTicks >= TICKS_PER_BEAT;
          fillDiamond(ctx, sx, sy + 3, TW / 2, TH / 2, ready ? COLORS.stopReady : COLORS.stop);
        } else if (obj?.type === 'oneway') {
          this.arrow(sx, sy + TH / 2, DIR_VEC[obj.dir].x, DIR_VEC[obj.dir].y);
        }
      }
    }

    // 立体物は奥行き順に描く
    const sprites: { depth: number; draw: () => void }[] = [];
    const feet = p.sy + TH / 2;

    for (let y = 0; y < stage.height; y++) {
      for (let x = 0; x < stage.width; x++) {
        const cell = stage.cell(x, y)!;
        const { sx, sy } = iso(x, y);
        // 道の外は闇で何も描かない。小物だけが闇に浮かぶ
        if (cell.terrain === 'wall' && cell.obj?.type === 'prop' && cell.obj.kind !== 'lot') {
          const kind = cell.obj.kind;
          const height = kind === 'entrance' || kind === 'door' ? FACADE_H : kind === 'lamp' ? POLE_H : 16;
          // プレイヤーより手前でプレイヤーに重なるものは透かす
          const hides =
            x + y > px + py && Math.abs(sx - p.sx) < TW && sy - height < feet && sy + TH + FLOOR_THICK > feet - PLAYER_H;
          // 扉は通れる側（見える面）に描く
          const face: 'L' | 'R' = stage.cell(x, y + 1)?.terrain === 'floor' ? 'L' : 'R';
          sprites.push({
            depth: x + y,
            draw: () => {
              ctx.globalAlpha = hides ? 0.4 : 1;
              this.wallCell(sx, sy, kind, face);
              ctx.globalAlpha = 1;
            },
          });
        } else if (cell.obj?.type === 'gate') {
          const closed = sim.isGateClosed(x, y, now);
          sprites.push({ depth: x + y + 0.2, draw: () => this.gate(sx, sy, closed) });
        } else if (cell.obj?.type === 'goal') {
          const pulse = 1 - (tickF % TICKS_PER_BEAT) / TICKS_PER_BEAT;
          sprites.push({ depth: x + y + 0.3, draw: () => this.goalDoor(sx, sy, pulse) });
        }
      }
    }

    const labels: { x: number; y: number; text: string; color: string }[] = [];

    for (const s of sim.scores) {
      if (!s.alive) continue;
      const { sx, sy } = iso(s.x, s.y);
      const bob = Math.round(Math.sin(tickF * 0.4 + s.x));
      sprites.push({ depth: s.x + s.y + 0.3, draw: () => this.gem(sx, sy + TH / 2 - 3 + bob) });
      labels.push({ x: sx, y: sy - 8, text: String(s.value), color: COLORS.gem });
    }

    for (const h of sim.hazards) {
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
        for (const c of h.cells) {
          const { sx, sy } = iso(c.x, c.y);
          sprites.push({ depth: c.x + c.y + 0.4, draw: () => this.periodic(sx, sy, active, soon && now % 2 === 0) });
        }
      }
    }

    if (!(sim.stunned && Math.floor(tickF * 2) % 2 === 0)) {
      sprites.push({
        depth: px + py + 0.5,
        draw: () => this.player(p.sx, p.sy + TH / 2, sim.facing, walk, (sim.x + sim.y) % 2 !== 0, tickF),
      });
    }

    sprites.sort((a, b) => a.depth - b.depth);
    for (const s of sprites) s.draw();

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

  /** 各マスの街灯の明るさ（街灯と玄関から 1マス以内: 2、2マス: 1） */
  private lightMap(stage: Stage): Uint8Array {
    let map = this.lightMaps.get(stage);
    if (map) return map;
    map = new Uint8Array(stage.width * stage.height);
    for (let y = 0; y < stage.height; y++) {
      for (let x = 0; x < stage.width; x++) {
        const obj = stage.cell(x, y)!.obj;
        if (obj?.type !== 'prop' || (obj.kind !== 'lamp' && obj.kind !== 'entrance')) continue;
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
    const ground = sy + TH / 2; // 台座の上面の中心
    if (kind === 'pillar' || kind === 'mailbox' || kind === 'lamp') ctx.drawImage(this.footing, sx - 6, ground - 3);
    switch (kind) {
      case 'entrance':
      case 'door':
        ctx.drawImage(this.facade, sx - TW / 2, sy - FACADE_H);
        this.slidingDoor(sx, sy, face, kind === 'entrance');
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
    ctx.globalAlpha = 0.45;
    fillEllipse(ctx, cx, ground, 4, 1, '#000');
    ctx.globalAlpha = 1;
    plotLine(ctx, pcx, pground - POLE_H, cx, ry - 1, COLORS.rustDark);
    ctx.fillStyle = COLORS.rustLight;
    ctx.fillRect(cx - 4, ry - 1, 8, 1);
    ctx.fillStyle = COLORS.rust;
    ctx.fillRect(cx - 4, ry, 1, 2);
    ctx.fillRect(cx + 3, ry, 1, 2);
    ctx.fillRect(cx - 4, ry + 2, 8, 1);
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
    const legs = [-0.7, 0.7].map((k) => iso(mid.x + perp.x * k, mid.y + perp.y * k));
    const hooks = [-0.3, 0.3].map((k) => iso(mid.x + perp.x * k, mid.y + perp.y * k));
    const seats = [-0.3, 0.3].map((k) => iso(seat.x + perp.x * k, seat.y + perp.y * k));
    const swingOut = Math.abs((seat.x - mid.x) + (seat.y - mid.y));
    const seatLift = 5 + Math.round(swingOut * 3);
    // 枠：両側の A 字の脚と梁
    for (const l of legs) {
      plotLine(ctx, l.sx - 3, l.sy + TH / 2, l.sx, l.sy + TH / 2 - FRAME_H, COLORS.rust);
      plotLine(ctx, l.sx + 3, l.sy + TH / 2, l.sx, l.sy + TH / 2 - FRAME_H, COLORS.rustDark);
    }
    plotLine(ctx, legs[0].sx, legs[0].sy + TH / 2 - FRAME_H, legs[1].sx, legs[1].sy + TH / 2 - FRAME_H, COLORS.rustLight);
    // 座席の影、吊り棒、座席
    const s = iso(seat.x, seat.y);
    ctx.globalAlpha = 0.45;
    fillEllipse(ctx, s.sx, s.sy + TH / 2, 5, 1, '#000');
    ctx.globalAlpha = 1;
    for (let k = 0; k < 2; k++) {
      plotLine(ctx, hooks[k].sx, hooks[k].sy + TH / 2 - FRAME_H, seats[k].sx, seats[k].sy + TH / 2 - seatLift - 4, COLORS.rustDark);
    }
    const top = s.sy + TH / 2 - seatLift - 4;
    ctx.fillStyle = COLORS.seatPaint;
    ctx.fillRect(s.sx - 5, top, 10, 3);
    ctx.fillStyle = COLORS.rust;
    ctx.fillRect(s.sx - 5, top + 3, 10, 1);
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
