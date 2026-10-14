(function(root) {
  'use strict';
  function createJournal(storage) {
    const key = 'ginomai.cloud.restore-journal.v1';
    const restoreValue = (name, value) => value === null ? storage.removeItem(name) : storage.setItem(name, value);
    return {
      pending: () => JSON.parse(storage.getItem(key) || 'null'),
      begin(addedIds) {
        if (this.pending()) throw Error('Finish recovery of the previous cloud restore first.');
        storage.setItem(key, JSON.stringify({sessions: storage.getItem('sf_saved_sessions'), songs: storage.getItem('sf_custom_songs'), formatted: storage.getItem('sf_system_formatted'), addedIds}));
      },
      recoverLocal() {
        const pending = this.pending(); if (!pending) return;
        restoreValue('sf_saved_sessions', pending.sessions); restoreValue('sf_custom_songs', pending.songs); restoreValue('sf_system_formatted', pending.formatted);
      },
      async recoverSongs(db) {
        const pending = this.pending(); if (!pending) return;
        this.recoverLocal();
        if (db && pending.addedIds.length) await new Promise((resolve, reject) => {
          const tx = db.transaction('songs', 'readwrite');
          tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(Error('Cloud restore recovery failed. Restart before editing your library.'));
          pending.addedIds.forEach(value => tx.objectStore('songs').delete(value));
        });
        storage.removeItem(key);
      },
      complete() {storage.removeItem(key);}
    };
  }
  if (typeof module === 'object') module.exports = {createJournal};
  if (root?.localStorage) {
    root.GinomaiRestoreJournal = createJournal(root.localStorage);
    try {root.GinomaiRestoreJournal.recoverLocal();} catch (error) {root.ginomaiRestoreError = error;}
  }
})(typeof window !== 'undefined' ? window : null);
