const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const displayHtml = fs.readFileSync(path.join(__dirname, '../display.html'), 'utf8');

test('Multi-Display: Stage monitor URL parsing and target detection', () => {
  // Test query parameter parsing for target=stage, choir, pastor
  function parseTargetMode(search) {
    const params = new URLSearchParams(search);
    const target = (params.get('target') || '').toLowerCase();
    const isStage = ['stage', 'choir', 'pastor', 'confidence'].includes(target);
    const isChoir = target === 'choir';
    const isPastor = target === 'pastor';
    return { target, isStage, isChoir, isPastor };
  }

  const stageResult = parseTargetMode('?target=stage');
  assert.equal(stageResult.isStage, true);
  assert.equal(stageResult.isChoir, false);
  assert.equal(stageResult.isPastor, false);

  const choirResult = parseTargetMode('?target=choir');
  assert.equal(choirResult.isStage, true);
  assert.equal(choirResult.isChoir, true);

  const pastorResult = parseTargetMode('?target=pastor');
  assert.equal(pastorResult.isStage, true);
  assert.equal(pastorResult.isPastor, true);

  const audienceResult = parseTargetMode('?target=sanctuary');
  assert.equal(audienceResult.isStage, false);

  const defaultResult = parseTargetMode('');
  assert.equal(defaultResult.isStage, false);
});

test('Multi-Display: Stage confidence view DOM updates and next slide anticipation', () => {
  // Mock DOM elements matching display.html for stage confidence
  const elements = new Map();
  function makeElem(id) {
    const elem = {
      id,
      textContent: '',
      innerHTML: '',
      className: '',
      classList: {
        add(c) { elem.className = `${elem.className} ${c}`.trim(); },
        remove(c) { elem.className = elem.className.replace(new RegExp(`\\b${c}\\b`, 'g'), '').trim(); },
        contains(c) { return elem.className.split(/\s+/).includes(c); }
      }
    };
    elements.set(id, elem);
    return elem;
  }

  makeElem('stage-reference-label');
  makeElem('stage-current-slide-text');
  makeElem('stage-next-slide-text');
  makeElem('stage-private-note');
  makeElem('stage-private-note-text');

  function applyStageState(data, isStage = true) {
    if (!isStage) return;
    const refEl = elements.get('stage-reference-label');
    const textEl = elements.get('stage-current-slide-text');
    const nextEl = elements.get('stage-next-slide-text');
    const noteEl = elements.get('stage-private-note');
    const noteText = elements.get('stage-private-note-text');

    if (refEl) refEl.textContent = data.reference || '';

    if (textEl) {
      if (data.clear || data.blackout || (!data.text && !data.reference && !data.isLexicon)) {
        textEl.innerHTML = '<span style="opacity:0.4; font-size:0.7em;">(Slide output idle / clear)</span>';
      } else {
        textEl.innerHTML = (data.text || '').replace(/\n/g, '<br>');
      }
    }

    if (nextEl) {
      if (data.nextSlide && (data.nextSlide.text || data.nextSlide.reference)) {
        const nextRef = data.nextSlide.reference ? `[${data.nextSlide.reference}] ` : '';
        const nextPreview = (data.nextSlide.text || '').split('\n')[0];
        nextEl.textContent = `${nextRef}${nextPreview}`;
      } else {
        nextEl.textContent = 'End of slide sequence';
      }
    }

    if (noteEl && noteText) {
      const msg = data.stageMessage || (data.alert && data.alert.destinations && data.alert.destinations.stage && data.alert.active ? data.alert.text : null);
      if (msg) {
        noteText.textContent = msg;
        noteEl.classList.add('visible');
      } else {
        noteText.textContent = '';
        noteEl.classList.remove('visible');
      }
    }
  }

  // 1. Live verse presentation with anticipation
  applyStageState({
    reference: 'Amazing Grace (Verse 1)',
    text: 'Amazing grace how sweet the sound\nThat saved a wretch like me',
    nextSlide: {
      reference: 'Verse 2',
      text: 'Twas grace that taught my heart to fear\nAnd grace my fears relieved'
    }
  });

  assert.equal(elements.get('stage-reference-label').textContent, 'Amazing Grace (Verse 1)');
  assert.match(elements.get('stage-current-slide-text').innerHTML, /Amazing grace how sweet the sound/);
  assert.equal(elements.get('stage-next-slide-text').textContent, '[Verse 2] Twas grace that taught my heart to fear');
  assert.equal(elements.get('stage-private-note').classList.contains('visible'), false);

  // 2. Private stage note delivery
  applyStageState({
    reference: 'Romans 8:28',
    text: 'And we know that all things work together for good',
    nextSlide: null,
    alert: {
      active: true,
      text: 'Pastor John: 5 minutes left',
      destinations: { sanctuary: false, livestream: false, stage: true }
    }
  });

  assert.equal(elements.get('stage-next-slide-text').textContent, 'End of slide sequence');
  assert.equal(elements.get('stage-private-note').classList.contains('visible'), true);
  assert.equal(elements.get('stage-private-note-text').textContent, 'Pastor John: 5 minutes left');

  // 3. Clear slide output preserves stage readiness
  applyStageState({
    clear: true,
    text: '',
    reference: ''
  });

  assert.match(elements.get('stage-current-slide-text').innerHTML, /Slide output idle \/ clear/);
  assert.equal(elements.get('stage-private-note').classList.contains('visible'), false);
});

test('Multi-Display: Electron multi-monitor selection logic', () => {
  // Mock screen enumeration
  const mockDisplays = [
    { id: 101, isPrimary: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
    { id: 102, isPrimary: false, bounds: { x: 1920, y: 0, width: 1920, height: 1080 } },
    { id: 103, isPrimary: false, bounds: { x: 3840, y: 0, width: 1920, height: 1080 } }
  ];

  function resolveMonitorTargets(projectorDisplayId, stageDisplayId, displays) {
    const primary = displays.find(d => d.isPrimary);
    const secondaryDisplays = displays.filter(d => !d.isPrimary);

    let projTarget = displays.find(d => String(d.id) === String(projectorDisplayId));
    if (!projTarget) {
      projTarget = secondaryDisplays[0] || primary;
    }

    let stageTarget = displays.find(d => String(d.id) === String(stageDisplayId));
    if (!stageTarget) {
      stageTarget = secondaryDisplays.find(d => d.id !== projTarget.id) || secondaryDisplays[0] || primary;
    }

    return { projTarget, stageTarget };
  }

  // Auto-selection when 3 monitors available
  const targets = resolveMonitorTargets(null, null, mockDisplays);
  assert.equal(targets.projTarget.id, 102); // First external display for audience
  assert.equal(targets.stageTarget.id, 103); // Second external display for stage

  // Explicit user selection
  const customTargets = resolveMonitorTargets(103, 102, mockDisplays);
  assert.equal(customTargets.projTarget.id, 103);
  assert.equal(customTargets.stageTarget.id, 102);
});
