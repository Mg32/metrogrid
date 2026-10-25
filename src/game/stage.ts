import type { Dir, Vec, Zone } from './types.ts';

/**
 * ステージ定義。terrain と objects は同じ大きさの文字グリッド。
 *
 * terrain:  '#' 壁  ' ' 景色の欠けた場所（踏むとミス）
 *           '.' 安全  ',' 危険  ':' 高危険
 * objects:  terrain の上に重ねる。下記以外の文字は無視する。
 *   床の上   'S' スタート  'G' ゴール  'B' 小節ゲート  'P' 停止マス
 *            '^' '>' 'v' '<' 一方通行（その向きに進むときだけ入れる）
 *            'a'〜'z' 得点マス（scores で値を定義）
 *   壁の上   小物（通れない。区画の代わりに描く）
 *            'H' 玄関  'E' ほかの家の入口  'K' 門柱  'M' 郵便受け  'L' 街灯  'T' 空き地（遊具の柱が立つ）
 */
export interface StageDef {
  name: string;
  bpm: number;
  bars: number;
  terrain: string[];
  objects: string[];
  /** pick を指定すると、その文字のマスの中からプレイごとに pick 個だけ選んで出す（丸暗記対策） */
  scores: Record<string, { value: number; decay: number; pick?: number }>;
  hazards: HazardDef[];
}

export type HazardDef =
  /**
   * 巡回型。waypoints を縦横の直線でつないだ経路を interval tick ごとに1マス進む。loop でなければ往復。
   * look: 'kaisento' は回旋塔（pivot の柱のまわりを腕が回る）として描く
   */
  | {
      type: 'patrol';
      waypoints: [number, number][];
      interval: number;
      loop?: boolean;
      look?: 'kaisento';
      pivot?: [number, number];
    }
  /** 定位置型。period tick の周期のうち [from, to) の間だけ cells が危険になる */
  | { type: 'periodic'; cells: [number, number][]; period: number; from: number; to: number }
  /**
   * 箱ブランコ。cells（axis 方向に一直線）の上を、座席が period tick で1往復する。
   * 振れ幅 reach（マス）が cells より広いと、振り切ったときは壁の上に出て、どのマスも危険でなくなる
   */
  | { type: 'swing'; cells: [number, number][]; axis: 'x' | 'y'; period: number; reach?: number };

export type PropKind = 'entrance' | 'door' | 'pillar' | 'mailbox' | 'lamp' | 'lot';

export type Obj =
  | { type: 'start' }
  | { type: 'goal' }
  | { type: 'gate' }
  | { type: 'stop' }
  | { type: 'oneway'; dir: Dir }
  | { type: 'score'; key: string }
  | { type: 'prop'; kind: PropKind };

export interface Cell {
  terrain: 'floor' | 'wall' | 'hole';
  zone: Zone;
  obj: Obj | null;
}

const ZONE_CHARS: Record<string, Zone> = { '.': 0, ',': 1, ':': 2 };
const ONEWAY_CHARS: Record<string, Dir> = { '^': 'up', '>': 'right', v: 'down', '<': 'left' };
const PROP_CHARS: Record<string, PropKind> = { H: 'entrance', E: 'door', K: 'pillar', M: 'mailbox', L: 'lamp', T: 'lot' };

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
        } else if (o in PROP_CHARS) cell.obj = { type: 'prop', kind: PROP_CHARS[o] };

        if (cell.obj?.type === 'prop') {
          if (cell.terrain !== 'wall') throw new Error(`${def.name}: (${x},${y}) の小物 '${o}' が壁の上にない`);
        } else if (cell.obj && cell.terrain !== 'floor') {
          throw new Error(`${def.name}: (${x},${y}) の '${o}' が床の上にない`);
        }
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
