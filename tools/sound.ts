/**
 * 人の手で作った曲・効果音（WAV）を、ブラウザで鳴らす形式に書き出す。
 *   元のファイル：sound/ の下の .wav（sound/music/STAGE1.wav、sound/sfx/pickup.wav など。名前の決まりは sound/README.md）
 *   書き出し先：src/assets/sound/ の下に、同じ名前の .ogg（Opus）と .m4a（AAC）。ゲームは鳴らせるほうを使う
 * 元のファイルより新しい書き出しがあれば飛ばす。元のファイルを消すと、書き出しも消す。
 *
 * 使い方：npm run sound            変わったものだけ書き出す
 *         npm run sound -- --force すべて書き出し直す
 * FFmpeg が必要（PATH にあるもの。別の場所なら環境変数 FFMPEG にパスを書く）
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'sound');
const OUT = join(ROOT, 'src', 'assets', 'sound');
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const force = process.argv.includes('--force');

/** 形式ごとの FFmpeg の引数。曲は音質を上げ、短い効果音は小さく */
const FORMATS: Record<string, (music: boolean) => string[]> = {
  ogg: (music) => ['-c:a', 'libopus', '-b:a', music ? '128k' : '96k', '-ar', '48000'],
  m4a: (music) => ['-c:a', 'aac', '-b:a', music ? '192k' : '128k', '-movflags', '+faststart'],
};

function walk(dir: string, ext: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), ext) : ext.test(e.name) ? [join(dir, e.name)] : [],
  );
}

const check = spawnSync(FFMPEG, ['-hide_banner', '-version'], { encoding: 'utf8' });
if (check.error || check.status !== 0) {
  console.error(`FFmpeg が見つからない（${FFMPEG}）。インストールして PATH に入れるか、環境変数 FFMPEG にパスを書く`);
  process.exit(1);
}

const sources = walk(SRC, /\.wav$/i);
const names = new Set(sources.map((f) => relative(SRC, f).replace(/\\/g, '/').replace(/\.wav$/i, '')));
let made = 0;
let failed = 0;
for (const file of sources) {
  const name = relative(SRC, file).replace(/\\/g, '/').replace(/\.wav$/i, '');
  const music = name.startsWith('music/');
  for (const [ext, args] of Object.entries(FORMATS)) {
    const out = join(OUT, `${name}.${ext}`);
    if (!force && existsSync(out) && statSync(out).mtimeMs >= statSync(file).mtimeMs) continue;
    mkdirSync(dirname(out), { recursive: true });
    const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-map_metadata', '-1', ...args(music), out], {
      encoding: 'utf8',
    });
    if (r.status !== 0) {
      console.error(`失敗：${name}.${ext}\n${r.stderr}`);
      failed++;
    } else {
      console.log(`書き出し：${name}.${ext}`);
      made++;
    }
  }
}

// 元のファイルがなくなった書き出しを消す
let removed = 0;
for (const out of walk(OUT, /\.(ogg|m4a)$/)) {
  const name = relative(OUT, out).replace(/\\/g, '/').replace(/\.[^.]+$/, '');
  if (!names.has(name)) {
    rmSync(out);
    console.log(`削除：${relative(OUT, out)}`);
    removed++;
  }
}

console.log(`元のファイル ${sources.length} 個、書き出し ${made} 個、削除 ${removed} 個${failed ? `、失敗 ${failed} 個` : ''}`);
if (failed) process.exit(1);
