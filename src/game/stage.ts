import { DIR_VEC, type Dir, type Vec, type Zone } from './types.ts';

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
 *           'r' 瓦屋根  'd' 土（公園、草地）
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
  hints?: { x: number; y: number; text: string; /** タッチで遊んでいるときの文（キーの話をしているもの） */ touch?: string }[];
  /** ハブの入口：objects の数字 → 行き先のステージ名 */
  portals?: Record<string, string>;
  /**
   * 床の高さ（企画書 第2.4節「床の高さ」。STAGE 4・5）。1文字が 1/4 段で、'0'〜'9' が 0〜9、'a'〜'z' が 10〜35。省略すると全部 0。
   * 同じ高さか2段までの下りは自由に進め、上れるのは climbs のマス（から・へ）1段までだけ
   */
  heights?: string[];
  /** 上れるマス：'h' はしご、'g' 雨どい、's' 這い上がれる雪の斜面（' ' はふつうのマス） */
  climbs?: string[];
  /** 場面の置き分け（時間帯・天気・季節・年月）。道の色合いだけを変える。文字の意味は描画側（TINTS）で決める */
  tints?: string[];
  /** 歩けない面（壁のマスの上に見た目だけ描く）：'w' 水面、'r' 瓦屋根、's' 雪の屋根、'p' 二階の壁、'f' 家具の塊。高さは heights */
  scenery?: string[];
  /** 闇に浮かぶ物（物語の物、人影、区間の小物）。壁のマスに置く。[x, y, 種類] */
  things?: [number, number, ThingKind][];
}

/** 闇に浮かぶ物の種類。絵は描画側（src/render/things.ts）で決める */
export type ThingKind = string;

/** 高さの1文字 → 1/4段の数 */
export function heightUnits(ch: string | undefined): number {
  if (!ch || ch === ' ') return 0;
  const n = parseInt(ch, 36);
  return Number.isNaN(n) ? 0 : n;
}
/** 1段 = 4（heights の単位） */
export const STEP_UNITS = 4;
/** 下りは2段まで、上り（climbs のマスだけ）は1段まで */
const MAX_DROP = 2 * STEP_UNITS;
const MAX_CLIMB = STEP_UNITS;

export type Theme = 'alley' | 'garden' | 'house' | 'street' | 'roof';
export type FloorStyle = 'alley' | 'garden' | 'wood' | 'tataki' | 'tatami' | 'cobble' | 'asphalt' | 'roof' | 'dirt';

const FLOOR_CHARS: Record<string, FloorStyle> = {
  l: 'alley',
  g: 'garden',
  w: 'wood',
  c: 'tataki',
  t: 'tatami',
  s: 'cobble',
  a: 'asphalt',
  r: 'roof',
  d: 'dirt',
};
const THEME_FLOOR: Record<Theme, FloorStyle> = { alley: 'alley', garden: 'garden', house: 'wood', street: 'asphalt', roof: 'roof' };

export type HazardDef =
  /**
   * 巡回型。waypoints を縦横の直線でつないだ経路を interval tick ごとに1マス進む。loop でなければ往復。
   * length は車両の長さ（マス。先頭と、通ってきた length − 1 マスが危険）。
   * look: 'kaisento' は回旋塔（pivot の柱のまわりを腕が回る）、'tram' は路面電車、'koinobori' は鯉のぼり（length の長さの胴が泳ぐ）、
   * 'zarigani' はザリガニ（浸かった道を横切る）として描く
   */
  | {
      type: 'patrol';
      waypoints: [number, number][];
      interval: number;
      loop?: boolean;
      length?: number;
      look?: 'kaisento' | 'tram' | 'koinobori' | 'zarigani';
      pivot?: [number, number];
    }
  /**
   * 定位置型。period tick の周期のうち [from, to) の間だけ cells が危険になる。
   * look: 'shishiodoshi' は鹿威し（pivot の台から竹筒が cells へ打ち下ろされる）、
   * 'snow' は屋根から滑り落ちる雪（cells の先頭から末尾へ滑り落ちる。pivot があればその屋根の軒から落ちてくる）、
   * 'kaki' は熟して落ちる柿の実（pivot の枝から cells へ落ちる）、'barrier' は踏切の遮断機（pivot の柱から cells の上へ棒が下りる）として描く
   */
  | {
      type: 'periodic';
      cells: [number, number][];
      period: number;
      from: number;
      to: number;
      look?: 'shishiodoshi' | 'snow' | 'kaki' | 'barrier';
      pivot?: [number, number];
    }
  /** 流されていく物。cells（上流 → 下流、縦横に連続）を every tick ごとに1つ、interval tick で1マスずつ流れる */
  | { type: 'flow'; cells: [number, number][]; interval: number; every: number }
  /**
   * 箱ブランコ。cells（axis 方向に一直線）の上を、座席が period tick で1往復する。
   * 振れ幅 reach（マス）が cells より広いと、振り切ったときは壁の上に出て、どのマスも危険でなくなる。
   * look: 'pendulum' は柱時計の振り子（闇に浮かぶ時計から長い竿が下りている）、
   * 'fan' は扇風機の首振り（pivot の台に立つ扇風機が首を振り、頭が cells の上を往復する）、
   * 'koinobori' は色あせた鯉のぼり（屋根の高さを、cells に沿って行き来して泳ぐ）、
   * 'tram' はもう走っていない路線の車両（線路を行き来し、振り切ると線路の端から闇へ走り去る）として描く
   */
  | {
      type: 'swing';
      cells: [number, number][];
      axis: 'x' | 'y';
      period: number;
      reach?: number;
      look?: 'pendulum' | 'fan' | 'koinobori' | 'tram';
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
  /** 床の高さ（1/4段単位） */
  height: number;
  /** 上れるマス */
  climb: 'h' | 'g' | 's' | null;
  /** 場面の置き分けの文字（tints。なければ ' '） */
  tint: string;
  /** 歩けない面の見た目（scenery。なければ null） */
  scenery: string | null;
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
    for (const key of ['floors', 'heights', 'climbs', 'tints', 'scenery'] as const) {
      if (def[key] && def[key].length !== this.height) throw new Error(`${def.name}: ${key} の行数が terrain と違う`);
    }
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
        const c = def.climbs?.[y][x];
        const sc = def.scenery?.[y][x];
        const extra = {
          height: heightUnits(def.heights?.[y][x]),
          climb: (c === 'h' || c === 'g' || c === 's' ? c : null) as Cell['climb'],
          tint: def.tints?.[y][x] ?? ' ',
          scenery: sc && sc !== ' ' ? sc : null,
        };
        const cell: Cell =
          t === '#'
            ? { terrain: 'wall', zone: 0, water, floor, obj: null, ...extra }
            : t in ZONE_CHARS
              ? { terrain: 'floor', zone: ZONE_CHARS[t], water, floor, obj: null, ...extra }
              : { terrain: 'hole', zone: 0, water, floor, obj: null, ...extra };

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
    for (const [x, y, kind] of def.things ?? []) {
      if (this.cells[y * this.width + x]?.terrain !== 'wall') throw new Error(`${def.name}: (${x},${y}) の物 '${kind}' が壁の上にない`);
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

  /**
   * 隣のマスへ高さの上で進めるか（企画書 第2.4節「床の高さ」）。壁・ゲート・一方通行は見ない。
   * 同じ高さか2段までの下りは自由。上れるのは、どちらかが climbs のマスで、1段までのとき
   */
  canStep(x: number, y: number, nx: number, ny: number): boolean {
    const a = this.cell(x, y);
    const b = this.cell(nx, ny);
    if (!a || !b) return false;
    const rise = b.height - a.height;
    if (rise > 0) return (a.climb !== null || b.climb !== null) && rise <= MAX_CLIMB;
    return -rise <= MAX_DROP;
  }

  /**
   * スタートで向いている向き：ゴールへの道（危険物・ゲートは見ない最短の道）の1歩目の向き。
   * ハブにはゴールがないので右向き
   */
  startFacing(): Dir {
    if (this.kind === 'hub') return 'right';
    const dirs = Object.keys(DIR_VEC) as Dir[];
    const walkable = (x: number, y: number) => this.cell(x, y)?.terrain === 'floor';
    const dist = new Map<number, number>();
    const queue: Vec[] = [this.goal];
    dist.set(this.index(this.goal.x, this.goal.y), 0);
    for (let i = 0; i < queue.length; i++) {
      const c = queue[i];
      const dc = dist.get(this.index(c.x, c.y))!;
      for (const d of dirs) {
        const nx = c.x + DIR_VEC[d].x;
        const ny = c.y + DIR_VEC[d].y;
        if (!walkable(nx, ny) || dist.has(this.index(nx, ny)) || !this.canStep(nx, ny, c.x, c.y)) continue;
        dist.set(this.index(nx, ny), dc + 1);
        queue.push({ x: nx, y: ny });
      }
    }
    let best: Dir = 'right';
    let bestDist = Infinity;
    for (const d of dirs) {
      const nx = this.start.x + DIR_VEC[d].x;
      const ny = this.start.y + DIR_VEC[d].y;
      if (!walkable(nx, ny) || !this.canStep(this.start.x, this.start.y, nx, ny)) continue;
      const nd = dist.get(this.index(nx, ny)) ?? Infinity;
      if (nd < bestDist) {
        best = d;
        bestDist = nd;
      }
    }
    return best;
  }
}
