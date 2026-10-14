// Browser-only data model. Never loaded by the desktop application.
export const LIVE_KEY = 'ginomai.web.live.v1';
export const CHANNEL = 'ginomai_web_live_v1';
export const uid = () => crypto.randomUUID();
export const clone = value => structuredClone(value);
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, limit = 200000) => typeof value === 'string' && value.length <= limit;
export function newSession(name = 'Sunday Service') {
  return {id: uid(), name, agenda: [], updatedAt: Date.now()};
}
export function newWorkspace() {
  const session = newSession();
  return {version: 1, sessions: [session], activeSessionId: session.id, songs: [], settings: {background: '#10121e', textScale: 1}};
}
export function songSlides(song) {
  return song.lyrics.trim().split(/\n\s*\n/).filter(Boolean).flatMap((stanza, stanzaIndex) => {
    const lines = stanza.trim().split('\n');
    const slides = [];
    for (let offset = 0; offset < lines.length; offset += 4) {
      slides.push({id: `${song.id}:${stanzaIndex}:${offset}`, text: lines.slice(offset, offset + 4).join('\n'), reference: song.title, contentType: 'song'});
    }
    return slides;
  });
}
export function parseReference(query, books) {
  const match = query.trim().match(/^(.*?)\s*(\d+)\s*[:,]\s*(\d+)(?:\s*[-–]\s*(\d+))?$/);
  if (!match) return null;
  const key = match[1].toLowerCase().replace(/[.\s]/g, '');
  const book = books.find(book => [book.name, ...(book.aliases || [])].some(alias => alias.toLowerCase().replace(/[.\s]/g, '') === key));
  if (!book) return null;
  const chapter = Number(match[2]), start = Number(match[3]), end = Number(match[4] || start);
  return chapter > 0 && start > 0 && end >= start && end - start < 200 ? {book: book.name, chapter, start, end} : null;
}
export function verseSlides(bible, code, {book, chapter, start = 1, end = Infinity}) {
  return (bible[book]?.[chapter] || []).filter(verse => verse.verse >= start && verse.verse <= end).map(verse => ({
    id: `${code}:${book}:${chapter}:${verse.verse}`, text: verse.text, reference: `${book} ${chapter}:${verse.verse}`, version: code, contentType: 'bible'
  }));
}
export function validateBible(data) {
  if (!plain(data) || !Object.keys(data).length || Object.keys(data).length > 100) throw Error('Choose a Bible JSON containing books, chapters, and verses.');
  let count = 0;
  for (const [book, chapters] of Object.entries(data)) {
    if (!text(book, 100) || !plain(chapters)) throw Error('Invalid Bible book.');
    for (const [chapter, verses] of Object.entries(chapters)) {
      if (!/^[1-9]\d{0,2}$/.test(chapter) || !Array.isArray(verses) || verses.length > 300) throw Error('Invalid Bible chapter.');
      const numbers = new Set();
      for (const verse of verses) {
        if (!plain(verse) || !Number.isInteger(verse.verse) || verse.verse < 1 || !text(verse.text, 20000) || numbers.has(verse.verse)) throw Error('Invalid or duplicate Bible verse.');
        numbers.add(verse.verse);
        if (++count > 100000) throw Error('Bible file contains too many verses.');
      }
    }
  }
  if (!count) throw Error('The Bible file has no verses.');
  return data;
}
export function validateWorkspace(workspace) {
  if (!plain(workspace) || !Array.isArray(workspace.sessions) || !workspace.sessions.length || workspace.sessions.length > 1000 || !Array.isArray(workspace.songs) || workspace.songs.length > 10000) throw Error('Invalid service backup.');
  if (!plain(workspace.settings) || !/^#[a-f0-9]{6}$/i.test(workspace.settings.background) || !Number.isFinite(workspace.settings.textScale) || workspace.settings.textScale < .6 || workspace.settings.textScale > 1.8) throw Error('Invalid display settings.');
  const songs = new Set();
  for (const song of workspace.songs) {
    if (!plain(song) || !text(song.id, 100) || !song.id || songs.has(song.id) || !text(song.title, 200) || !song.title.trim() || !text(song.lyrics) || !song.lyrics.trim()) throw Error('Invalid or duplicate song.');
    songs.add(song.id);
  }
  const ids = new Set();
  for (const session of workspace.sessions) {
    if (!plain(session) || !text(session.id, 100) || !session.id || ids.has(session.id) || !text(session.name, 200) || !Array.isArray(session.agenda) || session.agenda.length > 10000) throw Error('Invalid service agenda.');
    ids.add(session.id);
    for (const item of session.agenda) {
      if (!plain(item) || !text(item.id, 100) || !text(item.title, 200)) throw Error('Invalid agenda item.');
      if (item.type === 'song') {
        if (!songs.has(item.songId)) throw Error(`Missing song for “${item.title}”. Restore its lyrics before importing this service.`);
      } else if (item.type === 'bible') {
        if (!/^[A-Z0-9_-]{1,24}$/.test(item.code) || !text(item.book, 100) || !Number.isInteger(item.chapter) || item.chapter < 1 || !Number.isInteger(item.start) || item.start < 1 || !Number.isInteger(item.end) || item.end < item.start) throw Error('Invalid scripture agenda item.');
      } else if (item.type === 'placeholder') {
        if (!text(item.sourceType, 64)) throw Error('Invalid unavailable agenda item.');
      } else throw Error('Unsupported agenda item.');
    }
  }
  if (!ids.has(workspace.activeSessionId)) throw Error('The active service is missing.');
  return workspace;
}
export function makeBackup(workspace, bibles) {
  validateWorkspace(workspace);
  const codes = new Set(workspace.sessions.flatMap(session => session.agenda.filter(item => item.type === 'bible').map(item => item.code)));
  const packs = bibles;
  for (const code of codes) if (!packs.some(pack => pack.code === code)) throw Error(`Install ${code} before exporting this service.`);
  for (const service of workspace.sessions) for (const item of service.agenda) {
    if (item.type !== 'bible') continue;
    const data = packs.find(pack => pack.code === item.code).data;
    if (verseSlides(data, item.code, item).length !== item.end - item.start + 1) throw Error(`Missing scripture for “${item.title}”. Check its translation before exporting.`);
  }
  return {app: 'Ginomai', type: 'web_backup', formatVersion: 1, exportedAt: new Date().toISOString(), workspace: clone(workspace), bibles: clone(packs)};
}
export function mergeBackup(current, backup, currentBibles = []) {
  if (backup?.type !== 'web_backup' || backup.formatVersion !== 1 || !Array.isArray(backup.bibles) || backup.bibles.length > 100) throw Error('Choose a Ginomai Web backup. Desktop session files do not include a complete library.');
  const incoming = clone(validateWorkspace(backup.workspace));
  const codes = new Set();
  const bibles = backup.bibles.map(pack => {
    if (!plain(pack) || !/^[A-Z0-9_-]{1,24}$/.test(pack.code) || codes.has(pack.code) || !text(pack.name, 200)) throw Error('Invalid Bible pack.');
    codes.add(pack.code);
    return {code: pack.code, name: pack.name, data: validateBible(pack.data)};
  });
  for (const session of incoming.sessions) for (const item of session.agenda) {
    if (item.type !== 'bible') continue;
    const bible = bibles.find(pack => pack.code === item.code)?.data;
    const slides = bible && verseSlides(bible, item.code, item);
    if (!slides?.length || slides.length !== item.end - item.start + 1) throw Error(`Missing scripture for “${item.title}”. This backup is incomplete.`);
  }
  const result = clone(current);
  for (const bible of bibles) {
    const existing = currentBibles.find(pack => pack.code === bible.code);
    if (!existing || JSON.stringify(existing.data) === JSON.stringify(bible.data)) continue;
    const original = bible.code; bible.code = `IMP_${uid().slice(0, 8).toUpperCase()}`; bible.name += ' (restored)';
    for (const service of incoming.sessions) {
      for (const item of service.agenda) if (item.type === 'bible' && item.code === original) item.code = bible.code;
      if (service.lastDeck?.code === original) service.lastDeck.code = bible.code;
    }
  }
  const mapping = new Map();
  for (const song of incoming.songs) {
    const existing = result.songs.find(item => item.id === song.id);
    if (existing && existing.title === song.title && existing.lyrics === song.lyrics) {mapping.set(song.id, song.id); continue;}
    const id = existing ? uid() : song.id;
    mapping.set(song.id, id); result.songs.push({...song, id});
  }
  for (const session of incoming.sessions) {
    const restored = {...session, id: uid(), name: `${session.name} (restored)`, agenda: session.agenda.map(item => ({...item, id: uid(), ...(item.type === 'song' ? {songId: mapping.get(item.songId)} : {})}))};
    result.sessions.push(restored);
    if (session.id === incoming.activeSessionId) result.activeSessionId = restored.id;
  }
  return {workspace: validateWorkspace(result), bibles};
}
export function livePayload(slide, settings, timestamp = Date.now()) {
  return {slideId: slide?.id || '', text: slide?.text || '', reference: slide?.reference || '', version: slide?.version || '', contentType: slide?.contentType || 'song',
    isBible: slide?.contentType === 'bible', projectorActive: true, livestreamActive: true, mode: 'full', transitionType: 'cut', transitionDuration: 0,
    clear: !slide, blackout: false, textSize: settings.textScale || 1, textAutoScale: true, showSongTitleInDisplay: true,
    bg: settings.background, sanctuaryTheme: {type: 'gradient', bgCss: settings.background, font: 'Arial', dimmer: 0},
    typography: {fontFamily: 'Arial', fontSize: 48, verseWeight: '700', textAlign: 'center'}, _timestamp: timestamp};
}
