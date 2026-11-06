// Coordinates are normalized so PDF, DOCX, OCR and manual crops share one model.
import {pageLayout, isFigureCaption, bindQuestionGraphics} from './layout.js';
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function questionNumber(text, allowBrackets = false) {
  const s = text.trim().replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (isFigureCaption(s)) return null;
  const m = s.match(/^(?:第\s*(\d{1,3})\s*题|([1-9]\d{0,2})\s*[.．、:：,，](?!\d)|([1-9]\d{0,2})\s*[)）])/);
  if (m) return Number(m[1] || m[2] || m[3]);
  if (allowBrackets) {
    const b = s.match(/^[（(]([1-9]\d{0,2})[）)]/);
    if (b) return Number(b[1]);
  }
  return null;
}

export function normalizeCrop(crop) {
  const x = clamp(Number(crop.x) || 0, 0, 0.99);
  const y = clamp(Number(crop.y) || 0, 0, 0.99);
  return { ...crop, page: crop.page, x, y, w: clamp(Number(crop.w) || 0.01, 0.01, 1 - x), h: clamp(Number(crop.h) || 0.01, 0.01, 1 - y) };
}

export function segmentPages(pages, columns = 1) {
  const questions = [];
  let previous = null;
  let serial = 0;
  const hasMainNumbers=pages.some(page=>pageLayout(page).lines.some(line=>questionNumber(line.text)!==null));
  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi];
    const layout = pageLayout(page);
    const [contentTop, contentBottom] = layout.range;
    for (let col = 0; col < columns; col++) {
      const left = col / columns;
      const right = (col + 1) / columns;
      const lines = layout.lines.filter(l => l.x >= left && l.x < right && l.y >= contentTop && l.y < contentBottom).sort((a, b) => a.y - b.y || a.x - b.x);
      const graphics = (page.graphics || []).filter(g => g.x+g.w > left && g.x < right);
      if (!lines.length && !graphics.length) continue;
      const minX = lines.length ? Math.min(...lines.map(l => l.x)) : left;
      // Parenthesized subquestions must not create slides when main numbers exist.
      const mainCandidates = lines.filter(l => questionNumber(l.text) !== null && l.x < minX + 0.12 / columns);
      const rawCandidates = mainCandidates.length ? mainCandidates : hasMainNumbers ? [] : lines.filter(l => questionNumber(l.text, true) !== null && l.x < minX + 0.08 / columns);
      const candidates=[];
      for(const line of rawCandidates) {
        const previous=candidates.at(-1);
        if(previous && Math.abs(previous.y-line.y)<Math.min(.012,Math.max(previous.h,line.h)*.55)) {
          if(line.x<previous.x) candidates[candidates.length-1]=line;
        } else candidates.push(line);
      }
      const start = line => {
        const preceding=lines.filter(other=>other.y<line.y-.006 && other.y+other.h<line.y);
        const bottom=preceding.length ? Math.max(...preceding.map(other=>other.y+other.h)) : line.y-.006;
        return Math.max(contentTop,Math.min(line.y-.003,(bottom+line.y)/2,...graphics.filter(g=>g.h<.06 && g.w<.45 && g.y<line.y+.01 && g.y+g.h>line.y).map(g=>g.y-.002)));
      };
      const maxBottom = Math.min(contentBottom, Math.max(...lines.map(l => l.y + l.h), ...graphics.map(g=>g.y+g.h), page.bottoms?.[columns]?.[col] || 0) + 0.015);
      const x = left + .004;
      const w = right - .004 - x;
      const addContinuation = end => {
        if (!previous) return;
        const first = Math.max(contentTop,Math.min(lines[0]?.y ?? 1, ...graphics.map(g=>g.y)) - 0.004);
        if (end - first > 0.012) previous.segments.push(normalizeCrop({page: pi, x, y: first, w, h: end - first}));
      };
      if (!candidates.length) {
        addContinuation(maxBottom);
        continue;
      }
      addContinuation(start(candidates[0]));
      for (let i = 0; i < candidates.length; i++) {
        const line = candidates[i];
        const y = start(line);
        const end = candidates[i + 1] ? start(candidates[i+1]) : maxBottom;
        if (end <= y) continue;
        previous = {
          id: `auto-${++serial}`,
          title: `第 ${questionNumber(line.text, true)} 题`,
          number: questionNumber(line.text, true),
          text: line.text,
          included: true,
          segments: [normalizeCrop({page: pi, x, y, w, h: end - y, anchorY:line.y})]
        };
        questions.push(previous);
      }
    }
  }
  return bindQuestionGraphics(questions,pages);
}

export function splitQuestion(question) {
  if (question.segments.length > 1) {
    const n = Math.ceil(question.segments.length / 2);
    return [question.segments.slice(0, n), question.segments.slice(n)];
  }
  const c = question.segments[0];
  return [[{...c, h: c.h / 2}], [{...c, y: c.y + c.h / 2, h: c.h / 2}]];
}
