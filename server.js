// Ginomai - Native Broadcast & OBS Sync Server
// The Word in Motion
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const packageMetadata = require('./package.json');
const createAccessControl = require('./lib/access-control');
const access = createAccessControl();
const sanctuaryMedia = require('./lib/sanctuary-media')();
const presentationMedia = require('./lib/presentation-media')();
const sharedMediaLibrary = require('./lib/media-library');
const softwareMigrator = require('./lib/software-migrator')(sanctuaryMedia);
const outputs = require('./lib/output-status')();
const liveStateStore = require('./lib/live-state-store')();
const semanticService = new (require('./lib/semantic-service.cjs'))();
let outputRevision = 0;
let held = false;
function displayState(full = false) {
  if (full) return {...currentState,isHoldLive:held,_serverTime:Date.now()};
  const { dashboard, hostSpeechState, ...projected } = currentState;
  return {...projected,isHoldLive:held,_serverTime:Date.now()};
}

const PORT = process.env.PORT || 8500;
const PUBLIC_DIR = __dirname;
const contentPacks = new (require('./lib/content-packs').ContentPacks)({ root: PUBLIC_DIR });
const liveReload = process.env.SF_DEV_RELOAD === '1'
  ? require('./scripts/live-reload')(PUBLIC_DIR) : null;
let currentBoundPort = PORT;

// ─── Display State ────────────────────────────────────────────────────────────
let currentState = {
  mode: 'full',
  projectorActive: true,
  livestreamActive: true,
  text: '',
  reference: '',
  version: '',
  compare: false,
  textSize: 1.0,
  textAutoScale: true,
  bg: '#0F172A',
  clear: false,
  clearBg: false,
  _outputRevision: 0,
  _timestamp: Date.now()
};
const savedLiveState = liveStateStore.load();
if (savedLiveState) {
  currentState = { ...currentState, ...savedLiveState, _timestamp: Math.max(Date.now(), savedLiveState._timestamp || 0) };
  outputRevision = currentState._outputRevision;
}

// ─── Catalog ──────────────────────────────────────────────────────────────────
let controlCatalog = { bible: {}, songs: [] };

// ─── Host Speech AI State (Mirrored to Remote Operators) ───────────────────────
let hostSpeechState = {
  isListening: false,
  transcript: '',
  detectedVerses: [],
  detectedSongs: [],
  paraphraseMatches: [],
  updatedAt: Date.now()
};

// ─── Shadow Deck State (last song operator had loaded — for crash continuity) ─
let shadowDeckState = null;

// ─── Lexicon Cache ────────────────────────────────────────────────────────────
let lexiconCache = null;

// ─── Cloud Lyrics Cache (In-Memory, 1hr TTL, max 500 entries) ─────────────────
const lyricsCache = new Map();
const LYRICS_CACHE_TTL_MS = 60 * 60 * 1000;

// ─── Remote Session ───────────────────────────────────────────────────────────
const DEFAULT_PRIVILEGES = {
  // Projection
  projectSlide: true,
  navigateSlides: true,
  clearScreen: true,
  // Library
  loadSong: true,
  importSongsDirect: false,
  importSongsRequest: true,
  importBibles: false,
  editLyrics: false,
  // Agenda
  addAgendaItems: true,
  reorderAgenda: false,
  removeAgendaItems: false,
  // Medley
  loadMedleySlots: true,
  switchMedleyMode: false,
  // Display
  adjustFontSize: false,
  toggleTransparentBg: false,
  // AI
  autoProject: false,
  // Always blocked (never in privileges object — enforced in code)
  // deleteSong: never
  // openSettings: never
  // Microphone device selection remains host-only.
  // maxLinesPerSlide: never
};

const FULL_CONTROL_PRIVILEGES = {
  projectSlide: true,
  navigateSlides: true,
  clearScreen: true,
  loadSong: true,
  importSongsDirect: true,
  importSongsRequest: true,
  importBibles: true,
  editLyrics: true,
  addAgendaItems: true,
  reorderAgenda: true,
  removeAgendaItems: true,
  loadMedleySlots: true,
  switchMedleyMode: true,
  adjustFontSize: true,
  toggleTransparentBg: true,
  autoProject: true,
};

// Current remote session state (Dedicated Single Operator with Full Control)
let remoteSession = {
  enabled: false,
  revision: Date.now(),
  importMode: 'direct',
  privileges: { ...FULL_CONTROL_PRIVILEGES },
  connectedOperators: [],   // [{ id, name, joinedAt }]
  savedProfiles: [],
  pendingImports: [],
};

// ─── SSE Clients ──────────────────────────────────────────────────────────────
const sseClients = new Set();       // OBS display clients
const controlClients = new Set();   // Host studio — receives operator commands
const operatorClients = new Map();  // operatorId → res  — receive privilege updates

function publishState() {
  currentState._outputRevision = ++outputRevision;
  sseClients.forEach(client => {
    try { client.write(`data: ${JSON.stringify(displayState(client.sfAuthenticated))}\n\n`); } catch { sseClients.delete(client); }
  });
  liveStateStore.save(currentState);
}

function broadcastToOperators(payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  operatorClients.forEach((res, id) => {
    try { res.write(data); } catch { operatorClients.delete(id); }
  });
}

function revokeOperatorAccess() {
  broadcastToOperators({ type: 'SESSION_ENDED', enabled: remoteSession.enabled, revision: remoteSession.revision });
  access.revoke();
  for (const client of operatorClients.values()) client.end();
  operatorClients.clear();
  for (const clients of [controlClients, sseClients]) {
    for (const client of clients) {
      if (!client.sfOperator) continue;
      client.end();
      clients.delete(client);
    }
  }
  remoteSession.connectedOperators = [];
  remoteSession.pendingImports = [];
}

function broadcastPrivilegeUpdate() {
  broadcastToOperators({
    type: 'PRIVILEGE_UPDATE',
    privileges: remoteSession.privileges,
    importMode: remoteSession.importMode,
    sessionEnabled: remoteSession.enabled,
  });
}

function getLanAddresses() {
  const addresses = [];
  Object.values(os.networkInterfaces()).forEach(network => {
    (network || []).forEach(details => {
      if (details.family === 'IPv4' && !details.internal && !details.address.startsWith('169.254.')) {
        addresses.push(details.address);
      }
    });
  });
  return [...new Set(addresses)];
}

// ─── Always-Blocked Commands (regardless of privileges) ───────────────────────
const ALWAYS_BLOCKED_FROM_REMOTE = new Set([
  'DELETE_SONG', 'OPEN_SETTINGS', 'TOGGLE_AI_MIC', 'SET_MAX_LINES', 'SET_AUDIO_DEVICE'
]);

// ─── Privilege → Command type mapping ─────────────────────────────────────────
function isCommandAllowed(command, privileges) {
  if (ALWAYS_BLOCKED_FROM_REMOTE.has(command.type)) return false;
  switch (command.type) {
    case 'PROJECT':      return privileges.projectSlide;
    case 'NAVIGATE':     return privileges.navigateSlides;
    case 'CLEAR':        return privileges.clearScreen;
    case 'BLACKOUT':     return privileges.clearScreen;
    case 'SET_HOLD':     return privileges.clearScreen && typeof command.enabled === 'boolean';
    case 'LOAD_SONG':    return privileges.loadSong;
    case 'IMPORT_SONG':  return privileges.importSongsDirect;
    case 'IMPORT_BIBLE': return privileges.importBibles;
    case 'EDIT_LYRICS':  return privileges.editLyrics;
    case 'AGENDA_ADD':   return privileges.addAgendaItems;
    case 'AGENDA_REORDER': return privileges.reorderAgenda;
    case 'AGENDA_REMOVE': return privileges.removeAgendaItems;
    case 'MEDLEY_LOAD':  return privileges.loadMedleySlots;
    case 'MEDLEY_MODE':  return privileges.switchMedleyMode;
    case 'SET_FONT_SIZE': return privileges.adjustFontSize;
    case 'TOGGLE_TRANSPARENT_BG': return privileges.toggleTransparentBg;
    case 'AUTO_PROJECT': return privileges.autoProject;
    case 'SET_SPEECH_AI':
    case 'SET_SERMON_RECORDING': return typeof command.enabled === 'boolean';
    case 'PUSH_TO_HOST': return privileges.importSongsDirect && privileges.addAgendaItems;
    case 'STATE_PATCH':  return true; // filtered internally
    case 'SHADOW_DECK':  return true; // always allowed — continuity
    case 'CATALOG_UPDATE': return privileges.importSongsDirect && privileges.importBibles && privileges.editLyrics;
    default: return false;
  }
}

// ─── MIME Types ───────────────────────────────────────────────────────────────
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

// ─── HTTP Server ──────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;
  access.bootstrap(req, res, reqUrl);
  const identity = access.identify(req);
  const isHost = identity?.role === 'host';
  if (pathname.startsWith('/api/') && !access.sameOrigin(req)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Cross-origin requests are not permitted' }));
    return;
  }
  if (liveReload && liveReload.handle(req, res, pathname)) return;

  // ── JSON body helper ────────────────────────────────────────────────────────
  function readBody(cb) {
    let body = '';
    let tooLarge = false;
    req.on('data', chunk => {
      if (tooLarge) return;
      body += chunk.toString();
      if (Buffer.byteLength(body) > 32 * 1024 * 1024) {
        tooLarge = true;
        json(413, { error: 'Request is too large' });
      }
    });
    req.on('end', () => {
      if (tooLarge) return;
      if (!body || !body.trim()) return cb(null, {});
      let parsed;
      try { parsed = JSON.parse(body); } catch { return cb(new Error('Bad JSON')); }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return cb(new Error('Expected a JSON object'));
      cb(null, parsed);
    });
  }

  function json(statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  // Default-deny API access; displays can only read projected content.
  const publicReads = new Set(['/api/state', '/api/events', '/api/session', '/api/version', '/api/remote-server/status', '/api/output-status']);
  const operatorPosts = new Set(['/api/control', '/api/session/leave', '/api/session/shadow-deck', '/api/session/push-to-host', '/api/import-request']);
  const operatorReads = new Set(['/api/catalog', '/api/session/catalog', '/api/control-events', '/api/network', '/api/lyrics/search', '/api/bibles/catalog']);
  const publicRead = req.method === 'GET' && (publicReads.has(pathname) || pathname.startsWith('/api/lexicon/'));
  const operatorAccess = identity?.role === 'operator' && remoteSession.enabled && (
    (req.method === 'POST' && operatorPosts.has(pathname)) ||
    (req.method === 'GET' && (operatorReads.has(pathname) || pathname === `/api/operator-events/${identity.operatorId}` || (remoteSession.privileges.importBibles && pathname.startsWith('/api/bibles/download/')))) ||
    (remoteSession.privileges.importBibles && ['GET', 'POST'].includes(req.method) && /^\/api\/content-packs\/[A-Z0-9_]+$/.test(pathname))
  );
  if (pathname.startsWith('/api/') && !isHost && !publicRead && !operatorAccess && !['/api/session/join', '/api/output-ack'].includes(pathname)) {
    return json(403, { error: remoteSession.enabled ? 'Pair this device with the host to continue' : 'Remote session is offline', pairingRequired: remoteSession.enabled, sessionOffline: !remoteSession.enabled, revision: remoteSession.revision });
  }
  if (!isHost && pathname === '/api/session' && req.method === 'GET') {
    return json(200, { enabled: remoteSession.enabled, revision: remoteSession.revision, paired: identity?.role === 'operator', privileges: identity ? remoteSession.privileges : {}, importMode: remoteSession.importMode });
  }
  if (!isHost && pathname === '/api/session/push-to-host' && (!remoteSession.privileges.importSongsDirect || !remoteSession.privileges.addAgendaItems)) {
    return json(403, { error: 'The host has not allowed library and agenda uploads' });
  }
  if (!isHost && pathname === '/api/import-request' && !remoteSession.privileges.importSongsRequest) {
    return json(403, { error: 'The host has not allowed import requests' });
  }
  if (pathname === '/api/semantic/query' && req.method === 'POST') {
    readBody((err, payload) => {
      if (err || typeof payload.text !== 'string' || payload.text.length > 2000 || payload.version !== 'KJV') return json(400, { error: 'Expected KJV text up to 2000 characters.' });
      semanticService.query(payload.text).then(result => json(200, { result })).catch(() => json(503, { error: 'Semantic retrieval unavailable or busy.' }));
    });
    return;
  }
  if (pathname === '/api/presentation-media' && req.method === 'GET') {
    Promise.all([presentationMedia.list(),sanctuaryMedia.list()]).then(([media,backgrounds])=>json(200,{items:[...media,...backgrounds.map(sharedMediaLibrary.asPresentation)].sort((a,b)=>b.createdAt-a.createdAt)})).catch(() => json(500, {error:'Could not read presentation media.'})); return;
  }
  if (['/api/presentation-media','/api/presentation-media/page'].includes(pathname) && req.method === 'POST') {
    const action=pathname.endsWith('/page') ? 'page':'upload';
    presentationMedia[action](req,reqUrl.searchParams).then(item=>json(201,{item})).catch(error=>{if(!res.destroyed) json(error.status || 500,{error:error.status ? error.message:'Could not save media. Check available disk space.'});}); return;
  }
  if (pathname.startsWith('/presentation/files/') && ['GET','HEAD'].includes(req.method)) {
    presentationMedia.serve(req,res,pathname).catch(()=>{if(!res.headersSent) res.writeHead(500);res.end();}); return;
  }
  if (pathname === '/api/sanctuary-media' && req.method === 'GET') {
    Promise.all([sanctuaryMedia.list(),presentationMedia.list()]).then(([backgrounds,media])=>json(200,{items:[...backgrounds,...media.map(sharedMediaLibrary.asBackground).filter(Boolean)].sort((a,b)=>b.createdAt-a.createdAt)})).catch(() => json(500, { error: 'Could not read uploaded backgrounds.' }));
    return;
  }
  if (pathname === '/api/sanctuary-media' && req.method === 'POST') {
    sanctuaryMedia.upload(req, reqUrl.searchParams).then(item => json(201, { item })).catch(error => {
      if (!res.destroyed) json(error.status || 500, { error: error.status ? error.message : 'Could not save this background. Check available disk space.' });
    });
    return;
  }
  if (pathname === '/api/sanctuary-media' && req.method === 'DELETE') {
    const id = reqUrl.searchParams.get('id');
    (id?.startsWith('media_')?presentationMedia:sanctuaryMedia).remove(id).then(result => json(200, result)).catch(error => {
      if (!res.destroyed) json(error.status || 500, { error: error.message || 'Could not delete this background.' });
    });
    return;
  }
  if (pathname.startsWith('/media/uploads/') && ['GET', 'HEAD'].includes(req.method)) {
    sanctuaryMedia.serve(req, res, pathname).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
    return;
  }
  if (pathname === '/api/migrate/scan' && req.method === 'POST') {
    readBody((err, payload) => {
      if (err || !payload || typeof payload.folderPath !== 'string') {
        return json(400, { error: 'Invalid folderPath provided' });
      }
      softwareMigrator.scan(payload.folderPath.trim())
        .then(result => json(200, result))
        .catch(err => json(400, { error: err.message }));
    });
    return;
  }
  if (pathname === '/api/migrate/execute' && req.method === 'POST') {
    readBody((err, payload) => {
      if (err || !payload || typeof payload.folderPath !== 'string') {
        return json(400, { error: 'Invalid folderPath provided' });
      }
      softwareMigrator.execute(payload)
        .then(result => json(200, result))
        .catch(err => json(500, { error: err.message }));
    });
    return;
  }
  if (pathname === '/api/output-status' && req.method === 'GET') return json(200, { outputs: outputs.snapshot(currentState._outputRevision) });
  if (pathname === '/api/hold' && req.method === 'POST') {
    readBody((err, payload) => {
      if (err) return json(400, { error: 'Invalid hold state' });
      held = payload.held === true;
      publishState();
      json(200, { held });
    });
    return;
  }
  if (pathname === '/api/output-ack' && req.method === 'POST') {
    readBody((err, payload) => {
      if (err || !outputs.acknowledge(payload.id, payload.revision, payload.viewport)) return json(403, { error: 'Unknown display connection' });
      json(200, { success: true });
    });
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SESSION MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  // GET /api/network — returns active LAN IP addresses and actual bound port
  if (pathname === '/api/network' && req.method === 'GET') {
    const addresses = getLanAddresses();
    json(200, {
      addresses,
      port: currentBoundPort,
      preferred: addresses[0] || 'localhost'
    });
    return;
  }

  // GET /api/session — full session info for host panel
  if (pathname === '/api/session' && req.method === 'GET') {
    const addresses = getLanAddresses();
    // Prune operators that have no active SSE connection and did not join recently
    if (operatorClients.size > 0) {
      remoteSession.connectedOperators = remoteSession.connectedOperators.filter(o => operatorClients.has(o.id) || (Date.now() - (o.joinedAt || 0) < 15000));
    } else {
      remoteSession.connectedOperators = remoteSession.connectedOperators.filter(o => (Date.now() - (o.joinedAt || 0) < 15000));
    }
    json(200, {
      enabled: remoteSession.enabled,
      revision: remoteSession.revision,
      pairingCode: access.code(),
      importMode: remoteSession.importMode,
      privileges: remoteSession.privileges,
      connectedOperators: remoteSession.connectedOperators,
      savedProfiles: remoteSession.savedProfiles,
      pendingImports: remoteSession.pendingImports,
      hostSpeechState: hostSpeechState,
      lanUrl: addresses[0] ? `http://${addresses[0]}:${currentBoundPort}/remote` : null,
      port: currentBoundPort,
    });
    return;
  }

  // POST /api/session/start — host starts the session
  if (pathname === '/api/session/start' && req.method === 'POST') {
    readBody((err, payload) => {
      if (err) return json(400, { error: 'Bad JSON' });
      if (remoteSession.enabled) return json(200, { success: true, enabled: true, revision: remoteSession.revision });
      remoteSession.revision = Math.max(Date.now(), remoteSession.revision + 1);
      remoteSession.enabled = true;
      revokeOperatorAccess();
      access.rotate();
      remoteSession.privileges = { ...FULL_CONTROL_PRIVILEGES };
      remoteSession.importMode = 'direct';
      // Broadcast to any already-connected operator clients
      broadcastPrivilegeUpdate();
      // Also tell host control channel
      const ev = `data: ${JSON.stringify({ type: 'REMOTE_SERVER_STATUS', enabled: true, session: remoteSession })}\n\n`;
      controlClients.forEach(c => { try { c.write(ev); } catch {} });
      json(200, { success: true, enabled: true, revision: remoteSession.revision });
    });
    return;
  }

  // POST /api/session/stop — host stops the session
  if (pathname === '/api/session/stop' && req.method === 'POST') {
    if (remoteSession.enabled) remoteSession.revision = Math.max(Date.now(), remoteSession.revision + 1);
    remoteSession.enabled = false;
    revokeOperatorAccess();
    const ev = `data: ${JSON.stringify({ type: 'REMOTE_SERVER_STATUS', enabled: false, revision: remoteSession.revision })}\n\n`;
    controlClients.forEach(c => { try { c.write(ev); } catch {} });
    json(200, { success: true, enabled: false, revision: remoteSession.revision });
    return;
  }

  // POST /api/session/privileges — host updates privileges live
  if (pathname === '/api/session/privileges' && req.method === 'POST') {
    readBody((err, payload) => {
      if (err) return json(400, { error: 'Bad JSON' });
      if (payload.privileges && typeof payload.privileges === 'object') {
        remoteSession.privileges = { ...DEFAULT_PRIVILEGES, ...payload.privileges };
      }
      if (payload.importMode === 'direct' || payload.importMode === 'request') {
        remoteSession.importMode = payload.importMode;
      }
      broadcastPrivilegeUpdate();
      json(200, { success: true, privileges: remoteSession.privileges });
    });
    return;
  }

  // POST /api/session/profiles — save an operator profile
  if (pathname === '/api/session/profiles' && req.method === 'POST') {
    readBody((err, payload) => {
      if (err) return json(400, { error: 'Bad JSON' });
      if (!payload.name) return json(400, { error: 'Profile name required' });
      const existing = remoteSession.savedProfiles.findIndex(p => p.name === payload.name);
      const profile = {
        name: payload.name,
        privileges: payload.privileges || remoteSession.privileges,
        importMode: payload.importMode || remoteSession.importMode,
        savedAt: Date.now(),
      };
      if (existing >= 0) remoteSession.savedProfiles[existing] = profile;
      else remoteSession.savedProfiles.push(profile);
      json(200, { success: true, profiles: remoteSession.savedProfiles });
    });
    return;
  }

  // GET /api/session/profiles — list saved operator profiles
  if (pathname === '/api/session/profiles' && req.method === 'GET') {
    json(200, { profiles: remoteSession.savedProfiles });
    return;
  }

  // GET /api/version — returns current software release and update metadata
  if (pathname === '/api/version' && req.method === 'GET') {
    json(200, {
      appName: packageMetadata.build.productName,
      tagline: 'The Word in Motion',
      version: packageMetadata.version,
      build: packageMetadata.version,
      releaseDate: '2026-10-07',
      changelogUrl: 'https://github.com/EMWORLDLTD/Ginomai/releases',
      features: [
        'Bento Studio modular 3-zone architecture',
        '0ms tactile latency slide projection',
        'Scoped container scrolling with non-GPU hardware acceleration',
        'Integrated Deepgram Nova AI speech recognition',
        'KJV Strong\'s Greek/Hebrew Concordance'
      ]
    });
    return;
  }

  // POST /api/session/shadow-deck — operator pushes loaded song to host for crash continuity
  if (pathname === '/api/session/shadow-deck' && req.method === 'POST') {
    readBody((err, payload) => {
      if (err) return json(400, { error: 'Bad JSON' });
      shadowDeckState = { ...payload, updatedAt: Date.now() };
      // Forward silently to host as SHADOW_DECK command
      const ev = `data: ${JSON.stringify({ type: 'SHADOW_DECK', songId: payload.songId, songTitle: payload.songTitle, stanzas: payload.stanzas })}\n\n`;
      controlClients.forEach(c => { try { c.write(ev); } catch {} });
      json(200, { success: true });
    });
    return;
  }

  // GET /api/session/shadow-deck — host retrieves last shadow deck state
  if (pathname === '/api/session/shadow-deck' && req.method === 'GET') {
    json(200, shadowDeckState || { empty: true });
    return;
  }

  // POST /api/deepgram/verify-key — verify Deepgram API key server-side (avoids browser CORS)
  if (pathname === '/api/deepgram/verify-key' && req.method === 'POST') {
    readBody((err, payload) => {
      if (err) return json(400, { error: 'Bad JSON' });
      const apiKey = (payload && payload.apiKey) ? payload.apiKey.trim() : '';
      if (!apiKey) return json(400, { error: 'API key is required' });

      const https = require('https');
      let verificationFinished = false;
      const finishVerification = result => {
        if (verificationFinished) return;
        verificationFinished = true;
        json(200, result);
      };
      const reqDg = https.request('https://api.deepgram.com/v1/projects', {
        method: 'GET',
        headers: {
          'Authorization': `Token ${apiKey}`,
          'User-Agent': `Ginomai/${packageMetadata.version}`
        },
        timeout: 8000
      }, (resDg) => {
        let dgBody = '';
        resDg.on('data', chunk => { dgBody += chunk; });
        resDg.on('end', () => {
          if (resDg.statusCode >= 200 && resDg.statusCode < 300) {
            finishVerification({ success: true, valid: true });
          } else {
            finishVerification({ success: false, valid: false, status: resDg.statusCode, error: resDg.statusCode === 401 ? 'API key rejected' : resDg.statusCode === 403 ? 'Permission denied for project verification' : 'Deepgram verification service returned an error' });
          }
        });
      });

      reqDg.on('error', (netErr) => {
        finishVerification({ success: false, valid: null, code: netErr.code || 'NETWORK_ERROR', error: netErr.message || 'Could not connect to Deepgram server' });
      });

      reqDg.on('timeout', () => {
        finishVerification({ success: false, valid: null, code: 'ETIMEDOUT', error: 'Connection to Deepgram timed out' });
        reqDg.destroy();
      });

      reqDg.end();
    });
    return;
  }

  // POST /api/session/push-to-remote — host pushes full library & agenda to all remote operators
  if (pathname === '/api/session/push-to-remote' && req.method === 'POST') {
    readBody((err, payload) => {
      if (err) return json(400, { error: 'Bad JSON' });
      controlCatalog = {
        bible: (payload && typeof payload.bible === 'object') ? payload.bible : (controlCatalog.bible || {}),
        songs: Array.isArray(payload && payload.songs) ? payload.songs : (controlCatalog.songs || []),
        agendaItems: Array.isArray(payload && payload.agendaItems) ? payload.agendaItems : (controlCatalog.agendaItems || []),
        updatedAt: Date.now()
      };
      // Broadcast to operators via operator SSE & control channel
      broadcastToOperators({ type: 'CATALOG_PUSHED', catalog: controlCatalog });
      const ev = `data: ${JSON.stringify({ type: 'CATALOG_PUSHED', catalog: controlCatalog })}\n\n`;
      controlClients.forEach(c => { try { c.write(ev); } catch {} });
      json(200, { success: true, count: controlCatalog.songs.length, agendaCount: controlCatalog.agendaItems.length });
    });
    return;
  }

  // POST /api/session/push-to-operator — host pushes library & agenda to a single specific operator
  if (pathname === '/api/session/push-to-operator' && req.method === 'POST') {
    readBody((err, payload) => {
      if (err) return json(400, { error: 'Bad JSON' });
      const targetOpId = payload.operatorId;
      if (!targetOpId) return json(400, { error: 'operatorId is required' });

      const catalogData = {
        bible: (payload && typeof payload.bible === 'object') ? payload.bible : (controlCatalog.bible || {}),
        songs: Array.isArray(payload && payload.songs) ? payload.songs : (controlCatalog.songs || []),
        agendaItems: Array.isArray(payload && payload.agendaItems) ? payload.agendaItems : (controlCatalog.agendaItems || []),
        updatedAt: Date.now()
      };
      // Update master controlCatalog
      controlCatalog = catalogData;

      const targetRes = operatorClients.get(targetOpId);
      if (targetRes) {
        try {
          targetRes.write(`data: ${JSON.stringify({ type: 'CATALOG_PUSHED', catalog: catalogData, targeted: true })}\n\n`);
        } catch (e) {
          operatorClients.delete(targetOpId);
        }
      }
      json(200, { success: true, count: catalogData.songs.length, agendaCount: catalogData.agendaItems.length, operatorId: targetOpId });
    });
    return;
  }

  // POST /api/session/speech-ai-update — host broadcasts live Speech AI & Mic state to operators
  if (pathname === '/api/session/speech-ai-update' && req.method === 'POST') {
    readBody((err, payload) => {
      if (err) return json(400, { error: 'Bad JSON' });
      if (payload.isListening !== undefined) hostSpeechState.isListening = !!payload.isListening;
      if (payload.isRequested !== undefined) hostSpeechState.isRequested = !!payload.isRequested;
      if (['idle', 'connecting', 'listening', 'reconnecting', 'error'].includes(payload.status)) hostSpeechState.status = payload.status;
      if (typeof payload.message === 'string') hostSpeechState.message = payload.message.slice(0, 500);
      if (payload.transcript !== undefined) hostSpeechState.transcript = payload.transcript;
      if (payload.audioLevel !== undefined) hostSpeechState.audioLevel = payload.audioLevel;
      if (payload.detectedVerses && Array.isArray(payload.detectedVerses)) hostSpeechState.detectedVerses = payload.detectedVerses;
      if (payload.detectedSongs && Array.isArray(payload.detectedSongs)) hostSpeechState.detectedSongs = payload.detectedSongs;
      if (payload.paraphraseMatches && Array.isArray(payload.paraphraseMatches)) hostSpeechState.paraphraseMatches = payload.paraphraseMatches;
      if (payload.sermon && typeof payload.sermon === 'object') hostSpeechState.sermon = payload.sermon;
      hostSpeechState.updatedAt = Math.max(Date.now(), hostSpeechState.updatedAt + 1);

      currentState = { ...currentState, hostSpeechState, _timestamp: Date.now() };

      const speechEvent = `data: ${JSON.stringify({ type: 'SPEECH_AI_UPDATE', ...payload, hostSpeechState })}\n\n`;

      // 1. Broadcast to operators
      operatorClients.forEach((res, id) => {
        try { res.write(speechEvent); } catch { operatorClients.delete(id); }
      });
      // 2. Broadcast to control channels (all remote instances)
      controlClients.forEach(res => {
        try { res.write(speechEvent); } catch { controlClients.delete(res); }
      });
      // 3. Broadcast to display & stage preview stream
      sseClients.forEach(res => {
        if (res.sfAuthenticated) try { res.write(speechEvent); } catch { sseClients.delete(res); }
      });

      json(200, { success: true });
    });
    return;
  }

  // POST /api/session/push-to-host — remote operator pushes newly created/added songs & agenda items to host
  if (pathname === '/api/session/push-to-host' && req.method === 'POST') {
    readBody((err, payload) => {
      if (err) return json(400, { error: 'Bad JSON' });
      if (!remoteSession.enabled) return json(403, { error: 'Session not active', sessionOffline: true });
      const ev = `data: ${JSON.stringify({
        type: 'PUSH_TO_HOST',
        songs: Array.isArray(payload && payload.songs) ? payload.songs : [],
        agendaItems: Array.isArray(payload && payload.agendaItems) ? payload.agendaItems : [],
        operatorName: (payload && payload.operatorName) || 'Remote Operator',
        timestamp: Date.now()
      })}\n\n`;
      controlClients.forEach(c => { try { c.write(ev); } catch {} });
      json(200, { success: true, message: 'Changes sent to Host Studio.' });
    });
    return;
  }

  // GET /api/session/catalog — returns active control catalog
  if (pathname === '/api/session/catalog' && req.method === 'GET') {
    json(200, controlCatalog);
    return;
  }

  // ── Operator Join/Leave ─────────────────────────────────────────────────────

  // POST /api/session/join — operator registers with persistent deviceId
  if (pathname === '/api/session/join' && req.method === 'POST') {
    readBody((err, payload) => {
      if (err) return json(400, { error: 'Bad JSON' });
      if (!remoteSession.enabled) return json(403, { error: 'Session not active', sessionOffline: true, revision: remoteSession.revision });
      if (payload.revision !== undefined && payload.revision !== remoteSession.revision) {
        return json(409, { error: 'The host restarted remote access. Enter the current pairing code.', pairingRequired: true, revision: remoteSession.revision });
      }
      const currentIdentity = access.identify(req);
      const pairedId = currentIdentity?.role === 'operator' ? currentIdentity.operatorId : null;
      const newId = require('crypto').randomUUID();
      if (!pairedId && !access.pair(req, res, payload.pairingCode, newId)) {
        const retryAfter = access.retryAfter(req);
        return json(retryAfter ? 429 : 403, { error: retryAfter ? 'Too many incorrect codes.' : 'Incorrect pairing code. Enter the six-digit code from the host Broadcast Hub.', pairingRequired: true, retryAfter, revision: remoteSession.revision });
      }
      const deviceId = (payload.deviceId && typeof payload.deviceId === 'string') 
        ? payload.deviceId.trim() 
        : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const name = String(payload.name || 'Remote Operator').trim().slice(0, 40);
      
      // Check if device already exists in list (same browser refreshing)
      let opEntry = remoteSession.connectedOperators.find(o => o.id === pairedId);
      let operatorId;
      if (opEntry) {
        operatorId = opEntry.id;
        opEntry.name = name;
        opEntry.joinedAt = Date.now();
      } else {
        operatorId = pairedId || newId;
        opEntry = { id: operatorId, deviceId, name, joinedAt: Date.now() };
        remoteSession.connectedOperators.push(opEntry);
      }

      // Notify host of updated operators list & count
      const ev = `data: ${JSON.stringify({ type: 'OPERATORS_UPDATED', operators: remoteSession.connectedOperators, count: remoteSession.connectedOperators.length, operatorId, name })}\n\n`;
      controlClients.forEach(c => { try { c.write(ev); } catch {} });

      json(200, {
        revision: remoteSession.revision,
        operatorId,
        deviceId,
        name,
        privileges: remoteSession.privileges,
        importMode: remoteSession.importMode,
        catalog: controlCatalog,
        hostSpeechState: hostSpeechState,
      });
    });
    return;
  }

  // POST /api/session/leave — operator leaves
  if (pathname === '/api/session/leave' && req.method === 'POST') {
    readBody((err, payload) => {
      if (err) return json(400, {});
      const operatorId = isHost ? payload.operatorId : identity.operatorId;
      const deviceId = isHost ? payload.deviceId : null;
      remoteSession.connectedOperators = remoteSession.connectedOperators.filter(o => 
        o.id !== operatorId && (!deviceId || o.deviceId !== deviceId)
      );
      if (operatorId) operatorClients.delete(operatorId);
      const ev = `data: ${JSON.stringify({ type: 'OPERATORS_UPDATED', operators: remoteSession.connectedOperators, count: remoteSession.connectedOperators.length, operatorId })}\n\n`;
      controlClients.forEach(c => { try { c.write(ev); } catch {} });
      json(200, { success: true });
    });
    return;
  }

  // GET /api/operator-events/:operatorId — SSE channel for privilege updates & live tracking
  if (pathname.startsWith('/api/operator-events/') && req.method === 'GET') {
    if (!remoteSession.enabled) { json(403, { error: 'Session not active' }); return; }
    const operatorId = pathname.split('/').pop();
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    // Send current privileges, catalog & host speech state immediately
    res.write(`data: ${JSON.stringify({ type: 'PRIVILEGE_UPDATE', privileges: remoteSession.privileges, importMode: remoteSession.importMode, sessionEnabled: remoteSession.enabled })}\n\n`);
    if (controlCatalog && (controlCatalog.songs?.length || controlCatalog.agendaItems?.length)) {
      res.write(`data: ${JSON.stringify({ type: 'CATALOG_PUSHED', catalog: controlCatalog })}\n\n`);
    }
    if (hostSpeechState) {
      res.write(`data: ${JSON.stringify({ type: 'SPEECH_AI_UPDATE', hostSpeechState, fullSync: true })}\n\n`);
    }

    if (operatorClients.has(operatorId)) {
      try { operatorClients.get(operatorId).end(); } catch (e) {}
    }
    operatorClients.set(operatorId, res);

    req.on('close', () => {
      if (operatorClients.get(operatorId) !== res) return;
      operatorClients.delete(operatorId);
      remoteSession.connectedOperators = remoteSession.connectedOperators.filter(o => o.id !== operatorId);
      const ev = `data: ${JSON.stringify({ type: 'OPERATORS_UPDATED', operators: remoteSession.connectedOperators, count: remoteSession.connectedOperators.length, operatorId })}\n\n`;
      controlClients.forEach(c => { try { c.write(ev); } catch {} });
    });
    return;
  }

  // ── Import Requests ─────────────────────────────────────────────────────────

  // POST /api/import-request — operator proposes a new song (request mode)
  if (pathname === '/api/import-request' && req.method === 'POST') {
    readBody((err, payload) => {
      if (err) return json(400, { error: 'Bad JSON' });
      if (!remoteSession.enabled) return json(403, { error: 'Session not active' });
      const importId = `imp_${Date.now()}`;
      const operatorId = isHost ? payload.operatorId : identity.operatorId;
      const operator = remoteSession.connectedOperators.find(o => o.id === operatorId) || { name: 'Operator' };
      const entry = {
        id: importId,
        operatorId,
        operatorName: operator.name,
        song: payload.song,
        timestamp: Date.now(),
      };
      remoteSession.pendingImports.push(entry);
      // Notify host
      const ev = `data: ${JSON.stringify({ type: 'IMPORT_REQUEST', ...entry })}\n\n`;
      controlClients.forEach(c => { try { c.write(ev); } catch {} });
      json(202, { accepted: true, importId, message: 'Song sent to host for approval. You can project it in the meantime.' });
    });
    return;
  }

  // POST /api/import-request/:importId/accept — host accepts a pending import
  if (pathname.match(/^\/api\/import-request\/[^/]+\/accept$/) && req.method === 'POST') {
    const importId = pathname.split('/')[3];
    const entry = remoteSession.pendingImports.find(e => e.id === importId);
    if (!entry) return json(404, { error: 'Import request not found' });
    remoteSession.pendingImports = remoteSession.pendingImports.filter(e => e.id !== importId);
    // Forward as CATALOG_UPDATE to host control channel
    const ev = `data: ${JSON.stringify({ type: 'IMPORT_ACCEPTED', importId, song: entry.song })}\n\n`;
    controlClients.forEach(c => { try { c.write(ev); } catch {} });
    // Notify operator
    if (entry.operatorId && operatorClients.has(entry.operatorId)) {
      operatorClients.get(entry.operatorId).write(`data: ${JSON.stringify({ type: 'IMPORT_ACCEPTED', importId, songTitle: entry.song.title })}\n\n`);
    }
    json(200, { success: true });
    return;
  }

  // POST /api/import-request/:importId/dismiss — host dismisses
  if (pathname.match(/^\/api\/import-request\/[^/]+\/dismiss$/) && req.method === 'POST') {
    const importId = pathname.split('/')[3];
    remoteSession.pendingImports = remoteSession.pendingImports.filter(e => e.id !== importId);
    json(200, { success: true });
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EXISTING ENDPOINTS (preserved, upgraded)
  // ─────────────────────────────────────────────────────────────────────────────

  // Legacy status endpoint — kept for backward compat
  if (pathname === '/api/remote-server/status' && req.method === 'GET') {
    json(200, { enabled: remoteSession.enabled });
    return;
  }

  // Toggle remote server endpoint
  if (pathname === '/api/remote-server/toggle' && req.method === 'POST') {
    remoteSession.revision = Math.max(Date.now(), remoteSession.revision + 1);
    remoteSession.enabled = !remoteSession.enabled;
    revokeOperatorAccess();
    if (remoteSession.enabled) access.rotate();
    if (remoteSession.enabled) {
      remoteSession.privileges = { ...FULL_CONTROL_PRIVILEGES };
      remoteSession.importMode = 'direct';
      broadcastPrivilegeUpdate();
      const ev = `data: ${JSON.stringify({ type: 'REMOTE_SERVER_STATUS', enabled: true, session: remoteSession })}\n\n`;
      controlClients.forEach(c => { try { c.write(ev); } catch {} });
    } else {
      remoteSession.connectedOperators = [];
      remoteSession.pendingImports = [];
      broadcastToOperators({ type: 'SESSION_ENDED' });
      const ev = `data: ${JSON.stringify({ type: 'REMOTE_SERVER_STATUS', enabled: false, revision: remoteSession.revision })}\n\n`;
      controlClients.forEach(c => { try { c.write(ev); } catch {} });
    }
    json(200, { success: true, enabled: remoteSession.enabled });
    return;
  }

  if (pathname === '/api/state' && req.method === 'GET') {
    json(200, displayState(Boolean(identity)));
    return;
  }

  if (pathname === '/api/network' && req.method === 'GET') {
    const addresses = getLanAddresses();
    json(200, { addresses, preferredAddress: addresses[0] || null, port: PORT, remoteServerEnabled: remoteSession.enabled });
    return;
  }

  if (pathname === '/api/sync' && req.method === 'POST') {
    readBody(async (err, payload) => {
      if (err) return json(400, { error: 'Invalid JSON' });
      if (Number.isFinite(payload._timestamp) && payload._timestamp < (currentState._clientTimestamp || 0)) {
        return json(409, { error: 'A newer live update has already been received' });
      }
      currentState = { ...payload, _clientTimestamp: payload._timestamp || 0,
        _timestamp: Math.max(Date.now(), currentState._timestamp + 1) };
      publishState();
      await liveStateStore.flush();
      json(200, { success: true, timestamp: currentState._timestamp });
    });
    return;
  }

  if (pathname === '/api/workspace' && req.method === 'POST') {
    readBody((err, payload) => {
      if (err || !payload.dashboard || typeof payload.dashboard !== 'object' || Array.isArray(payload.dashboard)) {
        return json(400, { error: 'Expected a workspace dashboard' });
      }
      currentState.dashboard = payload.dashboard;
      // Operators receive workspace navigation without changing public output state.
      sseClients.forEach(client => {
        if (!client.sfAuthenticated) return;
        try { client.write(`data: ${JSON.stringify(displayState(true))}\n\n`); } catch { sseClients.delete(client); }
      });
      liveStateStore.save(currentState);
      json(200, { success: true });
    });
    return;
  }

  if (pathname === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.sfAuthenticated = Boolean(identity);
    res.sfOperator = identity?.role === 'operator';
    const displayId = outputs.connect(reqUrl.searchParams.get('target'), res);
    res.write(`data: ${JSON.stringify(displayState(Boolean(identity)))}\n\n`);
    sseClients.add(res);
    req.on('close', () => { sseClients.delete(res); outputs.disconnect(displayId); });
    return;
  }

  if (pathname === '/api/control' && req.method === 'POST') {
    readBody((err, command) => {
      if (err || !command || typeof command.type !== 'string') return json(400, { error: 'Invalid command' });

      if (!isHost) {
        command._fromRemote = true;
        command.operatorId = identity.operatorId;
        if (held && ['PROJECT', 'NAVIGATE'].includes(command.type)) return json(409, { error: 'The host is holding the live output' });
        // Block if session is not active
        if (!remoteSession.enabled) {
          return json(403, { error: 'Remote session is offline', sessionOffline: true });
        }
        // Validate against active privileges
        if (!isCommandAllowed(command, remoteSession.privileges)) {
          return json(403, { error: 'Action not permitted by host', privilegeDenied: true, type: command.type });
        }
        if (command.type === 'STATE_PATCH') command.patch = createAccessControl.filterPatch(command.patch || {}, remoteSession.privileges);
      }

      // Zero-latency direct broadcast to OBS / Displays / Projector
      if (command.type === 'PROJECT' && typeof command.text === 'string') {
        const isLex = Boolean(command.isLexicon || (command.slideId && command.slideId.startsWith('lexicon_')));
        currentState = {
          ...currentState,
          text: command.text,
          reference: command.reference || '',
          slideId: command.slideId || ('remote_' + Date.now()),
          _operatorRequestId: command._operatorRequestId || null,
          contentType: command.contentType || (isLex ? 'lexicon' : 'bible'),
          isLexicon: isLex,
          lexiconData: isLex ? (command.lexiconData || null) : null,
          lexiconStyle: isLex ? (command.lexiconStyle || null) : null,
          lexiconDisplayMode: isLex ? (command.lexiconDisplayMode || null) : null,
          concordancePosition: isLex ? (command.concordancePosition || (command.lexiconData && command.lexiconData.position) || null) : null,
          englishWord: isLex ? (command.englishWord || '') : '',
          compareData: command.compareData || null,
          clear: false,
          blackout: false,
          _timestamp: Date.now()
        };
        publishState();
        command._committedLiveState = displayState(true);
      } else if (command.type === 'SET_HOLD') {
        held = command.enabled === true;
        publishState();
      } else if (command.type === 'CLEAR') {
        currentState = {
          ...currentState,
          clear: true,
          blackout: false,
          _timestamp: Date.now()
        };
        publishState();
      } else if (command.type === 'BLACKOUT') {
        currentState = {
          ...currentState,
          blackout: true,
          clear: false,
          _timestamp: Date.now()
        };
        publishState();
      } else if (command.type === 'ALERT_UPDATE') {
        currentState = {
          ...currentState,
          alert: command.alert || null,
          _timestamp: Date.now()
        };
        publishState();
      }

      // Concurrently forward command to host studio
      const event = `data: ${JSON.stringify(command)}\n\n`;
      controlClients.forEach(client => {
        try { client.write(event); } catch { controlClients.delete(client); }
      });
      json(202, { accepted: true });
    });
    return;
  }

  if (pathname === '/api/control-events' && req.method === 'GET') {
    res.sfOperator = identity?.role === 'operator';
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    if (hostSpeechState) {
      res.write(`data: ${JSON.stringify({ type: 'SPEECH_AI_UPDATE', hostSpeechState, fullSync: true })}\n\n`);
    }
    controlClients.add(res);
    req.on('close', () => controlClients.delete(res));
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CLOUD LYRICS & ONLINE BIBLES API PROXY
  // ─────────────────────────────────────────────────────────────────────────────

  // ─── Multi-Engine Cloud Lyrics Helpers ─────────────────────────────────────
  function decodeHtmlEntities(str) {
    if (!str) return '';
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
  }

  function cleanGeniusText(text) {
    if (!text) return '';
    return text
      .replace(/^\d+\s*Contributors?.*?Lyrics\s*/is, '')
      .replace(/^\d+\s*Contributors?\s*/is, '')
      .replace(/^.*?Lyrics\s*(?=\[)/is, '')
      .replace(/You might also like/gi, '')
      .replace(/\d*\s*Embed$/gi, '')
      .trim();
  }

  function cleanHtmlToPlainText(html) {
    if (!html) return '';
    let text = html
      .replace(/<br\s*\/?>[ \t]*\r?\n?/gi, '\n')
      .replace(/<\/p>[ \t]*\r?\n?/gi, '\n\n')
      .replace(/<\/div>[ \t]*\r?\n?/gi, '\n')
      .replace(/<[^>]+>/g, '');
    text = decodeHtmlEntities(text);
    text = text.replace(/\\'/g, "'").replace(/\\"/g, '"');
    return text.split(/\r?\n/).map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function extractLyricsFromGeneralHtml(html) {
    if (!html) return null;
    // 1. AZLyrics comment signature
    const azMatch = /<!-- Usage of azlyrics\.com content[\s\S]*?-->([\s\S]*?)<\/div>/i.exec(html);
    if (azMatch && azMatch[1]) {
      const cleaned = cleanHtmlToPlainText(azMatch[1]);
      if (cleaned.length > 30) return cleaned;
    }

    // 2. SongLyrics container signature
    const slMatch = /<p[^>]*id="songLyricsDiv"[^>]*>([\s\S]*?)<\/p>/i.exec(html);
    if (slMatch && slMatch[1]) {
      const cleaned = cleanHtmlToPlainText(slMatch[1]);
      if (cleaned.length > 30 && !cleaned.includes('do not have the lyrics for this song')) return cleaned;
    }

    // 3. Genius data-lyrics-container signature (balanced container parsing to preserve inner nested tags)
    if (html.includes('data-lyrics-container="true"')) {
      const geniusBlocks = [];
      let idx = 0;
      while ((idx = html.indexOf('data-lyrics-container="true"', idx)) !== -1) {
        const startTagEnd = html.indexOf('>', idx);
        if (startTagEnd === -1) break;
        let depth = 1;
        let pos = startTagEnd + 1;
        while (depth > 0 && pos < html.length) {
          const nextOpen = html.indexOf('<div', pos);
          const nextClose = html.indexOf('</div>', pos);
          if (nextClose === -1) break;
          if (nextOpen !== -1 && nextOpen < nextClose) {
            depth++;
            pos = nextOpen + 4;
          } else {
            depth--;
            if (depth === 0) {
              geniusBlocks.push(html.slice(startTagEnd + 1, nextClose));
              pos = nextClose + 6;
              idx = pos;
              break;
            }
            pos = nextClose + 6;
          }
        }
        if (pos >= html.length || depth > 0) {
          idx = startTagEnd + 1;
        }
      }
      if (geniusBlocks.length > 0) {
        const combined = geniusBlocks.join('\n\n');
        const cleaned = cleanGeniusText(cleanHtmlToPlainText(combined));
        if (cleaned.length > 30) return cleaned;
      }
    }

    // 4. Hymnary columns (authority_columns, text_columns, hymn-text)
    const hymnaryMatch = /<div[^>]*class="[^"]*(?:authority_columns|text_columns|hymn-text)[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
    if (hymnaryMatch && hymnaryMatch[1]) {
      const cleaned = cleanHtmlToPlainText(hymnaryMatch[1]);
      if (cleaned.length > 30) return cleaned;
    }

    // 5. Common lyrics classes / ids (GospelLyrics, ZionLyrics, WalkOfGrace, PraiseCharts, WorshipTogether, etc.)
    const genericMatch = /<(?:div|article|section|p)[^>]*(?:id|class)="[^"]*(?:entry-content|post-content|song-content|lyrics-body|lyric-body|lyrics-content|lyrics-text|song-lyrics|lyricbox|lyrics-box|lyrics|song-panel|song-main)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article|section|p)>/i.exec(html);
    if (genericMatch && genericMatch[1]) {
      const cleaned = cleanHtmlToPlainText(genericMatch[1]);
      if (cleaned.length > 30) return cleaned;
    }

    return null;
  }

  // Specialized extractor for CeeNaija gospel articles
  function extractLyricsFromCeeNaijaHtml(html) {
    if (!html) return null;
    const entryMatch = /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
    const content = entryMatch ? entryMatch[1] : html;

    // Isolate section following "Lyrics:" / "LYRICS" header if present
    const lyricHeaderMatch = /(?:<h[2-4][^>]*>|<strong[^>]*>|<b[^>]*>|<p[^>]*>)\s*(?:lyrics|lyrics\s*video|official\s*lyrics|lyrics\s*below)[\s\S]*?<\/(?:h[2-4]|strong|b|p)>([\s\S]*)$/i.exec(content);
    let rawBlock = lyricHeaderMatch ? lyricHeaderMatch[1] : content;

    // Strip trailing download links, audio players, and related tags
    rawBlock = rawBlock.replace(/(?:<h[2-4][^>]*>|<strong[^>]*>|<b[^>]*>|<p[^>]*>)\s*(?:download|watch\s*video|stream|share|related|comments|audio|mp3)[\s\S]*$/i, '');

    const cleaned = cleanHtmlToPlainText(rawBlock);
    return cleaned.length > 30 ? cleaned : cleanHtmlToPlainText(content);
  }

  // Normalization helpers for title and artist matching and deduplication
  function normalizeTitle(raw) {
    if (!raw) return '';
    return raw
      .toLowerCase()
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\s*\((?:feat\.|ft\.|with|version|remix|live|official|video|audio).*?\)/gi, '')
      .replace(/\s*\[(?:feat\.|ft\.|with|version|remix|live|official|video|audio).*?\]/gi, '')
      .replace(/\s*(?:feat\.|ft\.|with)\s+.*$/gi, '')
      .replace(/\b(?:ii|iii|iv|v|vi|part\s*\d+|pt\.?\s*\d+)\b/gi, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeArtist(raw) {
    if (!raw) return '';
    return raw
      .toLowerCase()
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\s*\((?:feat\.|ft\.|with).*?\)/gi, '')
      .replace(/\s*\[(?:feat\.|ft\.|with).*?\]/gi, '')
      .replace(/\s*(?:feat\.|ft\.|with)\s+.*$/gi, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Relevance scorer prioritizing exact title matches, refrain/chorus matches, and Christian/worship catalogs
  const stopWords = new Set(['a', 'an', 'the', 'in', 'on', 'of', 'and', 'or', 'for', 'to', 'by', 'with', 'lyrics', 'song', 'live']);

  function scoreSongRelevance(song, query) {
    const qClean = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const titleClean = (song.title || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const authorClean = (song.author || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const titleNorm = normalizeTitle(song.title);
    const qNorm = normalizeTitle(query);
    const qTokens = qClean.split(/\s+/).filter(w => w.length > 1 && !stopWords.has(w));

    let baseScore = 0;

    // 1. Title matching:
    if (titleClean === qClean) {
      baseScore = 1000;
    } else if (titleNorm && qNorm && titleNorm === qNorm) {
      baseScore = 980; // "No Turning Back II" matches "No Turning Back" with 980
    } else if (titleNorm && qNorm && (titleNorm.startsWith(qNorm) || qNorm.startsWith(titleNorm))) {
      baseScore = 700;
    } else if (titleClean.includes(qClean)) {
      baseScore = 550;
    } else if (qClean.includes(titleClean) && titleClean.length > 5) {
      baseScore = 450;
    } else if (qTokens.length > 0) {
      const tTokens = titleNorm.split(/\s+/).filter(w => w.length > 1 && !stopWords.has(w));
      let matches = 0;
      for (const qt of qTokens) {
        if (tTokens.includes(qt)) {
          matches++;
        } else if (tTokens.some(tt => tt.includes(qt) || qt.includes(tt))) {
          matches += 0.5;
        }
      }
      baseScore = (matches / qTokens.length) * 200;
    }

    // 2. Refrain, Chorus, and In-Line Lyrics Matching:
    // If user searches by in-line lyrics, chorus, or refrain (without knowing the song title):
    let lyricScore = 0;
    if (Array.isArray(song.stanzas)) {
      for (const st of song.stanzas) {
        const stType = (st.type || '').toLowerCase();
        const stTextNorm = (st.text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
        if (!stTextNorm) continue;

        if (qClean && stTextNorm.includes(qClean)) {
          const isChorus = /chorus|refrain/i.test(stType);
          const occurrences = (stTextNorm.match(new RegExp(`\\b${qClean}\\b`, 'g')) || []).length;
          const scoreForStanza = isChorus
            ? 850 + Math.min(occurrences * 40, 100)
            : 650 + Math.min(occurrences * 30, 80);
          if (scoreForStanza > lyricScore) {
            lyricScore = scoreForStanza;
          }
        } else if (qTokens.length >= 2) {
          // In-line lyrics keyword overlap within a single stanza
          let matchedTokens = 0;
          for (const qt of qTokens) {
            if (stTextNorm.includes(qt)) matchedTokens++;
          }
          const ratio = matchedTokens / qTokens.length;
          if (ratio >= 0.5) {
            const inlineScore = 450 + Math.round(ratio * 250); // 575 to 700 points
            if (inlineScore > lyricScore) {
              lyricScore = inlineScore;
            }
          }
        }
      }
    }

    // Take the maximum of base title score or lyric/refrain score
    let score = Math.max(baseScore, lyricScore);

    // 3. Author match boost
    for (const qt of qTokens) {
      if (authorClean.includes(qt)) {
        score += 30;
      }
    }

    // 4. Christian / Gospel / Worship Priority Boost
    const isChristianSource = /hymnary|hymnal|church|christian|ceenaija|gospel/i.test(song.source || '')
      || /hymn|worship|gospel|praise|christ/i.test(song.album || '')
      || /hymn|worship|gospel|praise|christ/i.test(song.songbook || '');
    if (isChristianSource) {
      score += 60;
    }

    return Math.round(score);
  }

  function isMetadataOrSourceLine(line) {
    if (!line) return false;
    const clean = line.trim();
    return /^(source|hymnal|songbook|tune|author|composer|written by|words and music|words by|music by|copyright|ccli|published by|recorded by|album|key|meter|scripture)\s*:/i.test(clean)
      || /^(copyright|all rights reserved|public domain|used by permission|©)/i.test(clean);
  }

  // Helper: Parse lyrics text into structured presentation stanzas
  function parseLyricsToStanzas(rawLyrics, fallbackTitle = '') {
    if (!rawLyrics || typeof rawLyrics !== 'string') return [{ type: 'Verse 1', text: fallbackTitle || 'Lyrics' }];
    // Remove LRC timestamps e.g. [01:23.45] and unescape escaped quotes
    let clean = rawLyrics
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\[\d{2}:\d{2}(?:\.\d{1,3})?\]/g, '')
      .trim();
    const rawLines = clean.split(/\r?\n/).map(l => l.trim());
    const stanzas = [];
    let currentType = 'Verse 1';
    let currentLines = [];
    let verseCounter = 1;
    let chorusCounter = 1;
    let bridgeCounter = 1;

    for (let i = 0; i < rawLines.length; i++) {
      let line = rawLines[i];
      if (!line) {
        if (currentLines.length > 0) {
          stanzas.push({ type: currentType, text: currentLines.join('\n') });
          currentLines = [];
          if (currentType.startsWith('Verse')) {
            verseCounter++;
            currentType = `Verse ${verseCounter}`;
          }
        }
        continue;
      }

      // Filter out metadata and source citation lines e.g. "Source: Sing 'N' Praise Hymnal Vol. 2 #21"
      if (isMetadataOrSourceLine(line)) {
        continue;
      }

      const headerMatch = line.match(/^\[?(verse|chorus|bridge|pre-chorus|tag|intro|outro|v|c|b|p)\s*(\d*)\]?:?$/i);
      if (headerMatch) {
        if (currentLines.length > 0) {
          stanzas.push({ type: currentType, text: currentLines.join('\n') });
          currentLines = [];
        }
        const rawTag = headerMatch[1].toLowerCase();
        const num = headerMatch[2];
        if (rawTag.startsWith('v')) {
          currentType = num ? `Verse ${num}` : `Verse ${verseCounter++}`;
        } else if (rawTag.startsWith('c')) {
          currentType = num ? `Chorus ${num}` : (chorusCounter > 1 ? `Chorus ${chorusCounter}` : 'Chorus');
          chorusCounter++;
        } else if (rawTag.startsWith('b')) {
          currentType = num ? `Bridge ${num}` : (bridgeCounter > 1 ? `Bridge ${bridgeCounter}` : 'Bridge');
          bridgeCounter++;
        } else if (rawTag.startsWith('p')) {
          currentType = 'Pre-Chorus';
        } else {
          currentType = rawTag.charAt(0).toUpperCase() + rawTag.slice(1);
        }
        continue;
      }

      // Numbered Hymn Stanza e.g. "1 He paid a debt...", "2 He paid that debt...", "1. He paid..."
      const hymnNumMatch = line.match(/^(\d+)[\.\)\:\s]+(.*)$/);
      if (hymnNumMatch) {
        const vNum = parseInt(hymnNumMatch[1], 10);
        const restOfLine = hymnNumMatch[2].trim();
        if (vNum >= 1 && vNum <= 25) {
          if (currentLines.length === 0) {
            currentType = `Verse ${vNum}`;
            verseCounter = vNum + 1;
            line = restOfLine;
          } else if (vNum > 1) {
            stanzas.push({ type: currentType, text: currentLines.join('\n') });
            currentLines = [];
            currentType = `Verse ${vNum}`;
            verseCounter = vNum + 1;
            line = restOfLine;
          }
        }
      }

      currentLines.push(line);
      // Chunk every 4 lines if no explicit headers and paragraph is long
      if (currentLines.length >= 4 && (i + 1 < rawLines.length && !rawLines[i + 1])) {
        stanzas.push({ type: currentType, text: currentLines.join('\n') });
        currentLines = [];
        if (currentType.startsWith('Verse')) {
          verseCounter++;
          currentType = `Verse ${verseCounter}`;
        }
      }
    }

    if (currentLines.length > 0) {
      stanzas.push({ type: currentType, text: currentLines.join('\n') });
    }

    return stanzas.length > 0 ? stanzas : [{ type: 'Verse 1', text: rawLyrics.trim() }];
  }

  // Helper to build clean, unescaped preview snippets
  function buildPreviewSnippet(stanzas) {
    if (!Array.isArray(stanzas) || stanzas.length === 0) return '';
    return stanzas
      .map(s => s.text || '')
      .join(' ')
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\r?\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160) + '...';
  }

  // ─── Individual Free Lyrics Engines ───────────────────────────────────────

  // Engine 1: LRCLIB (Clean synchronized/plain lyrics repository)
  async function fetchFromLrclib(queryTerm, artist = '') {
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(queryTerm)}`;
    let response = await fetch(searchUrl, {
      headers: { 'User-Agent': `Ginomai/${packageMetadata.version}` },
      signal: AbortSignal.timeout(4500)
    });

    if (response.status === 503 || response.status === 429 || response.status === 502) {
      await new Promise(r => setTimeout(r, 300));
      response = await fetch(searchUrl, {
        headers: { 'User-Agent': `Ginomai/${packageMetadata.version}` },
        signal: AbortSignal.timeout(4500)
      });
    }

    if (!response.ok) return [];
    const data = await response.json();
    return (Array.isArray(data) ? data : [])
      .filter(item => (item.plainLyrics || item.syncedLyrics) && (item.trackName || item.name))
      .slice(0, 4)
      .map(item => {
        const rawLyrics = item.plainLyrics || item.syncedLyrics || '';
        const trackTitle = (item.trackName || item.name || 'Untitled Song').trim();
        const trackArtist = (item.artistName || artist || 'Unknown Artist').trim();
        const stanzas = parseLyricsToStanzas(rawLyrics, trackTitle);
        const previewSnippet = buildPreviewSnippet(stanzas);

        return {
          id: item.id ? `lrc_${item.id}` : `song_lrc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          title: trackTitle,
          author: trackArtist,
          album: item.albumName || '',
          duration: item.duration || 0,
          songbook: 'Cloud Worship',
          source: 'LRCLIB',
          previewText: previewSnippet,
          stanzas: stanzas
        };
      });
  }

  // Engine 2: Genius Open Search & Dedicated Lyrics Search (Massive contemporary worship, gospel & world catalog)
  async function fetchFromGenius(queryTerm, artist = '') {
    const browserUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    const hitMap = new Map();

    const [multiRes, lyricRes] = await Promise.allSettled([
      fetch(`https://genius.com/api/search/multi?q=${encodeURIComponent(queryTerm)}`, {
        headers: { 'User-Agent': browserUa, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(3500)
      }),
      fetch(`https://genius.com/api/search/lyric?q=${encodeURIComponent(queryTerm)}`, {
        headers: { 'User-Agent': browserUa, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(3500)
      })
    ]);

    // Prioritize top_hit first, then dedicated lyrics hits, then general song hits
    const topHits = [];
    const lyricHits = [];
    const otherHits = [];

    if (multiRes.status === 'fulfilled' && multiRes.value.ok) {
      try {
        const data = await multiRes.value.json();
        const sections = data?.response?.sections || [];
        for (const sec of sections) {
          if (Array.isArray(sec.hits)) {
            for (const hit of sec.hits) {
              const res = hit.result;
              if (res && res.url && !res.url.includes('/artists/') && !hitMap.has(res.id)) {
                hitMap.set(res.id, res);
                if (sec.type === 'top_hit') topHits.push(res);
                else if (sec.type === 'lyric') lyricHits.push(res);
                else if (sec.type === 'song') otherHits.push(res);
              }
            }
          }
        }
      } catch (e) {}
    }

    if (lyricRes.status === 'fulfilled' && lyricRes.value.ok) {
      try {
        const data = await lyricRes.value.json();
        const hits = data?.response?.sections?.[0]?.hits || data?.response?.hits || [];
        for (const hit of hits) {
          const res = hit.result;
          if (res && res.url && !res.url.includes('/artists/') && !hitMap.has(res.id)) {
            hitMap.set(res.id, res);
            lyricHits.push(res);
          }
        }
      } catch (e) {}
    }

    // Sort candidate hits: top_hits and gospel/worship/relevant artists first
    const isWorshipHit = h => {
      const txt = `${h.title || ''} ${h.artist_names || h.primary_artist?.name || ''}`.toLowerCase();
      return /worship|praise|houghton|greene|hillsong|bethel|salem|dunsin|maverick|gospel|jesus|god|lord|pastor|pst|brewster|planetboom/i.test(txt);
    };

    const prioritizedHits = [
      ...topHits,
      ...lyricHits.filter(isWorshipHit),
      ...lyricHits.filter(h => !isWorshipHit(h)),
      ...otherHits
    ];

    const candidateHits = prioritizedHits.slice(0, 5);

    const fetched = await Promise.allSettled(
      candidateHits.map(async song => {
        const pageRes = await fetch(song.url, {
          headers: { 'User-Agent': browserUa },
          signal: AbortSignal.timeout(3200)
        });
        if (!pageRes.ok) return null;
        const pageHtml = await pageRes.text();
        const extracted = extractLyricsFromGeneralHtml(pageHtml);
        if (!extracted || extracted.length < 40) return null;

        const trackTitle = (song.title || 'Untitled Song').trim();
        const trackArtist = (song.artist_names || song.primary_artist?.name || artist || 'Unknown Artist').trim();
        const cleanedGeniusLyrics = cleanGeniusText(extracted);
        const stanzas = parseLyricsToStanzas(cleanedGeniusLyrics, trackTitle);
        const previewSnippet = buildPreviewSnippet(stanzas);

        return {
          id: `genius_${song.id || Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          title: trackTitle,
          author: trackArtist,
          album: song.album?.name || '',
          duration: 0,
          songbook: 'Cloud Worship',
          source: 'Genius',
          previewText: previewSnippet,
          stanzas: stanzas
        };
      })
    );

    return fetched.map(f => f.value).filter(Boolean);
  }

  // Engine 3: SongLyrics.com Direct Search (Extensive Christian, Gospel & Praise repository)
  async function fetchFromSongLyrics(queryTerm, artist = '') {
    const browserUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    const searchUrl = `https://www.songlyrics.com/index.php?section=search&searchW=${encodeURIComponent(queryTerm)}&submit=Search`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': browserUa },
      signal: AbortSignal.timeout(4500)
    });

    if (!searchRes.ok) return [];
    const html = await searchRes.text();
    const resultMatches = [...html.matchAll(/<h3>\s*<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>\s*<\/h3>[\s\S]*?by\s*<a[^>]*>([^<]+)<\/a>/gi)].slice(0, 3);
    if (resultMatches.length === 0) return [];

    const fetched = await Promise.allSettled(
      resultMatches.map(async m => {
        const lyricUrl = m[1];
        const trackTitle = decodeHtmlEntities(m[2]).trim();
        const trackArtist = decodeHtmlEntities(m[3]).trim();

        const pageRes = await fetch(lyricUrl, {
          headers: { 'User-Agent': browserUa },
          signal: AbortSignal.timeout(4000)
        });
        if (!pageRes.ok) return null;
        const pageHtml = await pageRes.text();
        const extracted = extractLyricsFromGeneralHtml(pageHtml);
        if (!extracted || extracted.length < 40) return null;

        const stanzas = parseLyricsToStanzas(extracted, trackTitle);
        const previewSnippet = buildPreviewSnippet(stanzas);

        return {
          id: `sl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          title: trackTitle,
          author: trackArtist || artist || 'Unknown Artist',
          album: '',
          duration: 0,
          songbook: 'Cloud Worship',
          source: 'SongLyrics',
          previewText: previewSnippet,
          stanzas: stanzas
        };
      })
    );

    return fetched.map(f => f.value).filter(Boolean);
  }

  // Engine 4: ChartLyrics Public API (Established standard catalog)
  async function fetchFromChartLyrics(queryTerm, artist = '') {
    const searchUrl = `http://api.chartlyrics.com/apiv1.asmx/SearchLyricText?lyricText=${encodeURIComponent(queryTerm)}`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(4000) });
    if (!searchRes.ok) return [];
    const xml = await searchRes.text();

    const results = [];
    const itemMatches = [...xml.matchAll(/<SearchLyricResult>([\s\S]*?)<\/SearchLyricResult>/gi)].slice(0, 3);
    for (const match of itemMatches) {
      const block = match[1];
      const lyricId = (/<LyricId>([^<]+)<\/LyricId>/i.exec(block) || [])[1];
      const lyricChecksum = (/<LyricChecksum>([^<]+)<\/LyricChecksum>/i.exec(block) || [])[1];
      const foundArtist = (/<Artist>([^<]+)<\/Artist>/i.exec(block) || [])[1];
      const foundSong = (/<Song>([^<]+)<\/Song>/i.exec(block) || [])[1];
      if (lyricId && lyricChecksum && foundSong) {
        results.push({ lyricId, lyricChecksum, artist: foundArtist, song: foundSong });
      }
    }

    if (results.length === 0) return [];

    const fetched = await Promise.allSettled(
      results.slice(0, 2).map(async item => {
        const getUrl = `http://api.chartlyrics.com/apiv1.asmx/GetLyric?lyricId=${encodeURIComponent(item.lyricId)}&lyricChecksum=${encodeURIComponent(item.lyricChecksum)}`;
        const res = await fetch(getUrl, { signal: AbortSignal.timeout(3500) });
        if (!res.ok) return null;
        const lyricXml = await res.text();
        const lyricMatch = /<Lyric>([\s\S]*?)<\/Lyric>/i.exec(lyricXml);
        if (!lyricMatch || !lyricMatch[1] || lyricMatch[1].trim().length < 30) return null;

        const cleanLyrics = decodeHtmlEntities(lyricMatch[1].trim());
        const trackTitle = decodeHtmlEntities(item.song).trim();
        const trackArtist = decodeHtmlEntities(item.artist || artist || 'Unknown Artist').trim();
        const stanzas = parseLyricsToStanzas(cleanLyrics, trackTitle);
        const previewSnippet = buildPreviewSnippet(stanzas);

        return {
          id: `chart_${item.lyricId}_${Math.random().toString(36).slice(2, 6)}`,
          title: trackTitle,
          author: trackArtist,
          album: '',
          duration: 0,
          songbook: 'Cloud Worship',
          source: 'ChartLyrics',
          previewText: previewSnippet,
          stanzas: stanzas
        };
      })
    );

    return fetched.map(f => f.value).filter(Boolean);
  }

  // Engine 5: Christian Hymnals & Church Archives (Hymnary.org & Church Hymn Repositories)
  async function fetchFromChristianHymnals(queryTerm, artist = '') {
    const browserUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    const hymnaryUrl = `https://hymnary.org/search?qu=${encodeURIComponent(queryTerm)}`;
    try {
      const res = await fetch(hymnaryUrl, {
        headers: {
          'User-Agent': browserUa,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        signal: AbortSignal.timeout(4500)
      });
      if (!res.ok) return [];
      const html = await res.text();
      const hymnHits = [];
      const seenSlugs = new Set();
      const h2Matches = [...html.matchAll(/<h2>\s*<a\s+href="([^"]*\/text\/([a-zA-Z0-9_-]+)[^"]*)"[^>]*>([^<]+)<\/a>\s*<\/h2>/gi)];
      for (const m of h2Matches) {
        const slug = m[2];
        const title = decodeHtmlEntities(m[3]).trim();
        if (slug && title && !seenSlugs.has(slug)) {
          seenSlugs.add(slug);
          hymnHits.push({ slug, title, url: `https://hymnary.org/text/${slug}` });
        }
      }

      if (hymnHits.length < 4) {
        const generalMatches = [...html.matchAll(/<a\s+href="([^"]*\/text\/([a-zA-Z0-9_-]+)[^"]*)"[^>]*>([^<]+)<\/a>/gi)];
        for (const m of generalMatches) {
          const slug = m[2];
          const rawText = decodeHtmlEntities(m[3]).replace(/<[^>]+>/g, '').trim();
          if (slug && rawText && rawText.length > 2 && !seenSlugs.has(slug) && !/flexscore|flexpresent|icon/i.test(rawText)) {
            seenSlugs.add(slug);
            hymnHits.push({ slug, title: rawText, url: `https://hymnary.org/text/${slug}` });
          }
        }
      }

      if (hymnHits.length === 0) return [];

      const fetched = await Promise.allSettled(
        hymnHits.slice(0, 4).map(async item => {
          const textUrl = item.url;
          const songTitle = item.title;

          const pageRes = await fetch(textUrl, {
            headers: {
              'User-Agent': browserUa,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            signal: AbortSignal.timeout(4000)
          });
          if (!pageRes.ok) return null;
          const pageHtml = await pageRes.text();
          const extracted = extractLyricsFromGeneralHtml(pageHtml);
          if (!extracted || extracted.length < 30) return null;

          const authorMatch = /Author:\s*<a[^>]*>([^<]+)<\/a>/i.exec(pageHtml) || /Author:<\/span>\s*([^<]+)</i.exec(pageHtml);
          const foundAuthor = authorMatch ? decodeHtmlEntities(authorMatch[1]).trim() : (artist || 'Traditional Hymn');

          const stanzas = parseLyricsToStanzas(extracted, songTitle);
          const previewSnippet = buildPreviewSnippet(stanzas);

          return {
            id: `hymn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            title: songTitle,
            author: foundAuthor,
            album: 'Christian Hymnal',
            duration: 0,
            songbook: 'Cloud Worship',
            source: 'Hymnary',
            previewText: previewSnippet,
            stanzas: stanzas
          };
        })
      );

      return fetched.map(f => f.value).filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  // Engine 6: CeeNaija (Premier African, Nigerian & Contemporary Gospel catalog)
  async function fetchFromCeeNaija(queryTerm, artist = '') {
    const browserUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    const searchUrl = `https://www.ceenaija.com/?s=${encodeURIComponent(queryTerm + ' lyrics')}`;
    try {
      const res = await fetch(searchUrl, {
        headers: {
          'User-Agent': browserUa,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        signal: AbortSignal.timeout(4500)
      });
      if (!res.ok) return [];
      const html = await res.text();

      const candidateLinks = [];
      const seenUrls = new Set();

      // Match post titles in search results: <h2 ...><a href="...">Title</a></h2>
      const titleMatches = [...html.matchAll(/<h[23][^>]*>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h[23]>/gi)];
      for (const m of titleMatches) {
        const link = m[1].trim();
        const rawTitle = decodeHtmlEntities(m[2]).replace(/<[^>]+>/g, '').trim();
        if (link && rawTitle && !seenUrls.has(link) && !link.includes('/tag/') && !link.includes('/category/')) {
          seenUrls.add(link);
          candidateLinks.push({ url: link, title: rawTitle });
        }
      }

      if (candidateLinks.length === 0) {
        const bookmarkMatches = [...html.matchAll(/<a\s+href="(https?:\/\/(?:www\.)?ceenaija\.com\/[^"\/]+\/?)"[^>]*rel="bookmark"[^>]*>([\s\S]*?)<\/a>/gi)];
        for (const m of bookmarkMatches) {
          const link = m[1].trim();
          const rawTitle = decodeHtmlEntities(m[2]).replace(/<[^>]+>/g, '').trim();
          if (link && rawTitle && !seenUrls.has(link)) {
            seenUrls.add(link);
            candidateLinks.push({ url: link, title: rawTitle });
          }
        }
      }

      if (candidateLinks.length === 0) return [];

      const fetched = await Promise.allSettled(
        candidateLinks.slice(0, 3).map(async item => {
          const pageRes = await fetch(item.url, {
            headers: { 'User-Agent': browserUa },
            signal: AbortSignal.timeout(4000)
          });
          if (!pageRes.ok) return null;
          const pageHtml = await pageRes.text();
          const extracted = extractLyricsFromCeeNaijaHtml(pageHtml);
          if (!extracted || extracted.length < 35) return null;

          // Parse artist and title from CeeNaija post title
          let cleanTitle = item.title
            .replace(/^(?:download|download\s+mp3|audio|video|lyrics)\s*:\s*/i, '')
            .replace(/\s*\((?:lyrics|mp3|download|audio|video|official|album).*?\)/gi, '')
            .replace(/\s*\[(?:lyrics|mp3|download|audio|video|official|album).*?\]/gi, '')
            .replace(/\s*-\s*Lyrics.*$/i, '')
            .replace(/\s*Lyrics.*$/i, '')
            .trim();

          let songArtist = artist || 'Gospel Music';
          let songTitle = cleanTitle;

          if (cleanTitle.includes('–') || cleanTitle.includes('-')) {
            const parts = cleanTitle.split(/[–\-]/);
            if (parts.length >= 2) {
              songArtist = parts[0].trim();
              songTitle = parts.slice(1).join('-').trim();
            }
          } else if (/\bby\b/i.test(cleanTitle)) {
            const parts = cleanTitle.split(/\bby\b/i);
            songTitle = parts[0].trim();
            songArtist = parts[1].trim();
          }

          const stanzas = parseLyricsToStanzas(extracted, songTitle);
          const previewSnippet = buildPreviewSnippet(stanzas);

          return {
            id: `ceenaija_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            title: songTitle || queryTerm,
            author: songArtist || 'Gospel Artist',
            album: 'African Gospel',
            duration: 0,
            songbook: 'Cloud Worship',
            source: 'CeeNaija',
            previewText: previewSnippet,
            stanzas: stanzas
          };
        })
      );

      return fetched.map(f => f.value).filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  // Engine 7: DuckDuckGo Universal Web Search Fallback (Google-equivalent open web search)
  async function fetchFromWebSearchFallback(queryTerm, artist = '') {
    const browserUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    let html = '';
    try {
      const ddgRes = await fetch('https://html.duckduckgo.com/html/', {
        method: 'POST',
        headers: {
          'User-Agent': browserUa,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        body: `q=${encodeURIComponent(queryTerm + ' lyrics')}`,
        signal: AbortSignal.timeout(4500)
      });
      if (ddgRes.ok) {
        html = await ddgRes.text();
      }
    } catch (e) {}

    if (!html) {
      try {
        const ddgGetRes = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(queryTerm + ' lyrics')}`, {
          headers: { 'User-Agent': browserUa },
          signal: AbortSignal.timeout(4500)
        });
        if (ddgGetRes.ok) {
          html = await ddgGetRes.text();
        }
      } catch (e) {}
    }

    if (!html) return [];

    const candidateUrls = [];
    const hrefMatches = html.matchAll(/href="(?:\/\/duckduckgo\.com\/l\/\?uddg=|https?:\/\/)([^"&]+)/gi);
    for (const m of hrefMatches) {
      try {
        const decoded = decodeURIComponent(m[1]);
        const finalUrl = decoded.startsWith('http') ? decoded : `https://${decoded}`;
        const cleanUrl = finalUrl.split('?')[0].replace(/\/+$/, '');
        if (!candidateUrls.some(u => u.split('?')[0].replace(/\/+$/, '') === cleanUrl) && /lyrics|song|hymn|praise|worship|namethathymn|walkofgrace|mysongbooks|gospel|zionlyrics/i.test(finalUrl)) {
          candidateUrls.push(finalUrl);
        }
      } catch (e) {}
    }

    if (candidateUrls.length === 0) return [];

    const fetched = await Promise.allSettled(
      candidateUrls.slice(0, 3).map(async targetUrl => {
        const pageRes = await fetch(targetUrl, {
          headers: {
            'User-Agent': browserUa,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          signal: AbortSignal.timeout(3200)
        });
        if (!pageRes.ok) return null;
        const pageHtml = await pageRes.text();
        const extracted = extractLyricsFromGeneralHtml(pageHtml);
        if (!extracted || extracted.length < 35) return null;

        // Try extracting title from page <title> tag
        const titleMatch = /<title>([^<]+)<\/title>/i.exec(pageHtml);
        let extractedTitle = queryTerm;
        let extractedArtist = artist || 'Unknown Artist';
        if (titleMatch && titleMatch[1]) {
          const cleanTitle = decodeHtmlEntities(titleMatch[1])
            .replace(/\s*-\s*Lyrics.*$/i, '')
            .replace(/\s*Lyrics.*$/i, '')
            .replace(/\s*\|.*$/i, '')
            .replace(/–.*$/i, '')
            .trim();
          if (cleanTitle.includes('-')) {
            const parts = cleanTitle.split('-');
            extractedArtist = parts[0].trim();
            extractedTitle = parts.slice(1).join('-').trim();
          } else if (cleanTitle.includes('by')) {
            const parts = cleanTitle.split(/\bby\b/i);
            extractedTitle = parts[0].trim();
            extractedArtist = parts[1].trim();
          } else {
            extractedTitle = cleanTitle;
          }
        }

        const sourceMatch = /^(?:source|hymnal|from)\s*:\s*([^\r\n]+)/im.exec(extracted);
        const detectedSongbook = sourceMatch ? decodeHtmlEntities(sourceMatch[1]).trim() : 'Cloud Worship';

        const authorMatch = /^(?:author|composer|written by|words and music|words by)\s*:\s*([^\r\n]+)/im.exec(extracted);
        if (authorMatch && (!extractedArtist || extractedArtist === 'Unknown Artist')) {
          extractedArtist = decodeHtmlEntities(authorMatch[1]).trim();
        }

        const stanzas = parseLyricsToStanzas(extracted, extractedTitle);
        const previewSnippet = buildPreviewSnippet(stanzas);

        return {
          id: `web_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          title: extractedTitle || queryTerm,
          author: extractedArtist || 'Unknown Artist',
          album: detectedSongbook !== 'Cloud Worship' ? detectedSongbook : '',
          duration: 0,
          songbook: detectedSongbook,
          source: 'Web Search',
          previewText: previewSnippet,
          stanzas: stanzas
        };
      })
    );

    return fetched.map(f => f.value).filter(Boolean);
  }

  // Engine 7: lyrics.ovh Fallback
  async function fetchFromLyricsOvh(queryTerm, artist = '') {
    const suggestUrl = `https://api.lyrics.ovh/suggest/${encodeURIComponent(queryTerm)}`;
    const suggestRes = await fetch(suggestUrl, { signal: AbortSignal.timeout(4000) });
    if (!suggestRes.ok) return [];
    const suggestData = await suggestRes.json();
    const tracks = (suggestData.data || []).slice(0, 4);

    const fetched = await Promise.allSettled(
      tracks.map(async t => {
        const trackArtist = (t.artist?.name || artist || 'Unknown Artist').trim();
        const trackTitle = (t.title || 'Untitled Song').trim();
        const lr = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(trackArtist)}/${encodeURIComponent(trackTitle)}`, {
          signal: AbortSignal.timeout(3500)
        });
        if (!lr.ok) return null;
        const ld = await lr.json();
        if (!ld || !ld.lyrics) return null;
        const stanzas = parseLyricsToStanzas(ld.lyrics, trackTitle);
        const previewSnippet = buildPreviewSnippet(stanzas);
        return {
          id: `ovh_${t.id || Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          title: trackTitle,
          author: trackArtist,
          album: t.album?.title || '',
          duration: t.duration || 0,
          songbook: 'Cloud Worship',
          source: 'lyrics.ovh',
          previewText: previewSnippet,
          stanzas: stanzas
        };
      })
    );

    return fetched.map(f => f.value).filter(Boolean);
  }

  // GET /api/lyrics/search — dynamic online lyrics search across global repositories with multi-engine fallback
  if (pathname === '/api/lyrics/search' && req.method === 'GET') {
    const q = reqUrl.searchParams.get('q') || '';
    const artist = reqUrl.searchParams.get('artist') || '';
    const title = reqUrl.searchParams.get('title') || '';

    const queryTerm = (q || `${title} ${artist}`).trim();
    if (!queryTerm) {
      json(200, { results: [] });
      return;
    }

    const cacheKey = queryTerm.toLowerCase();
    const cached = lyricsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < LYRICS_CACHE_TTL_MS)) {
      json(200, { results: cached.results, count: cached.results.length, query: queryTerm, cached: true });
      return;
    }

    (async () => {
      let results = [];
      let lastErr = null;

      // Concurrent Parallel Query across ALL free engines simultaneously:
      // LRCLIB, Genius, SongLyrics, ChartLyrics, Christian Hymnals (Hymnary), Universal Web Search, lyrics.ovh
      try {
        const parallelSettled = await Promise.allSettled([
          fetchFromLrclib(queryTerm, artist),
          fetchFromGenius(queryTerm, artist),
          fetchFromSongLyrics(queryTerm, artist),
          fetchFromChartLyrics(queryTerm, artist),
          fetchFromChristianHymnals(queryTerm, artist),
          fetchFromCeeNaija(queryTerm, artist),
          fetchFromWebSearchFallback(queryTerm, artist),
          fetchFromLyricsOvh(queryTerm, artist)
        ]);

        for (const outcome of parallelSettled) {
          if (outcome.status === 'fulfilled' && Array.isArray(outcome.value)) {
            results.push(...outcome.value);
          } else if (outcome.status === 'rejected') {
            lastErr = outcome.reason;
          }
        }
      } catch (primaryErr) {
        lastErr = primaryErr;
      }

      // Calculate relevance score for each result
      for (const item of results) {
        item._score = scoreSongRelevance(item, queryTerm);
      }

      // Sort results descending by relevance score (highest match first)
      results.sort((a, b) => b._score - a._score);

      // Deduplicate results by normalized title + artist and filter out irrelevant noise
      const seen = new Map();
      const highestScore = results[0] ? results[0]._score : 0;

      for (const item of results) {
        // If we found solid title/refrain matches (score >= 250), drop unrelated noise
        if (highestScore >= 250 && item._score < 40) {
          continue;
        }

        const normTitle = normalizeTitle(item.title) || (item.title || '').toLowerCase().trim();
        const normAuthor = normalizeArtist(item.author) || (item.author || '').toLowerCase().trim();
        const key = `${normTitle}___${normAuthor}`;

        if (!seen.has(key)) {
          seen.set(key, item);
        } else {
          const existing = seen.get(key);
          const existingCount = (existing.stanzas || []).length;
          const newCount = (item.stanzas || []).length;
          if (item.source === 'Hymnary' && existing.source !== 'Hymnary') {
            seen.set(key, item);
          } else if (newCount > existingCount && existing.source !== 'Hymnary') {
            seen.set(key, item);
          }
        }
      }

      const uniqueResults = Array.from(seen.values()).map(item => {
        const { _score, ...cleanItem } = item;
        return cleanItem;
      });

      if (uniqueResults.length > 0) {
        if (lyricsCache.size > 500) {
          const firstKey = lyricsCache.keys().next().value;
          lyricsCache.delete(firstKey);
        }
        lyricsCache.set(cacheKey, { results: uniqueResults, timestamp: Date.now() });
        json(200, { results: uniqueResults, count: uniqueResults.length, query: queryTerm });
      } else {
        if (lastErr) {
          console.info(`[Ginomai] Cloud lyrics provider info: ${lastErr.message}.`);
        }
        json(200, {
          results: [],
          count: 0,
          query: queryTerm,
          temporarilyUnavailable: true,
          message: 'No online lyrics found across cloud search engines. You can paste lyrics into Song Creator or search local songs.'
        });
      }
    })();
    return;
  }

  const contentPackMatch = /^\/api\/content-packs\/([A-Z0-9_]+)$/.exec(pathname);
  if (contentPackMatch && ['GET', 'POST', 'DELETE'].includes(req.method)) {
    const code = contentPackMatch[1];
    Promise.resolve().then(() => req.method === 'POST' ? contentPacks.install(code) : req.method === 'DELETE' ? contentPacks.remove(code) : contentPacks.status(code))
      .then(status => json(200, status)).catch(error => json(error.status || 502, { error: error.message }));
    return;
  }

  // GET /api/bibles/catalog — returns all available cloud Bible translations
  if (pathname === '/api/bibles/catalog' && req.method === 'GET') {
    const manifestPath = path.join(PUBLIC_DIR, 'bibles', 'manifest.json');
    fs.readFile(manifestPath, 'utf8', (err, content) => {
      if (!err && content) {
        try {
          const manifest = JSON.parse(content);
          Promise.all(manifest.map(async bible => {
            const status = await contentPacks.status(bible.code);
            return { ...bible, installed: status.installed, bundled: status.bundled, cloudAvailable: status.cloudAvailable, downloadBytes: status.downloadBytes, size: status.installed ? bible.size : `${(status.downloadBytes / 1048576).toFixed(1)} MB download` };
          })).then(bibles => json(200, { bibles, count: bibles.length })).catch(() => json(500, { error: 'Could not read the Bible catalogue.' }));
          return;
        } catch (e) {}
      }
      // Fallback list of top bibles
      json(200, {
        bibles: [
          { code: "KJV", name: "King James Version", lang: "English", size: "4.6 MB", booksCount: 66, url: "bibles/KJV.json" },
          { code: "NIV", name: "New International Version", lang: "English", size: "4.3 MB", booksCount: 66, url: "bibles/NIV.json" },
          { code: "NKJV", name: "New King James Version", lang: "English", size: "4.5 MB", booksCount: 66, url: "bibles/NKJV.json" },
          { code: "ESV", name: "English Standard Version", lang: "English", size: "4.4 MB", booksCount: 66, url: "bibles/ESV.json" },
          { code: "NLT", name: "New Living Translation", lang: "English", size: "4.4 MB", booksCount: 66, url: "bibles/NLT.json" },
          { code: "AMP", name: "Amplified Bible", lang: "English", size: "5.2 MB", booksCount: 66, url: "bibles/AMP.json" },
          { code: "CSB", name: "Christian Standard Bible", lang: "English", size: "4.4 MB", booksCount: 66, url: "bibles/CSB.json" },
          { code: "BSB", name: "Berean Standard Bible", lang: "English", size: "4.3 MB", booksCount: 66, url: "bibles/BSB.json" },
          { code: "NASB", name: "New American Standard Bible", lang: "English", size: "4.5 MB", booksCount: 66, url: "bibles/NASB.json" },
          { code: "TPT", name: "The Passion Translation", lang: "English", size: "3.2 MB", booksCount: 66, url: "bibles/TPT.json" }
        ]
      });
    });
    return;
  }

  // GET /api/bibles/download/:code — on-demand download of Bible translation JSON
  if (pathname.startsWith('/api/bibles/download/') && req.method === 'GET') {
    const code = pathname.split('/').pop().toUpperCase().trim();
    Promise.resolve().then(async () => {
      contentPacks.pack(code);
      const filename = await contentPacks.filePath(`bibles/${code}.json`);
      if (!filename) return json(404, { error: 'Download this Bible pack first or import a Bible file.' });
      const data = await fs.promises.readFile(filename);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    }).catch(error => json(error.status || 500, { error: error.message }));
    return;
  }

  if (pathname === '/api/catalog' && req.method === 'GET') {
    json(200, controlCatalog);
    return;
  }

  if (pathname === '/api/catalog' && req.method === 'POST') {
    readBody((err, catalog) => {
      if (err || !catalog || typeof catalog !== 'object') return json(400, { error: 'Invalid catalog' });
      controlCatalog = {
        bibleVersions: Array.isArray(catalog.bibleVersions) ? catalog.bibleVersions : ['KJV'],
        songs: Array.isArray(catalog.songs) ? catalog.songs : [],
        agendaItems: Array.isArray(catalog.agendaItems) ? catalog.agendaItems : [],
        bible: (catalog.bible && typeof catalog.bible === 'object') ? catalog.bible : (controlCatalog.bible || {})
      };
      currentState = { ...currentState, catalogVersion: (currentState.catalogVersion || 0) + 1, _timestamp: Date.now() };
      publishState();
      json(200, { success: true });
    });
    return;
  }

  // GET /api/lexicon/search — search Strong's Greek and Hebrew entries
  if (pathname === '/api/lexicon/search' && req.method === 'GET') {
    const q = (parsedUrl.query.q || '').trim();
    const lang = (parsedUrl.query.lang || 'all').toLowerCase();
    const limit = Math.min(parseInt(parsedUrl.query.limit || '30', 10), 100);

    Promise.resolve().then(async () => {
      if (!lexiconCache) {
        try {
          const lexPath = await contentPacks.filePath('lexicon/strongs_unified.json');
          if (lexPath) {
            lexiconCache = JSON.parse(await fs.promises.readFile(lexPath, 'utf8'));
          }
        } catch (e) {
          console.error('[Lexicon] Error loading cache:', e);
        }
      }

      if (!lexiconCache) {
        return json(500, { error: 'Could not load lexicon cache.' });
      }

      if (!q) {
        return json(200, { results: [] });
      }

      const qLower = q.toLowerCase();
      const qUpper = q.toUpperCase();
      const escapedQ = qLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wordBoundaryRegex = new RegExp(`(^|[^a-zA-Z0-9])${escapedQ}([^a-zA-Z0-9]|$)`, 'i');

      const matches = [];
      for (const id in lexiconCache) {
        const item = lexiconCache[id];
        if (!item) continue;
        const isGreek = item.lang === 'Greek' || item.id.startsWith('G');
        const isHebrew = item.lang === 'Hebrew' || item.id.startsWith('H');
        if (lang === 'greek' && !isGreek) continue;
        if (lang === 'hebrew' && !isHebrew) continue;

        let score = 0;
        const entryId = (item.id || id).toUpperCase();
        const lemma = item.lemma || '';
        const translit = (item.transliteration || '').toLowerCase();
        const shortDef = (item.short_definition || '').toLowerCase();
        const kjvDef = (item.kjv_definition || '').toLowerCase();

        if (entryId === qUpper) score += 1500;
        else if (lemma === q) score += 1200;
        else if (translit === qLower) score += 1000;
        else if (shortDef === qLower) score += 850;
        else if (wordBoundaryRegex.test(shortDef)) score += 650;
        else if (wordBoundaryRegex.test(kjvDef)) score += 550;
        else if (shortDef.includes(qLower)) score += 250;
        else if (kjvDef.includes(qLower)) score += 150;
        else if (translit.includes(qLower)) score += 100;

        if (score > 0) {
          matches.push({ item, score });
        }
      }

      matches.sort((a, b) => b.score - a.score);
      json(200, {
        query: q,
        total: matches.length,
        results: matches.slice(0, limit).map(m => m.item)
      });
    }).catch(err => {
      json(500, { error: 'Search failed: ' + err.message });
    });
    return;
  }

  // GET /api/lexicon/:id — lookup Greek or Hebrew Strong's entry
  if (pathname.startsWith('/api/lexicon/') && req.method === 'GET') {
    const rawId = pathname.split('/').pop().toUpperCase();
    const normalizedId = rawId.replace(/^([GH])0+(\d+)/, '$1$2');
    Promise.resolve().then(async () => {
    if (!lexiconCache) {
      try {
        const lexPath = await contentPacks.filePath('lexicon/strongs_unified.json');
        if (lexPath) {
          lexiconCache = JSON.parse(await fs.promises.readFile(lexPath, 'utf8'));
        }
      } catch (e) {
        console.error('[Lexicon] Error loading cache:', e);
      }
    }
    const entry = lexiconCache ? (lexiconCache[rawId] || lexiconCache[normalizedId]) : null;
    if (entry) {
      json(200, entry);
    } else {
      json(404, { error: `Strong's entry "${rawId}" not found.` });
    }
    }).catch(() => json(500, { error: 'Could not read the lexicon.' }));
    return;
  }

  // ─── Static File Server ───────────────────────────────────────────────────
  const shortLinks = {
    '/live': '/display.html?target=obs',
    '/livestream': '/display.html?target=livestream',
    '/projector': '/display.html?target=sanctuary',
    '/stage': '/display.html?target=stage',
    '/overlay': '/display.html?target=livestream&layout=lt',
    '/auto': '/display.html?target=auto',
    '/remote': '/index.html?remote=1'
  };
  const shortPath = pathname.replace(/\/$/, '');
  const shortDestination = Object.prototype.hasOwnProperty.call(shortLinks, shortPath) ? shortLinks[shortPath] : null;
  if (shortDestination && ['GET', 'HEAD'].includes(req.method)) {
    const destination = new URL(shortDestination, 'http://localhost');
    for (const [key, value] of reqUrl.searchParams) {
      if (!destination.searchParams.has(key)) destination.searchParams.append(key, value);
    }
    res.writeHead(302, { Location: destination.pathname + destination.search, 'Cache-Control': 'no-store' });
    res.end();
    return;
  }
  if (pathname === '/remote.html') { res.writeHead(302, { Location: '/operator.html' }); res.end(); return; }
  let decodedPath;
  try { decodedPath = decodeURIComponent(pathname); } catch { res.writeHead(400); res.end('Bad path'); return; }
  const parts = decodedPath.replace(/\\/g, '/').split('/').filter(Boolean);
  const publicFolders = new Set(['css', 'js', 'Themes', 'themes', 'assets', 'bibles', 'lexicon', 'fonts', 'images', 'media', 'backgrounds']);
  const publicPages = new Set(['index.html', 'landing.html', 'display.html', 'operator.html', 'remote.html', 'favicon.ico']);
  if (parts.some(part => part.startsWith('.')) || (parts.length && !publicFolders.has(parts[0]) && !(parts.length === 1 && publicPages.has(parts[0])))) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  let filePath = path.resolve(PUBLIC_DIR, '.' + (pathname === '/' ? '/index.html' : decodedPath));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }

  if (/^\/(bibles|lexicon)\/[A-Za-z0-9_]+\.json$/.test(decodedPath) && decodedPath !== '/bibles/manifest.json') {
    contentPacks.filePath(decodedPath.slice(1)).then(async filename => {
      if (!filename) { res.writeHead(404); res.end('Download this content pack first.'); return; }
      const data = await fs.promises.readFile(filename);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    }).catch(() => { res.writeHead(500); res.end('Could not read content.'); });
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) { res.writeHead(404); res.end('Not Found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    if (liveReload && ext === '.html') { liveReload.serveHtml(filePath, res); return; }
    const headers = { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' };
    if (ext === '.css' || ext === '.js' || ext === '.html') {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
    }
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
});

server.on('close', () => semanticService.close());

let activeServer = null;

function startServer(port = PORT, callback) {
  if (activeServer && activeServer.listening) {
    if (callback) callback(null, activeServer, currentBoundPort);
    return activeServer;
  }

  let attemptPort = Number(port) || 8500;
  const maxAttempts = 20;
  let attempts = 0;

  function tryListen() {
    server.removeAllListeners('error');
    
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        attempts++;
        if (attempts < maxAttempts) {
          console.warn(`[Ginomai] Port ${attemptPort} in use, trying next port ${attemptPort + 1}...`);
          attemptPort++;
          setTimeout(tryListen, 50);
        } else {
          console.error(`[Ginomai] Could not bind after ${maxAttempts} attempts:`, err);
          if (callback) callback(err, null, attemptPort);
        }
      } else {
        console.error('[Ginomai] Server error:', err);
        if (callback) callback(err, null, attemptPort);
      }
    });

    server.listen(attemptPort, () => {
      activeServer = server;
      currentBoundPort = attemptPort;
      const lanIp = getLanAddresses()[0];
      console.log(`=======================================================`);
      console.log(` Ginomai — The Word in Motion (Studio Server)`);
      console.log(` Host Console:       http://localhost:${attemptPort}`);
      if (lanIp) {
        console.log(` Remote Operator:   http://${lanIp}:${attemptPort}/remote`);
        console.log(` Sanctuary Display: http://${lanIp}:${attemptPort}/projector`);
        console.log(` Livestream OBS:    http://${lanIp}:${attemptPort}/live`);
      }
      console.log(`=======================================================`);
      if (callback) callback(null, activeServer, attemptPort);
    });
  }

  tryListen();
  return server;
}

function stopServer(callback) {
  if (activeServer) {
    activeServer.close(() => {
      activeServer = null;
      if (callback) callback();
    });
  } else if (callback) {
    callback();
  }
}

if (require.main === module) {
  startServer(PORT);
}

module.exports = {
  server,
  startServer,
  stopServer,
  getLanAddresses,
  getCurrentState: () => currentState,
  getConnectedOutputs: () => outputs.connected(),
  flushLiveState: (options) => liveStateStore.flush(options),
  publishState
};
