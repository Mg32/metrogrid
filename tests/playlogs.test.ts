import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { replayPlayLog, RULES_VERSION, type PlayLog } from '../src/game/playlog.ts';

/**
 * playlogs/ にある実際のプレイ記録を再生し、記録された結果と一致するか確かめる。
 * ルールを変えたら RULES_VERSION を上げる（古い記録は対象外になる）。
 */
const dir = path.resolve(import.meta.dirname, '../playlogs');
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
const logs = files.map((f) => ({ file: f, log: JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as PlayLog }));
const current = logs.filter((l) => l.log.rulesVersion === RULES_VERSION);

test(`プレイ記録の再生が一致する（${current.length}/${logs.length} 件が現行ルール）`, () => {
  for (const { file, log } of current) {
    const sim = replayPlayLog(log);
    assert.deepEqual(
      { status: sim.status, score: sim.score, misses: sim.misses, tick: sim.tick },
      log.result,
      file,
    );
  }
});
