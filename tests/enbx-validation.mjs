import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DOMParser} from '@xmldom/xmldom';

export async function validateENBX(zip,expected,{width,height}={}) {
  const parse = async name => {
    const bytes=await zip.file(name).async('nodebuffer');
    assert.equal(bytes.subarray(0,3).toString('hex'),'efbbbf',`${name}: UTF-8 BOM`);
    assert.equal(bytes.subarray(3,8).toString()==='<?xml',name==='[Content_Types].xml',`${name}: declaration matches the real EasiNote sample`);
    return new DOMParser({onError:(level,message)=>{throw new Error(`${name}: ${message}`);}}).parseFromString(bytes.toString('utf8').replace(/^\ufeff/,''),'text/xml');
  };
  const text = (root,tag)=>root.getElementsByTagName(tag)[0]?.textContent;
  for(const name of ['[Content_Types].xml','Document.xml','Reference.xml','Board.xml','SaveInfoMetadataFile.xml','thumbnail.png']) assert.ok(zip.file(name),name);
  assert.ok(!zip.file('ppt/presentation.xml'),'native package is not a renamed PPTX');
  for(const name of Object.keys(zip.files).filter(n=>n.endsWith('.xml'))) await parse(name);
  const board=await parse('Board.xml');
  const ids=Array.from(board.getElementsByTagName('Slides')[0].getElementsByTagName('Item'),item=>item.textContent);
  const files=zip.file(/^Slides\/Slide_\d+\.xml$/).sort((a,b)=>Number(a.name.match(/_(\d+)/)[1])-Number(b.name.match(/_(\d+)/)[1]));
  assert.equal(files.length,expected);
  assert.equal(ids.length,expected);
  assert.equal(new Set(ids).size,expected,'slide IDs are unique');
  const refs=await parse('Reference.xml');
  const resources=new Map();
  for(const relationship of Array.from(refs.getElementsByTagName('Relationship'))) {
    const id=text(relationship,'Id'),target=text(relationship,'Target').replaceAll('\\','/');
    assert.ok(zip.file(target),`resource ${target} exists`);
    const bytes=await zip.file(target).async('nodebuffer');
    assert.equal(createHash('md5').update(bytes).digest('hex'),id,'resource ID is actual content MD5');
    assert.equal(text(relationship,'Hash'),id);
    assert.ok(!resources.has(id),'resource relationships are unique');
    resources.set(id,{target,bytes});
  }
  const checkReferences = root => {
    for(const source of Array.from(root.getElementsByTagName('Source'))) {
      if(source.textContent.startsWith('id://')) assert.ok(resources.has(source.textContent.slice(5)),'all resource references resolve');
    }
  };
  checkReferences(board);
  for(let i=0;i<files.length;i++) {
    const slide=await parse(files[i].name);
    assert.equal(text(slide,'Id'),ids[i],'Board order matches numeric slide order');
    if(width) assert.equal(Number(text(slide,'Width')),width);
    if(height) assert.equal(Number(text(slide,'Height')),height);
    const pictures=slide.getElementsByTagName('Picture');
    assert.equal(pictures.length,1);
    const picture=pictures[0];
    assert.match(text(picture,'Id'),/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,'picture uses the GUID form from the native sample');
    const bytes=resources.get(text(picture,'Source').slice(5)).bytes;
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a','picture is actual PNG');
    const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);
    assert.equal(text(picture,'PictureSize'),`${h},${w}`);
    assert.equal(text(picture,'Rectangle'),`0,0,${w},${h}`);
    assert.equal(Number(text(picture,'FileSize')),bytes.length);
    assert.equal(Number(text(picture,'Width')),w);
    assert.equal(Number(text(picture,'Height')),h);
    checkReferences(slide);
  }
  return {resources,document:await parse('Document.xml')};
}
