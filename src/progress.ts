/**
 * クリアしたステージと、これまでに溜めた得点の記録（このブラウザだけに残る。企画書 第2.3節）。
 * 前のステージをクリアすると、拠点に次の入口が現れる。ステージ5をクリアした時点で記録が残る（オートセーブ）。
 * エンディングを見ても記録は消さず、書き換えもしない（家が崩れたのはその場かぎり。ページを読み込み直すと、階段が現れた時点に戻る）。
 * localStorage が使えない環境（プライベートウィンドウなど）では記録が残らないだけで、遊ぶのに支障はない。
 */
const KEY = 'metrogrid.cleared';
/**
 * これまでに溜めた得点：ステージを最後まで遊ぶたび（クリアでも時間切れでも）、そのプレイの得点を足していく。
 * エンディングで少女の行為に使われる値。企画書では「スコアの扱い」（ベストか累計か）は TODO（第2.4節）で、ここでは仮に全プレイの累計にした
 * （ステージ5のクリア後も遊び続けると、使われる得点が増えていく）
 */
const TOTAL_KEY = 'metrogrid.total';

export function loadCleared(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function loadTotal(): number {
  try {
    const v = Number(localStorage.getItem(TOTAL_KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

export function saveTotal(total: number): void {
  try {
    localStorage.setItem(TOTAL_KEY, String(total));
  } catch {
    // 残せなくても続ける
  }
}

/** すべての記録を消す（タイトルの RESET から。プレイヤーが自分で選んだときだけ） */
export function resetProgress(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(TOTAL_KEY);
  } catch {
    // 消せなくても、この場の記録は空にして続ける
  }
}

export function saveCleared(cleared: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...cleared]));
  } catch {
    // 残せなくても続ける
  }
}
