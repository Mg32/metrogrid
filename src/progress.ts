/**
 * クリアしたステージの記録（このブラウザだけに残る）。前のステージをクリアすると次のステージが遊べるようになる（企画書 第2.3節）。
 * 拠点（家の中）はまだないので、いまはタイトルでステージを選ぶ。どのクリアでどの部屋が開くか（第2.4節 TODO）は未定。
 * localStorage が使えない環境（プライベートウィンドウなど）では記録が残らないだけで、遊ぶのに支障はない。
 */
const KEY = 'metrogrid.cleared';

export function loadCleared(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function saveCleared(cleared: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...cleared]));
  } catch {
    // 残せなくても続ける
  }
}
