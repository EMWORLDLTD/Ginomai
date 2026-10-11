'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

// Remove only app-generated files; keep the directory and unrelated originals.
module.exports = async function clearOwnedFiles(directory, pattern) {
  const root = path.resolve(directory);
  const names = await fs.readdir(root).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  for (const name of names.filter(name => pattern.test(name))) {
    const filename = path.resolve(root, name);
    if (path.dirname(filename) !== root) throw Error('Invalid storage file.');
    await fs.unlink(filename).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
};
