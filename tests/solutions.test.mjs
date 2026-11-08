import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSolutionsText, parseSolutionsJSON, applySolutions, buildSolutionExport, solutionStats, hasSolution} from '../src/solutions.js';
import {timingXML, shapeIdsByName, addTimingToSlide} from '../src/reveal.js';

const questions = () => [
  {id: 'a', number: 1, title: '第 1 题', included: true, answer: '', analysis: ''},
  {id: 'b', number: 2, title: '第 2 题', included: true, answer: '', analysis: ''},
  {id: 'c', number: 3, title: '第 3 题', included: true, answer: '', analysis: ''},
];

test('解析题号 + 答案 + 解析的粘贴文本', () => {
  const entries = parseSolutionsText('1. 答案：D\n解析：因为反比例函数形如 k/x。\n\n2. 答案：x₁=1，x₂=-5\n解析：因式分解得 (x+5)(x-1)=0。\n\n第 3 题 答案：4√3');
  assert.deepEqual(entries, [
    {number: 1, answer: 'D', analysis: '因为反比例函数形如 k/x。'},
    {number: 2, answer: 'x₁=1，x₂=-5', analysis: '因式分解得 (x+5)(x-1)=0。'},
    {number: 3, answer: '4√3', analysis: ''},
  ]);
});

test('只有解析没有答案时归入解析', () => {
  const [entry] = parseSolutionsText('5. 先求导数，再判断单调性。');
  assert.equal(entry.number, 5);
  assert.equal(entry.answer, '');
  assert.equal(entry.analysis, '先求导数，再判断单调性。');
});

test('行内标记与【】标记都能识别', () => {
  const [entry] = parseSolutionsText('7. 【答案】B\n【解析】由勾股定理。');
  assert.equal(entry.answer, 'B');
  assert.equal(entry.analysis, '由勾股定理。');
});

test('按题号匹配，匹配不到的不改写题目', () => {
  const qs = questions();
  const applied = applySolutions(qs, [{number: 2, answer: 'C', analysis: '解析 2'}, {number: 99, answer: 'X', analysis: 'Y'}]);
  assert.equal(applied, 1);
  assert.equal(qs[1].answer, 'C');
  assert.equal(qs[1].analysis, '解析 2');
  assert.equal(qs[0].answer, '');
});

test('没有题号时按顺序匹配', () => {
  const qs = questions().map(q => ({...q, number: undefined}));
  applySolutions(qs, [{number: 1, answer: 'A', analysis: ''}]);
  assert.equal(qs[0].answer, 'A');
});

test('JSON 导入导出往返', () => {
  const qs = questions();
  qs[0].answer = 'D';
  qs[0].analysis = '解析一';
  qs[2].answer = '12';
  const data = buildSolutionExport(qs, '测试卷');
  const parsed = parseSolutionsJSON(JSON.stringify(data));
  assert.deepEqual(parsed, [
    {number: 1, answer: 'D', analysis: '解析一'},
    {number: 3, answer: '12', analysis: ''},
  ]);
  assert.deepEqual(solutionStats(qs), {total: 3, answer: 2, analysis: 1});
  assert.equal(hasSolution(qs[1]), false);
  assert.equal(hasSolution(qs[0]), true);
});

test('用户真卷答案文件覆盖全部题目', async () => {
  const {readFile} = await import('node:fs/promises');
  for (const [file, count] of [['期中综合复习2.json', 27], ['复习卷6.json', 26]]) {
    const data = parseSolutionsJSON(await readFile(`tests/solutions/${file}`, 'utf8'));
    assert.deepEqual(data.map(q => q.number), Array.from({length: count}, (_, i) => i + 1), file);
    assert.ok(data.every(q => q.answer && q.analysis), `${file} 每题都有答案和解析`);
  }
});

test('点击动画：每个步骤一个 clickEffect，并指向形状 id', () => {
  const xml = timingXML([4, 5]);
  assert.equal((xml.match(/nodeType="clickEffect"/g) || []).length, 2);
  assert.equal((xml.match(/presetClass="entr"/g) || []).length, 2);
  assert.match(xml, /<p:spTgt spid="4"\/>/);
  assert.match(xml, /<p:spTgt spid="5"\/>/);
  assert.match(xml, /<p:cond delay="indefinite"\/>/);
  assert.equal((xml.match(/<p:par>/g) || []).length, 7, 'tmRoot + 2 组 × (clickPar + 内层 par + 效果 par)');
});

test('按形状名找 id 并写入 slide XML', () => {
  const slide = '<?xml version="1.0"?><p:sld xmlns:p="p"><p:cSld><p:spTree><p:cNvPr id="2" name="sol-analysis-0"/><p:cNvPr id="3" name="sol-answer-0"/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
  assert.deepEqual(shapeIdsByName(slide, ['sol-analysis-0', 'sol-answer-0', 'missing']), [2, 3]);
  const out = addTimingToSlide(slide, [2, 3]);
  assert.ok(out.indexOf('<p:timing>') > out.indexOf('<p:clrMapOvr>'));
  assert.ok(out.indexOf('<p:timing>') < out.indexOf('</p:sld>'));
  assert.equal(addTimingToSlide(out, [2, 3]), out, '不重复写入');
});
