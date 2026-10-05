'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require.resolve('../display.html'), 'utf8');
function source(name) {
  const start = html.indexOf('function ' + name + '(');
  const indent = html.slice(html.lastIndexOf('\n', start) + 1, start);
  return html.slice(start, html.indexOf('\n' + indent + '}', start) + indent.length + 2);
}
test('Liquid Glass reaches livestream lower thirds at all positions and clears when another style is selected', () => {
  const c = { window: {}, targetType: 'livestream', isExplicitLt: false, isLowerThirdLayout: () => true };
  vm.createContext(c);
  vm.runInContext(source('escapeHtml') + '\n' + source('populateSlot'), c);
  const slot = { box: {}, el: { setAttribute() {}, removeAttribute() {} }, ref: { style: {} }, content: { children: [] } };
  const data = { slideId: 'lexicon_G859', contentType: 'lexicon', lexiconStyle: 'glass', lexiconDisplayMode: 'full',
    lexiconData: { id: 'G859', lang: 'Greek', lemma: 'ἄφεσις', transliteration: 'áphesis', englishWord: 'forgiveness', short_definition: 'deliverance' } };
  for (const position of ['left', 'center', 'right']) {
    data.concordancePosition = position;
    c.populateSlot(slot, data);
    assert.match(slot.box.className, new RegExp('pos-' + position));
    assert.match(slot.box.className, /lexicon-lt-wrapper.*lexicon-glass/);
    assert.match(slot.content.innerHTML, /lexicon-focus-card lexicon-glass/);
    assert.match(slot.content.innerHTML, /ἄφεσις/);
  }
  data.lexiconStyle = 'hero';
  c.populateSlot(slot, data);
  assert.doesNotMatch(slot.box.className, /lexicon-glass/);
  assert.doesNotMatch(slot.content.innerHTML, /lexicon-glass/);
});
