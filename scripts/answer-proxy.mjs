#!/usr/bin/env node
// 自动解答的本地转发：浏览器不能跨域调用智谱等接口时，由本进程代为转发。
// 不保存 Key，不记录请求内容；只转发到下面允许的模型服务域名。
import http from 'node:http';

const ALLOWED = [
  'open.bigmodel.cn',
  'dashscope.aliyuncs.com',
  'api.deepseek.com',
  'openrouter.ai',
  'api.siliconflow.cn',
  'api.openai.com',
  'api.moonshot.cn',
  'generativelanguage.googleapis.com',
];
const MAX_BODY = 24 * 1024 * 1024;

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : fallback;
}

const port = Number(option('port', process.env.ANSWER_PROXY_PORT || 5199));
const bind = option('bind', process.env.ANSWER_PROXY_BIND || '127.0.0.1');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {reject(new Error('请求过大')); request.destroy(); return;}
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {response.writeHead(204, cors).end(); return;}
  if (request.method !== 'POST' || request.url !== '/api/answer') {
    response.writeHead(404, {...cors, 'Content-Type': 'text/plain; charset=utf-8'}).end('Not found');
    return;
  }
  try {
    const payload = JSON.parse(await readBody(request));
    const upstream = new URL(String(payload.url || ''));
    if (upstream.protocol !== 'https:' || !ALLOWED.includes(upstream.hostname)) {
      throw new Error(`不支持的模型服务：${upstream.hostname || payload.url}`);
    }
    const headers = {'Content-Type': 'application/json'};
    if (payload.apiKey) headers.Authorization = `Bearer ${payload.apiKey}`;
    const result = await fetch(upstream.href, {method: 'POST', headers, body: JSON.stringify(payload.body)});
    const text = await result.text();
    response.writeHead(result.status, {...cors, 'Content-Type': 'application/json; charset=utf-8'}).end(text);
    console.log(`[answer-proxy] ${upstream.hostname} → ${result.status}`);
  } catch (error) {
    response.writeHead(400, {...cors, 'Content-Type': 'application/json; charset=utf-8'})
      .end(JSON.stringify({error: String(error?.message || error)}));
  }
});

server.listen(port, bind, () => {
  console.log(`自动解答转发已启动：http://${bind}:${port}/api/answer`);
  console.log('把网页「自动解答」里的转发地址填成上面的地址；本窗口需保持开启。');
  if (bind !== '127.0.0.1') console.log('注意：已绑定到非本机地址，同一网络的其他设备也能使用这个转发。');
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
