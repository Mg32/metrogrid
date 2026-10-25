/**
 * ドット単位の図形（renderer とエンディングで共通）。整数座標の fillRect だけで描く（パスやアンチエイリアスを使わない）。
 * クォータービューのタイル（上面の菱形）は横 TW・縦 TH。菱形は w:h = 2:1 が基本
 */
export const TW = 24;
export const TH = 12;

export function diamondRowWidth(r: number, w: number, h: number): number {
  return Math.round((w * (Math.min(r, h - 1 - r) + 1)) / (h / 2));
}

export function fillDiamond(ctx: CanvasRenderingContext2D, cx: number, top: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  for (let r = 0; r < h; r++) {
    const rw = diamondRowWidth(r, w, h);
    ctx.fillRect(cx - rw / 2, top + r, rw, 1);
  }
}

export function strokeDiamond(ctx: CanvasRenderingContext2D, cx: number, top: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  for (let r = 0; r < h; r++) {
    const rw = diamondRowWidth(r, w, h);
    ctx.fillRect(cx - rw / 2, top + r, 2, 1);
    ctx.fillRect(cx + rw / 2 - 2, top + r, 2, 1);
  }
}

/** 菱形を上面とする角柱の左右の側面 */
export function fillPrismSides(
  ctx: CanvasRenderingContext2D,
  cx: number,
  top: number,
  w: number,
  h: number,
  depth: number,
  left: string,
  right: string,
): void {
  for (let i = 0; i < w / 2; i++) {
    ctx.fillStyle = left;
    ctx.fillRect(cx - w / 2 + i, top + h - Math.ceil((w / 2 - i) / 2), 1, depth + 1);
    ctx.fillStyle = right;
    ctx.fillRect(cx + i, top + h - Math.ceil((i + 1) / 2), 1, depth + 1);
  }
}

/** 菱形の内側の各ドットに対して pred が真なら塗る（ディザ用） */
export function ditherDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  top: number,
  w: number,
  h: number,
  color: string,
  pred: (x: number, y: number) => boolean,
): void {
  ctx.fillStyle = color;
  for (let r = 0; r < h; r++) {
    const rw = diamondRowWidth(r, w, h);
    for (let x = cx - rw / 2; x < cx + rw / 2; x++) if (pred(x, top + r)) ctx.fillRect(x, top + r, 1, 1);
  }
}

export function fillEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string): void {
  ctx.fillStyle = color;
  for (let dy = -ry; dy <= ry; dy++) {
    const hw = Math.round(rx * Math.sqrt(1 - (dy / (ry + 0.5)) ** 2));
    ctx.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
  }
}

/** 凸な四角形を塗る（行ごとに左右の端を求めて fillRect） */
export function fillQuad(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], color: string): void {
  ctx.fillStyle = color;
  const ys = pts.map((p) => p.y);
  for (let y = Math.round(Math.min(...ys)); y <= Math.round(Math.max(...ys)); y++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (a.y === b.y) {
        if (Math.round(a.y) === y) {
          lo = Math.min(lo, a.x, b.x);
          hi = Math.max(hi, a.x, b.x);
        }
        continue;
      }
      const k = (y - a.y) / (b.y - a.y);
      if (k < 0 || k > 1) continue;
      const x = a.x + (b.x - a.x) * k;
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
    if (lo <= hi) ctx.fillRect(Math.round(lo), y, Math.round(hi) - Math.round(lo) + 1, 1);
  }
}

/** 水平な円をクォータービューで見た輪（横:縦 = 2:1 の楕円の線）。奥の半分と手前の半分で色を分ける */
export function strokeIsoRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, back: string, front: string): void {
  const ry = rx / 2;
  const n = Math.ceil(rx * 8);
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    ctx.fillStyle = Math.sin(a) > 0 ? front : back;
    ctx.fillRect(Math.round(cx + rx * Math.cos(a)), Math.round(cy + ry * Math.sin(a)), 1, 1);
  }
}

export function makeSprite(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  return c;
}

/** 線分（ドット単位） */
export function plotLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string): void {
  ctx.fillStyle = color;
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let k = 0; k <= n; k++) ctx.fillRect(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), 1, 1);
}

/** グリッド座標 → 菱形の上の頂点（ワールドのピクセル座標） */
export function iso(x: number, y: number): { sx: number; sy: number } {
  return { sx: Math.round(((x - y) * TW) / 2), sy: Math.round(((x + y) * TH) / 2) };
}
