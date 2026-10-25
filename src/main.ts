import './style.css';
import { Metronome, type Conductor } from './audio/conductor.ts';
import { Sim } from './game/sim.ts';
import { Stage } from './game/stage.ts';
import { testStage } from './game/stages/test.ts';
import { TICKS_PER_BEAT } from './game/types.ts';
import { Input } from './input.ts';
import { Renderer } from './render/renderer.ts';

const canvas = document.createElement('canvas');
document.querySelector<HTMLDivElement>('#app')!.append(canvas);

const input = new Input(window);
const renderer = new Renderer(canvas);
const conductor: Conductor = new Metronome();
const stage = new Stage(testStage);
const tickSec = 60 / stage.def.bpm / TICKS_PER_BEAT;

type Scene = 'title' | 'loading' | 'play' | 'result';
let scene: Scene = 'title';
let sim: Sim | null = null;

async function startPlay(): Promise<void> {
  if (scene === 'loading') return;
  scene = 'loading';
  conductor.stop();
  input.clearPressed();
  sim = new Sim(stage);
  await conductor.start({ bpm: stage.def.bpm, bars: stage.def.bars, countInBars: 1 });
  scene = 'play';
}

function toTitle(): void {
  conductor.stop();
  input.clearPressed();
  sim = null;
  scene = 'title';
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
    if (start || retry) void startPlay();
    else if (esc) toTitle();
  } else if (scene === 'play' && sim) {
    if (esc) return toTitle();
    if (retry) {
      void startPlay();
      return;
    }
    const now = Math.floor(conductor.songTime() / tickSec);
    while (sim.tick < now && sim.status === 'playing') sim.step(sim.tick + 1, input.current());
    if (sim.status !== 'playing') {
      conductor.stop();
      input.clearPressed();
      scene = 'result';
    }
  }
}

function draw(): void {
  renderer.begin();
  // 結果画面では止まった時点の様子を表示する
  const songTime = scene === 'play' ? conductor.songTime() : sim ? Math.max(sim.tick, 0) * tickSec : 0;
  if (sim && scene !== 'title') {
    renderer.world(sim, Math.max(songTime, 0), tickSec);
    if (scene !== 'loading') renderer.hud(sim, songTime, tickSec);
  }

  if (scene === 'title') {
    renderer.overlay([
      { text: 'METROGRID', scale: 3 },
      { text: 'PROTOTYPE / TEST STAGE', color: '#8d857a' },
      { text: '' },
      { text: 'HOLD ARROWS (WASD) TO WALK' },
      { text: 'ONE STEP PER COUNT' },
      { text: 'FADED ROADS ARE FASTER: 1/4 1/8 1/16', color: '#8d857a' },
      { text: '' },
      { text: 'ENTER / SPACE / CLICK TO START', color: '#e3c56e' },
      { text: 'R: RETRY   ESC: TITLE', color: '#8d857a' },
    ]);
  } else if (sim && scene === 'result') {
    const cleared = sim.status === 'cleared';
    renderer.overlay([
      { text: cleared ? 'CLEAR' : 'TIME UP', scale: 3, color: cleared ? '#cfe3f0' : '#d0675a' },
      { text: '' },
      { text: `SCORE ${sim.score}`, scale: 2 },
      { text: cleared ? `GOAL BONUS ${sim.goalBonus}` : 'NO GOAL (SCORE KEPT)', color: '#8d857a' },
      { text: `MISS ${sim.misses}`, color: '#8d857a' },
      { text: '' },
      { text: 'ENTER: RETRY   ESC: TITLE', color: '#e3c56e' },
    ]);
  }

  renderer.present();
}

function frame(): void {
  update();
  draw();
  requestAnimationFrame(frame);
}

// 開発用：?autostart でタイトルを飛ばす
if (new URLSearchParams(location.search).has('autostart')) void startPlay();
requestAnimationFrame(frame);
