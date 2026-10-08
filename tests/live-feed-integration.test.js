'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/app.js'), 'utf8');
function harness() {
  const history = { children: [], appendChild(line) { this.children.push(line); }, get childElementCount() { return this.children.length; } };
  const current = { textContent: '' };
  const panel = { scrollHeight: 100, scrollTop: 50, clientHeight: 50 };
  const state = { autoProject: true, aiDetectedVerses: [], aiDetectedSongs: [] };
  const actions = [];
  const ctx = vm.createContext({ state, window: {}, document: {
    getElementById: id => ({ 'bento-ai-transcript-history': history, 'bento-ai-transcript-text': current, 'bento-ai-transcript': panel }[id]),
    createElement: () => ({ textContent: '' })
  }, toggleAutoProject: value => { state.autoProject = value; },
  omniOpenBibleInDeck: (...args) => actions.push(['chapter', ...args]),
  projectDetectedVerse: item => actions.push(['verse', item.rawReference]),
  projectDetectedSong: item => actions.push(['song', item.songId]),
  renderAiHud() {} });
  vm.runInContext(source.slice(source.indexOf('// Live transcript and projection share'), source.indexOf('function syncSpeechAiStatusControls()')), ctx);
  return { ctx, state, history, current, panel, actions };
}
test('interim text is replaced, finalized speech is retained, and reading position is preserved', () => {
  const {ctx, history, current, panel} = harness();
  ctx.syncLiveTranscript('Matthew twenty', false);
  ctx.syncLiveTranscript('Matthew twenty eight', false);
  assert.equal(history.children.length, 0);
  assert.equal(current.textContent, 'Matthew twenty eight');
  ctx.syncLiveTranscript('Matthew twenty eight', true);
  assert.equal(history.children[0].textContent, 'Matthew twenty eight');
  assert.equal(current.textContent, '');
  panel.scrollHeight = 500; panel.scrollTop = 10;
  ctx.syncLiveTranscript('verse five', true);
  assert.equal(history.children.length, 2);
  assert.equal(panel.scrollTop, 10);
});
test('hiding transcript leaves listening and projection mode unchanged', () => {
  const {ctx, state} = harness(); state.aiListening = true;
  ctx.toggleLiveTranscript(); assert.equal(state.aiTranscriptVisible, false);
  assert.equal(state.aiListening, true); assert.equal(state.autoProject, true);
  ctx.toggleLiveTranscript(); assert.equal(state.aiTranscriptVisible, true);
});
test('manual verse selection takes control; chapter selection only opens chapter', () => {
  const {ctx, state, actions} = harness();
  ctx.window.performDetectionAction({book:'Matthew',chapter:28,verse:5,rawReference:'Matthew 28:5'}, 'select');
  assert.equal(state.autoProject, false);
  assert.equal(actions[0][0], 'verse');
  ctx.window.performDetectionAction({book:'Matthew',chapter:28,kind:'chapter'}, 'select');
  assert.deepEqual(actions[1], ['chapter', 'Matthew', 28]);
});

test('Project Live opens the Bible deck before projection and reuses the current chapter', () => {
  const renders = [], projected = [];
  const state = { bibleVersion: 'KJV', activeBibleBook: 'Matthew', activeBibleChapter: 28, activeDeckType: 'song', isMedleyMode: true };
  const ctx = vm.createContext({state, window:{themeManager:{currentStyle:'bento'}}, BIBLE_DATABASE:{KJV:{}},
    syncActiveTabUI(){}, renderLibrary(){renders.push('library');},
    renderDeck(){assert.equal(state.activeDeckType,'bible');assert.equal(state.activeBibleVerse,5);renders.push('deck');},
    projectSlide:(...args)=>projected.push(args)});
  vm.runInContext(source.slice(source.indexOf('function projectDetectedVerse('),source.indexOf('function projectDetectedSong(')),ctx);
  ctx.projectDetectedVerse({book:'Matthew',chapter:28,verse:5,rawReference:'Matthew 28:5'},'Verse five');
  assert.equal(state.currentTab,'bible');assert.equal(state.expandedBibleBook,'Matthew');assert.equal(state.isMedleyMode,false);
  assert.deepEqual(renders,['library','deck']);
  assert.equal(projected[0][0],'bible_Matthew_28_5');assert.equal(projected[0][3].takeLive,true);
  ctx.projectDetectedVerse({book:'Matthew',chapter:28,verse:6},'Verse six');
  assert.equal(renders.length,2);assert.equal(state.activeBibleVerse,6);

});

test('Open loads a detected verse without projecting or changing auto mode',()=>{
 const {ctx,state,actions}=harness();ctx.BIBLE_DATABASE={KJV:{}};
 ctx.window.performDetectionAction({book:'John',chapter:4,verse:10,version:'KJV'},'open');
 assert.deepEqual(actions,[['chapter','John',4,10,false]]);assert.equal(state.autoProject,true);
});
