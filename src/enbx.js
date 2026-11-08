import {renderPage, renderSolutionPage} from './seewo.js';
import {themes} from './export.js';
import {hasSolution} from './solutions.js';
import {buildENBX} from './enbx-package.js';
import metadata from './enbx-metadata.xml?raw';

const pngBytes = canvas => new Promise((resolve,reject)=>canvas.toBlob(async blob=>{
  if(!blob) {reject(new Error('课件图片生成失败，请减少题目数量后重试。'));return;}
  try {resolve(new Uint8Array(await blob.arrayBuffer()));} catch(error) {reject(error);}
},'image/png'));

export async function exportENBX(questions,pages,options,onProgress) {
  const chosen=questions.filter(q=>q.included);
  if(!chosen.length) throw new Error('请至少勾选一道题目。');
  const mode=options.solutions || 'none';
  const solved=mode==='none' ? [] : chosen.filter(hasSolution);
  const total=chosen.length+solved.length;
  const slides=[];
  let thumbnail;
  let page=0;
  await document.fonts.ready;
  for(let i=0;i<chosen.length;i++) {
    const steps=1+(solved.includes(chosen[i])?1:0);
    onProgress(`正在生成希沃原生课件 · 第 ${i+1} / ${chosen.length} 题`,(i+1)/(chosen.length+1));
    await new Promise(resolve=>setTimeout(resolve,0));
    const canvas=renderPage(chosen[i],pages,options,page++,total,2);
    slides.push({png:await pngBytes(canvas),width:canvas.width,height:canvas.height});
    if(i===0) {
      const preview=document.createElement('canvas');
      preview.width=480;preview.height=Math.round(480*canvas.height/canvas.width);
      preview.getContext('2d').drawImage(canvas,0,0,preview.width,preview.height);
      thumbnail=await pngBytes(preview);
      preview.width=0;
    }
    canvas.width=0;
    if(steps===2) {
      const solution=renderSolutionPage(chosen[i],pages,options,page++,total,2);
      slides.push({png:await pngBytes(solution),width:solution.width,height:solution.height});
      solution.width=0;
    }
  }
  const background=document.createElement('canvas');
  background.width=2;background.height=2;
  const context=background.getContext('2d');
  context.fillStyle=`#${themes[options.theme].background}`;
  context.fillRect(0,0,2,2);
  onProgress('正在打包 ENBX 原生课件…',.98);
  const content=await buildENBX({title:options.title,slides,background:await pngBytes(background),thumbnail,metadata});
  const url=URL.createObjectURL(new Blob([content],{type:'application/octet-stream'}));
  const name=(options.title || '试卷课件').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,90);
  const anchor=document.createElement('a');
  anchor.href=url;anchor.download=`${name}-希沃原生课件.enbx`;
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
