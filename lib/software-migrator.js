'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { randomUUID } = require('node:crypto');
const easyWorship = require('./easyworship-importer');

const MEDIA_VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.m4v', '.wmv', '.ogv', '.avi']);
const MEDIA_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.jfif', '.avif']);

// Relaxed JSON parser for VideoPsalm (handles BOM, unquoted keys, multiline raw strings)
function parseVideoPsalmRelaxedJson(text) {
  if (!text || typeof text !== 'string') return null;
  text = text.replace(/^\uFEFF/, '').trim();
  if (!text) return null;

  let inString = false;
  let escapeNext = false;
  const out = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escapeNext) {
        out.push(ch);
        escapeNext = false;
      } else if (ch === '\\') {
        out.push(ch);
        escapeNext = true;
      } else if (ch === '"') {
        out.push(ch);
        inString = false;
      } else if (ch === '\n') {
        out.push('\\n');
      } else if (ch === '\r') {
        out.push('\\r');
      } else if (ch === '\t') {
        out.push('\\t');
      } else {
        out.push(ch);
      }
    } else {
      if (ch === '"') {
        inString = true;
        out.push(ch);
      } else {
        out.push(ch);
      }
    }
  }

  let sanitized = out.join('');
  sanitized = sanitized.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":');
  sanitized = sanitized.replace(/,\s*([}\]])/g, '$1');

  try {
    return JSON.parse(sanitized);
  } catch (err) {
    return null;
  }
}

// Clean chords and markup from lyric lines
function cleanLyrics(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\[[A-Ga-g][b#]?[^\]]*\]/g, '') // strip chords like [G/B], [C#m7]
    .replace(/<[^>]+>/g, '')                 // strip xml/html tags
    .replace(/\r/g, '')
    .trim();
}

// Pure-JS zip reader without external npm dependencies
function readZipEntries(buffer) {
  const entries = {};
  if (!buffer || buffer.length < 30) return entries;
  let i = 0;
  while (i < buffer.length - 4) {
    if (buffer.readUInt32LE(i) === 0x04034b50) { // PK\x03\x04
      const method = buffer.readUInt16LE(i + 8);
      const compSize = buffer.readUInt32LE(i + 18);
      const uncompSize = buffer.readUInt32LE(i + 22);
      const nameLen = buffer.readUInt16LE(i + 26);
      const extraLen = buffer.readUInt16LE(i + 28);
      const filename = buffer.toString('utf8', i + 30, i + 30 + nameLen);
      const dataStart = i + 30 + nameLen + extraLen;
      const dataEnd = dataStart + compSize;
      const compressedData = buffer.slice(dataStart, dataEnd);

      let uncompressed = null;
      if (method === 0) {
        uncompressed = compressedData;
      } else if (method === 8) {
        try {
          uncompressed = zlib.inflateRawSync(compressedData);
        } catch (e) {
          uncompressed = null;
        }
      }
      entries[filename] = uncompressed;
      i = dataEnd;
    } else {
      i++;
    }
  }
  return entries;
}

// Convert a VideoPsalm song item into Ginomai standard format
function convertVideoPsalmSong(vpSong, songbookName = 'VideoPsalm Import', mediaMap = {}) {
  const rawTitle = (vpSong.Text || (vpSong.Verses && vpSong.Verses[0] && vpSong.Verses[0].Text) || 'Untitled Song').trim();
  const title = rawTitle.split('\n')[0].replace(/\[.*?\]/g, '').trim() || 'Untitled Song';
  const author = (vpSong.Author || 'Unknown').trim();
  const stanzas = [];

  if (Array.isArray(vpSong.Verses)) {
    let verseIdx = 1;
    let chorusIdx = 1;
    let bridgeIdx = 1;

    vpSong.Verses.forEach((v) => {
      const lyricText = cleanLyrics(v.Text);
      if (!lyricText) return;

      let type = 'Verse ' + verseIdx;
      if (v.Tag === 1) {
        type = chorusIdx === 1 ? 'Chorus' : 'Chorus ' + chorusIdx;
        chorusIdx++;
      } else if (v.Tag === 2) {
        type = 'Pre-Chorus';
      } else if (v.Tag === 3) {
        type = bridgeIdx === 1 ? 'Bridge' : 'Bridge ' + bridgeIdx;
        bridgeIdx++;
      } else if (v.Tag === 4) {
        type = 'Intro';
      } else if (v.Tag === 5) {
        type = 'Outro';
      } else if (v.Tag === 8) {
        type = 'Ending';
      } else {
        verseIdx++;
      }

      stanzas.push({ type, text: lyricText });
    });
  }

  if (stanzas.length === 0) {
    stanzas.push({ type: 'Verse 1', text: title });
  }

  // Check background image or video mapping
  let theme = null;
  const bgStyle = vpSong.Style && vpSong.Style.Background;
  if (bgStyle) {
    const rawMedia = bgStyle.Video || bgStyle.Image;
    if (rawMedia && mediaMap[rawMedia]) {
      theme = mediaMap[rawMedia];
    } else if (rawMedia) {
      theme = rawMedia;
    }
  }

  return {
    id: 'song_custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    title,
    author: author || 'Unknown',
    songbook: songbookName,
    stanzas,
    theme: theme || null
  };
}

function resolveEasyWorshipMedia(reference, detected, profile) {
  if (!reference) return null;
  const normalized = String(reference).replace(/\\/g, '/').toLowerCase();
  const relative = normalized.replace(/^<images>\/?/, 'resources/images/').replace(/^<videos>\/?/, 'resources/videos/');
  const media = [...detected.images, ...detected.videos];
  const exact = media.find(item => {
    const local = path.relative(profile.root, item.path).replace(/\\/g, '/').toLowerCase();
    return local === relative || normalized === item.path.replace(/\\/g, '/').toLowerCase()
      || relative.endsWith('/' + local);
  });
  if (exact) return exact;
  const basename = relative.split('/').pop();
  const matches = media.filter(item => item.name.toLowerCase() === basename);
  return matches.length === 1 ? matches[0] : null;
}

module.exports = function createSoftwareMigrator(sanctuaryMediaStore) {

  // Recursively or selectively scan a target folder
  async function scan(targetDir) {
    if (!targetDir || !fs.existsSync(targetDir)) {
      throw new Error(`Directory not found: "${targetDir}"`);
    }

    const stat = await fs.promises.stat(targetDir);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: "${targetDir}"`);
    }

    const files = await fs.promises.readdir(targetDir);
    const ewProfile = await easyWorship.findProfile(targetDir);
    let softwareType = 'generic';

    // VideoPsalm detection markers
    const hasSongBooksDir = files.includes('SongBooks');
    const hasBiblesDir = files.includes('Bibles');
    const hasVpagdFiles = files.some(f => f.endsWith('.vpagd'));
    const hasMetaJson = files.includes('Meta.json');

    // EasyWorship detection markers
    const hasEwsx = files.some(f => f.endsWith('.ewsx') || f.endsWith('.ews'));
    const hasSongsDb = files.includes('Songs.db') || files.includes('Databases');

    if (ewProfile) {
      softwareType = 'easyworship';
    } else if (hasSongBooksDir || hasVpagdFiles || hasMetaJson) {
      softwareType = 'videopsalm';
    } else if (ewProfile || hasEwsx || hasSongsDb) {
      softwareType = 'easyworship';
    }

    const detected = {
      softwareType,
      folderPath: targetDir,
      songbooks: [],
      bibles: [],
      videos: [],
      images: [],
      agendas: [],
      themes: [],
      warnings: []
    };

    if (ewProfile) {
      const profileData = easyWorship.readProfile(ewProfile);
      detected.easyWorshipProfile = ewProfile;
      detected.songbooks.push({ name: 'EasyWorship Library', format: 'easyworship_sqlite', path: ewProfile.songsPath, songCount: profileData.songs.length });
      detected.themes = profileData.themes.map(t => ({ name: t.name, sourceId: t.sourceId, approximate: t.approximate }));
      detected.warnings.push(...profileData.warnings);
      if (!fs.existsSync(path.join(ewProfile.root, 'Resources'))) detected.warnings.push('The Resources folder is missing. Copy it with the profile to include its background images and videos.');
      // Resources may contain custom subfolders. Never follow directory links.
      async function collectMedia(dir) {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) await collectMedia(fullPath);
          else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            const list = MEDIA_VIDEO_EXTS.has(ext) ? detected.videos : MEDIA_IMAGE_EXTS.has(ext) ? detected.images : null;
            if (list) list.push({ name: entry.name, path: fullPath, size: (await fs.promises.stat(fullPath)).size });
          }
        }
      }
      await collectMedia(path.join(ewProfile.root, 'Resources'));
      let missingMedia = 0;
      for (const entry of profileData.media) {
        const item = resolveEasyWorshipMedia(entry.reference, detected, ewProfile);
        if (!item) { missingMedia++; continue; }
        if (entry.width > 0 && entry.height > 0) { item.width = entry.width; item.height = entry.height; }
      }
      if (missingMedia) detected.warnings.push(`${missingMedia} media catalogue entries could not be found in the selected profile. Include their files in Resources before importing.`);
      if (profileData.themes.some(theme => theme.background && !resolveEasyWorshipMedia(theme.background, detected, ewProfile))) {
        detected.warnings.push('Some style background files are missing from this profile. Those styles will use a plain background.');
      }
    }

    // 1. Scan Videos
    const videoDirs = [path.join(targetDir, 'Videos'), path.join(targetDir, 'Resources', 'Videos'), targetDir];
    for (const vDir of videoDirs) {
      if (fs.existsSync(vDir)) {
        try {
          const vFiles = await fs.promises.readdir(vDir);
          for (const f of vFiles) {
            const ext = path.extname(f).toLowerCase();
            if (MEDIA_VIDEO_EXTS.has(ext)) {
              const fullPath = path.join(vDir, f);
              const fStat = await fs.promises.stat(fullPath);
              if (fStat.isFile() && !detected.videos.some(x => path.resolve(x.path) === path.resolve(fullPath))) {
                detected.videos.push({ name: f, path: fullPath, size: fStat.size });
              }
            }
          }
        } catch (e) {}
      }
    }

    // 2. Scan Images
    const imageDirs = [path.join(targetDir, 'Images'), path.join(targetDir, 'Resources', 'Images'), targetDir];
    for (const iDir of imageDirs) {
      if (fs.existsSync(iDir)) {
        try {
          const iFiles = await fs.promises.readdir(iDir);
          for (const f of iFiles) {
            const ext = path.extname(f).toLowerCase();
            if (MEDIA_IMAGE_EXTS.has(ext)) {
              const fullPath = path.join(iDir, f);
              const fStat = await fs.promises.stat(fullPath);
              if (fStat.isFile() && !detected.images.some(x => path.resolve(x.path) === path.resolve(fullPath))) {
                detected.images.push({ name: f, path: fullPath, size: fStat.size });
              }
            }
          }
        } catch (e) {}
      }
    }

    // 3. Scan SongBooks
    const songDirs = [path.join(targetDir, 'SongBooks'), path.join(targetDir, 'Songs'), targetDir];
    for (const sDir of songDirs) {
      if (fs.existsSync(sDir)) {
        try {
          const sFiles = await fs.promises.readdir(sDir);
          for (const f of sFiles) {
            const fullPath = path.join(sDir, f);
            const ext = path.extname(f).toLowerCase();
            if (ext === '.json') {
              try {
                const raw = await fs.promises.readFile(fullPath, 'utf8');
                const parsed = parseVideoPsalmRelaxedJson(raw);
                if (parsed && Array.isArray(parsed.Songs)) {
                  detected.songbooks.push({
                    name: parsed.Text || parsed.Abbreviation || path.basename(f, ext),
                    code: parsed.Abbreviation || path.basename(f, ext),
                    format: 'videopsalm_json',
                    path: fullPath,
                    songCount: parsed.Songs.length
                  });
                }
              } catch (e) {}
            } else if (ext === '.xml') {
              try {
                const rawXml = await fs.promises.readFile(fullPath, 'utf8');
                if (rawXml.includes('<song') || rawXml.includes('<lyrics>')) {
                  detected.songbooks.push({
                    name: path.basename(f, ext),
                    format: 'xml',
                    path: fullPath,
                    songCount: 1
                  });
                }
              } catch (e) {}
            }
          }
        } catch (e) {}
      }
    }

    // 4. Scan Agendas
    for (const f of files) {
      if (f.endsWith('.vpagd') || f.endsWith('.ewsx')) {
        const fullPath = path.join(targetDir, f);
        const fStat = await fs.promises.stat(fullPath);
        if (fStat.isFile()) {
          detected.agendas.push({
            name: f,
            path: fullPath,
            size: fStat.size,
            format: f.endsWith('.vpagd') ? 'videopsalm_agenda' : 'easyworship_schedule',
            supported: f.endsWith('.vpagd')
          });
        }
      }
    }

    // 5. Scan Bibles
    const seenBibleCodes = new Set();
    const addDetectedBible = (code, name, fileName = '', format = 'file', filePath = null) => {
      const cleanCode = (code || '').toUpperCase().trim();
      if (!cleanCode || seenBibleCodes.has(cleanCode)) return;
      seenBibleCodes.add(cleanCode);
      const isBundled = fs.existsSync(path.join(__dirname, '..', 'bibles', `${cleanCode}.json`));
      detected.bibles.push({
        code: cleanCode,
        name: name || cleanCode,
        fileName: fileName || '',
        path: filePath || null,
        format: format,
        availableInGnomia: isBundled
      });
    };

    const bibleInfoCandidatePaths = [
      path.join(targetDir, 'Bibles', 'BibleInfo.vpcsetting'),
      path.join(targetDir, 'Bibles', 'BibleInfos.vpcsetting'),
      path.join(targetDir, 'BibleInfo.vpcsetting')
    ];

    for (const bInfoPath of bibleInfoCandidatePaths) {
      if (fs.existsSync(bInfoPath)) {
        try {
          const zipBuf = await fs.promises.readFile(bInfoPath);
          const entries = readZipEntries(zipBuf);
          const inner = entries['BibleInfo.vpsetting'] || entries['BibleInfos.vpsetting'];
          if (inner) {
            const infoJson = parseVideoPsalmRelaxedJson(inner.toString('utf8'));
            if (infoJson && Array.isArray(infoJson.Infos)) {
              infoJson.Infos.forEach(info => {
                addDetectedBible(
                  info.Abbreviation,
                  info.Text || info.Abbreviation,
                  info.FileName,
                  'videopsalm_bible',
                  info.FileName ? path.join(path.dirname(bInfoPath), info.FileName) : null
                );
              });
            }
          }
        } catch (e) {}
      }
    }

    // Fallback: Check Bibles directory for any other files
    const biblesDir = path.join(targetDir, 'Bibles');
    if (fs.existsSync(biblesDir)) {
      try {
        const bFiles = await fs.promises.readdir(biblesDir);
        for (const f of bFiles) {
          if (f.endsWith('.json') || f.endsWith('.xml') || f.endsWith('.usfm')) {
            const code = path.basename(f).replace(/\.[^/.]+$/, "").toUpperCase();
            addDetectedBible(
              code,
              path.basename(f).replace(/\.[^/.]+$/, ""),
              f,
              'file',
              path.join(biblesDir, f)
            );
          }
        }
      } catch (e) {}
    }

    if (detected.agendas.some(a => a.supported === false)) detected.warnings.push('EasyWorship schedules are detected but cannot be imported yet.');
    return {
      success: true,
      softwareType,
      folderPath: targetDir,
      counts: {
        songs: detected.songbooks.reduce((acc, b) => acc + (b.songCount || 0), 0),
        bibles: detected.bibles.length,
        videos: detected.videos.length,
        images: detected.images.length,
        agendas: detected.agendas.filter(a => a.supported !== false).length,
        themes: detected.themes.length
      },
      detected
    };
  }

  // Execute end-to-end migration
  async function execute(options = {}) {
    const {
      folderPath,
      importSongs = true,
      importBibles = true,
      importMedia = true,
      importAgendas = true,
      importThemes = true
    } = options;

    const scanResult = await scan(folderPath);
    const { detected } = scanResult;

    const results = {
      success: true,
      softwareType: detected.softwareType,
      importedCounts: {
        songs: 0,
        bibles: 0,
        videos: 0,
        images: 0,
        agendas: 0,
        themes: 0
      },
      songs: [],
      bibles: [],
      agendas: [],
      mediaItems: [],
      themes: [],
      warnings: [...detected.warnings]
    };

    const mediaMap = {}; // maps original filename -> new upload ID

    // 1. Ingest Media (Videos & Images)
    if (importMedia && sanctuaryMediaStore && typeof sanctuaryMediaStore.ingestLocalFile === 'function') {
      // Ingest Videos
      for (const v of detected.videos) {
        try {
          const item = await sanctuaryMediaStore.ingestLocalFile(v.path, v.name, null, v.width, v.height);
          if (item) {
            results.importedCounts.videos++;
            results.mediaItems.push(item);
            mediaMap[v.name] = item.id;
            mediaMap[path.resolve(v.path)] = item;
          } else {
            results.warnings.push(`Video skipped because its format is not supported: ${v.name}`);
          }
        } catch (e) {
          console.error(`[Migrator] Error ingesting video ${v.name}:`, e.message);
          results.warnings.push(`Video not imported: ${v.name}. ${e.message}`);
        }
      }

      // Ingest Images
      for (const img of detected.images) {
        try {
          const item = await sanctuaryMediaStore.ingestLocalFile(img.path, img.name, null, img.width, img.height);
          if (item) {
            results.importedCounts.images++;
            results.mediaItems.push(item);
            mediaMap[img.name] = item.id;
            mediaMap[path.resolve(img.path)] = item;
          } else {
            results.warnings.push(`Image skipped because its format is not supported: ${img.name}`);
          }
        } catch (e) {
          console.error(`[Migrator] Error ingesting image ${img.name}:`, e.message);
          results.warnings.push(`Image not imported: ${img.name}. ${e.message}`);
        }
      }
    }

    if (detected.easyWorshipProfile) {
      const profileData = easyWorship.readProfile(detected.easyWorshipProfile);
      const styleMap = new Map();
      async function importStyle(style) {
        if (!style || !sanctuaryMediaStore?.saveImportedStyle) return null;
        if (styleMap.has(style.sourceId)) return styleMap.get(style.sourceId);
        const original = resolveEasyWorshipMedia(style.background, detected, detected.easyWorshipProfile);
        const media = original && mediaMap[path.resolve(original.path)];
        if (style.background && !media) results.warnings.push(`Style "${style.name}" uses a plain background because its media was not imported.`);
        const saved = await sanctuaryMediaStore.saveImportedStyle(style, media || null);
        results.themes.push(saved);
        results.importedCounts.themes++;
        styleMap.set(style.sourceId, saved);
        return saved;
      }
      if (importThemes) {
        for (const style of profileData.themes) {
          try { await importStyle(style); }
          catch (error) { results.warnings.push(`Style not imported: ${style.name}. ${error.message}`); }
        }
      }
      if (importSongs) {
        for (const song of profileData.songs) {
          if (importThemes && song.sourcePresentationId != null) {
            try {
              const style = easyWorship.styleForPresentation(profileData.layout, song.sourcePresentationId, song.title + ' Style', 'song:' + song.sourceId);
              const saved = await importStyle(style);
              if (saved) song.themeId = saved.id;
            } catch (error) { results.warnings.push(`Song style not imported: ${song.title}. ${error.message}`); }
          }
          delete song.sourcePresentationId;
          results.songs.push(song);
          results.importedCounts.songs++;
        }
      }
    }

    // 2. Ingest Songs from Songbooks
    if (importSongs) {
      for (const sb of detected.songbooks) {
        if (sb.format === 'videopsalm_json') {
          try {
            const raw = await fs.promises.readFile(sb.path, 'utf8');
            const parsed = parseVideoPsalmRelaxedJson(raw);
            if (parsed && Array.isArray(parsed.Songs)) {
              const bookTitle = parsed.Text || parsed.Abbreviation || sb.name || 'VideoPsalm';
              parsed.Songs.forEach(vpSong => {
                const song = convertVideoPsalmSong(vpSong, bookTitle, mediaMap);
                results.songs.push(song);
                results.importedCounts.songs++;
              });
            }
          } catch (e) {
            console.error(`[Migrator] Error parsing songbook ${sb.name}:`, e.message);
          }
        }
      }
    }

    // 3. Ingest Agendas & Extract any embedded songs and media from .vpagd
    if (importAgendas) {
      for (const ag of detected.agendas) {
        if (ag.format === 'videopsalm_agenda') {
          try {
            const zipBuf = await fs.promises.readFile(ag.path);
            const entries = readZipEntries(zipBuf);
            const agendaSongs = [];

            // Extract embedded videos/images if not already ingested
            if (importMedia && sanctuaryMediaStore) {
              for (const [entryName, entryBuf] of Object.entries(entries)) {
                if (!entryBuf) continue;
                const baseName = path.basename(entryName);
                const ext = path.extname(baseName).toLowerCase();
                if ((MEDIA_VIDEO_EXTS.has(ext) || MEDIA_IMAGE_EXTS.has(ext)) && !mediaMap[baseName]) {
                  try {
                    const item = await sanctuaryMediaStore.ingestLocalFile(null, baseName, entryBuf);
                    if (item) {
                      mediaMap[baseName] = item.id;
                      results.mediaItems.push(item);
                      if (MEDIA_VIDEO_EXTS.has(ext)) results.importedCounts.videos++;
                      else results.importedCounts.images++;
                    }
                  } catch (e) {}
                }
              }
            }

            // Extract agenda songs
            const songKeys = Object.keys(entries).filter(k => /^Song_\d+\.json$/.test(k)).sort();
            for (const sKey of songKeys) {
              const songBuf = entries[sKey];
              if (!songBuf) continue;
              const vpSong = parseVideoPsalmRelaxedJson(songBuf.toString('utf8'));
              if (vpSong) {
                // Find matching songbook title if available
                const sbKey = sKey.replace('Song_', 'SongBook_');
                let sbTitle = 'Agenda Items';
                if (entries[sbKey]) {
                  const sbData = parseVideoPsalmRelaxedJson(entries[sbKey].toString('utf8'));
                  if (sbData && (sbData.Text || sbData.Abbreviation)) {
                    sbTitle = sbData.Text || sbData.Abbreviation;
                  }
                }
                const conv = convertVideoPsalmSong(vpSong, sbTitle, mediaMap);
                agendaSongs.push(conv);

                // Add to library if not duplicate
                if (importSongs && !results.songs.some(s => s.title.toLowerCase() === conv.title.toLowerCase())) {
                  results.songs.push(conv);
                  results.importedCounts.songs++;
                }
              }
            }

            results.agendas.push({
              name: path.basename(ag.name, '.vpagd'),
              sourceFile: ag.name,
              itemsCount: agendaSongs.length,
              songs: agendaSongs
            });
            results.importedCounts.agendas++;
          } catch (e) {
            console.error(`[Migrator] Error parsing agenda ${ag.name}:`, e.message);
          }
        }
      }
    }

    // 4. Ingest / Map Bibles
    if (importBibles) {
      for (const b of detected.bibles) {
        let customData = null;
        if (b.path && fs.existsSync(b.path) && b.path.endsWith('.json')) {
          try {
            customData = JSON.parse(await fs.promises.readFile(b.path, 'utf8'));
          } catch (e) {}
        }
        results.bibles.push({
          code: b.code,
          name: b.name,
          availableInGnomia: b.availableInGnomia !== false,
          data: customData || null
        });
        results.importedCounts.bibles++;
      }
    }

    results.warnings = [...new Set(results.warnings)];
    return results;
  }

  return {
    scan,
    execute,
    parseVideoPsalmRelaxedJson,
    readZipEntries,
    convertVideoPsalmSong
  };
};
