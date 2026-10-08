'use strict';

// Keep external displays in connection order, even if OS enumeration changes.
module.exports = function createDisplayRouting() {
  let externalIds = [];
  return function resolve(displays, primaryId, audiencePreference, stagePreference) {
    const primary = displays.find(d => String(d.id) === String(primaryId)) || displays[0];
    const external = displays.filter(d => d !== primary);
    externalIds = externalIds.filter(id => external.some(d => String(d.id) === id));
    for (const display of external) if (!externalIds.includes(String(display.id))) externalIds.push(String(display.id));
    const ordered = externalIds.map(id => external.find(d => String(d.id) === id));
    const audience = ordered.find(d => String(d.id) === String(audiencePreference)) || ordered[0];
    const stage = displays.find(d => String(d.id) === String(stagePreference) && d !== audience) || ordered.find(d => d !== audience) || primary;
    return { audience, stage, external: ordered };
  };
};
