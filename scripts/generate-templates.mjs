// Writes the printable templates (SVG preview + A4 PDF per kind and language) into
// frontend/public/templates from the layout and markers in the extractor:
// npm run templates
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  MARKER_CELLS,
  TEMPLATE_KINDS,
  TEMPLATE_LAYOUT,
  markerBits,
  templateMarkerId,
} from '../extractor/dist/index.js';

const OUT = new URL('../frontend/public/templates/', import.meta.url);

const TEXT = {
  'pt-BR': {
    title: 'Aquário',
    instruction: 'Desenhe uma criatura do mar dentro da moldura.',
    hint: 'Não pinte os quadrados pretos dos cantos.',
    kind: {
      generic: 'Modelo: qualquer criatura',
      swim: 'Modelo: peixe',
      pulse: 'Modelo: água-viva',
      walk: 'Modelo: caranguejo',
      glide: 'Modelo: tartaruga',
    },
  },
  en: {
    title: 'Aquarium',
    instruction: 'Draw a sea creature inside the frame.',
    hint: 'Do not color the black squares in the corners.',
    kind: {
      generic: 'Template: any creature',
      swim: 'Template: fish',
      pulse: 'Template: jellyfish',
      walk: 'Template: crab',
      glide: 'Template: turtle',
    },
  },
};

const { page, markerSize, markers, frame } = TEMPLATE_LAYOUT;
const TEXT_LEFT = markers[0].x + markerSize + 6;
const SEA = [11, 61, 92];
const GREY = [51, 51, 51];
const FRAME = [74, 144, 200];
const FRAME_WIDTH = 0.8;

/** Lines of text in millimetres: baseline, font size (em), weight and color. */
function lines(language, kind) {
  const text = TEXT[language];
  return [
    { y: 22, size: 9, bold: true, color: SEA, value: text.title },
    { y: 32, size: 4.6, bold: false, color: GREY, value: text.instruction },
    { y: 186, size: 6.5, bold: true, color: SEA, value: text.kind[kind] },
    { y: 195, size: 4.2, bold: false, color: GREY, value: text.hint },
  ];
}

/** Black cells of the four markers, merged into horizontal runs: [x, y, width, height] in mm. */
function markerRuns(kind) {
  const cell = markerSize / MARKER_CELLS;
  const last = MARKER_CELLS - 1;
  const runs = [];
  markers.forEach((origin, corner) => {
    const bits = markerBits(templateMarkerId(kind, corner));
    for (let row = 0; row < MARKER_CELLS; row++) {
      let start = -1;
      for (let column = 0; column <= MARKER_CELLS; column++) {
        const edge = row === 0 || column === 0 || row === last || column === last;
        const black = column < MARKER_CELLS && (edge || !bits[(row - 1) * 6 + column - 1]);
        if (black && start < 0) start = column;
        if (!black && start >= 0) {
          runs.push([
            origin.x + start * cell,
            origin.y + row * cell,
            (column - start) * cell,
            cell,
          ]);
          start = -1;
        }
      }
    }
  });
  return runs;
}

const number = (value) => String(Number(value.toFixed(3)));
const hex = (color) => `#${color.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
const escapeXml = (value) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function svg(language, kind) {
  const text = TEXT[language];
  const path = markerRuns(kind)
    .map(([x, y, w, h]) => `M${number(x)} ${number(y)}h${number(w)}v${number(h)}h${number(-w)}z`)
    .join('');
  const labels = lines(language, kind).map(
    (line) =>
      `<text x="${number(TEXT_LEFT)}" y="${number(line.y)}" font-size="${number(line.size)}"` +
      `${line.bold ? ' font-weight="700"' : ''} fill="${hex(line.color)}">${escapeXml(line.value)}</text>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}mm" height="${page.height}mm" viewBox="0 0 ${page.width} ${page.height}">`,
    `<title>${escapeXml(`${text.title}: ${text.kind[kind]}`)}</title>`,
    `<rect width="${page.width}" height="${page.height}" fill="#fff"/>`,
    `<rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" rx="${frame.radius}" fill="none" stroke="${hex(FRAME)}" stroke-width="${FRAME_WIDTH}"/>`,
    `<path d="${path}" fill="#000" shape-rendering="crispEdges"/>`,
    `<g font-family="Helvetica, Arial, sans-serif">`,
    ...labels,
    '</g>',
    '</svg>',
    '',
  ].join('\n');
}

const PT = 72 / 25.4;
const px = (mm) => number(mm * PT);
const py = (mm) => number((page.height - mm) * PT);
const rgb = (color) => color.map((c) => number(c / 255)).join(' ');

/** A PDF string in WinAnsiEncoding (Latin-1 for these texts), ASCII-only through escapes. */
function pdfString(value) {
  let out = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code > 255) throw new Error(`Character outside Latin-1: ${char}`);
    if (char === '(' || char === ')' || char === '\\') out += `\\${char}`;
    else if (code < 32 || code > 126) out += `\\${code.toString(8).padStart(3, '0')}`;
    else out += char;
  }
  return `(${out})`;
}

function roundedRect(x, y, w, h, r) {
  const k = 0.5523 * r;
  const p = (mx, my) => `${px(mx)} ${py(my)}`;
  return [
    `${p(x + r, y)} m`,
    `${p(x + w - r, y)} l`,
    `${p(x + w - r + k, y)} ${p(x + w, y + r - k)} ${p(x + w, y + r)} c`,
    `${p(x + w, y + h - r)} l`,
    `${p(x + w, y + h - r + k)} ${p(x + w - r + k, y + h)} ${p(x + w - r, y + h)} c`,
    `${p(x + r, y + h)} l`,
    `${p(x + r - k, y + h)} ${p(x, y + h - r + k)} ${p(x, y + h - r)} c`,
    `${p(x, y + r)} l`,
    `${p(x, y + r - k)} ${p(x + r - k, y)} ${p(x + r, y)} c`,
    'h S',
  ].join('\n');
}

function pdf(language, kind) {
  const text = TEXT[language];
  const content = [
    `${rgb(FRAME)} RG ${px(FRAME_WIDTH)} w`,
    roundedRect(frame.x, frame.y, frame.width, frame.height, frame.radius),
    '0 0 0 rg',
    ...markerRuns(kind).map(([x, y, w, h]) => `${px(x)} ${py(y + h)} ${px(w)} ${px(h)} re`),
    'f',
    ...lines(language, kind).map(
      (line) =>
        `BT /${line.bold ? 'F2' : 'F1'} ${px(line.size)} Tf ${rgb(line.color)} rg ` +
        `${px(TEXT_LEFT)} ${py(line.y)} Td ${pdfString(line.value)} Tj ET`,
    ),
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${px(page.width)} ${px(page.height)}] ` +
      '/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Title ${pdfString(`${text.title}: ${text.kind[kind]}`)} /Producer (bwinkeler-aquarium) >>`,
  ];
  let body = '%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n';
  const offsets = objects.map((object, index) => {
    const offset = body.length;
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\n`;
  body += `startxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

for (const language of Object.keys(TEXT)) {
  const folder = new URL(`${language}/`, OUT);
  mkdirSync(folder, { recursive: true });
  for (const kind of TEMPLATE_KINDS) {
    writeFileSync(new URL(`${kind}.svg`, folder), svg(language, kind));
    writeFileSync(new URL(`${kind}.pdf`, folder), pdf(language, kind));
  }
}
console.log('Templates written to frontend/public/templates');
