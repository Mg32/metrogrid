import type { Dir, Vec, Zone } from './types.ts';

/**
 * ステージ定義。terrain と objects（と floors）は同じ大きさの文字グリッド。
 *
 * terrain:  '#' 壁  ' ' 景色の欠けた場所（踏むとミス）
 *           '.' 安全  ',' 危険  ':' 高危険
 *           '~' 水の中（危険）  '=' 水の中（高危険。流れの速い所）  ※歩いて入れる浅い用水路
 * objects:  terrain の上に重ねる。下記以外の文字は無視する。
 *   床の上   'S' スタート  'G' ゴール  'B' 小節ゲート  'P' 停止マス
 *            '^' '>' 'v' '<' 一方通行（その向きに進むときだけ入れる）
 *            'a'〜'z' 得点マス（scores で値を定義）
 *            '1'〜'9' ステージの入口（ハブだけ。portals で行き先を定義）
 *            '_' 橋（見た目だけ。用水路にかかる板）  '=' 線路（見た目だけ）
 *   壁の上   小物（通れない。区画の代わりに描く）
 *            'H' 玄関  'E' ほかの家の入口  'K' 門柱  'M' 郵便受け  'L' 街灯  'T' 空き地（遊具の柱が立つ）
 *            'V' 縁側  'Y' 隣家の塀  'O' 石灯籠  'Q' 植木
 *            'Z' 商店（シャッター）  'U' 電柱  'J' 下駄箱  'N' 窓
 *            'X' テレビのアンテナ  'F' 物干し  'C' 煙突  'D' 流し台  'A' 襖
 * floors:   床の見た目（省略すると景色の既定）。'l' 路地  'g' 庭  'w' 板の間  'c' 土間  't' 畳  's' 石畳  'a' アスファルト
 *           'r' 瓦屋根
 */
export interface StageDef {
  name: string;
  /**
   * ステージの種類。stage は通常のステージ、tutorial は最初に遊ぶ練習、hub は家の中（ステージの入口が並ぶ拠点）。
   * hub には時間制限とゴールがなく、入口のマスに入るとそのステージへ行く
   */
  kind?: 'stage' | 'tutorial' | 'hub';
  /** 景色。道の色や小物の描き方が変わる（既定は alley） */
  theme?: Theme;
  bpm: number;
  bars: number;
  terrain: string[];
  objects: string[];
  floors?: string[];
  /** pick を指定すると、その文字のマスの中からプレイごとに pick 個だけ選んで出す（丸暗記対策） */
  scores: Record<string, { value: number; decay: number; pick?: number }>;
  hazards: HazardDef[];
  /** 地面に浮かぶ案内（プレイヤーが近づくと出る）。英大文字・数字・記号のみ */
  hints?: { x: number; y: number; text: string }[];
  /** ハブの入口：objects の数字 → 行き先のステージ名 */
  portals?: Record<string, string>;
}

export type Theme = 'alley' | 'garden' | 'house' | 'street' | 'roof';
export type FloorStyle = 'alley' | 'garden' | 'wood' | 'tataki' | 'tatami' | 'cobble' | 'asphalt' | 'roof';

const FLOOR_CHARS: Record<string, FloorStyle> = {
  l: 'alley',
  g: 'garden',
  w: 'wood',
  c: 'tataki',
  t: 'tatami',
  s: 'cobble',
  a: 'asphalt',
  r: 'roof',
};
const THEME_FLOOR: Record<Theme, FloorStyle> = { alley: 'alley', garden: 'garden', house: 'wood', street: 'asphalt', roof: 'roof' };

export type HazardDef =
  /**
   * 巡回型。waypoints を縦横の直線でつないだ経路を interval tick ごとに1マス進む。loop でなければ往復。
   * length は車両の長さ（マス。先頭と、通ってきた length − 1 マスが危険）。
   * look: 'kaisento' は回旋塔（pivot の柱のまわりを腕が回る）、'tram' は路面電車、'koinobori' は鯉のぼり（length の長さの胴が泳ぐ）として描く
   */
  | {
      type: 'patrol';
      waypoints: [number, number][];
      interval: number;
      loop?: boolean;
      length?: number;
      look?: 'kaisento' | 'tram' | 'koinobori';
      pivot?: [number, number];
    }
  /**
   * 定位置型。period tick の周期のうち [from, to) の間だけ cells が危険になる。
   * look: 'shishiodoshi' は鹿威し（pivot の台から竹筒が cells へ打ち下ろされる）、
   * 'snow' は屋根から滑り落ちる雪（cells の先頭から末尾へ滑り落ちる。pivot があればその屋根の軒から落ちてくる）として描く
   */
  | {
      type: 'periodic';
      cells: [number, number][];
      period: number;
      from: number;
      to: number;
      look?: 'shishiodoshi' | 'snow';
      pivot?: [number, number];
    }
  /** 流されていく物。cells（上流 → 下流、縦横に連続）を every tick ごとに1つ、interval tick で1マスずつ流れる */
  | { type: 'flow'; cells: [number, number][]; interval: number; every: number }
  /**
   * 箱ブランコ。cells（axis 方向に一直線）の上を、座席が period tick で1往復する。
   * 振れ幅 reach（マス）が cells より広いと、振り切ったときは壁の上に出て、どのマスも危険でなくなる。
   * look: 'pendulum' は柱時計の振り子（闇に浮かぶ時計から長い竿が下りている）、
   * 'fan' は扇風機の首振り（pivot の台に立つ扇風機が首を振り、頭が cells の上を往復する）として描く
   */
  | {
      type: 'swing';
      cells: [number, number][];
      axis: 'x' | 'y';
      period: number;
      reach?: number;
      look?: 'pendulum' | 'fan';
      pivot?: [number, number];
    };

export type PropKind =
  | 'entrance'
  | 'door'
  | 'pillar'
  | 'mailbox'
  | 'lamp'
  | 'lot'
  | 'engawa'
  | 'fence'
  | 'lantern'
  | 'shrub'
  | 'shop'
  | 'pole'
  | 'getabako'
  | 'window'
  | 'antenna'
  | 'laundry'
  | 'chimney'
  | 'sink'
  | 'fusuma';

export type Obj =
  | { type: 'start' }
  | { type: 'goal' }
  | { type: 'gate' }
  | { type: 'stop' }
  | { type: 'oneway'; dir: Dir }
  | { type: 'score'; key: string }
  | { type: 'portal'; stage: string }
  | { type: 'bridge' }
  | { type: 'rail' }
  | { type: 'prop'; kind: PropKind };

export interface Cell {
  terrain: 'floor' | 'wall' | 'hole';
  zone: Zone;
  /** 用水路の水の中（見た目。ゾーンとしての扱いは zone のとおり） */
  water: boolean;
  /** 床の見た目 */
  floor: FloorStyle;
  obj: Obj | null;
}

const ZONE_CHARS: Record<string, Zone> = { '.': 0, ',': 1, ':': 2, '~': 1, '=': 2 };
const ONEWAY_CHARS: Record<string, Dir> = { '^': 'up', '>': 'right', v: 'down', '<': 'left' };
const PROP_CHARS: Record<string, PropKind> = {
  H: 'entrance',
  E: 'door',
  K: 'pillar',
  M: 'mailbox',
  L: 'lamp',
  T: 'lot',
  V: 'engawa',
  Y: 'fence',
  O: 'lantern',
  Q: 'shrub',
  Z: 'shop',
  U: 'pole',
  J: 'getabako',
  N: 'window',
  X: 'antenna',
  F: 'laundry',
  C: 'chimney',
  D: 'sink',
  A: 'fusuma',
};

export class Stage {
  readonly def: StageDef;
  readonly kind: 'stage' | 'tutorial' | 'hub';
  readonly width: number;
  readonly height: number;
  readonly cells: Cell[];
  readonly start: Vec;
  /** ハブにはゴールがないので、スタートと同じマスにしておく（ゴールとしては働かない） */
  readonly goal: Vec;

  constructor(def: StageDef) {
    this.def = def;
    this.kind = def.kind ?? 'stage';
    this.height = def.terrain.length;
    this.width = Math.max(...def.terrain.map((r) => r.length));
    if (def.objects.length !== this.height) throw new Error(`${def.name}: objects の行数が terrain と違う`);
    if (def.floors && def.floors.length !== this.height) throw new Error(`${def.name}: floors の行数が terrain と違う`);
    const defaultFloor = THEME_FLOOR[def.theme ?? 'alley'];

    this.cells = [];
    let start: Vec | null = null;
    let goal: Vec | null = null;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const t = def.terrain[y][x] ?? ' ';
        const o = def.objects[y][x] ?? ' ';
        const water = t === '~' || t === '=';
        const floor = FLOOR_CHARS[def.floors?.[y][x] ?? ''] ?? defaultFloor;
        const cell: Cell =
          t === '#'
            ? { terrain: 'wall', zone: 0, water, floor, obj: null }
            : t in ZONE_CHARS
              ? { terrain: 'floor', zone: ZONE_CHARS[t], water, floor, obj: null }
              : { terrain: 'hole', zone: 0, water, floor, obj: null };

        if (o === 'S') cell.obj = { type: 'start' };
        else if (o === 'G') cell.obj = { type: 'goal' };
        else if (o === '_') cell.obj = { type: 'bridge' };
        else if (o === '=') cell.obj = { type: 'rail' };
        else if (o === 'B') cell.obj = { type: 'gate' };
        else if (o === 'P') cell.obj = { type: 'stop' };
        else if (o in ONEWAY_CHARS) cell.obj = { type: 'oneway', dir: ONEWAY_CHARS[o] };
        else if (/[1-9]/.test(o)) {
          const target = def.portals?.[o];
          if (!target) throw new Error(`${def.name}: 入口 '${o}' の行き先が portals にない`);
          cell.obj = { type: 'portal', stage: target };
        } else if (/[a-z]/.test(o)) {
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
    if (!start) throw new Error(`${def.name}: S が必要`);
    if (!goal && this.kind !== 'hub') throw new Error(`${def.name}: G が必要`);
    this.start = start;
    this.goal = goal ?? start;
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
