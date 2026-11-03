import { MOTTIRI_ADVANCE, MOTTIRI_BITS, MOTTIRI_CHARS } from './mottiri.ts';

/**
 * ドットフォント。英語の文は 3x5 のドットフォント（英大文字・数字・記号）、
 * それ以外の文字（かななど）を含む文は、まるごと「みにもっちり」（src/render/mottiri.ts）で描く。
 * みにもっちりも字の本体は高さ 5 でベースラインに乗る（濁点などは上へ 3 ドットまではみ出す）ので、
 * どちらのフォントでも、文の高さと縦の位置は同じに扱える。漢字はない
 */
// prettier-ignore
const GLYPHS: Record<string, string> = {
  A: '.#. #.# ### #.# #.#', B: '##. #.# ##. #.# ##.', C: '.## #.. #.. #.. .##', D: '##. #.# #.# #.# ##.',
  E: '### #.. ##. #.. ###', F: '### #.. ##. #.. #..', G: '.## #.. #.# #.# .##', H: '#.# #.# ### #.# #.#',
  I: '### .#. .#. .#. ###', J: '..# ..# ..# #.# .#.', K: '#.# #.# ##. #.# #.#', L: '#.. #.. #.. #.. ###',
  M: '#.# ### ### #.# #.#', N: '##. #.# #.# #.# #.#', O: '.#. #.# #.# #.# .#.', P: '##. #.# ##. #.. #..',
  Q: '.#. #.# #.# ##. .##', R: '##. #.# ##. #.# #.#', S: '.## #.. .#. ..# ##.', T: '### .#. .#. .#. .#.',
  U: '#.# #.# #.# #.# ###', V: '#.# #.# #.# #.# .#.', W: '#.# #.# ### ### #.#', X: '#.# #.# .#. #.# #.#',
  Y: '#.# #.# .#. .#. .#.', Z: '### ..# .#. #.. ###',
  0: '### #.# #.# #.# ###', 1: '.#. ##. .#. .#. ###', 2: '##. ..# .#. #.. ###', 3: '##. ..# .#. ..# ##.',
  4: '#.# #.# ### ..# ..#', 5: '### #.. ##. ..# ##.', 6: '.## #.. ### #.# ###', 7: '### ..# .#. .#. .#.',
  8: '### #.# ### #.# ###', 9: '### #.# ### ..# ##.',
  ' ': '... ... ... ... ...', '.': '... ... ... ... .#.', ':': '... .#. ... .#. ...', '/': '..# ..# .#. #.. #..',
  '+': '... .#. ### .#. ...', '-': '... ... ### ... ...', '*': '... #.# .#. #.# ...', '(': '.#. #.. #.. #.. .#.',
  ')': '.#. ..# ..# ..# .#.', '!': '.#. .#. .#. ... .#.', '?': '##. ..# .#. ... .#.', ',': '... ... ... .#. #..',
  '=': '... ### ... ### ...', '>': '#.. .#. ..# .#. #..', '<': '..# .#. #.. .#. ..#',
};

const BITMAPS = new Map<string, boolean[]>(
  Object.entries(GLYPHS).map(([ch, s]) => [ch, [...s.replace(/ /g, '')].map((c) => c === '#')]),
);

export const GLYPH_W = 3;
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

/** みにもっちりで描く文か（3x5 のフォントにない文字を含む） */
export function isMottiri(text: string): boolean {
  for (const ch of text.toUpperCase()) if (!BITMAPS.has(ch)) return true;
  return false;
}

/** みにもっちりにない文字（漢字など）。文を足したら単体テストで確かめる */
export function missingGlyphs(text: string): string[] {
  return isMottiri(text) ? [...new Set(text)].filter((ch) => !mottiriGlyph(ch)) : [];
}

export function textWidth(text: string, scale: number): number {
  if (text.length === 0) return 0;
  const advance = isMottiri(text) ? MOTTIRI_ADVANCE : GLYPH_W + 1;
  return ([...text].length * advance - 1) * scale;
}

/** (x, y) は左上。整数座標で1ドットずつ塗る */
export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number, color: string): void {
  ctx.fillStyle = color;
  let cx = x;
  if (isMottiri(text)) {
    // y は字の本体の上の端（3x5 と同じ）。升目はその上の濁点などの行から描く
    const top = y - (MOTTIRI_CELL - GLYPH_H) * scale;
    for (const ch of text) {
      const rows = mottiriGlyph(ch) ?? mottiriGlyph('？')!;
      for (let r = 0; r < MOTTIRI_CELL; r++) {
        for (let c = 0; c < 8; c++) if (rows[r] & (0x80 >> c)) ctx.fillRect(cx + c * scale, top + r * scale, scale, scale);
      }
      cx += MOTTIRI_ADVANCE * scale;
    }
    return;
  }
  for (const ch of text.toUpperCase()) {
    const bits = BITMAPS.get(ch) ?? BITMAPS.get('?')!;
    for (let i = 0; i < bits.length; i++) {
      if (bits[i]) ctx.fillRect(cx + (i % GLYPH_W) * scale, y + Math.floor(i / GLYPH_W) * scale, scale, scale);
    }
    cx += (GLYPH_W + 1) * scale;
  }
}
