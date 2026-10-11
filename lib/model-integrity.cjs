'use strict';
const crypto = require('node:crypto');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

module.exports = function matchesModelChecksum(file, bytes, expected) {
  if (hash(bytes) === expected) return true;
  // Git may check out JSON with CRLF on Windows; retain the canonical LF hash.
  return file.endsWith('.json') && hash(bytes.toString('utf8').replace(/\r\n/g, '\n')) === expected;
};
