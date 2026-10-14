// Portable, allowlisted data only. No credentials, paths, settings, or live state.
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const copy = value => structuredClone(value);
const id = () => crypto.randomUUID();
const fail = () => {throw Error('Invalid or unsupported Ginomai cloud backup.');};
function str(value, max = 200000, empty = true) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) fail();
  return value;
}
function array(value, max) {if (!Array.isArray(value) || value.length > max) fail(); return value;}
function integer(value) {if (!Number.isInteger(value) || value < 1 || value > 1000) fail(); return value;}
function songRecord(song) {
  const lyrics = str(song.lyrics, 200000, false);
  const stanzas = song.stanzas ? array(song.stanzas, 2000).map(s => ({type: str(s.type, 100), text: str(s.text)})) : lyrics.split(/\n\s*\n/).map((text, i) => ({type: `Verse ${i + 1}`, text}));
  if (stanzas.map(s => s.text).join('\n\n') !== lyrics) fail();
  return {id: str(song.id, 100, false), title: str(song.title, 200, false), author: str(song.author || '', 200), lyrics, stanzas};
}
function itemRecord(item) {
  const base = {id: str(item.id, 100, false), title: str(item.title, 200)};
  if (item.type === 'song') return {...base, type: 'song', songId: str(item.songId, 100, false)};
  if (item.type === 'bible') {
    const code = str(item.code, 24, false); if (!/^[A-Z0-9_-]+$/.test(code)) fail();
    const start = integer(item.start), end = integer(item.end); if (end < start || end - start > 299) fail();
    return {...base, type: 'bible', code, book: str(item.book, 100, false), chapter: integer(item.chapter), start, end, wholeChapter: item.wholeChapter === true};
  }
  if (item.type === 'placeholder') return {...base, type: 'placeholder', sourceType: str(item.sourceType, 64, false)};
  fail();
}
export function validateCloudBackup(input) {
  if (!input || input.app !== 'Ginomai' || input.type !== 'cloud_backup' || input.formatVersion !== 1 || !['desktop', 'web'].includes(input.sourcePlatform) || !Number.isFinite(Date.parse(input.createdAt))) fail();
  const songs = array(input.songs, 10000).map(songRecord), ids = new Set(songs.map(s => s.id));
  if (ids.size !== songs.length) fail();
  const sessions = array(input.sessions, 1000).map(s => ({id: str(s.id, 100, false), name: str(s.name, 200, false), notes: str(s.notes || ''),
    agenda: array(s.agenda, 10000).map(itemRecord), songMedley: array(s.songMedley || [], 10000).map(value => str(value, 100, false)),
    bibleMedley: array(s.bibleMedley || [], 10000).map(value => value === null ? null : itemRecord(value))}));
  if (!sessions.length || new Set(sessions.map(s => s.id)).size !== sessions.length) fail();
  for (const s of sessions) {
    if (new Set(s.agenda.map(a => a.id)).size !== s.agenda.length) fail();
    for (const a of [...s.agenda, ...s.bibleMedley].filter(Boolean)) if (a.type === 'song' && !ids.has(a.songId)) throw Error(`Missing song for “${a.title}”.`);
    if (s.songMedley.some(value => !ids.has(value))) throw Error('Missing medley song.');
  }
  const result = {app: 'Ginomai', type: 'cloud_backup', formatVersion: 1, sourcePlatform: input.sourcePlatform, createdAt: input.createdAt, songs, sessions};
  if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_BACKUP_BYTES) throw Error('Cloud backups must be 20 MiB or smaller.');
  return result;
}
function portableSong(song) {
  const lyrics = typeof song.lyrics === 'string' ? song.lyrics : (song.stanzas || []).map(s => typeof s === 'string' ? s : s.text).join('\n\n');
  const stanzas = song.stanzas?.every(s => typeof s === 'object') && song.stanzas.map(s => s.text).join('\n\n') === lyrics ? song.stanzas : undefined;
  return songRecord({id: String(song.id), title: song.title, author: song.author, lyrics, stanzas});
}
function desktopItem(item, i) {
  const base = {id: `entry-${i}`, title: item.title || item.book || 'Untitled item'};
  if (item.type === 'song') return {...base, type: 'song', songId: String(item.id)};
  if (item.type === 'bible') return {...base, type: 'bible', code: item.version || 'KJV', book: item.book || item.id, chapter: Number(item.chapter) || 1,
    start: item.cloudStart || 1, end: item.cloudEnd || 1, wholeChapter: !item.cloudStart || item.cloudWholeChapter === true};
  return {...base, type: 'placeholder', sourceType: item.sourceType || item.type || 'custom'};
}
export function makeCloudBackup(platform, workspace, songs = []) {
  const desktop = platform === 'desktop';
  const sessions = workspace.sessions.map(s => ({id: String(s.id), name: s.name, notes: s.notes || '',
    agenda: desktop ? (s.agendaItems || []).map(desktopItem) : s.agenda,
    songMedley: desktop ? (s.medleySongIds || []).map(String) : s.cloudSongMedley || [],
    bibleMedley: desktop ? (s.medleyBibleSlots || []).map((a, i) => a ? desktopItem({...a, type: 'bible'}, i) : null) : s.cloudBibleMedley || []}));
  const records = (desktop ? songs : workspace.songs).map(portableSong);
  return validateCloudBackup({app: 'Ginomai', type: 'cloud_backup', formatVersion: 1, sourcePlatform: platform, createdAt: new Date().toISOString(), songs: records, sessions});
}
const fingerprint = song => JSON.stringify([song.title, song.author || '', song.lyrics, song.stanzas]);
export function mergeCloudBackup(platform, current, existingSongs, input) {
  const incoming = validateCloudBackup(input), desktop = platform === 'desktop', result = copy(current);
  const originals = desktop ? existingSongs : current.songs;
  const known = originals.map(portableSong), mapping = new Map(), additions = [];
  for (const song of incoming.songs) {
    const match = known.find(s => fingerprint(s) === fingerprint(song));
    // Incoming IDs are references, not trusted DOM/inline-handler identifiers.
    const nextId = match?.id || id();
    mapping.set(song.id, nextId);
    if (!match) {const next = {...song, id: nextId}; known.push(next); additions.push(desktop ? {id: nextId, title: next.title, author: next.author, songbook: 'Cloud restore', stanzas: next.stanzas} : next);}
  }
  const desktopAgenda = a => a.type === 'song' ? {type: 'song', id: mapping.get(a.songId), title: a.title} : a.type === 'bible' ?
    {type: 'bible', id: a.book, book: a.book, chapter: a.chapter, version: a.code, title: a.title, cloudStart: a.start, cloudEnd: a.end, cloudWholeChapter: a.wholeChapter, meta: a.wholeChapter ? `${a.code} Translation` : `${a.code} · Opens chapter on desktop`} :
    {type: 'cloud-placeholder', id: id(), title: a.title, sourceType: a.sourceType, meta: `${a.sourceType} · Unavailable after cloud restore`};
  for (const s of incoming.sessions) {
    const agenda = s.agenda.map(a => ({...a, id: id(), ...(a.type === 'song' ? {songId: mapping.get(a.songId)} : {})}));
    result.sessions.push(desktop ? {id: id(), name: `${s.name} (restored)`, notes: s.notes, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: '1.0', app: 'Ginomai',
      agendaItems: s.agenda.map(desktopAgenda), activeSongId: null, activeBibleBook: '', activeBibleChapter: 1,
      medleySongIds: s.songMedley.map(value => mapping.get(value)), medleyBibleSlots: s.bibleMedley.map(a => a ? desktopAgenda(a) : null), isMedleyMode: false} :
      {id: id(), name: `${s.name} (restored)`, notes: s.notes, agenda, updatedAt: Date.now(), cloudSongMedley: s.songMedley.map(value => mapping.get(value)), cloudBibleMedley: s.bibleMedley});
  }
  if (!desktop) result.songs.push(...additions);
  if (result.sessions.length > 1000 || originals.length + additions.length > 10000) throw Error('Restoring would exceed the local library limit.');
  return {workspace: result, additions};
}
export function cloudBackupNotices(input, availableCodes = [], platform = 'web') {
  const backup = validateCloudBackup(input), notices = new Set();
  for (const s of backup.sessions) {
    for (const item of [...s.agenda, ...s.bibleMedley].filter(Boolean)) {
      if (item.type === 'placeholder') notices.add(`${item.title}: ${item.sourceType} will be kept as an unavailable placeholder. Media files are not included.`);
      if (item.type === 'bible' && !availableCodes.includes(item.code)) notices.add(`Install ${item.code} locally to use its scripture entries.`);
      if (item.type === 'bible' && platform === 'desktop' && !item.wholeChapter) notices.add('Scripture verse ranges are preserved, but desktop entries open their chapter.');
    }
    if (platform === 'web' && (s.songMedley.length || s.bibleMedley.length)) notices.add('Medley selections are preserved for desktop; the web version does not display medleys.');
  }
  return [...notices];
}
