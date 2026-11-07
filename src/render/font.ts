import { MOTTIRI_ADVANCE, MOTTIRI_BITS, MOTTIRI_CHARS } from './mottiri.ts';

/**
 * ドットフォント。日本語も英語も、すべて「みにもっちり」（src/render/mottiri.ts）で描く。
 * 字の本体は高さ 5 でベースラインに乗る（濁点などは上へ 3 ドットまではみ出す）。漢字はない
 */

/** 字の本体の高さ（濁点などのはみ出しを除く） */
export const GLYPH_H = 5;
/** みにもっちりの升目の高さ（下の端がベースライン）。字の本体の上に、濁点などの入る行がある */
const MOTTIRI_CELL = 8;

/** みにもっちりの文字の形（使うときに1文字ずつ取り出す） */
let mottiriIndex: Map<string, number> | null = null;
let mottiriBytes: Uint8Array | null = null;
function mottiriGlyph(ch: string): Uint8Array | null {
  if (!mottiriIndex) {
    mottiriIndex = new Map([...MOTTIRI_CHARS].map((c, i) => [c, i]));
    mottiriBytes = Uint8Array.from(atob(MOTTIRI_BITS), (c) => c.charCodeAt(0));
  }
  const i = mottiriIndex.get(ch);
  return i === undefined ? null : mottiriBytes!.subarray(i * MOTTIRI_CELL, (i + 1) * MOTTIRI_CELL);
}

/** みにもっちりにない文字（漢字など）。文を足したら単体テストで確かめる */
export function missingGlyphs(text: string): string[] {
  return [...new Set(text)].filter((ch) => !mottiriGlyph(ch));
}

export function textWidth(text: string, scale: number): number {
  const n = [...text].length;
  return n === 0 ? 0 : (n * MOTTIRI_ADVANCE - 1) * scale;
}

/** (x, y) は字の本体の左上。升目はその上の濁点などの行から描く。整数座標で1ドットずつ塗る */
export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number, color: string): void {
  ctx.fillStyle = color;
  let cx = x;
  const top = y - (MOTTIRI_CELL - GLYPH_H) * scale;
  for (const ch of text) {
    const rows = mottiriGlyph(ch) ?? mottiriGlyph('？')!;
    for (let r = 0; r < MOTTIRI_CELL; r++) {
      for (let c = 0; c < 8; c++) if (rows[r] & (0x80 >> c)) ctx.fillRect(cx + c * scale, top + r * scale, scale, scale);
    }
    cx += MOTTIRI_ADVANCE * scale;
  }
}
