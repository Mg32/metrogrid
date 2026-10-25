import { createHazards, type Hazard } from './hazard.ts';
import { Stage } from './stage.ts';
import { DIR_VEC, TICKS_PER_BAR, TICKS_PER_BEAT, ZONE_INTERVAL, type Dir, type Vec } from './types.ts';

export interface ScoreTile {
  x: number;
  y: number;
  value: number;
  decay: number;
  alive: boolean;
}

export type SimEvent =
  | { kind: 'pickup'; tick: number; x: number; y: number; amount: number }
  | { kind: 'miss'; tick: number; x: number; y: number; fell: boolean }
  | { kind: 'bounce'; tick: number; x: number; y: number };

export type Status = 'playing' | 'cleared' | 'timeup';

/** ミス後の停止時間（1拍） */
const STUN_TICKS = TICKS_PER_BEAT;
/** 停止マスで止まっている必要がある時間（1拍） */
const STOP_TICKS = TICKS_PER_BEAT;
const MAX_MULTIPLIER = 4;
/** ゴール時の残り1拍あたりのボーナス */
const GOAL_BONUS_PER_BEAT = 10;

export class Sim {
  readonly stage: Stage;
  readonly hazards: Hazard[];
  readonly totalTicks: number;
  readonly scores: ScoreTile[];

  /** 最後に処理した tick */
  tick = -1;
  status: Status = 'playing';

  x: number;
  y: number;
  /** 描画の補間用：直前にいたマスと、移動した tick */
  fromX: number;
  fromY: number;
  moveTick = -Infinity;
  facing: Dir = 'right';

  /** ミス時の戻り先（いまいるゾーンに入ったマス） */
  zoneEntry: Vec;
  stunUntil = -Infinity;
  /** 停止マスの上でキーを離していた tick 数 */
  stillTicks = 0;

  score = 0;
  streak = 0;
  misses = 0;
  goalBonus = 0;
  events: SimEvent[] = [];

  private gateClosedUntil = new Map<number, number>();

  constructor(stage: Stage, random: () => number = Math.random) {
    this.stage = stage;
    this.hazards = createHazards(stage.def.hazards, random);
    this.totalTicks = stage.def.bars * TICKS_PER_BAR;
    this.x = this.fromX = stage.start.x;
    this.y = this.fromY = stage.start.y;
    this.zoneEntry = { ...stage.start };
    this.scores = [];
    for (let y = 0; y < stage.height; y++) {
      for (let x = 0; x < stage.width; x++) {
        const obj = stage.cell(x, y)!.obj;
        if (obj?.type === 'score') {
          const s = stage.def.scores[obj.key];
          this.scores.push({ x, y, value: s.value, decay: s.decay, alive: true });
        }
      }
    }
  }

  get multiplier(): number {
    return Math.min(1 + this.streak, MAX_MULTIPLIER);
  }

  /** いまいるマスの1移動カウント（tick） */
  get interval(): number {
    return ZONE_INTERVAL[this.stage.cell(this.x, this.y)!.zone];
  }

  get stunned(): boolean {
    return this.tick < this.stunUntil;
  }

  isGateClosed(x: number, y: number, t = this.tick): boolean {
    return t < (this.gateClosedUntil.get(this.stage.index(x, y)) ?? 0);
  }

  /** tick t を1つ進める。held はその瞬間に押されている方向 */
  step(t: number, held: Dir | null): void {
    if (this.status !== 'playing') return;
    this.tick = t;
    if (t >= this.totalTicks) {
      this.status = 'timeup';
      return;
    }

    if (t > 0 && t % TICKS_PER_BEAT === 0) {
      for (const s of this.scores) {
        if (!s.alive) continue;
        s.value -= s.decay;
        if (s.value <= 0) s.alive = false;
      }
    }

    const prevX = this.x;
    const prevY = this.y;
    const onStop = this.stage.cell(this.x, this.y)!.obj?.type === 'stop';
    if (onStop && !held) this.stillTicks++;

    if (!this.stunned && held && t % this.interval === 0) this.tryMove(t, held);
    if (this.status === 'playing' && !this.stunned) this.checkHazards(t, prevX, prevY);
  }

  private tryMove(t: number, dir: Dir): void {
    this.facing = dir;
    const cur = this.stage.cell(this.x, this.y)!;

    if (cur.obj?.type === 'stop' && this.stillTicks < STOP_TICKS) {
      // 押しっぱなしで通り過ぎようとすると、来たマスへはじき返される
      this.events.push({ kind: 'bounce', tick: t, x: this.x, y: this.y });
      this.moveTo(t, this.fromX, this.fromY);
      return;
    }

    const nx = this.x + DIR_VEC[dir].x;
    const ny = this.y + DIR_VEC[dir].y;
    const next = this.stage.cell(nx, ny);
    if (!next || next.terrain === 'wall') return;
    if (next.obj?.type === 'gate' && this.isGateClosed(nx, ny, t)) return;
    if (next.obj?.type === 'oneway' && next.obj.dir !== dir) return;

    this.moveTo(t, nx, ny);
  }

  private moveTo(t: number, nx: number, ny: number): void {
    const prevZone = this.stage.cell(this.x, this.y)!.zone;
    this.fromX = this.x;
    this.fromY = this.y;
    this.x = nx;
    this.y = ny;
    this.moveTick = t;

    const cell = this.stage.cell(nx, ny)!;
    if (cell.terrain === 'hole') {
      this.miss(t, true);
      return;
    }
    if (cell.zone !== prevZone) this.zoneEntry = { x: nx, y: ny };

    switch (cell.obj?.type) {
      case 'stop':
        this.stillTicks = 0;
        break;
      case 'gate':
        this.gateClosedUntil.set(this.stage.index(nx, ny), (Math.floor(t / TICKS_PER_BAR) + 1) * TICKS_PER_BAR);
        break;
      case 'score': {
        const s = this.scores.find((s) => s.alive && s.x === nx && s.y === ny);
        if (s) {
          const amount = s.value * this.multiplier;
          this.score += amount;
          this.streak++;
          s.alive = false;
          this.events.push({ kind: 'pickup', tick: t, x: nx, y: ny, amount });
        }
        break;
      }
      case 'goal': {
        const remainingBeats = Math.floor((this.totalTicks - t) / TICKS_PER_BEAT);
        this.goalBonus = remainingBeats * GOAL_BONUS_PER_BEAT;
        this.score += this.goalBonus;
        this.status = 'cleared';
        break;
      }
    }
  }

  private checkHazards(t: number, prevX: number, prevY: number): void {
    const moved = prevX !== this.x || prevY !== this.y;
    for (const h of this.hazards) {
      const hit = h.cellsAt(t).some((c) => c.x === this.x && c.y === this.y);
      // すれ違い：危険物とプレイヤーが同じ tick に互いのマスへ入れ替わった
      const swapped =
        moved &&
        h.cellsAt(t).some((c) => c.x === prevX && c.y === prevY) &&
        h.cellsAt(t - 1).some((c) => c.x === this.x && c.y === this.y);
      if (hit || swapped) {
        this.miss(t, false);
        return;
      }
    }
  }

  private miss(t: number, fell: boolean): void {
    this.events.push({ kind: 'miss', tick: t, x: this.x, y: this.y, fell });
    this.misses++;
    this.streak = 0;
    this.x = this.fromX = this.zoneEntry.x;
    this.y = this.fromY = this.zoneEntry.y;
    this.moveTick = -Infinity;
    this.stunUntil = t + STUN_TICKS;
  }
}
