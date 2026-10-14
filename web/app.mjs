import {CHANNEL, LIVE_KEY, uid, clone, newWorkspace, newSession, songSlides, parseReference, verseSlides, validateBible, validateWorkspace, makeBackup, mergeBackup, livePayload} from './model.mjs';
import {readWorkspace, readBibles, writeWorkspace} from './store.mjs';
import {CloudClient} from './js/cloud-client.mjs';
import {mountAccountPanel} from './js/cloud-account-panel.mjs';
import {makeCloudBackup, mergeCloudBackup, cloudBackupNotices} from './js/cloud-backup.mjs';
import {mountBackupControls} from './js/cloud-backups-service.mjs';
import {mountAnalytics} from './js/cloud-analytics.mjs';

const $ = id => document.getElementById(id);
let workspace, bibles = [], books = [], libraryType = 'songs', deck = [], source = null, selected = -1;
let live = null, held = false, saveError = false, revision = 0, saveTimer, saveQueue = Promise.resolve(), searchGeneration = 0;
let activeRow = null, selectedCard = null, liveCard = null, outputWindow, dialogFocus, toastTimer, workerRegistration;
const peers = new Map();
let channel, installingKjv;
try {channel = new BroadcastChannel(CHANNEL);} catch {}
const session = () => workspace.sessions.find(item => item.id === workspace.activeSessionId);
const pack = code => bibles.find(item => item.code === code);
const currentBible = () => pack($('version').value);
const icon = (text, label, callback) => {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.setAttribute('aria-label', label); button.title = label;
  button.addEventListener('click', event => {event.stopPropagation(); callback();}); return button;
};
function message(text) {
  $('toast').textContent = text; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => {$('toast').hidden = true;}, 5000);
}
function empty(container, title, description) {
  const node = document.createElement('div'); node.className = 'empty';
  const heading = document.createElement('strong'); heading.textContent = title;
  const body = document.createElement('p'); body.textContent = description; node.append(heading, body); container.append(node);
}
function listRow(title, subtitle, action, actions = []) {
  const row = document.createElement('div'); row.className = 'list-row';
  const button = document.createElement('button'); button.className = 'row-main'; button.type = 'button';
  const name = document.createElement('strong'); name.textContent = title;
  const detail = document.createElement('small'); detail.textContent = subtitle; button.append(name, detail); button.onclick = () => action(row);
  const controls = document.createElement('div'); controls.className = 'row-actions'; controls.append(...actions); row.append(button, controls); return row;
}
function panel(name) {
  $('app').dataset.panel = name;
  for (const button of document.querySelectorAll('.mobile-nav button')) {
    if (button.dataset.panel === name) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  }
}
function reportSave(error = null) {
  saveError = Boolean(error); $('save-status').textContent = error ? 'Not saved' : 'Saved on this browser';
  $('retry-save').hidden = !error; $('save-error').hidden = !error;
  $('save-error').textContent = error ? `${error.message || 'Changes could not be saved.'} Retry or export a backup before closing.` : '';
}
function queueSave(snapshot, additions = []) {
  const task = saveQueue.catch(() => {}).then(() => writeWorkspace(snapshot, additions));
  saveQueue = task; return task;
}
function scheduleSave() {
  revision++; session().updatedAt = Date.now(); $('save-status').textContent = 'Saving…';
  clearTimeout(saveTimer); saveTimer = setTimeout(() => {flushSave().catch(() => {});}, 250);
}
async function flushSave() {
  clearTimeout(saveTimer); saveTimer = null; const savingRevision = revision;
  try {await queueSave(clone(workspace)); if (savingRevision === revision) reportSave();}
  catch (error) {reportSave(error); throw error;}
}
function renderServices() {
  $('service').replaceChildren(...workspace.sessions.map(item => new Option(item.name, item.id)));
  $('service').value = workspace.activeSessionId;
}
function markActive(row) {activeRow?.classList.remove('active'); activeRow = row; row?.classList.add('active');}
function setDeck(slides, descriptor, row = null) {
  source = descriptor; deck = slides; selected = slides.length ? 0 : -1; selectedCard = liveCard = null;
  markActive(row); session().lastDeck = clone(descriptor);
  $('deck-heading').textContent = descriptor.title; $('deck-hint').textContent = `${slides.length} slide${slides.length === 1 ? '' : 's'} · Select to preview, then Take live.`;
  $('edit-song').hidden = descriptor.type !== 'song'; $('add-agenda').disabled = !slides.length;
  const fragment = document.createDocumentFragment();
  slides.forEach((slide, index) => {
    const card = document.createElement('button'); card.type = 'button'; card.className = 'slide-card'; card.dataset.slideId = slide.id;
    const label = document.createElement('span'); label.className = 'slide-label'; label.textContent = `${index + 1} / ${slides.length} · ${slide.reference}`;
    const body = document.createElement('span'); body.textContent = slide.text; card.append(label, body); card.onclick = () => cue(index, card);
    card.classList.toggle('live', slide.id === live?.slideId && !live.clear && !live.blackout);
    if (card.classList.contains('live')) liveCard = card;
    fragment.append(card);
  });
  $('slide-list').replaceChildren(fragment);
  if (!slides.length) empty($('slide-list'), 'No verses found', 'Check the passage or choose another chapter.');
  cue(selected); scheduleSave(); panel('slides');
}
function cue(index, card = $('slide-list').children[index]) {
  if (index < 0 || !deck[index]) {selected = -1; $('take-live').disabled = true; return;}
  selectedCard?.classList.remove('selected'); selectedCard?.setAttribute('aria-pressed', 'false');
  selected = index; selectedCard = card; card?.classList.add('selected'); card?.setAttribute('aria-pressed', 'true');
  $('cue-reference').textContent = deck[index].reference; $('cue-text').textContent = deck[index].text;
  $('take-live').disabled = held; $('previous').disabled = index === 0; $('next').disabled = index === deck.length - 1;
}
function publish(payload) {
  live = payload;
  channel?.postMessage({type: 'LIVE', payload});
  $('preview').contentWindow?.postMessage({type: 'GINOMAI_WEB_LIVE', payload}, location.origin);
  if (outputWindow && !outputWindow.closed) outputWindow.postMessage({type: 'GINOMAI_WEB_LIVE', payload}, location.origin);
  liveCard?.classList.remove('live'); liveCard = null;
  if (!payload.clear && !payload.blackout) {
    const index = deck.findIndex(slide => slide.id === payload.slideId);
    const card = $('slide-list').children[index]; if (index >= 0 && card) {liveCard = card; card.classList.add('live');}
  }
  $('live-status').textContent = payload.blackout ? 'Blackout' : payload.clear ? 'Clear' : 'Live';
  updateOutputStatus();
  // Projection is sent first. Recovery storage never blocks the click path.
  setTimeout(() => {
    try {localStorage.setItem(LIVE_KEY, JSON.stringify(live));} catch {message('Live output is working, but its recovery snapshot could not be saved.');}
  }, 0);
}
function take() {
  if (held || !deck[selected]) return;
  publish(livePayload(deck[selected], workspace.settings, Math.max(Date.now(), (live?._timestamp || 0) + 1)));
}
function clear(blackout = false) {
  const payload = livePayload(null, workspace.settings, Math.max(Date.now(), (live?._timestamp || 0) + 1));
  payload.blackout = blackout; publish(payload);
}
function loadSong(song, row) {setDeck(songSlides(song), {type: 'song', songId: song.id, title: song.title}, row);}
function loadPassage(descriptor, row) {
  const bible = pack(descriptor.code);
  if (!bible) {message(`Install ${descriptor.code} to load this passage.`); return;}
  const slides = verseSlides(bible.data, bible.code, descriptor.wholeChapter ? {...descriptor, start: 1, end: Infinity} : descriptor);
  setDeck(slides, {...descriptor, type: 'bible', start: slides[0]?.id.split(':').at(-1) ? Number(slides[0].id.split(':').at(-1)) : descriptor.start, end: Number(slides.at(-1)?.id.split(':').at(-1) || descriptor.end)}, row);
}
function addAgenda(descriptor) {
  if (!descriptor) return;
  session().agenda.push({...clone(descriptor), id: uid()}); renderAgenda(); scheduleSave(); message('Added to the service agenda.');
}
function renderAgenda() {
  const items = session().agenda; $('agenda-count').textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
  const fragment = document.createDocumentFragment();
  items.forEach((item, index) => {
    const move = direction => {
      const target = index + direction; if (target < 0 || target >= items.length) return;
      [items[index], items[target]] = [items[target], items[index]]; renderAgenda(); scheduleSave();
      $('agenda-list').children[target]?.querySelector('.row-main')?.focus();
    };
    const up = icon('↑', `Move ${item.title} up`, () => move(-1)); up.disabled = index === 0;
    const down = icon('↓', `Move ${item.title} down`, () => move(1)); down.disabled = index === items.length - 1;
    const remove = icon('×', `Remove ${item.title} from agenda`, () => {items.splice(index, 1); renderAgenda(); scheduleSave();});
    fragment.append(listRow(item.title, item.type === 'song' ? 'Song' : item.type === 'placeholder' ? `${item.sourceType} · Unavailable on this device` : item.code, row => {
      if (item.type === 'placeholder') {message('This entry is preserved, but its feature or media is unavailable on this device.'); return;}
      if (item.type === 'song') {
        const song = workspace.songs.find(song => song.id === item.songId); if (song) loadSong(song, row); else message('This song is missing from the library.');
      } else loadPassage(item, row);
    }, [up, down, remove]));
  });
  $('agenda-list').replaceChildren(fragment);
  if (!items.length) empty($('agenda-list'), 'Build your service', 'Load a song or passage, then choose Add to agenda. Use the arrows here to change the order.');
}
function renderLibrary() {
  const generation = ++searchGeneration; const query = $('search').value.trim(); const container = $('library-list');
  container.replaceChildren(); activeRow = null;
  if (libraryType === 'songs') {
    const matching = workspace.songs.filter(song => `${song.title}\n${song.lyrics}`.toLowerCase().includes(query.toLowerCase()));
    for (const song of matching) {
      const descriptor = {type: 'song', songId: song.id, title: song.title};
      container.append(listRow(song.title, `${songSlides(song).length} slides`, row => loadSong(song, row), [icon('+', `Add ${song.title} to agenda`, () => addAgenda(descriptor))]));
    }
    if (!matching.length) empty(container, workspace.songs.length ? 'No matching songs' : 'Your song library', workspace.songs.length ? 'Try a different title or lyric.' : 'Choose New song and paste your lyrics. Separate verses and choruses with a blank line.');
    return;
  }
  const bible = currentBible();
  if (!bible) {empty(container, 'Scripture, ready when you are', 'Download KJV once or import your Bible JSON. Installed translations stay on this browser.'); const button = icon('Download KJV', 'Download KJV', () => ensureKjv().then(renderBibleControls).catch(error => message(error.message))); container.append(button); return;}
  if (!query) {empty(container, 'Find a passage', 'Enter John 3:16, Ps2,5, or words from a verse. You can also choose a book and load its chapter.'); return;}
  const reference = parseReference(query, books);
  if (reference) {
    const slides = verseSlides(bible.data, bible.code, reference);
    if (!slides.length || slides.length !== reference.end - reference.start + 1) {empty(container, 'Passage not found', 'Check the book, chapter, and verse numbers.'); return;}
    const title = `${reference.book} ${reference.chapter}:${reference.start}${reference.end === reference.start ? '' : '-' + reference.end}`;
    const descriptor = {...reference, code: bible.code, type: 'bible', title};
    container.append(listRow(title, slides.map(slide => slide.text).join(' '), row => loadPassage(descriptor, row), [icon('+', `Add ${title} to agenda`, () => addAgenda(descriptor))])); return;
  }
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const search = async () => {
    let examined = 0, found = 0;
    for (const [book, chapters] of Object.entries(bible.data)) for (const [chapter, verses] of Object.entries(chapters)) for (const verse of verses) {
      if (generation !== searchGeneration) return;
      if (++examined % 1000 === 0) {await new Promise(resolve => setTimeout(resolve, 0)); if (generation !== searchGeneration) return;}
      if (!tokens.every(token => verse.text.toLowerCase().includes(token))) continue;
      const title = `${book} ${chapter}:${verse.verse}`;
      const descriptor = {type: 'bible', code: bible.code, book, chapter: Number(chapter), start: verse.verse, end: verse.verse, title};
      container.append(listRow(title, verse.text, row => loadPassage(descriptor, row), [icon('+', `Add ${title} to agenda`, () => addAgenda(descriptor))]));
      if (++found >= 50) return;
    }
    if (!found && generation === searchGeneration) empty(container, 'No matching verses', 'Try fewer words or enter a scripture reference.');
  }; search().catch(error => message(error.message));
}
function renderBibleControls() {
  const previous = $('version').value; $('version').replaceChildren(...bibles.map(bible => new Option(bible.name, bible.code)));
  $('version').value = bibles.some(bible => bible.code === previous) ? previous : bibles[0]?.code || '';
  const bible = currentBible();
  const names = bible ? [...books.map(book => book.name).filter(name => bible.data[name]), ...Object.keys(bible.data).filter(name => !books.some(book => book.name === name))] : [];
  $('book').replaceChildren(...names.map(name => new Option(name, name)));
  if (names.includes('John')) $('book').value = 'John'; renderChapters();
  $('bible-status').textContent = bible ? `${bible.code} is saved on this browser.` : 'No translation installed yet.';
  $('load-chapter').disabled = !bible; renderLibrary();
}
function renderChapters() {
  const chapters = Object.keys(currentBible()?.data[$('book').value] || {});
  $('chapter').replaceChildren(...chapters.map(chapter => new Option(chapter, chapter)));
}
function ensureKjv() {
  if (pack('KJV')) return Promise.resolve(pack('KJV'));
  return installingKjv ||= downloadKjv().finally(() => {installingKjv = null;});
}
async function downloadKjv() {
  if (pack('KJV')) return pack('KJV');
  $('bible-status').textContent = 'Downloading KJV…';
  const response = await fetch(new URL('bibles/KJV.json', location.href));
  if (!response.ok) throw Error('Connect to download KJV, or import a Bible JSON file.');
  const bible = {code: 'KJV', name: 'King James Version', data: validateBible(await response.json())};
  await queueSave(clone(workspace), [bible]); bibles.push(bible); $('bible-status').textContent = 'KJV is saved on this browser.'; return bible;
}
function openDialog(title, build) {
  dialogFocus = document.activeElement; $('dialog-title').textContent = title; $('dialog-body').replaceChildren(); build($('dialog-body'));
  $('dialog-shield').hidden = false; $('app').inert = true;
  ($('dialog-body').querySelector('input,textarea,button,select') || $('close-dialog')).focus();
}
function closeDialog() {$('dialog-shield').hidden = true; $('app').inert = false; dialogFocus?.focus();}
function formError(error) {
  let node = $('dialog-body').querySelector('.dialog-error'); if (!node) {node = document.createElement('p'); node.className = 'dialog-error'; node.setAttribute('role', 'alert'); $('dialog-body').append(node);}
  node.textContent = error.message;
}
function field(body, label, tag, value = '') {
  const wrapper = document.createElement('label'); wrapper.textContent = label;
  const control = document.createElement(tag); control.value = value; if (tag === 'textarea') control.rows = 12;
  wrapper.append(control); body.append(wrapper); return control;
}
function editSong(song = null) {
  openDialog(song ? 'Edit song' : 'New song', body => {
    const title = field(body, 'Song title', 'input', song?.title || ''); title.maxLength = 200;
    const lyrics = field(body, 'Lyrics — separate sections with a blank line', 'textarea', song?.lyrics || ''); lyrics.maxLength = 200000;
    const save = icon('Save song', 'Save song', () => {
      if (!title.value.trim() || !lyrics.value.trim()) {formError(Error('Enter a title and some lyrics.')); return;}
      const record = {id: song?.id || uid(), title: title.value.trim(), lyrics: lyrics.value.replace(/\r\n/g, '\n').trim()};
      const index = workspace.songs.findIndex(item => item.id === record.id); if (index < 0) workspace.songs.push(record); else workspace.songs[index] = record;
      for (const service of workspace.sessions) for (const item of service.agenda) if (item.songId === record.id) item.title = record.title;
      closeDialog(); renderLibrary(); renderAgenda(); loadSong(record); scheduleSave();
    }); save.className = 'primary'; body.append(save);
    if (song) {
      const remove = icon('Remove song', 'Remove song', () => {
        const used = workspace.sessions.some(service => service.agenda.some(item => item.songId === song.id));
        if (used) {formError(Error('Remove this song from service agendas before deleting it.')); return;}
        workspace.songs = workspace.songs.filter(item => item.id !== song.id); closeDialog(); renderLibrary();
        if (source?.songId === song.id) resetDeck();
        scheduleSave();
      }); body.append(remove);
    }
  });
}
function download(filename, object) {
  const link = document.createElement('a'); const url = URL.createObjectURL(new Blob([JSON.stringify(object)], {type: 'application/json'}));
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function exportBackup() {
  try {download('Ginomai-services.ginomai', makeBackup(workspace, bibles)); message('Backup includes your services, songs, and the scripture they use.');}
  catch (error) {message(error.message);}
}
async function restoreBackup(file) {
  if (!file) return;
  if (file.size > 80 * 1048576) throw Error('Choose a backup smaller than 80 MB.');
  const restored = mergeBackup(workspace, JSON.parse(await file.text()), bibles);
  clearTimeout(saveTimer); saveTimer = null; await queueSave(restored.workspace, restored.bibles);
  workspace = restored.workspace;
  for (const bible of restored.bibles) {const index = bibles.findIndex(item => item.code === bible.code); if (index < 0) bibles.push(bible); else bibles[index] = bible;}
  reportSave(); renderServices(); renderAgenda(); renderBibleControls(); resetDeck(); closeDialog(); message('Backup restored. Live output was not changed.');
}
function resetDeck() {
  source = null; deck = []; selected = -1; selectedCard = liveCard = null;
  $('deck-heading').textContent = 'Your slides'; $('slide-list').replaceChildren();
  empty($('slide-list'), 'Ready for your service', 'Choose a song or scripture passage from the library.');
  for (const id of ['take-live', 'previous', 'next', 'add-agenda']) $(id).disabled = true;
  $('edit-song').hidden = true; $('cue-reference').textContent = 'Nothing selected'; $('cue-text').textContent = '';
}
function moreOptions() {
  openDialog('Backup & display', body => {
    body.append(icon('Account and analytics', 'Account and analytics', () => {closeDialog(); window.openGinomaiAccount?.();}));
    const note = document.createElement('p'); note.className = 'muted'; note.textContent = 'Your library is saved on this browser. Export a backup to move it to another device. No account is required.'; body.append(note);
    body.append(icon('Export complete backup', 'Export complete backup', exportBackup), icon('Restore backup', 'Restore backup', () => $('backup-file').click()), icon('Import songs JSON', 'Import songs JSON', () => $('songs-file').click()), icon('Prepare this browser offline', 'Prepare this browser offline', prepareOffline));
    const output = document.createElement('p'); output.className = 'muted'; output.textContent = 'For projection, open the output on a computer connected to your projector, move its window to that screen, and enter fullscreen. A phone controls only its own browser here; pairing a separate TV is not available in this release.'; body.append(output);
    body.append(icon('Open projector window', 'Open projector window', openOutput));
    const rename = field(body, 'Service name', 'input', session().name); rename.maxLength = 200;
    body.append(icon('Rename service', 'Rename service', () => {if (!rename.value.trim()) return; session().name = rename.value.trim(); renderServices(); scheduleSave(); closeDialog();}));
  });
}
function openOutput() {
  const url = new URL('display.html?target=sanctuary', location.href);
  outputWindow = window.open(url.href, 'ginomai-web-projector', 'width=1280,height=720');
  if (!outputWindow) {message('Allow this site to open a projector window, then try again.'); return;}
  message('Move the output window onto the projector screen and enter fullscreen.');
}
function updateOutputStatus() {
  const active = [...peers.values()].filter(peer => !peer.preview && Date.now() - peer.seen < 12000);
  const received = active.filter(peer => peer.timestamp >= (live?._timestamp || 0));
  $('output-status').textContent = !active.length ? 'No projector window connected' : received.length === active.length ? `${active.length} output window connected · latest state received` : 'Output connected · waiting for the latest state';
}
async function cacheStatus() {
  const registration = workerRegistration || await navigator.serviceWorker.getRegistration(new URL('./', location.href).href);
  if (!registration?.active) return {ready: false};
  return new Promise((resolve, reject) => {
    const port = new MessageChannel(); const timeout = setTimeout(() => {port.port1.close(); reject(Error('Offline preparation did not respond. Reload and retry.'));}, 10000);
    port.port1.onmessage = event => {clearTimeout(timeout); port.port1.close(); resolve(event.data);};
    registration.active.postMessage({type: 'CACHE_STATUS'}, [port.port2]);
  });
}
async function prepareOffline() {
  $('offline-status').textContent = 'Preparing application and scripture…';
  try {
    await ensureKjv(); renderBibleControls(); await flushSave();
    if (!('serviceWorker' in navigator)) throw Error('This browser does not support offline application loading. Export a backup for another browser.');
    workerRegistration ||= await navigator.serviceWorker.register(new URL('sw.js', location.href));
    await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(Error('Offline application files are still downloading. Try again shortly.')), 15000))]);
    const status = await cacheStatus(); if (!status.ready) throw Error('Application files are not all cached yet. Keep this page open online and retry.');
    // Validation includes every Bible required by every saved service.
    makeBackup(workspace, bibles);
    const persistent = await navigator.storage?.persist?.().catch(() => false);
    $('offline-status').textContent = `Ready offline on this browser. ${persistent ? 'Persistent storage granted.' : 'Keep an exported backup; browser data can be cleared.'}`;
    message('Application, songs, and prepared scripture are available offline.');
  } catch (error) {$('offline-status').textContent = error.message; message(error.message);}
}
async function importBible(file) {
  if (!file) return; if (file.size > 32 * 1048576) throw Error('Choose a Bible JSON smaller than 32 MB.');
  const json = JSON.parse(await file.text());
  const baseCode = file.name.replace(/\.json$/i, '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 16) || 'IMPORTED';
  const code = pack(baseCode) ? `IMP_${uid().slice(0, 8).toUpperCase()}` : baseCode;
  const bible = {code, name: typeof json.name === 'string' ? json.name.slice(0, 200) : code, data: validateBible(json.data || json)};
  await queueSave(clone(workspace), [bible]); bibles.push(bible); renderBibleControls(); $('version').value = code; renderBibleControls(); message(`${bible.name} imported and saved.`);
}
async function importSongs(file) {
  if (!file) return; if (file.size > 16 * 1048576) throw Error('Choose a songs JSON smaller than 16 MB.');
  const json = JSON.parse(await file.text()); const records = Array.isArray(json) ? json : json.songs;
  if (!Array.isArray(records) || !records.length || records.length > 10000) throw Error('Choose a JSON array of songs with title and lyrics fields.');
  const songs = records.map(song => ({id: uid(), title: song.title, lyrics: song.lyrics || song.stanzas?.map(stanza => typeof stanza === 'string' ? stanza : stanza.lines?.join('\n')).join('\n\n')}));
  const next = clone(workspace); next.songs.push(...songs); validateWorkspace(next);
  clearTimeout(saveTimer); saveTimer = null; await queueSave(next); workspace = next; reportSave(); renderLibrary(); message(`Imported ${songs.length} songs.`);
}
function bind() {
  document.querySelectorAll('.mobile-nav button').forEach(button => {button.onclick = () => panel(button.dataset.panel);});
  $('songs-tab').onclick = () => switchLibrary('songs'); $('bible-tab').onclick = () => switchLibrary('bible');
  let searchTimer; $('search').oninput = () => {searchGeneration++; clearTimeout(searchTimer); searchTimer = setTimeout(renderLibrary, 140);};
  $('version').onchange = renderBibleControls; $('book').onchange = renderChapters;
  $('load-chapter').onclick = () => {
    const bible = currentBible(), book = $('book').value, chapter = Number($('chapter').value); if (!bible) return;
    const verses = bible.data[book][chapter]; loadPassage({type: 'bible', code: bible.code, book, chapter, start: verses[0].verse, end: verses.at(-1).verse, title: `${book} ${chapter}`});
  };
  $('new-song').onclick = () => editSong(); $('edit-song').onclick = () => editSong(workspace.songs.find(song => song.id === source?.songId));
  $('add-agenda').onclick = () => addAgenda(source); $('take-live').onclick = take;
  $('previous').onclick = () => {cue(selected - 1); selectedCard?.scrollIntoView({block: 'nearest'});}; $('next').onclick = () => {cue(selected + 1); selectedCard?.scrollIntoView({block: 'nearest'});};
  $('clear').onclick = () => clear(); $('blackout').onclick = () => clear(true);
  $('hold').onclick = () => {held = !held; $('hold').setAttribute('aria-pressed', String(held)); $('take-live').disabled = held || selected < 0;};
  $('background').oninput = () => {workspace.settings.background = $('background').value; appearanceChanged();};
  $('text-scale').oninput = () => {workspace.settings.textScale = Number($('text-scale').value); appearanceChanged();};
  $('more').onclick = moreOptions; $('prepare').onclick = prepareOffline; $('open-output').onclick = openOutput;
  $('retry-save').onclick = () => flushSave().catch(() => {});
  $('close-dialog').onclick = closeDialog;
  $('dialog-shield').onclick = event => {event.preventDefault(); event.stopPropagation(); if (event.target === $('dialog-shield')) closeDialog();};
  $('service').onchange = () => {
    if (saveError) {$('service').value = workspace.activeSessionId; message('Retry saving or export a backup before switching services.'); return;}
    workspace.activeSessionId = $('service').value; renderAgenda(); resetDeck(); scheduleSave();
  };
  $('new-service').onclick = () => {
    if (saveError) {message('Retry saving or export a backup before creating another service.'); return;}
    openDialog('New service', body => {
      const name = field(body, 'Service name', 'input', 'Sunday Service'); name.maxLength = 200;
      const button = icon('Create service', 'Create service', () => {if (!name.value.trim()) return; const item = newSession(name.value.trim()); workspace.sessions.push(item); workspace.activeSessionId = item.id; closeDialog(); renderServices(); renderAgenda(); resetDeck(); scheduleSave();}); button.className = 'primary'; body.append(button);
    });
  };
  $('import-bible').onclick = () => $('bible-file').click();
  for (const [id, action] of [['backup-file', restoreBackup], ['bible-file', importBible], ['songs-file', importSongs]]) {
    $(id).onchange = async () => {try {await action($(id).files[0]);} catch (error) {message(error.message); if (!$('dialog-shield').hidden) formError(error);} finally {$(id).value = '';}};
  }
  document.addEventListener('keydown', event => {
    if (!$('dialog-shield').hidden) {
      if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); closeDialog(); return;}
      if (event.key === 'Tab') {
        const controls = [...$('dialog').querySelectorAll('button,input,textarea,select')].filter(element => !element.disabled && !element.hidden);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
        else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
      } return;
    }
    if (event.target.closest('input,textarea,select') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'ArrowRight' && selected < deck.length - 1) {event.preventDefault(); cue(selected + 1);}
    if (event.key === 'ArrowLeft' && selected > 0) {event.preventDefault(); cue(selected - 1);}
    if (event.key === 'Enter' && event.target === document.body) {event.preventDefault(); take();}
  });
  $('preview').onload = () => {if (live) $('preview').contentWindow.postMessage({type: 'GINOMAI_WEB_LIVE', payload: live}, location.origin);};
  addEventListener('beforeunload', event => {if (saveError || saveTimer) {event.preventDefault(); event.returnValue = '';}});
  addEventListener('pagehide', () => {channel?.close();});
}
function appearanceChanged() {
  if (live) publish({...live, ...livePayload(null, workspace.settings), slideId: live.slideId, text: live.text, reference: live.reference, version: live.version,
    contentType: live.contentType, isBible: live.isBible, clear: live.clear, blackout: live.blackout, _timestamp: Math.max(Date.now(), live._timestamp + 1)});
  scheduleSave();
}
function switchLibrary(type) {
  libraryType = type; $('songs-tab').setAttribute('aria-selected', String(type === 'songs')); $('bible-tab').setAttribute('aria-selected', String(type === 'bible'));
  $('bible-controls').hidden = type !== 'bible'; $('search').value = ''; $('search').placeholder = type === 'bible' ? 'John 3:16 or words from a verse…' : 'Find a song…';
  if (type === 'bible') renderBibleControls(); else renderLibrary();
}
if (channel) channel.onmessage = event => {
  if (event.data?.type === 'REQUEST_STATE' && live) channel.postMessage({type: 'LIVE', payload: live});
  if (event.data?.type === 'OUTPUT_ACK') {peers.set(event.data.id, {...event.data, seen: Date.now()}); updateOutputStatus();}
  if (event.data?.type === 'OUTPUT_CLOSED') {peers.delete(event.data.id); updateOutputStatus();}
};
async function boot() {
  try {
    workspace = validateWorkspace(await readWorkspace() || newWorkspace()); bibles = await readBibles();
    const response = await fetch(new URL('bible-books.json', location.href)); if (!response.ok) throw Error('Bible book metadata is unavailable.'); books = await response.json();
    await writeWorkspace(workspace); reportSave(); renderServices(); renderAgenda(); renderLibrary(); resetDeck(); bind();
    const client = new CloudClient(window.GINOMAI_CLOUD_CONFIG);
    const adapter = {
      async capture() {await flushSave(); return makeCloudBackup('web', workspace);},
      notices: backup => cloudBackupNotices(backup, bibles.map(b => b.code), 'web'),
      async restore(backup) {
        await flushSave();
        const merged = mergeCloudBackup('web', workspace, [], backup).workspace;
        validateWorkspace(merged); await queueSave(merged); workspace = merged; reportSave(); renderServices();
        return `${backup.sessions.length} sessions restored. Select one from the service menu when ready.`;
      }
    };
    const account = mountAccountPanel(client, adapter);
    window.openGinomaiAccount = account.show;
    const backups = mountBackupControls(account, client, adapter), analytics = mountAnalytics(account, client, 'web');
    account.setExtension({update() {backups.update(); analytics.update();}, opened() {backups.opened();}});
    $('background').value = workspace.settings.background; $('text-scale').value = workspace.settings.textScale;
    try {live = JSON.parse(localStorage.getItem(LIVE_KEY) || 'null'); if (live) publish(live);} catch {}
    setInterval(() => {channel?.postMessage({type: 'CHECK_OUTPUTS'}); updateOutputStatus();}, 4000);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register(new URL('sw.js', location.href)).then(registration => {
        workerRegistration = registration;
        registration.addEventListener('updatefound', () => {
          registration.installing?.addEventListener('statechange', event => {
            if (event.target.state === 'installed' && registration.waiting) message('An update is ready. Close controller and projector windows after your service to apply it.');
          });
        });
      }).catch(() => {$('offline-status').textContent = 'Offline loading needs HTTPS or localhost. Export a backup before leaving.';});
      cacheStatus().then(status => {if (status.ready && bibles.length) $('offline-status').textContent = 'Application files cached. Prepare offline to check your saved services.';}).catch(() => {});
    }
  } catch (error) {
    $('save-status').textContent = 'Storage unavailable';
    openDialog('Could not open your library', body => {
      const note = document.createElement('p'); note.className = 'muted'; note.textContent = error.message; body.append(note, icon('Retry opening', 'Retry opening', () => location.reload()));
    });
  }
}
// Only one controller can edit this browser's library at a time. Output windows do not take this lock.
if (navigator.locks) {
  navigator.locks.request('ginomai-web-controller', {ifAvailable: true}, async lock => {
    if (!lock) {
      $('save-status').textContent = 'Another controller is open';
      $('app').inert = true; openDialog('Controller already open', body => {
        const note = document.createElement('p'); note.className = 'muted'; note.textContent = 'Close the other Ginomai Web controller tab, then reload this one. Your projector window can stay open.'; body.append(note, icon('Reload', 'Reload', () => location.reload()));
      }); $('close-dialog').hidden = true; return;
    }
    await boot(); await new Promise(resolve => addEventListener('pagehide', resolve, {once: true}));
  }).catch(error => {$('save-status').textContent = error.message;});
} else boot();
