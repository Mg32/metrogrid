/**
 * 画面に出す文（日本語と英語）。タイトル画面で切り替え、このブラウザに残す（?lang=ja・?lang=en
 * で試せる。保存しない）。 日本語の文は「みにもっちり」、英語の文は 3x5
 * のドットフォントで描かれる（src/render/font.ts）。
 * はじめは、ブラウザの言語が日本語なら日本語、それ以外は英語
 */
export type Lang = 'ja'|'en';

const KEY = 'metrogrid.lang';

const EN = {
  // タイトル
  start: 'PRESS ENTER / TAP',
  reset: 'RESET',
  tutorial: 'TUTORIAL',
  skipTutorial: 'SKIP TUTORIAL',
  otherLang: '日本語',
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
  stage: (name: string) =>
      (name === 'UPSTAIRS' ? 'UPSTAIRS' : name.replace(/(\d+)$/, ' $1')),
};

const JA: typeof EN = {
  // タイトル
  start: 'ENTER/TAP ではじめる',
  reset: 'リセット',
  tutorial: 'チュートリアル',
  skipTutorial: 'チュートリアルをとばす',
  otherLang: 'ENGLISH',
  // ボタン
  home: 'もどる',
  retry: 'やりなおす',
  title: 'タイトルへ',
  skip: 'とばす',
  // 確認
  upstairs: 'ほんとうに 2かいへ のぼる？',
  erase: 'きろくを すべて けしますか？',
  eraseNote: 'クリアしたステージと、ためたスコアが きえます。',
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
  const langs = globalThis.navigator?.languages ?? [];
  return langs.some((l) => l.toLowerCase().startsWith('ja')) ? 'ja' : 'en';
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
