import { audioContext, unlockAudio } from './context.ts';
import { loadSound } from './sounds.ts';

/**
 * 曲の再生と時間の基準。ゲームロジックは songTime() だけを見て進む。
 * 曲のファイル（sound/music/<ステージ名>.wav から書き出したもの）があればそれを鳴らし、なければ仮のメトロノームを鳴らす。
 * どちらでも songTime() は曲の頭（1小節目の1拍目）で 0 になる
 */
export interface Conductor {
  /**
   * 再生開始。countInBars 小節のカウントのあと songTime() = 0 になる。
   * track は曲のファイルの名前（ステージ名）、loop は曲を繰り返すか（拠点）
   */
  start(opts: { bpm: number; bars: number; countInBars: number; track?: string; loop?: boolean }): Promise<void>;
  stop(): void;
  /**
   * 音を鳴らせるようにする。スマホ（特に iOS）では、タップやキーのイベントの処理の中で呼ばないと音が出ない。
   * 何度呼んでもよい
   */
  unlock(): void;
  /** 曲の頭からの経過秒（実際に聞こえている位置）。カウント中は負 */
  songTime(): number;
}

/**
 * 曲のファイルの頭から、1小節目の1拍目（songTime = 0）までの秒数。ここに書かない曲は、カウントの長さちょうど
 * （ステージは1小節、拠点は0小節。つまりステージの曲は、頭に1小節の前奏を入れておく）。
 * 前奏の長さを変えたいときは、ここに秒数を書く（例：STAGE1: 4.25）
 */
export const MUSIC_OFFSET: Record<string, number> = {};

/** 出力の遅れを除いた、いま聞こえている AudioContext の時刻 */
function heardTime(ctx: AudioContext): number {
  const latency = ctx.outputLatency || ctx.baseLatency || 0;
  return ctx.currentTime - latency;
}

/** 4/4拍子のメトロノーム。1拍目にアクセント、カウントは音を変える */
export class Metronome implements Conductor {
  private ctx: AudioContext | null = null;
  private startAt = 0;
  private beatSec = 0.5;
  private nextBeat = 0;
  private endBeat = 0;
  private timer = 0;
  private master: GainNode | null = null;

  unlock(): void {
    unlockAudio();
  }

  async start(opts: { bpm: number; bars: number; countInBars: number }): Promise<void> {
    this.stop();
    this.ctx = audioContext();
    await this.ctx.resume();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(ctx.destination);

    this.beatSec = 60 / opts.bpm;
    this.nextBeat = -opts.countInBars * 4;
    this.endBeat = opts.bars * 4;
    this.startAt = ctx.currentTime + 0.1 - this.nextBeat * this.beatSec;
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
    this.master?.disconnect();
    this.master = null;
  }

  songTime(): number {
    if (!this.ctx) return -Infinity;
    return heardTime(this.ctx) - this.startAt;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const horizon = ctx.currentTime + 0.12;
    while (this.nextBeat < this.endBeat) {
      const at = this.startAt + this.nextBeat * this.beatSec;
      if (at >= horizon) break;
      const accent = ((this.nextBeat % 4) + 4) % 4 === 0;
      const countIn = this.nextBeat < 0;
      this.click(at, countIn ? 880 : accent ? 1760 : 1175, accent ? 1 : 0.6);
      this.nextBeat++;
    }
  }

  private click(at: number, freq: number, level: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + 0.002);
    env.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
    osc.connect(env).connect(this.master!);
    osc.start(at);
    osc.stop(at + 0.06);
  }
}

/**
 * 曲のファイルを鳴らす。ファイルがなければ、代わりにメトロノームを鳴らす。
 * 曲のテンポは途中で変えない（企画書 第2.1節）。BPM と長さはステージの定義（bpm・bars）と合わせて作る
 */
export class Music implements Conductor {
  private metronome = new Metronome();
  private useMetronome = false;
  private src: AudioBufferSourceNode | null = null;
  private zeroAt = 0;
  /** start() を呼ぶたびに増える。読み込みを待つあいだに次の start()・stop() が来たら、古いほうは鳴らさない */
  private generation = 0;

  unlock(): void {
    unlockAudio();
  }

  async start(opts: { bpm: number; bars: number; countInBars: number; track?: string; loop?: boolean }): Promise<void> {
    this.stop();
    const gen = this.generation;
    const buf = opts.track ? await loadSound(`music/${opts.track}`) : null;
    if (gen !== this.generation) return;
    if (!buf) {
      this.useMetronome = true;
      return this.metronome.start(opts);
    }
    this.useMetronome = false;
    const ctx = audioContext();
    await ctx.resume();
    if (gen !== this.generation) return;
    const barSec = (60 / opts.bpm) * 4;
    const offset = MUSIC_OFFSET[opts.track!] ?? opts.countInBars * barSec;
    if (import.meta.env.DEV && !opts.loop) {
      // 曲の長さがステージの長さ（前奏＋bars 小節）と大きく違えば知らせる。足りないと、終わる前に無音になる
      const want = offset + opts.bars * barSec;
      if (Math.abs(buf.duration - want) > 0.5) {
        console.warn(`music/${opts.track}: 曲の長さ ${buf.duration.toFixed(2)} 秒。ステージは前奏を含めて ${want.toFixed(2)} 秒（BPM ${opts.bpm}、${opts.bars} 小節）`);
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    // 拠点の曲は繰り返す（拍がずれないよう、曲の長さはちょうど小節の倍数にしておく）
    src.loop = opts.loop ?? false;
    src.connect(ctx.destination);
    const at = ctx.currentTime + 0.1;
    src.start(at);
    this.src = src;
    this.zeroAt = at + offset;
  }

  stop(): void {
    this.generation++;
    this.metronome.stop();
    if (this.src) {
      try {
        this.src.stop();
      } catch {
        // まだ始まっていない
      }
      this.src.disconnect();
      this.src = null;
    }
  }

  songTime(): number {
    if (this.useMetronome) return this.metronome.songTime();
    if (!this.src) return -Infinity;
    return heardTime(audioContext()) - this.zeroAt;
  }
}
