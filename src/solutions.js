// 答案与解析：纯数据处理，不依赖 DOM，便于在 Node 下直接测试。
// 试卷正文仍是原图；答案与解析是老师提供（或导入）的文字，导出时默认隐藏。

export const hasSolution = question => Boolean((question?.answer || '').trim() || (question?.analysis || '').trim());

const HEAD = /^\s*(?:第\s*(\d{1,3})\s*题|(\d{1,3})\s*[.．、:：)）,，])\s*(.*)$/;
const ANSWER = /^\s*(?:【\s*答案\s*】|答案)\s*[:：]?\s*(.*)$/;
const ANALYSIS = /^\s*(?:【\s*解析\s*】|解析)\s*[:：]?\s*(.*)$/;
const strip = text => text.replace(/\r\n?/g, '\n').replace(/\s+$/g, '');

function readBlock(text) {
  const lines = text.replace(/[;；]\s*(?=【\s*(?:答案|解析)\s*】|(?:答案|解析)\s*[:：])/g, '\n').split('\n');
  let field = null;
  const answer = [];
  const analysis = [];
  for (const line of lines) {
    const a = line.match(ANSWER);
    const p = line.match(ANALYSIS);
    if (a) {field = answer; if (a[1].trim()) answer.push(a[1].trim()); continue;}
    if (p) {field = analysis; if (p[1].trim()) analysis.push(p[1].trim()); continue;}
    if (field) field.push(line);
  }
  // 没有“答案 / 解析”标记时，整段文字按解析处理，避免把解题过程误当成最终答案。
  if (!answer.length && !analysis.length && text.trim()) analysis.push(text.trim());
  return {answer: answer.join('\n').trim(), analysis: analysis.join('\n').trim()};
}

// 支持两种写法：
//   1. 答案：D
//      解析：因为……
//   第 2 题 答案：x=1 或 x=-5
// 也接受行内写法：`1. 答案：D；解析：……`
export function parseSolutionsText(input) {
  const text = strip(String(input ?? ''));
  const entries = [];
  let current = null;
  for (const line of text.split('\n')) {
    const head = line.match(HEAD);
    if (head) {
      if (current) entries.push(current);
      current = {number: Number(head[1] || head[2]), lines: [head[3] || '']};
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) entries.push(current);
  return entries.map(entry => ({number: entry.number, ...readBlock(entry.lines.join('\n'))}))
    .filter(entry => entry.number > 0 && (entry.answer || entry.analysis));
}

export function parseSolutionsJSON(input) {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  const list = Array.isArray(data) ? data : data?.questions;
  if (!Array.isArray(list)) throw new Error('答案文件缺少 questions 数组');
  return list.map((item, index) => ({
    number: Number(item.number ?? index + 1),
    answer: String(item.answer ?? '').trim(),
    analysis: String(item.analysis ?? '').trim(),
  })).filter(entry => entry.number > 0 && (entry.answer || entry.analysis));
}

// 按题号匹配；没有题号的试卷（手动框选）退化为按顺序匹配。
export function applySolutions(questions, entries) {
  const byNumber = new Map(questions.filter(q => Number.isInteger(q.number)).map(q => [q.number, q]));
  let applied = 0;
  for (const entry of entries) {
    const q = byNumber.get(entry.number) ?? (!byNumber.size ? questions[entry.number - 1] : undefined);
    if (!q) continue;
    if (entry.answer) q.answer = entry.answer;
    if (entry.analysis) q.analysis = entry.analysis;
    delete q.autoResult;
    applied++;
  }
  return applied;
}

export function buildSolutionExport(questions, title = '') {
  return {
    paper: title,
    questions: questions.map((q, index) => ({
      number: q.number ?? index + 1,
      title: q.title,
      answer: q.answer || '',
      analysis: q.analysis || '',
    })).filter(entry => entry.answer || entry.analysis),
  };
}

export function solutionStats(questions) {
  return {
    total: questions.length,
    answer: questions.filter(q => (q.answer || '').trim()).length,
    analysis: questions.filter(q => (q.analysis || '').trim()).length,
  };
}

// Re-segmentation recreates question objects. Only transfer an unambiguous
// question number, so changing columns/OCR cannot attach an answer elsewhere.
export function preserveSolutions(previous, questions) {
  const unique = list => {
    const byNumber = new Map();
    for (const q of list) if (Number.isInteger(q.number)) {
      byNumber.set(q.number, byNumber.has(q.number) ? null : q);
    }
    return byNumber;
  };
  const before = unique(previous), after = unique(questions);
  let kept = 0;
  for (const [number, q] of after) {
    const old = before.get(number);
    if (!q || !old || !hasSolution(old)) continue;
    q.answer = old.answer || '';
    q.analysis = old.analysis || '';
    kept++;
  }
  return kept;
}
