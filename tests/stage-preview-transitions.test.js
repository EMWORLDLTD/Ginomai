'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  const source = fs.readFileSync(require.resolve('../js/bento-integration.js'), 'utf8');
  const context = vm.createContext({ getComputedStyle: () => ({ transform: 'none' }) });
  vm.runInContext(source.slice(source.indexOf('  const stagePreviewTransitions'), source.indexOf('  function syncBentoStagePreview()')), context);
  const animations = [];
  const copies = [];
  const parent = { clientWidth: 480, insertBefore() {} };
  const element = {
    style: {}, parentNode: parent, parentElement: parent,
    removeAttribute() {}, setAttribute() {}, querySelectorAll: () => [], closest: () => null,
    animate(frames, options) {
      const animation = { frames, options, cancel() { this.cancelled = true; } };
      animations.push(animation);
      return animation;
    },
    cloneNode() { const copy = { ...this, style: {}, remove() { this.removed = true; } }; copies.push(copy); return copy; }
  };
  const change = (key, type = 'fade', duration = 300, mode = 'sanctuary') =>
    context.prepareStagePreviewTransition(element, key, mode, { transitionType: type, transitionDuration: duration })();
  return { animations, copies, change };
}

test('stage transitions match selected effect and speed, preserving both slide layers', () => {
  for (const [type, incoming, outgoing] of [
    ['fade', 'none', 'none'], ['zoom-in', 'scale(0.85)', 'scale(1.15)'],
    ['zoom-out', 'scale(1.15)', 'scale(0.85)'],
    ['slide-left', 'translateX(30px)', 'translateX(-30px)'],
    ['slide-right', 'translateX(-30px)', 'translateX(30px)'],
    ['slide-up', 'translateY(20px)', 'translateY(-20px)'],
    ['slide-down', 'translateY(-20px)', 'translateY(20px)']
  ]) {
    const { change, animations, copies } = setup();
    change('first', type);
    assert.equal(animations.length, 0, 'first appearance is immediate like output');
    change('second', type, 800);
    assert.equal(animations.length, 2);
    assert.equal(animations[0].frames[1].transform, outgoing);
    assert.equal(animations[1].frames[0].transform, incoming);
    assert.equal(animations[1].options.duration, 800);
    change('second', type, 800);
    assert.equal(animations.length, 2, 'unchanged sync does not restart animation');
    animations[1].onfinish();
    assert.equal(copies[0].removed, true);
    assert.ok(animations.every(a => a.cancelled));
  }
});

test('rapid slide changes, clear, cut, zero duration and mode changes clean up animation', () => {
  const { change, animations, copies } = setup();
  change('first');
  change('second');
  change('third');
  assert.equal(copies[0].removed, true);
  assert.equal(animations[0].cancelled, true);
  change('');
  assert.equal(copies[1].removed, true);
  change('fourth');
  change('fifth', 'cut');
  change('sixth', 'fade', 0);
  change('seventh', 'fade', 300, 'livestream');
  assert.equal(animations.length, 4);
});
