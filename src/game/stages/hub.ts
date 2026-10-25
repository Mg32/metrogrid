import type { StageDef } from '../stage.ts';
import type { Vec } from '../types.ts';

/**
 * 拠点（ハブ）：家の中。闇の中に、玄関の内側（土間と板の間）だけが浮かんでいる（企画書 第2.3節・第4.3節）。
 * 入口のマスに入るとそのステージへ行く。ステージをクリアするたびに、家の中の通路が増えて次の入口が現れる。
 *   STAGE1（玄関の戸 → 家の前の路地）は最初から
 *   STAGE1 をクリア → 廊下と縁側が現れ、縁側のガラス戸から STAGE2（庭と用水路）へ
 *   STAGE2 をクリア → 居間が現れ、居間の窓から STAGE3（時代の重なった通り）へ
 *   STAGE3 をクリア → 玄関の脇に台所が現れ、勝手口から STAGE4（裏手の屋根の連なり）へ
 *   STAGE4 をクリア → 廊下の奥に和室が現れ、その奥の襖から STAGE5（家に近い場所）へ
 *   STAGE5 をクリア → 玄関の板の間の脇に、二階への階段が現れる（第2.3節）。上り口に入ると「本当に二階へ昇る？」と確かめて
 *   エンディングへ（main.ts）。二階は最後まで閉じている
 * どのクリアでどの部屋が開くかは企画書では未定（第2.4節 TODO「拠点の部屋の開き方」）。ここでは入口の部屋の並び（第4.4節）のとおり仮に決めた。
 * 家は最初から傷んでいて、通路が増えても新品には戻らない。時間制限はなく、危険物もない。
 */
/** 二階への階段の行き先（ステージではない。入るとエンディングの確認になる） */
export const UPSTAIRS = 'UPSTAIRS';

export function buildHub(cleared: ReadonlySet<string>): StageDef {
  const W = 15;
  const H = 17;
  const T = Array.from({ length: H }, () => Array(W).fill('#'));
  const O = Array.from({ length: H }, () => Array(W).fill(' '));
  const F = Array.from({ length: H }, () => Array(W).fill(' '));
  const floor = (x0: number, y0: number, x1: number, y1: number, style: string) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        T[y][x] = '.';
        F[y][x] = style;
      }
    }
  };

  // 玄関：土間と、上がり框の先の板の間。玄関の戸（手前）が STAGE1 の入口
  floor(5, 12, 7, 14, 'c');
  floor(4, 9, 8, 11, 'w');
  O[10][6] = 'S';
  O[14][6] = '1';
  O[12][4] = 'J'; // 下駄箱
  O[13][4] = 'J';
  // 廊下と縁側。縁側の突き当たりのガラス戸が STAGE2 の入口
  if (cleared.has('STAGE1')) {
    floor(6, 4, 6, 8, 'w');
    floor(6, 3, 11, 3, 'w');
    O[3][12] = '2';
    T[3][12] = '.';
    F[3][12] = 'w';
    for (let x = 7; x <= 11; x++) O[2][x] = 'V'; // 縁側の奥の障子
  }
  // 居間：廊下の脇の畳の部屋。窓が STAGE3 の入口
  if (cleared.has('STAGE2')) {
    floor(5, 6, 5, 6, 'w');
    floor(2, 5, 4, 7, 't');
    O[4][3] = '3';
    T[4][3] = '.';
    F[4][3] = 't';
  }
  // 台所：玄関の板の間の脇。板の間と、流しの前の土間。土間の突き当たりの勝手口が STAGE4 の入口
  if (cleared.has('STAGE3')) {
    floor(9, 9, 10, 11, 'w');
    floor(11, 9, 12, 11, 'c');
    O[8][10] = 'D'; // 流し台
    O[8][11] = 'D';
    O[10][13] = '4';
    T[10][13] = '.';
    F[10][13] = 'c';
  }
  // 奥の和室：廊下の脇の畳の部屋。奥の襖が STAGE5 の入口
  if (cleared.has('STAGE4')) {
    floor(7, 6, 7, 6, 'w');
    floor(8, 5, 10, 7, 't');
    O[6][11] = '5';
    T[6][11] = '.';
    F[6][11] = 't';
  }

  // 二階への階段：上り口のマス（入口と同じ扱い。行き先は UPSTAIRS）
  if (cleared.has('STAGE5')) {
    T[10][3] = '.';
    F[10][3] = 'w';
    O[10][3] = '6';
  }

  return {
    name: 'HUB',
    kind: 'hub',
    theme: 'house',
    bpm: 100,
    // 時間制限はない（実質的に終わらない長さ）
    bars: 100000,
    terrain: T.map((r) => r.join('')),
    objects: O.map((r) => r.join('')),
    floors: F.map((r) => r.join('')),
    scores: {},
    hazards: [],
    portals: { '1': 'STAGE1', '2': 'STAGE2', '3': 'STAGE3', '4': 'STAGE4', '5': 'STAGE5', '6': UPSTAIRS },
  };
}

/** ステージから戻ったときに立つマス：そのステージの入口の隣の床（入口でないマス） */
export function hubReturnCell(def: StageDef, stageName: string): Vec | null {
  const key = Object.entries(def.portals ?? {}).find(([, name]) => name === stageName)?.[0];
  if (!key) return null;
  for (let y = 0; y < def.objects.length; y++) {
    const x = def.objects[y].indexOf(key);
    if (x < 0) continue;
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      const t = def.terrain[y + dy]?.[x + dx];
      const o = def.objects[y + dy]?.[x + dx];
      if (t === '.' && !/[1-9]/.test(o ?? '')) return { x: x + dx, y: y + dy };
    }
  }
  return null;
}
