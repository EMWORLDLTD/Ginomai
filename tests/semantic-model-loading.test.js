'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const matches = require('../lib/model-integrity.cjs');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

test('model JSON checksums accept Windows line endings and reject changed content', () => {
  const lf = Buffer.from('{\n  "model": "original"\n}\n');
  const crlf = Buffer.from(lf.toString().replace(/\n/g, '\r\n'));
  assert.equal(matches('config.json', lf, hash(lf)), true);
  assert.equal(matches('config.json', crlf, hash(lf)), true);
  assert.equal(matches('config.json', crlf, hash(crlf)), true);
  assert.equal(matches('config.json', Buffer.from('{\n  "model": "modified"\n}\n'), hash(lf)), false);
  assert.equal(matches('model.onnx', crlf, hash(lf)), false);
  assert.equal(matches('model.onnx', crlf, hash(crlf)), true);
});

test('every bundled model file still matches the trusted manifest', () => {
  const manifest = require('../assets/semantic/manifest.json');
  for (const [file, expected] of Object.entries(manifest.modelFiles)) {
    const bytes = fs.readFileSync(path.join(__dirname, '../assets/semantic/models', file));
    assert.equal(matches(file, bytes, expected), true, file);
    const modified = Buffer.from(bytes); modified[0] ^= 1;
    assert.equal(matches(file, modified, expected), false, `${file} must reject corruption`);
  }
});

test('normal offline semantic service loads the model and reuses it for later queries', { timeout: 30000 }, async t => {
  const Service = require('../lib/semantic-service.cjs');
  const service = new Service();
  t.after(() => service.close());
  const pending = service.query('God loved humanity so much he gave his only son so believers could live forever');
  service.worker.ref();
  const worker = service.worker;
  const result = await pending;
  assert.equal(result?.reference, 'John 3:16');
  assert.equal(result.autoProjectEligible, false);
  const next = await service.query('Nothing can separate us from the love of God');
  assert.equal(next?.reference, 'Romans 8:39');
  assert.equal(service.worker, worker);
  const negative = require('../evaluation/semantic-full-results.json').results.find(item => !item.reference);
  assert.equal(await service.query(negative.text), null);
});
