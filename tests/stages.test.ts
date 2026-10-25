import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createHazards, PatrolHazard, PeriodicHazard } from '../src/game/hazard.ts';
import { Stage } from '../src/game/stage.ts';
import { STAGES } from '../src/game/stages/index.ts';

for (const def of Object.values(STAGES)) {
  describe(`ステージ ${def.name}`, () => {
    const stage = new Stage(def);

    test('terrain と objects の行の長さがそろっている', () => {
      for (let y = 0; y < def.terrain.length; y++) {
        assert.equal(def.terrain[y].length, stage.width, `terrain ${y} 行目`);
        assert.equal(def.objects[y].length, stage.width, `objects ${y} 行目`);
      }
    });

    test('外周が壁で囲まれている', () => {
      for (let x = 0; x < stage.width; x++) {
        assert.equal(stage.cell(x, 0)!.terrain, 'wall');
        assert.equal(stage.cell(x, stage.height - 1)!.terrain, 'wall');
      }
      for (let y = 0; y < stage.height; y++) {
        assert.equal(stage.cell(0, y)!.terrain, 'wall');
        assert.equal(stage.cell(stage.width - 1, y)!.terrain, 'wall');
      }
    });

    test('スタートとゴールは安全ゾーン', () => {
      assert.equal(stage.cell(stage.start.x, stage.start.y)!.zone, 0);
      assert.equal(stage.cell(stage.goal.x, stage.goal.y)!.zone, 0);
    });

    test('危険物はすべて床の上を動く', () => {
      for (const h of createHazards(def.hazards, () => 0)) {
        const cells = h instanceof PatrolHazard ? h.route : h instanceof PeriodicHazard ? h.cells : [];
        for (const c of cells) assert.equal(stage.cell(c.x, c.y)?.terrain, 'floor', `(${c.x},${c.y})`);
      }
    });

    test('曲の長さは小節単位', () => {
      assert.ok(Number.isInteger(def.bars) && def.bars > 0);
    });
  });
}
