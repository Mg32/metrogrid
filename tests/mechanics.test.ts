import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Sim } from '../src/game/sim.ts';
import { Stage, type StageDef } from '../src/game/stage.ts';
import type { Dir } from '../src/game/types.ts';

/** 1行のテスト用ステージ。危険物の開始位置のずらしは 0 */
function mk(terrain: string, objects: string, hazards: StageDef['hazards'] = []): Sim {
  const def: StageDef = {
    name: 't',
    bpm: 120,
    bars: 8,
    terrain: [terrain],
    objects: [objects],
    scores: { a: { value: 10, decay: 1 } },
    hazards,
  };
  return new Sim(new Stage(def), () => 0);
}

function run(sim: Sim, from: number, to: number, held: Dir | null): void {
  for (let t = from; t < to; t++) sim.step(t, held);
}

describe('移動カウント', () => {
  test('安全ゾーンは四分音符（4tick）ごとに1マス', () => {
    const s = mk('#........#', ' S      G ');
    run(s, 0, 8, 'right');
    assert.equal(s.x, 3);
  });

  test('高危険ゾーンは十六分音符（毎tick）ごとに1マス', () => {
    const s = mk('#.::::::.#', ' S      G ');
    run(s, 0, 4, 'right');
    assert.equal(s.x, 5);
  });

  test('危険ゾーンは八分音符（2tick）ごとに1マス', () => {
    const s = mk('#.,,,,,,.#', ' S      G ');
    run(s, 0, 1, 'right'); // t0 で危険ゾーンへ
    run(s, 1, 5, 'right'); // t2, t4
    assert.equal(s.x, 4);
  });

  test('壁に向かって押してもその場にとどまる', () => {
    const s = mk('#........#', ' S      G ');
    run(s, 0, 4, 'left');
    assert.equal(s.x, 1);
    assert.equal(s.misses, 0);
  });

  test('キーを離すと止まる', () => {
    const s = mk('#........#', ' S      G ');
    run(s, 0, 1, 'right');
    run(s, 1, 12, null);
    assert.equal(s.x, 2);
  });
});

describe('ミス', () => {
  test('欠けた場所に落ちるとゾーンの入口へ戻り、1拍停止', () => {
    const s = mk('#.:::: .#', ' S     G');
    run(s, 0, 5, 'right'); // t0 で x2（ゾーン入口）、t1..3 で 3,4,5、t4 で穴
    assert.equal(s.misses, 1);
    assert.equal(s.x, 2);
    assert.equal(s.stunUntil, 8);
  });

  test('ミスで倍率がリセットされる', () => {
    const s = mk('#..:: .#', ' Sa   G');
    run(s, 0, 7, 'right'); // t0 で得点、t4,t5 で高危険ゾーン、t6 で穴
    assert.equal(s.score, 10);
    assert.equal(s.misses, 1);
    assert.equal(s.multiplier, 1);
  });

  test('すれ違いもミスになる', () => {
    const s = mk('#........#', ' S      G ', [{ type: 'patrol', waypoints: [[2, 0], [3, 0]], interval: 4 }]);
    run(s, 0, 4, null);
    run(s, 4, 5, 'right'); // プレイヤー 1→2、危険物 2→3
    assert.equal(s.misses, 0);
    run(s, 5, 8, null);
    run(s, 8, 9, 'right'); // プレイヤー 2→3、危険物 3→2
    assert.equal(s.misses, 1);
  });

  test('定位置型の危険物は周期の間だけ危険', () => {
    const s = mk('#........#', ' S      G ', [{ type: 'periodic', cells: [[2, 0]], period: 16, from: 0, to: 4 }]);
    run(s, 0, 1, 'right'); // t0：危険な間に入る
    assert.equal(s.misses, 1);
    const s2 = mk('#........#', ' S      G ', [{ type: 'periodic', cells: [[2, 0]], period: 16, from: 0, to: 4 }]);
    run(s2, 0, 4, null);
    run(s2, 4, 5, 'right'); // t4：危険でない
    assert.equal(s2.misses, 0);
  });
});

describe('特殊マス', () => {
  test('停止マス：押しっぱなしだとはじき返される', () => {
    const s = mk('#......#', ' S P  G');
    run(s, 0, 9, 'right');
    assert.equal(s.x, 2);
  });

  test('停止マス：1拍止まれば通れる', () => {
    const s = mk('#......#', ' S P  G');
    run(s, 0, 5, 'right');
    run(s, 5, 12, null);
    run(s, 12, 13, 'right');
    assert.equal(s.x, 4);
  });

  test('小節ゲート：通ると同じ小節の間は閉じ、次の小節で開く', () => {
    const s = mk('#......#', ' SB   G');
    run(s, 0, 1, 'right');
    run(s, 1, 4, null);
    run(s, 4, 5, 'left');
    run(s, 5, 8, null);
    run(s, 8, 9, 'right');
    assert.equal(s.x, 1);
    run(s, 9, 16, null);
    run(s, 16, 17, 'right');
    assert.equal(s.x, 2);
  });

  test('一方通行：決まった向きからしか入れない', () => {
    const s = mk('#......#', ' S<   G');
    run(s, 0, 1, 'right');
    assert.equal(s.x, 1);
  });
});

describe('得点と終了', () => {
  test('得点マスは拍ごとに減り、連続で取ると倍率がかかる', () => {
    const s = mk('#......#', ' S  aaG');
    run(s, 0, 9, 'right'); // t8 で x4（値 10-2=8）
    assert.equal(s.score, 8);
    run(s, 9, 13, 'right'); // t12 で x5（値 10-3=7、×2）
    assert.equal(s.score, 8 + 14);
    assert.equal(s.multiplier, 3);
  });

  test('ゴールでクリアし、残り拍数のボーナスが入る', () => {
    const s = mk('#...#', ' S G');
    run(s, 0, 9, 'right');
    assert.equal(s.status, 'cleared');
    assert.equal(s.goalBonus, 31 * 10);
  });

  test('曲が終わると時間切れ', () => {
    const s = mk('#...#', ' S G');
    run(s, 0, 200, null);
    assert.equal(s.status, 'timeup');
    assert.equal(s.tick, 8 * 16);
  });
});
