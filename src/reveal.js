import JSZip from 'jszip';

// PptxGenJS 3.12 不写动画。这里在生成后向 slide XML 注入“单击时出现”
// 的标准 PowerPoint 时间轴：每个效果是一个 clickEffect（presetClass=entr,
// presetID=1 “出现”，用 style.visibility 从隐藏切到 visible）。
// 结构按 ECMA-376 19.5.2 主时间轴：tmRoot > mainSeq > clickPar > clickEffect。
export function timingXML(shapeIds) {
  let next = 2;
  const groups = shapeIds.map(spid => {
    const outer = next++;
    const inner = next++;
    const effect = next++;
    const set = next++;
    return `<p:par><p:cTn id="${outer}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst>`
      + `<p:par><p:cTn id="${inner}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>`
      + `<p:par><p:cTn id="${effect}" presetID="1" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="clickEffect"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>`
      + `<p:set><p:cBhvr><p:cTn id="${set}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>`
      + `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr>`
      + `<p:to><p:strVal val="visible"/></p:to></p:set>`
      + `</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`;
  }).join('');
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>`
    + `<p:seq concurrent="1" nextAc="seek"><p:cTn id="${next++}" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${groups}</p:childTnLst></p:cTn>`
    + `<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>`
    + `<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>`
    + `</p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
}

// 在 slide XML 中按形状名找到 PowerPoint 内部 id。
export function shapeIdsByName(xml, names) {
  const byName = new Map();
  for (const match of xml.matchAll(/<p:cNvPr\b[^>]*>/g)) {
    const id = match[0].match(/\bid="(\d+)"/)?.[1];
    const name = match[0].match(/\bname="([^"]*)"/)?.[1];
    if (id && name !== undefined) byName.set(name.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'), Number(id));
  }
  return names.map(name => byName.get(name)).filter(Boolean);
}

export function addTimingToSlide(xml, shapeIds) {
  if (!shapeIds.length || /<p:timing[\s>]/.test(xml)) return xml;
  if (!xml.includes('<p:clrMapOvr>')) throw new Error('幻灯片结构异常，无法写入点击动画');
  return xml.replace('</p:sld>', `${timingXML(shapeIds)}</p:sld>`);
}

// effects: {1: ['sol-analysis-1','sol-answer-1'], ...} 键为从 1 开始的页号。
export async function injectRevealTiming(buffer, effects) {
  const zip = await JSZip.loadAsync(buffer);
  for (const [page, names] of Object.entries(effects)) {
    const path = `ppt/slides/slide${page}.xml`;
    const file = zip.file(path);
    if (!file || !names.length) continue;
    const xml = await file.async('string');
    const ids = shapeIdsByName(xml, names);
    if (ids.length !== names.length) throw new Error(`第 ${page} 页未找到解析 / 答案形状：${names.join('、')}`);
    zip.file(path, addTimingToSlide(xml, ids));
  }
  return zip.generateAsync({type: 'arraybuffer', compression: 'DEFLATE', compressionOptions: {level: 6}});
}

export const revealShapeName = (kind, index) => `sol-${kind}-${index}`;
