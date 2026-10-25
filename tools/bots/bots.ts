import type { Sim } from '../../src/game/sim.ts';
import type { Dir } from '../../src/game/types.ts';
import { DIR_VEC, TICKS_PER_BEAT } from '../../src/game/types.ts';
import { planBeam } from './beam.ts';
import { canEnter, DIRS, distanceField } from './nav.ts';

/** tick t の直前に呼ばれ、その tick に押している方向を返す */
export type Policy = (t: number) => Dir | null;

export interface BotDef {
  name: string;
  /** 何を確かめるためのボットか */
  purpose: string;
  /** 計算が重いボットは少ないシードで回す */
  heavy?: boolean;
  create: (sim: Sim, seed: number, rand: () => number) => Policy;
}

/** 距離マップに沿ってゴールへ向かう。危険物は気にしない。停止マスでは1拍キーを離す */
function followField(sim: Sim, field: Float64Array): Policy {
  return (t) => {
    if (t < sim.stunUntil) return null;
    const here = sim.stage.cell(sim.x, sim.y)!;
    if (here.obj?.type === 'stop' && sim.stillTicks < TICKS_PER_BEAT) return null;
    let best: Dir | null = null;
    let bestD = field[sim.stage.index(sim.x, sim.y)];
    for (const dir of DIRS) {
      const nx = sim.x + DIR_VEC[dir].x;
      const ny = sim.y + DIR_VEC[dir].y;
      const cell = sim.stage.cell(nx, ny);
      if (!cell || cell.terrain !== 'floor' || !canEnter(sim, dir, t)) continue;
      const d = field[sim.stage.index(nx, ny)];
      if (d < bestD) {
        best = dir;
        bestD = d;
      }
    }
    return best;
  };
}

/**
 * 自分の数手先（depth カウント分）を Sim で実際に試し、ミスせずにゴールへ最も早く近づける手を選ぶ。
 * 危険物の動きは見えている範囲（数拍先）だけ読む、慎重なプレイヤーのつもり。
 */
function lookahead(sim: Sim, field: Float64Array, depth = 3): Policy {
  let held: Dir | null = null;
  const canAct = (s: Sim, t: number) => t >= s.stunUntil && t % s.interval === 0;

  const search = (s: Sim, t: number, d: number): { value: number; first: Dir | null } => {
    let best = { value: Infinity, first: null as Dir | null };
    for (const h of [...DIRS, null]) {
      const c = s.clone();
      c.step(t, h);
      if (h && c.x === s.x && c.y === s.y && c.stillTicks === s.stillTicks) continue; // 壁に向かって押しただけ
      if (c.misses > s.misses) continue;
      if (field[c.stage.index(c.x, c.y)] === Infinity) continue; // 使ってよい道の外（safe の危険ゾーンなど）
      let tt = t + 1;
      while (c.status === 'playing' && !canAct(c, tt)) c.step(tt++, null);
      let value: number;
      if (c.status === 'cleared') value = tt - 10000;
      else if (c.status === 'timeup') value = Infinity;
      else if (d <= 1) value = tt + field[c.stage.index(c.x, c.y)];
      else value = search(c, tt, d - 1).value;
      if (value < best.value) best = { value, first: h };
    }
    return best;
  };

  return (t) => {
    if (!canAct(sim, t)) return t < sim.stunUntil ? null : held;
    held = search(sim, t, depth).first;
    return held;
  };
}

const hold = (dir: Dir): BotDef => ({
  name: `hold-${dir}`,
  purpose: '一方向に押しっぱなし：壁で止まるか危険マスに入るはず',
  create: () => () => dir,
});

export const BOTS: BotDef[] = [
  { name: 'idle', purpose: '何もしない：得点もゴールも得られないはず', create: () => () => null },
  hold('up'),
  hold('down'),
  hold('left'),
  hold('right'),
  {
    name: 'random',
    purpose: '拍ごとにでたらめな方向：ゴールに届かないはず',
    create: (_sim, _seed, rand) => {
      let held: Dir | null = null;
      return (t) => {
        if (t % TICKS_PER_BEAT === 0) held = DIRS[Math.floor(rand() * 4)];
        return held;
      };
    },
  },
  {
    name: 'mash',
    purpose: '連打（careful と同じ道を、半分の tick しか押さない）：押しっぱなしより遅いはず',
    create: (sim, _seed, rand) => {
      const careful = lookahead(sim, distanceField(sim.stage));
      return (t) => {
        const held = careful(t); // 先読みの状態を進めるため毎 tick 呼ぶ
        return rand() < 0.5 ? held : null;
      };
    },
  },
  {
    name: 'safe',
    purpose: '安全マスだけでゴールへ、危険物は先読みしてよける：曲の長さほぼいっぱいかかるはず',
    create: (sim) => lookahead(sim, distanceField(sim.stage, { safeOnly: true })),
  },
  {
    name: 'careful',
    purpose: '最短時間の道でゴールへ、危険物は先読みしてよける：素直な上手いプレイ（得点マスは狙わない）',
    create: (sim) => lookahead(sim, distanceField(sim.stage)),
  },
  {
    name: 'novice',
    purpose: '慣れていないプレイ（安全な道を、危険物を気にせず歩く）：一度も戻されずにゴールできるはず',
    create: (sim) => followField(sim, distanceField(sim.stage, { safeOnly: true })),
  },
  {
    name: 'rush',
    purpose: '最短時間の道を危険物を気にせず突っ込む：ミスの損で割に合わないはず',
    create: (sim) => followField(sim, distanceField(sim.stage)),
  },
  {
    name: 'strong',
    purpose: '危険物の動きを読み切って得点を最大化（ビームサーチ）：最も強いはず',
    heavy: true,
    create: (sim, seed) => {
      const inputs = planBeam(sim.stage, seed, Number(process.env.BEAM_WIDTH ?? 300));
      return (t) => inputs[t] ?? null;
    },
  },
];
