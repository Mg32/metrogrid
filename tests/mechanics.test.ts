import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { FLOW_JUMP, FlowHazard } from '../src/game/hazard.ts';
import { EARLY_PRESS_TICKS, LATE_PRESS_TICKS, Sim } from '../src/game/sim.ts';
import { Stage, type StageDef } from '../src/game/stage.ts';
import { TICKS_PER_BAR, type Dir } from '../src/game/types.ts';

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

  test('止まっていて拍を見送った直後（LATE_PRESS_TICKS 以内）に押すと、その場で1歩進み、次からは拍どおり', () => {
    const s = mk('#........#', ' S      G ');
    run(s, 0, 5, null); // t4 のカウントを見送る
    s.step(5, 'right');
    assert.equal(s.x, 2);
    run(s, 6, 8, 'right');
    assert.equal(s.x, 2);
    s.step(8, 'right');
    assert.equal(s.x, 3);
  });

  test('拍の後、猶予より遅れて押したら次のカウントまで待つ', () => {
    const s = mk('#........#', ' S      G ');
    run(s, 0, 5 + LATE_PRESS_TICKS, null);
    run(s, 5 + LATE_PRESS_TICKS, 8, 'right');
    assert.equal(s.x, 1);
    s.step(8, 'right');
    assert.equal(s.x, 2);
  });

  test('カウントの直前（EARLY_PRESS_TICKS 以内）に押して離しても、カウントでその向きへ1歩進む（先行入力）', () => {
    const s = mk('#........#', ' S      G ');
    run(s, 0, 8 - EARLY_PRESS_TICKS, null);
    run(s, 8 - EARLY_PRESS_TICKS, 8, 'right');
    s.step(8, null);
    assert.equal(s.x, 2);
    // 1回押しただけなので、次のカウントでは進まない
    run(s, 9, 13, null);
    assert.equal(s.x, 2);
  });

  test('先行入力より早く押して離したら進まない', () => {
    const s = mk('#........#', ' S      G ');
    run(s, 0, 8 - EARLY_PRESS_TICKS - 1, null);
    s.step(8 - EARLY_PRESS_TICKS - 1, 'right');
    run(s, 8 - EARLY_PRESS_TICKS, 9, null);
    assert.equal(s.x, 1);
  });

  test('押しっぱなしで歩いていて、カウントの直前に離したら止まる（もう1歩進まない）', () => {
    const s = mk('#........#', ' S      G ');
    run(s, 0, 8 - EARLY_PRESS_TICKS, 'right'); // t0, t4 で進む
    assert.equal(s.x, 3);
    run(s, 8 - EARLY_PRESS_TICKS, 9, null);
    assert.equal(s.x, 3);
  });

  test('押している向きが複数あれば、進める向きのうち最後に押したものへ進む', () => {
    const s = mk('#........#', ' S      G ');
    // 新しく押した順。左（壁）と上（壁）は進めないので、右へ
    assert.equal(s.choose(['left', 'right']), 'right');
    assert.equal(s.choose(['up', 'left', 'right']), 'right');
    // どれも進めなければ、最後に押した向き（壁へ向かって押している）
    assert.equal(s.choose(['up', 'left']), 'up');
    assert.equal(s.choose([]), null);
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

  test('ゴールでクリアし、終わりの1小節前から数えた残り拍数のボーナスが入る', () => {
    const s = mk('#...#', ' S G');
    run(s, 0, 9, 'right');
    assert.equal(s.status, 'cleared');
    // 8小節（32拍）のうち t4 でゴール：残り 31 拍、1小節前からは 27 拍
    assert.equal(s.goalBeatsLeft, 31);
    assert.equal(s.goalBonus, 27 * 2);
  });

  test('最後の小節でゴールすると、ゴールボーナスは 0', () => {
    const s = mk('#...#', ' S G');
    // 曲の終わりの1小節前まで待ってから歩き出す（2歩目でゴール。曲の残りは 3 拍）
    const last = s.totalTicks - TICKS_PER_BAR;
    run(s, 0, last, null);
    run(s, last, last + 9, 'right');
    assert.equal(s.status, 'cleared');
    assert.equal(s.goalBonus, 0);
    assert.equal(s.goalBeatsLeft, 3);
  });

  test('曲が終わると時間切れ', () => {
    const s = mk('#...#', ' S G');
    run(s, 0, 200, null);
    assert.equal(s.status, 'timeup');
    assert.equal(s.tick, 8 * 16);
  });
});

describe('流されていく物', () => {
  const flow = new FlowHazard({ type: 'flow', cells: [[3, 1], [2, 1], [1, 1]], interval: 2, every: 10 }, 0);

  test('every tick ごとに1つ流れてきて、interval tick ごとに下流へ進み、最後のマスの先で消える', () => {
    const at = (t: number) => flow.cellsAt(t).map((c) => c.x);
    assert.deepEqual(at(0), [3]);
    assert.deepEqual(at(2), [2]);
    assert.deepEqual(at(4), [1]);
    assert.deepEqual(at(6), []);
    assert.deepEqual(at(10), [3]);
  });

  test('湧き口の中に見えているあいだは危険でなく、跳び出したら湧き口のマスが危険', () => {
    // 物 1 は tick 10 に水に落ちる。その FLOW_JUMP tick 前から跳んでいて、さらに前は穴の中に見えている
    const at = (t: number) => flow.cellsAt(t).map((c) => c.x);
    const peeking = (t: number) => flow.itemsAt(t).some((it) => it.n === 1 && it.age < -FLOW_JUMP);
    assert.ok(peeking(10 - FLOW_JUMP - 1));
    assert.deepEqual(at(10 - FLOW_JUMP - 1), []);
    assert.deepEqual(at(10 - FLOW_JUMP), [3]);
    assert.deepEqual(at(9), [3]);
  });

  test('流れの間隔が流れきる時間より短ければ、同時に複数流れている', () => {
    const dense = new FlowHazard({ type: 'flow', cells: [[3, 1], [2, 1], [1, 1]], interval: 2, every: 4 }, 0);
    assert.deepEqual(dense.cellsAt(4).map((c) => c.x).sort(), [1, 3]);
  });
});

describe('床の高さ（企画書 第2.4節）', () => {
  /** 1行のステージに高さ（1/4段単位の1文字）と上れるマスを付ける */
  function mkh(terrain: string, objects: string, heights: string, climbs: string): Sim {
    const def: StageDef = {
      name: 't',
      bpm: 120,
      bars: 8,
      terrain: [terrain],
      objects: [objects],
      heights: [heights],
      climbs: [climbs],
      scores: {},
      hazards: [],
    };
    return new Sim(new Stage(def), () => 0);
  }

  test('2段までの下りは進める', () => {
    const s = mkh('#....#', ' S  G ', '088000', '      ');
    run(s, 0, 4, 'right');
    assert.equal(s.x, 2);
    run(s, 4, 8, 'right');
    assert.equal(s.x, 3);
  });

  test('2段より深い段差は降りられない', () => {
    const s = mkh('#....#', ' S  G ', '0c3000', '      ');
    run(s, 0, 16, 'right');
    assert.equal(s.x, 1);
  });

  test('上れるのは、はしご・雨どいのマスから1段までだけ', () => {
    // はしごのない上りは進めない
    const blocked = mkh('#....#', ' S  G ', '004000', '      ');
    run(blocked, 0, 16, 'right');
    assert.equal(blocked.x, 1);
    // はしごのマスへは1段まで上れる
    const ladder = mkh('#....#', ' S  G ', '004800', '  hh  ');
    run(ladder, 0, 8, 'right');
    assert.equal(ladder.x, 3);
    // 1段より高い上りは、はしごでも進めない
    const tall = mkh('#....#', ' S  G ', '005000', '  h   ');
    run(tall, 0, 16, 'right');
    assert.equal(tall.x, 1);
  });

  test('斜面は滑り降りられるが、登り返せない', () => {
    const s = mkh('#.....#', ' S   G ', '0432100', '       ');
    run(s, 0, 12, 'right');
    assert.equal(s.x, 4);
    run(s, 12, 28, 'left');
    assert.equal(s.x, 4);
  });
});
