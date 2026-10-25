import type { HazardDef } from './stage.ts';
import { mod, type Vec } from './types.ts';

/** 危険物。位置は tick から直接計算できる（状態を持たない） */
export interface Hazard {
  readonly kind: 'patrol' | 'periodic';
  /** tick t の時点で危険なマス */
  cellsAt(t: number): Vec[];
}

export class PatrolHazard implements Hazard {
  readonly kind = 'patrol';
  readonly route: Vec[];
  readonly interval: number;
  /** 丸暗記対策の開始位置のずらし（route 上のインデックス） */
  readonly phase: number;

  constructor(def: Extract<HazardDef, { type: 'patrol' }>, phase: number) {
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
    return [this.posAt(t)];
  }
}

export class PeriodicHazard implements Hazard {
  readonly kind = 'periodic';
  readonly cells: Vec[];
  readonly period: number;
  readonly from: number;
  readonly to: number;

  constructor(def: Extract<HazardDef, { type: 'periodic' }>) {
    this.cells = def.cells.map(([x, y]) => ({ x, y }));
    this.period = def.period;
    this.from = def.from;
    this.to = def.to;
  }

  isActive(t: number): boolean {
    const p = mod(t, this.period);
    return p >= this.from && p < this.to;
  }

  cellsAt(t: number): Vec[] {
    return t >= 0 && this.isActive(t) ? this.cells : [];
  }
}

export function createHazards(defs: HazardDef[], random: () => number): Hazard[] {
  return defs.map((d) => {
    if (d.type === 'patrol') return new PatrolHazard(d, Math.floor(random() * 1000));
    return new PeriodicHazard(d);
  });
}
