import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import JSZip from 'jszip';
import {buildENBX} from '../src/enbx-package.js';
import {validateENBX} from './enbx-validation.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6mcAAAAAASUVORK5CYII=','base64');
const metadata=await readFile(new URL('../src/enbx-metadata.xml',import.meta.url),'utf8');
test('native ENBX has ordered slides, complete references, actual hashes and escaped Unicode title',async()=>{
  const title='数学 <复习> & "课堂" 😀';
  const slides=Array.from({length:12},()=>({png,width:1,height:1}));
  const bytes=await buildENBX({title,slides,background:png,thumbnail:png,metadata});
  const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});
  const result=await validateENBX(zip,12,{width:1,height:1});
  assert.equal(result.resources.size,1,'identical PNG content is reused');
  assert.equal(result.document.getElementsByTagName('Name')[0].textContent,title);
});
test('native ENBX rejects empty output and invalid page dimensions',async()=>{
  await assert.rejects(buildENBX({slides:[],metadata}),/至少/);
  await assert.rejects(buildENBX({slides:[{png,width:0,height:1}],background:png,thumbnail:png,metadata}),/尺寸/);
});
