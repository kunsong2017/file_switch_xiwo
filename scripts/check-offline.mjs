import {createHash} from 'node:crypto';
import {readFile, writeFile, readdir, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const project = fileURLToPath(new URL('..', import.meta.url));
const inputs = ['src', 'index.html', 'public/examples', 'public/favicon.svg', 'package.json', 'package-lock.json', '使用前先看.txt', 'scripts/build-offline.mjs', 'scripts/check-offline.mjs', 'scripts/prepare-assets.mjs', 'scripts/download-languages.py', 'third_party/OpenEnow.JS/LICENSE'];
const outputs = ['offline/index.html', 'offline/使用前先看.txt', 'offline/licenses'];

async function hashes(root, names, normalizeText = false) {
  const entries = [];
  async function visit(name) {
    const file = path.join(root, name);
    if ((await stat(file)).isDirectory()) {
      for (const child of (await readdir(file)).sort()) await visit(`${name}/${child}`);
    } else {
      let data = await readFile(file);
      // Git may check source text out as CRLF on Windows. Delivery files keep
      // their exact bytes through .gitattributes; source line endings may vary.
      if (normalizeText && !/\.(pdf|docx|png|jpg|wasm)$/.test(name)) data = Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'));
      entries.push([name, createHash('sha256').update(data).digest('hex')]);
    }
  }
  for (const name of [...names].sort()) await visit(name);
  return Object.fromEntries(entries);
}

export async function writeOfflineManifest(root = project) {
  const manifest = {version: 1, inputs: await hashes(root, inputs, true), files: await hashes(root, outputs)};
  await writeFile(path.join(root, 'offline/build.json'), JSON.stringify(manifest, null, 2) + '\n');
}

export async function checkOffline(root = project) {
  const manifest = JSON.parse(await readFile(path.join(root, 'offline/build.json'), 'utf8'));
  if (manifest.version !== 1) throw new Error('离线产物清单版本不支持。');
  for (const [label, saved, actual] of [
    ['源码', manifest.inputs, await hashes(root, inputs, true)],
    ['产物', manifest.files, await hashes(root, outputs)],
  ]) {
    const changed = [...new Set([...Object.keys(saved), ...Object.keys(actual)])].filter(name => saved[name] !== actual[name]);
    if (changed.length) throw new Error(`离线${label}未同步：${changed.join(', ')}。请运行 npm run build:offline，并提交 offline/。`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkOffline();
  console.log('PASS offline/ 与当前工程输入一致，HTML、说明和授权文件 SHA256 校验通过');
}
