import JSZip from 'jszip';
import SparkMD5 from 'spark-md5';

// Native EasiNote 5 layout checked against OpenEnow.JS's real sample.
// Static serialization contracts are reused under its MIT license.
const escapeXML = text => String(text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const node = (tag,value) => `<${tag}>${escapeXML(value)}</${tag}>`;
// The real sample uses BOM-only XML, except [Content_Types].xml. Matching it
// also avoids BOM+declaration parsing failures in older browser readers.
const xml = (content,declaration=false) => '\ufeff'+(declaration ? '<?xml version="1.0" encoding="utf-8"?>' : '')+content.replace(/^\ufeff/,'').replace(/^<\?xml[^?]*\?>/,'');
const id = () => {
  const bytes=new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
};
const guid = () => id().replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5');
const properties = '<Rotation>0</Rotation><IsLocked>False</IsLocked><CanClone>False</CanClone><Hyperlink></Hyperlink><HasMask>False</HasMask><RotateOrigin>0.5,0.5</RotateOrigin>';
const imageBrush = resource => `<ImageBrush>${node('Source',`id://${resource}`)}<Stretch>Fill</Stretch><TileMode>None</TileMode><Opacity>1</Opacity><ViewboxUnits>RelativeToBoundingBox</ViewboxUnits><ViewportUnits>RelativeToBoundingBox</ViewportUnits><Viewbox>0,0,1,1</Viewbox><Viewport>0,0,1,1</Viewport><RelativeMatrixTransform>1,0,0,1,0,0</RelativeMatrixTransform></ImageBrush>`;

export async function buildENBX({title,slides,background,thumbnail,metadata}) {
  if (!slides.length) throw new Error('请至少勾选一道题目。');
  const zip=new JSZip();
  const resources=new Map();
  const addPNG=bytes=>{
    const content=bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const hash=SparkMD5.ArrayBuffer.hash(content.buffer.slice(content.byteOffset,content.byteOffset+content.byteLength));
    if(!resources.has(hash)) {
      resources.set(hash,`Resources/${hash}.png`);
      zip.file(resources.get(hash),content);
    }
    return hash;
  };
  const backgroundID=addPNG(background);
  const slideIDs=[];
  for(let i=0;i<slides.length;i++) {
    const {png,width,height}=slides[i];
    if(!(width>0 && height>0)) throw new Error('课件页面尺寸无效。');
    const resource=addPNG(png);
    const slideID=id();
    slideIDs.push(slideID);
    const picture=`<Picture>${node('Source',`id://${resource}`)}${node('PictureName',`question-${i+1}.png`)}<Alpha>1</Alpha><DisplayRegion>${node('Rectangle',`0,0,${width},${height}`)}</DisplayRegion><Style><StyleType>None</StyleType><PicturePresetStyle>None</PicturePresetStyle></Style><MetaData>${node('PictureSize',`${height},${width}`)}${node('FileSize',png.byteLength)}</MetaData>${node('Id',guid())}<X>0</X><Y>0</Y>${node('Width',width)}${node('Height',height)}${properties}</Picture>`;
    zip.file(`Slides/Slide_${i}.xml`,xml(`<Slide>${node('Id',slideID)}${node('Width',width)}${node('Height',height)}<Background>${imageBrush(backgroundID)}</Background><Elements>${picture}</Elements><Duration>5000000</Duration><ThemeForSlide><ThemeId>-12</ThemeId></ThemeForSlide></Slide>`));
  }
  const now=new Date();
  const stamp=`${now.getMonth()+1}/${now.getDate()}/${now.getFullYear()} ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  zip.file('Document.xml',xml(`<Document>${node('Name',title || '试卷课件')}<Creator>Tiye</Creator><LastModifiedBy>Tiye</LastModifiedBy>${node('CreatedDateTime',stamp)}${node('ModifiedDateTime',stamp)}<CreatedDocumentVersion>1.0</CreatedDocumentVersion><DocumentVersion>1.0</DocumentVersion><CreatedAppVersion>5.1.17.73189</CreatedAppVersion><AppVersion>5.1.17.73189</AppVersion><DocumentExtraInfo><CoursewareSourceTrace><UpstreamAuthor>Tiye</UpstreamAuthor>${node('UpstreamId',guid())}<UpstreamVersion>1</UpstreamVersion></CoursewareSourceTrace></DocumentExtraInfo></Document>`));
  zip.file('Board.xml',xml(`<Board><Slides>${slideIDs.map(s=>node('Item',s)).join('')}</Slides><ThemeForBoard><ThemeId>-12</ThemeId><ThemeBrush>${imageBrush(backgroundID)}</ThemeBrush></ThemeForBoard></Board>`));
  zip.file('Reference.xml',xml(`<Reference><Relationships>${Array.from(resources,([hash,target])=>`<Relationship>${node('Id',hash)}${node('Target',target.replaceAll('/','\\'))}${node('Hash',hash)}</Relationship>`).join('')}</Relationships></Reference>`));
  zip.file('[Content_Types].xml',xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType=""/><Default Extension="png" ContentType=""/></Types>',true));
  zip.file('SaveInfoMetadataFile.xml',xml(metadata));
  zip.file('thumbnail.png',thumbnail);
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:6}});
}
