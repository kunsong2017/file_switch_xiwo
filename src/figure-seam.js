// Find a white corridor instead of a straight vertical cut. Diagram labels can
// overlap in their horizontal projection while being separate on the paper.
export function whiteSeam(data,width,height,target=width/2) {
  // Keep nearby letter labels attached to their strokes: a path through the
  // tiny gap between a vertex and its label would cut off useful information.
  const inkRows=new Uint8Array(width*height);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const at=(y*width+x)*4;
    if(Math.min(data[at],data[at+1],data[at+2])<220) {
      for(let dy=-6;dy<=6;dy++) {
        const row=y+dy;
        if(row>=0 && row<height) inkRows.fill(1,row*width+Math.max(0,x-6),row*width+Math.min(width,x+7));
      }
    }
  }
  let previous=new Float64Array(width);
  const back=new Int8Array(width*height);
  for(let y=0;y<height;y++) {
    const next=new Float64Array(width);
    for(let x=0;x<width;x++) {
      let best=y ? Infinity : 0,delta=0;
      if(y) for(let dx=-2;dx<=2;dx++) {
        const px=x+dx;
        if(px>=0 && px<width && previous[px]+Math.abs(dx)*.15<best) {best=previous[px]+Math.abs(dx)*.15;delta=dx;}
      }
      const ink=inkRows[y*width+x];
      next[x]=best+ink*1000+Math.abs(x-target)*.001;
      back[y*width+x]=delta;
    }
    previous=next;
  }
  let x=0;for(let i=1;i<width;i++) if(previous[i]<previous[x]) x=i;
  const path=new Int32Array(height);
  for(let y=height-1;y>=0;y--) {path[y]=x;x+=back[y*width+x];}
  return path;
}

export function splitGraphic(page,original,captions) {
  if(captions.length<2) return [original];
  const bottom=Math.max(original.y+original.h,...captions.map(c=>c.y+c.h+.002));
  const region={...original,h:bottom-original.y};
  const height=page.canvas ? Math.max(2,Math.ceil(region.h*page.height)) : 2;
  const cuts=[Array.from({length:height},()=>region.x)];
  for(let i=1;i<captions.length;i++) {
    const middle=(captions[i-1].x+captions[i-1].w/2+captions[i].x+captions[i].w/2)/2;
    let path=Array.from({length:height},()=>middle);
    if(page.canvas) {
      const left=Math.max(region.x,captions[i-1].x+captions[i-1].w+.003),right=Math.min(region.x+region.w,captions[i].x-.003);
      const sx=Math.floor(left*page.width),sy=Math.floor(region.y*page.height),width=Math.floor((right-left)*page.width);
      if(width>2) {
        const pixels=page.canvas.getContext('2d').getImageData(sx,sy,width,height).data;
        path=Array.from(whiteSeam(pixels,width,height,middle*page.width-sx),x=>(sx+x)/page.width);
      }
    }
    cuts.push(path);
  }
  cuts.push(Array.from({length:height},()=>region.x+region.w));
  return captions.map((caption,index)=>{
    const left=cuts[index].map((x,y)=>({x,y:region.y+region.h*y/(height-1)}));
    const right=cuts[index+1].map((x,y)=>({x,y:region.y+region.h*y/(height-1)}));
    const x=Math.min(...cuts[index]),end=Math.max(...cuts[index+1]);
    return {x,y:region.y,w:end-x,h:region.h,clip:[...left,...right.reverse()],mask:region,caption};
  });
}
