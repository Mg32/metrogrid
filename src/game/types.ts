export type Dir = 'up' | 'down' | 'left' | 'right';

export interface Vec {
  x: number;
  y: number;
}

export const DIR_VEC: Record<Dir, Vec> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** 0: 安全（四分音符） 1: 危険（八分音符） 2: 高危険（十六分音符） */
export type Zone = 0 | 1 | 2;

/** 1tick = 十六分音符。ゲームロジックはすべてtick単位で進む */
export const TICKS_PER_BEAT = 4;
export const BEATS_PER_BAR = 4;
export const TICKS_PER_BAR = TICKS_PER_BEAT * BEATS_PER_BAR;

/** ゾーンごとの1移動カウントの長さ（tick） */
export const ZONE_INTERVAL: Record<Zone, number> = { 0: 4, 1: 2, 2: 1 };

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}
