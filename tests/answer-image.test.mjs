import {test} from 'node:test';
import assert from 'node:assert/strict';
import {imageTiles} from '../src/answer-image.js';
test('长题分片覆盖整张源图，保留重叠，不缩成一张过长小字图',()=>{
  const tiles=imageTiles(1800,6000);
  assert.ok(tiles.length>1);assert.equal(tiles[0].y,0);
  assert.ok(tiles.every(t=>t.w<=1600 && t.h<=1400));
  for(let i=1;i<tiles.length;i++) assert.ok(tiles[i].y<tiles[i-1].y+tiles[i-1].h);
  const last=tiles.at(-1);assert.ok((last.y+last.h)/last.scale>=6000);
  assert.throws(()=>imageTiles(0,100),/尺寸/);
});
