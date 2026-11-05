import {readFile, readdir, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import JSZip from 'jszip';

const root = fileURLToPath(new URL('..', import.meta.url));
const argument = process.argv.slice(2);
if (argument.length && (argument.length !== 2 || argument[0] !== '--output')) throw new Error('用法：node scripts/package-offline.mjs [--output 文件.zip]');
const target = path.resolve(argument[1] || path.join(root, '..', '题页-试卷转PPT-免安装离线版.zip'));
const zip = new JSZip();
const folder = zip.folder('题页-试卷转PPT');
for (const name of ['index.html', '使用前先看.txt']) folder.file(name, await readFile(path.join(root, 'offline', name)));
for (const name of await readdir(path.join(root, 'offline/licenses'))) folder.file(`licenses/${name}`, await readFile(path.join(root, 'offline/licenses', name)));
await mkdir(path.dirname(target), {recursive: true});
await writeFile(target, await zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: {level: 6}}));
console.log(target);
