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
  '5. 多张图片按顺序属于同一道题，可能包含重叠分片或配图放大图，请合并阅读并回答所有小问。',
  '6. 仔细核对图形上的字母、数值与阴影；优先给出可验证的推导，不要根据图形比例猜测。',
].join('\n');

export function providerById(id) {
  return answerProviders.find(provider => provider.id === id) ?? answerProviders[0];
}

export const isDeepSeek = provider => {
  try {return new URL(provider.base).hostname==='api.deepseek.com';}catch{return false;}
};
export const answerTokenBudget = provider => isDeepSeek(provider) ? 16384 : 4096;
export function buildAnswerRequest({provider, dataUrl, dataUrls, maxTokens=answerTokenBudget(provider), prompt = ANSWER_PROMPT}) {
  if (!provider?.base) throw new Error('请填写模型接口地址');
  if (!provider?.model) throw new Error('请填写模型名称');
  const images=dataUrls || (dataUrl ? [dataUrl] : []);
  if (!images.length || images.some(image=>!image)) throw new Error('题目图片为空');
  return {
    model: provider.model,
    messages: [{
      role: 'user',
      content: [
        {type: 'text', text: prompt},
        ...images.map(url=>({type:'image_url',image_url:{url,detail:'high'}})),
      ],
    }],
    ...(isDeepSeek(provider) ? {thinking:{type:'enabled'},reasoning_effort:'high',response_format:{type:'json_object'}} : {temperature:.2}),
    max_tokens: maxTokens,
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
  source=source.replace(/\*\*/g,'').replace(/【\s*(答案|解析)\s*】/g,'$1：').replace(/[;；]\s*(?=解析\s*[:：])/g,'\n');
  const answer = source.match(/答案\s*[:：]\s*([\s\S]*?)(?:\n\s*解析\s*[:：]|$)/)?.[1]?.trim() || '';
  const analysis = source.match(/解析\s*[:：]\s*([\s\S]*)$/)?.[1]?.trim() || '';
  if (!answer && !analysis) throw new Error('模型返回的内容无法解析，请重试或换一个模型');
  return {answer, analysis};
}

export class AnswerError extends Error {
  constructor(code,message,{retryable=false,meta={}}={}) {super(message);this.name='AnswerError';this.code=code;this.retryable=retryable;this.meta=meta;}
}
export function responseSummary(data) {
  return {finishReason:data?.choices?.[0]?.finish_reason || '',model:data?.model || '',
    completionTokens:data?.usage?.completion_tokens,reasoningTokens:data?.usage?.completion_tokens_details?.reasoning_tokens};
}
export function readAnswerResponse(data) {
  const meta=responseSummary(data),message=data?.choices?.[0]?.message;
  if(meta.finishReason==='length') throw new AnswerError('truncated','模型达到输出上限，答案尚未完整返回',{retryable:true,meta});
  if(['content_filter','tool_calls'].includes(meta.finishReason)) throw new AnswerError('refused','模型未返回可用答案，请核对题图或模型设置',{meta});
  if(['insufficient_system_resource','aborted'].includes(meta.finishReason)) throw new AnswerError('service','模型服务中断了生成',{retryable:true,meta});
  let text;
  try {text=messageText(data);}catch{text='';}
  if(!text.trim()) throw new AnswerError(message?.reasoning_content ? 'reasoning_only' : 'empty',message?.reasoning_content ? '模型只返回了思考过程，没有最终答案' : '模型返回了空答案',{retryable:true,meta});
  try {return parseAnswerJSON(text);}catch {throw new AnswerError('format','模型返回格式无法识别，请重试',{retryable:true,meta});}
}
export const isUncertainSolution = q => !String(q?.answer || '').trim() || /^(?:无法|不能|未能)(?:确定|判断|解答|作答)|信息不足|题目不完整|看不清/.test(String(q.answer).trim());
export function acceptAutoSolution(q,result,overwrite=false) {
  const combined={answer:result.answer || q.answer,analysis:result.analysis || q.analysis};
  if(isUncertainSolution(combined) || !String(combined.analysis || '').trim()) return false;
  const replace=overwrite || (Boolean((q.answer || '').trim()) && isUncertainSolution(q));
  if(replace || !(q.answer || '').trim()) q.answer=result.answer || q.answer;
  if(replace || !(q.analysis || '').trim()) q.analysis=result.analysis || q.analysis;
  return true;
}

export async function solveQuestion({
  provider,
  dataUrl,
  dataUrls,
  apiKey,
  proxyUrl = 'http://127.0.0.1:5199/api/answer',
  prompt = ANSWER_PROMPT,
  fetchImpl = globalThis.fetch,
  timeout = isDeepSeek(provider) ? 180000 : 90000,
  maxTokens=answerTokenBudget(provider),
  onResponse,
}) {
  const body = buildAnswerRequest({provider, dataUrl, dataUrls, maxTokens, prompt});
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
  let timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{
    controller.abort();reject(new AnswerError('timeout','模型请求超时（含读取答案），请重试',{retryable:true}));
  },timeout);});
  try {
    return await Promise.race([deadline,(async()=>{
      const response=await fetchImpl(url,{method:'POST',headers,body:JSON.stringify(payload),signal:controller.signal});
      if(!response.ok) {
        const status=response.status;
        // Do not echo an arbitrary service body: it can contain credentials.
        const hint={400:'请检查模型名称、图片支持和请求参数',401:'请检查本渠道的 API Key',402:'请检查账户余额或额度',403:'请检查账户权限或地区限制',413:'题图请求体过大',429:'请求受限，稍后重试'}[status];
        throw new AnswerError('http',`模型服务返回 ${status}${hint ? `：${hint}` : ''}`,{retryable:status===429 || status>=500,meta:{httpStatus:status}});
      }
      let data;
      try {data=await response.json();}catch(error) {if(error?.name==='AbortError') throw error;throw new AnswerError('protocol','模型响应不是有效的 JSON',{retryable:true});}
      const meta={...responseSummary(data),maxTokens};onResponse?.(meta);
      return readAnswerResponse(data);
    })()]);
  } catch (error) {
    if(error instanceof AnswerError) throw error;
    if (error?.name === 'AbortError') throw new AnswerError('timeout','模型请求超时，请重试',{retryable:true});
    throw new AnswerError('network',provider.via === 'proxy'
      ? '无法连接本地转发，请先运行 npm run answer:proxy'
      : '无法连接模型服务（可能是浏览器跨域被拦截），请改用本地转发',{retryable:true});
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
