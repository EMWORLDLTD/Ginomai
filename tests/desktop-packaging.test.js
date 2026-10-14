'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { FileMatcher } = require('app-builder-lib/out/fileMatcher');
const { payloadConfig, options } = require('../scripts/build-desktop');
const root = path.resolve(__dirname, '..');

function accepts(settings, file, dependency = false) {
  const patterns = payloadConfig(settings, '/tmp/package').files;
  const matcher = new FileMatcher(root, '/tmp/package', value => value,
    dependency ? ['**/*', ...patterns.filter(value => value.startsWith('!'))] : patterns);
  return matcher.createFilter()(path.join(root, file), { isDirectory: () => false });
}

test('desktop packaging retains offline content, PDF assets and renderer entry points', () => {
  const settings = { platform: 'win32', arch: 'x64' };
  for (const file of ['index.html', 'display.html', 'operator.html', 'remote.html', 'server.js',
    'electron/main.js', 'electron/preload.js', 'lib/semantic-worker.mjs', 'js/strongs-search-worker.js',
    'bibles/NIV.json', 'lexicon/strongs_unified.json', 'assets/semantic/vectors.f32',
    'assets/semantic/models/Xenova/bge-small-en-v1.5/onnx/model_quantized.onnx',
    'assets/pdfjs/pdf.mjs', 'assets/pdfjs/pdf.worker.mjs', 'assets/pdfjs/cmaps/UniJIS-UTF16-H.bcmap',
    'assets/pdfjs/wasm/openjpeg.wasm', 'assets/pdfjs/standard_fonts/LiberationSans-Regular.ttf']) {
    assert.equal(accepts(settings, file), true, file);
  }
  for (const file of ['jacks_donuts_images/classics/chocolate-glazed.png', 'tests/installer.test.js',
    '.agents/notes.md', 'output/build-cache/package.json', 'test_svg.html', 'electron/installer/main.js']) {
    assert.equal(accepts(settings, file), false, file);
  }
});

test('each desktop target ships only its own native AI binaries', () => {
  for (const settings of [{ platform: 'win32', arch: 'x64' },
    { platform: 'darwin', arch: 'x64' }, { platform: 'darwin', arch: 'arm64' }]) {
    for (const platform of ['win32', 'darwin', 'linux']) {
      for (const arch of ['x64', 'arm64']) {
        const file = `node_modules/onnxruntime-node/bin/napi-v3/${platform}/${arch}/runtime.node`;
        assert.equal(accepts(settings, file, true), platform === settings.platform && arch === settings.arch, file);
      }
    }
  }
});

test('Node AI entry points remain while redundant browser and PDF dependencies are excluded', () => {
  const settings = { platform: 'win32', arch: 'x64' };
  for (const file of ['node_modules/@huggingface/transformers/package.json',
    'node_modules/@huggingface/transformers/dist/transformers.node.mjs',
    'node_modules/@huggingface/transformers/dist/transformers.node.cjs',
    'node_modules/sharp/lib/index.js', 'node_modules/@img/sharp-win32-x64/lib/libvips-42.dll',
    'node_modules/electron-updater/out/main.js']) {
    assert.equal(accepts(settings, file, true), true, file);
  }
  for (const file of ['node_modules/pdfjs-dist/build/pdf.mjs',
    'node_modules/@napi-rs/canvas/index.js', 'node_modules/@napi-rs/canvas-win32-x64-msvc/skia.win32-x64-msvc.node',
    'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',
    'node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm',
    'node_modules/@huggingface/transformers/dist/transformers.web.js',
    'node_modules/@huggingface/transformers/dist/transformers.node.mjs.map']) {
    assert.equal(accepts(settings, file, true), false, file);
  }
});

test('default releases exclude optional content and retain KJV, download metadata and AI runtime', () => {
  const settings = options([], 'win32', 'x64');
  assert.equal(settings.cloudContent, true);
  assert.equal(options(['--bundled-content'], 'win32', 'x64').cloudContent, false);
  for (const file of ['bibles/KJV.json', 'bibles/manifest.json', 'assets/content-packs/manifest.json', 'js/content-packs.js', 'css/content-packs.css', 'lib/semantic-worker.mjs']) assert.equal(accepts(settings, file), true, file);
  for (const file of ['bibles/NIV.json', 'bibles/KJV_STRONGS.json', 'lexicon/strongs_unified.json', 'assets/semantic/vectors.f32', 'assets/semantic/manifest.json', 'assets/semantic/models/Xenova/bge-small-en-v1.5/onnx/model_quantized.onnx']) assert.equal(accepts(settings, file), false, file);
  assert.equal(accepts(settings, 'node_modules/onnxruntime-node/bin/napi-v3/win32/x64/runtime.node', true), true);
});
