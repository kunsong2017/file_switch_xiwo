import {build, transformWithEsbuild} from 'vite';
import {readFile, writeFile, readdir, mkdir, cp} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, 'offline');
const assets = {};
async function embed(name, file) {assets[name] = (await readFile(path.join(root, file))).toString('base64');}
for (const directory of ['pdf/cmaps', 'pdf/fonts', 'examples']) {
  for (const name of await readdir(path.join(root, 'public', directory))) {
    if (directory === 'examples' || /\.(bcmap|pfb|ttf)$/.test(name)) await embed(`/${directory}/${name}`, `public/${directory}/${name}`);
  }
}
// Classic Blob workers also work under opaque file:// origins in older Chrome.
const worker = await transformWithEsbuild(await readFile(path.join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'), 'utf8'), 'pdf-worker.js', {format: 'iife', target: 'es2020', minify: true});
assets['/pdf/worker.js'] = Buffer.from(worker.code).toString('base64');
await embed('/ocr/core/tesseract-core-lstm.js', 'node_modules/tesseract.js-core/tesseract-core-lstm.js');
for (const name of ['worker.min.js', 'core/tesseract-core-lstm.wasm', 'lang/eng.traineddata.gz', 'lang/chi_sim.traineddata.gz']) await embed(`/ocr/${name}`, `public/ocr/${name}`);
const result = await build({
  root, configFile: false, publicDir: false,
  plugins: [{
    name: 'embedded-pdf-worker',
    resolveId(id) {if (id === 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url') return '\0embedded-pdf-worker';},
    load(id) {if (id === '\0embedded-pdf-worker') return 'export default ""';},
  }],
  build: {
    write: false, target: 'es2020', cssCodeSplit: false,
    lib: {entry: path.join(root, 'src/main.js'), name: 'Tiye', formats: ['iife']},
    rollupOptions: {output: {inlineDynamicImports: true}},
  },
});
const files = (Array.isArray(result) ? result : [result]).flatMap(bundle => bundle.output);
const js = files.find(file => file.type === 'chunk' && file.isEntry).code;
const css = files.filter(file => file.type === 'asset' && file.fileName.endsWith('.css')).map(file => file.source).join('\n');
// Escape HTML script terminators in generated JavaScript, including third-party
// string literals. No module imports, linked stylesheets or file fetches remain.
const inlineJS = js.replace(/<\/script/gi, '<\\/script');
const favicon = (await readFile(path.join(root, 'public/favicon.svg'))).toString('base64');
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f8f8f5"><title>题页 · 离线试卷转课件</title><link rel="icon" href="data:image/svg+xml;base64,${favicon}"><style>${css}</style></head>
<body><div id="app"><p style="padding:40px;font:18px sans-serif">正在打开题页离线版，请稍候…</p><noscript>请启用浏览器 JavaScript 后重新打开。</noscript></div><div id="render-root" aria-hidden="true"></div><div id="toast" role="status" aria-live="polite"></div>
<script>globalThis.__TIYE_ASSETS__=${JSON.stringify(assets)};</script><script>${inlineJS}</script></body></html>`;
await mkdir(output, {recursive: true});
await writeFile(path.join(output, 'index.html'), html);
await cp(path.join(root, 'public/licenses'), path.join(output, 'licenses'), {recursive: true});
for (const directory of ['cmaps', 'fonts']) {
  for (const name of await readdir(path.join(root, 'public/pdf', directory))) {
    if (/^licen[sc]e/i.test(name)) await cp(path.join(root, 'public/pdf', directory, name), path.join(output, 'licenses', `pdf-${directory}-${name}`));
  }
}
await cp(path.join(root, '使用前先看.txt'), path.join(output, '使用前先看.txt'));
console.log(`可双击的离线 HTML：${path.join(output, 'index.html')} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MB)`);
