import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const BACKEND = 'http://127.0.0.1:8787';

/** `site/` holds what belongs to the whole origin: headers, redirects, robots.txt. */
function siteRoot(): Plugin {
  return {
    name: 'aquarium-site-root',
    apply: 'build',
    closeBundle() {
      cpSync(
        fileURLToPath(new URL('./site', import.meta.url)),
        fileURLToPath(new URL('./dist', import.meta.url)),
        { recursive: true },
      );
    },
  };
}

export default defineConfig({
  // The phone app lives under /join/; the TV build owns the site root and /tv/.
  base: '/join/',
  build: {
    outDir: 'dist/join',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0,
  },
  worker: {
    format: 'es',
  },
  server: {
    // `wrangler dev` checks Origin against PUBLIC_ORIGIN, which .dev.vars sets to its own port.
    proxy: {
      '/api': { target: BACKEND, headers: { origin: 'http://localhost:8787' } },
      '/ws': { target: BACKEND, ws: true },
      '/health': { target: BACKEND },
    },
  },
  plugins: [
    react(),
    siteRoot(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        // Kept from when the app lived at /, so phones that installed it keep the same app.
        id: '/',
        name: 'Aquário',
        short_name: 'Aquário',
        description: 'Fotografe um desenho de criatura marinha e veja-o nadar no aquário da TV.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: '/join/',
        scope: '/join/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b3d5c',
        theme_color: '#0b3d5c',
        categories: ['entertainment', 'kids'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,pdf}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/join\/templates\//],
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
      },
    }),
  ],
});
