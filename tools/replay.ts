/**
 * プレイ記録（playlogs/*.json）を再生して、記録と結果が一致するか確かめ、プレイの傾向を集計する。
 * 「プレイヤーに合わせたボット」を作るときの材料にする。
 *
 *   npm run replay                   playlogs/ の全記録
 *   npm run replay -- FILE ...       記録を指定
 *   npm run replay -- --timeline     ミスと得点の時刻も表示
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { replayPlayLog, RULES_VERSION, type PlayLog } from '../src/game/playlog.ts';
import { TICKS_PER_BEAT, type Zone } from '../src/game/types.ts';

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: { timeline: { type: 'boolean', default: false } },
});

const dir = path.resolve(import.meta.dirname, '../playlogs');
const files = positionals.length
  ? positionals
  : (() => {
      try {
        return readdirSync(dir)
          .filter((f) => f.endsWith('.json'))
          .sort()
          .map((f) => path.join(dir, f));
      } catch {
        return [];
      }
    })();

if (files.length === 0) {
  console.log('プレイ記録がありません。npm run dev で最後まで遊ぶと playlogs/ に保存されます。');
  process.exit(0);
}

let mismatches = 0;
const beat = (t: number) => (t / TICKS_PER_BEAT).toFixed(1);

for (const file of files) {
  const log = JSON.parse(readFileSync(file, 'utf8')) as PlayLog;
  const zoneTicks: Record<Zone, number> = { 0: 0, 1: 0, 2: 0 };
  let idleTicks = 0;
  const sim = replayPlayLog(log, (s, held) => {
    zoneTicks[s.stage.cell(s.x, s.y)!.zone]++;
    if (!held) idleTicks++;
  });

  const result = { status: sim.status, score: sim.score, misses: sim.misses, tick: sim.tick };
  const same = JSON.stringify(result) === JSON.stringify(log.result);
  const stale = log.rulesVersion !== RULES_VERSION;
  if (!same && !stale) mismatches++;

  const total = zoneTicks[0] + zoneTicks[1] + zoneTicks[2];
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  const misses = sim.events.filter((e) => e.kind === 'miss');
  const pickups = sim.events.filter((e) => e.kind === 'pickup');
  const bounces = sim.events.filter((e) => e.kind === 'bounce');

  console.log(`\n${path.basename(file)}`);
  console.log(
    `  ${log.stage} seed ${log.seed}  ${sim.status}  score ${sim.score}  ${beat(sim.tick)}拍` +
      (sim.status === 'cleared' ? `（残り ${Math.floor((sim.totalTicks - sim.tick) / TICKS_PER_BEAT)}拍）` : ''),
  );
  console.log(
    `  再生の一致: ${same ? 'OK' : stale ? `不一致（記録はルール v${log.rulesVersion}、現在 v${RULES_VERSION}）` : `不一致！ 記録 ${JSON.stringify(log.result)}`}`,
  );
  console.log(`  いた場所: 安全 ${pct(zoneTicks[0])}  危険 ${pct(zoneTicks[1])}  高危険 ${pct(zoneTicks[2])}  / キーを離していた ${pct(idleTicks)}`);
  console.log(
    `  ミス ${misses.length}（落下 ${misses.filter((m) => m.kind === 'miss' && m.fell).length}）  得点マス ${pickups.length}  停止マスではじかれた ${bounces.length}`,
  );
  if (args.timeline) {
    for (const e of sim.events) {
      const what = e.kind === 'miss' ? (e.fell ? '落下' : '接触') : e.kind === 'pickup' ? `得点 +${e.amount}` : 'はじかれた';
      console.log(`    ${beat(e.tick).padStart(6)}拍  (${e.x},${e.y})  ${what}`);
    }
  }
}

if (mismatches > 0) {
  console.log(`\n現行ルールの記録のうち ${mismatches} 件が再生結果と一致しません。`);
  process.exitCode = 1;
}
