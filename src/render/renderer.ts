import { PatrolHazard, PeriodicHazard } from '../game/hazard.ts';
import type { Sim } from '../game/sim.ts';
import { DIR_VEC, TICKS_PER_BEAT, ZONE_INTERVAL, type Zone } from '../game/types.ts';

/** 低解像度で世界を描き、整数倍に拡大して表示する */
const LW = 480;
const LH = 270;
/** 斜め見下ろしのタイル（上面の菱形）の幅と高さ */
const TW = 32;
const TH = 16;
const FLOOR_THICK = 4;
const WALL_H = 14;

const COLORS = {
  bg: '#07060b',
  floorTop: '#9a8d7c',
  floorSide: '#4f463d',
  floorLine: '#867a6a',
  wallTop: '#4d4757',
  wallLeft: '#2c2833',
  wallRight: '#3a3543',
  hazard: '#a54a3e',
  hazardDark: '#6e2c25',
  gem: '#e3c56e',
  gemDark: '#9c7f35',
  goal: '#cfe3f0',
  stop: '#6d625a',
  stopReady: '#b8ad9c',
  arrow: '#3b342e',
  text: '#e8e1d6',
  textDim: '#8d857a',
  accent: '#7fa3c4',
  warn: '#d0675a',
};

/** 危険ゾーンほど景色が薄い */
const ZONE_ALPHA: Record<Zone, number> = { 0: 1, 1: 0.62, 2: 0.32 };
const ZONE_LABEL: Record<Zone, string> = { 0: '安全 ♩', 1: '危険 ♪', 2: '高危険 ♬' };

interface Label {
  lx: number;
  ly: number;
  text: string;
  color: string;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

/** グリッド座標 → 菱形の上の頂点（ワールドのピクセル座標） */
function iso(x: number, y: number): { sx: number; sy: number } {
  return { sx: ((x - y) * TW) / 2, sy: ((x + y) * TH) / 2 };
}

export class Renderer {
  private main: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private low: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private camX = 0;
  private camY = 0;
  private camSim: Sim | null = null;
  private labels: Label[] = [];

  constructor(main: HTMLCanvasElement) {
    this.main = main;
    this.mctx = main.getContext('2d')!;
    this.low = document.createElement('canvas');
    this.low.width = LW;
    this.low.height = LH;
    this.lctx = this.low.getContext('2d')!;
  }

  begin(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    if (this.main.width !== w || this.main.height !== h) {
      this.main.width = w;
      this.main.height = h;
    }
    this.scale = Math.max(1, Math.floor(Math.min(w / LW, h / LH)));
    this.ox = Math.floor((w - LW * this.scale) / 2);
    this.oy = Math.floor((h - LH * this.scale) / 2);
    this.labels = [];

    this.mctx.fillStyle = '#000';
    this.mctx.fillRect(0, 0, w, h);
    this.lctx.fillStyle = COLORS.bg;
    this.lctx.fillRect(0, 0, LW, LH);
  }

  present(): void {
    this.mctx.imageSmoothingEnabled = false;
    this.mctx.drawImage(this.low, this.ox, this.oy, LW * this.scale, LH * this.scale);
    this.mctx.save();
    this.mctx.beginPath();
    this.mctx.rect(this.ox, this.oy, LW * this.scale, LH * this.scale);
    this.mctx.clip();
    for (const l of this.labels) this.text(l.text, l.lx, l.ly, 7, l.color, 'center');
    this.mctx.restore();
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
    const offY = Math.round(LH / 2 - this.camY - 10);
    ctx.save();
    ctx.translate(offX, offY);

    // 床（奥から手前へ）
    for (let d = 0; d < stage.width + stage.height - 1; d++) {
      for (let x = 0; x <= d; x++) {
        const y = d - x;
        const cell = stage.cell(x, y);
        if (!cell || cell.terrain !== 'floor') continue;
        const { sx, sy } = iso(x, y);
        this.floorTile(sx, sy, cell.zone);

        const obj = cell.obj;
        if (obj?.type === 'stop') {
          const ready = sim.x === x && sim.y === y && sim.stillTicks >= TICKS_PER_BEAT;
          this.diamond(sx, sy + 3, TW - 12, TH - 6, ready ? COLORS.stopReady : COLORS.stop);
        } else if (obj?.type === 'oneway') {
          this.arrow(sx, sy + TH / 2, DIR_VEC[obj.dir].x, DIR_VEC[obj.dir].y);
        } else if (obj?.type === 'goal') {
          this.diamond(sx, sy + 2, TW - 8, TH - 4, COLORS.goal);
        }
      }
    }

    // 立体物は奥行き順に描く
    const sprites: { depth: number; draw: () => void }[] = [];

    for (let y = 0; y < stage.height; y++) {
      for (let x = 0; x < stage.width; x++) {
        const cell = stage.cell(x, y)!;
        const { sx, sy } = iso(x, y);
        if (cell.terrain === 'wall') {
          // プレイヤーより手前でプレイヤーに重なる壁は透かす
          const hides = x + y > px + py && Math.abs(sx - p.sx) < TW && sy - WALL_H < p.sy + TH / 2 && sy + TH > p.sy - 12;
          sprites.push({ depth: x + y, draw: () => this.wall(sx, sy, hides ? 0.3 : 1) });
        } else if (cell.obj?.type === 'gate') {
          const closed = sim.isGateClosed(x, y, now);
          sprites.push({ depth: x + y + 0.2, draw: () => this.gate(sx, sy, closed) });
        } else if (cell.obj?.type === 'goal') {
          const pulse = 1 - (tickF % TICKS_PER_BEAT) / TICKS_PER_BEAT;
          sprites.push({ depth: x + y + 0.3, draw: () => this.goalLight(sx, sy, pulse) });
        }
      }
    }

    for (const s of sim.scores) {
      if (!s.alive) continue;
      const { sx, sy } = iso(s.x, s.y);
      const bob = Math.sin(tickF * 0.4 + s.x) * 1.5;
      sprites.push({ depth: s.x + s.y + 0.3, draw: () => this.gem(sx, sy + TH / 2 - 7 + bob) });
      this.label(offX + sx, offY + sy - 6, String(s.value), COLORS.gem);
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
      const { sx, sy } = iso(px, py);
      sprites.push({ depth: px + py + 0.5, draw: () => this.player(sx, sy + TH / 2) });
    }

    sprites.sort((a, b) => a.depth - b.depth);
    for (const s of sprites) s.draw();

    // 演出：ミスの輪、得点の表示
    for (const ev of sim.events) {
      const age = (tickF - ev.tick) * tickSec;
      if (age < 0 || age > 0.8) continue;
      const { sx, sy } = iso(ev.x, ev.y);
      if (ev.kind === 'miss' && age < 0.5) {
        ctx.strokeStyle = COLORS.warn;
        ctx.globalAlpha = 1 - age / 0.5;
        ctx.beginPath();
        ctx.ellipse(sx, sy + TH / 2, 6 + age * 40, 3 + age * 20, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (ev.kind === 'pickup') {
        this.label(offX + sx, offY + sy - 12 - age * 20, `+${ev.amount}`, COLORS.text);
      } else if (ev.kind === 'bounce' && age < 0.3) {
        this.label(offX + sx, offY + sy - 16, '止まって', COLORS.warn);
      }
    }

    ctx.restore();
  }

  private label(lx: number, ly: number, text: string, color: string): void {
    this.labels.push({ lx, ly, text, color });
  }

  private diamond(sx: number, sy: number, w: number, h: number, color: string): void {
    const ctx = this.lctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + w / 2, sy + h / 2);
    ctx.lineTo(sx, sy + h);
    ctx.lineTo(sx - w / 2, sy + h / 2);
    ctx.closePath();
    ctx.fill();
  }

  private floorTile(sx: number, sy: number, zone: Zone): void {
    const ctx = this.lctx;
    ctx.globalAlpha = ZONE_ALPHA[zone];
    ctx.fillStyle = COLORS.floorSide;
    ctx.beginPath();
    ctx.moveTo(sx - TW / 2, sy + TH / 2);
    ctx.lineTo(sx, sy + TH);
    ctx.lineTo(sx + TW / 2, sy + TH / 2);
    ctx.lineTo(sx + TW / 2, sy + TH / 2 + FLOOR_THICK);
    ctx.lineTo(sx, sy + TH + FLOOR_THICK);
    ctx.lineTo(sx - TW / 2, sy + TH / 2 + FLOOR_THICK);
    ctx.closePath();
    ctx.fill();
    this.diamond(sx, sy, TW, TH, COLORS.floorTop);
    this.diamond(sx, sy + 1, TW - 4, TH - 2, COLORS.floorLine);
    this.diamond(sx, sy + 2, TW - 8, TH - 4, COLORS.floorTop);
    if (zone === 2) {
      // 透けて闇が見える
      ctx.fillStyle = COLORS.bg;
      for (const [dx, dy] of [[-8, 6], [4, 4], [-2, 10], [8, 9], [0, 7]]) ctx.fillRect(sx + dx, sy + dy, 2, 1);
    }
    ctx.globalAlpha = 1;
  }

  private wall(sx: number, sy: number, alpha: number): void {
    const ctx = this.lctx;
    const top = sy - WALL_H;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = COLORS.wallLeft;
    ctx.beginPath();
    ctx.moveTo(sx - TW / 2, top + TH / 2);
    ctx.lineTo(sx, top + TH);
    ctx.lineTo(sx, sy + TH + FLOOR_THICK);
    ctx.lineTo(sx - TW / 2, sy + TH / 2 + FLOOR_THICK);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COLORS.wallRight;
    ctx.beginPath();
    ctx.moveTo(sx + TW / 2, top + TH / 2);
    ctx.lineTo(sx, top + TH);
    ctx.lineTo(sx, sy + TH + FLOOR_THICK);
    ctx.lineTo(sx + TW / 2, sy + TH / 2 + FLOOR_THICK);
    ctx.closePath();
    ctx.fill();
    this.diamond(sx, top, TW, TH, COLORS.wallTop);
    ctx.globalAlpha = 1;
  }

  private arrow(cx: number, cy: number, dx: number, dy: number): void {
    // グリッドの向き → 画面上の向き
    const vx = ((dx - dy) * TW) / 2;
    const vy = ((dx + dy) * TH) / 2;
    const len = Math.hypot(vx, vy);
    const ux = vx / len;
    const uy = vy / len;
    const ctx = this.lctx;
    ctx.fillStyle = COLORS.arrow;
    ctx.beginPath();
    ctx.moveTo(cx + ux * 7, cy + uy * 7);
    ctx.lineTo(cx - ux * 4 - uy * 6, cy - uy * 4 + ux * 6);
    ctx.lineTo(cx - ux * 4 + uy * 6, cy - uy * 4 - ux * 6);
    ctx.closePath();
    ctx.fill();
  }

  private gate(sx: number, sy: number, closed: boolean): void {
    // 踏切の遮断機。閉じているあいだは赤白の棒が下りている
    const ctx = this.lctx;
    const lx = sx - TW / 2 + 3;
    const ly = sy + TH / 2;
    ctx.fillStyle = '#d8d0c4';
    ctx.fillRect(lx - 1, ly - 14, 2, 14);
    if (closed) {
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#c9473b' : '#e8e1d6';
        const t0 = i / 6;
        ctx.fillRect(lerp(lx, sx + TW / 2 - 3, t0), lerp(ly - 10, ly - 2, t0), 5, 2);
      }
    } else {
      ctx.fillStyle = '#c9473b';
      ctx.fillRect(lx - 1, ly - 26, 2, 12);
    }
  }

  private goalLight(sx: number, sy: number, pulse: number): void {
    const ctx = this.lctx;
    const g = ctx.createLinearGradient(0, sy - 34, 0, sy + TH / 2);
    g.addColorStop(0, 'rgba(207,227,240,0)');
    g.addColorStop(1, `rgba(207,227,240,${0.35 + pulse * 0.35})`);
    ctx.fillStyle = g;
    ctx.fillRect(sx - 6, sy - 34, 12, 34 + TH / 2);
  }

  private gem(sx: number, sy: number): void {
    this.diamond(sx, sy - 4, 8, 10, COLORS.gem);
    this.diamond(sx + 1, sy - 1, 5, 6, COLORS.gemDark);
  }

  private patrol(cx: number, cy: number, tickF: number): void {
    const ctx = this.lctx;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    const top = cy - 16 + Math.sin(tickF * 0.8) * 1;
    ctx.fillStyle = COLORS.hazardDark;
    ctx.fillRect(cx - 6, top + 4, 12, 9);
    this.diamond(cx, top, 12, 8, COLORS.hazard);
  }

  private periodic(sx: number, sy: number, active: boolean, blink: boolean): void {
    const ctx = this.lctx;
    if (active) {
      ctx.fillStyle = COLORS.hazardDark;
      ctx.fillRect(sx - 3, sy - 14, 6, 14 + TH / 2);
      ctx.fillStyle = COLORS.hazard;
      ctx.fillRect(sx - 3, sy - 16, 6, 3);
    } else {
      ctx.strokeStyle = blink ? COLORS.warn : COLORS.hazardDark;
      ctx.beginPath();
      ctx.moveTo(sx, sy + 3);
      ctx.lineTo(sx + 10, sy + TH / 2);
      ctx.lineTo(sx, sy + TH - 3);
      ctx.lineTo(sx - 10, sy + TH / 2);
      ctx.closePath();
      ctx.stroke();
    }
  }

  private player(cx: number, cy: number): void {
    const ctx = this.lctx;
    cx = Math.round(cx);
    cy = Math.round(cy);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // 脚
    ctx.fillStyle = '#26232b';
    ctx.fillRect(cx - 2, cy - 4, 1, 4);
    ctx.fillRect(cx + 1, cy - 4, 1, 4);
    // 服
    ctx.fillStyle = '#6e5562';
    ctx.fillRect(cx - 3, cy - 11, 6, 7);
    ctx.fillRect(cx - 4, cy - 6, 8, 2);
    // 顔と髪
    ctx.fillStyle = '#e6dac8';
    ctx.fillRect(cx - 3, cy - 17, 6, 6);
    ctx.fillStyle = '#1b1820';
    ctx.fillRect(cx - 3, cy - 18, 6, 3);
    ctx.fillRect(cx - 4, cy - 17, 1, 7);
    ctx.fillRect(cx + 3, cy - 17, 1, 7);
    // ヘッドホン
    ctx.fillStyle = COLORS.accent;
    ctx.fillRect(cx - 4, cy - 19, 8, 1);
    ctx.fillRect(cx - 5, cy - 16, 2, 3);
    ctx.fillRect(cx + 3, cy - 16, 2, 3);
  }

  // ---- HUD（高解像度で描く） ----

  /** lx, ly は低解像度画面上の座標、size も低解像度のピクセル単位 */
  text(text: string, lx: number, ly: number, size: number, color: string, align: CanvasTextAlign = 'left'): void {
    const ctx = this.mctx;
    ctx.font = `bold ${size * this.scale}px "BIZ UDGothic", "Yu Gothic", "Hiragino Sans", monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(text, this.ox + lx * this.scale + this.scale * 0.6, this.oy + ly * this.scale + this.scale * 0.6);
    ctx.fillStyle = color;
    ctx.fillText(text, this.ox + lx * this.scale, this.oy + ly * this.scale);
  }

  hud(sim: Sim, songTime: number, tickSec: number): void {
    const beatSec = tickSec * TICKS_PER_BEAT;
    const ctx = this.mctx;

    this.text(`SCORE ${String(sim.score).padStart(6, '0')}`, 10, 12, 9, COLORS.text);
    this.text(`×${sim.multiplier}`, 10, 24, 8, sim.multiplier > 1 ? COLORS.gem : COLORS.textDim);
    if (sim.misses > 0) this.text(`MISS ${sim.misses}`, 10, 35, 7, COLORS.textDim);

    const remain = Math.max(0, sim.totalTicks * tickSec - Math.max(0, songTime));
    const mm = Math.floor(remain / 60);
    const ss = Math.floor(remain % 60);
    this.text(`${mm}:${String(ss).padStart(2, '0')}`, LW - 10, 12, 9, remain < 10 ? COLORS.warn : COLORS.text, 'right');
    const bar = Math.min(sim.stage.def.bars, Math.max(0, Math.floor(songTime / (beatSec * 4))) + 1);
    this.text(`BAR ${bar}/${sim.stage.def.bars}`, LW - 10, 24, 7, COLORS.textDim, 'right');

    // 拍の表示：4つの点のうち今の拍が光る
    const tickNow = Math.floor(songTime / tickSec);
    const beatInBar = (((Math.floor(tickNow / TICKS_PER_BEAT)) % 4) + 4) % 4;
    const beatFrac = (songTime / beatSec) % 1;
    for (let i = 0; i < 4; i++) {
      const lx = LW / 2 - 18 + i * 12;
      const on = i === beatInBar;
      const r = (on ? 3 + (1 - Math.max(0, beatFrac)) * 1.5 : 2) * this.scale;
      ctx.fillStyle = on ? (i === 0 ? COLORS.gem : COLORS.text) : '#3a3640';
      ctx.beginPath();
      ctx.arc(this.ox + lx * this.scale, this.oy + 12 * this.scale, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const zone = sim.stage.cell(sim.x, sim.y)!.zone;
    this.text(ZONE_LABEL[zone], LW / 2, 24, 7, zone === 0 ? COLORS.textDim : COLORS.warn, 'center');

    if (songTime < 0) {
      const n = Math.ceil(-songTime / beatSec);
      this.text(String(n), LW / 2, LH / 2 - 40, 24, COLORS.text, 'center');
    }
  }

  overlay(lines: { text: string; size?: number; color?: string }[]): void {
    const ctx = this.mctx;
    ctx.fillStyle = 'rgba(7,6,11,0.72)';
    ctx.fillRect(this.ox, this.oy, LW * this.scale, LH * this.scale);
    const lineH = (l: { size?: number }) => (l.size ?? 8) + 6;
    const total = lines.reduce((s, l) => s + lineH(l), 0);
    let y = LH / 2 - total / 2;
    for (const l of lines) {
      y += lineH(l) / 2;
      if (l.text) this.text(l.text, LW / 2, y, l.size ?? 8, l.color ?? COLORS.text, 'center');
      y += lineH(l) / 2;
    }
  }
}
