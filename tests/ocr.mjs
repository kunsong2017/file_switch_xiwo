import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
  const page = await browser.newPage({viewport:{width:1440,height:1050}});
  const remote = [];
  page.on('request',request=>{if(!request.url().startsWith(process.env.EXAM_TEST_URL || 'http://127.0.0.1:5187') && !request.url().startsWith('blob:') && !request.url().startsWith('data:')) remote.push(request.url());});
  await page.goto(process.env.EXAM_TEST_URL || 'http://127.0.0.1:5187');
  await page.locator('#file-input').setInputFiles('tests/fixtures/scanned-exam.pdf');
  await page.locator('.workspace').waitFor({timeout:45000});
  assert.equal(await page.locator('.question-card').count(),0,'raster PDF has no text layer');
  await page.locator('[data-action="ocr"]').click();
  await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:180000});
  assert.equal(await page.locator('.question-card').count(),3,'local Chinese + English OCR detects three questions');
  assert.deepEqual(remote,[],'OCR makes no external requests');
  await page.screenshot({path:'test-results/scanned-ocr.png',fullPage:true});
  console.log('PASS raster PDF: 3 questions recognized with local OCR, no external requests');
} finally {await browser.close();}
