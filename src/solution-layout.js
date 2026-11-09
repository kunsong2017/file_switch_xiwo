import {hasSolution} from './solutions.js';

const cache=new Map();
let measuring;
function measureText(text,size) {
  if(typeof document==='undefined') return [...text].reduce((sum,c)=>sum+(/[\u0020-\u007e]/.test(c) ? size*.62 : size),0);
  measuring ||= document.createElement('canvas').getContext('2d');
  measuring.font=`${size}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  return measuring.measureText(text).width;
}
export function wrapSolutionText(text,width,size,measure=measureText) {
  const lines=[];
  for(const paragraph of String(text).replace(/\r\n?/g,'\n').split('\n')) {
    let line='';
    for(const char of paragraph) {
      if(line && measure(line+char,size)>width) {lines.push(line);line=char;}else line+=char;
    }
    lines.push(line);
  }
  return lines;
}

// All geometry here is in slide pixels (120 px/in), including text sizes.
// Long solutions continue on another page rather than silently dropping lines.
export function solutionPagePlans(q,options={},measure=measureText) {
  const key=JSON.stringify([q.answer,q.analysis,options.ratio,options.headings]);
  if(measure===measureText && cache.has(key)) return cache.get(key);
  const width=options.ratio==='4:3' ? 1200 : 1600,top=options.headings===false ? 54 : 129.6;
  const contentTop=top+260,bottom=850,innerWidth=width-164;
  const fields=[['analysis','解析',q.analysis,24],['answer','答案',q.answer,26]].filter(([, ,text])=>String(text || '').trim());
  const sizeFor = (text,max) => {
    for(let size=max;size>18;size--) if(wrapSolutionText(text,innerWidth,size,measure).length*size*1.5+58<=(bottom-contentTop)*.7) return size;
    return 18;
  };
  const pages=[];
  let page={width,top,questionHeight:240,blocks:[]},y=contentTop;
  for(const [kind,label,text,max] of fields) {
    const size=sizeFor(text,max),lineHeight=size*1.5;
    const lines=wrapSolutionText(text.trim(),innerWidth,size,measure);
    let offset=0;
    while(offset<lines.length) {
      let capacity=Math.floor((bottom-y-58)/lineHeight);
      if(capacity<1) {pages.push(page);page={width,top,questionHeight:240,blocks:[]};y=contentTop;capacity=Math.floor((bottom-y-58)/lineHeight);}
      const part=lines.slice(offset,offset+capacity),height=58+part.length*lineHeight;
      page.blocks.push({kind,label:label+(offset ? '（续）' : ''),lines:part,size,lineHeight,x:60,y,w:width-120,h:height});
      y+=height+16;offset+=part.length;
    }
  }
  if(page.blocks.length) pages.push(page);
  if(measure===measureText) {if(cache.size>120) cache.clear();cache.set(key,pages);}
  return pages;
}
export function exportPageCount(questions,options) {
  const chosen=questions.filter(q=>q.included);
  const paged=options.solutions==='paged' || (options.solutions==='reveal' && options.format!=='pptx');
  return chosen.length+(paged ? chosen.filter(hasSolution).reduce((sum,q)=>sum+solutionPagePlans(q,options).length,0) : 0);
}
