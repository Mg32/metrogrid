import type { Dir, Vec, Zone } from './types.ts';

/**
 * ステージ定義。terrain と objects は同じ大きさの文字グリッド。
 *
 * terrain:  '#' 壁  ' ' 景色の欠けた場所（踏むとミス）
 *           '.' 安全  ',' 危険  ':' 高危険
 * objects:  terrain の上に重ねる。下記以外の文字は無視する。
 *           'S' スタート  'G' ゴール  'B' 小節ゲート  'P' 停止マス
 *           '^' '>' 'v' '<' 一方通行（その向きに進むときだけ入れる）
 *           'a'〜'z' 得点マス（scores で値を定義）
 */
export interface StageDef {
  name: string;
  bpm: number;
  bars: number;
  terrain: string[];
  objects: string[];
  scores: Record<string, { value: number; decay: number }>;
  hazards: HazardDef[];
}

export type HazardDef =
  /** 巡回型。waypoints を縦横の直線でつないだ経路を interval tick ごとに1マス進む。loop でなければ往復 */
  | { type: 'patrol'; waypoints: [number, number][]; interval: number; loop?: boolean }
  /** 定位置型。period tick の周期のうち [from, to) の間だけ cells が危険になる */
  | { type: 'periodic'; cells: [number, number][]; period: number; from: number; to: number };

export type Obj =
  | { type: 'start' }
  | { type: 'goal' }
  | { type: 'gate' }
  | { type: 'stop' }
  | { type: 'oneway'; dir: Dir }
  | { type: 'score'; key: string };

export interface Cell {
  terrain: 'floor' | 'wall' | 'hole';
  zone: Zone;
  obj: Obj | null;
}

const ZONE_CHARS: Record<string, Zone> = { '.': 0, ',': 1, ':': 2 };
const ONEWAY_CHARS: Record<string, Dir> = { '^': 'up', '>': 'right', v: 'down', '<': 'left' };

export class Stage {
  readonly def: StageDef;
  readonly width: number;
  readonly height: number;
  readonly cells: Cell[];
  readonly start: Vec;
  readonly goal: Vec;

  constructor(def: StageDef) {
    this.def = def;
    this.height = def.terrain.length;
    this.width = Math.max(...def.terrain.map((r) => r.length));
    if (def.objects.length !== this.height) throw new Error(`${def.name}: objects の行数が terrain と違う`);

    this.cells = [];
    let start: Vec | null = null;
    let goal: Vec | null = null;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const t = def.terrain[y][x] ?? ' ';
        const o = def.objects[y][x] ?? ' ';
        const cell: Cell =
          t === '#'
            ? { terrain: 'wall', zone: 0, obj: null }
            : t in ZONE_CHARS
              ? { terrain: 'floor', zone: ZONE_CHARS[t], obj: null }
              : { terrain: 'hole', zone: 0, obj: null };

        if (o === 'S') cell.obj = { type: 'start' };
        else if (o === 'G') cell.obj = { type: 'goal' };
        else if (o === 'B') cell.obj = { type: 'gate' };
        else if (o === 'P') cell.obj = { type: 'stop' };
        else if (o in ONEWAY_CHARS) cell.obj = { type: 'oneway', dir: ONEWAY_CHARS[o] };
        else if (/[a-z]/.test(o)) {
          if (!def.scores[o]) throw new Error(`${def.name}: 得点マス '${o}' が scores にない`);
          cell.obj = { type: 'score', key: o };
        }

        if (cell.obj && cell.terrain !== 'floor') throw new Error(`${def.name}: (${x},${y}) の '${o}' が床の上にない`);
        if (cell.obj?.type === 'start') start = { x, y };
        if (cell.obj?.type === 'goal') goal = { x, y };
        this.cells.push(cell);
      }
    }
    if (!start || !goal) throw new Error(`${def.name}: S と G が必要`);
    this.start = start;
    this.goal = goal;
  }

  /** 範囲外は null（壁として扱う） */
  cell(x: number, y: number): Cell | null {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    return this.cells[y * this.width + x];
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }
}
