import assert from 'node:assert/strict';

// Tests the same browser, an independent recipient browser, and serialized DOM.
// Fake values only; no requests to a model service are made.
export async function verifyCredentialUI(page,browser,url) {
  const key='tiye-browser-test-secret-do-not-export';
  const ready=async target=>{await target.locator('[data-action="demo"]').click();await target.locator('.workspace').waitFor();await target.locator('.busy-overlay').waitFor({state:'hidden',timeout:60000});};
  await page.locator('[data-action="auto"]').click();
  await page.locator('[data-field="auto-key"]').fill(key);
  await page.locator('[data-field="auto-remember"]').check();
  assert.equal(await page.locator('[data-field="auto-key"]').getAttribute('value'),null,'key is not serialized in HTML');
  assert.ok(!(await page.content()).includes(key));
  await page.reload();await ready(page);await page.locator('[data-action="auto"]').click();
  assert.equal(await page.locator('[data-field="auto-key"]').inputValue(),key,'same browser restores the key');
  await page.locator('[data-action="auto-provider"][data-value="qwen"]').click();
  assert.equal(await page.locator('[data-field="auto-key"]').inputValue(),'','different service never inherits the key');
  await page.locator('[data-action="auto-provider"][data-value="deepseek"]').click();
  assert.equal(await page.locator('[data-field="auto-key"]').inputValue(),key);
  const recipient=await browser.newContext({offline:true});
  try {
    const other=await recipient.newPage();
    // HTTP preview requires network access to the local server; file delivery
    // remains in offline mode. Neither path starts a model request.
    if(!url.startsWith('file:')) await recipient.setOffline(false);
    await other.goto(url);await ready(other);await other.locator('[data-action="auto"]').click();
    assert.equal(await other.locator('[data-field="auto-key"]').inputValue(),'','sharing the same HTML does not share browser storage');
  } finally {await recipient.close();}
  await page.locator('[data-action="forget-key"]').click();
  await page.reload();await ready(page);await page.locator('[data-action="auto"]').click();
  assert.equal(await page.locator('[data-field="auto-key"]').inputValue(),'','clear removes the remembered key');
  await page.locator('[data-action="close"]').first().click();
  console.log('PASS remembered key: reload, provider isolation, fresh recipient, no HTML serialization, clear');
}
