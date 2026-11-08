import {chromium} from '@playwright/test';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {pathToFileURL, fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {validateENBX} from './enbx-validation.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), 'tiye-offline-'));
const extracted = path.join(temporary, '中文解压目录 with spaces');
let browser;
try {
  const archive = process.env.EXAM_TEST_OFFLINE_ARCHIVE || path.join(temporary, '离线包.zip');
  if (!process.env.EXAM_TEST_OFFLINE_ARCHIVE) {
    const pack = spawnSync(process.execPath, ['scripts/package-offline.mjs', '--output', archive], {cwd: root, encoding: 'utf8'});
    assert.equal(pack.status, 0, pack.stdout + pack.stderr);
  }
  const zip = await JSZip.loadAsync(await readFile(archive), {checkCRC32: true});
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const target = path.join(extracted, name);
    await mkdir(path.dirname(target), {recursive: true});
    await writeFile(target, await entry.async('nodebuffer'));
  }
  const entries = Object.keys(zip.files).filter(name => /^[^/]+\/index\.html$/.test(name));
  assert.equal(entries.length, 1, 'archive has one root HTML entry');
  const html = path.join(extracted, entries[0]);
  const url = pathToFileURL(html).href;
  browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage']});
  const context = await browser.newContext({acceptDownloads: true, viewport: {width: 1440, height: 1050}, offline: true});
  const requests = [], errors = [];
  // Block HTTP even from workers; file origin and in-memory Blob/data only.
  await context.route(/^https?:/, route => {requests.push(route.request().url()); return route.abort();});
  context.on('request', request => {if (/^https?:/.test(request.url())) requests.push(request.url());});
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  const settle = () => page.locator('.busy-overlay').waitFor({state: 'hidden', timeout: 180000});
  const count = () => page.locator('.question-card').count();
  async function upload(file) {
    await page.locator('#file-input').setInputFiles(path.join(root, file));
    await page.locator('.workspace').waitFor({timeout: 45000});
    await settle();
  }
  async function download(format, expected, name) {
    await page.locator('[data-action="settings"]').first().click();
    await page.locator(`[data-action="format"][data-value="${format}"]`).click();
    const pending = page.waitForEvent('download', {timeout: 180000});
    await page.locator('[data-action="export"]').click();
    const file = await pending;
    await file.saveAs(path.join(root, 'test-results', name));
    const result = await JSZip.loadAsync(await readFile(await file.path()));
    if (format === 'enbx') await validateENBX(result, expected);
    else assert.equal(result.file(/^ppt\/slides\/slide\d+\.xml$/).length, expected);
    await settle();
  }
  await mkdir(path.join(root, 'test-results'), {recursive: true});
  await page.goto(url);
  await page.getByRole('heading', {name: '一份试卷，一题一页。'}).waitFor();
  await page.screenshot({path: path.join(root, 'test-results/offline-home.png')});
  await page.locator('[data-action="help"]').first().click();
  for (const [index, extension] of ['pdf', 'docx'].entries()) {
    const pending = page.waitForEvent('download');
    await page.locator('.help-modal a').nth(index).click();
    const file = await pending;
    assert.equal(file.suggestedFilename(), `数学示例试卷.${extension}`, 'example keeps its file extension');
    assert.deepEqual(await readFile(await file.path()), await readFile(path.join(root, `public/examples/数学示例试卷.${extension}`)));
  }
  await page.locator('[data-action="close"]').first().click();
  console.log('PASS file:// PDF/DOCX example downloads retain names and original contents');
  await page.locator('[data-action="demo"]').click();
  await page.locator('.workspace').waitFor({timeout: 45000});
  await settle();
  assert.equal(await count(), 6, 'embedded PDF example has six questions');
  await download('pptx', 6, 'offline-pdf.pptx');
  await download('seewo', 6, 'offline-seewo.pptx');
  await download('enbx', 6, 'native-pdf-six-questions.enbx');
  console.log('PASS file:// embedded PDF and all three export formats');
  await upload('public/examples/数学示例试卷.pdf');
  assert.equal(await count(), 6, 'user selected PDF');
  await upload('public/examples/数学示例试卷.docx');
  assert.equal(await count(), 6, 'DOCX with formulas/images');
  await download('enbx', 6, 'native-word-six-questions.enbx');
  await page.locator('.question-card').nth(4).click();
  await page.screenshot({path: path.join(root, 'test-results/offline-word-formula.png'), fullPage: true});
  console.log('PASS file:// PDF and DOCX uploads, Word formula and native ENBX');
  await upload('tests/初三数学期中综合复习2.pdf');
  assert.equal(await count(),27,'supplied text PDF has questions 1–27');
  await download('enbx',27,'offline-real-exam2.enbx');
  await upload('tests/初三数学复习卷 6.pdf');
  assert.equal(await count(),0,'supplied scanned PDF requires OCR');
  await page.locator('[data-action="ocr"]').click();
  await settle();
  assert.equal(await count(),26,'supplied four-page scan has questions 1–26 after offline OCR');
  await download('enbx',26,'offline-real-exam6.enbx');
  console.log('PASS file:// both supplied exams: 27/26 questions and native ENBX exports');
  await upload('tests/fixtures/scanned-exam.pdf');
  assert.equal(await count(), 0, 'scanned file initially has no text');
  await page.locator('[data-action="ocr"]').click();
  await settle();
  assert.equal(await count(), 3, 'embedded Chinese/English OCR detects three questions');
  await download('enbx', 3, 'offline-scanned.enbx');
  await page.screenshot({path: path.join(root, 'test-results/offline-ocr.png'), fullPage: true});
  assert.deepEqual(requests, [], 'no HTTP requests, including OCR workers');
  assert.deepEqual(errors, [], 'no browser exceptions');
  console.log('PASS actual ZIP extracted with Unicode/spaces; offline file:// OCR and exports; zero HTTP, no Python/server');
} finally {
  await browser?.close();
  await rm(temporary, {recursive: true, force: true});
}
