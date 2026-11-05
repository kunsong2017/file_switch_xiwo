import pptxgen from 'pptxgenjs';

export function composeQuestion(question, pages, maxWidth = 1800) {
  const parts = question.segments.map(crop => {
    const p = pages[crop.page];
    return {p, crop, sw: Math.max(1, Math.round(p.width * crop.w)), sh: Math.max(1, Math.round(p.height * crop.h))};
  });
  const width = Math.min(maxWidth, Math.max(...parts.map(p => p.sw)));
  const heights = parts.map(p => p.sh * width / p.sw);
  const gap = parts.length > 1 ? 20 : 0;
  const totalHeight = Math.ceil(heights.reduce((a, b) => a + b, 0) + gap * (parts.length - 1));
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
    ctx.drawImage(part.p.canvas, Math.round(part.crop.x * part.p.width), Math.round(part.crop.y * part.p.height), part.sw, part.sh, 0, y * scale, canvas.width, heights[i] * scale);
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
