import test from 'node:test';
import assert from 'node:assert/strict';
import {answerProviders, providerById, buildAnswerRequest, parseAnswerJSON, messageText, solveQuestion} from '../src/answer.js';

const provider = {base: 'https://example.com/v1/chat/completions', model: 'vl-test', via: 'direct'};
const dataUrl = 'data:image/jpeg;base64,AAAA';

test('请求体包含图片与提示词', () => {
  const body = buildAnswerRequest({provider, dataUrl});
  assert.equal(body.model, 'vl-test');
  assert.equal(body.messages[0].content[0].type, 'text');
  assert.match(body.messages[0].content[0].text, /JSON/);
  assert.equal(body.messages[0].content[1].image_url.url, dataUrl);
  assert.throws(() => buildAnswerRequest({provider: {...provider, base: ''}, dataUrl}), /接口地址/);
  assert.throws(() => buildAnswerRequest({provider: {...provider, model: ''}, dataUrl}), /模型名称/);
});

test('解析 JSON、代码围栏和纯文本回退', () => {
  assert.deepEqual(parseAnswerJSON('{"answer":"D","analysis":"因为……"}'), {answer: 'D', analysis: '因为……'});
  assert.deepEqual(parseAnswerJSON('```json\n{"answer":"B"}\n```'), {answer: 'B', analysis: ''});
  assert.deepEqual(parseAnswerJSON('答案：C\n解析：由勾股定理。'), {answer: 'C', analysis: '由勾股定理。'});
  assert.throws(() => parseAnswerJSON('抱歉，我无法回答'), /无法解析/);
});

test('兼容数组形式的 content', () => {
  assert.equal(messageText({choices: [{message: {content: [{type: 'text', text: 'a'}, {type: 'text', text: 'b'}]}}]}), 'ab');
});

test('直连请求带 Authorization，经转发时不带', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({url, options});
    return {ok: true, status: 200, json: async () => ({choices: [{message: {content: '{"answer":"A","analysis":"x"}'}}]})};
  };
  const direct = await solveQuestion({provider, dataUrl, apiKey: 'secret', fetchImpl});
  assert.deepEqual(direct, {answer: 'A', analysis: 'x'});
  assert.equal(calls[0].url, provider.base);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret');
  assert.equal(JSON.parse(calls[0].options.body).model, 'vl-test');

  const proxied = await solveQuestion({provider: {...provider, via: 'proxy'}, dataUrl, apiKey: 'secret', proxyUrl: 'http://127.0.0.1:5199/api/answer', fetchImpl});
  assert.deepEqual(proxied, {answer: 'A', analysis: 'x'});
  assert.equal(calls[1].url, 'http://127.0.0.1:5199/api/answer');
  assert.equal(calls[1].options.headers.Authorization, undefined);
  const payload = JSON.parse(calls[1].options.body);
  assert.equal(payload.url, provider.base);
  assert.equal(payload.apiKey, 'secret');
  assert.equal(payload.body.model, 'vl-test');
});

test('错误响应与网络错误给出可读提示', async () => {
  await assert.rejects(
    solveQuestion({provider, dataUrl, fetchImpl: async () => ({ok: false, status: 401, text: async () => 'invalid key'})}),
    /401.*invalid key/,
  );
  await assert.rejects(
    solveQuestion({provider, dataUrl, fetchImpl: async () => {throw new TypeError('Failed to fetch');}}),
    /跨域|转发/,
  );
  await assert.rejects(
    solveQuestion({provider: {...provider, via: 'proxy'}, dataUrl, fetchImpl: async () => {throw new TypeError('Failed to fetch');}}),
    /answer:proxy/,
  );
});

test('模型预设齐全', () => {
  assert.equal(providerById('deepseek').model, 'deepseek-flash');
  assert.equal(providerById('deepseek').via, 'direct');
  assert.match(providerById('deepseek').base, /api\.deepseek\.com/);
  assert.equal(providerById('zhipu').model, 'glm-4v-flash');
  assert.equal(providerById('zhipu').via, 'proxy');
  assert.equal(providerById('qwen').via, 'direct');
  assert.ok(answerProviders.every(p => p.name && p.note));
});

test('DeepSeek 预设发送图片而不是纯文本', () => {
  const body = buildAnswerRequest({provider: providerById('deepseek'), dataUrl});
  assert.equal(body.model, 'deepseek-flash');
  assert.deepEqual(body.messages[0].content.map(part => part.type), ['text', 'image_url']);
});
