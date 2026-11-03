/**
 * 画面に出す文（日本語と英語）。タイトル画面で切り替え、このブラウザに残す（?lang=ja・?lang=en
 * で試せる。保存しない）。 日本語の文は「みにもっちり」、英語の文は 3x5
 * のドットフォントで描かれる（src/render/font.ts）。
 * はじめは、ブラウザの言語の設定で決まる（優先する順に見て、日本語と英語のうち先に出てくるほう。どちらもなければ英語）。
 * 一度切り替えると、そのあとはこのブラウザに残した言語になる
 */
export type Lang = 'ja'|'en';

const KEY = 'metrogrid.lang';

const EN = {
  // タイトル
  start: 'PRESS ENTER / TAP',
  reset: 'RESET',
  tutorial: 'TUTORIAL',
  otherLang: 'にほんご',
  sound: (on: boolean): string => (on ? 'SOUND ON' : 'SOUND OFF'),
  // ボタン
  home: 'HOME',
  retry: 'RETRY',
  title: 'TITLE',
  skip: 'SKIP',
  // 確認
  upstairs: 'REALLY GO UPSTAIRS?',
  erase: 'ERASE ALL PROGRESS?',
  eraseNote: 'CLEARED STAGES AND TOTAL SCORE WILL BE LOST.',
  yes: (selected: boolean): string => (selected ? '> YES' : '  YES'),
  no: (selected: boolean): string => (selected ? '> NO' : '  NO'),
  // 結果
  clear: 'CLEAR',
  rowScore: 'SCORE',
  rowBonus: 'GOAL BONUS',
  beatsLeft: (n: number) => `${n} BEATS LEFT`,
  rowMiss: 'MISS',
  rowTotal: 'TOTAL',
  goHome: 'ENTER / TAP: GO HOME',
  timeUp: 'TIME UP',
  score: (n: number|string) => `SCORE ${n}`,
  miss: (n: number) => `MISS ${n}`,
  retryPrompt: 'ENTER / TAP: RETRY',
  // 遊んでいるあいだ
  hub: 'HOME',
  total: (n: string) => `TOTAL ${n}`,
  bar: (bar: number, bars: number) => `BAR ${bar}/${bars}`,
  wait: 'WAIT',
  stop: 'STOP!',
  cleared: 'CLEARED',
  // エンディングのあと、ガレキの画面の下に出る結びの文（2行）
  epilogue: ['FROM THEN ON, THE TSUKUMOGAMI OF THE HOUSE', 'NEVER APPEARED ANYWHERE AGAIN.'],
  // 得点の総計が 0 のままエンディングに来たときの結びの文（2行）
  calmEpilogue: ['THE TSUKUMOGAMI OF THE HOUSE GAZED AT THE SKY,', 'AND THEN, SLOWLY, TOOK A DEEP BREATH.'],
  stage: (name: string) =>
      (name === 'UPSTAIRS' ? 'UPSTAIRS' : name.replace(/(\d+)$/, ' $1')),
};

const JA: typeof EN = {
  // タイトル
  start: 'ENTER/TAP で はじめる',
  reset: 'リセット',
  tutorial: 'チュートリアル',
  otherLang: 'ENGLISH',
  sound: (on: boolean) => (on ? 'サウンドON' : 'サウンドOFF'),
  // ボタン
  home: 'もどる',
  retry: 'やりなおす',
  title: 'タイトルへ',
  skip: 'スキップ',
  // 確認
  upstairs: 'ほんとうに 2かいへ のぼる？',
  erase: 'きろくを すべて けす？',
  eraseNote: 'クリアしたステージと ためたスコアが きえます。',
  yes: (selected: boolean): string => (selected ? '>はい' : ' はい'),
  no: (selected: boolean): string => (selected ? '>いいえ' : ' いいえ'),
  // 結果
  clear: 'CLEAR',
  rowScore: 'SCORE',
  rowBonus: 'GOAL BONUS',
  beatsLeft: (n: number) => `のこり ${n} はく`,
  rowMiss: 'MISS',
  rowTotal: 'TOTAL',
  goHome: 'ENTER/TAP: HOMEにもどる',
  timeUp: 'TIME UP',
  score: (n: number|string) => `SCORE ${n}`,
  miss: (n: number) => `MISS ${n}`,
  retryPrompt: 'ENTER/TAP: やりなおす',
  // 遊んでいるあいだ
  hub: 'HOME',
  total: (n: string) => `TOTAL ${n}`,
  bar: (bar: number, bars: number) => `BAR ${bar}/${bars}`,
  wait: 'WAIT',
  stop: 'STOP!',
  cleared: 'CLEARED',
  epilogue: ['それから いえの つくもがみは', 'もう どこにも すがたを みせません。'],
  calmEpilogue: ['いえの つくもがみは そらを ながめました。', 'それから ゆっくりと いきを すいこんだのでした。'],
  stage: (name: string) => name === 'UPSTAIRS' ? '2かい' :
      name === 'TUTORIAL'                      ? 'チュートリアル' :
                            name.replace(/^STAGE(\d+)$/, 'STAGE $1'),
};

export const MESSAGES: Record<Lang, typeof EN> = {
  en: EN,
  ja: JA
};

function initial(): Lang {
  const dev =
      new URLSearchParams(globalThis.location?.search ?? '').get('lang');
  if (dev === 'ja' || dev === 'en') return dev;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'ja' || saved === 'en') return saved;
  } catch {
    // localStorage が使えない環境では、ブラウザの言語から決める
  }
  return fromBrowser(globalThis.navigator?.languages ?? [globalThis.navigator?.language ?? '']);
}

/** ブラウザの言語の設定（優先する順）から：日本語と英語のうち、先に出てくるほう。どちらもなければ英語 */
export function fromBrowser(langs: readonly string[]): Lang {
  for (const l of langs) {
    const code = l.toLowerCase();
    if (code.startsWith('ja')) return 'ja';
    if (code.startsWith('en')) return 'en';
  }
  return 'en';
}

let current: Lang = initial();
/** ?lang で決めたときは保存しない */
const devLang =
    new URLSearchParams(globalThis.location?.search ?? '').has('lang');

export const lang = (): Lang => current;
/** いまの言語の文 */
export const msg = (): typeof EN => MESSAGES[current];

/** 言語を切り替えて、このブラウザに残す（記録を消しても言語は残る） */
export function toggleLang(): void {
  current = current === 'ja' ? 'en' : 'ja';
  if (devLang) return;
  try {
    localStorage.setItem(KEY, current);
  } catch {
    // 残せなくても切り替わる
  }
}
