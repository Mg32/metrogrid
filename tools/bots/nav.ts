import type { Sim } from '../../src/game/sim.ts';
import type { Stage } from '../../src/game/stage.ts';
import { DIR_VEC, TICKS_PER_BEAT, ZONE_INTERVAL, type Dir } from '../../src/game/types.ts';

export const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

/**
 * 各マスからゴールまでの最短時間（tick）。危険物は考えない。到達できないマスは Infinity。
 * マスから出るのにそのマスのゾーンの1カウント、停止マスはさらに1拍かかるとする。
 */
export function distanceField(stage: Stage, opts: { safeOnly?: boolean } = {}): Float64Array {
  const n = stage.width * stage.height;
  const dist = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  dist[stage.index(stage.goal.x, stage.goal.y)] = 0;

  for (;;) {
    let cur = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (cur < 0 || dist[i] < dist[cur])) cur = i;
    if (cur < 0) break;
    done[cur] = 1;
    const cx = cur % stage.width;
    const cy = Math.floor(cur / stage.width);
    const target = stage.cell(cx, cy)!;
    for (const d of DIRS) {
      // p から d の向きに動くと cur に入る
      const px = cx - DIR_VEC[d].x;
      const py = cy - DIR_VEC[d].y;
      const p = stage.cell(px, py);
      if (!p || p.terrain !== 'floor') continue;
      if (opts.safeOnly && p.zone !== 0) continue;
      if (target.obj?.type === 'oneway' && target.obj.dir !== d) continue;
      const cost = ZONE_INTERVAL[p.zone] + (p.obj?.type === 'stop' ? TICKS_PER_BEAT : 0);
      const pi = stage.index(px, py);
      if (dist[cur] + cost < dist[pi]) dist[pi] = dist[cur] + cost;
    }
  }
  return dist;
}

export function hazardAt(sim: Sim, x: number, y: number, t: number): boolean {
  return sim.hazards.some((h) => h.cellsAt(t).some((c) => c.x === x && c.y === y));
}

/** その向きに入れるか（壁・閉じたゲート・一方通行。欠けた場所は入れるが落ちる） */
export function canEnter(sim: Sim, dir: Dir, t: number): boolean {
  const nx = sim.x + DIR_VEC[dir].x;
  const ny = sim.y + DIR_VEC[dir].y;
  const cell = sim.stage.cell(nx, ny);
  if (!cell || cell.terrain === 'wall') return false;
  if (cell.obj?.type === 'gate' && sim.isGateClosed(nx, ny, t)) return false;
  if (cell.obj?.type === 'oneway' && cell.obj.dir !== dir) return false;
  return true;
}

/** tick t から次に動けるまで、その場で待っていて危険物に当たらないか */
export function safeToWait(sim: Sim, t: number): boolean {
  const stay = ZONE_INTERVAL[sim.stage.cell(sim.x, sim.y)!.zone];
  for (let k = 0; k <= stay; k++) if (hazardAt(sim, sim.x, sim.y, t + k)) return false;
  return true;
}

/** tick t にその向きへ動いて、次に動けるまで危険物に当たらないか */
export function safeToMove(sim: Sim, dir: Dir, t: number): boolean {
  const nx = sim.x + DIR_VEC[dir].x;
  const ny = sim.y + DIR_VEC[dir].y;
  const cell = sim.stage.cell(nx, ny);
  if (!cell || cell.terrain !== 'floor') return false;
  const stay = ZONE_INTERVAL[cell.zone];
  for (let k = 0; k < stay; k++) if (hazardAt(sim, nx, ny, t + k)) return false;
  // すれ違い
  if (hazardAt(sim, sim.x, sim.y, t) && hazardAt(sim, nx, ny, t - 1)) return false;
  return true;
}
