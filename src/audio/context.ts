/**
 * 曲と効果音で共有する AudioContext（ひとつだけ作る。スマホでは数に限りがあり、出力の遅れもそろえたいので）。
 * 作るのは最初に音が要るときで、ふつうはプレイヤーのキーやタップのあと
 */
let ctx: AudioContext | null = null;
/** 曲も効果音もここへつなぐ（音を消すときはここの音量を 0 にする。時間の基準は AudioContext のままなので拍はずれない） */
let out: GainNode | null = null;

const KEY = 'metrogrid.sound';
/** 音を鳴らすか。タイトルのボタン（M キー）で切り替え、このブラウザに残す（記録を消しても残る） */
let on = (() => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
})();

export function audioContext(): AudioContext {
  ctx ??= new AudioContext({ latencyHint: 'interactive' });
  return ctx;
}

/** 曲と効果音の出口 */
export function audioOut(): AudioNode {
  const c = audioContext();
  if (!out) {
    out = c.createGain();
    out.gain.value = on ? 1 : 0;
    out.connect(c.destination);
  }
  return out;
}

export const soundOn = (): boolean => on;

/** 音のオン・オフを切り替えて、このブラウザに残す */
export function toggleSound(): void {
  on = !on;
  if (out && ctx) out.gain.setValueAtTime(on ? 1 : 0, ctx.currentTime);
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // 残せなくても切り替わる
  }
}

/**
 * 音を鳴らせるようにする。スマホ（特に iOS）では、タップやキーのイベントの処理の中で呼ばないと音が出ない。何度呼んでもよい。
 * iOS の Safari が操作と認めるのは指を離したとき（touchend・pointerup）で、指を置いたとき（pointerdown）では鳴らせるようにならない
 */
export function unlockAudio(): void {
  const c = audioContext();
  // iOS：消音スイッチ（マナーモード）がオンでも鳴らす。Web Audio は既定ではスイッチに従って消える（iOS 17 以降の audioSession）
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session && session.type !== 'playback') session.type = 'playback';
  if (c.state === 'running') return;
  c.resume().catch(() => {});
  // 古い iOS は、操作の処理の中で実際に音を鳴らさないと鳴らせるようにならないので、無音を1つ鳴らしておく
  const src = c.createBufferSource();
  src.buffer = c.createBuffer(1, 1, 22050);
  src.connect(c.destination);
  src.start(0);
}
