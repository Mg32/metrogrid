/**
 * itch.io に上げる版を書き出す。
 *   書き出し先：dist-itch/（中身）と dist-itch.zip（itch.io の「ファイルをアップロード」に渡す ZIP。直下に index.html）
 * GitHub Pages 用の dist/ は base が '/metrogrid/' だが、itch.io はゲームをサイトの直下ではない場所から配るので、
 * ファイルの場所を相対パス（base './'）にして別に書き出す。dist/ は書き換えない。
 *
 * 使い方：npm run build:itch
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import { build } from 'vite';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'dist-itch');
const ZIP = join(ROOT, 'dist-itch.zip');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({ root: ROOT, base: './', logLevel: 'warn', build: { outDir: OUT, emptyOutDir: true } });

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

/** ZIP を組み立てる（依存ライブラリを増やさないため、最小限の形式を手で書く。曲など圧縮の効かないものはそのまま入れる） */
const files = walk(OUT).sort();
const locals: Buffer[] = [];
const centrals: Buffer[] = [];
let offset = 0;
for (const file of files) {
  const name = Buffer.from(relative(OUT, file).replace(/\\/g, '/'), 'utf8');
  const data = readFileSync(file);
  const deflated = deflateRawSync(data, { level: 9 });
  const store = deflated.length >= data.length;
  const body = store ? data : deflated;
  const crc = crc32(data);
  const head = (central: boolean) => {
    const h = Buffer.alloc(central ? 46 : 30);
    let p = 0;
    const u32 = (v: number) => ((p = h.writeUInt32LE(v >>> 0, p)), undefined);
    const u16 = (v: number) => ((p = h.writeUInt16LE(v, p)), undefined);
    u32(central ? 0x02014b50 : 0x04034b50);
    if (central) u16(20);
    u16(20); // 展開に要る版
    u16(0x0800); // 名前は UTF-8
    u16(store ? 0 : 8);
    u16(0); // 時刻（なし）
    u16(0x21); // 日付（1980-01-01）
    u32(crc);
    u32(body.length);
    u32(data.length);
    u16(name.length);
    u16(0); // 拡張フィールド
    if (central) {
      u16(0); // コメント
      u16(0); // ディスク番号
      u16(0); // 内部属性
      u32(0); // 外部属性
      u32(offset);
    }
    return h;
  };
  const local = Buffer.concat([head(false), name, body]);
  centrals.push(Buffer.concat([head(true), name]));
  locals.push(local);
  offset += local.length;
}
const central = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(central.length, 12);
end.writeUInt32LE(offset, 16);
writeFileSync(ZIP, Buffer.concat([...locals, central, end]));

const mb = (n: number) => (n / 1e6).toFixed(2);
const total = files.reduce((s, f) => s + statSync(f).size, 0);
console.log(`dist-itch/：${files.length} ファイル、${mb(total)} MB`);
console.log(`dist-itch.zip：${mb(statSync(ZIP).size)} MB（itch.io の「ファイルをアップロード」に渡す）`);
