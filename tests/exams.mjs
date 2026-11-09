import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {validateENBX} from './enbx-validation.mjs';

// Regions are annotated from the supplied originals, independently of detection.
// [question number, zero-based source page, x, y, width, height].
const cases=[
  {key:'exam2',file:'初三数学期中综合复习2.pdf',count:27,ocr:false,inkRegions:[
    [6,0,.536,.834,.316,.04],
  ],regions:[
    [3,0,.095,.584,.148,.112],[4,0,.284,.579,.18,.122],
    [7,0,.500,.575,.17,.13],[8,0,.693,.593,.19,.10],
    [13,1,.095,.429,.115,.109],[14,1,.255,.425,.165,.115],
    [15,1,.465,.435,.16,.095],[16,1,.692,.424,.17,.118],
    [21,3,.555,.067,.32,.11],[22,3,.68,.342,.23,.18],[23,3,.70,.657,.20,.148],
  ]},
  {key:'exam6',file:'初三数学复习卷 6.pdf',count:26,ocr:true,inkRegions:[
    [2,0,.15,.151,.55,.013],[18,1,.05,.63,.9,.02],
    [11,0,.405,.78,.013,.016],[12,0,.414,.735,.025,.025],
  ],regions:[
    [2,0,.068,.174,.19,.09],[4,0,.292,.183,.124,.081],
    [5,0,.457,.183,.09,.07],[6,0,.590,.178,.12,.087],[7,0,.779,.173,.16,.086],
    [8,0,.09,.754,.14,.085],[11,0,.256,.747,.15,.088],[12,0,.434,.747,.139,.088],
    [13,0,.622,.75,.12,.108],[14,0,.776,.739,.137,.095],
    [15,1,.202,.12,.135,.09],[16,1,.387,.119,.178,.095],
    [17,1,.645,.125,.295,.12],[17,1,.69,.412,.22,.05],
    [18,1,.06,.67,.16,.104],[19,1,.08,.832,.14,.08],
    [24,3,.06,.145,.21,.075],[25,3,.065,.41,.16,.10],[25,3,.26,.42,.14,.10],
    [26,3,.065,.722,.12,.06],[26,3,.222,.72,.12,.06],[26,3,.37,.722,.11,.06],
  ]},
];
const inside=(p,r)=>p.x>=r.x && p.x<=r.x+r.w && p.y>=r.y && p.y<=r.y+r.h;
function insidePolygon(p,polygon) {
  let result=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];
    if((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) result=!result;
  }
  return result;
}
const visible=(question,point,page,pages)=>question.segments.some(s=>s.page===page && inside(point,s) &&
  ((s.protections || []).some(r=>inside(point,r)) ||
   ((!s.clip || insidePolygon(point,s.clip)) && !pages[s.page].exclusions.some(r=>inside(point,r)) && !(s.exclusions || []).some(r=>inside(point,r)))));
function visibleFraction(question,region,pages) {
  let count=0;
  for(let y=0;y<24;y++) for(let x=0;x<24;x++) {
    const point={x:region.x+(x+.5)*region.w/24,y:region.y+(y+.5)*region.h/24};
    if(visible(question,point,region.page,pages)) count++;
  }
  return count/(24*24);
}

const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0,hmr:false}});
let browser;
try {
  await server.listen();
  const address=server.httpServer.address();
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage({acceptDownloads:true});
  page.on('console',message=>{if(message.text().startsWith('EXAM ')) console.log(message.text());});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}`);
  await mkdir('test-results/real-exams',{recursive:true});
  for(const sample of cases) {
    const base64=(await readFile('tests/'+sample.file)).toString('base64');
    const result=await page.evaluate(async({base64,sample})=>{
      const {readDocument,recognizePages}=await import('/src/document.js');
      const {segmentPages}=await import('/src/segment.js');
      const {pageLayout}=await import('/src/layout.js');
      const {renderPage}=await import('/src/seewo.js');
      const {prepareQuestionImages}=await import('/src/answer-image.js');
      const {buildAnswerRequest,providerById}=await import('/src/answer.js');
      const pages=await readDocument(new File([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],sample.file),()=>{});
      if(sample.ocr) {let last='';await recognizePages(pages,text=>{if(text!==last){last=text;console.log('EXAM '+text);}});}
      const questions=segmentPages(pages),options={ratio:'16:9',theme:'clean',headings:true,blankSpace:false,title:sample.file.replace(/\.pdf$/,'')};
      globalThis.examRegression={pages,questions,options};
      const answerImages=sample.key==='exam2' ? questions.filter(q=>[14,16,19,24,26,27].includes(q.number)).map(q=>{
        const images=prepareQuestionImages(q,pages),request=buildAnswerRequest({provider:providerById('deepseek'),dataUrls:images.map(image=>image.url)});
        return {number:q.number,images,requestImages:request.messages[0].content.filter(c=>c.type==='image_url').length};
      }) : [];
      const inkChecks=sample.inkRegions.map(([number,pi,x,y,w,h])=>{
        const p=pages[pi],pixels=p.canvas.getContext('2d').getImageData(0,0,p.width,p.height).data,points=[];
        for(let py=Math.ceil(y*p.height);py<(y+h)*p.height;py+=2) for(let px=Math.ceil(x*p.width);px<(x+w)*p.width;px+=2) {
          const at=(py*p.width+px)*4;
          if(Math.min(pixels[at],pixels[at+1],pixels[at+2])<165) points.push({x:px/p.width,y:py/p.height});
        }
        return {number,page:pi,points};
      });
      return {questions,inkChecks,answerImages,pages:pages.map(({canvas,url,...meta})=>({...meta,exclusions:pageLayout(meta).exclusions})),previews:questions.map((q,i)=>renderPage(q,pages,options,i,questions.length).toDataURL('image/png'))};
    },{base64,sample});
    assert.deepEqual(result.questions.map(q=>q.number),Array.from({length:sample.count},(_,i)=>i+1),sample.file+' has every question exactly once');
    for(const entry of result.answerImages) {
      assert.equal(entry.images.length,entry.requestImages,'all prepared images are sent together');
      assert.ok(entry.images.every(i=>i.width<=1600 && i.height<=1400));
      assert.ok(entry.images.some(i=>i.kind==='figure'),`question ${entry.number} has a separate diagram close-up`);
      if(entry.number===27) assert.ok(entry.images.filter(i=>i.kind==='question').length>1,'question 27 has full-resolution tiles');
      for(const [index,image] of entry.images.entries()) await writeFile(`test-results/real-exams/sent-${entry.number}-${index+1}.jpg`,Buffer.from(image.url.split(',')[1],'base64'));
    }
    for(const check of result.inkChecks) {
      assert.ok(check.points.length>8,`${sample.key} question ${check.number}: annotated text/letter region contains actual ink`);
      const q=result.questions.find(q=>q.number===check.number);
      const retained=check.points.filter(point=>visible(q,point,check.page,result.pages)).length/check.points.length;
      assert.ok(retained>.985,`${sample.key} question ${q.number}: text/formula/letter ink preserved (${retained})`);
    }
    for(const [number,pageIndex,x,y,w,h] of sample.regions) {
      const region={page:pageIndex,x,y,w,h};
      const owner=result.questions.find(q=>q.number===number);
      assert.ok(visibleFraction(owner,region,result.pages)>.88,`${sample.key} question ${number}: retains its complete diagram from page ${pageIndex+1}`);
      for(const other of result.questions.filter(q=>q!==owner)) assert.ok(visibleFraction(other,region,result.pages)<.18,`${sample.key} diagram ${number} must not remain in question ${other.number}`);
    }
    for(const [pi,p] of result.pages.entries()) {
      for(const line of p.lines.filter(l=>/第\s*\d+\s*页/.test(l.text))) for(const q of result.questions) assert.equal(visibleFraction(q,{...line,page:pi},result.pages),0,'source page counters are masked');
    }
    for(let i=0;i<result.previews.length;i++) await writeFile(`test-results/real-exams/${sample.key}-${String(i+1).padStart(2,'0')}.png`,Buffer.from(result.previews[i].split(',')[1],'base64'));
    await writeFile(`test-results/real-exams/${sample.key}-layout.json`,JSON.stringify({questions:result.questions,pages:result.pages},null,2));
    console.log(`PASS ${sample.file}: ${sample.count} questions, annotated diagrams belong to their questions, page counters removed`);
    for(const format of ['pptx','seewo','enbx']) {
      const pending=page.waitForEvent('download',{timeout:120000});
      await page.evaluate(async format=>{
        const {questions,pages,options}=globalThis.examRegression;
        const module=await import(format==='enbx'?'/src/enbx.js':format==='seewo'?'/src/seewo.js':'/src/export.js');
        await (module.exportENBX || module.exportSeewoPPTX || module.exportPPTX)(questions,pages,options,()=>{});
      },format);
      const file=await pending,target=`test-results/real-exams/${sample.key}-${format}.${format==='enbx'?'enbx':'pptx'}`;
      await file.saveAs(target);
      const zip=await JSZip.loadAsync(await readFile(target));
      if(format==='enbx') await validateENBX(zip,sample.count,{width:3200,height:1800});
      else assert.equal(zip.file(/^ppt\/slides\/slide\d+\.xml$/).length,sample.count);
      console.log(`PASS ${sample.key} ${format}: ${sample.count} complete slides`);
    }
    // 答案与解析：解析 / 答案先隐藏；PPTX 同页点击出现，希沃两种格式按每题后一页。
    const solutionFile=sample.key==='exam2'?'tests/solutions/期中综合复习2.json':'tests/solutions/复习卷6.json';
    const solutionData=JSON.parse(await readFile(solutionFile,'utf8'));
    const applied=await page.evaluate(async entries=>{
      const {applySolutions}=await import('/src/solutions.js');
      return applySolutions(globalThis.examRegression.questions,entries);
    },solutionData.questions);
    assert.equal(applied,sample.count,`${sample.file}: every question matched an answer`);
    const scenarios=[
      {format:'pptx',solutions:'reveal',pages:sample.count},
      {format:'pptx',solutions:'paged',pages:sample.count*2},
      {format:'seewo',solutions:'paged',pages:sample.count*2},
      {format:'enbx',solutions:'paged',pages:sample.count*2},
    ];
    for(const scenario of scenarios) {
      const pending=page.waitForEvent('download',{timeout:180000});
      await page.evaluate(async ({format,solutions})=>{
        const {questions,pages,options}=globalThis.examRegression;
        const module=await import(format==='enbx'?'/src/enbx.js':format==='seewo'?'/src/seewo.js':'/src/export.js');
        await (module.exportENBX || module.exportSeewoPPTX || module.exportPPTX)(questions,pages,{...options,solutions},()=>{});
      },scenario);
      const file=await pending,target=`test-results/real-exams/${sample.key}-${scenario.format}-${scenario.solutions}.${scenario.format==='enbx'?'enbx':'pptx'}`;
      await file.saveAs(target);
      const zip=await JSZip.loadAsync(await readFile(target));
      if(scenario.format==='enbx') await validateENBX(zip,scenario.pages,{width:3200,height:1800});
      else {
        const slides=zip.file(/^ppt\/slides\/slide\d+\.xml$/).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
        assert.equal(slides.length,scenario.pages,`${sample.key} ${scenario.format}/${scenario.solutions} slide count`);
        if(scenario.solutions==='reveal') {
          for(const [index,entry] of slides.entries()) {
            const xml=await entry.async('string');
            assert.match(xml,/<p:timing>/,`${sample.key} slide ${index+1} has timing`);
            assert.ok(xml.indexOf('<p:timing>')<xml.indexOf('</p:sld>'));
            assert.equal((xml.match(/nodeType="clickEffect"/g)||[]).length,2,`${sample.key} slide ${index+1}: 解析、答案依次点击出现`);
            assert.equal((xml.match(/presetClass="entr"/g)||[]).length,2);
          }
        }
      }
      console.log(`PASS ${sample.key} ${scenario.format}/${scenario.solutions}: ${scenario.pages} slides with solutions`);
    }
    await page.evaluate(()=>{examRegression.pages.forEach(p=>p.canvas.width=0);delete globalThis.examRegression;});
  }
  assert.deepEqual(errors,[]);
} finally {await browser?.close();await server.close();}
