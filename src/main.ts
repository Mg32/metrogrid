import './style.css';
import { Metronome, type Conductor } from './audio/conductor.ts';
import { Sfx } from './audio/sfx.ts';
import { InputRecorder, makePlayLog } from './game/playlog.ts';
import { createRandom, randomSeed } from './game/random.ts';
import { Sim } from './game/sim.ts';
import { Stage, type StageDef } from './game/stage.ts';
import { buildHub, hubReturnCell } from './game/stages/hub.ts';
import { STAGE_ORDER, STAGES, tutorial } from './game/stages/index.ts';
import { DIR_VEC, TICKS_PER_BEAT, type Dir, type Vec } from './game/types.ts';
import { Input } from './input.ts';
import { loadCleared, saveCleared } from './progress.ts';
import { CLEAR, Renderer } from './render/renderer.ts';

/**
 * 遊ぶ流れ：タイトル →（はじめてならチュートリアル。S でスキップ）→ 拠点（家の中）→ 入口からステージへ → 結果 → 拠点へ戻る
 *
 * 開発用の URL パラメータ
 *   ?autostart        タイトルを飛ばして始める
 *   ?seed=N           乱数のシードを固定する（危険物の開始位置が毎回同じになる）
 *   ?stage=NAME       タイトルから、拠点を通さずにそのステージを遊ぶ（TUTORIAL、TEST、HUB も指定できる）
 *   ?cleared=A,B      クリアの記録をこの内容に差し替える（保存しない。拠点の見た目の確認用）
 *   ?view=X,Y,TICK    音を鳴らさず、TICK まで何もせず進めた状態でプレイヤーを (X,Y) に置いて静止表示する
 *   ?clear=SEC        音を鳴らさず、ゴールしてから SEC 秒後のクリア演出を静止表示する
 */
const params = new URLSearchParams(location.search);
const fixedSeed = params.has('seed') ? Number(params.get('seed')) : null;

const canvas = document.createElement('canvas');
document.querySelector<HTMLDivElement>('#app')!.append(canvas);

const input = new Input(window);
const renderer = new Renderer(canvas);
const conductor: Conductor = new Metronome();
const sfx = new Sfx();
/** クリアしたステージ（チュートリアルは、クリアかスキップで 'TUTORIAL' が入る） */
const devCleared = params.get('cleared');
const cleared = devCleared !== null ? new Set(devCleared.split(',').filter(Boolean)) : loadCleared();
const save = () => {
  if (devCleared === null) saveCleared(cleared);
};
renderer.portalNote = (name) => (cleared.has(name) ? 'CLEARED' : null);

/** ?stage=NAME で直接遊ぶステージ */
const devStage = params.get('stage');
const devDef = (): StageDef | null => (devStage === 'HUB' ? buildHub(cleared) : (STAGES[devStage ?? ''] ?? null));

let stage = new Stage(devDef() ?? STAGE_ORDER[0]);
let tickSec = 60 / stage.def.bpm / TICKS_PER_BEAT;
/** このクリアで拠点に新しく現れた入口（結果の欄に出す） */
let newlyUnlocked: string | null = null;

const stageLabel = (name: string) => name.replace(/(\d+)$/, ' $1');

type Scene = 'title' | 'loading' | 'play' | 'result' | 'view';
let scene: Scene = 'title';
let sim: Sim | null = null;
let seed = 0;
let recorder = new InputRecorder();
/** view のときに表示する tick */
let viewTick = 0;
/** ゴールした時刻（performance.now() の秒）。クリア演出の経過秒はここから数える。?clear では固定の経過秒 */
let clearedAt = 0;
let fixedClearSec: number | null = null;

function clearSec(): number | null {
  if (sim?.status !== 'cleared') return null;
  return fixedClearSec ?? performance.now() / 1000 - clearedAt;
}

function setStage(def: StageDef): void {
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
  sim = newSim(start);
  // 拠点はカウントなしですぐ歩ける
  await conductor.start({ bpm: stage.def.bpm, bars: stage.def.bars, countInBars: stage.kind === 'hub' ? 0 : 1 });
  scene = 'play';
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

function skipTutorial(): void {
  cleared.add(tutorial.name);
  save();
  goHub();
}

function toTitle(): void {
  conductor.stop();
  sfx.stop();
  input.clearPressed();
  sim = null;
  scene = 'title';
}

function finishPlay(s: Sim): void {
  conductor.stop();
  input.clearPressed();
  scene = 'result';
  newlyUnlocked = null;
  if (s.status === 'cleared') {
    clearedAt = performance.now() / 1000;
    sfx.clear(CLEAR.rows.map((r) => CLEAR.panel + r));
    const name = s.stage.def.name;
    if (!cleared.has(name)) {
      cleared.add(name);
      save();
      const i = STAGE_ORDER.findIndex((d) => d.name === name);
      if (i >= 0 && i + 1 < STAGE_ORDER.length) newlyUnlocked = STAGE_ORDER[i + 1].name;
    }
  }
  // 開発サーバーでは、最後まで遊んだ記録を playlogs/ に保存する（自動テストのプレイは残さない）
  if (import.meta.env.DEV && !navigator.webdriver) {
    void fetch('/__playlog', { method: 'POST', body: JSON.stringify(makePlayLog(s, seed, recorder)) }).catch(() => {});
  }
}

/** 結果画面で Enter：チュートリアルをクリアしたら拠点へ、それ以外はもう一度 */
function resultContinue(s: Sim): void {
  if (s.stage.kind === 'tutorial' && s.status === 'cleared') goHub();
  else void play(s.stage.def);
}

/** 結果画面で Esc：拠点へ戻る（?stage で直接遊んでいたときはタイトルへ） */
function resultBack(s: Sim): void {
  if (devDef()) toTitle();
  else goHub(s.stage.def.name);
}

canvas.addEventListener('pointerdown', () => {
  if (scene === 'title') startGame();
  else if (scene === 'result' && sim) resultContinue(sim);
});

function update(): void {
  const start = input.consumePressed('Enter') || input.consumePressed('Space');
  const esc = input.consumePressed('Escape');
  const retry = input.consumePressed('KeyR');
  const skip = input.consumePressed('KeyS');
  const tut = input.consumePressed('KeyT');

  if (scene === 'title') {
    if (start) startGame();
    else if (skip && !cleared.has(tutorial.name)) skipTutorial();
    else if (tut && cleared.has(tutorial.name)) void play(tutorial);
  } else if (scene === 'result' && sim) {
    const e = clearSec();
    if (e !== null && e < CLEAR.end && (start || retry)) {
      // 演出の途中で押したら、数え終わったところまで飛ばす
      clearedAt = performance.now() / 1000 - CLEAR.end;
      sfx.stop();
    } else if (start) resultContinue(sim);
    else if (retry) void play(sim.stage.def);
    else if (esc) resultBack(sim);
  } else if (scene === 'play' && sim) {
    const kind = sim.stage.kind;
    if (esc) {
      if (kind === 'stage' && !devDef()) goHub(sim.stage.def.name);
      else toTitle();
      return;
    }
    if (kind === 'tutorial' && skip) return skipTutorial();
    if (retry && kind !== 'hub') {
      void play(sim.stage.def);
      return;
    }
    const now = Math.floor(conductor.songTime() / tickSec);
    while (sim.tick < now && sim.status === 'playing') {
      const held = input.current();
      recorder.record(sim.tick + 1, held);
      sim.step(sim.tick + 1, held);
    }
    if (sim.status === 'portal') {
      const target = STAGES[sim.portal!];
      if (target) void play(target);
    } else if (sim.status !== 'playing') finishPlay(sim);
  }
}

function draw(): void {
  renderer.begin();
  // 結果画面では止まった時点の様子を表示する
  const songTime =
    scene === 'play' ? conductor.songTime() : scene === 'view' ? viewTick * tickSec : sim ? Math.max(sim.tick, 0) * tickSec : 0;
  if (sim && scene !== 'title') {
    renderer.world(sim, songTime, tickSec, clearSec());
    // クリア演出のあいだは HUD を消す（得点は結果の欄で数え上げる）
    if (scene !== 'loading' && clearSec() === null) renderer.hud(sim, songTime, tickSec);
  }

  if (scene === 'title') {
    const first = !cleared.has(tutorial.name);
    const dev = devDef();
    renderer.overlay([
      { text: 'METROGRID', scale: 3 },
      { text: dev ? `DEV: ${stageLabel(dev.name)}` : '', color: '#8d857a' },
      { text: '' },
      { text: 'HOLD ARROWS (WASD) TO WALK' },
      { text: 'ONE STEP PER COUNT' },
      { text: 'FADED ROADS ARE FASTER: 1/4 1/8 1/16', color: '#8d857a' },
      { text: '' },
      { text: 'ENTER / SPACE / CLICK TO START', color: '#e3c56e' },
      { text: first ? 'S: SKIP TUTORIAL' : 'T: PLAY TUTORIAL AGAIN', color: '#8d857a' },
    ]);
  } else if (sim && scene === 'result') {
    const e = clearSec();
    const tutorialDone = sim.stage.kind === 'tutorial' && e !== null;
    if (e !== null) {
      renderer.clearResult(
        sim,
        e,
        newlyUnlocked ? `A NEW DOOR AT HOME: ${stageLabel(newlyUnlocked)}` : null,
        tutorialDone ? 'ENTER: GO HOME   R: AGAIN' : 'ENTER: RETRY   ESC: HOME',
      );
    } else {
      renderer.overlay([
        { text: 'TIME UP', scale: 3, color: '#d0675a' },
        { text: '' },
        { text: `SCORE ${sim.score}`, scale: 2 },
        { text: 'NO GOAL (SCORE KEPT)', color: '#8d857a' },
        { text: `MISS ${sim.misses}`, color: '#8d857a' },
        { text: '' },
        { text: 'ENTER: RETRY   ESC: HOME', color: '#e3c56e' },
      ]);
    }
  }

  renderer.present();
}

function frame(): void {
  update();
  draw();
  requestAnimationFrame(frame);
}

if (params.has('view')) {
  const [x, y, t] = params.get('view')!.split(',').map(Number);
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
