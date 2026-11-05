import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, copyFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {checkOffline} from '../scripts/check-offline.mjs';

test('committed offline delivery rejects stale source and modified output, allowing Windows source line endings', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  await checkOffline(root);
  const temporary = await mkdtemp(path.join(tmpdir(), 'tiye-manifest-'));
  try {
    const manifest = JSON.parse(await readFile(path.join(root, 'offline/build.json'), 'utf8'));
    for (const name of [...Object.keys(manifest.inputs), ...Object.keys(manifest.files), 'offline/build.json']) {
      const target = path.join(temporary, name);
      await mkdir(path.dirname(target), {recursive: true});
      await copyFile(path.join(root, name), target);
    }
    const main = path.join(temporary, 'src/main.js');
    const original = await readFile(main, 'utf8');
    await writeFile(main, original + '\n// stale delivery fixture\n');
    await assert.rejects(checkOffline(temporary), /离线源码未同步.*src\/main\.js/);
    await writeFile(main, original.replace(/\r?\n/g, '\r\n'));
    await checkOffline(temporary);
    await writeFile(path.join(temporary, 'offline/index.html'), '<!doctype html><p>stale bundle</p>');
    await assert.rejects(checkOffline(temporary), /离线产物未同步.*offline\/index\.html/);
  } finally {
    await rm(temporary, {recursive: true, force: true});
  }
});
