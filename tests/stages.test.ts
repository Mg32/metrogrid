import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createHazards, PatrolHazard, PeriodicHazard, SwingHazard } from '../src/game/hazard.ts';
import { Stage } from '../src/game/stage.ts';
import { STAGES } from '../src/game/stages/index.ts';
import { TICKS_PER_BAR, ZONE_INTERVAL } from '../src/game/types.ts';

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
        const cells = h instanceof PatrolHazard ? h.route : h instanceof PeriodicHazard || h instanceof SwingHazard ? h.cells : [];
        for (const c of cells) assert.equal(stage.cell(c.x, c.y)?.terrain, 'floor', `(${c.x},${c.y})`);
      }
    });

    test('その場で動く危険物のマスは、振り始めの位置によらず2小節以内に通れる', () => {
      // そのマスのゾーンの1カウントの間ずっと危険でない、カウントの頭の tick があるか
      const MAX_WAIT = 2 * TICKS_PER_BAR;
      for (const d of def.hazards) {
        if (d.type === 'patrol') continue;
        const phases = d.type === 'swing' ? d.period : 1;
        for (let phase = 0; phase < phases; phase++) {
          const h = d.type === 'swing' ? new SwingHazard(d, phase) : new PeriodicHazard(d);
          for (const c of h instanceof SwingHazard || h instanceof PeriodicHazard ? h.cells : []) {
            const interval = ZONE_INTERVAL[stage.cell(c.x, c.y)!.zone];
            const free = (t: number) => !h.cellsAt(t).some((p) => p.x === c.x && p.y === c.y);
            let last = 0;
            for (let t0 = 0; t0 < 8 * TICKS_PER_BAR; t0 += interval) {
              let ok = true;
              for (let k = 0; k < interval; k++) ok &&= free(t0 + k);
              if (!ok) continue;
              assert.ok(t0 - last <= MAX_WAIT, `${JSON.stringify(d)} の (${c.x},${c.y}) phase ${phase}：${t0 - last}tick 通れない`);
              last = t0;
            }
            assert.ok(8 * TICKS_PER_BAR - last <= MAX_WAIT, `${JSON.stringify(d)} の (${c.x},${c.y}) phase ${phase}：通れない`);
          }
        }
      }
    });

    test('曲の長さは小節単位', () => {
      assert.ok(Number.isInteger(def.bars) && def.bars > 0);
    });
  });
}
