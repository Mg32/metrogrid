import { createRandom } from './random.ts';
import { Sim, type Status } from './sim.ts';
import { Stage } from './stage.ts';
import { STAGES } from './stages/index.ts';
import type { Dir } from './types.ts';

/**
 * ゲームのルール（Sim の挙動）を変えたら上げる。
 * 古い版のプレイ記録は再生結果が変わりうるので、一致の検査から外れる。
 */
export const RULES_VERSION = 2;

/** プレイ記録。ステージ・シード・入力の変化だけを残し、Sim で再生すれば同じ結果になる */
export interface PlayLog {
  rulesVersion: number;
  stage: string;
  seed: number;
  /** 押されている方向が変わった tick と、その方向（null は離した） */
  inputs: [number, Dir | null][];
  result: { status: Status; score: number; misses: number; tick: number };
  recordedAt: string;
}

export class InputRecorder {
  readonly inputs: [number, Dir | null][] = [];
  private last: Dir | null = null;

  record(tick: number, held: Dir | null): void {
    if (held === this.last) return;
    this.inputs.push([tick, held]);
    this.last = held;
  }
}

export function makePlayLog(sim: Sim, seed: number, recorder: InputRecorder): PlayLog {
  return {
    rulesVersion: RULES_VERSION,
    stage: sim.stage.def.name,
    seed,
    inputs: recorder.inputs,
    result: { status: sim.status, score: sim.score, misses: sim.misses, tick: sim.tick },
    recordedAt: new Date().toISOString(),
  };
}

/** 記録を最初から再生し、終わった状態の Sim を返す。onTick で途中経過を観察できる */
export function replayPlayLog(log: PlayLog, onTick?: (sim: Sim, held: Dir | null) => void): Sim {
  const def = STAGES[log.stage];
  if (!def) throw new Error(`未知のステージ: ${log.stage}`);
  const sim = new Sim(new Stage(def), createRandom(log.seed));
  let i = 0;
  let held: Dir | null = null;
  for (let t = 0; sim.status === 'playing'; t++) {
    while (i < log.inputs.length && log.inputs[i][0] <= t) held = log.inputs[i++][1];
    sim.step(t, held);
    onTick?.(sim, held);
  }
  return sim;
}
