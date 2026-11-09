import {chromium} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {verifyCredentialUI} from './credential-ui.mjs';
import {validateENBX} from './enbx-validation.mjs';

const url=process.env.EXAM_TEST_URL || 'http://127.0.0.1:5187';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
try {
  const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:1100}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);await page.locator('[data-action="demo"]').click();await page.locator('.workspace').waitFor();
  const settle=()=>page.locator('.busy-overlay').waitFor({state:'hidden',timeout:120000});await settle();
  await verifyCredentialUI(page,browser,url);
  const analysis='这是检查解析是否完整保留的步骤。'.repeat(80)+'END_OF_ANALYSIS';
  await page.locator('[data-action="answers"]').click();
  await page.locator('#answers-input').setInputFiles({name:'long-solution.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({questions:[{number:1,answer:'FIRST_LINE\nSECOND_LINE',analysis}]}))});
  await page.locator('.answers-modal').waitFor({state:'hidden'});
  await page.locator('[data-action="resplit"]').click();assert.equal(await page.locator('.solution-badge').count(),1,'re-split preserves answers');
  await page.evaluate(()=>{globalThis.renderedAnswerText=[];const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){renderedAnswerText.push(String(text));return original.call(this,text,...args);};});
  await mkdir('test-results',{recursive:true});
  for(const format of ['seewo','enbx','pptx']) {
    await page.locator('[data-action="settings"]').first().click();await page.locator(`[data-action="format"][data-value="${format}"]`).click();await page.locator('[data-action="solutions"][data-value="paged"]').click();
    const expected=Number((await page.locator('.export-summary > b').innerText()).match(/^\d+/)[0]);assert.ok(expected>7,'long solution continues across pages');
    const pending=page.waitForEvent('download',{timeout:120000});await page.locator('[data-action="export"]').click();const download=await pending;await settle();
    await download.saveAs(`test-results/long-solution.${format==='enbx'?'enbx':format+'.pptx'}`);
    const zip=await JSZip.loadAsync(await readFile(await download.path()));
    if(format==='enbx') await validateENBX(zip,expected,{width:3200,height:1800});
    else assert.equal(zip.file(/^ppt\/slides\/slide\d+\.xml$/).length,expected);
    assert.match(await page.locator('#toast').textContent(),new RegExp(`已生成 ${expected} 页`));
  }
  const rendered=await page.evaluate(()=>renderedAnswerText.join(''));
  assert.ok(rendered.includes('SECOND_LINE') && rendered.includes('END_OF_ANALYSIS'),'canvas renderer retains second answer line and final analysis text');
  console.log('PASS long solutions: complete text, continuation pages and matching UI counts in all three formats');

  const calls=[];let count=0;
  await page.route('https://api.deepseek.com/chat/completions',async route=>{
    const body=route.request().postDataJSON();calls.push(body);count++;
    const message=count===1 ? {content:'',reasoning_content:'private-reasoning-not-for-export'} :
      {content:JSON.stringify(count===3 ? {answer:'无法确定',analysis:'请核对图形标注'} : {answer:'A',analysis:'由已知条件推导并检验。'})};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({model:'deepseek-flash',choices:[{finish_reason:count===1?'length':'stop',message}],usage:{completion_tokens:count===1?16384:50}})});
  });
  await page.locator('[data-action="auto"]').click();await page.locator('[data-field="auto-key"]').fill('fake-key-for-local-intercept-only');await page.locator('[data-field="auto-overwrite"]').check();
  assert.equal(calls.length,0,'typing a key never sends questions');
  await page.locator('[data-action="auto-solve"]').click();await settle();
  assert.equal(calls[0].max_tokens,16384);assert.equal(calls[1].max_tokens,32768,'truncation gets a larger budget');
  assert.ok(calls.every(body=>body.messages[0].content.some(c=>c.type==='image_url' && c.image_url.url.startsWith('data:image/jpeg;base64,'))));
  assert.match(await page.locator('.notice').textContent(),/1 题失败或待核对/);
  await page.locator('.question-card').nth(1).click();await page.locator('.answer-diagnostic').getByText('请核对图形标注').waitFor();
  await page.locator('.answer-diagnostic [data-action="answer-images"]').click();await page.locator('.answer-images-modal').waitFor();
  assert.match(await page.locator('.answer-images-modal').textContent(),/最近一次发送的图片一致/);await page.locator('[data-action="close"]').first().click();
  await page.locator('[data-action="auto"]').click();
  const reportPending=page.waitForEvent('download');await page.locator('[data-action="answer-report"]').click();const report=JSON.parse(await readFile(await (await reportPending).path(),'utf8'));
  const reportText=JSON.stringify(report);assert.ok(!reportText.includes('fake-key-for') && !reportText.includes('private-reasoning'));
  assert.equal(report.questions.find(q=>q.number===2).category,'model_uncertain');
  await page.locator('[data-field="auto-overwrite"]').uncheck();await page.locator('[data-action="auto-solve"]').click();await settle();
  assert.equal(calls.length,8,'rerun only retries the unresolved question');assert.equal(await page.locator('.solution-badge').count(),6);
  assert.deepEqual(errors,[]);
  console.log('PASS model workflow: length vs uncertain, adaptive retry, exact sent-image preview and secret-free diagnostics');
} finally {await browser.close();}
