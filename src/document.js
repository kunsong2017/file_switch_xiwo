import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import {renderAsync} from 'docx-preview';
import {toCanvas} from 'html-to-image';
import {configureOfflinePDF, offlineOCR} from './offline.js';
import {pageLayout, mergeGraphics} from './layout.js';
import {pdfGraphics} from './pdf-graphics.js';
import {rasterGraphics} from './raster-graphics.js';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
const offlinePDFOptions = configureOfflinePDF(pdfjs);

export async function readDocument(file, onProgress) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'doc') throw new Error('旧版 .doc 暂不支持。请在 Word 或 WPS 中另存为 .docx，或导出 PDF 后导入。');
  if (!['pdf', 'docx'].includes(ext)) throw new Error('请选择 PDF 或 Word（.docx）文件。');
  if (file.size > 60 * 1024 * 1024) throw new Error('文件超过 60 MB，请拆成较小的试卷后导入。');
  if (!file.size) throw new Error('这个文件是空的，请重新选择。');
  const data = await file.arrayBuffer();
  return ext === 'pdf' ? readPDF(data, onProgress) : readDOCX(data, onProgress);
}

async function readPDF(data, onProgress) {
  let doc;
  try {
    doc = await pdfjs.getDocument({data, cMapUrl: '/pdf/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdf/fonts/', isEvalSupported: false, ...offlinePDFOptions}).promise;
    if (doc.numPages > 60) throw new Error('当前一次最多处理 60 页，请先拆分试卷。');
    const pages = [];
    let pixelBudget = 0;
    for (let n = 1; n <= doc.numPages; n++) {
      onProgress(`正在读取 PDF · 第 ${n} / ${doc.numPages} 页`, n / doc.numPages * 0.85);
      const page = await doc.getPage(n);
      const base = page.getViewport({scale: 1});
      const scale = Math.min(2.2, 1700 / base.width, 2400 / base.height);
      const view = page.getViewport({scale});
      pixelBudget += view.width * view.height;
      if (pixelBudget > 100_000_000) throw new Error('试卷渲染尺寸过大，请拆成较小文件，以免浏览器内存不足。');
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(view.width);
      canvas.height = Math.ceil(view.height);
      await page.render({canvasContext: canvas.getContext('2d'), viewport: view, background: '#ffffff'}).promise;
      const content = await page.getTextContent();
      const raw = content.items.filter(item => item.str?.trim()).map(item => {
        const t = pdfjs.Util.transform(view.transform, item.transform);
        const h = Math.hypot(t[2], t[3]);
        return {text: item.str, x: t[4] / view.width, y: (t[5] - h * 0.88) / view.height, w: item.width * scale / view.width, h: h / view.height};
      });
      // PDF text runs can split a number, punctuation and stem into separate items.
      const lines = groupTextRuns(raw);
      const graphics = pdfGraphics(await page.getOperatorList(), view.transform, canvas.width, canvas.height, pdfjs.OPS);
      pages.push(makePage(canvas, lines, [0.015, 0.985], graphics));
      page.cleanup();
    }
    return pages;
  } catch (e) {
    if (e.name === 'PasswordException') throw new Error('此 PDF 已加密，请解除密码保护后重新导入。');
    throw e;
  } finally {
    await doc?.destroy();
  }
}

function groupTextRuns(raw) {
  const rows = [];
  for (const item of raw.sort((a, b) => a.y - b.y || a.x - b.x)) {
    let row = rows.find(r => Math.abs(r.y - item.y) < Math.max(0.003, Math.min(r.h, item.h) * 0.45));
    if (!row) rows.push(row = {y: item.y, h: item.h, runs: []});
    row.runs.push(item);
  }
  const result = [];
  for (const row of rows) {
    let line;
    for (const run of row.runs.sort((a, b) => a.x - b.x)) {
      // Preserve separate columns instead of joining both stems into one line.
      if (!line || run.x - (line.x + line.w) > 0.065) {
        line = {...run, runs:[run]};
        result.push(line);
      } else {
        line.runs.push(run);
        const gap = run.x - (line.x + line.w);
        line.text += (gap > 0.008 ? ' ' : '') + run.text;
        line.w = Math.max(line.w, run.x + run.w - line.x);
        line.h = Math.max(line.h, run.h);
      }
    }
  }
  return result;
}

async function readDOCX(data, onProgress) {
  const root = document.getElementById('render-root');
  root.replaceChildren();
  try {
    onProgress('正在排版 Word 文档…', 0.1);
    // Disallow embedded HTML chunks; document content is otherwise isolated offscreen.
    await renderAsync(data, root, null, {
      className: 'exam-docx', inWrapper: false, ignoreLastRenderedPageBreak: false,
      useBase64URL: true, renderAltChunks: false, renderComments: false,
      renderHeaders: false, renderFooters: false, breakPages: true,
    });
    root.querySelectorAll('script,iframe,object,embed').forEach(el => el.remove());
    root.querySelectorAll('*').forEach(el => {
      for (const attribute of Array.from(el.attributes)) {
        if (attribute.name.startsWith('on')) el.removeAttribute(attribute.name);
      }
    });
    if (root.querySelector('math')) {
      const {renderFormulas} = await import('./math.js');
      renderFormulas(root);
    }
    await document.fonts.ready;
    await Promise.all(Array.from(root.querySelectorAll('img')).map(img => img.decode().catch(() => {})));
    const sections = Array.from(root.querySelectorAll('section.exam-docx'));
    if (!sections.length) throw new Error('未能读取 Word 内容，请尝试在 Word 中另存为 .docx，或转成 PDF。');
    const pages = [];
    let budget = 0;
    for (let si = 0; si < sections.length; si++) {
      const section = sections[si];
      const sectionHeight = Math.max(section.scrollHeight, section.clientHeight);
      const width = Math.ceil(section.getBoundingClientRect().width);
      const pageStyle = getComputedStyle(section);
      const declaredHeight = parseFloat(pageStyle.minHeight) || 1122;
      const standardHeight = Math.max(900, Math.min(1600, declaredHeight));
      const bounds = section.getBoundingClientRect();
      const lines = [];
      const graphics = Array.from(section.querySelectorAll('img,svg')).map(element => {
        const rect = element.getBoundingClientRect();
        return {x:(rect.x-bounds.x)/width,y:rect.y-bounds.y,w:rect.width/width,h:rect.height};
      }).filter(rect=>rect.w>0 && rect.h>0);
      for (const p of section.querySelectorAll('p')) {
        const rect = p.getBoundingClientRect();
        if (!p.textContent.trim() || !rect.height) continue;
        let text = p.textContent.trim();
        // CSS counters are not textContent. Resolve decimal list numbering explicitly.
        const cssClass = Array.from(p.classList).find(c => /num-.*-\d+$/.test(c));
        if (cssClass) {
          const indent = Number(cssClass.match(/-(\d+)$/)?.[1]);
          const before = getComputedStyle(p, '::before').content;
          if (indent === 0 && /decimal/.test(before)) {
            const siblings = Array.from(root.querySelectorAll('p')).filter(q => q.classList.contains(cssClass));
            text = `${siblings.indexOf(p) + 1}. ${text}`;
          }
        }
        lines.push({text, x: (rect.x - bounds.x) / width, y: rect.y - bounds.y, w: rect.width / width, h: rect.height});
      }
      // docx-preview can return a very tall continuous section; rasterize slices,
      // avoiding canvas-size limits and preserving content after the first page.
      const count = sectionHeight <= standardHeight + 2 ? 1 : Math.ceil(sectionHeight / standardHeight);
      for (let slice = 0; slice < count; slice++) {
        if (pages.length >= 60) throw new Error('Word 文档排版后超过 60 页，请先拆分文件。');
        const offset = slice * standardHeight;
        const height = count === 1 ? sectionHeight : Math.min(standardHeight, sectionHeight - offset);
        const ratio = Math.min(2, 1700 / width);
        budget += width * height * ratio * ratio;
        if (budget > 100_000_000) throw new Error('Word 文档过大，请分批导入。');
        onProgress(`正在渲染 Word · 第 ${pages.length + 1} 页`, 0.15 + 0.7 * (si + (slice + 1) / count) / sections.length);
        const canvas = await toCanvas(section, {
          width, height, canvasWidth: width, canvasHeight: height, pixelRatio: ratio,
          backgroundColor: '#fff', skipFonts: true,
          style: {height: `${sectionHeight}px`, maxHeight: 'none', transform: `translateY(-${offset}px)`, transformOrigin: 'top left', margin: '0', boxShadow: 'none'},
          filter: node => !(node.tagName === 'SCRIPT'),
        });
        const sliceLines = lines.filter(l => l.y + l.h > offset && l.y < offset + height).map(l => ({...l, text: l.y < offset ? '' : l.text, y: Math.max(0, l.y - offset) / height, h: Math.min(l.h, height, l.y + l.h - offset) / height}));
        const sliceGraphics = graphics.filter(g=>g.y+g.h>offset && g.y<offset+height).map(g=>({...g,y:Math.max(0,g.y-offset)/height,h:Math.min(g.y+g.h,offset+height)/height-Math.max(offset,g.y)/height}));
        pages.push(makePage(canvas, sliceLines, [0, 1], mergeGraphics(sliceGraphics)));
      }
    }
    return pages;
  } finally {
    root.replaceChildren();
  }
}

function makePage(canvas, lines, contentRange, graphics = []) {
  const {width, height} = canvas;
  const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  const exclusions = pageLayout({lines, contentRange, graphics}).exclusions;
  for (const rect of exclusions) {
    for (let y=Math.max(0,Math.floor(rect.y*height));y<Math.min(height,Math.ceil((rect.y+rect.h)*height));y++) {
      for(let x=Math.max(0,Math.floor(rect.x*width));x<Math.min(width,Math.ceil((rect.x+rect.w)*width));x++) {
        const at=(y*width+x)*4; pixels[at]=pixels[at+1]=pixels[at+2]=255;
      }
    }
  }
  const bottoms = {};
  // Include diagrams beneath the last text line; text extraction alone cannot
  // see embedded images, vector geometry or handwritten work.
  for (const columns of [1, 2]) {
    bottoms[columns] = [];
    for (let col = 0; col < columns; col++) {
      let bottom = contentRange[0];
      outer: for (let y = Math.min(height - 1, Math.floor(height * contentRange[1])); y >= height * contentRange[0]; y -= 2) {
        let ink = 0;
        for (let x = Math.floor(width * (col / columns + 0.012)); x < width * ((col + 1) / columns - 0.012); x += 2) {
          const at = (y * width + x) * 4;
          if (Math.min(pixels[at],pixels[at+1],pixels[at+2]) < 220 && ++ink >= 4) {
            bottom = Math.min(contentRange[1], (y + 3) / height);
            break outer;
          }
        }
      }
      bottoms[columns].push(bottom);
    }
  }
  return {canvas, width, height, lines, graphics, exclusions, bottoms, contentRange, url: canvas.toDataURL('image/jpeg', 0.9)};
}

export async function recognizePages(pages, onProgress) {
  const {createWorker} = await import('tesseract.js');
  let worker;
  let index = 0;
  try {
    const offline = offlineOCR();
    worker = await createWorker(offline.languages, 1, {
      ...offline.options,
      logger: message => onProgress(`本地 OCR · 第 ${index + 1} / ${pages.length} 页 · ${message.status === 'recognizing text' ? '识别题号' : '准备识别引擎'}`, (index + (message.progress || 0)) / pages.length),
    });
    for (index = 0; index < pages.length; index++) {
      const page = pages[index];
      const {data} = await worker.recognize(page.canvas, {}, {blocks: true, text: true});
      const raw = [];
      for (const block of data.blocks || []) {
        for (const paragraph of block.paragraphs || []) {
          for (const line of paragraph.lines || []) {
            for (const word of line.words?.length ? line.words : [line]) {
              const b = word.bbox;
              raw.push({text:word.text,x:b.x0/page.width,y:b.y0/page.height,w:(b.x1-b.x0)/page.width,h:(b.y1-b.y0)/page.height});
            }
          }
        }
      }
      const lines = groupTextRuns(raw).map(line => line.x<.16 ? {...line,text:line.text.replace(/^[Il|l]{1,3}(?=\s*[,，.．、])/,value=>value.replace(/[Il|l]/g,'1'))} : line);
      const embedded=page.graphics.filter(g=>!g.raster);
      const recovered=rasterGraphics(page.canvas,lines).filter(g=>!embedded.some(e=>e.x<=g.x && e.y<=g.y && e.x+e.w>=g.x+g.w && e.y+e.h>=g.y+g.h));
      Object.assign(page,makePage(page.canvas,lines,page.contentRange,[...embedded,...recovered]));
    }
  } finally {
    await worker?.terminate();
  }
}
