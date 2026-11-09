import {composeQuestion} from './export.js';
import SparkMD5 from 'spark-md5';

export function imageTiles(width,height,{maxWidth=1600,maxHeight=1400,overlap=100}={}) {
  if(!(width>0 && height>0 && maxWidth>0 && maxHeight>overlap && overlap>=0)) throw new Error('题目图片尺寸无效');
  const scale=Math.min(1,maxWidth/width),w=Math.round(width*scale),h=Math.ceil(height*scale),tiles=[];
  for(let top=0;top<h;) {
    const end=Math.min(h,top+maxHeight);
    tiles.push({x:0,y:top,w,h:end-top,scale});
    if(end===h) break;top=end-overlap;
  }
  return tiles;
}
function encodeTiles(source,label,kind) {
  return imageTiles(source.width,source.height).map((tile,index)=>{
    const canvas=document.createElement('canvas');canvas.width=tile.w;canvas.height=tile.h;
    canvas.getContext('2d').drawImage(source,0,tile.y/tile.scale,source.width,tile.h/tile.scale,0,0,tile.w,tile.h);
    const url=canvas.toDataURL('image/jpeg',.95);canvas.width=0;
    return {url,label:`${label}${index ? `（续 ${index+1}）` : ''}`,kind,width:tile.w,height:tile.h,hash:SparkMD5.hash(url)};
  });
}
export function prepareQuestionImages(q,pages) {
  const source=composeQuestion(q,pages,1800),images=encodeTiles(source,'完整题目','question');source.width=0;
  // Separate, tightly cropped figures are sent as well, so small labels do not
  // depend on a model reading them in a large full-question image.
  const figures=q.segments.filter(s=>s.kind==='figure');
  const candidates=figures.length ? figures : q.segments.flatMap(s=>(pages[s.page].graphics || []).filter(g=>g.w>.045 && g.h>.045 &&
    g.x>=s.x && g.y>=s.y && g.x+g.w<=s.x+s.w && g.y+g.h<=s.y+s.h &&
    !(s.exclusions || []).some(r=>g.x>=r.x && g.y>=r.y && g.x+g.w<=r.x+r.w && g.y+g.h<=r.y+r.h)).map(g=>({...s,...g})));
  const seen=new Set();
  for(const [index,segment] of candidates.slice(0,6).entries()) {
    const canvas=composeQuestion({...q,segments:[segment]},pages,1200);
    const details=encodeTiles(canvas,`配图 ${index+1} 放大查看`,'figure');canvas.width=0;
    for(const detail of details) if(!seen.has(detail.hash)) {seen.add(detail.hash);images.push(detail);}
  }
  return images;
}
