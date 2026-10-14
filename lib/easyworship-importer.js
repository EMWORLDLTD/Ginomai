'use strict';

// EasyWorship is read only. Converted records go through the shared migrator.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const stableId = value => createHash('sha256').update(String(value)).digest('hex').slice(0, 32);

function readDatabase(file, callback) {
  let DatabaseSync;
  try { ({ DatabaseSync } = require('node:sqlite')); }
  catch { throw new Error('EasyWorship import requires the current Ginomai desktop app or Node.js 22.13 or later.'); }
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));
    return callback(name => {
      if (!tables.has(name)) return [];
      const statement = db.prepare(`SELECT rowid, * FROM "${name}"`);
      statement.setReadBigInts(true);
      return statement.all().map(row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
        [key, typeof value === 'bigint' ? (Number.isSafeInteger(Number(value)) ? Number(value) : String(value)) : value])));
    }, tables);
  } finally { db.close(); }
}

async function findProfile(selectedDir) {
  const queue = [{ dir: path.resolve(selectedDir), depth: 0 }], matches = [];
  let examined = 0;
  while (queue.length) {
    const { dir, depth } = queue.shift();
    if (++examined > 1000) throw new Error('Select a specific EasyWorship profile folder, rather than a whole drive.');
    const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
    const songs = entries.find(e => e.isFile() && e.name.toLowerCase() === 'songs.db');
    if (songs) {
      const words = entries.find(e => e.isFile() && e.name.toLowerCase() === 'songwords.db');
      matches.push({ dataDir: dir, songsPath: path.join(dir, songs.name), wordsPath: words && path.join(dir, words.name) });
      continue;
    }
    if (depth >= 4) continue;
    for (const entry of entries) {
      if (!entry.isDirectory() || /^(resources|images|videos|audio|backups?|cache|node_modules|\.git)$/i.test(entry.name)) continue;
      queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
    }
  }
  if (!matches.length) return null;
  if (matches.length > 1) throw new Error('More than one EasyWorship profile was found. Select the individual profile you want to import.');
  const profile = matches[0];
  if (!profile.wordsPath) throw new Error('This EasyWorship profile is incomplete: SongWords.db is missing. Copy the complete profile folder, then scan again.');
  let root = profile.dataDir;
  // Accept the profile itself, its version directory, Databases, or Data.
  if (path.basename(root).toLowerCase() === 'data' && path.basename(path.dirname(root)).toLowerCase() === 'databases') {
    root = path.dirname(path.dirname(root));
    if (/^v\d/i.test(path.basename(root))) root = path.dirname(root);
  }
  profile.root = root;
  return profile;
}

function rtfToText(input) {
  const rtf = Buffer.isBuffer(input) ? input.toString('latin1') : String(input || '');
  if (!/^\s*\{\\rtf/i.test(rtf)) return rtf.replace(/\r\n?/g, '\n').trim();
  const stack = [], out = [];
  let state = { skip: false, hidden: false, uc: 1 }, fallback = 0;
  let decoder = new TextDecoder('windows-1252');
  const destinations = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer', 'fldinst', 'listtable', 'listoverridetable', 'xmlopen', 'datastore', 'themedata']);
  const emit = value => {
    if (fallback) { fallback--; return; }
    if (!state.skip && !state.hidden) out.push(value);
  };
  for (let i = 0; i < rtf.length;) {
    const ch = rtf[i++];
    if (ch === '{') { stack.push({ ...state }); continue; }
    if (ch === '}') { state = stack.pop() || state; continue; }
    if (ch === '\r' || ch === '\n') continue;
    if (ch !== '\\') { emit(ch); continue; }
    const symbol = rtf[i];
    if (symbol === '\\' || symbol === '{' || symbol === '}') { i++; emit(symbol); continue; }
    if (symbol === '*') { state.skip = true; i++; continue; }
    if (symbol === "'") {
      const bytes = [];
      while (rtf[i] === "'" && /^[0-9a-f]{2}$/i.test(rtf.slice(i + 1, i + 3))) {
        bytes.push(parseInt(rtf.slice(i + 1, i + 3), 16)); i += 3;
        if (rtf[i] === '\\' && rtf[i + 1] === "'") i++; else break;
      }
      if (!bytes.length) i++;
      else for (const letter of decoder.decode(Uint8Array.from(bytes))) emit(letter);
      continue;
    }
    const control = /^([a-z]+)(-?\d+)? ?/i.exec(rtf.slice(i));
    if (!control) { i++; if (symbol === '~') emit('\u00a0'); else if (symbol === '_') emit('\u2011'); continue; }
    i += control[0].length;
    const word = control[1].toLowerCase(), number = control[2] === undefined ? undefined : Number(control[2]);
    if (destinations.has(word)) state.skip = true;
    if (word === 'bin') { i += Math.max(0, number || 0); continue; }
    if (word === 'ansicpg') {
      try { decoder = new TextDecoder(number === 65001 ? 'utf-8' : `windows-${number}`); } catch { /* Keep ANSI fallback. */ }
    }
    if (word === 'uc') state.uc = Math.max(0, number || 0);
    if (word === 'v') state.hidden = number !== 0;
    if (word === 'u') {
      if (!state.skip && !state.hidden) out.push(String.fromCharCode((number || 0) & 0xffff));
      fallback = state.uc;
    } else if (word === 'par' || word === 'line') emit('\n');
    else if (word === 'tab') emit('\t');
    else if ({ emdash: 1, endash: 1, lquote: 1, rquote: 1, ldblquote: 1, rdblquote: 1, bullet: 1 }[word]) {
      emit({ emdash: '\u2014', endash: '\u2013', lquote: '\u2018', rquote: '\u2019', ldblquote: '\u201c', rdblquote: '\u201d', bullet: '\u2022' }[word]);
    }
  }
  return out.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function convertSong(row, words) {
  const text = rtfToText(words);
  if (!text) return null;
  const stanzas = [];
  let type = 'Verse 1', lines = [], verse = 1;
  const flush = () => {
    const lyric = lines.join('\n').trim();
    if (lyric) stanzas.push({ type, text: lyric });
    lines = [];
  };
  const hasLabels = text.split('\n').some(line => /^\s*\[?(verse|chorus|pre[- ]?chorus|bridge|intro|outro|ending|refrain|tag)\s*\d*\]?\s*:?\s*$/i.test(line));
  for (const line of text.split('\n')) {
    const label = /^\s*\[?(verse|chorus|pre[- ]?chorus|bridge|intro|outro|ending|refrain|tag)\s*(\d*)\]?\s*:?\s*$/i.exec(line);
    if (label) {
      flush();
      const name = label[1].toLowerCase().replace(/^pre[- ]?chorus$/, 'pre-chorus');
      type = name[0].toUpperCase() + name.slice(1) + (label[2] ? ' ' + label[2] : '');
    } else if (!line.trim() && !hasLabels) { flush(); type = 'Verse ' + (++verse); }
    else lines.push(line);
  }
  flush();
  return {
    id: 'song_custom_ew_' + stableId(row.song_item_uid || row.song_uid || `${row.title}\n${row.author}\n${text}`),
    title: String(row.title || 'Untitled Song').trim(), author: row.author || 'Unknown', songbook: 'EasyWorship Import', stanzas,
    copyright: row.copyright || '', administrator: row.administrator || '', ccli: String(row.reference_number || ''),
    description: row.description || '', tags: row.tags || '', sourceSoftware: 'easyworship', sourceId: row.song_item_uid || row.song_uid || stableId(`${row.title}\n${row.author}\n${text}`),
    sourcePresentationId: row.presentation_id
  };
}

const ewColor = value => {
  const n = Number(value);
  // Delphi TColor stores red in the low byte (BGR).
  return Number.isInteger(n) && n >= 0 && n <= 0xffffff
    ? '#' + [n & 255, (n >> 8) & 255, (n >> 16) & 255].map(v => v.toString(16).padStart(2, '0')).join('') : null;
};

function readLayouts(dataDir) {
  const file = path.join(dataDir, 'PresentationLayouts.db');
  if (!fs.existsSync(file)) return null;
  return readDatabase(file, rows => ({
    slides: rows('slide'), elements: rows('element'), groups: rows('element_property_group'), properties: rows('element_property'),
    colors: rows('resource_color'), gradients: rows('resource_gradient'), stops: rows('resource_gradient_color'),
    images: rows('resource_image'), videos: rows('resource_video')
  }));
}

function styleForPresentation(layout, presentationId, title, sourceId) {
  if (!layout) return null;
  const slides = layout.slides.filter(s => s.presentation_id === presentationId);
  if (!slides.length) return null;
  const master = slides.find(s => s.slide_uid === 'MASTER' || /^master$/i.test(s.title));
  const first = slides.find(s => s.slide_uid !== 'MASTER' && !/^(blank|title)$/i.test(s.slide_uid)) || slides[0];
  const inherited = layout.slides.filter(s => s.presentation_id === (first.modified_theme_id || first.theme_id));
  const base = inherited.find(s => s.slide_uid === 'MASTER') || inherited[0];
  const order = [base, master, first].filter(Boolean);
  const elements = new Map();
  for (const slide of order) {
    for (const element of layout.elements.filter(e => e.slide_id === slide.rowid)) {
      const previous = elements.get(element.element_uid) || {};
      elements.set(element.element_uid, { ...previous, ...element,
        background_resource_id: element.background_resource_id ?? previous.background_resource_id,
        foreground_resource_id: element.foreground_resource_id ?? previous.foreground_resource_id });
    }
  }
  const bg = elements.get('BACKGROUND'), content = elements.get('CONTENT_SONG') || elements.get('CONTENT_SCRIPTURE') || elements.get('CONTENT_PRESENTATION');
  const resourceIds = bg ? [bg.foreground_resource_id, bg.background_resource_id].filter(x => x != null) : [];
  let background = null, bgCss = '#000000';
  for (const id of resourceIds) {
    const media = layout.videos.find(r => r.resource_id === id) || layout.images.find(r => r.resource_id === id);
    if (media) { background = media.original_filename; break; }
    const gradient = layout.gradients.find(r => r.resource_id === id);
    const stops = layout.stops.filter(r => r.resource_id === id);
    if (gradient && stops.length) {
      const colors = stops.flatMap(s => [[ewColor(s.color_from), s.percent_from], [ewColor(s.color_to), s.percent_to]])
        .filter(([color]) => color).map(([color, at]) => `${color} ${Math.max(0, Math.min(100, (Number(at) || 0) * 100))}%`);
      if (colors.length) { bgCss = `linear-gradient(${Number(gradient.angle) || 0}deg, ${colors.join(', ')})`; break; }
    }
    const color = layout.colors.find(r => r.resource_id === id);
    if (color && ewColor(color.color)) { bgCss = ewColor(color.color); break; }
  }
  let font, textColor;
  if (content) {
    const groups = new Set(layout.groups.filter(g => g.link_id === content.rowid && /^Text(_Format)?$/i.test(g.group_name)).map(g => g.rowid));
    const props = layout.properties.filter(p => groups.has(p.group_id));
    font = props.find(p => /^(fontname|fontfamily|font)$/i.test(p.key))?.value;
    textColor = ewColor(props.find(p => /^(color|fontcolor)$/i.test(p.key))?.value);
  }
  return { sourceId: stableId(sourceId), name: title, type: 'gradient', category: 'colors', badge: 'IMPORTED', bgCss, previewGradient: bgCss,
    font: font || 'Outfit', textColor: textColor || '#FFFFFF', headerColor: textColor || '#FFFFFF', textShadow: 'none',
    background, approximate: true, sourceSoftware: 'easyworship' };
}

function readProfile(profile) {
  const songs = readDatabase(profile.songsPath, (rows, tables) => {
    if (!tables.has('song')) throw new Error('This Songs.db format is not supported. Select a profile containing the supported song and word tables.');
    return rows('song');
  });
  const words = readDatabase(profile.wordsPath, (rows, tables) => {
    if (!tables.has('word')) throw new Error('This SongWords.db format is not supported.');
    return rows('word');
  });
  const wordMap = new Map(words.map(w => [w.song_id, w.words]));
  const warnings = [], converted = [];
  if (!songs.length) warnings.push('This EasyWorship profile contains no songs.');
  for (const song of songs) {
    const item = convertSong(song, wordMap.get(song.rowid));
    if (item) converted.push(item);
    else warnings.push(`Song skipped because its lyrics are missing or empty: ${song.title || 'Untitled Song'}`);
  }
  let layout = null, themes = [], media = [];
  const mediaDb = path.join(profile.dataDir, 'Media.db');
  if (fs.existsSync(mediaDb)) {
    try { media = readDatabase(mediaDb, rows => rows('media')).map(item => ({
      reference: String(item.path || '') + (/[/\\>]$/.test(item.path || '') ? '' : '/') + String(item.filename || ''),
      width: Number(item.width), height: Number(item.height)
    })); }
    catch (error) { warnings.push(`The media catalogue could not be read: ${error.message}`); }
  }
  try {
    layout = readLayouts(profile.dataDir);
    const themeDb = path.join(profile.dataDir, 'Themes.db');
    if (fs.existsSync(themeDb)) {
      const themeRows = readDatabase(themeDb, rows => rows('file_item'));
      themes = themeRows.map(row => styleForPresentation(layout, row.presentation_id, row.title || 'EasyWorship Style', row.file_item_uid || `theme:${row.presentation_id}:${row.title}`)).filter(Boolean);
      if (themes.length < themeRows.length) warnings.push(`${themeRows.length - themes.length} themes have layouts that cannot be converted and will be skipped.`);
    }
  } catch (error) { warnings.push(`Themes could not be read: ${error.message}`); }
  if (themes.length) warnings.push('Imported EasyWorship styles use Ginomai layouts. Review text placement, fonts and effects before presenting.');
  return { songs: converted, themes, warnings, layout, media };
}

module.exports = { findProfile, readProfile, rtfToText, convertSong, styleForPresentation, stableId };
