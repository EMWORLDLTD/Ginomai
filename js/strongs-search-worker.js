'use strict';
self.window = self;
self.BIBLE_DATABASE = {};
importScripts('strongs-detector.js');

// Count each verse once per ID, even when that tag occurs several times in it.
const ready = self.ensureStrongsDataLoaded().then(() => {
  const bible = self.BIBLE_DATABASE.KJV_STRONGS;
  const counts = bible ? Object.create(null) : null;
  for (const chapters of Object.values(bible || {})) {
    for (const verses of Object.values(chapters || {})) {
      if (!Array.isArray(verses)) continue;
      for (const verse of verses) {
        const ids = new Set();
        for (const match of (verse?.text || '').matchAll(/<([HG])0*(\d+)>/gi)) ids.add(match[1].toUpperCase() + Number(match[2]));
        for (const id of ids) counts[id] = (counts[id] || 0) + 1;
      }
    }
  }
  // Prepare normalized search fields before accepting typed queries.
  self.searchStrongsConcordance('G1577', {limit:1});
  self.postMessage({type:'ready',counts});
  return counts;
});
ready.catch(error => self.postMessage({type:'error',message:error.message}));
self.onmessage = async ({data}) => {
  if (data.type !== 'query') return;
  try {
    const counts = await ready;
    const results = self.searchStrongsConcordance(data.query, data.options).map(entry => {
      const id = entry.id.toUpperCase().replace(/^([GH])0+(\d+)/, '$1$2');
      return {...entry,_occurrenceCount:counts ? counts[id] || 0 : undefined};
    });
    self.postMessage({type:'result',id:data.id,results});
  } catch (error) {
    self.postMessage({type:'error',id:data.id,message:error.message});
  }
};
