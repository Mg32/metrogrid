/**
 * 曲と効果音で共有する AudioContext（ひとつだけ作る。スマホでは数に限りがあり、出力の遅れもそろえたいので）。
 * 作るのは最初に音が要るときで、ふつうはプレイヤーのキーやタップのあと
 */
let ctx: AudioContext | null = null;

export function audioContext(): AudioContext {
  ctx ??= new AudioContext({ latencyHint: 'interactive' });
  return ctx;
}

/** 音を鳴らせるようにする。スマホ（特に iOS）では、タップやキーのイベントの処理の中で呼ばないと音が出ない。何度呼んでもよい */
export function unlockAudio(): void {
  void audioContext().resume();
}
