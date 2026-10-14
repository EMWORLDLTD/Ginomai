import {makeCloudBackup, mergeCloudBackup, cloudBackupNotices} from './cloud-backup.mjs';
export function desktopAdapter() {
  const library = () => window.libraryImporter;
  const songs = () => typeof SONGS_DATABASE !== 'undefined' ? SONGS_DATABASE : [];
  async function ready() {
    if (!library() || !window.sessionManager) throw Error('Wait for the local library to open.');
    if (library().dbReady) await library().dbReady;
    if (window.ginomaiRestoreError) throw window.ginomaiRestoreError;
  }
  return {
    async capture() {
      await ready();
      const sessions = structuredClone(window.sessionManager.sessions);
      const active = sessions.find(s => s.id === window.sessionManager.activeSessionId);
      if (active) window.sessionManager.captureStateIntoSession(active);
      return makeCloudBackup('desktop', {sessions}, songs());
    },
    notices: backup => cloudBackupNotices(backup, typeof BIBLE_DATABASE !== 'undefined' ? Object.keys(BIBLE_DATABASE).filter(code => Object.keys(BIBLE_DATABASE[code] || {}).length) : [], 'desktop'),
    async restore(backup) {
      await ready();
      const manager = window.sessionManager, engine = library();
      const merged = mergeCloudBackup('desktop', {sessions: manager.sessions, activeSessionId: manager.activeSessionId}, songs(), backup);
      const nextSongs = [...engine.customSongs, ...merged.additions];
      const journal = window.GinomaiRestoreJournal;
      journal.begin(merged.additions.map(s => s.id));
      try {
        if (engine.db) await new Promise((resolve, reject) => {
          const tx = engine.db.transaction('songs', 'readwrite');
          tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error || Error('Could not save restored songs.'));
          merged.additions.forEach(s => tx.objectStore('songs').put(s));
        });
        localStorage.setItem('sf_custom_songs', JSON.stringify(nextSongs));
        localStorage.setItem('sf_saved_sessions', JSON.stringify(merged.workspace.sessions));
        localStorage.removeItem('sf_system_formatted');
        journal.complete();
      } catch (error) {
        try {await journal.recoverSongs(engine.db);} catch (recovery) {window.ginomaiRestoreError = recovery;}
        throw error;
      }
      engine.customSongs = nextSongs; songs().push(...merged.additions); manager.sessions = merged.workspace.sessions;
      manager.updateTopBarUi();
      // No applySessionToState, broadcast, deck rebuild, or active-session switch.
      return `${backup.sessions.length} sessions restored. Select one from the session menu when ready.`;
    }
  };
}
