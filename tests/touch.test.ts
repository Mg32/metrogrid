import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Stick, STICK_DEAD, STICK_RADIUS, stickDir } from '../src/touch.ts';

test('指をずらした向き：右上は up、右下は right、左下は down、左上は left', () => {
  assert.equal(stickDir(10, -6, null), 'up');
  assert.equal(stickDir(10, 6, null), 'right');
  assert.equal(stickDir(-10, 6, null), 'down');
  assert.equal(stickDir(-10, -6, null), 'left');
});

test('置いたところの近くでは止まる', () => {
  assert.equal(stickDir(STICK_DEAD - 1, 0, 'up'), null);
  const s = new Stick(1, 100, 100);
  assert.equal(s.dir, null);
  s.move(103, 98);
  assert.equal(s.dir, null);
});

test('向きの境目の近くでは、いまの向きを保つ', () => {
  // 真右（up と right の境目）の少し下：はじめてなら right、up で歩いているなら up のまま
  assert.equal(stickDir(20, 2, null), 'right');
  assert.equal(stickDir(20, 2, 'up'), 'up');
  // 境目を大きく越えたら変わる
  assert.equal(stickDir(20, 10, 'up'), 'right');
});

test('指を遠くへずらすと中心がついてきて、逆へ少し戻すだけで切り返せる', () => {
  const s = new Stick(1, 100, 100);
  s.move(160, 130);
  assert.equal(s.dir, 'right');
  assert.ok(Math.hypot(s.x - s.cx, s.y - s.cy) <= STICK_RADIUS + 1e-9);
  // 中心は指から STICK_RADIUS のところにある。そこを越えて左上へ戻すと left
  s.move(s.cx - 10, s.cy - 6);
  assert.equal(s.dir, 'left');
});
