/**
 * 効果音（曲とは別。クリアのジングルと、エンディングの音）。
 * プレイ開始のキー操作のあとに鳴らすので、AudioContext はその時点で作ってよい
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  /**
   * クリアのジングル。光が立つところで上がっていく分散和音、結果の各行が出るたびに短い音、
   * 合計が出たところで和音。rowTimes は結果の各行が出る時刻（いまからの秒）
   */
  clear(rowTimes: number[]): void {
    this.stop();
    this.ctx ??= new AudioContext();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.25;
    this.master.connect(ctx.destination);
    const now = ctx.currentTime + 0.05;

    // 光が立つ：C5 E5 G5 C6 E6 と上がり、最後を伸ばす
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => this.note(now + 0.1 + i * 0.09, f, i === 4 ? 1.2 : 0.3, 'triangle', 0.7));
    rowTimes.forEach((at, i) => {
      const last = i === rowTimes.length - 1;
      if (last) {
        // 合計：C メジャーの和音
        for (const f of [523.25, 659.25, 783.99, 1046.5]) this.note(now + at, f, 1.4, 'triangle', 0.45);
      } else {
        this.note(now + at, 1568 + i * 200, 0.08, 'square', 0.25);
      }
    });
  }

  /**
   * エンディングの音。少女の光が強まるにつれて低いうなりと高い響きが上がっていき、得点を使い切ると轟音が聞こえはじめる。
   * 家が潰れるたびに崩れる音。轟音は揺れが収まる頃に消える。times はエンディングの時刻（ENDING）、from はいま何秒目か
   */
  ending(times: { light: number[]; rumble: number; jerks: number[]; settle: number }, from = 0): void {
    this.stop();
    this.ctx ??= new AudioContext();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.3;
    this.master.connect(ctx.destination);
    const at = (sec: number) => ctx.currentTime + 0.05 + Math.max(0, sec - from);
    const [l0, l1] = times.light;

    // 光：低いうなり（2音）と、上がっていく高い響き
    for (const [f0, f1, type, level] of [
      [98, 131, 'sine', 0.5],
      [147, 196, 'sine', 0.3],
      [880, 1760, 'triangle', 0.06],
    ] as const) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, at(l0));
      osc.frequency.exponentialRampToValueAtTime(f1, at(l1));
      env.gain.setValueAtTime(0, at(l0));
      env.gain.linearRampToValueAtTime(level, at(l1));
      env.gain.linearRampToValueAtTime(0, at(l1 + 3));
      osc.connect(env).connect(this.master);
      osc.start(at(l0));
      osc.stop(at(l1 + 3.1));
    }

    // 轟音：低くこもったノイズ
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      // ブラウンノイズ（低い音が多い）
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    const rumble = ctx.createBufferSource();
    rumble.buffer = noise;
    rumble.loop = true;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 160;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at(times.rumble));
    env.gain.linearRampToValueAtTime(0.9, at(times.rumble + 3));
    env.gain.linearRampToValueAtTime(1.4, at(times.jerks[times.jerks.length - 1]));
    env.gain.linearRampToValueAtTime(0, at(times.settle));
    rumble.connect(low).connect(env).connect(this.master);
    rumble.start(at(times.rumble));
    rumble.stop(at(times.settle + 0.1));

    // 潰れるたびの崩れる音
    for (const j of times.jerks) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const band = ctx.createBiquadFilter();
      band.type = 'lowpass';
      band.frequency.value = 700;
      const e = ctx.createGain();
      e.gain.setValueAtTime(0, at(j));
      e.gain.linearRampToValueAtTime(1.6, at(j + 0.05));
      e.gain.exponentialRampToValueAtTime(0.001, at(j + 1.6));
      src.connect(band).connect(e).connect(this.master);
      src.start(at(j));
      src.stop(at(j + 1.7));
    }
  }

  stop(): void {
    this.master?.disconnect();
    this.master = null;
  }

  private note(at: number, freq: number, len: number, type: OscillatorType, level: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, at + len);
    osc.connect(env).connect(this.master!);
    osc.start(at);
    osc.stop(at + len + 0.05);
  }
}
