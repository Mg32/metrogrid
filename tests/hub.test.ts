import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Sim } from '../src/game/sim.ts';
import { Stage } from '../src/game/stage.ts';
import { buildHub, hubReturnCell, UPSTAIRS } from '../src/game/stages/hub.ts';
import { STAGE_ORDER, STAGES } from '../src/game/stages/index.ts';
import { DIR_VEC, type Dir } from '../src/game/types.ts';

/** クリアの進み具合ごとの拠点：なし、STAGE1 まで、STAGE2 まで、… */
const progressions = STAGE_ORDER.map((_, i) => new Set(STAGE_ORDER.slice(0, i).map((d) => d.name)));

/** スタートから歩いて行けるマス（入口のマスにも入れる） */
function reachable(stage: Stage): Set<string> {
  const seen = new Set([`${stage.start.x},${stage.start.y}`]);
  const queue = [stage.start];
  while (queue.length) {
    const p = queue.shift()!;
    if (stage.cell(p.x, p.y)!.obj?.type === 'portal') continue;
    for (const d of Object.values(DIR_VEC)) {
      const q = { x: p.x + d.x, y: p.y + d.y };
      const key = `${q.x},${q.y}`;
      if (seen.has(key) || stage.cell(q.x, q.y)?.terrain !== 'floor') continue;
      seen.add(key);
      queue.push(q);
    }
  }
  return seen;
}

describe('拠点', () => {
  progressions.forEach((cleared, i) => {
    test(`STAGE${i} までクリア：入口は ${i + 1} つで、どれも歩いて行けて、戻る場所がある`, () => {
      const def = buildHub(cleared);
      const stage = new Stage(def);
      assert.equal(stage.kind, 'hub');
      assert.equal(def.hazards.length, 0);
      const portals = stage.cells.flatMap((c, idx) =>
        c.obj?.type === 'portal' ? [{ name: c.obj.stage, x: idx % stage.width, y: Math.floor(idx / stage.width) }] : [],
      );
      assert.deepEqual(
        portals.map((p) => p.name).sort(),
        STAGE_ORDER.slice(0, i + 1).map((d) => d.name),
      );
      const seen = reachable(stage);
      for (const p of portals) {
        assert.ok(STAGES[p.name], `${p.name} がステージ一覧にない`);
        assert.ok(seen.has(`${p.x},${p.y}`), `${p.name} の入口に行けない`);
        const back = hubReturnCell(def, p.name);
        assert.ok(back && stage.cell(back.x, back.y)?.terrain === 'floor', `${p.name} から戻る場所がない`);
      }
      // 外周は壁
      for (let x = 0; x < stage.width; x++) assert.equal(stage.cell(x, 0)!.terrain, 'wall');
      for (let x = 0; x < stage.width; x++) assert.equal(stage.cell(x, stage.height - 1)!.terrain, 'wall');
    });
  });

  test('STAGE5 をクリアすると二階への階段が現れ、歩いて行けて、戻る場所がある', () => {
    const upstairs = (def: ReturnType<typeof buildHub>) => def.objects.some((r) => r.includes('6'));
    assert.equal(upstairs(buildHub(progressions[progressions.length - 1])), false);
    const all = new Set(STAGE_ORDER.map((d) => d.name));
    const def = buildHub(all);
    const stage = new Stage(def);
    const cells = stage.cells.flatMap((c, idx) =>
      c.obj?.type === 'portal' && c.obj.stage === UPSTAIRS ? [`${idx % stage.width},${Math.floor(idx / stage.width)}`] : [],
    );
    assert.equal(cells.length, 1);
    assert.ok(reachable(stage).has(cells[0]), '階段に行けない');
    const back = hubReturnCell(def, UPSTAIRS);
    assert.ok(back && stage.cell(back.x, back.y)?.terrain === 'floor');
  });

  test('入口のマスに入ると、行き先が決まって止まる', () => {
    const stage = new Stage(buildHub(new Set()));
    const sim = new Sim(stage, () => 0);
    const portal = stage.cells.findIndex((c) => c.obj?.type === 'portal');
    const px = portal % stage.width;
    const py = Math.floor(portal / stage.width);
    // 入口のまっすぐ上（-y）から歩いて入る
    sim.debugPlace(px, py - 1);
    const dir: Dir = 'down';
    for (let t = 0; t <= 4 && sim.status === 'playing'; t++) sim.step(t, dir);
    assert.equal(sim.status, 'portal');
    assert.equal(sim.portal, 'STAGE1');
  });
});
