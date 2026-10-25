import type { HazardDef } from './stage.ts';
import { mod, type Vec } from './types.ts';

/** 危険物。位置は tick から直接計算できる（状態を持たない） */
export interface Hazard {
  readonly kind: 'patrol' | 'periodic' | 'swing' | 'flow';
  /** tick t の時点で危険なマス */
  cellsAt(t: number): Vec[];
}

export class PatrolHazard implements Hazard {
  readonly kind = 'patrol';
  readonly route: Vec[];
  readonly interval: number;
  /** 丸暗記対策の開始位置のずらし（route 上のインデックス） */
  readonly phase: number;
  readonly look: 'kaisento' | 'tram' | 'koinobori' | null;
  readonly pivot: Vec | null;
  /** 車両の長さ（マス） */
  readonly length: number;

  constructor(def: Extract<HazardDef, { type: 'patrol' }>, phase: number) {
    this.look = def.look ?? null;
    this.length = def.length ?? 1;
    this.pivot = def.pivot ? { x: def.pivot[0], y: def.pivot[1] } : null;
    const path: Vec[] = [];
    const pts = def.waypoints.map(([x, y]) => ({ x, y }));
    if (def.loop) pts.push(pts[0]);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a.x !== b.x && a.y !== b.y) throw new Error(`巡回経路は縦横の直線のみ: (${a.x},${a.y})→(${b.x},${b.y})`);
      const dx = Math.sign(b.x - a.x);
      const dy = Math.sign(b.y - a.y);
      for (let p = { ...a }; p.x !== b.x || p.y !== b.y; p = { x: p.x + dx, y: p.y + dy }) path.push(p);
    }
    if (def.loop) {
      this.route = path;
    } else {
      path.push(pts[pts.length - 1]);
      // 往復：A B C D → A B C D C B
      this.route = path.concat(path.slice(1, -1).reverse());
    }
    this.interval = def.interval;
    this.phase = mod(phase, this.route.length);
  }

  /** 移動ステップ番号（描画の補間用） */
  stepAt(t: number): number {
    return Math.floor(Math.max(0, t) / this.interval);
  }

  posAtStep(step: number): Vec {
    return this.route[mod(step + this.phase, this.route.length)];
  }

  posAt(t: number): Vec {
    return this.posAtStep(this.stepAt(t));
  }

  cellsAt(t: number): Vec[] {
    const step = this.stepAt(t);
    const cells = [this.posAtStep(step)];
    // 車両の後ろの部分は、先頭が通ってきたマス（往復の折り返しでは重なる）
    for (let k = 1; k < this.length; k++) {
      const c = this.posAtStep(step - k);
      if (!cells.some((p) => p.x === c.x && p.y === c.y)) cells.push(c);
    }
    return cells;
  }
}

export class PeriodicHazard implements Hazard {
  readonly kind = 'periodic';
  readonly cells: Vec[];
  readonly period: number;
  readonly from: number;
  readonly to: number;
  readonly look: 'shishiodoshi' | 'snow' | null;
  readonly pivot: Vec | null;

  constructor(def: Extract<HazardDef, { type: 'periodic' }>) {
    this.cells = def.cells.map(([x, y]) => ({ x, y }));
    this.period = def.period;
    this.from = def.from;
    this.to = def.to;
    this.look = def.look ?? null;
    this.pivot = def.pivot ? { x: def.pivot[0], y: def.pivot[1] } : null;
  }

  isActive(t: number): boolean {
    const p = mod(t, this.period);
    return p >= this.from && p < this.to;
  }

  cellsAt(t: number): Vec[] {
    return t >= 0 && this.isActive(t) ? this.cells : [];
  }
}

/**
 * 箱ブランコ。座席の位置 u = reach × sin(2π(t + phase) / period)（マス単位、cells の中央が 0）。
 * 座席の真下のマスだけが危険。振り切って cells の外（壁の上）にあるときは、どのマスも危険でない。
 */
export class SwingHazard implements Hazard {
  readonly kind = 'swing';
  readonly cells: Vec[];
  readonly axis: 'x' | 'y';
  readonly period: number;
  readonly reach: number;
  readonly phase: number;
  readonly look: 'pendulum' | 'fan' | null;
  readonly pivot: Vec | null;

  constructor(def: Extract<HazardDef, { type: 'swing' }>, phase: number) {
    this.look = def.look ?? null;
    this.pivot = def.pivot ? { x: def.pivot[0], y: def.pivot[1] } : null;
    this.cells = def.cells.map(([x, y]) => ({ x, y }));
    this.axis = def.axis;
    for (let i = 1; i < this.cells.length; i++) {
      const a = this.cells[i - 1];
      const b = this.cells[i];
      const ok = def.axis === 'x' ? b.x === a.x + 1 && b.y === a.y : b.y === a.y + 1 && b.x === a.x;
      if (!ok) throw new Error(`箱ブランコの cells は ${def.axis} 方向に連続して並べる`);
    }
    this.period = def.period;
    this.reach = def.reach ?? (this.cells.length - 1) / 2 + 1.25;
    this.phase = mod(phase, def.period);
  }

  /** 座席の位置（マス単位、cells の中央が 0）。t は小数でもよい（描画用） */
  seatAt(t: number): number {
    return this.reach * Math.sin((2 * Math.PI * (Math.max(0, t) + this.phase)) / this.period);
  }

  cellsAt(t: number): Vec[] {
    if (t < 0) return [];
    const i = Math.round(this.seatAt(t) + (this.cells.length - 1) / 2);
    return i >= 0 && i < this.cells.length ? [this.cells[i]] : [];
  }
}

/**
 * 流されていく物（巡回型）。cells（上流 → 下流）を、every tick ごとに1つずつ物が流れてくる。
 * 物は interval tick ごとに1マス下流へ進み、最後のマスの先で（橋の下や闇へ）見えなくなる。
 * 物 n が cells[0] に入る tick は n × every − phase。
 */
export class FlowHazard implements Hazard {
  readonly kind = 'flow';
  readonly cells: Vec[];
  readonly interval: number;
  readonly every: number;
  readonly phase: number;

  constructor(def: Extract<HazardDef, { type: 'flow' }>, phase: number) {
    this.cells = def.cells.map(([x, y]) => ({ x, y }));
    this.interval = def.interval;
    this.every = def.every;
    this.phase = mod(phase, def.every);
  }

  /** tick t（小数でもよい）に流れている物。pos は cells 上の位置（小数。描画用） */
  itemsAt(t: number): { n: number; pos: number }[] {
    if (t < 0) return [];
    const span = this.cells.length * this.interval;
    const items: { n: number; pos: number }[] = [];
    const last = Math.floor((t + this.phase) / this.every);
    for (let n = last; n * this.every - this.phase > t - span; n--) {
      items.push({ n, pos: (t - (n * this.every - this.phase)) / this.interval });
    }
    return items;
  }

  cellsAt(t: number): Vec[] {
    return this.itemsAt(t).map((it) => this.cells[Math.floor(it.pos)]);
  }
}

export function createHazards(defs: HazardDef[], random: () => number): Hazard[] {
  return defs.map((d) => {
    if (d.type === 'patrol') return new PatrolHazard(d, Math.floor(random() * 1000));
    if (d.type === 'swing') return new SwingHazard(d, Math.floor(random() * 1000));
    if (d.type === 'flow') return new FlowHazard(d, Math.floor(random() * 1000));
    return new PeriodicHazard(d);
  });
}
