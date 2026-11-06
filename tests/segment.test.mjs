import {test} from 'node:test';
import assert from 'node:assert/strict';
import {questionNumber, segmentPages, normalizeCrop, splitQuestion} from '../src/segment.js';
const line = (text, y, x = .1) => ({text, y, x, w:.7, h:.02});

test('recognizes Chinese and numeric markers while excluding decimals and subquestions', () => {
  for (const s of ['1. 已知函数', '１． 已知', '1、已知', '第 1 题', '1）已知']) assert.equal(questionNumber(s), 1);
  for (const s of ['1.25 米', 'A. 选项', '（1）求解', '2026 年试卷']) assert.equal(questionNumber(s), null);
  assert.equal(questionNumber('（1）求解', true), 1);
});
test('one question continues across PDF pages', () => {
  const result = segmentPages([
    {lines:[line('数学试卷', .06), line('1. 计算', .2), line('（1）第一问', .4), line('第二问', .8)]},
    {lines:[line('接上一页的图和选项', .08), line('2. 求解', .4), line('A. 2', .6)]}
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].segments.length, 2);
  assert.deepEqual(result[0].segments.map(s => s.page), [0,1]);
  assert.ok(result[0].segments[1].y + result[0].segments[1].h < .4);
});
test('two columns are traversed left then right', () => {
  const result = segmentPages([{lines:[line('3. 右上题', .1, .55), line('1. 左上题', .1), line('4. 右下题', .5, .55), line('2. 左下题', .5)]}], 2);
  assert.deepEqual(result.map(q => q.title), ['第 1 题','第 2 题','第 3 题','第 4 题']);
  assert.ok(result[0].segments[0].x + result[0].segments[0].w < .5);
});
test('empty scan does not pretend to have recognized questions', () => {
  assert.deepEqual(segmentPages([{lines:[]}]), []);
});
test('page counters never become part of the final question crop', () => {
  const result = segmentPages([{lines:[line('1. 计算', .2), line('答：15', .35), line('第 1 页，共 2 页', .91)], bottoms:{1:[.94]}}]);
  assert.equal(result.length, 1);
  assert.ok(result[0].segments[0].y + result[0].segments[0].h < .91);
});
test('figure captions are not additional questions', () => {
  const result = segmentPages([{lines:[line('1. 计算', .2), line('2. 如图求面积', .5), line('第2题图', .7)]}]);
  assert.equal(result.length, 2);
});
test('an image-only continuation page is retained with its question', () => {
  const result = segmentPages([
    {lines:[line('1. 下页图中求解', .7)]},
    {lines:[], graphics:[{x:.2,y:.1,w:.4,h:.3}], bottoms:{1:[.4]}}
  ]);
  assert.ok(result[0].segments.some(segment => segment.page === 1));
});
test('preserves graphics below the last text line and continuous Word slice edges', () => {
  const graphics = segmentPages([{lines:[line('1. 看图回答',.2),line('题干结束',.3)],bottoms:{1:[.8]}}]);
  assert.ok(graphics[0].segments[0].y + graphics[0].segments[0].h >= .8);
  const word = segmentPages([
    {lines:[line('1. 长题',.4),line('上一片末行',.985)],contentRange:[0,1]},
    {lines:[line('下一片首行',.002),line('2. 新题',.4)],contentRange:[0,1]}
  ]);
  assert.equal(word[0].segments[0].y + word[0].segments[0].h,1);
  assert.equal(word[0].segments[1].y,0);
});
test('crops remain inside the page and split without losing pixels', () => {
  const c = normalizeCrop({page:0, x:.9, y:-.2, w:2, h:5});
  assert.equal(c.y, 0);
  assert.equal(c.x + c.w, 1);
  assert.equal(c.y + c.h, 1);
  const [a,b] = splitQuestion({segments:[c]});
  assert.equal(a[0].h + b[0].h, c.h);
  assert.equal(a[0].y + a[0].h, b[0].y);
});
