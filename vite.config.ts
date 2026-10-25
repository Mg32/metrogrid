import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** 開発サーバーで遊んだプレイ記録を playlogs/ に保存する */
function playlogPlugin(): Plugin {
  return {
    name: 'metrogrid-playlog',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__playlog', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', async () => {
          try {
            const log = JSON.parse(body);
            const safe = (s: unknown) => String(s).replace(/[^A-Za-z0-9_-]/g, '-');
            const name = `${safe(log.recordedAt)}_${safe(log.stage)}_${safe(log.result?.status)}.json`;
            const dir = path.resolve(server.config.root, 'playlogs');
            await mkdir(dir, { recursive: true });
            await writeFile(path.join(dir, name), JSON.stringify(log) + '\n');
            server.config.logger.info(`playlog saved: playlogs/${name}`);
            res.end(name);
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: '/metrogrid/',
  plugins: [playlogPlugin()],
  server: {
    watch: { ignored: ['**/playlogs/**', '**/screenshots/**', '**/test-results/**', '**/playwright-report/**'] },
  },
});
