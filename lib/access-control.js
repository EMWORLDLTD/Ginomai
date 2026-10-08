'use strict';

const crypto = require('node:crypto');
const token = () => crypto.randomBytes(32).toString('hex');
const loopback = address => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);

module.exports = function createAccessControl() {
  const hostToken = token();
  const operators = new Map();
  const attempts = new Map();
  let pairingCode = '';
  const cookie = value => `sf_access=${value}; HttpOnly; SameSite=Strict; Path=/`;
  return {
    identify(req) {
      const value = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('sf_access='))?.slice(10);
      if (value === hostToken) return { role: 'host' };
      return operators.get(value) || null;
    },
    bootstrap(req, res, url) {
      if (!loopback(req.socket.remoteAddress) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return;
      if (req.headers['sec-fetch-site'] === 'cross-site') return;
      if (req.method === 'GET' && ['/', '/index.html'].includes(url.pathname) && url.searchParams.get('remote') !== '1') {
        res.setHeader('Set-Cookie', cookie(hostToken));
      }
    },
    sameOrigin(req) {
      if (req.headers['sec-fetch-site'] === 'cross-site') return false;
      if (!req.headers.origin) return true;
      return req.headers.origin === `http://${req.headers.host}`;
    },
    rotate() {
      operators.clear();
      pairingCode = String(crypto.randomInt(100000, 1000000));
      attempts.clear();
      return pairingCode;
    },
    code: () => pairingCode,
    revoke() { operators.clear(); pairingCode = ''; },
    retryAfter(req) {
      const now = Date.now();
      const recent = (attempts.get(req.socket.remoteAddress) || []).filter(time => now - time < 60000);
      return recent.length >= 5 ? Math.max(1, Math.ceil((recent[0] + 60000 - now) / 1000)) : 0;
    },
    pair(req, res, code, operatorId) {
      const address = req.socket.remoteAddress;
      const now = Date.now();
      const recent = (attempts.get(address) || []).filter(time => now - time < 60000);
      if (recent.length >= 5) return false;
      if (!pairingCode || String(code) !== pairingCode) {
        recent.push(now);
        if (attempts.size > 1000) attempts.clear();
        attempts.set(address, recent);
        return false;
      }
      const value = token();
      operators.set(value, { role: 'operator', operatorId });
      res.setHeader('Set-Cookie', cookie(value));
      return true;
    }
  };
};

// Only explicit, authorized workspace fields may cross from an operator.
module.exports.filterPatch = function filterPatch(patch, privileges) {
  const result = {};
  const fields = {
    loadSong: ['currentTab', 'activeSongId', 'activeBibleBook', 'activeBibleChapter', 'bibleVersion', 'compareBibleVersion', 'isCompareMode'],
    switchMedleyMode: ['isMedleyMode'],
    loadMedleySlots: ['medleySongIds', 'medleyVersionCodes', 'medleyBibleSlots'],
    adjustFontSize: ['textSize', 'textAutoScale'],
    toggleTransparentBg: ['transparentBg'],
    autoProject: ['autoProject']
  };
  for (const [permission, keys] of Object.entries(fields)) {
    if (privileges[permission]) for (const key of keys) if (Object.hasOwn(patch, key)) result[key] = patch[key];
  }
  if (privileges.addAgendaItems && privileges.removeAgendaItems && privileges.reorderAgenda && Array.isArray(patch.agendaItems)) result.agendaItems = patch.agendaItems;
  return result;
};
