/**
 * 曲の再生と時間の基準。ゲームロジックは songTime() だけを見て進む。
 * いまは仮のメトロノーム（Metronome）だけ。曲に差し替えるときは、
 * 同じインターフェースで音源を再生するクラスを作り、songTime() が曲の頭（1小節目の1拍目）で 0 になるようにする。
 */
export interface Conductor {
  /** 再生開始。countInBars 小節のカウントのあと songTime() = 0 になる */
  start(opts: { bpm: number; bars: number; countInBars: number }): Promise<void>;
  stop(): void;
  /** 曲の頭からの経過秒（実際に聞こえている位置）。カウント中は負 */
  songTime(): number;
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

  async start(opts: { bpm: number; bars: number; countInBars: number }): Promise<void> {
    this.stop();
    this.ctx ??= new AudioContext({ latencyHint: 'interactive' });
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
    const latency = this.ctx.outputLatency || this.ctx.baseLatency || 0;
    return this.ctx.currentTime - latency - this.startAt;
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
