// Bundles the TV app into one IIFE for Chromium 53 and places it at /tv/ next to the PWA.
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../frontend/dist/tv/', import.meta.url));
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [fileURLToPath(new URL('./src/main.ts', import.meta.url))],
  outfile: `${out}/tv.js`,
  bundle: true,
  format: 'iife',
  target: 'chrome53',
  minify: true,
  legalComments: 'none',
  charset: 'utf8',
  logLevel: 'warning',
});

cpSync(fileURLToPath(new URL('./public/', import.meta.url)), out, { recursive: true });
