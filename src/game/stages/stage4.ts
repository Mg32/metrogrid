import type { StageDef } from '../stage.ts';

/**
 * STAGE 4 ｜ 入口：台所の勝手口 ｜ 景色：裏手の屋根の連なり（企画書 第4.4節。入口・景色・危険物の割り当ては仮）
 *
 * 台所の勝手口（画面の下）から屋根へ出ると、瓦屋根の棟が折り返しながら斜め左上へ連なっていく。登りきった先に扉が一枚だけ立っている（ゴール）。
 * 屋根と屋根の間は物干し台の板でつながり、テレビのアンテナ、煙突、物干しが闇に浮かぶ。
 * - 棟は11段。各段の下の行（棟の上の歩み板）は安全な道で、危険物も欠けもない（慣れていなくても、ここを歩けば戻されない）。
 * - 上の行（瓦の斜面）は速い道（中間は八分、ゴール周辺は十六分）。竿から外れた色あせた鯉のぼりが、3マス分の胴で斜面を往復して泳ぐ
 *   （第5.3節「色あせた鯉のぼり」。巡回型）。同じ向きに歩けば追いつかれず、鉢合わせたら下の行へよければよい。
 * - 段の間には一方通行の近道（上の屋根の斜面）がある。上の屋根から雪が滑り落ちてくる所がある（第5.3節「屋根から滑り落ちる雪」。定位置型）。
 *   ゴール周辺では上の屋根の軒から速い道へも雪が落ちてくる。落ちる1拍前に点滅して知らせる。
 * - 瓦の抜けた所（欠け）がある。
 * - 危険物の割り当て（鯉のぼり、雪）は企画書の候補から選んだ仮のもの。
 * - 得点マスは文字ごとに4つの候補から2つずつ、プレイのたびに選ばれる（第2.2節の丸暗記対策）。
 *
 * この地図は tools/stagegen/stage4.ts で組み立てて書き出したもの。調整はスクリプト側で行い --write で書き出し直すか、
 * ここを手で直す（その場合スクリプトとずれる）。npm test が整合性と通れるかを、npm run bots がバランスを確かめる。
 */
// prettier-ignore
export const stage4: StageDef = {
  name: 'STAGE4',
  theme: 'roof',
  bpm: 120,
  bars: 64,
  terrain: [
    '####################################################',
    '###############.###########.######.########.########',
    '###############.###########.######.########.########',
    '######......##......##......##......##......##..####',
    '######..##..##..##..##..##..##..##..##..##..##..####',
    '######:.##:.##:.##:.##,.##,.##,.##,.##..##..##....##',
    '######:.## .##:.## .##,.##,.##,.##,.##..##..##..####',
    '######:.##:.##:.##:.##,.##,.## .##,.##..##..##..####',
    '######:.:::.##:.##:.##,.##,.##,.##,.##..##..##..####',
    '###### .##:.##:.##:.## .##,.##,.##,.,,..##..##..####',
    '######:.##:.##:.##:.##,.,,,.##,.##,.##..##..##..####',
    '######:.##:.##:.##:.##,.##,.##,.##,.##..##..,,..####',
    '######:.##:.##:.## .##,.##,.##,.##,.##..##..##..####',
    '######:.##:.##:.:::.##,.##,.##,.##,.##..##..##..####',
    '######:.## .##:.##:.##,.##,.##,.##,.##..##..##..####',
    '###### .##:.##:.##:.##,.##,.## .##,.##..##..##..####',
    '######:.##:.##:.##:.##,.##,.##,.##,.##..##..##..####',
    '######:.##:.##:.##:.##,.##,.##,.##,.##..##..##..####',
    '##  ##..##..##..##..##..##..##..##..##..##..##..####',
    '# ......##......##......##......##......##......####',
    '##  ######################.############.############',
    '####################################################',
    '####################################################',
  ],
  objects: [
    '               C           F      X        F        ',
    '                           a      a        a        ',
    '                                                    ',
    '                                                    ',
    '                                     L          LE  ',
    '                 X           F               X   S  ',
    '      d               c  X       C                  ',
    '                                         F          ',
    '        d<                        b                 ',
    '                                    b<              ',
    '              d         c<                          ',
    '                                            b<      ',
    '         X           C    c                         ',
    '                d<            b      X              ',
    '                             X           X          ',
    '             F           L       X           C      ',
    '                                                    ',
    '                                                    ',
    '                                                    ',
    '  G                                                 ',
    '                          c            a            ',
    '                          L            X            ',
    '                                                    ',
  ],
  floors: [
    'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
    'rrrrrrrrrrrrrrrwrrrrrrrrrrrwrrrrrrwrrrrrrrrwrrrrrrrr',
    'rrrrrrrrrrrrrrrwrrrrrrrrrrrwrrrrrrwrrrrrrrrwrrrrrrrr',
    'rrrrrrrrwwrrrrrrwwrrrrrrwwrrrrrrwwrrrrrrwwrrrrrrrrrr',
    'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
    'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrwwrr',
    'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
    'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
    'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
    'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
    'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
    'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
    'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
    'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
    'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
    'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
    'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
    'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
    'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
    'rrwwwwrrrrrrwwrrrrrrwwrrrrrrwwrrrrrrwwrrrrrrwwrrrrrr',
    'rrrrrrrrrrrrrrrrrrrrrrrrrrwrrrrrrrrrrrrwrrrrrrrrrrrr',
    'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
    'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
  ],
  scores: {
    a: { value: 150, decay: 1, pick: 2 },
    b: { value: 300, decay: 2, pick: 2 },
    c: { value: 500, decay: 3, pick: 2 },
    d: { value: 800, decay: 5, pick: 2 },
  },
  hazards: [
    {type: 'patrol', look: 'koinobori', length: 3, interval: 2, waypoints: [[34, 5], [34, 17]]},
    {type: 'patrol', look: 'koinobori', length: 3, interval: 2, waypoints: [[26, 5], [26, 17]]},
    {type: 'patrol', look: 'koinobori', length: 3, interval: 1, waypoints: [[14, 8], [14, 13]]},
    {type: 'periodic', look: 'snow', cells: [[18, 9]], period: 26, from: 0, to: 4, pivot: [17, 9]},
    {type: 'periodic', look: 'snow', cells: [[10, 11]], period: 22, from: 0, to: 4, pivot: [9, 11]},
    {type: 'periodic', look: 'snow', cells: [[6, 12]], period: 26, from: 0, to: 4, pivot: [5, 12]},
    {type: 'periodic', look: 'snow', cells: [[36, 9], [37, 9]], period: 22, from: 0, to: 6},
    {type: 'periodic', look: 'snow', cells: [[24, 10], [25, 10]], period: 26, from: 0, to: 6},
    {type: 'periodic', look: 'snow', cells: [[16, 13], [17, 13]], period: 18, from: 0, to: 6},
    {type: 'periodic', look: 'snow', cells: [[8, 8], [9, 8]], period: 18, from: 0, to: 6},
  ],
};
