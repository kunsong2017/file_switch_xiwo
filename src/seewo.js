import {composeQuestion, themes} from './export.js';
import {hasSolution} from './solutions.js';
import {solutionPagePlans, exportPageCount} from './solution-layout.js';
import pptxgen from 'pptxgenjs';

// Render an entire page to an image so Seewo import does not depend on Office
// fonts, MathML or special drawing objects. Users can add annotations in Seewo.
function pageCanvas(options, resolution = 1) {
  const canvas = document.createElement('canvas');
  const pageWidth = options.ratio === '4:3' ? 1200 : 1600, pageHeight = 900;
  canvas.width = pageWidth * resolution;
  canvas.height = pageHeight * resolution;
  const theme = themes[options.theme];
  const ctx = canvas.getContext('2d');
  ctx.scale(resolution, resolution);
  ctx.fillStyle = `#${theme.background}`;
  ctx.fillRect(0, 0, pageWidth, pageHeight);
  return {canvas, ctx, pageWidth, pageHeight, theme, resolution};
}

function drawHeading(ctx, text, options, pageWidth, theme) {
  const factor = 120;
  if (!options.headings) return .45 * factor;
  ctx.font = '600 30px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillStyle = `#${theme.ink}`;
  ctx.fillText(text, 60, 34, pageWidth - 120);
  ctx.strokeStyle = `#${theme.accent}`;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(60,102); ctx.lineTo(pageWidth-60,102); ctx.stroke();
  return 1.08 * factor;
}

function drawFooter(ctx, index, total, pageWidth, pageHeight, theme) {
  ctx.font = '13px sans-serif';
  ctx.fillStyle = `#${theme.muted}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${index+1} / ${total}`, pageWidth-60, pageHeight-15);
  ctx.textAlign = 'left';
}

export function renderPage(q, pages, options, index, total, resolution = 1) {
  const {canvas, ctx, pageWidth, pageHeight, theme} = pageCanvas(options, resolution);
  ctx.textBaseline = 'top';
  const factor = 120;
  const top = drawHeading(ctx, q.title, options, pageWidth, theme);
  const question = composeQuestion(q, pages);
  const availableHeight = pageHeight - top - (options.blankSpace ? 2 : .5) * factor;
  const availableWidth = pageWidth - 120;
  const scale = Math.min(availableWidth / question.width, availableHeight / question.height);
  const width = question.width * scale, height = question.height * scale;
  ctx.drawImage(question,60+(availableWidth-width)/2,top,width,height);
  if (options.blankSpace) {
    ctx.font = '15px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.fillStyle = `#${theme.muted}`;
    ctx.fillText('思考与板书',66,702);
    ctx.strokeStyle = `#${theme.muted}`;
    ctx.lineWidth = .5;
    ctx.globalAlpha = .35;
    for (let i = 0; i < 3; i++) {
      const y = pageHeight - 1.15 * factor + i * .32 * factor;
      ctx.beginPath();ctx.moveTo(66,y);ctx.lineTo(pageWidth-66,y);ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  drawFooter(ctx, index, total, pageWidth, pageHeight, theme);
  question.width=0;
  return canvas;
}

// 解析页：题目缩小放在上方，下面显示解析与答案。希沃导入版 / 原生课件只有整页图片，
// 因此“隐藏后点击出现”在这里落成“题目一页、解析一页”，翻页即出现。
export function renderSolutionPage(q, pages, options, index, total, resolution = 1, part = 0) {
  const {canvas, ctx, pageWidth, pageHeight, theme} = pageCanvas(options, resolution);
  const plan=solutionPagePlans(q,options)[part];
  if(!plan) throw new Error('解析页不存在');
  ctx.textBaseline = 'top';
  const top = drawHeading(ctx, `${q.title}　解析${part ? '（续）' : ''}`, options, pageWidth, theme);
  const question = composeQuestion(q, pages);
  const box = {x: 60, y: top, w: pageWidth - 120, h: plan.questionHeight};
  const scale = Math.min(box.w / question.width, box.h / question.height);
  const width = question.width * scale, height = question.height * scale;
  ctx.drawImage(question, 60 + (box.w - width) / 2, top, width, height);
  question.width = 0;
  for(const block of plan.blocks) {
    const answer=block.kind==='answer';
    ctx.fillStyle=`#${answer ? theme.accent : theme.panel}`;
    ctx.fillRect(block.x,block.y,block.w,block.h);
    ctx.fillStyle=`#${answer ? theme.background : theme.accent}`;
    ctx.font='600 20px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.fillText(block.label,block.x+22,block.y+14);
    ctx.fillStyle=`#${answer ? theme.background : theme.ink}`;
    ctx.font=`${block.size}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    block.lines.forEach((line,i)=>ctx.fillText(line,block.x+22,block.y+42+i*block.lineHeight));
  }
  drawFooter(ctx, index, total, pageWidth, pageHeight, theme);
  return canvas;
}

export async function exportSeewoPPTX(questions, pages, options, onProgress) {
  const chosen = questions.filter(q => q.included);
  if (!chosen.length) throw new Error('请至少勾选一道题目。');
  const mode = options.solutions || 'none';
  const solved = mode === 'none' ? [] : chosen.filter(hasSolution);
  const total = exportPageCount(questions,{...options,format:'seewo'});
  const pptx = new pptxgen();
  pptx.layout = options.ratio === '4:3' ? 'LAYOUT_4x3' : 'LAYOUT_WIDE';
  pptx.author = '题页';
  pptx.title = options.title;
  pptx.subject = '希沃白板导入课件';
  pptx.lang = 'zh-CN';
  const width = options.ratio === '4:3' ? 10 : 13.333333;
  await document.fonts.ready;
  let page = 0;
  for (let i = 0; i < chosen.length; i++) {
    onProgress(`正在生成希沃导入课件 · 第 ${i+1} / ${chosen.length} 题`,(i+1)/chosen.length);
    await new Promise(resolve=>setTimeout(resolve,0));
    const canvas = renderPage(chosen[i],pages,options,page++,total);
    const slide = pptx.addSlide();
    slide.addImage({data:canvas.toDataURL('image/png'),x:0,y:0,w:width,h:7.5,altText:chosen[i].title});
    slide.addNotes(`希沃白板导入版。每页为完整图片，可在希沃内添加批注与其他元素。\n原试卷：${options.title}\n题目：${chosen[i].title}\n来源页：${[...new Set(chosen[i].segments.map(s => s.page+1))].join('、')}`);
    canvas.width = 0;
    if (solved.includes(chosen[i])) {
      for(let part=0;part<solutionPagePlans(chosen[i],options).length;part++) {
      const solution = renderSolutionPage(chosen[i],pages,options,page++,total,1,part);
      const answerSlide = pptx.addSlide();
      answerSlide.addImage({data:solution.toDataURL('image/png'),x:0,y:0,w:width,h:7.5,altText:`${chosen[i].title} 解析`});
      answerSlide.addNotes(`${chosen[i].title}\n\n【解析】\n${chosen[i].analysis || '（未填写）'}\n\n【答案】${chosen[i].answer || '（未填写）'}`);
      solution.width = 0;
      }
    }
  }
  const name = (options.title || '试卷课件').replace(/[\\/:*?"<>|]/g,'_').slice(0,90);
  await pptx.writeFile({fileName:`${name}-希沃导入版.pptx`,compression:true});
}
