/**
 * ボットに各ステージを遊ばせて成績を表にし、企画書の設計意図どおりか判定する。
 *
 *   npm run bots                      全ステージ（STAGE_ORDER）・全ボット
 *   npm run bots -- --stage STAGE1    ステージを絞る（一覧にない TEST も指定できる）
 *   npm run bots -- --bot strong      ボットを絞る（判定は省略）
 *   npm run bots -- --seeds 10        シード数（既定 5、heavy なボットは最大 3）
 *   BEAM_WIDTH=500 npm run bots       強いボットの探索幅
 *
 * 判定に失敗すると終了コード 1。
 */
import { parseArgs } from 'node:util';
import { createRandom } from '../../src/game/random.ts';
import { Sim } from '../../src/game/sim.ts';
import { Stage } from '../../src/game/stage.ts';
import { STAGE_ORDER, STAGES } from '../../src/game/stages/index.ts';
import { TICKS_PER_BEAT } from '../../src/game/types.ts';
import { BOTS, type BotDef } from './bots.ts';

const { values: args } = parseArgs({
  options: {
    stage: { type: 'string' },
    bot: { type: 'string' },
    seeds: { type: 'string', default: '5' },
  },
});
const SEED_COUNT = Number(args.seeds);

interface RunResult {
  cleared: boolean;
  score: number;
  misses: number;
  pickups: number;
  /** そのプレイで出ていた得点マスの数 */
  tiles: number;
  goalBonus: number;
  /** ゴールしたときの残り拍数 */
  remainBeats: number | null;
}

function runBot(stage: Stage, bot: BotDef, seed: number): RunResult {
  const sim = new Sim(stage, createRandom(seed));
  const policy = bot.create(sim, seed, createRandom(seed ^ 0x5eed));
  for (let t = 0; sim.status === 'playing'; t++) sim.step(t, policy(t));
  return {
    cleared: sim.status === 'cleared',
    score: sim.score,
    misses: sim.misses,
    pickups: sim.events.filter((e) => e.kind === 'pickup').length,
    tiles: sim.scores.length,
    goalBonus: sim.goalBonus,
    remainBeats: sim.status === 'cleared' ? Math.floor((sim.totalTicks - sim.tick) / TICKS_PER_BEAT) : null,
  };
}

interface Summary {
  bot: BotDef;
  runs: RunResult[];
  clearRate: number;
  avgScore: number;
  minScore: number;
  maxScore: number;
  avgMisses: number;
  avgPickups: number;
  avgRemain: number | null;
}

function summarize(bot: BotDef, runs: RunResult[]): Summary {
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const remains = runs.flatMap((r) => (r.remainBeats === null ? [] : [r.remainBeats]));
  return {
    bot,
    runs,
    clearRate: runs.filter((r) => r.cleared).length / runs.length,
    avgScore: avg(runs.map((r) => r.score)),
    minScore: Math.min(...runs.map((r) => r.score)),
    maxScore: Math.max(...runs.map((r) => r.score)),
    avgMisses: avg(runs.map((r) => r.misses)),
    avgPickups: avg(runs.map((r) => r.pickups)),
    avgRemain: remains.length ? avg(remains) : null,
  };
}

function pad(s: string | number, n: number, right = false): string {
  const str = String(s);
  return right ? str.padStart(n) : str.padEnd(n);
}

let failed = false;

if (args.stage && !STAGES[args.stage]) throw new Error(`未知のステージ: ${args.stage}`);
for (const def of args.stage ? [STAGES[args.stage]] : STAGE_ORDER) {
  const stage = new Stage(def);
  const songBeats = def.bars * 4;
  console.log(`\n=== ${def.name}（${def.bars}小節 = ${songBeats}拍, BPM ${def.bpm}） ===`);

  const results = new Map<string, Summary>();
  for (const bot of BOTS) {
    if (args.bot && bot.name !== args.bot) continue;
    const n = bot.heavy ? Math.min(SEED_COUNT, 3) : SEED_COUNT;
    const started = performance.now();
    const runs = Array.from({ length: n }, (_, i) => runBot(stage, bot, i + 1));
    const s = summarize(bot, runs);
    results.set(bot.name, s);
    const ms = performance.now() - started;
    console.log(
      [
        pad(bot.name, 10),
        `clear ${pad(`${Math.round(s.clearRate * 100)}%`, 4, true)}`,
        `score ${pad(Math.round(s.avgScore), 5, true)} (${s.minScore}-${s.maxScore})`,
        `remain ${pad(s.avgRemain === null ? '-' : s.avgRemain.toFixed(1), 5, true)}拍`,
        `miss ${pad(s.avgMisses.toFixed(1), 4, true)}`,
        `pickup ${pad(s.avgPickups.toFixed(1), 4, true)}`,
        bot.heavy ? `${(ms / 1000).toFixed(1)}s` : '',
      ].join('  '),
    );
  }

  if (args.bot) continue;

  // 企画書の設計意図（第2.2節「単純なプレイが負ける理由」「バランスの目安」）と、ボット自体の検証
  const get = (name: string) => results.get(name)!;
  const holds = ['up', 'down', 'left', 'right'].map((d) => get(`hold-${d}`));
  const others = [...results.values()].filter((s) => s.bot.name !== 'strong');
  const checks: [string, boolean, string][] = [
    ['何もしないと得点もゴールもない', get('idle').avgScore === 0 && get('idle').clearRate === 0, `score ${get('idle').avgScore}`],
    ['押しっぱなしではゴールできない', holds.every((h) => h.clearRate === 0), holds.map((h) => `${h.bot.name} ${Math.round(h.clearRate * 100)}%`).join(', ')],
    ['でたらめな操作ではゴールできない', get('random').clearRate === 0, `clear ${Math.round(get('random').clearRate * 100)}%`],
    ['連打は押しっぱなしより悪い', get('mash').avgScore < get('careful').avgScore, `mash ${Math.round(get('mash').avgScore)} < careful ${Math.round(get('careful').avgScore)}`],
    ['安全マスだけで必ずゴールできる', get('safe').clearRate === 1, `clear ${Math.round(get('safe').clearRate * 100)}%`],
    [
      '安全マスだけだと曲の長さほぼいっぱいかかる（残り15%以内）',
      get('safe').avgRemain !== null && get('safe').avgRemain! <= songBeats * 0.15,
      `残り ${get('safe').avgRemain?.toFixed(1)}拍 / 上限 ${(songBeats * 0.15).toFixed(1)}拍`,
    ],
    ['危険ゾーンを使うと安全な道より得', get('careful').avgScore > get('safe').avgScore, `careful ${Math.round(get('careful').avgScore)} > safe ${Math.round(get('safe').avgScore)}`],
    ['強引に突っ込むのは割に合わない', get('rush').avgScore < get('strong').avgScore, `rush ${Math.round(get('rush').avgScore)} < strong ${Math.round(get('strong').avgScore)}`],
    // 「危険ゾーンをうまく使って稼いだ時間が、得点マスへの寄り道の余裕になる」
    [
      '強いボットは得点マスの半分以上に寄り道する',
      get('strong').runs.every((r) => r.pickups >= r.tiles / 2),
      get('strong').runs.map((r) => `${r.pickups}/${r.tiles}`).join(', '),
    ],
    [
      'ゴールボーナスより得点マスの得点が大きい',
      get('strong').runs.every((r) => r.goalBonus < r.score / 2),
      get('strong').runs.map((r) => `bonus ${r.goalBonus} / ${r.score}`).join(', '),
    ],
    [
      '強いボットがどのボットより強い（ボットの検証）',
      others.every((o) => get('strong').avgScore >= o.avgScore),
      `strong ${Math.round(get('strong').avgScore)} / 次点 ${Math.round(Math.max(...others.map((o) => o.avgScore)))}`,
    ],
  ];
  console.log('');
  for (const [name, ok, detail] of checks) {
    console.log(`${ok ? '✔' : '✘'} ${name}  (${detail})`);
    if (!ok) failed = true;
  }
}

process.exitCode = failed ? 1 : 0;
