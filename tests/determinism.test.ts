import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InputRecorder, makePlayLog, replayPlayLog } from '../src/game/playlog.ts';
import { createRandom } from '../src/game/random.ts';
import { Sim } from '../src/game/sim.ts';
import { Stage } from '../src/game/stage.ts';
import { testStage } from '../src/game/stages/test.ts';
import type { Dir } from '../src/game/types.ts';

const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

/** 乱数で入力を作って最後まで遊ぶ */
function playRandom(seed: number, inputSeed: number): { sim: Sim; recorder: InputRecorder } {
  const sim = new Sim(new Stage(testStage), createRandom(seed));
  const rand = createRandom(inputSeed);
  const recorder = new InputRecorder();
  let held: Dir | null = null;
  for (let t = 0; sim.status === 'playing'; t++) {
    if (t % 4 === 0) held = rand() < 0.2 ? null : DIRS[Math.floor(rand() * 4)];
    recorder.record(t, held);
    sim.step(t, held);
  }
  return { sim, recorder };
}

test('同じシードと入力なら同じ結果になる', () => {
  const a = playRandom(7, 1);
  const b = playRandom(7, 1);
  assert.deepEqual(
    [a.sim.score, a.sim.misses, a.sim.x, a.sim.y, a.sim.tick],
    [b.sim.score, b.sim.misses, b.sim.x, b.sim.y, b.sim.tick],
  );
});

test('プレイ記録を再生すると同じ結果になる', () => {
  for (let i = 0; i < 5; i++) {
    const { sim, recorder } = playRandom(100 + i, i);
    const log = makePlayLog(sim, 100 + i, recorder);
    const replayed = replayPlayLog(log);
    assert.deepEqual(
      { status: replayed.status, score: replayed.score, misses: replayed.misses, tick: replayed.tick },
      log.result,
    );
  }
});

test('clone した Sim は元と独立して進む', () => {
  const sim = new Sim(new Stage(testStage), createRandom(3));
  for (let t = 0; t < 10; t++) sim.step(t, 'right');
  const c = sim.clone();
  for (let t = 10; t < 30; t++) c.step(t, 'right');
  assert.equal(sim.tick, 9);
  assert.notEqual(c.tick, sim.tick);
  // 元を同じように進めれば同じ状態になる
  for (let t = 10; t < 30; t++) sim.step(t, 'right');
  assert.deepEqual([sim.x, sim.y, sim.score, sim.scores], [c.x, c.y, c.score, c.scores]);
});
