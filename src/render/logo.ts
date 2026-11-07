/**
 * タイトルのロゴの字。ふつうの文の字（font.ts。高さ 5 ドット）を大きくしただけでは線が細く読みにくいので、
 * ロゴの字だけ線の太い大きな字を手で描いてある（'#' が描くドット。12x12）。
 * かなは斜めの線を使わず、太さ 2 ドットの縦と横の線と四角い角だけで組む（ロゴとしてのまとまりと、遠目の読みやすさのため）。
 * 題名に使う字だけを置く（題名を変えたら字を足す。tests/lang.test.ts が確かめる）
 */
const KANA: Record<string, string[]> = {
  こ: [
    '............',
    '...########.',
    '...########.',
    '............',
    '............',
    '............',
    '............',
    '##..........',
    '##..........',
    '##..........',
    '############',
    '############',
  ],
  わ: [
    '..##........',
    '..##........',
    '##########..',
    '##########..',
    '..##........',
    '############',
    '############',
    '..##......##',
    '..##......##',
    '..##......##',
    '..##..######',
    '..##..######',
  ],
  れ: [
    '..##........',
    '..##........',
    '#######.....',
    '#######.....',
    '..##........',
    '#########...',
    '#########...',
    '..##...##...',
    '..##...##...',
    '..##...##.##',
    '..##...#####',
    '..##...#####',
  ],
  た: [
    '.##.........',
    '.##.........',
    '########....',
    '########....',
    '.##.........',
    '.##.#######.',
    '.##.#######.',
    '.##.........',
    '.##.##......',
    '.##.##......',
    '.##.#######.',
    '.##.#######.',
  ],
  お: [
    '...##....##.',
    '...##....##.',
    '########....',
    '########....',
    '...##.......',
    '...########.',
    '...########.',
    '...##....##.',
    '##.##....##.',
    '##.##....##.',
    '#####..####.',
    '#####..####.',
  ],
  う: [
    '...######...',
    '...######...',
    '............',
    '.##########.',
    '.##########.',
    '.........##.',
    '.........##.',
    '.........##.',
    '.........##.',
    '.........##.',
    '...########.',
    '...########.',
  ],
  ち: [
    '..##........',
    '..##........',
    '###########.',
    '###########.',
    '..##........',
    '..#########.',
    '..#########.',
    '.........##.',
    '.........##.',
    '.........##.',
    '..#########.',
    '..#########.',
  ],
};


/** 字の間（ドット）と、空白の幅 */
const GAP = 2;
const SPACE = 2;

const glyph = (ch: string): string[] | undefined => KANA[ch];

/** ロゴに描けない字（題名の確かめ用） */
export function missingLogoGlyphs(text: string): string[] {
  return [...text].filter((ch) => ch !== ' ' && !glyph(ch));
}

/** ロゴの行（いまは1行だけ） */
function logoLines(text: string): string[] {
  return [text];
}

function lineWidth(line: string): number {
  let w = 0;
  for (const ch of line) w += (ch === ' ' ? SPACE : (glyph(ch)?.[0].length ?? 0)) + GAP;
  return Math.max(0, w - GAP);
}

/** ロゴの幅（scale 倍したドット。いちばん長い行） */
export function logoWidth(text: string, scale: number): number {
  return Math.max(...logoLines(text).map(lineWidth)) * scale;
}

/** ロゴの高さ（scale 倍したドット） */
export function logoHeight(text: string, scale: number): number {
  const lines = logoLines(text);
  const h = (ch: string) => glyph(ch)?.length ?? 0;
  const lineH = Math.max(...[...text].map(h));
  return (lines.length * lineH + (lines.length - 1) * 3) * scale;
}

/** ロゴを、上端 y・左右の真ん中 cx に描く（scale 倍。整数のドットだけ） */
export function drawLogo(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, scale: number, color: string): void {
  const lines = logoLines(text);
  const lineH = Math.max(...[...text].map((ch) => glyph(ch)?.length ?? 0));
  ctx.fillStyle = color;
  lines.forEach((line, i) => {
    let x = Math.round(cx - (lineWidth(line) * scale) / 2);
    const top = y + i * (lineH + 3) * scale;
    for (const ch of line) {
      if (ch === ' ') {
        x += (SPACE + GAP) * scale;
        continue;
      }
      const g = glyph(ch);
      if (!g) continue;
      g.forEach((row, r) => {
        // 横に続くドットはまとめて描く
        for (let c = 0; c < row.length; ) {
          if (row[c] !== '#') {
            c++;
            continue;
          }
          let e = c;
          while (row[e] === '#') e++;
          ctx.fillRect(x + c * scale, top + r * scale, (e - c) * scale, scale);
          c = e;
        }
      });
      x += (g[0].length + GAP) * scale;
    }
  });
}
