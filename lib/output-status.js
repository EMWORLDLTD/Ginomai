'use strict';
const { randomUUID } = require('node:crypto');

module.exports = function createOutputStatus() {
  const displays = new Map();
  return {
    connect(target, res) {
      if (!['sanctuary', 'livestream', 'dynamic', 'stage', 'choir', 'pastor'].includes(target)) return;
      const id = randomUUID();
      displays.set(id, { target, seen: Date.now(), revision: null });
      res.write(`event: output-session\ndata: ${JSON.stringify({ id })}\n\n`);
      return id;
    },
    disconnect(id) { displays.delete(id); },
    // Connection lifetime matters for restart safety, including an idle display.
    connected() {
      return ['sanctuary', 'livestream', 'dynamic', 'stage', 'choir', 'pastor'].map(target => ({ target, connected: [...displays.values()].filter(display => display.target === target).length }));
    },
    acknowledge(id, revision, viewport) {
      const display = displays.get(id);
      if (!display) return false;
      if (viewport && Number.isFinite(viewport.width) && Number.isFinite(viewport.height) && viewport.width > 0 && viewport.height > 0 && viewport.width <= 16384 && viewport.height <= 16384) display.viewport = { width: viewport.width, height: viewport.height };
      display.seen = Date.now();
      display.revision = revision;
      return true;
    },
    snapshot(revision, now = Date.now()) {
      return ['sanctuary', 'livestream', 'dynamic'].map(target => {
        const active = [...displays.values()].filter(display => display.target === target && now - display.seen < 10000);
        return { target, ...(active[0]?.viewport ? { viewport: active[0].viewport } : {}), connected: active.length, received: active.length > 0 && active.every(display => display.revision === revision) };
      });
    }
  };
};
