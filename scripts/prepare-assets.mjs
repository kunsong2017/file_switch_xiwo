import {cp, mkdir, readdir} from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
for (const dir of ['public/pdf', 'public/ocr/core', 'public/ocr/lang', 'public/licenses']) await mkdir(path.join(root, dir), {recursive:true});
await cp('node_modules/pdfjs-dist/cmaps', 'public/pdf/cmaps', {recursive:true});
await cp('node_modules/pdfjs-dist/standard_fonts', 'public/pdf/fonts', {recursive:true});
await cp('node_modules/tesseract.js/dist/worker.min.js', 'public/ocr/worker.min.js');
for (const name of await readdir('node_modules/tesseract.js-core')) {
  if (/\.wasm(?:\.js)?$/.test(name)) await cp(`node_modules/tesseract.js-core/${name}`, `public/ocr/core/${name}`);
}
// Redistribute upstream license texts alongside the shipped browser bundles.
for (const pkg of ['pdfjs-dist','docx-preview','mathjax-full','html-to-image','pptxgenjs','lucide','tesseract.js','tesseract.js-core','jszip','spark-md5','pako','fflate','lie','immediate','setimmediate']) {
  try {
    for (const name of await readdir(`node_modules/${pkg}`)) {
      if (/^(licen[sc]e|copying|notice|ofl)(\.|$|_)/i.test(name)) await cp(`node_modules/${pkg}/${name}`, `public/licenses/${pkg}-${name}`);
    }
  } catch (e) {if (e.code !== 'ENOENT') throw e;}
}
await cp('node_modules/tesseract.js-core/LICENSE', 'public/licenses/tessdata_fast-Apache-2.0.txt');
await cp('third_party/OpenEnow.JS/LICENSE', 'public/licenses/OpenEnow.JS-MIT.txt');
console.log('PDF 字体、CMap 和 OCR 引擎已准备好。语言包由 download-languages.py 下载。');
