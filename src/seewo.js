import {composeQuestion, themes} from './export.js';
import pptxgen from 'pptxgenjs';

// Render an entire page to an image so Seewo import does not depend on Office
// fonts, MathML or special drawing objects. Users can add annotations in Seewo.
function renderPage(q, pages, options, index, total) {
  const canvas = document.createElement('canvas');
  canvas.width = options.ratio === '4:3' ? 1200 : 1600;
  canvas.height = 900;
  const theme = themes[options.theme];
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `#${theme.background}`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'top';
  const factor = 120;
  if (options.headings) {
    ctx.font = '600 30px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillStyle = `#${theme.ink}`;
    ctx.fillText(q.title, 60, 34, canvas.width - 120);
    ctx.strokeStyle = `#${theme.accent}`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(60,102); ctx.lineTo(canvas.width-60,102); ctx.stroke();
  }
  const question = composeQuestion(q, pages);
  const top = options.headings ? 1.08 * factor : .45 * factor;
  const availableHeight = canvas.height - top - (options.blankSpace ? 2 : .5) * factor;
  const availableWidth = canvas.width - 120;
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
      const y = canvas.height - 1.15 * factor + i * .32 * factor;
      ctx.beginPath();ctx.moveTo(66,y);ctx.lineTo(canvas.width-66,y);ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.font = '13px sans-serif';
  ctx.fillStyle = `#${theme.muted}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${index+1} / ${total}`,canvas.width-60,canvas.height-15);
  return canvas;
}

export async function exportSeewoPPTX(questions, pages, options, onProgress) {
  const chosen = questions.filter(q => q.included);
  if (!chosen.length) throw new Error('请至少勾选一道题目。');
  const pptx = new pptxgen();
  pptx.layout = options.ratio === '4:3' ? 'LAYOUT_4x3' : 'LAYOUT_WIDE';
  pptx.author = '题页';
  pptx.title = options.title;
  pptx.subject = '希沃白板导入课件';
  pptx.lang = 'zh-CN';
  const width = options.ratio === '4:3' ? 10 : 13.333333;
  await document.fonts.ready;
  for (let i = 0; i < chosen.length; i++) {
    onProgress(`正在生成希沃导入课件 · 第 ${i+1} / ${chosen.length} 题`,(i+1)/chosen.length);
    await new Promise(resolve => setTimeout(resolve,0));
    const canvas = renderPage(chosen[i],pages,options,i,chosen.length);
    const slide = pptx.addSlide();
    slide.addImage({data:canvas.toDataURL('image/png'),x:0,y:0,w:width,h:7.5,altText:chosen[i].title});
    slide.addNotes(`希沃白板导入版。每页为完整图片，可在希沃内添加批注与其他元素。\n原试卷：${options.title}\n题目：${chosen[i].title}\n来源页：${[...new Set(chosen[i].segments.map(s => s.page+1))].join('、')}`);
    canvas.width = 0;
  }
  const name = (options.title || '试卷课件').replace(/[\\/:*?"<>|]/g,'_').slice(0,90);
  await pptx.writeFile({fileName:`${name}-希沃导入版.pptx`,compression:true});
}
