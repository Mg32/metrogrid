import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tutorial } from '../src/game/stages/index.ts';
import { MESSAGES } from '../src/lang.ts';
import { isMottiri, missingGlyphs, textWidth } from '../src/render/font.ts';

/** 文の一覧から、画面に出るすべての文を取り出す（引数のある文は、いちばん長くなりそうな値で） */
function lines(m: (typeof MESSAGES)['en']): string[] {
  const out: string[] = [];
  for (const v of Object.values(m)) {
    if (typeof v === 'string') out.push(v);
  }
  out.push(m.yes(true), m.yes(false), m.no(true), m.no(false), m.beatsLeft(999));
  out.push(m.score('000000'), m.miss(99), m.total('0000000'), m.bar(80, 80));
  for (const name of ['TUTORIAL', 'STAGE1', 'STAGE5', 'UPSTAIRS']) out.push(m.stage(name));
  return out;
}

test('日本語の文は、すべてみにもっちりにある文字（かな・英数字・記号。漢字はない）で書かれている', () => {
  const texts = [...lines(MESSAGES.ja), ...(tutorial.hints ?? []).map((h) => h.text.ja)];
  for (const s of texts) assert.deepEqual(missingGlyphs(s), [], s);
});

test('英語の文は、すべて 3x5 のフォントで描かれる', () => {
  const texts = [...lines(MESSAGES.en), ...(tutorial.hints ?? []).map((h) => h.text.en)];
  // 言語を切り替えるボタンだけは、切り替えた先の言語（日本語）で書く
  for (const s of texts) if (s !== MESSAGES.en.otherLang) assert.equal(isMottiri(s), false, s);
});

test('文は画面（288 ドット）の幅に収まる', () => {
  for (const lang of ['ja', 'en'] as const) {
    for (const s of lines(MESSAGES[lang])) assert.ok(textWidth(s, 1) <= 280, `${lang}: ${s}`);
    // 二階へ昇る・記録を消す確認の問いは2倍の大きさ
    for (const s of [MESSAGES[lang].upstairs, MESSAGES[lang].erase]) assert.ok(textWidth(s, 2) <= 280, `${lang}: ${s}`);
    for (const h of tutorial.hints ?? []) assert.ok(textWidth(h.text[lang], 1) <= 280, `${lang}: ${h.text[lang]}`);
  }
});
