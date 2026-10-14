'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Serialize atomic writes so an older, slower save cannot replace a newer slide.
module.exports = function createLiveStateStore(filename = process.env.SF_LIVE_STATE_FILE || path.join(os.homedir(), '.ginomai', 'live-state.json')) {
  let writes = Promise.resolve();
  let lastError = null;
  return {
    load() {
      try {
        const saved = JSON.parse(fs.readFileSync(filename, 'utf8'));
        return saved && typeof saved === 'object' && !Array.isArray(saved) && Number.isFinite(saved._outputRevision) ? saved : null;
      } catch (_) { return null; }
    },
    save(state) {
      const { hostSpeechState, ...snapshot } = state;
      const serialized = JSON.stringify(snapshot);
      writes = writes.then(async () => {
        await fs.promises.mkdir(path.dirname(filename), { recursive: true });
        await fs.promises.writeFile(filename + '.tmp', serialized, 'utf8');
        await fs.promises.rename(filename + '.tmp', filename);
        lastError = null;
      }).catch(error => {
        lastError = error;
        console.warn('[Ginomai] Could not persist live output:', error.message);
      });
      return writes;
    },
    async flush(options = {}) {
      await writes;
      if (options.strict && lastError) throw new Error('Could not save live state. Restart has been prevented.');
    }
  };
};
