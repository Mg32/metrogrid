import './style.css';
import { Music, type Conductor } from './audio/conductor.ts';
import { Sfx } from './audio/sfx.ts';
import { InputRecorder, makePlayLog } from './game/playlog.ts';
import { createRandom, randomSeed } from './game/random.ts';
import { Sim } from './game/sim.ts';
import { Stage, type StageDef } from './game/stage.ts';
import { buildHub, hubReturnCell, hubReveal, UPSTAIRS } from './game/stages/hub.ts';
import { STAGE_ORDER, STAGES, tutorial } from './game/stages/index.ts';
import { DIR_VEC, TICKS_PER_BEAT, type Dir, type Vec } from './game/types.ts';
import { Input } from './input.ts';
import { loadCleared, loadTotal, resetProgress, saveCleared, saveTotal } from './progress.ts';
import { ENDING, HOMECOMING, TITLE_OUT } from './render/ending.ts';
import { APPEAR_BARS, BACK, CLEAR, FADE_IN, LEAVE, Renderer, revealEnd } from './render/renderer.ts';
import { Stick } from './touch.ts';

/**
 * 遊ぶ流れ：タイトル →（はじめてならチュートリアル。Esc でスキップ）→ 拠点（家の中）→ 入口からステージへ → 結果 → 拠点へ戻る
 * ステージ5をクリアすると拠点に二階への階段が現れ、上り口で「本当に二階へ昇る？」と確かめてエンディングへ（企画書 第2.3節・第4.6節）。
 * エンディングのあとは、ガレキだけが残った画面のまま（崩壊後の画面。第2.4節で暫定合意：操作はできず、案内も出さない）。
 * クリアの記録は書き換えないので、ページを読み込み直すと階段が現れた時点（家がそろった状態）に戻る
 *
 * 開発用の URL パラメータ
 *   ?autostart        タイトルを飛ばして始める
 *   ?seed=N           乱数のシードを固定する（危険物の開始位置が毎回同じになる）
 *   ?stage=NAME       タイトルから、拠点を通さずにそのステージを遊ぶ（TUTORIAL、TEST、HUB も指定できる）
 *   ?cleared=A,B      クリアの記録をこの内容に差し替える（保存しない。拠点の見た目の確認用）
 *   ?view=X,Y,TICK    音を鳴らさず、TICK まで何もせず進めた状態でプレイヤーを (X,Y) に置いて静止表示する
 *   ?clear=SEC        音を鳴らさず、ゴールしてから SEC 秒後のクリア演出を静止表示する
 *   ?ending=SEC       音を鳴らさず、エンディングの SEC 秒目を静止表示する
 *   ?title=SEC        タイトルの SEC 秒目を止めて表示する（星のまたたきや文字の点滅を止める。操作はできる）
 *   ?home=NAME        NAME を初めてクリアして家に帰ってくる演出（外から見た家のその部分が戻る）から始め、拠点へ。?title=SEC と一緒なら SEC 秒目で止める
 *   ?total=N          これまでに溜めた得点をこの値に差し替える（保存しない）
 *   ?bpm=N            ステージ（拠点以外）の BPM をこの値にする（曲を作る前に試す用。ステージの定義は変えない）
 *   ?bars=N           ステージ（拠点以外）の長さ（小節）をこの値にする
 *   ?upstairs         すべてクリアした拠点の、二階への階段の前から始める（階段 → 確認 → エンディングの確認用。
 *                     ?cleared を付けなければクリアの記録を差し替えたことになり、保存しない）
 */
/*
 * タッチ・マウスでの操作（デスクトップでもスマホでも、画面と操作は同じ。端末で分けない）
 *   歩く：画面のどこかに指を置き（マウスなら押し）、そのままずらした向きへ歩く（右上へずらすと上、右下は右、左下は下、左上は左。
 *         クォータービューの画面の斜めにそのまま対応する）。指を離すか、置いたところへ戻すと止まる（src/touch.ts）
 *   キーの代わり：画面の下の隅のボタン（戻る、やり直す、チュートリアルを飛ばす。タイトルでは記録を消す、チュートリアルを飛ばす・遊ぶ）。
 *         ボタンはいつでも出し、同じことができるキーを四角で囲んで添える。それ以外の場面ではタップ・クリックが Enter の代わり
 *   二階へ昇るかの確認は、YES を2回タップで決まる（取り返しがつかないので、うっかり1回では決まらないようにする）
 */
const params = new URLSearchParams(location.search);
const fixedSeed = params.has('seed') ? Number(params.get('seed')) : null;
const devBpm = params.has('bpm') ? Number(params.get('bpm')) : null;
const devBars = params.has('bars') ? Number(params.get('bars')) : null;

const canvas = document.createElement('canvas');
document.querySelector<HTMLDivElement>('#app')!.append(canvas);

const input = new Input(window);
const renderer = new Renderer(canvas);
const conductor: Conductor = new Music();
const sfx = new Sfx();
/** クリアしたステージ（チュートリアルは、クリアかスキップで 'TUTORIAL' が入る） */
const devCleared = params.get('cleared') ?? (params.has('upstairs') ? [tutorial, ...STAGE_ORDER].map((d) => d.name).join(',') : null);
const cleared = devCleared !== null ? new Set(devCleared.split(',').filter(Boolean)) : loadCleared();
const save = () => {
  if (devCleared === null) saveCleared(cleared);
};
renderer.portalNote = (name) => (cleared.has(name) ? 'CLEARED' : null);
/** これまでに溜めた得点（エンディングで使われる） */
const devTotal = params.get('total');
let total = devTotal !== null ? Number(devTotal) : loadTotal();
renderer.totalScore = total;

/** ?stage=NAME で直接遊ぶステージ */
const devStage = params.get('stage');
const devDef = (): StageDef | null => (devStage === 'HUB' ? buildHub(cleared) : (STAGES[devStage ?? ''] ?? null));

let stage = new Stage(devDef() ?? STAGE_ORDER[0]);
let tickSec = 60 / stage.def.bpm / TICKS_PER_BEAT;
/** このクリアで拠点に新しく現れた入口（結果の欄に出す） */
let newlyUnlocked: string | null = null;
/** 初めてクリアしたステージ。次に拠点に戻ったとき、新しい入口が現れる演出をする（?reveal=NAME で試せる） */
let pendingReveal: string | null = params.get('reveal');
/** 拠点の演出が終わる秒（それまでは歩けない） */
let revealUntil = 0;

const stageLabel = (name: string) => name.replace(/(\d+)$/, ' $1');

type Scene = 'title' | 'titleOut' | 'homecoming' | 'loading' | 'play' | 'leaving' | 'backing' | 'result' | 'view' | 'confirm' | 'ending' | 'ruins';

/** 歩く向きを決めている指 */
let steer: Stick | null = null;

interface Button {
  label: string;
  /** 押したことにするキー */
  key: string;
  /** ボタンに四角で囲んで添えるキーの名前（キーボードでも同じことができると分かるように） */
  keyLabel: string;
  x: number;
  y: number;
  w: number;
  h: number;
  selected?: boolean;
}

/** ボタンの大きさ（バッファのドット）。スマホで指で押しやすいように大きめ */
const BTN_W = 60;
const BTN_H = 22;
/** ボタンに添えるキーの名前 */
const KEY_LABEL: Record<string, string> = { Delete: 'DEL', Escape: 'ESC', KeyR: 'R', KeyT: 'T', KeyY: 'Y', KeyN: 'N' };
const left = (label: string, key: string, w = BTN_W): Button => ({ label, key, keyLabel: KEY_LABEL[key], x: 4, y: 288 - BTN_H - 4, w, h: BTN_H });
const right = (label: string, key: string, w = BTN_W): Button => ({ label, key, keyLabel: KEY_LABEL[key], x: 288 - w - 4, y: 288 - BTN_H - 4, w, h: BTN_H });

/**
 * いまの場面のボタン。タッチでもマウスでも押せるよう、いつでも出す（キーボードだけ・タップだけ・マウスだけで遊べるように）。
 * どのボタンにも、同じことができるキーを四角で囲んで添える
 */
function screenButtons(): Button[] {
  if (scene === 'title') {
    // はじめてならチュートリアルを飛ばせる。チュートリアルを済ませていれば、もう一度遊べる
    return [left('RESET', 'Delete'), cleared.has(tutorial.name) ? right('TUTORIAL', 'KeyT') : right('SKIP TUTORIAL', 'Escape', 76)];
  }
  if (scene === 'confirm') {
    // 確認の画面の YES・NO の文字を囲む（キーの名前は枠の下）。YES は選んでから、もう一度で決まる
    return [
      { label: '', key: 'KeyY', keyLabel: 'Y', x: 288 / 2 - 62, y: 288 / 2 + 11, w: 64, h: 19, selected: confirmYes },
      { label: '', key: 'KeyN', keyLabel: 'N', x: 288 / 2 + 6, y: 288 / 2 + 11, w: 56, h: 19 },
    ];
  }
  // クリアしたあとはホームへ戻るだけ（やり直しは拠点の入口から）。時間切れならやり直せる
  if (scene === 'result') return sim?.status === 'cleared' ? [left('HOME', 'Escape')] : [left('HOME', 'Escape'), right('RETRY', 'KeyR')];
  // 静止表示（?view）でも、遊んでいるときと同じボタンを出す
  if ((scene === 'play' || scene === 'view') && sim) {
    if (sim.stage.kind === 'hub') return [left('TITLE', 'Escape')];
    if (sim.stage.kind === 'tutorial') return [left('SKIP', 'Escape'), right('RETRY', 'KeyR')];
    return [left('HOME', 'Escape'), right('RETRY', 'KeyR')];
  }
  return [];
}

let scene: Scene = 'title';
let sim: Sim | null = null;
let seed = 0;
let recorder = new InputRecorder();
/** sim.events のうち、効果音を鳴らし終えた数 */
let heardEvents = 0;
/** view のときに表示する tick */
let viewTick = 0;
/** ゴールした時刻（performance.now() の秒）。クリア演出の経過秒はここから数える。?clear では固定の経過秒 */
let clearedAt = 0;
let fixedClearSec: number | null = null;
/** 二階へ昇るかの確認で、YES を選んでいるか（はじめは NO） */
let confirmYes = false;
/** 何の確認か：二階へ昇る（エンディングへ）か、すべての記録を消して最初からやり直すか */
let confirmKind: 'upstairs' | 'reset' = 'upstairs';

/** タイトルの RESET：記録を消すかを確かめる */
function openReset(): void {
  input.clearPressed();
  confirmKind = 'reset';
  confirmYes = false;
  scene = 'confirm';
}

/**
 * すべてをリセットして、タイトルに戻る（次に始めるとチュートリアルから）。クリアの記録と得点の総計を消す。
 * ?cleared・?total で差し替えているときは、保存された記録には触れない
 */
function resetAll(): void {
  cleared.clear();
  total = 0;
  renderer.totalScore = 0;
  if (devCleared === null && devTotal === null) resetProgress();
  input.clearPressed();
  scene = 'title';
}
/** エンディングが始まった時刻（performance.now() の秒）。?ending では固定の経過秒 */
let endingAt = 0;
/** 拠点で入口に入った時刻（performance.now() の秒）と行き先。光に包まれて闇に沈む演出（LEAVE）のあと、行き先を遊び始める */
let leaveAt = 0;
let leaveTarget: StageDef | null = null;
const leaveSec = () => performance.now() / 1000 - leaveAt;
/**
 * Esc（HOME・SKIP・TITLE のボタン）で戻り始めた時刻（performance.now() の秒）と、戻る前の場面、戻り先へ移る処理。
 * 曲が消えていき道が沈んで消える演出（BACK）のあと、backTo を呼ぶ
 */
let backAt = 0;
let backFrom: Scene = 'play';
let backTo: () => void = () => {};
const backSec = () => performance.now() / 1000 - backAt;

/** タイトルで始めるキーを押した時刻（performance.now() の秒）と、演出（TITLE_OUT）のあとに移る処理 */
let titleOutAt = 0;
let titleOutTo: () => void = () => {};
const titleOutSec = () => performance.now() / 1000 - titleOutAt;
/**
 * 家に帰ってくる演出（HOMECOMING）を始めた時刻（performance.now() の秒）、戻っていく家の部分（ステージ名）、演出のあとに移る処理。
 * ステージを初めてクリアして結果の画面から拠点へ戻るときに、外から見た家のその部分が戻っていく（?home=NAME で試せる。?title=SEC で止める）
 */
let homeAt = 0;
let homePart = '';
let homeTo: () => void = () => {};
const homeSec = () => fixedTitleSec ?? performance.now() / 1000 - homeAt;

/** 遊び始めた時刻（performance.now() の秒）。拠点とチュートリアルは、ここから FADE_IN 秒で闇から明るくなる */
let playAt = 0;

/** タイトルから始める：少女が家の中へ入っていく演出のあと to へ */
function leaveTitle(to: () => void): void {
  scene = 'titleOut';
  titleOutAt = performance.now() / 1000;
  titleOutTo = to;
  input.clearPressed();
}

/** 家に帰ってくる演出のあと to へ（拠点の曲はまだ鳴らさない） */
function homecoming(part: string, to: () => void): void {
  conductor.stop();
  sfx.stop();
  input.clearPressed();
  scene = 'homecoming';
  homeAt = performance.now() / 1000;
  homePart = part;
  homeTo = to;
}

/** 曲を消していき、道が沈んで消える演出のあと to へ */
function goBack(to: () => void): void {
  backFrom = scene;
  scene = 'backing';
  backAt = performance.now() / 1000;
  backTo = to;
  conductor.fadeOut(BACK.end);
  sfx.stop();
  steer = null;
  input.clearPressed();
}
let fixedEndingSec: number | null = null;
/** ?title=SEC：タイトルを止めて表示する秒 */
const fixedTitleSec = params.has('title') ? Number(params.get('title')) : null;

function endingSec(): number {
  return fixedEndingSec ?? performance.now() / 1000 - endingAt;
}

/** エンディングへ。音を鳴らし、時刻を数えはじめる */
function startEnding(): void {
  conductor.stop();
  input.clearPressed();
  scene = 'ending';
  endingAt = performance.now() / 1000;
  sfx.ending({ light: ENDING.light, rumble: ENDING.rumble, jerks: ENDING.jerks, settle: ENDING.settle });
}

function clearSec(): number | null {
  if (sim?.status !== 'cleared') return null;
  return fixedClearSec ?? performance.now() / 1000 - clearedAt;
}

function setStage(def: StageDef): void {
  if (def.kind !== 'hub' && (devBpm || devBars)) def = { ...def, bpm: devBpm || def.bpm, bars: devBars || def.bars };
  stage = new Stage(def);
  tickSec = 60 / stage.def.bpm / TICKS_PER_BEAT;
}

function newSim(start?: Vec): Sim {
  seed = fixedSeed ?? randomSeed();
  recorder = new InputRecorder();
  return new Sim(stage, createRandom(seed), start);
}

/** def を遊び始める。start を渡すとそのマスから（拠点で、出てきた入口の前に戻すとき） */
async function play(def: StageDef, start?: Vec): Promise<void> {
  if (scene === 'loading') return;
  scene = 'loading';
  conductor.stop();
  sfx.stop();
  input.clearPressed();
  setStage(def);
  setReveal(def);
  sim = newSim(start);
  heardEvents = 0;
  steer = null;
  // 拠点はカウントなしですぐ歩ける
  // 曲のファイル（sound/music/<名前>.wav）があればそれを、なければメトロノームを鳴らす。拠点の曲は繰り返す
  const hub = stage.kind === 'hub';
  // 階段のあるステージ（チュートリアル）は、曲の前に少女が現れる小節を置く（曲もカウントも鳴らさない）
  const waitBars = stage.def.stairs ? APPEAR_BARS : 0;
  await conductor.start({ bpm: stage.def.bpm, bars: stage.def.bars, countInBars: hub ? 0 : 1, waitBars, track: stage.def.name, loop: hub });
  scene = 'play';
  playAt = performance.now() / 1000;
}

/** 拠点を遊び始めるとき、初めてクリアしたステージがあれば、新しい入口が現れる演出をする */
function setReveal(def: StageDef): void {
  renderer.hubReveal = null;
  revealUntil = 0;
  if (def.kind !== 'hub' || !pendingReveal || !cleared.has(pendingReveal)) return;
  const order = hubReveal(cleared, pendingReveal);
  pendingReveal = null;
  if (order.size === 0) return;
  renderer.hubReveal = { def, order };
  revealUntil = revealEnd(order);
}

/** 拠点へ。from はいま出てきたステージ（その入口の前に立つ） */
function goHub(from?: string): void {
  const hub = buildHub(cleared);
  void play(hub, (from && hubReturnCell(hub, from)) || undefined);
}

/** タイトルから始める。はじめてならチュートリアル、そうでなければ拠点 */
function startGame(): void {
  const dev = devDef();
  if (dev) void play(dev);
  else if (!cleared.has(tutorial.name)) void play(tutorial);
  else goHub();
}

/** チュートリアルを済ませたことにして拠点へ。遊んでいる途中からなら、戻る演出（BACK）のあと */
function skipTutorial(): void {
  cleared.add(tutorial.name);
  save();
  if (scene === 'play') goBack(() => goHub());
  else goHub();
}

function toTitle(): void {
  conductor.stop();
  sfx.stop();
  input.clearPressed();
  sim = null;
  scene = 'title';
}

function finishPlay(s: Sim): void {
  // 曲は止めずに最後まで鳴らす（結果画面から次へ進むと止まる）
  conductor.finish();
  input.clearPressed();
  scene = 'result';
  newlyUnlocked = null;
  // これまでに溜めた得点（クリアでも時間切れでも、そのプレイの得点を足す）
  total += s.score;
  renderer.totalScore = total;
  if (devTotal === null && devCleared === null) saveTotal(total);
  if (s.status === 'cleared') {
    clearedAt = performance.now() / 1000;
    sfx.clear(CLEAR.rows.map((r) => CLEAR.panel + r));
    const name = s.stage.def.name;
    if (!cleared.has(name)) {
      cleared.add(name);
      save();
      if (s.stage.kind === 'stage') pendingReveal = name;
      const i = STAGE_ORDER.findIndex((d) => d.name === name);
      if (i >= 0 && i + 1 < STAGE_ORDER.length) newlyUnlocked = STAGE_ORDER[i + 1].name;
    }
  }
  // 開発サーバーでは、最後まで遊んだ記録を playlogs/ に保存する（自動テストのプレイは残さない）
  if (import.meta.env.DEV && !navigator.webdriver) {
    void fetch('/__playlog', { method: 'POST', body: JSON.stringify(makePlayLog(s, seed, recorder)) }).catch(() => {});
  }
}

/** 結果画面で Enter：クリアしたら拠点へ（チュートリアルも）、時間切れならもう一度 */
function resultContinue(s: Sim): void {
  if (s.stage.kind === 'tutorial' && s.status === 'cleared') goBack(() => goHub());
  else if (s.status === 'cleared') resultBack(s);
  else void play(s.stage.def);
}

/**
 * 結果画面で Esc（HOME ボタン）：拠点へ戻る。ステージからは、?stage で直接遊んでいたときも拠点へ
 * （拠点の、そのステージの入口の前に立つ）。?stage で直接遊んでいたチュートリアルなどはタイトルへ
 */
function resultBack(s: Sim): void {
  const name = s.stage.def.name;
  if (s.stage.kind !== 'stage' && devDef()) goBack(toTitle);
  // 初めてクリアしたなら、家に帰ってくる演出（家のその部分が戻る）を挟む
  else if (s.status === 'cleared' && pendingReveal === name) goBack(() => homecoming(name, () => goHub(name)));
  else goBack(() => goHub(name));
}

// 音はキーやタップのイベントの処理の中で鳴らせるようにしておく（スマホでは、そうしないと音が出ない）
const unlockAudio = () => {
  conductor.unlock();
  sfx.unlock();
};
window.addEventListener('keydown', unlockAudio);
// iOS の Safari は、指を置いたとき（pointerdown）ではなく離したときにしか音を鳴らせるようにしない
window.addEventListener('pointerup', unlockAudio);
window.addEventListener('touchend', unlockAudio);

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  e.preventDefault();
  const b = renderer.toBuffer(e.clientX, e.clientY);
  const hit = screenButtons().find((btn) => b.x >= btn.x && b.x < btn.x + btn.w && b.y >= btn.y && b.y < btn.y + btn.h);
  if (hit) {
    input.press(hit.key);
    return;
  }
  if (scene === 'play') {
    // 指を置いたところから、ずらした向きへ歩く（マウスでも、押したままずらせば同じ）
    steer = new Stick(e.pointerId, b.x, b.y);
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // 指がもう離れているなど。捕まえられなくても歩ける
    }
  } else if (scene === 'title' || scene === 'result') {
    input.press('Enter');
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (steer?.id !== e.pointerId) return;
  const b = renderer.toBuffer(e.clientX, e.clientY);
  steer.move(b.x, b.y);
});
const endSteer = (e: PointerEvent) => {
  if (steer?.id === e.pointerId) steer = null;
};
canvas.addEventListener('pointerup', endSteer);
canvas.addEventListener('pointercancel', endSteer);
// 長押しのメニューやスクロールを出さない
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function update(): void {
  const start = input.consumePressed('Enter') || input.consumePressed('Space');
  const esc = input.consumePressed('Escape');
  const retry = input.consumePressed('KeyR');
  const tut = input.consumePressed('KeyT');

  if (scene === 'title') {
    if (input.consumePressed('Delete') || input.consumePressed('Backspace')) openReset();
    else if (start) leaveTitle(startGame);
    else if (esc && !cleared.has(tutorial.name)) leaveTitle(skipTutorial);
    else if (tut && cleared.has(tutorial.name)) leaveTitle(() => void play(tutorial));
  } else if (scene === 'titleOut') {
    // 少女が家の中へ入っていくあいだは操作できない
    if (titleOutSec() >= TITLE_OUT.end) titleOutTo();
  } else if (scene === 'homecoming') {
    // 家に帰ってくる演出のあいだも操作できない（?title で止めているときは進まない）
    if (fixedTitleSec === null && homeSec() >= HOMECOMING.end) homeTo();
  } else if (scene === 'result' && sim) {
    const e = clearSec();
    if (e !== null && e < CLEAR.end && (start || retry)) {
      // 演出の途中で押したら、数え終わったところまで飛ばす
      clearedAt = performance.now() / 1000 - CLEAR.end;
      sfx.stop();
    } else if (start) resultContinue(sim);
    else if (retry && sim.status !== 'cleared') void play(sim.stage.def);
    else if (esc) resultBack(sim);
  } else if (scene === 'confirm') {
    // 左右で選び、Enter で決める。Esc・N は「いいえ」。Y は YES のボタンと同じ（選んでから、もう一度で決まる）
    if (input.consumePressed('ArrowLeft') || input.consumePressed('KeyA')) confirmYes = true;
    if (input.consumePressed('ArrowRight') || input.consumePressed('KeyD')) confirmYes = false;
    let yes = input.consumePressed('KeyY');
    if (yes && !confirmYes) {
      confirmYes = true;
      yes = false;
    }
    const no = esc || input.consumePressed('KeyN') || (start && !confirmYes);
    if ((start || yes) && confirmYes) {
      if (confirmKind === 'upstairs') startEnding();
      else resetAll();
    } else if (no) {
      if (confirmKind === 'upstairs') goHub(UPSTAIRS);
      else scene = 'title';
    }
  } else if (scene === 'leaving') {
    // 入口の光に包まれて闇に沈むあいだは操作できない（拠点の曲は鳴ったまま）
    if (leaveSec() >= LEAVE.end) void play(leaveTarget!);
  } else if (scene === 'backing') {
    // 戻る演出のあいだは操作できない
    if (backSec() >= BACK.end) backTo();
  } else if (scene === 'ending') {
    // エンディングは飛ばせない。終わると、ガレキだけが残った画面へ
    if (fixedEndingSec === null && endingSec() > ENDING.end + 2) {
      scene = 'ruins';
      sfx.stop();
    }
  } else if (scene === 'play' && sim) {
    const kind = sim.stage.kind;
    if (esc) {
      // ステージからは拠点へ（?stage で直接遊んでいたときも）。チュートリアルは飛ばして拠点へ。拠点からはタイトルへ
      if (kind === 'stage') goBack(() => goHub(sim!.stage.def.name));
      else if (kind === 'tutorial') skipTutorial();
      else goBack(toTitle);
      return;
    }
    if (retry && kind !== 'hub') {
      void play(sim.stage.def);
      return;
    }
    const now = Math.floor(conductor.songTime() / tickSec);
    while (sim.tick < now && sim.status === 'playing') {
      // 拠点に新しい入口が現れているあいだは歩けない
      const held = kind === 'hub' && conductor.songTime() < revealUntil ? null : (steer?.dir ?? input.current());
      recorder.record(sim.tick + 1, held);
      sim.step(sim.tick + 1, held);
    }
    // 得点マスを取った音
    for (; heardEvents < sim.events.length; heardEvents++) {
      if (sim.events[heardEvents].kind === 'pickup') sfx.pickup(sim.multiplier);
    }
    if (sim.status === 'portal' && sim.portal === UPSTAIRS) {
      conductor.stop();
      input.clearPressed();
      confirmYes = false;
      confirmKind = 'upstairs';
      scene = 'confirm';
    } else if (sim.status === 'portal') {
      const target = STAGES[sim.portal!];
      if (target) {
        scene = 'leaving';
        leaveAt = performance.now() / 1000;
        leaveTarget = target;
        // 拠点の曲は、闇に沈むまでのあいだに消えていく
        conductor.fadeOut(LEAVE.end);
        steer = null;
        input.clearPressed();
      }
    } else if (sim.status !== 'playing') finishPlay(sim);
  }
}

/** タイトル：闇に浮かぶ家と、その前に立つ少女。家は、クリアしたステージに当たる部分が戻っている */
function drawTitle(): void {
  // 遊び方は文字で書かず、チュートリアルで覚えてもらう（チュートリアルは途中でも Esc・SKIP で飛ばせる）
  const dev = devDef();
  const go = 'PRESS ENTER OR TAP';
  renderer.title(scene === 'homecoming' ? performance.now() / 1000 : (fixedTitleSec ?? performance.now() / 1000), {
    restored: (part) => (cleared.has(part) ? 1 : 0),
    collapsed: false,
    prompt: dev ? `${go} - DEV: ${stageLabel(dev.name)}` : go,
    beatSec: 60 / 100,
    exit: scene === 'titleOut' ? titleOutSec() : null,
    home: scene === 'homecoming' ? { part: homePart, sec: homeSec() } : null,
  });
}

function draw(): void {
  renderer.begin();
  // 結果画面では止まった時点の様子を表示する
  const songTime =
    scene === 'play' || scene === 'leaving' || (scene === 'backing' && backFrom === 'play')
      ? conductor.songTime()
      : scene === 'view'
        ? viewTick * tickSec
        : // 曲を読み込んでいるあいだ、ステージとチュートリアルでは少女はまだいない（現れる前。ステージは闇の中）
          scene === 'loading' && sim && sim.stage.kind !== 'hub'
          ? -Infinity
          : sim
            ? Math.max(sim.tick, 0) * tickSec
            : 0;
  if (scene === 'ending') {
    renderer.ending(endingSec(), total);
  } else if (scene === 'ruins') {
    renderer.title(performance.now() / 1000, { restored: () => 1, collapsed: true, prompt: null, beatSec: 0.6 });
  } else if (sim && scene !== 'title' && scene !== 'titleOut' && scene !== 'homecoming') {
    renderer.world(sim, songTime, tickSec, clearSec(), scene === 'leaving' ? leaveSec() : null, scene === 'backing' ? backSec() : null);
    // クリア演出と、拠点の入口に入る演出・戻る演出のあいだは HUD を消す（得点は結果の欄で数え上げる）
    if (scene !== 'loading' && scene !== 'leaving' && scene !== 'backing' && clearSec() === null) renderer.hud(sim, songTime, tickSec);
    // 拠点とチュートリアルは、闇から明るくなって始まる（読み込んでいるあいだは闇のまま。ステージは world がカウントに合わせて明るくする）
    if (sim.stage.kind !== 'stage') {
      if (scene === 'loading') renderer.darken(1);
      else if (scene === 'play') renderer.darken(1 - (performance.now() / 1000 - playAt) / FADE_IN);
    }
  }

  if (scene === 'confirm' && confirmKind === 'upstairs') {
    renderer.confirm('REALLY GO UPSTAIRS?', null, confirmYes);
  } else if (scene === 'confirm') {
    drawTitle();
    renderer.confirm('ERASE ALL PROGRESS?', 'CLEARED STAGES AND TOTAL SCORE WILL BE LOST.', confirmYes);
  } else if (scene === 'title' || scene === 'titleOut' || scene === 'homecoming') {
    drawTitle();
  } else if (sim && scene === 'result') {
    const e = clearSec();
    if (e !== null) {
      renderer.clearResult(
        sim,
        e,
        newlyUnlocked ? `A NEW DOOR AT HOME: ${stageLabel(newlyUnlocked)}` : null,
        'ENTER / TAP: GO HOME',
      );
    } else {
      renderer.overlay([
        { text: 'TIME UP', scale: 3, color: '#d0675a' },
        { text: '' },
        { text: `SCORE ${sim.score}`, scale: 2 },
        { text: 'NO GOAL (SCORE KEPT)', color: '#8d857a' },
        { text: `MISS ${sim.misses}`, color: '#8d857a' },
        { text: '' },
        { text: 'ENTER / TAP: RETRY', color: '#e3c56e' },
      ]);
    }
  }

  if (scene === 'play' && steer) renderer.stick(steer);
  renderer.buttons(screenButtons());
  renderer.present();
}

function frame(): void {
  update();
  draw();
  requestAnimationFrame(frame);
}

if (params.has('view')) {
  const [x, y, t] = params.get('view')!.split(',').map(Number);
  setReveal(stage.def);
  sim = newSim();
  for (let i = 0; i <= t; i++) sim.step(i, null);
  sim.debugPlace(x, y);
  viewTick = t;
  scene = 'view';
} else if (params.has('clear')) {
  // ゴールの隣のマスに置き、ゴールへ歩かせてクリアさせる
  sim = newSim();
  const g = stage.goal;
  const dir = (['up', 'down', 'left', 'right'] as Dir[]).find(
    (d) => stage.cell(g.x - DIR_VEC[d].x, g.y - DIR_VEC[d].y)?.terrain === 'floor',
  )!;
  const t0 = Math.min(120 * TICKS_PER_BEAT, sim.totalTicks / 2);
  for (let i = 0; i < t0; i++) sim.step(i, null);
  sim.debugPlace(g.x - DIR_VEC[dir].x, g.y - DIR_VEC[dir].y);
  for (let i = t0; sim.status === 'playing'; i++) sim.step(i, dir);
  fixedClearSec = Number(params.get('clear'));
  scene = 'result';
} else if (params.has('ending')) {
  fixedEndingSec = Number(params.get('ending'));
  scene = 'ending';
} else if (params.has('home')) {
  const name = params.get('home')!;
  cleared.add(name);
  pendingReveal = name;
  homecoming(name, () => goHub(name));
} else if (params.has('upstairs')) {
  goHub(UPSTAIRS);
} else if (params.has('autostart')) {
  startGame();
}

// 自動テスト（Playwright）から状態を読むための窓口。開発サーバーのときだけ
if (import.meta.env.DEV) {
  Object.assign(window, {
    __game: {
      get scene() {
        return scene;
      },
      get sim() {
        return sim;
      },
      get layout() {
        return renderer.layout;
      },
    },
  });
}

requestAnimationFrame(frame);
