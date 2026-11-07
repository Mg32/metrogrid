import type { Dir } from './game/types.ts';

/**
 * 方向キーの押しっぱなしを管理する。複数押されているときは、新しく押した順に並べて渡す
 * （どれへ進むかは Sim.choose が決める：進める向きのうち、最後に押したもの）。
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

  constructor(target: Window) {
    target.addEventListener('keydown', (e) => {
      const dir = KEY_DIRS[e.code];
      if (dir) {
        e.preventDefault();
        if (e.repeat) return;
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
    });
  }

  /** いま押されている方向のすべて（新しく押した順） */
  heldDirs(): Dir[] {
    return [...this.held].reverse();
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
  }
}
