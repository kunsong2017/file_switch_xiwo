import pptxgen from 'pptxgenjs';
import {pageLayout} from './layout.js';
import {solutionPagePlans, exportPageCount} from './solution-layout.js';
import {hasSolution} from './solutions.js';
import {injectRevealTiming, revealShapeName} from './reveal.js';

function cropPart(crop,pages) {
  const page=pages[crop.page], sx=Math.floor(page.width*crop.x),sy=Math.floor(page.height*crop.y);
  const sw=Math.max(1,Math.min(page.width-sx,Math.ceil(page.width*(crop.x+crop.w))-sx));
  const sh=Math.max(1,Math.min(page.height-sy,Math.ceil(page.height*(crop.y+crop.h))-sy));
  const canvas=document.createElement('canvas');canvas.width=sw;canvas.height=sh;
  const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,sw,sh);
  context.save();
  if(crop.clip) {
    context.beginPath();
    crop.clip.forEach((p,i)=>context[i?'lineTo':'moveTo'](p.x*page.width-sx,p.y*page.height-sy));
    context.closePath();context.clip();
  }
  context.drawImage(page.canvas,sx,sy,sw,sh,0,0,sw,sh);
  context.restore();
  for(const rect of [...pageLayout(page).exclusions,...(crop.exclusions || [])]) {
    context.fillRect(Math.floor(rect.x*page.width)-sx,Math.floor(rect.y*page.height)-sy,Math.ceil(rect.w*page.width)+1,Math.ceil(rect.h*page.height)+1);
  }
  for(const rect of crop.protections || []) {
    const x=Math.max(0,Math.floor(rect.x*page.width)-1),y=Math.max(0,Math.floor(rect.y*page.height)-1);
    const w=Math.min(page.width-x,Math.ceil((rect.x+rect.w)*page.width)+1-x),h=Math.min(page.height-y,Math.ceil((rect.y+rect.h)*page.height)+1-y);
    if(w>0 && h>0) context.drawImage(page.canvas,x,y,w,h,x-sx,y-sy,w,h);
  }
  const pixels=context.getImageData(0,0,sw,sh).data;
  let minX=sw,minY=sh,maxX=-1,maxY=-1;
  for(let y=0;y<sh;y+=2) for(let x=0;x<sw;x+=2) {
    const at=(y*sw+x)*4;
    if(Math.min(pixels[at],pixels[at+1],pixels[at+2])<242) {minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  }
  if(maxX<0) return null;
  const x=Math.max(0,minX-8),y=Math.max(0,minY-8),w=Math.min(sw,maxX+10)-x,h=Math.min(sh,maxY+10)-y;
  return {canvas,x,y,w,h,logicalWidth:w*1800/page.width,logicalHeight:h*1800/page.width};
}

export function composeQuestion(question, pages, maxWidth = 1800) {
  const parts = question.segments.map(crop=>cropPart(crop,pages)).filter(Boolean);
  const naturalWidth=Math.max(1,...parts.map(p=>p.logicalWidth));
  const factor=Math.min(1,maxWidth/naturalWidth);
  const width = naturalWidth*factor;
  const heights = parts.map(p => p.logicalHeight*factor);
  const gap = parts.length > 1 ? 20 : 0;
  const totalHeight = Math.max(1,Math.ceil(heights.reduce((a, b) => a + b, 0) + gap * Math.max(0,parts.length - 1)));
  // Bound canvas memory even for questions spanning many pages.
  const scale = Math.min(1, 14000 / totalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(totalHeight * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let y = 0;
  parts.forEach((part, i) => {
    const partWidth=part.logicalWidth*factor*scale;
    ctx.drawImage(part.canvas,part.x,part.y,part.w,part.h,(canvas.width-partWidth)/2,y*scale,partWidth,heights[i]*scale);
    part.canvas.width=0;
    y += heights[i] + gap;
  });
  return canvas;
}

export const themes = {
  clean: {name: '纯白课堂', background: 'FFFFFF', panel: 'F1F5EA', ink: '29332D', accent: '507044', muted: '8B948D'},
  warm: {name: '暖色纸张', background: 'F7F4EC', panel: 'EFE7D8', ink: '453C30', accent: 'B67C4A', muted: '9C8E7D'},
  dark: {name: '深色讲台', background: '1E2B28', panel: '273833', ink: 'F0F4EB', accent: 'CDE5A5', muted: '9EAFA4'},
};

// 字号按框体大小与文字长度估算；同时交给 PowerPoint 的“溢出时缩排文字”。
export function solutionFontSize(text, width, height, max = 15, min = 9) {
  const chars = [...String(text)].length;
  for (let size = max; size >= min; size--) {
    const perLine = Math.max(8, Math.floor(width / (size / 72)));
    const lines = Math.ceil(chars / perLine) + String(text).split('\n').length - 1;
    if (lines * (size / 72) * 1.45 <= height) return size;
  }
  return min;
}

// 解析框高度随文字长度变化，文字少时不留下大片空白。
export function analysisBoxHeight(text, width, max = 1.85, min = 0.8) {
  const size = solutionFontSize(text, width, max, 14);
  const perLine = Math.max(8, Math.floor(width / (size / 72)));
  const lines = Math.ceil([...String(text)].length / perLine);
  return Math.min(max, Math.max(min, lines * (size / 72) * 1.6 + 0.55));
}

function labelSlide(slide, pptx, q, options, theme, width) {
  if (!options.headings) return .45;
  slide.addText(q.title, {x: 0.5, y: 0.28, w: width - 1, h: 0.4, fontFace: 'Microsoft YaHei', fontSize: 18, bold: true, color: theme.ink, margin: 0, breakLine: false});
  slide.addShape(pptx.ShapeType.line, {x: 0.5, y: 0.85, w: width - 1, h: 0, line: {color: theme.accent, width: 1.2}});
  return 1.08;
}

function addImageIn(slide, canvas, box, altText = '') {
  const scale = Math.min(box.w / canvas.width, box.h / canvas.height);
  const iw = canvas.width * scale;
  const ih = canvas.height * scale;
  slide.addImage({data: canvas.toDataURL('image/png'), x: box.x + (box.w - iw) / 2, y: box.y + (box.h - ih) / 2, w: iw, h: ih, altText});
}

// 解析 / 答案面板：reveal 模式带形状名，导出后注入“单击出现”动画。
function addSolutionPanels(slide, pptx, q, theme, boxes, names) {
  const answer = (q.answer || '').trim();
  const analysis = (q.analysis || '').trim();
  if (analysis && boxes.analysis) {
    const box = boxes.analysis;
    const inner = {w: box.w - 0.36, h: box.h - 0.30};
    slide.addText([{text: '解析\n', options: {bold: true, color: theme.accent, fontSize: 13}},
      {text: analysis, options: {color: theme.ink, fontSize: solutionFontSize(analysis, inner.w, inner.h, 14)}}], {
      x: box.x, y: box.y, w: box.w, h: box.h, fontFace: 'Microsoft YaHei', margin: [0.12, 0.18, 0.08, 0.18], valign: 'top', fit: 'shrink',
      fill: {color: theme.panel}, line: {color: theme.accent, width: 0.7}, objectName: names?.analysis,
    });
  }
  if (answer && boxes.answer) {
    const box = boxes.answer;
    const lines = answer.split('\n').length;
    slide.addText([{text: '答案　', options: {bold: true, color: theme.background, fontSize: 12}},
      {text: answer, options: {bold: true, color: theme.background, fontSize: solutionFontSize(answer, box.w - 0.3, box.h - 0.16, lines > 1 ? 13 : 16)}}], {
      x: box.x, y: box.y, w: box.w, h: box.h, fontFace: 'Microsoft YaHei', margin: [0.04, 0.22, 0.04, 0.22], valign: 'middle', fit: 'shrink',
      fill: {color: theme.accent}, line: {color: theme.accent, width: 0.7}, objectName: names?.answer,
    });
  }
}

function downloadBlob(buffer, fileName, type) {
  const url = URL.createObjectURL(new Blob([buffer], {type}));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function exportPPTX(questions, pages, options, onProgress) {
  const chosen = questions.filter(q => q.included);
  if (!chosen.length) throw new Error('请至少勾选一道题目。');
  // 希沃两种格式是整页图片，只能分页显示；reveal 仅用于 PowerPoint 导出。
  const mode = options.solutions || 'none';
  const solved = chosen.filter(hasSolution);
  const paged = mode === 'paged' && solved.length > 0;
  const reveal = mode === 'reveal' && solved.length > 0;
  const pptx = new pptxgen();
  pptx.layout = options.ratio === '4:3' ? 'LAYOUT_4x3' : 'LAYOUT_WIDE';
  pptx.author = '题页';
  pptx.subject = '试卷分题演示文稿';
  pptx.title = options.title;
  pptx.company = '题页 · Paper to Slides';
  pptx.lang = 'zh-CN';
  const theme = themes[options.theme];
  const width = options.ratio === '4:3' ? 10 : 13.333333;
  const height = 7.5;
  const total = exportPageCount(questions,{...options,format:'pptx'});
  const effects = {};
  let slideNumber = 0;
  let footer = 0;
  for (let i = 0; i < chosen.length; i++) {
    onProgress(`正在生成 PPT · 第 ${i + 1} / ${chosen.length} 题`, (i + 1) / chosen.length);
    await new Promise(resolve => setTimeout(resolve, 0));
    const q = chosen[i];
    const canvas = composeQuestion(q, pages);
    const hasAnalysis = Boolean((q.analysis || '').trim());
    const hasAnswer = Boolean((q.answer || '').trim());
    const showSolution = reveal && hasSolution(q);
    const slide = pptx.addSlide();
    slideNumber++;
    footer++;
    slide.background = {color: theme.background};
    const top = labelSlide(slide, pptx, q, options, theme, width);
    const panelWidth = width - 1 - 0.36;
    const analysisHeight = hasAnalysis ? analysisBoxHeight(q.analysis, panelWidth) : 0;
    const panelTop = 3.98;
    const questionBottom = showSolution ? (hasAnalysis ? panelTop - 0.08 : 5.7) : height - (options.blankSpace ? 2 : 0.5);
    addImageIn(slide, canvas, {x: 0.5, y: top, w: width - 1, h: questionBottom - top}, q.text || q.title);
    if (showSolution) {
      const names = {
        analysis: hasAnalysis ? revealShapeName('analysis', i) : undefined,
        answer: hasAnswer ? revealShapeName('answer', i) : undefined,
      };
      addSolutionPanels(slide, pptx, q, theme, {
        analysis: hasAnalysis ? {x: 0.5, y: panelTop, w: width - 1, h: analysisHeight} : null,
        answer: hasAnswer ? {x: 0.5, y: panelTop + analysisHeight + (hasAnalysis ? 0.14 : 0), w: width - 1, h: 0.7} : null,
      }, names);
      effects[slideNumber] = [names.analysis, names.answer].filter(Boolean);
    }
    if (!showSolution && options.blankSpace) {
      slide.addText('思考与板书', {x: 0.55, y: height - 1.65, w: 2, h: 0.25, fontFace: 'Microsoft YaHei', fontSize: 9, color: theme.muted, margin: 0});
      [0, 1, 2].forEach(n => slide.addShape(pptx.ShapeType.line, {x: 0.55, y: height - 1.15 + n * 0.32, w: width - 1.1, h: 0, line: {color: theme.muted, width: 0.3, transparency: 65}}));
    }
    slide.addText(`${footer} / ${total}`, {x: width - 1.15, y: height - 0.27, w: 0.65, h: 0.16, fontSize: 8, color: theme.muted, align: 'right', margin: 0});
    slide.addNotes(`原试卷：${options.title}\n题目：${q.title}\n来源页：${[...new Set(q.segments.map(s => s.page + 1))].join('、')}\n题目内容以图片保留；标题可编辑。`
      + (hasAnalysis ? `\n\n【解析】\n${q.analysis}` : '') + (hasAnswer ? `\n\n【答案】${q.answer}` : ''));
    if (paged && hasSolution(q)) {
      for(const [part,plan] of solutionPagePlans(q,options).entries()) {
      const solution = pptx.addSlide();
      slideNumber++;
      footer++;
      solution.background = {color: theme.background};
      const sTop = labelSlide(solution, pptx, {...q, title: `${q.title}　解析${part ? '（续）' : ''}`}, options, theme, width);
      const source=composeQuestion(q,pages);
      addImageIn(solution,source,{x:.5,y:sTop,w:width-1,h:plan.questionHeight/120},q.text || q.title);
      source.width=0;
      const contents={answer:'',analysis:''},boxes={};
      for(const block of plan.blocks) {
        contents[block.kind]=block.lines.join('\n');
        boxes[block.kind]={x:block.x/120,y:block.y/120,w:block.w/120,h:block.h/120};
      }
      addSolutionPanels(solution,pptx,contents,theme,boxes);
      solution.addText(`${footer} / ${total}`, {x: width - 1.15, y: height - 0.27, w: 0.65, h: 0.16, fontSize: 8, color: theme.muted, align: 'right', margin: 0});
      solution.addNotes(`${q.title}\n\n【解析】\n${q.analysis || '（未填写）'}\n\n【答案】${q.answer || '（未填写）'}`);
      }
    }
  }
  const name = (options.title || '试卷课件').replace(/[\\/:*?"<>|]/g, '_').slice(0, 100);
  if (reveal || paged) onProgress('正在整理课件与点击动画…', 0.98);
  if (Object.keys(effects).length) {
    const buffer = await pptx.write({outputType: 'arraybuffer'});
    const output = await injectRevealTiming(buffer, effects);
    downloadBlob(output, `${name}.pptx`, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  } else {
    await pptx.writeFile({fileName: `${name}.pptx`, compression: true});
  }
}
