import {chromium} from '@playwright/test';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import JSZip from 'jszip';
import {validateENBX} from './enbx-validation.mjs';
const baseURL = process.env.EXAM_TEST_URL || 'http://127.0.0.1:5187';
const results = path.resolve('test-results');
await mkdir(results, {recursive:true});
// 本地假模型接口：验证自动解答的请求、解析与回填，不访问外部服务。
let flakyRequests = 0;
const fakeModel = http.createServer((request, response) => {
  const headers = {'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'content-type,authorization', 'Access-Control-Allow-Methods':'POST,OPTIONS'};
  if (request.method === 'OPTIONS') {response.writeHead(204, headers).end(); return;}
  request.resume();
  request.on('end', () => {
    // /flaky 的第 2～4 次请求返回 500：第 2 题三次重试都失败，后面的题仍要继续。
    if (request.url.startsWith('/flaky')) {
      flakyRequests += 1;
      if (flakyRequests >= 2 && flakyRequests <= 4) {
        response.writeHead(500, {...headers, 'Content-Type':'application/json'});
        response.end(JSON.stringify({error:'temporary failure'}));
        return;
      }
    }
    response.writeHead(200, {...headers, 'Content-Type':'application/json'});
    response.end(JSON.stringify({choices:[{message:{content:'{"answer":"A","analysis":"自动解析：本地假接口返回。"}'}}]}));
  });
});
await new Promise(resolve => fakeModel.listen(0, '127.0.0.1', resolve));
const fakeModelBase = `http://127.0.0.1:${fakeModel.address().port}`;
const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless:true, args:['--no-sandbox','--disable-dev-shm-usage']});
const context = await browser.newContext({viewport:{width:1440,height:1050}, acceptDownloads:true});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.dismiss());
const count = () => page.locator('.question-card').count();
async function settle() {await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:120000});}
async function upload(file) {
  await page.locator('#file-input').setInputFiles(file);
  await page.waitForTimeout(100);
  await settle();
}
async function download(name, expected, format = 'pptx') {
  await page.locator('[data-action="settings"]').first().click();
  await page.locator(`[data-action="format"][data-value="${format}"]`).click();
  if (format === 'seewo') {
    await page.screenshot({path:path.join(results,`seewo-settings-${name}.png`),fullPage:true});
    await page.getByText('下载后，在希沃白板选择「导入课件」，或将文件拖入画布。').waitFor();
  }
  const pending = page.waitForEvent('download');
  await page.locator('[data-action="export"]').click();
  const file = await pending;
  if (format === 'seewo') assert.ok(file.suggestedFilename().endsWith('-希沃导入版.pptx'),'Seewo download has an honest PPTX extension');
  if (format === 'enbx') assert.ok(file.suggestedFilename().endsWith('.enbx'),'native download extension');
  const target = path.join(results,name);
  await file.saveAs(target);
  await settle();
  const zip = await JSZip.loadAsync(await readFile(target));
  if(format === 'enbx') {
    await validateENBX(zip,expected);
    console.log(`PASS ${name}: ${expected} native slides, ordered IDs, valid XML and embedded PNG references`);
    return zip;
  }
  const slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  assert.equal(slides.length, expected, `${name}: slide count`);
  assert.ok(Object.keys(zip.files).some(n => /^ppt\/media\/image/.test(n)), 'PPT contains actual question images');
  for (const slide of slides) {
    const xml = await zip.file(slide).async('string');
    assert.ok(xml.includes('<p:pic>'), `${slide} has question image`);
    if (format === 'seewo') {
      assert.equal((xml.match(/<p:pic>/g)||[]).length,1,'Seewo page has one full-page picture');
      assert.ok(!xml.includes('<p:sp>'),'Seewo pages have no font-dependent text shapes');
      assert.match(xml,/<a:off x="0" y="0"\/>/,'Seewo image starts at the page origin');
    }
  }
  if (format === 'seewo') {
    for (const media of zip.file(/^ppt\/media\/.*\.png$/)) {
      const png = await media.async('nodebuffer');
      assert.ok([1200,1600].includes(png.readUInt32BE(16)),'Seewo picture has high resolution');
      assert.equal(png.readUInt32BE(20),900);
    }
  }
  console.log(`PASS ${name}: ${expected} slides, embedded images and valid OOXML zip`);
  return zip;
}
try {
  await page.goto(baseURL);
  await page.getByRole('heading',{name:'一份试卷，一题一页。'}).waitFor();
  await page.screenshot({path:path.join(results,'home-desktop.png'),fullPage:true});
  await page.locator('[data-action="demo"]').click();
  await page.locator('.workspace').waitFor({timeout:45000});
  await settle();
  assert.equal(await count(),6,'PDF: detects all 6 questions');
  assert.equal(await page.locator('.page-thumb').count(),2,'PDF page count');
  await page.screenshot({path:path.join(results,'pdf-workspace.png'),fullPage:true});
  const dataURL = await page.locator('.paper-image').getAttribute('src');
  await writeFile(path.join(results,'sample-page.png'),Buffer.from(dataURL.split(',')[1],'base64'));
  await download('pdf-six-questions.pptx',6);
  // 自动解答：单题失败不中断整卷，剩余题目继续填。
  await page.locator('[data-action="auto"]').click();
  await page.locator('[data-action="auto-provider"][data-value="custom"]').click();
  await page.locator('[data-field="auto-base"]').fill(`${fakeModelBase}/flaky/v1/chat/completions`);
  await page.locator('[data-field="auto-model"]').fill('fake-vl');
  await page.locator('[data-field="auto-key"]').fill('test-key');
  await page.locator('[data-action="auto-solve"]').click();
  await settle();
  assert.equal(await page.locator('.solution-badge').count(),5,'one failing question does not stop the rest');
  assert.match(await page.locator('.notice').textContent(),/1 题失败/,'failures are reported');
  console.log('PASS auto solve: 单题失败后继续解答其余题目');
  // 再跑一次：只补答未完成的题。
  await page.locator('[data-action="auto"]').click();
  await page.locator('[data-field="auto-base"]').fill(`${fakeModelBase}/v1/chat/completions`);
  await page.locator('[data-action="auto-solve"]').click();
  await settle();
  assert.equal(await page.locator('.solution-badge').count(),6,'rerun fills the remaining question');
  await page.locator('[data-action="settings"]').first().click();
  await page.locator('[data-action="solutions"][data-value="none"]').click();
  await page.locator('[data-action="close"]').click();
  console.log('PASS auto solve:每道题都写回答案与解析');
  // 答案与解析：批量粘贴 → 逐题标记 → 同页点击出现
  await page.locator('[data-action="answers"]').click();
  await page.locator('#answers-text').fill(['1. 答案：D\n解析：解析一','2. 答案：B\n解析：解析二','3. 答案：C\n解析：解析三','4. 答案：A\n解析：解析四','5. 答案：B\n解析：解析五','6. 答案：C\n解析：解析六'].join('\n\n'));
  await page.locator('[data-action="apply-answers"]').click();
  await page.locator('.solution-badge').first().waitFor();
  assert.equal(await page.locator('.solution-badge').count(),6,'every question shows an answer badge');
  await page.locator('[data-action="answers"]').click();
  assert.match(await page.locator('.answers-stats').textContent(),/已填答案\s*6/);
  await page.locator('[data-action="close"]').first().click();
  await page.locator('[data-action="settings"]').first().click();
  await page.locator('[data-action="solutions"][data-value="reveal"]').click();
  const solutionPending = page.waitForEvent('download');
  await page.locator('[data-action="export"]').click();
  const solutionFile = await solutionPending;
  const solutionTarget = path.join(results,'pdf-six-questions-reveal.pptx');
  await solutionFile.saveAs(solutionTarget);
  await settle();
  const solutionZip = await JSZip.loadAsync(await readFile(solutionTarget));
  const solutionSlides = Object.keys(solutionZip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  assert.equal(solutionSlides.length,6,'reveal export keeps one slide per question');
  for(const slide of solutionSlides) {
    const xml = await solutionZip.file(slide).async('string');
    assert.match(xml,/<p:timing>/);
    assert.equal((xml.match(/nodeType="clickEffect"/g)||[]).length,2,`${slide}: analysis then answer reveal on click`);
  }
  console.log('PASS answers: paste import, badges, and two click-triggered reveals per slide');
  // 后续导出按原来的「不导出答案」设置继续回归。
  await page.locator('[data-action="settings"]').first().click();
  await page.locator('[data-action="solutions"][data-value="none"]').click();
  await page.locator('[data-action="close"]').click();
  await download('seewo-pdf-six-questions.pptx',6,'seewo');
  await download('native-pdf-six-questions.enbx',6,'enbx');
  await page.locator('[data-action="split"]').click();
  assert.equal(await count(),7);
  await page.locator('[data-action="undo"]').click();
  assert.equal(await count(),6);
  await page.locator('[data-action="merge"]').click();
  assert.equal(await count(),5);
  await page.locator('[data-action="undo"]').click();
  assert.equal(await count(),6);
  await page.locator('.question-card input').first().uncheck();
  await download('pdf-five-selected.pptx',5);
  await page.locator('[data-action="all"]').click();
  await page.locator('[data-action="mode"][data-value="crop"]').click();
  const box = await page.locator('#paper').boundingBox();
  await page.mouse.move(box.x+box.width*.12,box.y+box.height*.13);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width*.8,box.y+box.height*.28,{steps:6});
  await page.mouse.up();
  assert.equal(await count(),7,'manual crop adds question');
  await page.locator('[data-action="undo"]').click();
  await page.locator('[data-action="settings"]').first().click();
  await page.locator('[data-action="theme"][data-value="dark"]').click();
  await page.locator('[data-action="ratio"][data-value="4:3"]').click();
  await page.locator('[data-field="blankSpace"]').check();
  await page.screenshot({path:path.join(results,'export-settings.png'),fullPage:true});
  await page.locator('[data-action="close"]').click();
  console.log('PASS crop, split, merge, undo, inclusion and export settings');

  await upload('public/examples/数学示例试卷.docx');
  assert.equal(await count(),6,'DOCX: detects all 6 questions');
  assert.equal(await page.locator('.page-thumb').count(),2,'DOCX does not create spurious empty pages');
  assert.ok(await page.locator('.page-thumb img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0)),'all Word thumbnails render');
  const q2 = page.locator('.question-card').nth(1);
  await q2.click();
  await page.screenshot({path:path.join(results,'word-image.png'),fullPage:true});
  await page.locator('.question-card').nth(4).click();
  await page.screenshot({path:path.join(results,'word-formula.png'),fullPage:true});
  await download('word-six-questions.pptx',6);
  await download('seewo-word-six-questions.pptx',6,'seewo');
  await download('native-word-six-questions.enbx',6,'enbx');
  console.log('PASS DOCX import with embedded image and OMML formula');

  await upload('tests/fixtures/automatic-numbering.docx');
  assert.equal(await count(),6,'Word automatic list numbering');
  console.log('PASS Word automatic list numbering');

  await upload('tests/fixtures/long-document.docx');
  assert.ok(await page.locator('.page-thumb').count()>2,'Long Word section spans pages');
  assert.equal(await count(),6,'long Word retains question 6');
  await page.locator('.question-card').last().click();
  await page.screenshot({path:path.join(results,'long-word.png'),fullPage:true});
  await download('long-word-six-questions.pptx',6);
  console.log('PASS long continuous DOCX pagination');

  // A bad subsequent import must preserve the current successful document.
  await page.locator('#file-input').setInputFiles({name:'unsupported.doc',mimeType:'application/msword',buffer:Buffer.from('not a DOCX')});
  await page.waitForTimeout(100);
  await settle();
  assert.equal(await count(),6);
  console.log('PASS failed import retains existing work');

  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(results,'mobile-workspace.png'),fullPage:true});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),'mobile layout fits viewport');
  const mobile = await context.newPage();
  await mobile.setViewportSize({width:390,height:844});
  await mobile.goto(baseURL);
  await mobile.screenshot({path:path.join(results,'home-mobile.png'),fullPage:true});
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth),'mobile homepage fits viewport');
  assert.deepEqual(errors,[],'no unexpected browser errors');
  console.log('PASS desktop/mobile layout and no browser exceptions');
} finally {await browser.close(); await new Promise(resolve => fakeModel.close(resolve));}
