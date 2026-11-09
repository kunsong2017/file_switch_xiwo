import test from 'node:test';
import assert from 'node:assert/strict';
import {answerProviders, providerById, buildAnswerRequest, parseAnswerJSON, messageText, solveQuestion, readAnswerResponse, isUncertainSolution, acceptAutoSolution} from '../src/answer.js';

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
    /401.*Key/,
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
  assert.equal(body.max_tokens,16384,'geometry reasoning must not be restricted to the old 2000-token budget');
  assert.deepEqual(body.thinking,{type:'enabled'});
  assert.deepEqual(body.response_format,{type:'json_object'});
});

test('整题、分片和配图都进入同一个题目请求',()=>{
  const images=[dataUrl,dataUrl+'B',dataUrl+'C'];
  const body=buildAnswerRequest({provider,dataUrls:images});
  assert.deepEqual(body.messages[0].content.slice(1).map(part=>part.image_url.url),images);
});
test('等待响应头和读取正文都受到超时保护',async()=>{
  for(const fetchImpl of [()=>new Promise(()=>{}),async()=>({ok:true,json:()=>new Promise(()=>{})})]) {
    await assert.rejects(solveQuestion({provider,dataUrl,timeout:20,fetchImpl}),error=>error.code==='timeout');
  }
});
test('区分思考耗尽、空响应、格式错误和模型未解出',()=>{
  const truncated={choices:[{finish_reason:'length',message:{content:'',reasoning_content:'private reasoning'}}],usage:{completion_tokens:2000,completion_tokens_details:{reasoning_tokens:2000}}};
  assert.throws(()=>readAnswerResponse(truncated),error=>error.code==='truncated' && error.meta.reasoningTokens===2000 && !error.message.includes('private'));
  assert.throws(()=>readAnswerResponse({choices:[{message:{content:'',reasoning_content:'private'}}]}),e=>e.code==='reasoning_only');
  assert.throws(()=>readAnswerResponse({choices:[{message:{content:'   '}}]}),e=>e.code==='empty');
  assert.throws(()=>readAnswerResponse({choices:[{message:{content:'not json'}}]}),e=>e.code==='format');
  assert.equal(isUncertainSolution({answer:'无法确定',analysis:'看不清图'}),true);
  assert.equal(isUncertainSolution({answer:'D',analysis:'推导'}),false);
});
test('模型纯文本行内返回可解析',()=>{
  assert.deepEqual(parseAnswerJSON('**答案**：D；解析：因为反比例函数。'),{answer:'D',analysis:'因为反比例函数。'});
});
test('补答保留老师已填字段，无法确定不能被当成成功答案',()=>{
  const answerOnly={answer:'D',analysis:''};
  assert.equal(acceptAutoSolution(answerOnly,{answer:'A',analysis:'模型解析'}),true);assert.equal(answerOnly.answer,'D');
  const analysisOnly={answer:'',analysis:'老师解析'};
  acceptAutoSolution(analysisOnly,{answer:'B',analysis:'模型解析'});assert.equal(analysisOnly.analysis,'老师解析');
  const empty={answer:'',analysis:''};assert.equal(acceptAutoSolution(empty,{answer:'无法确定',analysis:'看不清图'}),false);assert.equal(empty.answer,'');
});
