import { defineConfig } from '@playwright/test';

const PORT = 5180;

/**
 * ブラウザは、既定でインストール済みの Microsoft Edge を使う（Playwright のブラウザのダウンロードが不要）。
 * 別のブラウザを使うときは PW_CHANNEL=chrome などを指定する。PW_CHANNEL= （空）なら Playwright 同梱の Chromium。
 */
const channel = process.env.PW_CHANNEL ?? 'msedge';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: channel || undefined,
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
