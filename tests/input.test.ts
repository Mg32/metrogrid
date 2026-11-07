import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Input } from '../src/input.ts';

/** window の代わり：キーの押下・解放を送れる EventTarget */
function setup() {
  const target = new EventTarget();
  const input = new Input(target as unknown as Window);
  const key = (type: 'keydown' | 'keyup', code: string) =>
    target.dispatchEvent(Object.assign(new Event(type), { code, repeat: false, preventDefault() {} }));
  return { input, key };
}

test('1tick より短く叩いたキーも、次に読む tick では押していることになる（1回だけ）', () => {
  const { input, key } = setup();
  key('keydown', 'ArrowUp');
  key('keyup', 'ArrowUp');
  assert.deepEqual(input.takeDirs(150), ['up']);
  assert.deepEqual(input.takeDirs(150), []);
});

test('叩いてから長くたった（読む間隔より古い）キーは使わない（先行入力にしない）', () => {
  const { input } = setup();
  input.tap('left', 0);
  assert.deepEqual(input.takeDirs(150, 1000), []);
});

test('押している向きと叩いて離した向きは、新しく押した順に並ぶ', () => {
  const { input, key } = setup();
  key('keydown', 'ArrowLeft');
  key('keydown', 'ArrowUp');
  key('keyup', 'ArrowUp');
  assert.deepEqual(input.takeDirs(1e9), ['up', 'left']);
  // 押しっぱなしの向きは、読んだあとも残る
  assert.deepEqual(input.takeDirs(1e9), ['left']);
});
