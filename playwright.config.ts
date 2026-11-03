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
  // ブラウザを同時に立ち上げるのは2つまで（既定の CPU の半分の数だと、コンピュータが重くなる）
  workers: 2,
  // 遊び始めるまでに実時間で待つ（少女が現れる・カウント）テストがあるので、1つのテストの上限を長めに
  timeout: 60_000,
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
