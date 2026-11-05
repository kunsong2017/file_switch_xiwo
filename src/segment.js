// Coordinates are normalized so PDF, DOCX, OCR and manual crops share one model.
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function questionNumber(text, allowBrackets = false) {
  const s = text.trim().replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const m = s.match(/^(?:第\s*(\d{1,3})\s*题|([1-9]\d{0,2})\s*[.．、:：](?!\d)|([1-9]\d{0,2})\s*[)）])/);
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
  return { page: crop.page, x, y, w: clamp(Number(crop.w) || 0.01, 0.01, 1 - x), h: clamp(Number(crop.h) || 0.01, 0.01, 1 - y) };
}

export function segmentPages(pages, columns = 1) {
  const questions = [];
  let previous = null;
  let serial = 0;
  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi];
    const [contentTop, contentBottom] = page.contentRange || [0.025, 0.965];
    for (let col = 0; col < columns; col++) {
      const left = col / columns;
      const right = (col + 1) / columns;
      const lines = page.lines.filter(l => l.x >= left && l.x < right && l.y >= contentTop && l.y < contentBottom).sort((a, b) => a.y - b.y || a.x - b.x);
      if (!lines.length) continue;
      const minX = Math.min(...lines.map(l => l.x));
      // Parenthesized subquestions must not create slides when main numbers exist.
      const mainCandidates = lines.filter(l => questionNumber(l.text) !== null && l.x < minX + 0.12 / columns);
      const candidates = mainCandidates.length ? mainCandidates : lines.filter(l => questionNumber(l.text, true) !== null && l.x < minX + 0.08 / columns);
      const maxBottom = Math.min(contentBottom, Math.max(...lines.map(l => l.y + l.h), page.bottoms?.[columns]?.[col] || 0) + 0.015);
      const x = Math.max(left + 0.012, minX - 0.012);
      const w = right - 0.015 - x;
      const addContinuation = end => {
        if (!previous) return;
        const first = lines[0].y - 0.004;
        if (end - first > 0.012) previous.segments.push(normalizeCrop({page: pi, x, y: first, w, h: end - first}));
      };
      if (!candidates.length) {
        addContinuation(maxBottom);
        continue;
      }
      addContinuation(Math.max(contentTop, candidates[0].y - 0.009));
      for (let i = 0; i < candidates.length; i++) {
        const line = candidates[i];
        const y = Math.max(0, line.y - 0.007);
        const end = candidates[i + 1] ? candidates[i + 1].y - 0.012 : maxBottom;
        if (end <= y) continue;
        previous = {
          id: `auto-${++serial}`,
          title: `第 ${questionNumber(line.text, true)} 题`,
          text: line.text,
          included: true,
          segments: [normalizeCrop({page: pi, x, y, w, h: end - y})]
        };
        questions.push(previous);
      }
    }
  }
  return questions;
}

export function splitQuestion(question) {
  if (question.segments.length > 1) {
    const n = Math.ceil(question.segments.length / 2);
    return [question.segments.slice(0, n), question.segments.slice(n)];
  }
  const c = question.segments[0];
  return [[{...c, h: c.h / 2}], [{...c, y: c.y + c.h / 2, h: c.h / 2}]];
}
