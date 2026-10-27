import { audioContext } from './context.ts';

/**
 * 人の手で作った曲・効果音のファイル。元の WAV を sound/ に置き、`npm run sound` で
 * src/assets/sound/ に Opus（.ogg）と AAC（.m4a）を書き出す（tools/sound.ts）。
 * 名前は sound/ からの相対パスから拡張子を除いたもの（sound/music/STAGE1.wav なら 'music/STAGE1'）。
 * ファイルがない名前は null になり、呼び出し側は今までどおり合成した音を鳴らす（差し替えは1つずつでよい）
 */
const OGG = import.meta.glob('../assets/sound/**/*.ogg', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const M4A = import.meta.glob('../assets/sound/**/*.m4a', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

const nameOf = (path: string) => path.replace('../assets/sound/', '').replace(/\.[^.]+$/, '');
const urls = new Map<string, { ogg?: string; m4a?: string }>();
for (const [path, url] of Object.entries(OGG)) urls.set(nameOf(path), { ...urls.get(nameOf(path)), ogg: url });
for (const [path, url] of Object.entries(M4A)) urls.set(nameOf(path), { ...urls.get(nameOf(path)), m4a: url });

/** Opus を鳴らせるブラウザでは .ogg（小さい）、だめなら .m4a（古い Safari など） */
const preferOgg = typeof Audio !== 'undefined' && new Audio().canPlayType('audio/ogg; codecs=opus') !== '';

const cache = new Map<string, Promise<AudioBuffer | null>>();

export function hasSound(name: string): boolean {
  return urls.has(name);
}

/** name のファイルを読み込んで解読する（一度だけ。ないか、読めなければ null） */
export function loadSound(name: string): Promise<AudioBuffer | null> {
  let p = cache.get(name);
  if (!p) {
    p = decode(name);
    cache.set(name, p);
  }
  return p;
}

/** 読み込み済みなら、その場で返す（効果音を待たずに鳴らすため。まだなら null） */
const ready = new Map<string, AudioBuffer>();
export function soundNow(name: string): AudioBuffer | null {
  return ready.get(name) ?? null;
}

async function decode(name: string): Promise<AudioBuffer | null> {
  const u = urls.get(name);
  if (!u) return null;
  // 「鳴らせそう」と答えても解読できないブラウザがあるので、だめならもう一方の形式を試す
  const order = preferOgg ? [u.ogg, u.m4a] : [u.m4a, u.ogg];
  for (const url of order) {
    if (!url) continue;
    try {
      const res = await fetch(url);
      const buf = await audioContext().decodeAudioData(await res.arrayBuffer());
      ready.set(name, buf);
      return buf;
    } catch (e) {
      console.warn(`sound ${name}: ${url} を読めなかった`, e);
    }
  }
  return null;
}

/** 名前が prefix で始まる音をすべて読み込みはじめる（効果音を、鳴らす前に用意しておく） */
export function preloadSounds(prefix: string): void {
  for (const name of urls.keys()) if (name.startsWith(prefix)) void loadSound(name);
}
