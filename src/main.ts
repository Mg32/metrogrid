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
  if (sim && scene !== 'title') renderer.world(sim, Math.max(songTime, 0), tickSec);
  renderer.present();

  if (scene === 'title') {
    renderer.overlay([
      { text: 'metrogrid', size: 20 },
      { text: '試作版 / テストステージ', color: '#8d857a' },
      { text: '' },
      { text: '方向キー（WASD）を押しっぱなしで、拍ごとに1マス進む' },
      { text: '景色の薄い場所ほど速く進む（♩ → ♪ → ♬）', color: '#8d857a' },
      { text: '' },
      { text: 'Enter / Space / クリックで開始', color: '#e3c56e' },
      { text: 'プレイ中　R: やり直し　Esc: タイトル', size: 7, color: '#8d857a' },
    ]);
    return;
  }
  if (!sim) return;
  if (scene !== 'loading') renderer.hud(sim, songTime, tickSec);
  if (scene === 'result') {
    const cleared = sim.status === 'cleared';
    renderer.overlay([
      { text: cleared ? 'CLEAR' : 'TIME UP', size: 20, color: cleared ? '#cfe3f0' : '#d0675a' },
      { text: '' },
      { text: `SCORE ${sim.score}`, size: 12 },
      { text: cleared ? `ゴールボーナス ${sim.goalBonus}` : 'ゴールに届かなかった（得点は記録）', color: '#8d857a' },
      { text: `ミス ${sim.misses}`, color: '#8d857a' },
      { text: '' },
      { text: 'Enter: もう一度　Esc: タイトル', color: '#e3c56e' },
    ]);
  }
}

function frame(): void {
  update();
  draw();
  requestAnimationFrame(frame);
}

// 開発用：?autostart でタイトルを飛ばす
if (new URLSearchParams(location.search).has('autostart')) void startPlay();
requestAnimationFrame(frame);
