// Bundles the TV app into one IIFE for Chromium 53 and places it at /tv/ next to the phone app.
// The site root serves the same bundle with clickable controls for a mouse or touch screen.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../frontend/dist/', import.meta.url));
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

let page = readFileSync(`${out}/index.html`, 'utf8');
for (const [from, to] of [
  ['<html lang="pt-BR">', '<html lang="pt-BR" data-input="pointer">'],
  ['href="tv.css"', 'href="/tv/tv.css"'],
  ['src="tv.js"', 'src="/tv/tv.js"'],
]) {
  if (!page.includes(from)) throw new Error(`tv/public/index.html no longer contains ${from}`);
  page = page.replace(from, to);
}
writeFileSync(`${root}/index.html`, page);
