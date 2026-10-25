import { PatrolHazard, PeriodicHazard } from '../game/hazard.ts';
import type { Sim } from '../game/sim.ts';
import { DIR_VEC, TICKS_PER_BEAT, ZONE_INTERVAL, type Zone } from '../game/types.ts';
import { drawText, GLYPH_H, textWidth } from './font.ts';

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
const FLOOR_THICK = 3;
/** 道と道の間の区画（塀や植え込み）の高さ */
const BLOCK_H = 6;
const PLAYER_H = 16;

const COLORS = {
  bg: '#07060b',
  roadEdge: '#3a3741',
  road: [ '#56525e', '#46434e', '#36343d' ] as const,
  roadSpeck: '#625e6a',
  roadSideL: '#24222a',
  roadSideR: '#2c2933',
  blockTop: '#1d1b23',
  blockSpeck: '#27242e',
  blockL: '#121016',
  blockR: '#17151c',
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
function makeRoadSprite(zone: Zone): HTMLCanvasElement {
  return makeSprite(TW, TH + FLOOR_THICK + 1, (ctx) => {
    const cx = TW / 2;
    fillPrismSides(ctx, cx, 0, TW, TH, FLOOR_THICK, COLORS.roadSideL, COLORS.roadSideR);
    fillDiamond(ctx, cx, 0, TW, TH, COLORS.roadEdge);
    fillDiamond(ctx, cx, 1, TW - 4, TH - 2, COLORS.road[zone]);
    if (zone === 0) {
      ditherDiamond(ctx, cx, 1, TW - 4, TH - 2, COLORS.roadSpeck, (x, y) => (x * 7 + y * 13) % 23 === 0);
    } else {
      const period = zone === 1 ? 8 : 4;
      ditherDiamond(ctx, cx, 0, TW, TH, COLORS.bg, (x, y) => (x + 2 * y) % period === 0);
    }
  });
}

function makeBlockSprite(): HTMLCanvasElement {
  return makeSprite(TW, BLOCK_H + TH + FLOOR_THICK + 1, (ctx) => {
    const cx = TW / 2;
    fillPrismSides(ctx, cx, 0, TW, TH, BLOCK_H + FLOOR_THICK, COLORS.blockL, COLORS.blockR);
    fillDiamond(ctx, cx, 0, TW, TH, COLORS.blockTop);
    ditherDiamond(ctx, cx, 0, TW, TH, COLORS.blockSpeck, (x, y) => (x * 5 + y * 11) % 17 === 0);
  });
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
  private roads: HTMLCanvasElement[];
  private block: HTMLCanvasElement;

  constructor(main: HTMLCanvasElement) {
    this.main = main;
    this.mctx = main.getContext('2d')!;
    this.low = document.createElement('canvas');
    this.low.width = LW;
    this.low.height = LH;
    this.lctx = this.low.getContext('2d')!;
    this.roads = [0, 1, 2].map((z) => makeRoadSprite(z as Zone));
    this.block = makeBlockSprite();

    // キャンバスの実画素サイズを正確に取る（CSSピクセル × dpr の丸め誤差でぼやけないように）
    const ro = new ResizeObserver(([entry]) => {
      const box = entry.devicePixelContentBoxSize?.[0];
      this.devW = box ? box.inlineSize : Math.round(entry.contentRect.width * devicePixelRatio);
      this.devH = box ? box.blockSize : Math.round(entry.contentRect.height * devicePixelRatio);
    });
    try {
      ro.observe(main, { box: 'device-pixel-content-box' });
    } catch {
      ro.observe(main);
    }
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
    for (let d = 0; d < stage.width + stage.height - 1; d++) {
      for (let x = 0; x <= d; x++) {
        const y = d - x;
        const cell = stage.cell(x, y);
        if (!cell || cell.terrain !== 'floor') continue;
        const { sx, sy } = iso(x, y);
        ctx.drawImage(this.roads[cell.zone], sx - TW / 2, sy);

        const obj = cell.obj;
        if (obj?.type === 'stop') {
          const ready = sim.x === x && sim.y === y && sim.stillTicks >= TICKS_PER_BEAT;
          fillDiamond(ctx, sx, sy + 3, TW / 2, TH / 2, ready ? COLORS.stopReady : COLORS.stop);
        } else if (obj?.type === 'oneway') {
          this.arrow(sx, sy + TH / 2, DIR_VEC[obj.dir].x, DIR_VEC[obj.dir].y);
        } else if (obj?.type === 'goal') {
          fillDiamond(ctx, sx, sy + 2, TW - 8, TH - 4, COLORS.goal);
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
        if (cell.terrain === 'wall') {
          // プレイヤーより手前でプレイヤーに重なる区画は透かす
          const hides =
            x + y > px + py && Math.abs(sx - p.sx) < TW && sy - BLOCK_H < feet && sy + TH + FLOOR_THICK > feet - PLAYER_H;
          sprites.push({
            depth: x + y,
            draw: () => {
              ctx.globalAlpha = hides ? 0.4 : 1;
              ctx.drawImage(this.block, sx - TW / 2, sy - BLOCK_H);
              ctx.globalAlpha = 1;
            },
          });
        } else if (cell.obj?.type === 'gate') {
          const closed = sim.isGateClosed(x, y, now);
          sprites.push({ depth: x + y + 0.2, draw: () => this.gate(sx, sy, closed) });
        } else if (cell.obj?.type === 'goal') {
          const pulse = 1 - (tickF % TICKS_PER_BEAT) / TICKS_PER_BEAT;
          sprites.push({ depth: x + y + 0.3, draw: () => this.goalLight(sx, sy, pulse) });
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
        sprites.push({ depth: hx + hy + 0.5, draw: () => this.patrol(sx, sy + TH / 2, tickF) });
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
      sprites.push({ depth: px + py + 0.5, draw: () => this.player(p.sx, p.sy + TH / 2) });
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

  private goalLight(sx: number, sy: number, pulse: number): void {
    const ctx = this.lctx;
    const height = 26;
    for (let i = 0; i < height; i += 2) {
      ctx.globalAlpha = (1 - i / height) * (0.35 + pulse * 0.35);
      ctx.fillStyle = COLORS.goal;
      ctx.fillRect(sx - 3, sy + TH / 2 - i - 2, 6, 2);
    }
    ctx.globalAlpha = 1;
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

  private player(cx: number, cy: number): void {
    const ctx = this.lctx;
    ctx.globalAlpha = 0.45;
    fillEllipse(ctx, cx, cy, 4, 1, '#000');
    ctx.globalAlpha = 1;
    // 脚
    ctx.fillStyle = '#26232b';
    ctx.fillRect(cx - 2, cy - 3, 1, 3);
    ctx.fillRect(cx + 1, cy - 3, 1, 3);
    // 服
    ctx.fillStyle = '#6e5562';
    ctx.fillRect(cx - 2, cy - 8, 4, 5);
    ctx.fillRect(cx - 3, cy - 5, 6, 2);
    // 顔と髪
    ctx.fillStyle = '#e6dac8';
    ctx.fillRect(cx - 2, cy - 13, 4, 5);
    ctx.fillStyle = '#1b1820';
    ctx.fillRect(cx - 2, cy - 14, 4, 2);
    ctx.fillRect(cx - 3, cy - 13, 1, 5);
    ctx.fillRect(cx + 2, cy - 13, 1, 5);
    // ヘッドホン
    ctx.fillStyle = COLORS.accent;
    ctx.fillRect(cx - 3, cy - PLAYER_H + 1, 6, 1);
    ctx.fillRect(cx - 4, cy - 12, 2, 3);
    ctx.fillRect(cx + 2, cy - 12, 2, 3);
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
