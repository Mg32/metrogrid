import type { Dir } from './game/types.ts';

/**
 * 方向キーの押しっぱなしを管理する。複数押されているときは、新しく押した順に並べて渡す
 * （どれへ進むかは Sim.choose が決める：進める向きのうち、最後に押したもの）。
 * 1tick より短く叩いて、tick を読む前に離したキーも、次の tick ではまだ押していることにする（取りこぼさないように）。
 * 覚えておくのは前の tick を読んでから（長くても1tick のあいだ）に押したものだけなので、拍のずっと前の入力を取っておく先行入力にはならない。
 *
 * 斜め見下ろしの画面に対し、Solstice と同じく「上キー＝画面の右上」に対応させる（企画書 第2.4節「方向キーの対応」で確定）。
 * グリッドの up がそのまま画面の右上になる描画。
 */
const KEY_DIRS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};

export class Input {
  private held: Dir[] = [];
  private pressed = new Set<string>();
  /** 前に向きを読んでから押した向きと、押した時刻（performance.now()。ミリ秒） */
  private taps = new Map<Dir, number>();
  /** それぞれの向きを最後に押した時刻（押している向きと、叩いて離した向きを、押した順に並べるため） */
  private pressedAt = new Map<Dir, number>();

  constructor(target: Window) {
    target.addEventListener('keydown', (e) => {
      const dir = KEY_DIRS[e.code];
      if (dir) {
        e.preventDefault();
        if (e.repeat) return;
        this.tap(dir);
        this.held = this.held.filter((d) => d !== dir);
        this.held.push(dir);
      }
      if (!e.repeat) this.pressed.add(e.code);
    });
    target.addEventListener('keyup', (e) => {
      const dir = KEY_DIRS[e.code];
      if (dir) this.held = this.held.filter((d) => d !== dir);
    });
    target.addEventListener('blur', () => {
      this.held = [];
      this.taps.clear();
    });
  }

  /** その向きを押したことを覚えておく（キーのほか、タッチで指をずらしたときも。すぐ離しても次の tick で読める） */
  tap(dir: Dir, now = performance.now()): void {
    this.taps.set(dir, now);
    this.pressedAt.set(dir, now);
  }

  /**
   * tick ごとに1回読む：いま押している向きと、前に読んでから maxAgeMs 以内に押して離した向き（新しく押した順）。
   * 読んだら、押して離した向きは忘れる（1回叩いただけで何度も進まない）
   */
  takeDirs(maxAgeMs: number, now = performance.now()): Dir[] {
    const released = [...this.taps].filter(([d, at]) => !this.held.includes(d) && now - at <= maxAgeMs).map(([d]) => d);
    this.taps.clear();
    const at = (d: Dir) => this.pressedAt.get(d) ?? -Infinity;
    return [...this.held, ...released].sort((a, b) => at(b) - at(a));
  }

  /** 前回の呼び出し以降に押されたキーを取り出す */
  consumePressed(code: string): boolean {
    return this.pressed.delete(code);
  }

  /** キーを押したことにする（タッチのボタンから。キーと同じ道を通す） */
  press(code: string): void {
    this.pressed.add(code);
  }

  clearPressed(): void {
    this.pressed.clear();
    this.taps.clear();
  }
}
