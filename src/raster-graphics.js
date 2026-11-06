import {mergeGraphics,bodyTextRegions} from './layout.js';

// Recover connected drawings from a scanned page after OCR has located body
// text. Work on a reduced grid; keep the original pixels for final rendering.
export function rasterGraphics(canvas, lines) {
  const step=3, width=Math.ceil(canvas.width/step), height=Math.ceil(canvas.height/step);
  const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  const ink=new Uint8Array(width*height), expanded=new Uint8Array(width*height);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const at=(Math.min(canvas.height-1,y*step+1)*canvas.width+Math.min(canvas.width-1,x*step+1))*4;
    if(Math.min(pixels[at],pixels[at+1],pixels[at+2])<165) ink[y*width+x]=1;
  }
  for(const line of bodyTextRegions({lines,graphics:[]})) {
    for(let y=Math.max(0,Math.floor(line.y*height)-1);y<Math.min(height,Math.ceil((line.y+line.h)*height)+1);y++) {
      ink.fill(0,y*width+Math.max(0,Math.floor(line.x*width)-1),y*width+Math.min(width,Math.ceil((line.x+line.w)*width)+1));
    }
  }
  for(let y=1;y<height-1;y++) for(let x=1;x<width-1;x++) if(ink[y*width+x]) {
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) expanded[(y+dy)*width+x+dx]=1;
  }
  const queue=new Int32Array(width*height), regions=[];
  for(let i=0;i<expanded.length;i++) {
    if(!expanded[i]) continue;
    let head=0, tail=1, minX=width,minY=height,maxX=0,maxY=0;
    queue[0]=i;expanded[i]=0;
    while(head<tail) {
      const at=queue[head++], x=at%width,y=Math.floor(at/width);
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
        const nx=x+dx,ny=y+dy,next=ny*width+nx;
        if(nx>=0 && nx<width && ny>=0 && ny<height && expanded[next]) {expanded[next]=0;queue[tail++]=next;}
      }
    }
    if(tail>=15 && maxX-minX>width*.012 && maxY-minY>height*.009) regions.push({x:minX/width,y:minY/height,w:(maxX-minX+1)/width,h:(maxY-minY+1)/height});
  }
  return mergeGraphics(regions).filter(rect=>rect.w>.045 && rect.h>.035).map(rect=>({...rect,raster:true}));
}
