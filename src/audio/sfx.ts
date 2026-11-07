import { audioContext, audioOut, unlockAudio } from './context.ts';
import { preloadSounds, soundNow } from './sounds.ts';

/**
 * 効果音（曲とは別）。遊んでいるあいだの音（得点マス、ミス、落ちる、はじき返される）、場面の音（クリア、時間切れ、
 * タイトルから始める、入口へ入る、戻る、新しい入口が現れる、家に帰ってくる、二階への階段を昇る、エンディング）、ボタンの音。
 * それぞれ sound/sfx/ に WAV（名前は sound/README.md）を置けばそのファイルを鳴らし、なければここで合成した音を鳴らす。
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
   * 鳴りやんで 2 秒ほど静まったあと、轟音が聞こえはじめる（rumble）。家が潰れるたびに崩れる音。轟音は砂埃が収まる頃（settle）に消える。times はエンディングの時刻（ENDING）、from はいま何秒目か
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

  /**
   * 短い音を1回（ほかの音を止めず、stop() でも止まらない）。name のファイルがあればそれを鳴らす。
   * synth は合成した音を out に鳴らし、鳴り終わるまでの秒を返す
   */
  private oneShot(name: string, level: number, synth: (ctx: AudioContext, out: GainNode, now: number) => number): void {
    const file = soundNow(name);
    this.ctx = audioContext();
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = file ? 1 : level;
    out.connect(audioOut());
    const now = ctx.currentTime + 0.01;
    let len: number;
    if (file) {
      this.playFile(file, now, out);
      len = file.duration;
    } else len = synth(ctx, out, now);
    setTimeout(() => out.disconnect(), len * 1000 + 200);
  }

  /** 場面の音（新しい出口から鳴らし、stop() で止まる。次の場面の音や、場面が移るときに止まる） */
  private sceneSound(name: string, level: number, synth: (ctx: AudioContext, out: GainNode, now: number) => void): void {
    const file = soundNow(name);
    const ctx = this.open(file ? 1 : level);
    const now = ctx.currentTime + 0.01;
    if (file) this.playFile(file, now, this.master!);
    else synth(ctx, this.master!, now);
  }

  /** 白いノイズ（len 秒）を、filter を通して out へ。env で音量を変える（はじめは 0）。q はフィルタの鋭さ */
  private noise(at: number, len: number, filter: { type: BiquadFilterType; from: number; to?: number; q?: number }, env: (g: AudioParam) => void, out: AudioNode): void {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.max(1, Math.round(ctx.sampleRate * len)), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = filter.type;
    if (filter.q) f.Q.value = filter.q;
    f.frequency.setValueAtTime(filter.from, at);
    if (filter.to) f.frequency.exponentialRampToValueAtTime(filter.to, at + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    env(g.gain);
    src.connect(f).connect(g).connect(out);
    src.start(at);
    src.stop(at + len);
  }

  /** 高さが f0 から f1 へ len 秒で動いて消える音 */
  private glide(at: number, f0: number, f1: number, len: number, type: OscillatorType, level: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, at);
    osc.frequency.exponentialRampToValueAtTime(f1, at + len);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, at + len);
    osc.connect(env).connect(out);
    osc.start(at);
    osc.stop(at + len + 0.05);
  }

  // ---- 遊んでいるあいだ ----

  /** 危険物に当たった（ミス）：鈍くぶつかる音と、沈む短い音 */
  miss(): void {
    this.oneShot('sfx/miss', 0.3, (_ctx, out, now) => {
      this.glide(now, 180, 70, 0.2, 'sine', 0.9, out);
      this.noise(now, 0.12, { type: 'lowpass', from: 900 }, (g) => {
        g.linearRampToValueAtTime(0.5, now + 0.005);
        g.exponentialRampToValueAtTime(0.001, now + 0.12);
      }, out);
      this.glide(now + 0.06, 330, 220, 0.18, 'triangle', 0.25, out);
      return 0.3;
    });
  }

  /** 欠けに落ちた（ミス）：下へ吸いこまれていく音 */
  fall(): void {
    this.oneShot('sfx/fall', 0.22, (_ctx, out, now) => {
      this.glide(now, 700, 90, 0.6, 'triangle', 0.6, out);
      return 0.65;
    });
  }

  /** 停止マスで押しっぱなしのまま通り抜けようとして、はじき返された：ばねのような短い2音 */
  bounce(): void {
    this.oneShot('sfx/bounce', 0.1, (_ctx, out, now) => {
      this.note(now, 440, 0.06, 'square', 0.5, out);
      this.note(now + 0.05, 660, 0.1, 'square', 0.4, out);
      return 0.2;
    });
  }

  // ---- 場面 ----

  /**
   * 時間切れ（結果の画面が出るとき）：トロンボーンのような、半音ずつ下がる「ワッ ワッ ワッ ワァ〜ン」（カートゥーンの残念な音）。
   * 最後の音はゆれながら少し下がって伸びる
   */
  timeUp(): void {
    this.sceneSound('sfx/timeup', 0.2, (ctx, out, now) => {
      const notes = [233.08, 220, 207.65, 196];
      notes.forEach((f, i) => {
        const at = now + i * 0.32;
        const last = i === notes.length - 1;
        const len = last ? 1.3 : 0.26;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f * 1.02, at);
        osc.frequency.linearRampToValueAtTime(f, at + 0.05);
        if (last) {
          osc.frequency.setValueAtTime(f, at + 0.3);
          osc.frequency.linearRampToValueAtTime(f * 0.94, at + len);
          // ゆれ（ビブラート）
          const lfo = ctx.createOscillator();
          const depth = ctx.createGain();
          lfo.frequency.value = 6;
          depth.gain.setValueAtTime(0, at);
          depth.gain.linearRampToValueAtTime(f * 0.03, at + 0.4);
          lfo.connect(depth).connect(osc.frequency);
          lfo.start(at);
          lfo.stop(at + len + 0.05);
        }
        // こもった管楽器らしく、高い音を削り、吹き始めに少し開く
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(500, at);
        lp.frequency.linearRampToValueAtTime(1400, at + 0.06);
        lp.frequency.linearRampToValueAtTime(900, at + len);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, at);
        env.gain.linearRampToValueAtTime(0.8, at + 0.03);
        env.gain.setValueAtTime(0.8, at + len - 0.08);
        env.gain.linearRampToValueAtTime(0, at + len);
        osc.connect(lp).connect(env).connect(out);
        osc.start(at);
        osc.stop(at + len + 0.05);
      });
    });
  }

  /** タイトルから始める：玄関の引き戸がすべる音（ノイズだけ。ending.ts の TITLE_OUT） */
  start(): void {
    this.sceneSound('sfx/start', 0.3, (_ctx, out, now) => {
      this.noise(now, 0.35, { type: 'bandpass', from: 1200, to: 700 }, (g) => {
        g.linearRampToValueAtTime(0.4, now + 0.08);
        g.linearRampToValueAtTime(0, now + 0.35);
      }, out);
    });
  }

  /** 拠点の入口へ入る：光の柱に包まれていく、明るいノイズのふくらみ（ノイズだけ。renderer の LEAVE） */
  portal(): void {
    this.sceneSound('sfx/portal', 0.3, (_ctx, out, now) => {
      this.noise(now, 1.2, { type: 'highpass', from: 2000, to: 6000 }, (g) => {
        g.linearRampToValueAtTime(0.25, now + 0.8);
        g.linearRampToValueAtTime(0, now + 1.2);
      }, out);
    });
  }

  /** Esc で戻る：短く少しだけ下がる「プゥ」（renderer の BACK） */
  back(): void {
    this.sceneSound('sfx/back', 0.45, (_ctx, out, now) => {
      this.glide(now, 440, 330, 0.18, 'triangle', 0.7, out);
    });
  }

  /**
   * 拠点に新しい入口が現れる・チュートリアルで少女が現れる：神聖な響き。道がせり上がるあいだ、聖歌隊のような和音（少しずつずらした音を重ねる）がふくらみ、
   * せり上がりきったところで高い和音が開いて、鐘のような響きとともにゆっくり消える（renderer の REVEAL）。
   * 音は E♭・B♭・F だけで組む（E♭ と B♭ の空虚5度に F を足す）。拠点の曲（HUB.wav、変ホ短調）と、チュートリアルの曲の頭
   * （TUTORIAL.wav、変ロ長調）のどちらにも含まれる音なので、重なっても濁らない。曲の調を変えたら、ここも合わせる
   * rise はせり上がり始める秒、land はせり上がりきる秒（いまから）。少女が現れるときは、光が降りてき始める秒と、少女の姿になる秒
   */
  reveal(rise: number, land: number): void {
    this.sceneSound('sfx/reveal', 0.2, (ctx, out, now) => {
      /** 柔らかく立ち上がって、伸びて、消える音。detune はセント（同じ高さを少しずらして重ね、ゆらぐ厚みを出す） */
      const pad = (f: number, at: number, peak: number, end: number, level: number) => {
        for (const detune of [-7, 7]) {
          const osc = ctx.createOscillator();
          const env = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = f;
          osc.detune.value = detune;
          env.gain.setValueAtTime(0, at);
          env.gain.linearRampToValueAtTime(level, peak);
          env.gain.linearRampToValueAtTime(0, end);
          osc.connect(env).connect(out);
          osc.start(at);
          osc.stop(end + 0.05);
        }
      };
      const r = now + rise;
      const l = now + land;
      // せり上がるあいだ：低い和音（E♭3 B♭3 F4）がふくらむ
      for (const [f, lv] of [[155.56, 0.24], [233.08, 0.2], [349.23, 0.12]] as const) pad(f, r, l, l + 0.7, lv);
      // せり上がりきったところ：高い和音（E♭5 F5 B♭5 E♭6）が開き、長く残る
      for (const [f, lv] of [[622.25, 0.2], [698.46, 0.12], [932.33, 0.16], [1244.51, 0.1]] as const) pad(f, l, l + 0.35, l + 2.7, lv);
      // 鐘のような澄んだ響き（B♭6 F7）
      for (const [f, lv, len] of [[1864.66, 0.18, 1.9], [2793.83, 0.08, 1.1]] as const) this.note(l, f, len, 'sine', lv, out);
    });
  }

  /**
   * 家に帰ってくる（ending.ts の HOMECOMING。restore は戻り始める秒と戻りきる秒）。
   * 家の部分が戻っていくあいだは、ウィンドチャイムのような金属の響きが、決まった音程やリズムなしに鳴る。
   * 戻りきって明かりがともるところは、ノイズをフィルタに通しただけの、ふわりと開いて閉じる音
   */
  homecoming(restore: readonly number[]): void {
    const [r0, r1] = restore;
    this.sceneSound('sfx/homecoming', 0.18, (ctx, out, now) => {
      // ウィンドチャイム：風に揺れる金属の管がでたらめに触れ合う。旋律やリズムに聞こえないよう、高さは音階から選ばず
      // 高い帯域の中で毎回ばらばらにし、管らしい整数倍でない倍音（1・2.76・5.40・8.93 倍）を重ねて音程をぼかす。
      // 打つ間隔もでたらめにして、風が強まる真ん中ほど密にする（毎回ちがう鳴り方になる。効果音なので Math.random でよい）
      const strike = (at: number, f: number, level: number, decay: number) => {
        for (const [ratio, lv, len] of [[1, 1, 1], [2.756, 0.45, 0.6], [5.404, 0.25, 0.35], [8.933, 0.12, 0.2]] as const) {
          // 同じ倍音を少しずらして2本重ね、ゆらぎ（うなり）を出す
          for (const detune of [-4, 4]) {
            const osc = ctx.createOscillator();
            const env = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = f * ratio;
            osc.detune.value = detune + (Math.random() - 0.5) * 6;
            env.gain.setValueAtTime(0, at);
            env.gain.linearRampToValueAtTime(level * lv * 0.5, at + 0.002);
            env.gain.exponentialRampToValueAtTime(0.0005, at + decay * len);
            osc.connect(env).connect(out);
            osc.start(at);
            osc.stop(at + decay * len + 0.05);
          }
        }
      };
      let at = now + r0 + Math.random() * 0.1;
      while (at < now + r1 - 0.15) {
        const u = (at - now - r0) / (r1 - r0);
        const gust = Math.sin(Math.PI * u);
        strike(at, 1800 * 2 ** (Math.random() * 1.4), (0.12 + 0.28 * Math.random()) * (0.5 + 0.5 * gust), 1.2 + Math.random() * 1.4);
        // 平均の間隔は、風の弱い端で 0.3 秒、強い真ん中で 0.08 秒ほど（指数分布でばらつかせる）
        at += -Math.log(1 - Math.random() * 0.95) * (0.3 - 0.22 * gust);
      }
      // 明かりがともる：ノイズを、こもった所から明るい所へ開いて、また閉じるフィルタに通す
      const open = 0.5;
      const len = 1.6;
      this.noise(now + r1, len, { type: 'lowpass', from: 300, q: 2 }, (g) => {
        g.linearRampToValueAtTime(0.5, now + r1 + open);
        g.linearRampToValueAtTime(0, now + r1 + len);
      }, out);
      // フィルタの開け閉めは noise の to では1方向にしか動かせないので、帯域をずらした2本を重ねる
      this.noise(now + r1, open + 0.2, { type: 'bandpass', from: 600, to: 3000, q: 1.5 }, (g) => {
        g.linearRampToValueAtTime(0.35, now + r1 + open);
        g.linearRampToValueAtTime(0, now + r1 + open + 0.2);
      }, out);
      this.noise(now + r1 + open, len - open, { type: 'bandpass', from: 3000, to: 500, q: 1.5 }, (g) => {
        g.linearRampToValueAtTime(0.35, now + r1 + open + 0.05);
        g.linearRampToValueAtTime(0, now + r1 + len);
      }, out);
    });
  }

  /** 二階への階段を昇る：1段ごとの木の足音。遠ざかるほど小さい（renderer の UPSTAIRS_STEPS・UPSTAIRS_STEP_SEC） */
  upstairs(steps: number, stepSec: number): void {
    this.oneShot('sfx/upstairs', 0.3, (_ctx, out, now) => {
      for (let i = 0; i < steps; i++) {
        const at = now + i * stepSec;
        const v = 1 - i / (steps + 1);
        this.glide(at, 200, 120, 0.08, 'triangle', 0.7 * v, out);
        this.noise(at, 0.05, { type: 'bandpass', from: 1500 }, (g) => {
          g.linearRampToValueAtTime(0.4 * v, at + 0.003);
          g.exponentialRampToValueAtTime(0.001, at + 0.05);
        }, out);
      }
      return steps * stepSec + 0.2;
    });
  }

  // ---- ボタン ----

  /**
   * 選ぶ・切り替える（確認の はい・いいえ を選ぶ、言語・音の切り替え、記録を消す確認を開く）：「カチッ」。
   * ノイズを鋭いバンドパスに通し、すぐ立ち上げて短く響かせる。low は「いいえ」で閉じるとき（少し低い）
   */
  select(low = false): void {
    this.oneShot('sfx/select', 0.6, (_ctx, out, now) => {
      const len = 0.035;
      this.noise(now, len, { type: 'bandpass', from: low ? 2400 : 3400, q: 6 }, (g) => {
        g.linearRampToValueAtTime(1, now + 0.001);
        g.exponentialRampToValueAtTime(0.001, now + len);
      }, out);
      return 0.08;
    });
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
