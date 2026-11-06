import {chromium} from '@playwright/test';
import {mkdtemp, readFile, mkdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {validateENBX} from './enbx-validation.mjs';

const root = fileURLToPath(new URL('..',import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(),'tiye-package-'));
const extracted = path.join(temporary,'含空格的解压目录 with spaces');
const archive = path.join(temporary,'delivery.zip');
const python = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
let server, browser;

async function startServer(args, stubBrowser = false) {
  const script = path.join(extracted,'题页-试卷转PPT/scripts/serve.py');
  const prefix = stubBrowser ? ['-u','-c',"import runpy,sys,webbrowser; webbrowser.open_new_tab=lambda url:print('BROWSER_OPEN '+url,flush=True); script=sys.argv[1];sys.argv=sys.argv[1:];runpy.run_path(script,run_name='__main__')",script] : ['-u',script];
  const process = spawn(python,[...prefix,...args],{cwd:temporary,stdio:['ignore','pipe','pipe']});
  let output = '';
  process.stdout.on('data',chunk => output += chunk.toString());
  const url = await new Promise((resolve,reject) => {
    const timeout = setTimeout(() => reject(new Error('Packaged server did not start: '+output)),10000);
    process.once('exit',code => {clearTimeout(timeout);reject(new Error('Packaged server exited: '+code));});
    process.stdout.on('data',() => {
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\//);
      if (match) {clearTimeout(timeout);resolve(match[0]);}
    });
  });
  return {process,url,output:() => output};
}

try {
  const pack = spawnSync(python,[path.join(root,'scripts/package_delivery.py'),'--output',archive],{cwd:root,encoding:'utf8'});
  assert.equal(pack.status,0,pack.stdout+pack.stderr);
  const zip = await JSZip.loadAsync(await readFile(archive));
  for (const file of ['启动题页.bat','启动题页.sh','使用前先看.txt','dist/index.html','scripts/serve.py','offline/index.html','offline/build.json']) assert.ok(zip.file('题页-试卷转PPT/'+file),'packaged '+file);
  assert.ok(!(await zip.file('题页-试卷转PPT/启动题页.bat').async('string')).match(/(?<!\r)\n/),'Windows launcher has CRLF line endings');
  await mkdir(extracted,{recursive:true});
  const unpack = spawnSync(python,['-m','zipfile','-e',archive,extracted],{encoding:'utf8'});
  assert.equal(unpack.status,0,unpack.stderr);
  server = await startServer(['--port','0']);
  browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
  const page = await browser.newPage({acceptDownloads:true});
  page.on('dialog',dialog => dialog.accept());
  await page.goto(server.url);
  await page.getByRole('heading',{name:'一份试卷，一题一页。'}).waitFor();
  await page.locator('[data-action="demo"]').click();
  await page.locator('.workspace').waitFor();
  assert.equal(await page.locator('.question-card').count(),6);
  await page.locator('[data-action="settings"]').first().click();
  await page.locator('[data-action="format"][data-value="seewo"]').click();
  const pending = page.waitForEvent('download');
  await page.locator('[data-action="export"]').click();
  const download = await pending;
  const pptx = await JSZip.loadAsync(await readFile(await download.path()));
  assert.equal(pptx.file(/^ppt\/slides\/slide\d+\.xml$/).length,6);
  console.log('PASS extracted package starts outside its directory, including Unicode/spaces, and exports 6 slides');
  await page.locator('.busy-overlay').waitFor({state:'hidden'});
  await page.locator('[data-action="settings"]').first().click();
  await page.locator('[data-action="format"][data-value="enbx"]').click();
  const nativePending=page.waitForEvent('download');
  await page.locator('[data-action="export"]').click();
  const native=await nativePending;
  await validateENBX(await JSZip.loadAsync(await readFile(await native.path())),6,{width:3200,height:1800});
  console.log('PASS extracted offline package exports actual native ENBX without external services');
  const port = new URL(server.url).port;
  let second;
  try {
    second = await startServer(['--port',port,'--open'],true);
    assert.notEqual(second.url,server.url,'occupied port automatically selects a free one');
    await page.goto(second.url);
    await page.getByRole('heading',{name:'一份试卷，一题一页。'}).waitFor();
    await page.waitForTimeout(400);
    assert.ok(second.output().includes('BROWSER_OPEN '+second.url),'auto-open uses the actual bound port');
  } finally {second?.process.kill();}
  const direct = await browser.newPage();
  for (const html of ['index.html','dist/index.html']) {
    await direct.goto(pathToFileURL(path.join(extracted,'题页-试卷转PPT',html)).href);
    await direct.getByRole('heading',{name:'一份试卷，一题一页。'}).waitFor();
    assert.ok(direct.url().endsWith('/offline/index.html'),'HTML entry redirects to the committed offline app');
  }
  await mkdir(path.join(root,'test-results'),{recursive:true});
  await direct.screenshot({path:path.join(root,'test-results/local-file-entry.png'),fullPage:true});
  console.log('PASS direct file opening redirects to offline HTML; occupied port and browser auto-open work');
} finally {
  await browser?.close();
  server?.process.kill();
  await rm(temporary,{recursive:true,force:true});
}
