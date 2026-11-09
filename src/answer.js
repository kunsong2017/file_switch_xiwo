// 自动解答：把每道题的截图发给用户选择的视觉大模型，回填答案与解析。
// 纯请求构造与响应解析，不依赖 DOM，便于 Node 测试。

export const answerProviders = [
  {
    id: 'deepseek',
    name: 'DeepSeek（deepseek-flash）',
    base: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-flash',
    via: 'direct',
    note: '官方接口支持图片（image_url / base64），浏览器可直连；按 Flash 价格计费，不是免费模型。',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM-4V-Flash',
    base: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: 'glm-4v-flash',
    via: 'proxy',
    note: '免费模型；接口不允许浏览器跨域，需要先启动本地转发（npm run answer:proxy）。',
  },
  {
    id: 'qwen',
    name: '通义千问 VL',
    base: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-vl-plus',
    via: 'direct',
    note: '浏览器可直连；新用户有免费额度，超出后按量计费。',
  },
  {
    id: 'custom',
    name: '自定义 OpenAI 兼容',
    base: '',
    model: '',
    via: 'direct',
    note: '填写任意兼容 /chat/completions 的地址；若服务拦截跨域，把 via 改为经转发。',
  },
];

export const ANSWER_PROMPT = [
  '你是一位初中数学老师。图片是一道试卷题目的截图，可能包含数学公式、图形和标注。',
  '请完成这道题，只输出一个 JSON 对象，不要输出任何其他文字：',
  '{"answer":"最终答案","analysis":"解析"}',
  '要求：',
  '1. answer 只写最终结果：选择题写选项字母；填空题写结果；解答题写最终结论（多问用 (1)(2) 分开）。',
  '2. analysis 写关键步骤与理由，条理清楚，可以分段。',
  '3. 使用纯文本，不要使用 LaTeX 的 $、\\frac 等写法；可以用 x²、√3、π、∠、△ 等符号。',
  '4. 图片不完整或无法判断时，answer 写“无法确定”，并在 analysis 中说明原因。',
].join('\n');

export function providerById(id) {
  return answerProviders.find(provider => provider.id === id) ?? answerProviders[0];
}

export function buildAnswerRequest({provider, dataUrl, apiKey, prompt = ANSWER_PROMPT}) {
  if (!provider?.base) throw new Error('请填写模型接口地址');
  if (!provider?.model) throw new Error('请填写模型名称');
  if (!dataUrl) throw new Error('题目图片为空');
  return {
    model: provider.model,
    messages: [{
      role: 'user',
      content: [
        {type: 'text', text: prompt},
        {type: 'image_url', image_url: {url: dataUrl}},
      ],
    }],
    temperature: 0.2,
    max_tokens: 2000,
  };
}

// 兼容字符串、数组两种 content；去掉代码围栏后再找 JSON。
export function messageText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(part => typeof part === 'string' ? part : part?.text || '').join('');
  throw new Error('模型没有返回内容');
}

export function parseAnswerJSON(text) {
  let source = String(text ?? '').trim()
    .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'');
  const start = source.indexOf('{'), end = source.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const data = JSON.parse(source.slice(start, end + 1));
      const answer = String(data.answer ?? '').trim();
      const analysis = String(data.analysis ?? data.explanation ?? '').trim();
      if (answer || analysis) return {answer, analysis};
    } catch { /* 回退到文本解析 */ }
  }
  const answer = source.match(/答案\s*[:：]\s*([\s\S]*?)(?:\n\s*解析\s*[:：]|$)/)?.[1]?.trim() || '';
  const analysis = source.match(/解析\s*[:：]\s*([\s\S]*)$/)?.[1]?.trim() || '';
  if (!answer && !analysis) throw new Error('模型返回的内容无法解析，请重试或换一个模型');
  return {answer, analysis};
}

export async function solveQuestion({
  provider,
  dataUrl,
  apiKey,
  proxyUrl = 'http://127.0.0.1:5199/api/answer',
  prompt = ANSWER_PROMPT,
  fetchImpl = globalThis.fetch,
  timeout = 90000,
}) {
  const body = buildAnswerRequest({provider, dataUrl, apiKey, prompt});
  const headers = {'Content-Type': 'application/json'};
  let url = provider.base;
  let payload = body;
  if (provider.via === 'proxy') {
    if (!proxyUrl) throw new Error('请填写本地转发地址');
    url = proxyUrl;
    payload = {url: provider.base, apiKey, body};
  } else if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let response;
  try {
    response = await fetchImpl(url, {method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal});
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('模型请求超时，请重试或换一个模型');
    throw new Error(provider.via === 'proxy'
      ? '无法连接本地转发，请先运行 npm run answer:proxy'
      : '无法连接模型服务（可能是浏览器跨域被拦截），请改用本地转发');
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.text()).slice(0, 300); } catch { /* ignore */ }
    throw new Error(`模型服务返回 ${response.status}${detail ? `：${detail}` : ''}`);
  }
  const data = await response.json();
  return parseAnswerJSON(messageText(data));
}
