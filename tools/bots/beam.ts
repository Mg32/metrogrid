import { createRandom } from '../../src/game/random.ts';
import { GOAL_BONUS_PER_BEAT, Sim } from '../../src/game/sim.ts';
import type { Stage } from '../../src/game/stage.ts';
import { TICKS_PER_BEAT, type Dir } from '../../src/game/types.ts';
import { DIRS, distanceField } from './nav.ts';

interface Node {
  parent: Node | null;
  held: Dir | null;
}

interface Entry {
  sim: Sim;
  node: Node;
  value: number;
}

/**
 * 強いボットの計画。危険物の動きをすべて知ったうえで、動けるカウントごとに5通り（4方向と待機）を試すビームサーチ。
 * 同じ状態（位置・残っている得点マス・倍率・ゲートなど）は評価の高いものだけ残す。
 * 戻り値は tick ごとの入力。
 */
export function planBeam(stage: Stage, seed: number, width: number): (Dir | null)[] {
  const field = distanceField(stage);
  const gates: [number, number][] = [];
  for (let y = 0; y < stage.height; y++) {
    for (let x = 0; x < stage.width; x++) if (stage.cell(x, y)!.obj?.type === 'gate') gates.push([x, y]);
  }

  const key = (s: Sim, t: number): string => {
    let mask = 0;
    s.scores.forEach((sc, i) => sc.alive && (mask |= 1 << i));
    let gateBits = 0;
    gates.forEach(([x, y], i) => s.isGateClosed(x, y, t + 1) && (gateBits |= 1 << i));
    return `${s.x},${s.y},${mask},${Math.min(s.streak, 3)},${t < s.stunUntil ? 1 : 0},${Math.min(s.stillTicks, 4)},${gateBits}`;
  };

  // 評価：いまの得点 ＋ いまからゴールへ直行したときのゴールボーナスの見込み
  const evaluate = (s: Sim, t: number): number => {
    const slack = s.totalTicks - t - field[stage.index(s.x, s.y)];
    return s.score + (slack >= 0 ? Math.floor(slack / TICKS_PER_BEAT) * GOAL_BONUS_PER_BEAT : -1000 + slack);
  };

  const root: Node = { parent: null, held: null };
  let frontier: Entry[] = [{ sim: new Sim(stage, createRandom(seed)), node: root, value: 0 }];
  let best: { score: number; node: Node } | null = null;

  for (let t = 0; frontier.length > 0; t++) {
    const next = new Map<string, Entry>();
    for (const { sim, node } of frontier) {
      const canAct = t >= sim.stunUntil && t % sim.interval === 0;
      for (const held of canAct ? [null, ...DIRS] : [null]) {
        const c = sim.clone();
        c.step(t, held);
        const child: Node = { parent: node, held };
        if (c.status !== 'playing') {
          if (!best || c.score > best.score) best = { score: c.score, node: child };
          continue;
        }
        const k = key(c, t);
        const value = evaluate(c, t);
        const prev = next.get(k);
        if (!prev || value > prev.value) next.set(k, { sim: c, node: child, value });
      }
    }
    frontier = [...next.values()].sort((a, b) => b.value - a.value).slice(0, width);
  }

  const inputs: (Dir | null)[] = [];
  for (let n = best!.node; n.parent; n = n.parent) inputs.push(n.held);
  return inputs.reverse();
}
