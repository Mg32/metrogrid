import type { Dir } from './game/types.ts';

/**
 * タッチで歩く操作：指を置いたところを中心に、指をずらした向きへ歩く（画面のどこに指を置いてもよい。少女を指で隠さずにすむ）。
 * 向きはクォータービューの画面の斜めにそのまま対応する：右上へずらすと up、右下は right、左下は down、左上は left。
 * 指を中心へ戻すと止まる。指を中心から STICK_RADIUS より遠くへずらすと、中心が指についてくる（逆へ切り返しやすいように）。
 * 座標は 288x288 のバッファのドット
 */
export const STICK_RADIUS = 18;
/** 中心からこの距離より近ければ止まる */
export const STICK_DEAD = 5;
/** 向きの境目（画面の縦・横）の近くでは、この角度（度）までは今の向きを保つ（境目の上で向きがばたつかないように） */
const HOLD_DEG = 12;

/** 中心から見た、それぞれの向きの角度（度。画面の右が 0、下が 90）。斜めの中ほど */
const ANGLE: Record<Dir, number> = { up: -45, right: 45, down: 135, left: -135 };

export class Stick {
  /** 指を置いた中心（ついてくる） */
  cx: number;
  cy: number;
  /** 指のいまの位置 */
  x: number;
  y: number;
  dir: Dir | null = null;
  readonly id: number;

  constructor(id: number, x: number, y: number) {
    this.id = id;
    this.cx = this.x = x;
    this.cy = this.y = y;
  }

  move(x: number, y: number): void {
    this.x = x;
    this.y = y;
    const dx = x - this.cx;
    const dy = y - this.cy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_RADIUS) {
      this.cx = x - (dx / d) * STICK_RADIUS;
      this.cy = y - (dy / d) * STICK_RADIUS;
    }
    this.dir = stickDir(dx, dy, this.dir);
  }
}

/** 中心からのずれ (dx, dy) → 歩く向き。prev はいまの向き（境目の近くでは保つ） */
export function stickDir(dx: number, dy: number, prev: Dir | null): Dir | null {
  if (Math.hypot(dx, dy) < STICK_DEAD) return null;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (prev) {
    const off = Math.abs(((deg - ANGLE[prev] + 540) % 360) - 180);
    if (off <= 45 + HOLD_DEG) return prev;
  }
  if (dx >= 0) return dy < 0 ? 'up' : 'right';
  return dy > 0 ? 'down' : 'left';
}
