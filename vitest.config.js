import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

// 同じテストを Node と本物のブラウザ(Chromium)の両方で走らせ、同じ入力から同じ結果が出ることを固定する
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'node', environment: 'node', include: ['test/**/*.test.js'] } },
      {
        test: {
          name: 'browser',
          include: ['test/**/*.test.js'],
          exclude: ['test/**/*.node.test.js'],
          browser: { enabled: true, provider: playwright(), headless: true, instances: [{ browser: 'chromium' }] },
        },
      },
    ],
  },
});
