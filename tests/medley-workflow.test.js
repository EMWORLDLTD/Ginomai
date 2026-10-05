'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
const bento = fs.readFileSync(require.resolve('../js/bento-integration.js'), 'utf8');
const display = fs.readFileSync(require.resolve('../display.html'), 'utf8');
function source(text, name) {
  const start = text.indexOf('function ' + name + '(');
  const indent = text.slice(text.lastIndexOf('\n', start) + 1, start);
  const end = text.indexOf('\n' + indent + '}', start);
  return text.slice(start, end + indent.length + 2);
}
function setup() {
  const songs = ['a', 'b', 'c', 'd'].map(id => ({ id, title: id, stanzas: [{ type: 'Verse 1', text: 'one\ntwo\nthree\nfour\nfive\nsix' }] }));
  const state = { isMedleyMode: true, currentTab: 'songs', activeDeckType: 'song', medleySongIds: ['a', null, null], activeSongId: 'a' };
  const calls = { render: 0, notices: [] };
  const c = { state, SONGS_DATABASE: songs, window: { SONGS_DATABASE: songs },
    document: { getElementById: () => null, querySelectorAll: () => [] },
    renderDeck: () => calls.render++, renderLibrary() {}, syncDashboardWorkspace() {}, syncActiveTabUI() {},
    showToast: text => calls.notices.push(text), applySongBoundTheme() {}, scrollActiveLibraryItemIntoView() {} };
  c.window.state = state;
  vm.createContext(c);
  for (const name of ['swapMedleySong', 'selectSingleViewSong', 'setMedleyMode', 'syncStateFromSlideId', 'splitStanzaIntoChunks']) vm.runInContext(source(app, name), c);
  return { c, state, calls, songs };
}
test('library/agenda selection fills empty slots and selecting a loaded song does not rebuild', () => {
  const { c, state, calls } = setup();
  c.selectSingleViewSong('b');
  assert.deepEqual(Array.from(state.medleySongIds), ['a', 'b', null]);
  assert.equal(state.activeSongId, 'b');
  const renders = calls.render;
  c.selectSingleViewSong('a');
  assert.equal(state.activeSongId, 'a');
  assert.equal(calls.render, renders);
});
test('full medley asks for an explicit replacement and rejects invalid dropped IDs', () => {
  const { c, state, calls } = setup();
  state.medleySongIds = ['a', 'b', 'c'];
  c.selectSingleViewSong('d');
  c.swapMedleySong(0, 'Genesis', false);
  assert.deepEqual(state.medleySongIds, ['a', 'b', 'c']);
  assert.equal(calls.render, 0);
  assert.equal(calls.notices.length, 1);
});
test('slot replacement moves existing songs, keeps same-song picker choice, and updates active song', () => {
  const { c, state } = setup();
  state.medleySongIds = ['a', 'b', 'c'];
  c.swapMedleySong(1, 'b', false);
  assert.equal(state.medleySongIds[1], 'b');
  c.swapMedleySong(2, 'b', false);
  assert.deepEqual(state.medleySongIds, ['a', null, 'b']);
  assert.equal(state.activeSongId, 'b');
  c.swapMedleySong(2, 'b');
  assert.equal(state.activeSongId, 'a');
});
test('entering an empty medley loads the selected song and the next distinct agenda songs', () => {
  const { c, state } = setup();
  state.isMedleyMode = false;
  state.medleySongIds = [];
  state.agendaItems = [{ type: 'song', id: 'a' }, { type: 'song', id: 'b' }, { type: 'bible', id: 'Genesis' }, { type: 'song', id: 'c' }];
  c.setMedleyMode(true);
  assert.deepEqual(Array.from(state.medleySongIds), ['a', 'b', 'c']);
});
test('returning to Single uses the selected medley song even with an older live song or another library tab', () => {
  const { c, state } = setup();
  state.medleySongIds = ['a', 'b', 'c'];
  state.activeSongId = 'b';
  state.activeLiveSlideId = 'medley_a_0';
  state.currentTab = 'bible';
  c.setMedleyMode(false);
  assert.equal(state.activeSongId, 'b');
  assert.equal(state.isMedleyMode, false);
});
test('projected medley song updates active metadata without rebuilding the deck', () => {
  const { c, state } = setup();
  assert.equal(c.syncStateFromSlideId('medley_b_0'), false);
  assert.equal(state.activeSongId, 'b');
});
test('real medley renderer honors Full, absorbs drops, and supports dragging songs to agenda', () => {
  const { c, state } = setup();
  function node() {
    const header = {}, slides = { scrollTop: 0 };
    return { children: [], dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {} },
      set innerHTML(value) { this.html = value; this.children = []; },
      querySelector: selector => selector === '.bento-slot-col-head' ? header : slides,
      querySelectorAll() { return []; }, appendChild(child) { this.children.push(child); }, setAttribute() {} };
  }
  const container = node();
  c.document.getElementById = id => id === 'bento-medley-container' ? container : null;
  c.document.querySelector = () => null;
  c.document.createElement = node;
  c.liveCardResizeObserver = null;
  c.window._bentoSlideRegistry = new Map();
  c.window.splitStanzaIntoChunks = c.splitStanzaIntoChunks;
  c.window.swapMedleySong = c.swapMedleySong;
  vm.runInContext(source(bento, 'escapeHtml') + '\n' + source(bento, 'renderBentoDeck'), c);
  state.maxLinesPerSlide = 0;
  c.renderBentoDeck();
  assert.equal(c.window._bentoSlideRegistry.size, 1);
  assert.equal(c.window._bentoSlideRegistry.get('medley_a_0').text.split('\n').length, 6);
  const data = new Map();
  const header = container.children[0].querySelector('.bento-slot-col-head');
  header.ondragstart({ dataTransfer: { setData: (key, value) => data.set(key, value) } });
  assert.equal(data.get('application/song-id'), 'a');
  let stopped = false;
  container.children[1].ondrop({ preventDefault() {}, stopPropagation() { stopped = true; }, dataTransfer: { getData: key => key === 'application/song-id' ? 'b' : '' } });
  assert.equal(stopped, true);
  assert.equal(state.medleySongIds[1], 'b');
  state.maxLinesPerSlide = 2;
  c.renderBentoDeck();
  assert.equal(c.window._bentoSlideRegistry.size, 6);
  let editedSong;
  c.renderBentoDeckSplitEditor = (deck, song) => { editedSong = song.id; };
  state.activeSongId = 'b';
  state.isDeckEditingSong = 'b';
  c.renderBentoDeck();
  assert.equal(editedSong, 'b');
  assert.equal(state.isMedleyMode, true, 'editing preserves the medley so closing can restore it');
  assert.match(container.className, /in-split-editor/);
  state.isDeckEditingSong = null;
  c.renderBentoDeck();
  assert.equal(container.children.length, 3);
  assert.equal(container.ondrop, null, 'returning from edit removes single-deck drop handlers');
});
