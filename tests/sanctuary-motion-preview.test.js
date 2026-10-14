'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('lib/sanctuary-media remove deletes media and metadata files', async () => {
  const os = require('node:os');
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sanctuary-media-delete-test-'));
  try {
    const store = require('../lib/sanctuary-media')(tempDir);
    const fakeId = 'upload_11111111-2222-3333-4444-555555555555';
    const jsonPath = path.join(tempDir, fakeId + '.json');
    const mediaPath = path.join(tempDir, fakeId + '.png');
    await fs.promises.writeFile(jsonPath, JSON.stringify({ id: fakeId, name: 'test.png', imageUrl: `/media/uploads/${fakeId}.png` }));
    await fs.promises.writeFile(mediaPath, Buffer.from('fake-png-data'));

    assert.equal(fs.existsSync(jsonPath), true);
    assert.equal(fs.existsSync(mediaPath), true);

    const res = await store.remove(fakeId);
    assert.equal(res.success, true);
    assert.equal(res.id, fakeId);
    assert.equal(fs.existsSync(jsonPath), false);
    assert.equal(fs.existsSync(mediaPath), false);
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});
