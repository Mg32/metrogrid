/**
 * 曲と効果音で共有する AudioContext（ひとつだけ作る。スマホでは数に限りがあり、出力の遅れもそろえたいので）。
 * 作るのは最初に音が要るときで、ふつうはプレイヤーのキーやタップのあと
 */
let ctx: AudioContext | null = null;

export function audioContext(): AudioContext {
  ctx ??= new AudioContext({ latencyHint: 'interactive' });
  return ctx;
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
