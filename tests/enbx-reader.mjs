import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

// Exercise an independent, unchanged reader against the downloaded artifacts.
// This catches interoperability errors that our own serializer checks can miss.
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
try {
  const page=await browser.newPage({viewport:{width:1640,height:1000}});
  await page.setContent('<body style="margin:0"><div id="viewer"></div></body>');
  await page.addScriptTag({path:'node_modules/jszip/dist/jszip.min.js'});
  await page.addScriptTag({path:'third_party/OpenEnow.JS/openenow.js'});
  for(const name of ['native-pdf-six-questions.enbx','native-word-six-questions.enbx']) {
    const data=(await readFile('test-results/'+name)).toString('base64');
    await page.evaluate(async base64=>{
      window.enow?.dispose();
      window.enow=new ENOW();
      enow.CONFIG({container:'#viewer',zip:await JSZip.loadAsync(base64,{base64:true})});
    },data);
    for(let index=0;index<6;index++) {
      await page.evaluate(async n=>{
        await enow.display(n);
        await Promise.all(Array.from(document.querySelectorAll('#viewer img')).map(img=>img.decode()));
      },index);
      assert.equal(await page.locator('#viewer img').count(),1,`${name}: independent reader renders page ${index+1}`);
    }
    await page.evaluate(async()=>{await enow.display(4);await document.querySelector('#viewer img').decode();});
    await page.screenshot({path:`test-results/independent-${name}.png`,fullPage:true});
    console.log(`PASS independent OpenEnow.JS reader: ${name}, all 6 pages`);
  }
} finally {await browser.close();}
