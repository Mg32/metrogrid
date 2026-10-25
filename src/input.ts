import type { Dir } from './game/types.ts';

/**
 * 方向キーの押しっぱなしを管理する。複数押されているときは最後に押したキーを優先。
 *
 * TODO（企画書 2.4「方向キーの対応」）：斜め見下ろしの画面に対し、
 * いまは Solstice と同じく「上キー＝画面の右上」に対応させている（グリッドの up がそのまま画面の右上になる描画）。
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

  /** いま押されている方向（最後に押したもの） */
  current(): Dir | null {
    return this.held[this.held.length - 1] ?? null;
  }

  /** 前回の呼び出し以降に押されたキーを取り出す */
  consumePressed(code: string): boolean {
    return this.pressed.delete(code);
  }

  clearPressed(): void {
    this.pressed.clear();
  }
}
