// ステージ生成スクリプトの共通部品（STAGE 1〜5）。
// 地図は「作業座標」（x＝横、y＝進む向き。y が大きいほどスタート側）で組み立て、最後にゲームのグリッドへ書き出す。
// 作業座標の組み立て方は、企画のときに作ったマス目の定義（2026-10-31）にそろえてある。
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { Stage, STEP_UNITS, type HazardDef, type StageDef, type Theme, type ThingKind } from '../../src/game/stage.ts';
import { distanceField } from '../bots/nav.ts';

export type P = [number, number];
/** マスの速さ：'.' 安全、',' 八分、':' 十六分、'o' 欠け・深み（踏むとミス） */
export type Kind = '.' | ',' | ':' | 'o';

interface Floor {
  k: Kind;
  /** 高さ（段。小数でもよい。書き出すときに 1/4 段に丸める） */
  h: number;
}

const key = (x: number, y: number) => `${x},${y}`;
const unkey = (s: string): P => s.split(',').map(Number) as P;

export class Layout {
  readonly W: number;
  /** 区間を差し込むと伸びる（remapY のあとで設定し直す） */
  H: number;
  readonly floor = new Map<string, Floor>();
  /** 床の上の物：'S' 'G' 'P' 'B' '^' '>' 'v' '<'、'*' 得点（書き出すときに文字を割り当てる）、'_' 橋、'=' 線路 */
  readonly obj = new Map<string, string>();
  readonly water = new Set<string>();
  readonly climb = new Map<string, 'h' | 'g' | 's'>();
  /** 歩けない面（見た目）：種類と高さ（段） */
  readonly scenery = new Map<string, { kind: string; h: number }>();
  readonly things: [number, number, ThingKind][] = [];
  readonly hazards: HazardDef[] = [];
  /** 得点の区分け：'*' の位置 → 区分けの名前（scores の文字ごと） */
  readonly scoreGroup = new Map<string, string>();

  constructor(W: number, H: number) {
    this.W = W;
    this.H = H;
  }

  /** p から q までの長方形（両端を含む）を k にする */
  seg(p: P, q: P, k: Kind, h = 0): void {
    for (let x = Math.min(p[0], q[0]); x <= Math.max(p[0], q[0]); x++) {
      for (let y = Math.min(p[1], q[1]); y <= Math.max(p[1], q[1]); y++) this.floor.set(key(x, y), { k, h });
    }
  }
  path(pts: P[], k: Kind, h = 0): void {
    for (let i = 0; i + 1 < pts.length; i++) this.seg(pts[i], pts[i + 1], k, h);
  }
  rect(x0: number, y0: number, x1: number, y1: number, k: Kind, h = 0): void {
    this.seg([x0, y0], [x1, y1], k, h);
  }
  /** 高さが連続して変わる一筋（斜面・雨どい・はしご）。climb を渡すとそのマスから上れる */
  ramp(pts: P[], h0: number, h1: number, k: Kind, climb?: 'h' | 'g' | 's'): P[] {
    const cells: P[] = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const sx = Math.sign(x1 - x0);
      const sy = Math.sign(y1 - y0);
      for (let x = x0, y = y0; ; x += sx, y += sy) {
        if (!cells.some(([cx, cy]) => cx === x && cy === y)) cells.push([x, y]);
        if (x === x1 && y === y1) break;
      }
    }
    cells.forEach(([x, y], i) => {
      this.floor.set(key(x, y), { k, h: h0 + ((h1 - h0) * i) / Math.max(1, cells.length - 1) });
      if (climb) this.climb.set(key(x, y), climb);
    });
    return cells;
  }
  remove(x: number, y: number): void {
    this.floor.delete(key(x, y));
    this.obj.delete(key(x, y));
    this.climb.delete(key(x, y));
  }
  hole(...ps: P[]): void {
    for (const [x, y] of ps) this.floor.set(key(x, y), { k: 'o', h: this.at(x, y)?.h ?? 0 });
  }
  at(x: number, y: number): Floor | undefined {
    return this.floor.get(key(x, y));
  }
  has(x: number, y: number): boolean {
    return this.floor.has(key(x, y));
  }
  put(ch: string, ...ps: P[]): void {
    for (const [x, y] of ps) this.obj.set(key(x, y), ch);
  }
  /** 得点の候補。group ごとに scores の1文字になる */
  score(group: string, ...ps: P[]): void {
    for (const [x, y] of ps) {
      this.obj.set(key(x, y), '*');
      this.scoreGroup.set(key(x, y), group);
    }
  }
  waterRect(x0: number, y0: number, x1: number, y1: number): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.water.add(key(x, y));
  }
  /** 歩けない面。すでに道のマスには置かない */
  sceneryRect(x0: number, y0: number, x1: number, y1: number, kind: string, h = 0): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!this.has(x, y)) this.scenery.set(key(x, y), { kind, h });
  }
  /** 闇に浮かぶ物。道のマスに重なるものは書き出すときに検査で落とす */
  thing(kind: ThingKind, ...ps: P[]): void {
    for (const [x, y] of ps) this.things.push([x, y, kind]);
  }
  hazard(h: HazardDef): void {
    this.hazards.push(h);
  }
  /** 作業座標の y をずらす（区間の間を空ける、区間を差し込む）。危険物はずらしたあとで置く */
  remapY(f: (y: number) => number): void {
    const re = <V>(m: Map<string, V>) => {
      const entries = [...m].map(([k, v]) => {
        const [x, y] = unkey(k);
        return [key(x, f(y)), v] as [string, V];
      });
      m.clear();
      for (const [k, v] of entries) m.set(k, v);
    };
    re(this.floor);
    re(this.obj);
    re(this.climb);
    re(this.scenery);
    re(this.scoreGroup);
    const w = [...this.water].map((k) => {
      const [x, y] = unkey(k);
      return key(x, f(y));
    });
    this.water.clear();
    for (const k of w) this.water.add(k);
    for (const t of this.things) t[1] = f(t[1]);
    if (this.hazards.length) throw new Error('危険物は remapY のあとで置く');
  }
  /** 道のマスから r マス以内にない面を消す（歩かない面を大きく塗りつぶさない。企画書 第4.1節） */
  trimScenery(r: number, keep: (kind: string) => boolean = () => false): void {
    for (const [k, s] of this.scenery) {
      if (keep(s.kind)) continue;
      const [x, y] = unkey(k);
      let near = false;
      for (let dy = -r; dy <= r && !near; dy++) for (let dx = -r; dx <= r && !near; dx++) near = this.has(x + dx, y + dy);
      if (!near) this.scenery.delete(k);
    }
  }

  /** 床のマスの一覧 */
  cells(): [P, Floor][] {
    return [...this.floor].map(([k, f]) => [unkey(k), f]);
  }
}

export interface BuildOptions {
  name: string;
  theme: Theme;
  bpm: number;
  bars: number;
  /** 作業座標の x と y を入れ替えて書き出す（STAGE 2：画面の左上へ登る向きにする） */
  transpose?: boolean;
  /** 得点の区分けごとの値（区分けの名前 → 値・減り方・候補から出す数） */
  scores: Record<string, { value: number; decay: number; pick?: number }>;
  /** 床の見た目（FloorStyle の1文字）。作業座標で */
  floorOf: (x: number, y: number) => string;
  /** 場面の置き分けの文字。作業座標で */
  tintOf: (x: number, y: number) => string;
}

/** 作業座標 → ゲームのグリッド。外周の壁のために1マスずつずらす */
export function toGrid(p: P, transpose = false): P {
  return transpose ? [p[1] + 1, p[0] + 1] : [p[0] + 1, p[1] + 1];
}

function mapHazard(h: HazardDef, tr: (p: P) => P, transpose: boolean): HazardDef {
  switch (h.type) {
    case 'patrol':
      return { ...h, waypoints: h.waypoints.map(tr), ...(h.pivot ? { pivot: tr(h.pivot) } : {}) };
    case 'periodic':
      return { ...h, cells: h.cells.map(tr), ...(h.pivot ? { pivot: tr(h.pivot) } : {}) };
    case 'flow':
      return { ...h, cells: h.cells.map(tr) };
    case 'swing': {
      const axis = h.axis && transpose ? (h.axis === 'x' ? 'y' : 'x') : h.axis;
      const cells = h.cells.map(tr).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      return { ...h, ...(axis ? { axis } : {}), cells, ...(h.pivot ? { pivot: tr(h.pivot) } : {}) };
    }
  }
}

const unitChar = (h: number) => Math.max(0, Math.min(35, Math.round(h * STEP_UNITS))).toString(36);

export function build(L: Layout, o: BuildOptions): StageDef {
  const tr = (p: P) => toGrid(p, o.transpose);
  const [GW, GH] = o.transpose ? [L.H + 2, L.W + 2] : [L.W + 2, L.H + 2];
  const grid = (fill: string) => Array.from({ length: GH }, () => Array<string>(GW).fill(fill));
  const T = grid('#');
  const O = grid(' ');
  const F = grid(' ');
  const Hh = grid('0');
  const C = grid(' ');
  const N = grid(' ');
  const S = grid(' ');
  let anyHeight = false;

  const letters = Object.keys(o.scores);
  for (const [[x, y], f] of L.cells()) {
    const [gx, gy] = tr([x, y]);
    const water = L.water.has(key(x, y));
    T[gy][gx] = f.k === 'o' ? ' ' : water ? (f.k === ':' ? '=' : '~') : f.k;
    if (water && f.k === '.') T[gy][gx] = '.';
    F[gy][gx] = o.floorOf(x, y);
    N[gy][gx] = o.tintOf(x, y);
    Hh[gy][gx] = unitChar(f.h);
    if (f.h !== 0) anyHeight = true;
    const c = L.climb.get(key(x, y));
    if (c) C[gy][gx] = c;
    const ob = L.obj.get(key(x, y));
    if (ob === '*') {
      const g = L.scoreGroup.get(key(x, y))!;
      const i = letters.indexOf(g);
      if (i < 0) throw new Error(`${o.name}: 得点の区分け '${g}' が scores にない`);
      O[gy][gx] = String.fromCharCode(97 + i);
    } else if (ob) O[gy][gx] = ob;
  }
  // 水の中でも、安全な道（橋や浅瀬）はふつうの床。水面だけ（歩けない）は景色として描く
  for (const k of L.water) {
    const [x, y] = unkey(k);
    if (L.has(x, y)) continue;
    const [gx, gy] = tr([x, y]);
    S[gy][gx] = 'w';
    N[gy][gx] = o.tintOf(x, y);
  }
  for (const [k, s] of L.scenery) {
    const [x, y] = unkey(k);
    if (L.has(x, y)) continue;
    const [gx, gy] = tr([x, y]);
    S[gy][gx] = s.kind;
    F[gy][gx] = o.floorOf(x, y);
    Hh[gy][gx] = unitChar(s.h);
    N[gy][gx] = o.tintOf(x, y);
    if (s.h !== 0) anyHeight = true;
  }
  const dropped: string[] = [];
  const things: [number, number, ThingKind][] = [];
  for (const [x, y, kind] of L.things) {
    const [gx, gy] = tr([x, y]);
    if (L.has(x, y) || gx <= 0 || gy <= 0 || gx >= GW - 1 || gy >= GH - 1) {
      dropped.push(`${kind}(${x},${y})`);
      continue;
    }
    if (things.some(([tx, ty]) => tx === gx && ty === gy)) {
      dropped.push(`${kind}(${x},${y}) 重なり`);
      continue;
    }
    things.push([gx, gy, kind]);
    // 物の足もとの高さ：面の上ならその高さ、闇の中なら、すぐ隣の道のいちばん高い所にそろえる
    if (!L.scenery.has(key(x, y))) {
      let h = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) h = Math.max(h, L.at(x + dx, y + dy)?.h ?? 0);
      Hh[gy][gx] = unitChar(h);
      if (h !== 0) anyHeight = true;
    }
  }
  if (dropped.length) console.warn(`${o.name}: 道に重なる物を外した: ${dropped.join(' ')}`);

  const scores = Object.fromEntries(letters.map((g, i) => [String.fromCharCode(97 + i), o.scores[g]]));
  const rows = (g: string[][]) => g.map((r) => r.join(''));
  const def: StageDef = {
    name: o.name,
    theme: o.theme,
    bpm: o.bpm,
    bars: o.bars,
    terrain: rows(T),
    objects: rows(O),
    floors: rows(F),
    tints: rows(N),
    scenery: rows(S),
    ...(anyHeight ? { heights: rows(Hh), climbs: rows(C) } : {}),
    things,
    scores,
    hazards: L.hazards.map((h) => mapHazard(h, tr, !!o.transpose)),
  };
  return def;
}

/** 所要時間の目安（拍）を表示する。安全な道だけ／すべての道 */
export function report(def: StageDef): { safe: number; fast: number } {
  const st = new Stage(def);
  const i = st.index(st.start.x, st.start.y);
  const safe = distanceField(st, { safeOnly: true })[i] / 4;
  const fast = distanceField(st)[i] / 4;
  const song = def.bars * 4;
  const pct = (b: number) => `${Math.round(((song - b) / song) * 100)}%`;
  console.log(`${def.name}: 安全な道 ${safe}拍（残り ${pct(safe)}）、最短 ${fast}拍（残り ${pct(fast)}）、曲 ${song}拍`);
  if (process.env.SHOW) console.log(def.terrain.map((r, y) => `${String(y).padStart(3)} ${r}  ${def.objects[y]}`).join('\n'));
  return { safe, fast };
}

/** src/game/stages/<file>.ts に書き出す（--write のときだけ） */
export function write(def: StageDef, file: string, exportName: string, doc: string): void {
  if (!process.argv.includes('--write')) return;
  const OUT = path.resolve(import.meta.dirname, `../../src/game/stages/${file}.ts`);
  const lit = (v: unknown) => JSON.stringify(v).replace(/"(\w+)":/g, '$1: ').replace(/"/g, "'").replace(/,(?=\S)/g, ', ');
  const grid = (name: string, rows: string[] | undefined) =>
    rows ? `  ${name}: [\n${rows.map((r) => `    '${r}',`).join('\n')}\n  ],\n` : '';
  const src = `import type { StageDef } from '../stage.ts';

/**
${doc
  .trim()
  .split('\n')
  .map((l) => ` *${l ? ' ' + l : ''}`)
  .join('\n')}
 *
 * この地図は tools/stagegen/${file}.ts で組み立てて書き出したもの。調整はスクリプト側で行い --write で書き出し直す。
 * npm test が整合性と通れるかを、npm run bots がバランスを確かめる。
 */
// prettier-ignore
export const ${exportName}: StageDef = {
  name: '${def.name}',
  theme: '${def.theme}',
  bpm: ${def.bpm},
  bars: ${def.bars},
${grid('terrain', def.terrain)}${grid('objects', def.objects)}${grid('floors', def.floors)}${grid('tints', def.tints)}${grid('scenery', def.scenery)}${grid('heights', def.heights)}${grid('climbs', def.climbs)}  things: [
${(def.things ?? []).map((t) => `    ${lit(t)},`).join('\n')}
  ],
  scores: {
${Object.entries(def.scores)
  .map(([k, v]) => `    ${k}: ${lit(v)},`)
  .join('\n')}
  },
  hazards: [
${def.hazards.map((h) => `    ${lit(h)},`).join('\n')}
  ],
};
`;
  writeFileSync(OUT, src);
  console.log('wrote', path.relative(process.cwd(), OUT));
}
