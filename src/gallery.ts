/**
 * 開発用：闇に浮かぶ物（src/render/things.ts の THINGS）を、種類ごとに1つずつ並べた一覧（npm run dev で /gallery.html）。
 * 絵の直しを頼むときに「一覧の 12」や名前で指す用。番号は THINGS に書いた順で、ステージの ?labels の番号（置いた物ごと）とは別。
 * 名前の下に、その物を置いているステージ（T：チュートリアル、1〜5：STAGE1〜5、H：拠点）を出す。
 *   ?scale=N  拡大（既定 2）
 *   ?still    動く物を止める（スクリーンショット用。npm run shot -- --only gallery）
 */
import { STAGES } from './game/stages/index.ts';
import { buildHub } from './game/stages/hub.ts';
import { drawText, textWidth } from './render/font.ts';
import { fillDiamond, TH, TW } from './render/pixel.ts';
import { THINGS } from './render/things.ts';

const params = new URLSearchParams(location.search);
const scale = Number(params.get('scale') ?? 2);
const still = params.has('still');

const COLS = 12;
const CELL_W = 84;
const CELL_H = 78;
const HEAD = 14;

/** 種類 → 置いているステージの短い名前 */
const usedIn = new Map<string, string[]>();
const hub = buildHub(new Set(['TUTORIAL', 'STAGE1', 'STAGE2', 'STAGE3', 'STAGE4', 'STAGE5']));
for (const def of [...Object.values(STAGES), hub]) {
  if (def.name === 'TEST') continue;
  const short = def.name === 'TUTORIAL' ? 'T' : def.name === 'HUB' ? 'H' : def.name.replace('STAGE', '');
  for (const [, , kind] of def.things ?? []) {
    const list = usedIn.get(kind) ?? [];
    if (!list.includes(short)) list.push(short);
    usedIn.set(kind, list);
  }
}

const kinds = Object.keys(THINGS);
const canvas = document.createElement('canvas');
canvas.width = COLS * CELL_W;
canvas.height = HEAD + Math.ceil(kinds.length / COLS) * CELL_H;
canvas.style.width = `${canvas.width * scale}px`;
canvas.style.height = `${canvas.height * scale}px`;
document.body.append(canvas);
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;

function draw(tickF: number): void {
  ctx.fillStyle = '#07060b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawText(ctx, `THINGS ${kinds.length}    T: TUTORIAL   1-5: STAGE1-5   H: HUB`, 4, 4, 1, '#8d857a');
  kinds.forEach((kind, i) => {
    const info = THINGS[kind];
    const x0 = (i % COLS) * CELL_W;
    const y0 = HEAD + Math.floor(i / COLS) * CELL_H;
    // 区切りの枠と、足もとのマス（物の大きさの目安）
    ctx.fillStyle = '#121019';
    ctx.fillRect(x0 + 1, y0 + 1, CELL_W - 2, CELL_H - 2);
    const sx = x0 + CELL_W / 2;
    const g = y0 + 44;
    fillDiamond(ctx, sx, g - TH / 2, TW, TH, '#1e1c27');
    if (info.foot) fillDiamond(ctx, sx, g - 3, 12, 6, '#34323d');
    info.draw(ctx, sx, g, tickF, 'L');
    const name = `${i + 1} ${kind.toUpperCase().replace(/_/g, '-')}`;
    drawText(ctx, name, Math.round(sx - textWidth(name, 1) / 2), y0 + 62, 1, '#ffd84a');
    const where = (usedIn.get(kind) ?? []).join(' ') || '-';
    drawText(ctx, where, Math.round(sx - textWidth(where, 1) / 2), y0 + 70, 1, '#8d857a');
  });
}

if (still) draw(0);
else {
  const start = performance.now();
  const frame = (now: number) => {
    // 動く物は 120BPM のつもりで（1tick = 十六分音符 = 0.125 秒）
    draw((now - start) / 125);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
