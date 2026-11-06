import {test} from 'node:test';
import assert from 'node:assert/strict';
import {whiteSeam} from '../src/figure-seam.js';

test('separates overlapping horizontal projections through a curved white corridor',()=>{
  const width=80,height=80,pixels=new Uint8ClampedArray(width*height*4).fill(255);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const middle=30+y/4;
    if(x<middle-10 || x>middle+10) {
      const at=(y*width+x)*4;pixels[at]=pixels[at+1]=pixels[at+2]=0;
    }
  }
  const path=whiteSeam(pixels,width,height,40);
  assert.ok(path[10]<38 && path[70]>42,'cut follows the gap instead of a straight midpoint');
  for(let y=0;y<height;y++) assert.equal(pixels[(y*width+path[y])*4],255,'no diagram ink is cut');
});
