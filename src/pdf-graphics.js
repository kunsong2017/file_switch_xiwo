import {mergeGraphics, pad, union} from './layout.js';
const multiply = (a,b) => [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];

export function pdfGraphics(list, viewport, width, height, ops) {
  let matrix = [1,0,0,1,0,0], pending = null;
  const stack = [], regions = [], images=[];
  const box = bounds => {
    const m = multiply(viewport,matrix);
    const points = [[bounds[0],bounds[1]],[bounds[0],bounds[3]],[bounds[2],bounds[1]],[bounds[2],bounds[3]]].map(([x,y]) => [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]);
    const xs=points.map(p=>p[0]/width), ys=points.map(p=>p[1]/height);
    return pad({x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)},2/width,2/height);
  };
  const paint = new Set([ops.stroke,ops.closeStroke,ops.fill,ops.eoFill,ops.fillStroke,ops.eoFillStroke,ops.closeFillStroke,ops.closeEOFillStroke]);
  for (let i=0;i<list.fnArray.length;i++) {
    const op=list.fnArray[i], args=list.argsArray[i];
    if (op === ops.save) stack.push(matrix.slice());
    else if (op === ops.restore) matrix=stack.pop() || [1,0,0,1,0,0];
    else if (op === ops.transform) matrix=multiply(matrix,args);
    else if (op === ops.paintFormXObjectBegin) {stack.push(matrix.slice()); if (args[0]) matrix=multiply(matrix,args[0]);}
    else if (op === ops.paintFormXObjectEnd) matrix=stack.pop() || [1,0,0,1,0,0];
    else if ([ops.paintImageXObject,ops.paintInlineImageXObject,ops.paintImageMaskXObject,ops.paintSolidColorImageMask].includes(op)) images.push(box([0,0,1,1]));
    else if (op === ops.constructPath && args[2]?.every(Number.isFinite)) {const rect=box(args[2]); pending=pending ? union(pending,rect) : rect;}
    else if (paint.has(op)) {if (pending) regions.push(pending); pending=null;}
    else if (op === ops.endPath) pending=null;
  }
  // Distinct embedded images may have touching white margins. Merging them
  // destroys their individual diagram boundaries (and their letter labels).
  return [...images.flatMap(image=>mergeGraphics([image])),...mergeGraphics(regions)];
}
