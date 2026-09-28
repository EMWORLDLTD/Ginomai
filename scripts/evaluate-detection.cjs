'use strict';
// Offline replay: invokes the shipped detector and the actual scripture projection gate.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const speech = fs.readFileSync(path.join(root, 'js/speech-ai.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const handler = app.slice(app.indexOf('function handleDetectedVerse('), app.indexOf('function handleDetectedSong('));
const bible = JSON.parse(fs.readFileSync(path.join(root, 'bibles/KJV.json'), 'utf8'));
const quotationMatcher = new (require('../js/quotation-index.js').QuotationIndex)(bible, 'KJV');
function validate(data) {
  if (data.schemaVersion !== 1 || !Array.isArray(data.cases) || !data.cases.length) throw Error('Expected schemaVersion 1 and nonempty cases');
  const ids = new Set();
  for (const c of data.cases) {
    if (!c.id || ids.has(c.id)) throw Error('Case IDs must be unique');
    ids.add(c.id);
    if (!Number.isFinite(c.durationMs) || c.durationMs <= 0 || !Array.isArray(c.events) || !Array.isArray(c.labels) || !c.provenance) throw Error(`Incomplete case ${c.id}`);
    let previous = -1;
    for (const e of c.events) {
      if (!Number.isFinite(e.at) || e.at < previous || e.at > c.durationMs || !['partial','final','pause','disconnect','reconnect','projection'].includes(e.type)) throw Error(`Invalid event in ${c.id}`);
      if (['partial','final'].includes(e.type) && typeof e.text !== 'string') throw Error('Transcript text required');
      if (e.type === 'projection' && typeof e.reference !== 'string') throw Error('Projection reference required');
      previous = e.at;
    }
    const labels = new Set();
    for (const l of c.labels) {
      if (!l.id || labels.has(l.id) || !Number.isFinite(l.evidenceAt) || !Number.isFinite(l.until) || l.evidenceAt < 0 || l.until < l.evidenceAt || l.until > c.durationMs || typeof l.reference !== 'string') throw Error(`Invalid label in ${c.id}`);
      labels.add(l.id);
    }
  }
}
function evaluate(data) {
  validate(data);
  const cases = data.cases.map(c => {
    let now = 0, connected = true, generation = 0;
    const candidates = [], projections = [], ignored = [];
    const timers = new Map(); let timerId = 0;
    const advance = target => {
      for (;;) { const next = [...timers].filter(([,t]) => t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0]; if(!next)break; timers.delete(next[0]); now=next[1].at; next[1].fn(); }
      now=target;
    };
    const state = { bibleVersion: 'KJV', autoProject: true, aiDetectedVerses: [], aiSuggestions: [] };
    const ctx = vm.createContext({ window: {}, console: { warn() {} }, SONGS_DATABASE: [], state,
      setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; },
      clearTimeout: id => timers.delete(id),
      Date: class extends Date { constructor(...args) { super(...(args.length ? args : [100000 + now])); } static now() { return 100000 + now; } },
      BIBLE_DATABASE: { KJV: bible }, getBibleBooks: () => Object.keys(bible), getBibleVerses: (book, chapter) => bible[book]?.[chapter] || [],
      renderAiHud() {}, broadcastSpeechAiUpdate() {},
      projectDetectedVerse(v) { projections.push({ at: now, reference: v.rawReference, source: 'auto-policy' }); state.lastAutoDetectedRef = v.rawReference; state.activeLiveText = v.rawReference; }
    });
    const policy = new (require('../js/auto-projection-policy.js').AutoProjectionPolicy)({ readState:()=>state, project: v=>ctx.projectDetectedVerse(v), now:()=>100000+now, schedule:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,at:now+delay});return id;}, cancel:id=>timers.delete(id) });
    ctx.getAutoProjectionPolicy=()=>policy;
    vm.runInContext(speech + '\n' + handler, ctx);
    const engine = new ctx.window.SpeechAiEngine({
      quotationMatcher,
      onReferencePending: () => policy.clear('incomplete-reference'),
      getScriptureVerses: (book, chapter) => bible[book]?.[chapter] || [],
      onVerseDetected(v) { candidates.push({ at: now, reference: v.rawReference, kind: 'direct' }); ctx.handleDetectedVerse(v); },
      onParaphraseDetected(v) { candidates.push({ at: now, reference: v.reference, kind: v.kind || 'paraphrase' }); }
    });
    for (const e of c.events) {
      advance(e.at);
      if (e.type === 'disconnect') { policy.clear('disconnect'); engine.resetScriptureContext(); connected = false; continue; }
      if (e.type === 'reconnect') { connected = true; generation++; engine.resetScriptureContext(); engine.lastProcessedText = ''; continue; }
      if (e.type === 'projection') { projections.push({ at: now, reference: e.reference, source: 'observed' }); continue; }
      if (e.type === 'pause') continue;
      if (!connected || (e.generation !== undefined && e.generation !== generation)) { ignored.push(e); continue; }
      // Same overlap filter as the live provider; a final remains eligible after a partial.
      if (e.text && (e.text !== engine.lastProcessedText || e.type === 'final')) {
        engine.lastProcessedText = e.text;
        engine.processSpokenText(e.text, e.type === 'final');
      }
    }
    advance(c.durationMs);
    const matching = (d, l) => d.reference === l.reference && d.at >= l.evidenceAt && d.at <= l.until;
    const hits = c.labels.map(l => ({ ...l, detection: candidates.find(d => matching(d,l)) }));
    const falseCandidates = candidates.filter(d => !c.labels.some(l => matching(d,l)));
    const wrongProjections = projections.filter(d => !c.labels.some(l => matching(d,l)));
    return { id: c.id, provenance: c.provenance, durationMs: c.durationMs, expected: c.labels.length,
      hits: hits.filter(h => h.detection).length, missed: hits.filter(h => !h.detection).map(h => h.id),
      latencyMs: hits.filter(h => h.detection).map(h => h.detection.at - h.evidenceAt), candidates, falseCandidates,
      projections, wrongProjections, ignoredEvents: ignored.length };
  });
  const expected = cases.reduce((n,c) => n+c.expected,0), hits = cases.reduce((n,c) => n+c.hits,0);
  const count = field => cases.reduce((n,c) => n+c[field].length,0);
  const duration = cases.reduce((n,c) => n+c.durationMs,0);
  const latency = cases.flatMap(c => c.latencyMs).sort((a,b) => a-b);
  const percentile = p => latency.length ? latency[Math.max(0,Math.ceil(latency.length*p)-1)] : null;
  return { scope: 'Transcript replay, not STT accuracy or measured audio-to-screen latency. Auto-policy projections are simulated with loaded KJV; observed projections are separate.',
    dataset: data.name, projectionMetrics: Object.fromEntries(['auto-policy', 'observed'].map(source => {
      const total = cases.flatMap(c => c.projections).filter(p => p.source === source).length;
      const wrong = cases.flatMap(c => c.wrongProjections).filter(p => p.source === source).length;
      return [source, { total, wrong, wrongPerHour: wrong / (duration / 3600000) }];
    })), summary: { expected, hits, missed: expected-hits, recall: expected ? hits/expected : null,
      candidateEvents: count('candidates'), falseCandidateEvents: count('falseCandidates'),
      falseCandidatesPerMinute: count('falseCandidates')/(duration/60000),
      projections: count('projections'), wrongProjections: count('wrongProjections'), wrongProjectionsPerHour: count('wrongProjections')/(duration/3600000),
      latencyP50Ms: percentile(.5), latencyP95Ms: percentile(.95) }, cases };
}
module.exports = { evaluate, validate };
if (require.main === module) {
  try { const file = process.argv[2] || path.join(root,'evaluation/regression.json'); console.log(JSON.stringify(evaluate(JSON.parse(fs.readFileSync(file,'utf8'))),null,2)); }
  catch (error) { console.error(error.message); process.exitCode=1; }
}
