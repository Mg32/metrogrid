import './style.css';
import { Metronome, type Conductor } from './audio/conductor.ts';
import { Sfx } from './audio/sfx.ts';
import { InputRecorder, makePlayLog } from './game/playlog.ts';
import { createRandom, randomSeed } from './game/random.ts';
import { Sim } from './game/sim.ts';
import { Stage } from './game/stage.ts';
import { STAGE_ORDER, STAGES } from './game/stages/index.ts';
import { DIR_VEC, TICKS_PER_BEAT, type Dir } from './game/types.ts';
import { Input } from './input.ts';
import { CLEAR, Renderer } from './render/renderer.ts';

/**
 * 開発用の URL パラメータ
 *   ?autostart        タイトルを飛ばして始める
 *   ?seed=N           乱数のシードを固定する（危険物の開始位置が毎回同じになる）
 *   ?stage=NAME       ステージを選ぶ（既定は最初のステージ）
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
const stage = new Stage(STAGES[params.get('stage') ?? ''] ?? STAGE_ORDER[0]);
const tickSec = 60 / stage.def.bpm / TICKS_PER_BEAT;

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

function newSim(): Sim {
  seed = fixedSeed ?? randomSeed();
  recorder = new InputRecorder();
  return new Sim(stage, createRandom(seed));
}

async function startPlay(): Promise<void> {
  if (scene === 'loading') return;
  scene = 'loading';
  conductor.stop();
  sfx.stop();
  input.clearPressed();
  sim = newSim();
  await conductor.start({ bpm: stage.def.bpm, bars: stage.def.bars, countInBars: 1 });
  scene = 'play';
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
  if (s.status === 'cleared') {
    clearedAt = performance.now() / 1000;
    sfx.clear(CLEAR.rows.map((r) => CLEAR.panel + r));
  }
  // 開発サーバーでは、最後まで遊んだ記録を playlogs/ に保存する（自動テストのプレイは残さない）
  if (import.meta.env.DEV && !navigator.webdriver) {
    void fetch('/__playlog', { method: 'POST', body: JSON.stringify(makePlayLog(s, seed, recorder)) }).catch(() => {});
  }
}

canvas.addEventListener('pointerdown', () => {
  if (scene === 'title' || scene === 'result') void startPlay();
});

function update(): void {
  const start = input.consumePressed('Enter') || input.consumePressed('Space');
  const esc = input.consumePressed('Escape');
  const retry = input.consumePressed('KeyR');

  if (scene === 'title') {
    if (start) void startPlay();
  } else if (scene === 'result') {
    const e = clearSec();
    if (e !== null && e < CLEAR.end && (start || retry)) {
      // 演出の途中で押したら、数え終わったところまで飛ばす
      clearedAt = performance.now() / 1000 - CLEAR.end;
      sfx.stop();
    } else if (start || retry) void startPlay();
    else if (esc) toTitle();
  } else if (scene === 'play' && sim) {
    if (esc) return toTitle();
    if (retry) {
      void startPlay();
      return;
    }
    const now = Math.floor(conductor.songTime() / tickSec);
    while (sim.tick < now && sim.status === 'playing') {
      const held = input.current();
      recorder.record(sim.tick + 1, held);
      sim.step(sim.tick + 1, held);
    }
    if (sim.status !== 'playing') finishPlay(sim);
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
    renderer.overlay([
      { text: 'METROGRID', scale: 3 },
      { text: stage.def.name.replace(/(\d+)$/, ' $1'), color: '#8d857a' },
      { text: '' },
      { text: 'HOLD ARROWS (WASD) TO WALK' },
      { text: 'ONE STEP PER COUNT' },
      { text: 'FADED ROADS ARE FASTER: 1/4 1/8 1/16', color: '#8d857a' },
      { text: '' },
      { text: 'ENTER / SPACE / CLICK TO START', color: '#e3c56e' },
      { text: 'R: RETRY   ESC: TITLE', color: '#8d857a' },
    ]);
  } else if (sim && scene === 'result') {
    const e = clearSec();
    if (e !== null) {
      renderer.clearResult(sim, e);
    } else {
      renderer.overlay([
        { text: 'TIME UP', scale: 3, color: '#d0675a' },
        { text: '' },
        { text: `SCORE ${sim.score}`, scale: 2 },
        { text: 'NO GOAL (SCORE KEPT)', color: '#8d857a' },
        { text: `MISS ${sim.misses}`, color: '#8d857a' },
        { text: '' },
        { text: 'ENTER: RETRY   ESC: TITLE', color: '#e3c56e' },
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
  const t0 = 120 * TICKS_PER_BEAT;
  for (let i = 0; i < t0; i++) sim.step(i, null);
  sim.debugPlace(g.x - DIR_VEC[dir].x, g.y - DIR_VEC[dir].y);
  for (let i = t0; sim.status === 'playing'; i++) sim.step(i, dir);
  fixedClearSec = Number(params.get('clear'));
  scene = 'result';
} else if (params.has('autostart')) {
  void startPlay();
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
