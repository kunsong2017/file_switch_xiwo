import {splitGraphic} from './figure-seam.js';
const digits = '0-9０-９一二三四五六七八九十百零〇';
const chinesePage = new RegExp(`第\\s*[${digits}]+\\s*页|共\\s*[${digits}]+\\s*页`);
const counter = /^(?:page\s*)?\d+\s*(?:[/／]|of)\s*\d+$|^[-—–]\s*\d+\s*[-—–]$|^page\s*\d+$/i;
export const figureCaption = text => text.trim().match(/^[（(]?\s*第\s*(\d{1,3})\s*题\s*(?:(?:示意)?图)?(?:续)?\s*[）)]?$/) || text.trim().match(/^[（(]\s*(\d{1,3})\s*[）)]$/);
export const isFigureCaption = text => /^[（(]?\s*第\s*\d{1,3}\s*题\s*(?:示意)?图(?:续)?\s*[）)]?$/.test(text.trim());
export const intersects = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const contains = (a, b) => b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
export const union = (a, b) => ({x: Math.min(a.x,b.x), y: Math.min(a.y,b.y), w: Math.max(a.x+a.w,b.x+b.w)-Math.min(a.x,b.x), h: Math.max(a.y+a.h,b.y+b.h)-Math.min(a.y,b.y)});
export function pad(rect, dx = .003, dy = .003) {
  const x = Math.max(0,rect.x-dx), y = Math.max(0,rect.y-dy);
  return {x,y,w:Math.min(1,rect.x+rect.w+dx)-x,h:Math.min(1,rect.y+rect.h+dy)-y};
}

export function pageLayout(page) {
  const labels = page.lines.filter(line => {
    const text = line.text.trim();
    const edge = line.y < .12 || line.y + line.h > .84;
    return (chinesePage.test(text) && text.length < 50 && !/^\d+\s*[.、]/.test(text)) || (edge && counter.test(text));
  });
  const captions = page.lines.filter(line => figureCaption(line.text) && (page.graphics || []).some(g => g.w>.045 && g.h>.035 && line.y>=g.y+g.h-.025 && line.y<g.y+g.h+.065 && line.x<g.x+g.w+.03 && line.x+line.w>g.x-.03));
  const headings = page.lines.filter(line => /^[一二三四五六七八九十]+[、.．]\s*(?:单选题|多选题|选择题|填空题|解答题|计算题|证明题)/.test(line.text.trim()) || (line.y<.13 && /班级|姓名|学号|(?:考试|复习|试卷).*\d*$/.test(line.text) && !/^\d+\s*[.、．]/.test(line.text)));
  const lines = page.lines.filter(line => !labels.includes(line) && !captions.includes(line) && !headings.includes(line));
  const range = [...(page.contentRange || [.025,.965])];
  for (const footer of labels.filter(line => line.y > .82)) {
    // Never trim a genuine body line or diagram merely sharing the footer row.
    if (!lines.some(line => line.y + line.h >= footer.y) && !(page.graphics || []).some(g => g.y + g.h >= footer.y)) range[1] = Math.min(range[1], footer.y - .004);
  }
  return {lines, captions, range, exclusions: [...labels,...headings].map(line => pad(line, .005, .004))};
}

export function mergeGraphics(regions) {
  const merged = [];
  for (const rect of regions) {
    if (rect.w <= 0 || rect.h <= 0 || rect.w * rect.h > .65 || (rect.w>.7 && rect.h>.6) || Math.max(rect.w,rect.h) < .025) continue;
    let box = rect;
    for (let i=merged.length-1;i>=0;i--) {
      if (intersects(pad(box,.006,.008),merged[i])) {
        box = union(box,merged.splice(i,1)[0]);
        i = merged.length;
      }
    }
    merged.push(box);
  }
  return merged;
}

// OCR line boxes can span a diagram label and a body line at once. Use the
// dominant text baseline plus actual word boxes, and honour choice prefixes,
// rather than erasing/restoring a tall box across a whole row of drawings.
export function bodyTextRegions(page) {
  const lines=pageLayout(page).lines;
  const prefix=text=>/^[“"'\s]*[A-D]\s*[.、，,．]|^\d{1,3}\s*[.、，,．:：]|^[（(]\d+[）)].+/.test(text);
  const meaningful=line=>(line.text.match(/[\u3400-\u9fff]/g)||[]).length>=2 || prefix(line.text);
  const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
  const regions=[];
  for(const line of lines.filter(meaningful)) {
    const row=lines.filter(other=>meaningful(other) && Math.abs(other.y-line.y)<.008);
    const left=Math.min(...row.map(l=>l.x)),right=Math.max(...row.map(l=>l.x+l.w));
    const continuation=line.x<.18 && (line.text.match(/[\u3400-\u9fff]/g)||[]).length>=3;
    if(right-left<.3 && !prefix(line.text) && !continuation) continue;
    const choice=lines.filter(l=>/^[“"'\s]*[A-D]\s*[.、，,．]/.test(l.text) && Math.abs(l.y-line.y)<.008).sort((a,b)=>a.x-b.x)[0];
    const x=choice ? choice.x : left;
    const runs=row.flatMap(l=>l.runs || [l]).filter(run=>run.x>=x-.003);
    if(!runs.length) continue;
    const top=median(runs.map(r=>r.y)),bottom=median(runs.map(r=>r.y+r.h));
    regions.push({x,y:Math.max(0,top-.001),w:right-x+(continuation && right-left<.3 ? .015 : 0),h:bottom-top+.002},...runs);
  }
  return regions.map(rect=>pad(rect,.002,.001));
}

// Reassign a crossing/floating graphic as a complete fragment. Main text crops
// mask that graphic so it cannot be cut up or copied into another question.
export function bindQuestionGraphics(questions, pages) {
  const bodies=pages.map(bodyTextRegions);
  const reference = new Map(questions.map(q => [q,q.segments.flatMap(s => pageLayout(pages[s.page]).lines.filter(line => intersects(s,line)).map(line => line.text)).join(' ')]));
  const needsFigure = q => {
    const text=reference.get(q).replace(/\s/g,'').replace(/图[像象]/g,'');
    return /如图|下图|看图|图中|图示|图形|箱线|统计图|图|diagram|figure/i.test(text) || ((text.match(/[\u3400-\u9fff]/g)||[]).length<8 && (text.match(/[a-z]/gi)||[]).length>30);
  };
  const splitAtCaptions = (page,original) => {
    const captions=pageLayout(page).captions.filter(line=>line.y>=original.y+original.h-.03 && line.y<original.y+original.h+.065 && line.x+line.w/2>original.x && line.x+line.w/2<original.x+original.w).sort((a,b)=>a.x-b.x);
    return splitGraphic(page,original,captions);
  };
  const records = pages.flatMap((page,pageIndex) => (page.graphics || []).filter(g=>g.w>.045 && g.h>.045).map(g=>g.raster ? {...pad(g,.006,.009),raster:true} : g).flatMap(original=>splitAtCaptions(page,original)).map(original => {
    let graphic=pad(original,.001,.0005), owner;
    const captions=original.caption ? [original.caption] : pageLayout(page).captions.filter(line => line.y>=graphic.y+graphic.h-.03 && line.y<graphic.y+graphic.h+.065 && Math.abs(line.x+line.w/2-graphic.x-graphic.w/2)<Math.max(graphic.w*.65,.035)).sort((a,b)=>Math.abs(a.y-graphic.y-graphic.h)-Math.abs(b.y-graphic.y-graphic.h));
    if(captions.length) {
      const caption=captions[0], number=Number(figureCaption(caption.text)[1]);
      const local=questions.filter(q=>q.segments[0].page===pageIndex).map(q=>q.number);
      const isMainCaption=/第/.test(caption.text) || (number>=Math.min(...local)-2 && number<=Math.max(...local)+2);
      owner=isMainCaption ? questions.filter(q=>q.number===number).sort((a,b)=>Math.abs(a.segments[0].page-pageIndex)-Math.abs(b.segments[0].page-pageIndex))[0] : null;
      if(owner) graphic=union(graphic,pad(caption));
    }
    return {graphic,pageIndex,owner,clip:original.clip,mask:original.mask};
  }));
  const assigned = new Set(records.filter(r=>r.owner).map(r=>r.owner));
  // Unlabelled figures laid out in one row follow the order of nearby questions
  // referring to a figure. Explicit captions take precedence across all pages.
  for(let pi=0;pi<pages.length;pi++) {
    const remaining=records.filter(r=>r.pageIndex===pi && !r.owner).sort((a,b)=>a.graphic.y-b.graphic.y || a.graphic.x-b.graphic.x);
    const rows=[];
    for(const record of remaining) {
      const g=record.graphic;
      const row=rows.find(row=>row.every(r=>!intersects(r.graphic,g)) && Math.abs(row[0].graphic.y+row[0].graphic.h/2-g.y-g.h/2)<Math.max(row[0].graphic.h,g.h)*.6);
      if(row) row.push(record); else rows.push([record]);
    }
    for(const row of rows) {
      row.sort((a,b)=>a.graphic.x-b.graphic.x);
      const top=Math.min(...row.map(r=>r.graphic.y)),bottom=Math.max(...row.map(r=>r.graphic.y+r.graphic.h));
      const preceding=questions.filter(q=>q.segments[0].page===pi && q.segments[0].y<top+.01).at(-1);
      const partLabels=pageLayout(pages[pi]).captions.some(line=>line.y>top && line.y<bottom+.065 && !/第/.test(line.text) && Number(figureCaption(line.text)[1])<=3 && (preceding?.number || 0)>3);
      const multiple=preceding && (/图\s*[1-9１２３４５]/.test(reference.get(preceding)) || partLabels);
      if(row.length===1 || multiple) {
        if(preceding && needsFigure(preceding) && (multiple || preceding.segments.some(s=>s.page===pi && contains(s,row[0].graphic)))) {
          row.forEach(record=>{record.owner=preceding;});assigned.add(preceding);
        }
        continue;
      }
      const eligible=questions.filter(q=>!assigned.has(q) && needsFigure(q) && q.segments[0].page===pi);
      if(eligible.length>=row.length) row.forEach((record,index)=>{record.owner=eligible[index];assigned.add(record.owner);});
    }
  }
  for (const record of records) {
      const {graphic,pageIndex}=record;
      const candidates = questions.flatMap(q => q.segments.filter(s => s.page === pageIndex && s.kind !== 'figure' && s.x < graphic.x+graphic.w && graphic.x < s.x+s.w).map(s => ({q,s})));
      if (!candidates.length) continue;
      const center = graphic.y + graphic.h/2;
      const ranked = candidates.map(candidate => {
        const {q,s} = candidate;
        const distance = Math.max(s.y-center,center-s.y-s.h,0);
        const overlap=Math.max(0,Math.min(s.y+s.h,graphic.y+graphic.h)-Math.max(s.y,graphic.y))/graphic.h;
        const nearbyReference = needsFigure(q) && Math.abs((s.anchorY ?? s.y)-center) < .16;
        return {...candidate,score: 1-overlap+distance+Math.abs((s.anchorY ?? s.y)-center)*.1-(nearbyReference ? .12 : 0)};
      }).sort((a,b) => a.score-b.score);
      record.owner ||= ranked[0].q;
      record.candidates=candidates;
  }
  // A shared row can contain disconnected labels and short strokes outside
  // individual connected-component boxes. Move the whole row out of body
  // crops, then give each figure the row's full vertical extent.
  for(let pi=0;pi<pages.length;pi++) {
    const rows=[];
    for(const record of records.filter(r=>r.pageIndex===pi && r.owner)) {
      const g=record.graphic;
      const row=rows.find(row=>Math.abs(row[0].graphic.y+row[0].graphic.h/2-g.y-g.h/2)<Math.max(row[0].graphic.h,g.h)*.6);
      if(row) row.push(record);else rows.push([record]);
    }
    for(const row of rows.filter(row=>new Set(row.map(r=>r.owner)).size>1)) {
      const mask=pad(row.map(r=>r.mask || r.graphic).reduce(union),.003,.003);
      for(const record of row) {
        record.mask=mask;record.detach=true;
        if(!record.clip) record.graphic={...record.graphic,y:mask.y,h:mask.h};
      }
    }
  }
  for(const record of records) {
      const {graphic,pageIndex,owner,candidates}=record;
      if(!candidates) continue;
      if (!record.clip && !record.detach && owner.segments.some(s=>s.page===pageIndex && s.kind!=='figure' && contains(s,graphic))) continue;
      const mask=record.mask || graphic;
      const textRuns=bodies[pageIndex].filter(rect=>intersects(rect,mask));
      for (const {s} of candidates) {
        if (intersects(s,mask)) {
          (s.exclusions ||= []).push(mask);
          (s.protections ||= []).push(...textRuns.filter(run=>intersects(s,run)));
        }
      }
      const fragment = {page:pageIndex,...graphic,kind:'figure',exclusions:textRuns,...(record.clip ? {clip:record.clip} : {})};
      const last = owner.segments.map(s=>s.page).lastIndexOf(pageIndex);
      owner.segments.splice(last<0 ? owner.segments.length : last+1,0,fragment);
  }
  return questions;
}
