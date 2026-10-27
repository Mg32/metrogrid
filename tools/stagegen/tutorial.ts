// チュートリアルの地図を組み立てて src/game/stages/tutorial.ts を書き出す
//   node tools/stagegen/tutorial.ts          所要時間を表示するだけ（SHOW=1 で地図も表示）
//   node tools/stagegen/tutorial.ts --write  書き出す
//
// 1本道で、歩く・止まる・得点マス・速い道（八分・十六分）・欠け・遊具・停止マス・ゴールを順に教える。
// 画面の下から斜め右上へ進む（-y へ登る）。案内の文字は、プレイヤーが近づくと地面の上に出る。
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { Stage, type HazardDef, type StageDef } from '../../src/game/stage.ts';
import { distanceField } from '../bots/nav.ts';

const BPM = 100;
const BARS = 20;
const W = 21, H = 34;
const T: string[][] = Array.from({ length: H }, () => Array(W).fill('#'));
const O: string[][] = Array.from({ length: H }, () => Array(W).fill(' '));
const t = (x: number, y: number, ch: string) => { T[y][x] = ch; };
const o = (x: number, y: number, ch: string) => { O[y][x] = ch; };
const line = (x0: number, y0: number, x1: number, y1: number, ch: string) => {
  const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
  for (let x = x0, y = y0; ; x += dx, y += dy) { t(x, y, ch); if (x === x1 && y === y1) break; }
};
const hazards: HazardDef[] = [];
const hints: StageDef['hints'] = [];
const hint = (x: number, y: number, text: string, touch?: string) => hints.push({ x, y, text, ...(touch ? { touch } : {}) });

// 1. 歩く：玄関を出て、まっすぐ上へ
o(2, 31, 'H'); o(4, 31, 'L');
line(3, 31, 3, 26, '.'); o(3, 31, 'S');
hint(3, 30, 'HOLD AN ARROW KEY TO WALK', 'TOUCH AND SLIDE A FINGER TO WALK');
// 2. 曲がる・止まる：右へ曲がり、また上へ
line(3, 25, 8, 25, '.');
hint(4, 25, 'ONE STEP PER BEAT. LET GO TO STOP');
line(8, 24, 8, 22, '.');
// 3. 得点マス
o(8, 23, 'a');
hint(8, 24, 'GEMS LOSE VALUE EVERY BEAT');
// 4. 速い道：景色の薄い道は八分、もっと薄い道は十六分で進む
line(8, 21, 15, 21, ',');
hint(9, 21, 'FADED ROAD: 2 STEPS PER BEAT');
line(16, 21, 16, 17, ':');
hint(16, 20, 'MORE FADED: 4 STEPS. STOP IN TIME!');
// 5. 欠け：曲がり角の先が欠けていて、行き過ぎると落ちる
t(16, 16, ' '); t(17, 17, ' '); t(17, 16, ' '); t(15, 16, ' ');
hint(16, 18, 'GAPS: YOU FALL AND GO BACK');
line(15, 17, 11, 17, '.');
o(13, 17, 'b');
// 6. 遊具：箱ブランコが道を横切って揺れる（道の1マスだけ）。座席が通り過ぎるのを待って通る
line(11, 16, 11, 12, '.');
// 周期は拍（4 tick）の倍数にしない。倍数だと、振り始めの位置によっては切れ目がカウントの頭と噛み合わない
hazards.push({ type: 'swing', cells: [[11, 14]], axis: 'x', period: 22 });
hint(11, 16, 'SWINGS KNOCK YOU BACK. WAIT FOR A GAP');
// 7. 停止マス：ぐらつく踏み石は1拍止まらないと渡れない
o(11, 11, 'P'); t(11, 11, '.');
hint(11, 12, 'WOBBLY STONE: STAND STILL FOR 1 BEAT');
line(11, 10, 11, 8, '.');
// 8. ゴール
line(12, 8, 16, 8, '.');
o(17, 8, 'G'); t(17, 8, '.');
for (const [x, y] of [[17, 7], [18, 8], [17, 9]]) t(x, y, ' ');
hint(14, 8, 'REACH THE DOOR BEFORE THE SONG ENDS');
// 街灯と、ほかの家の入口
for (const [x, y] of [[4, 27], [9, 26], [9, 22], [12, 20], [17, 19], [10, 18], [12, 13], [12, 10], [15, 9]]) o(x, y, 'L');
for (const [x, y] of [[2, 28], [7, 24], [10, 14]]) o(x, y, 'E');

const terrain = T.map((r) => r.join(''));
const objects = O.map((r) => r.join(''));
const scores = { a: { value: 100, decay: 1 }, b: { value: 200, decay: 2 } };
const def: StageDef = { name: 'TUTORIAL', kind: 'tutorial', bpm: BPM, bars: BARS, terrain, objects, scores, hazards, hints };
const st = new Stage(def);
console.log(`fast ${distanceField(st)[st.index(st.start.x, st.start.y)] / 4} beats, song ${def.bars * 4}`);
if (process.env.SHOW) console.log(terrain.map((r, y) => `${String(y).padStart(2)} ${r}  ${objects[y]}`).join('\n'));

if (process.argv.includes('--write')) {
  const h = (x: HazardDef) => '    ' + JSON.stringify(x).replace(/"(\w+)":/g, '$1: ').replace(/"/g, "'").replace(/,(?=\S)/g, ', ') + ',';
  const src = `import type { StageDef } from '../stage.ts';

/**
 * チュートリアル（最初に遊ぶ練習。タイトルからスキップできる）。BPM 100 の短い1本道で、
 * 歩く・止まる・得点マス・速い道（八分・十六分）・欠け・遊具・停止マス・ゴールを順に教える。案内の文字はプレイヤーが近づくと出る。
 *
 * この地図は tools/stagegen/tutorial.ts で組み立てて書き出したもの。調整はスクリプト側で行い --write で書き出し直す。
 */
// prettier-ignore
export const tutorial: StageDef = {
  name: 'TUTORIAL',
  kind: 'tutorial',
  bpm: ${def.bpm},
  bars: ${def.bars},
  terrain: [
${terrain.map((r) => `    '${r}',`).join('\n')}
  ],
  objects: [
${objects.map((r) => `    '${r}',`).join('\n')}
  ],
  scores: {
${Object.entries(scores).map(([k, v]) => `    ${k}: { value: ${v.value}, decay: ${v.decay} },`).join('\n')}
  },
  hazards: [
${hazards.map(h).join('\n')}
  ],
  hints: [
${hints.map((x) => `    { x: ${x.x}, y: ${x.y}, text: '${x.text}'${x.touch ? `, touch: '${x.touch}'` : ''} },`).join('\n')}
  ],
};
`;
  const OUT = path.resolve(import.meta.dirname, '../../src/game/stages/tutorial.ts');
  writeFileSync(OUT, src);
  console.log('wrote', path.relative(process.cwd(), OUT));
}
