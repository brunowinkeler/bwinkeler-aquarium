import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const BACKEND = 'http://127.0.0.1:8787';

export default defineConfig({
  build: {
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
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Aquário',
        short_name: 'Aquário',
        description: 'Fotografe um desenho de criatura marinha e veja-o nadar no aquário da TV.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
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
        globIgnores: ['tv/**'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/ws\//,
          /^\/health\//,
          /^\/tv(\/|$)/,
          /^\/templates\//,
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
      },
    }),
  ],
});
