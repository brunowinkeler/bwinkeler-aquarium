import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: { bindings: { IP_HASH_KEY: 'test-only-ip-hash-key' } },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
  },
});
