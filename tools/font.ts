/**
 * 「みにもっちり」（font/mini_mottiri/mini_mottiri.ttf）に埋め込まれたビットマップ（8ドット）から、
 * ゲームで使うドットフォントのデータ（src/render/mottiri.ts）を書き出す。
 *   npm run font
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'font/mini_mottiri/mini_mottiri.ttf';
const OUT = 'src/render/mottiri.ts';
/** 升目の高さ。ベースラインは升目の下の端 */
const CELL = 8;

const buf = readFileSync(SRC);
const u8 = (o: number) => buf.readUInt8(o);
const i8 = (o: number) => buf.readInt8(o);
const u16 = (o: number) => buf.readUInt16BE(o);
const i16 = (o: number) => buf.readInt16BE(o);
const u32 = (o: number) => buf.readUInt32BE(o);

const tables = new Map<string, number>();
for (let i = 0; i < u16(4); i++) {
  const r = 12 + i * 16;
  tables.set(buf.toString('latin1', r, r + 4), u32(r + 8));
}
const table = (tag: string) => {
  const o = tables.get(tag);
  if (o === undefined) throw new Error(`${SRC}: ${tag} がない`);
  return o;
};

// cmap（Unicode の BMP、形式 4）：文字 → グリフの番号
const glyphOf = new Map<number, number>();
{
  const cmap = table('cmap');
  let sub = -1;
  for (let i = 0; i < u16(cmap + 2); i++) {
    const r = cmap + 4 + i * 8;
    const [platform, encoding] = [u16(r), u16(r + 2)];
    if ((platform === 3 && encoding === 1) || platform === 0) sub = cmap + u32(r + 4);
  }
  if (sub < 0 || u16(sub) !== 4) throw new Error(`${SRC}: cmap の形式 4 がない`);
  const segs = u16(sub + 6) / 2;
  const ends = sub + 14;
  const starts = ends + segs * 2 + 2;
  const deltas = starts + segs * 2;
  const ranges = deltas + segs * 2;
  for (let s = 0; s < segs; s++) {
    const [end, start, delta, range] = [u16(ends + s * 2), u16(starts + s * 2), i16(deltas + s * 2), u16(ranges + s * 2)];
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let g = 0;
      if (range === 0) g = (c + delta) & 0xffff;
      else {
        g = u16(ranges + s * 2 + range + (c - start) * 2);
        if (g !== 0) g = (g + delta) & 0xffff;
      }
      if (g !== 0) glyphOf.set(c, g);
    }
  }
}

// EBLC・EBDT：8ドットの大きさのビットマップ（索引の形式 1、画像の形式 2 だけ）
interface Glyph {
  width: number;
  height: number;
  bearingX: number;
  bearingY: number;
  advance: number;
  bits: (x: number, y: number) => boolean;
}
const glyphs = new Map<number, Glyph>();
{
  const eblc = table('EBLC');
  const ebdt = table('EBDT');
  let strike = -1;
  for (let i = 0; i < u32(eblc + 4); i++) {
    const r = eblc + 8 + i * 48;
    if (u8(r + 45) === CELL && u8(r + 46) === 1) strike = r;
  }
  if (strike < 0) throw new Error(`${SRC}: ${CELL} ドットのビットマップがない`);
  const array = eblc + u32(strike);
  for (let i = 0; i < u32(strike + 8); i++) {
    const r = array + i * 8;
    const [first, last] = [u16(r), u16(r + 2)];
    const sub = array + u32(r + 4);
    const [indexFormat, imageFormat, imageOffset] = [u16(sub), u16(sub + 2), u32(sub + 4)];
    if (indexFormat !== 1 || imageFormat !== 2) throw new Error(`${SRC}: 索引の形式 ${indexFormat}・画像の形式 ${imageFormat} は読めない`);
    for (let g = first; g <= last; g++) {
      const k = g - first;
      const [o0, o1] = [u32(sub + 8 + k * 4), u32(sub + 12 + k * 4)];
      if (o1 === o0) continue;
      const at = ebdt + imageOffset + o0;
      const [height, width] = [u8(at), u8(at + 1)];
      const data = at + 5;
      glyphs.set(g, {
        width,
        height,
        bearingX: i8(at + 2),
        bearingY: i8(at + 3),
        advance: u8(at + 4),
        bits: (x, y) => {
          const n = y * width + x;
          return (u8(data + (n >> 3)) & (0x80 >> (n & 7))) !== 0;
        },
      });
    }
  }
}

let chars = '';
const bytes: number[] = [];
const advances = new Set<number>();
for (const [code, g] of [...glyphOf].sort((a, b) => a[0] - b[0])) {
  const glyph = glyphs.get(g);
  // 送りのない文字（結合用の濁点など）は使わない
  if (!glyph || glyph.advance === 0) continue;
  // 8x8 の升目の上から1行ずつ、左のドットを上位ビットに（ベースラインは升目の下の端）
  const cell = new Array<number>(CELL).fill(0);
  for (let y = 0; y < glyph.height; y++) {
    for (let x = 0; x < glyph.width; x++) {
      const cx = glyph.bearingX + x;
      const cy = CELL - glyph.bearingY + y;
      if (!glyph.bits(x, y)) continue;
      if (cx < 0 || cx >= 8 || cy < 0 || cy >= CELL) throw new Error(`${String.fromCodePoint(code)}: 升目からはみ出す`);
      cell[cy] |= 0x80 >> cx;
    }
  }
  chars += String.fromCodePoint(code);
  bytes.push(...cell);
  advances.add(glyph.advance);
}
if (advances.size !== 1) throw new Error(`${SRC}: 送りの幅がそろっていない（${[...advances].join(', ')}）`);

const b64 = Buffer.from(bytes).toString('base64');
const lines = b64.match(/.{1,120}/g)!.map((l) => `  '${l}',`);
writeFileSync(
  OUT,
  `// 自動生成（npm run font）。手で書き換えない。
// 「みにもっちり」（https://booth.pm/ja/items/8754853。利用規約は font/mini_mottiri/利用規約.txt）
// prettier-ignore
export const MOTTIRI_CHARS = ${JSON.stringify(chars)};
/** 1文字ぶん進む幅（どの文字も同じ） */
export const MOTTIRI_ADVANCE = ${[...advances][0]};
/** 1文字 ${CELL} バイト（升目の上から1行ずつ、左のドットが上位ビット。ベースラインは升目の下の端）。MOTTIRI_CHARS と同じ順 */
// prettier-ignore
export const MOTTIRI_BITS = [
${lines.join('\n')}
].join('');
`,
);
console.log(`${OUT}: ${[...chars].length} 文字（送り ${[...advances][0]}）`);
