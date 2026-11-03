import { audioContext, audioOut, unlockAudio } from './context.ts';
import { preloadSounds, soundNow } from './sounds.ts';

/**
 * 効果音（曲とは別。得点マスを取った音、クリアのジングル、エンディングの音）。
 * それぞれ sound/sfx/ に WAV（pickup・clear・ending）を置けばそのファイルを鳴らし、なければここで合成した音を鳴らす。
 * プレイ開始のキー操作のあとに鳴らすので、AudioContext はその時点で作ってよい
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  /** 新しい出口（stop() で止まる）を作る */
  private open(level: number): AudioContext {
    this.stop();
    this.ctx = audioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = level;
    this.master.connect(audioOut());
    return this.ctx;
  }

  /** ファイルの音を、at（AudioContext の時刻）から、ファイルの from 秒目から鳴らす */
  private playFile(buf: AudioBuffer, at: number, out: AudioNode, from = 0, rate = 1): void {
    const src = this.ctx!.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.connect(out);
    src.start(at, from);
  }

  /**
   * クリアのジングル。光が立つところで上がっていく分散和音、結果の各行が出るたびに短い音、
   * 合計が出たところで和音。rowTimes は結果の各行が出る時刻（いまからの秒）
   */
  clear(rowTimes: number[]): void {
    const file = soundNow('sfx/clear');
    const ctx = this.open(file ? 1 : 0.25);
    const now = ctx.currentTime + 0.05;
    // ファイルは、ゴールした瞬間から鳴らす（結果の行が出る時刻は render/renderer.ts の CLEAR）
    if (file) return this.playFile(file, now, this.master!);

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
   * エンディングの音。少女の光が強まるにつれて低いうなりと高い響きが上がっていき、得点を使い切っても高い響きはさらに高くまで上がって、
   * ふっと止む（climax）。少女が家に入って戸を閉めたあと、何かが発動した音（澄んだ金属の響きと低い衝撃。エコーが尾を引く）が鳴り（trigger）、
   * 鳴りやんで 2 秒ほど静まったあと、轟音が聞こえはじめる（rumble）。家が潰れるたびに崩れる音。轟音は揺れが収まる頃に消える。times はエンディングの時刻（ENDING）、from はいま何秒目か
   */
  ending(times: { light: number[]; climax: number; trigger: number; rumble: number; jerks: number[]; settle: number }, from = 0): void {
    const file = soundNow('sfx/ending');
    // 合成の音は、もとの 0.3 から 3dB 上げてある
    const ctx = this.open(file ? 1 : 0.3 * 10 ** (3 / 20));
    // ファイルは、エンディングの 0 秒目（拠点が闇に沈みきったところ）から鳴らす（各場面の時刻は render/ending.ts の ENDING）
    const master = this.master!;
    if (file) return this.playFile(file, ctx.currentTime + 0.05, master, from);
    const at = (sec: number) => ctx.currentTime + 0.05 + Math.max(0, sec - from);
    const [l0, l1] = times.light;
    const top = times.climax;
    const tr = times.trigger;

    // 光：低いうなり（2音）と、上がっていく高い響き。得点を使い切るまで（l1）は、うなりは5度ほど、響きは1オクターブ上がる。
    // そのあと響きはさらに2オクターブ、うなりも少しだけ上がり、climax ですべて止む
    for (const [f0, f1, f2, type, level] of [
      [98, 131, 147, 'sine', 0.5],
      [147, 196, 220, 'sine', 0.3],
      [880, 1760, 7040, 'triangle', 0.06],
    ] as const) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, at(l0));
      osc.frequency.exponentialRampToValueAtTime(f1, at(l1));
      osc.frequency.exponentialRampToValueAtTime(f2, at(top));
      env.gain.setValueAtTime(0, at(l0));
      env.gain.linearRampToValueAtTime(level, at(l1));
      env.gain.setValueAtTime(level, at(top));
      env.gain.linearRampToValueAtTime(0, at(top + 0.08));
      osc.connect(env).connect(master);
      osc.start(at(l0));
      osc.stop(at(top + 0.1));
    }

    // 発動：エコー（遅れて返ってくる音が、少しずつこもりながら小さくなっていく）
    const echo = ctx.createDelay(1);
    echo.delayTime.value = 0.34;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.5;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2600;
    echo.connect(damp).connect(feedback).connect(echo);
    const wet = ctx.createGain();
    wet.gain.value = 0.7;
    damp.connect(wet).connect(master);
    const send = ctx.createGain();
    send.connect(master);
    send.connect(echo);
    // 澄んだ金属の響き（3520Hz を頭に、鐘のように倍音をずらす）
    for (const [f, level, len] of [
      [3520, 0.12, 1.6],
      [2349, 0.1, 2.2],
      [1760, 0.14, 2.8],
      [5274, 0.05, 0.9],
    ] as const) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      env.gain.setValueAtTime(0, at(tr));
      env.gain.linearRampToValueAtTime(level, at(tr) + 0.004);
      env.gain.exponentialRampToValueAtTime(0.001, at(tr) + len);
      osc.connect(env).connect(send);
      osc.start(at(tr));
      osc.stop(at(tr) + len + 0.05);
    }
    // 低い衝撃：一気に沈む低音
    {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, at(tr));
      osc.frequency.exponentialRampToValueAtTime(38, at(tr) + 0.5);
      env.gain.setValueAtTime(0, at(tr));
      env.gain.linearRampToValueAtTime(1.1, at(tr) + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, at(tr) + 0.9);
      osc.connect(env).connect(send);
      osc.start(at(tr));
      osc.stop(at(tr) + 1);
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
    rumble.connect(low).connect(env).connect(master);
    rumble.start(at(times.rumble));
    rumble.stop(at(times.settle + 0.1));

    // 発動の一瞬の、明るいノイズ（轟音のノイズは低い音ばかりなので、別に白いノイズを作る）
    {
      const white = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.3), ctx.sampleRate);
      const w = white.getChannelData(0);
      for (let i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = white;
      const high = ctx.createBiquadFilter();
      high.type = 'highpass';
      high.frequency.value = 3000;
      const e = ctx.createGain();
      e.gain.setValueAtTime(0, at(tr));
      e.gain.linearRampToValueAtTime(0.5, at(tr) + 0.005);
      e.gain.exponentialRampToValueAtTime(0.001, at(tr) + 0.25);
      src.connect(high).connect(e).connect(send);
      src.start(at(tr));
      src.stop(at(tr) + 0.3);
    }

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
      src.connect(band).connect(e).connect(master);
      src.start(at(j));
      src.stop(at(j + 1.7));
    }
  }

  /** 音を鳴らせるようにする（タップやキーのイベントの処理の中で呼ぶ。スマホでは、そうしないと音が出ない） */
  unlock(): void {
    unlockAudio();
    // 効果音のファイルを、鳴らす前に読み込んでおく
    preloadSounds('sfx/');
  }

  /**
   * 得点マスを取った音：短く2音上がる。連続で取って倍率が上がるほど高くなる（倍率 1 で C6、1 上がるごとに全音ずつ）。
   * ファイルのときも、同じだけ再生速度を上げて高くする。
   * クリアのジングルとは別の出口から鳴らすので、stop() では止まらない
   */
  pickup(multiplier: number): void {
    const file = soundNow('sfx/pickup');
    this.ctx = audioContext();
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = file ? 1 : 0.18;
    out.connect(audioOut());
    const now = ctx.currentTime + 0.01;
    const rise = 2 ** ((Math.min(multiplier, 8) - 1) / 6);
    if (file) {
      this.playFile(file, now, out, 0, rise);
      setTimeout(() => out.disconnect(), (file.duration / rise) * 1000 + 100);
      return;
    }
    const base = 1046.5 * rise;
    this.note(now, base, 0.07, 'square', 0.5, out);
    this.note(now + 0.06, base * 1.5, 0.22, 'square', 0.45, out);
    setTimeout(() => out.disconnect(), 600);
  }

  stop(): void {
    this.master?.disconnect();
    this.master = null;
  }

  private note(at: number, freq: number, len: number, type: OscillatorType, level: number, out: AudioNode = this.master!): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, at + len);
    osc.connect(env).connect(out);
    osc.start(at);
    osc.stop(at + len + 0.05);
  }
}
