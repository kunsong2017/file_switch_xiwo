import pptxgen from 'pptxgenjs';
import {pageLayout} from './layout.js';

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
  clean: {name: '纯白课堂', background: 'FFFFFF', ink: '29332D', accent: '507044', muted: '8B948D'},
  warm: {name: '暖色纸张', background: 'F7F4EC', ink: '453C30', accent: 'B67C4A', muted: '9C8E7D'},
  dark: {name: '深色讲台', background: '1E2B28', ink: 'F0F4EB', accent: 'CDE5A5', muted: '9EAFA4'},
};

export async function exportPPTX(questions, pages, options, onProgress) {
  const chosen = questions.filter(q => q.included);
  if (!chosen.length) throw new Error('请至少勾选一道题目。');
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
  for (let i = 0; i < chosen.length; i++) {
    onProgress(`正在生成 PPT · 第 ${i + 1} / ${chosen.length} 题`, (i + 1) / chosen.length);
    await new Promise(resolve => setTimeout(resolve, 0));
    const q = chosen[i];
    const canvas = composeQuestion(q, pages);
    const slide = pptx.addSlide();
    slide.background = {color: theme.background};
    if (options.headings) {
      slide.addText(q.title, {x: 0.5, y: 0.28, w: width - 1, h: 0.4, fontFace: 'Microsoft YaHei', fontSize: 18, bold: true, color: theme.ink, margin: 0, breakLine: false});
      slide.addShape(pptx.ShapeType.line, {x: 0.5, y: 0.85, w: width - 1, h: 0, line: {color: theme.accent, width: 1.2}});
    }
    const top = options.headings ? 1.08 : 0.45;
    const availableHeight = height - top - (options.blankSpace ? 2 : 0.5);
    const availableWidth = width - 1;
    const scale = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
    const iw = canvas.width * scale;
    const ih = canvas.height * scale;
    const x = 0.5 + (availableWidth - iw) / 2;
    slide.addImage({data: canvas.toDataURL('image/png'), x, y: top, w: iw, h: ih, altText: q.text || q.title});
    if (options.blankSpace) {
      slide.addText('思考与板书', {x: 0.55, y: height - 1.65, w: 2, h: 0.25, fontFace: 'Microsoft YaHei', fontSize: 9, color: theme.muted, margin: 0});
      [0, 1, 2].forEach(n => slide.addShape(pptx.ShapeType.line, {x: 0.55, y: height - 1.15 + n * 0.32, w: width - 1.1, h: 0, line: {color: theme.muted, width: 0.3, transparency: 65}}));
    }
    slide.addText(`${i + 1} / ${chosen.length}`, {x: width - 1.15, y: height - 0.27, w: 0.65, h: 0.16, fontSize: 8, color: theme.muted, align: 'right', margin: 0});
    slide.addNotes(`原试卷：${options.title}\n题目：${q.title}\n来源页：${[...new Set(q.segments.map(s => s.page + 1))].join('、')}\n题目内容以图片保留；标题可编辑。`);
  }
  const name = (options.title || '试卷课件').replace(/[\\/:*?"<>|]/g, '_').slice(0, 100);
  await pptx.writeFile({fileName: `${name}.pptx`, compression: true});
}
