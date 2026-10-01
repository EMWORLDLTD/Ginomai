const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const announcementsJs = fs.readFileSync(path.join(__dirname, '../js/announcements.js'), 'utf8');

function setupAlertEngineEnvironment() {
  const store = new Map();
  const localStorageMock = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };

  const elements = new Map();
  function makeElement(id) {
    const el = {
      id,
      value: '',
      textContent: '',
      innerHTML: '',
      className: '',
      style: {},
      attributes: {},
      classList: {
        add(c) { el.className = `${el.className} ${c}`.trim(); },
        remove(c) { el.className = el.className.replace(new RegExp(`\\b${c}\\b`, 'g'), '').trim(); },
        toggle(c, on) {
          if (on === undefined) on = !this.contains(c);
          if (on) this.add(c); else this.remove(c);
        },
        contains(c) { return el.className.split(/\s+/).includes(c); }
      },
      setAttribute(k, v) { el.attributes[k] = v; },
      getAttribute(k) { return el.attributes[k]; },
      focus() {},
      addEventListener() {},
      appendChild(c) { el._children = el._children || []; el._children.push(c); },
      querySelectorAll() { return []; },
      querySelector() { return null; }
    };
    elements.set(id, el);
    return el;
  }

  // Necessary UI element stubs
  const ids = [
    'announcement-hub-drawer', 'announcement-drawer-backdrop', 'announcement-edit-modal-backdrop',
    'announcement-search-input', 'announcement-saved-list', 'announcement-saved-count',
    'announcement-quick-text', 'announcement-quick-tag', 'announcement-quick-loop',
    'announcement-dest-sanctuary', 'announcement-dest-livestream', 'announcement-dest-stage',
    'announcement-drawer-status-pill', 'announcement-drawer-live-info',
    'bento-live-alert-strip', 'bento-live-alert-text', 'bento-live-alert-dest',
    'bento-announcement-btn', 'bento-live-alert-tally',
    'announcement-edit-id', 'announcement-edit-tag', 'announcement-edit-text',
    'announcement-edit-position', 'announcement-edit-urgency', 'announcement-edit-loop',
    'announcement-edit-dest-sanctuary', 'announcement-edit-dest-livestream', 'announcement-edit-dest-stage'
  ];
  ids.forEach(makeElement);

  const toasts = [];
  const broadcasts = [];

  const sandbox = {
    localStorage: localStorageMock,
    document: {
      getElementById: (id) => elements.get(id) || makeElement(id),
      querySelectorAll: (sel) => [],
      querySelector: (sel) => null,
      createElement: (tag) => makeElement(`elem_${Math.random()}`)
    },
    window: {
      localStorage: localStorageMock,
      showToast: (msg, type) => toasts.push({ msg, type }),
      broadcastState: (patch) => broadcasts.push(patch),
      openDismissShield: () => {},
      closeDismissShield: () => {}
    },
    console
  };

  const context = vm.createContext(sandbox);
  vm.runInContext(announcementsJs, context);

  return { context, store, toasts, broadcasts, elements, engine: context.window.liveAlertEngine };
}

test('LiveAlertEngine: Initialization and default saved announcements', () => {
  const { engine, store } = setupAlertEngineEnvironment();

  assert.ok(engine, 'LiveAlertEngine should be instantiated on window');
  assert.ok(Array.isArray(engine.savedAnnouncements));
  assert.equal(engine.savedAnnouncements.length, 0, 'Should not seed sample announcements');
  assert.equal(store.has('sf_saved_announcements'), true);
});

test('LiveAlertEngine: CRUD operations on saved announcements', () => {
  const { engine, store } = setupAlertEngineEnvironment();

  // Add new announcement
  const created = engine.saveAnnouncement({
    tag: 'Youth Meeting',
    text: 'Youth fellowship starts today at 5:00 PM in the Upper Room.',
    position: 'lowerthird',
    urgency: 'normal',
    loop: false,
    destinations: { sanctuary: true, livestream: true, stage: false }
  });

  assert.ok(created.id, 'Should assign unique ID');
  const found = engine.savedAnnouncements.find(a => a.id === created.id);
  assert.ok(found, 'Should exist in saved announcements array');
  assert.equal(found.tag, 'Youth Meeting');

  // Update existing announcement
  engine.saveAnnouncement({
    id: created.id,
    tag: 'Youth Meeting (Updated)',
    text: 'Youth fellowship starts today at 5:30 PM.',
    position: 'upperthird',
    urgency: 'urgent',
    loop: true,
    destinations: { sanctuary: true, livestream: false, stage: true }
  });

  const updated = engine.savedAnnouncements.find(a => a.id === created.id);
  assert.equal(updated.tag, 'Youth Meeting (Updated)');
  assert.equal(updated.text, 'Youth fellowship starts today at 5:30 PM.');
  assert.equal(updated.position, 'upperthird');
  assert.equal(updated.urgency, 'urgent');

  // Delete announcement
  const deleteResult = engine.deleteAnnouncement(created.id);
  assert.equal(deleteResult, true);
  assert.equal(engine.savedAnnouncements.some(a => a.id === created.id), false);
});

test('LiveAlertEngine: Filter and search saved announcements', () => {
  const { engine } = setupAlertEngineEnvironment();

  engine.savedAnnouncements = [
    { id: '1', tag: 'Parking', text: 'Silver Toyota plate ABC-123 is blocking the driveway.' },
    { id: '2', tag: 'Welcome', text: 'Welcome to Ginomia sanctuary service.' },
    { id: '3', tag: 'Offering', text: 'Tithe and offering envelopes are available at the ushers desk.' }
  ];

  const searchParking = engine.filterSavedAnnouncements('toyota');
  assert.equal(searchParking.length, 1);
  assert.equal(searchParking[0].id, '1');

  const searchWelcome = engine.filterSavedAnnouncements('welcome');
  assert.equal(searchWelcome.length, 1);
  assert.equal(searchWelcome[0].id, '2');

  const searchEmpty = engine.filterSavedAnnouncements('');
  assert.equal(searchEmpty.length, 3);
});

test('LiveAlertEngine: Live alert dispatch and broadcast state synchronization', () => {
  const { engine, broadcasts, toasts } = setupAlertEngineEnvironment();

  // Send live alert
  const success = engine.sendLiveAlert({
    text: 'Special announcement: All ministers please proceed to the vestry after service.',
    tag: 'Ministers Notice',
    position: 'lowerthird',
    loop: true,
    urgency: 'urgent',
    destinations: { sanctuary: true, livestream: false, stage: true }
  });

  assert.equal(success, true);
  assert.equal(engine.currentAlert.active, true);
  assert.equal(engine.currentAlert.text, 'Special announcement: All ministers please proceed to the vestry after service.');
  assert.equal(engine.currentAlert.position, 'lowerthird');
  assert.equal(engine.currentAlert.loop, true);
  assert.equal(engine.currentAlert.urgency, 'urgent');

  // Verify broadcast was triggered with alert payload
  assert.ok(broadcasts.length > 0, 'broadcastState should have been called');
  const lastBroadcast = broadcasts[broadcasts.length - 1];
  assert.ok(lastBroadcast.alert);
  assert.equal(lastBroadcast.alert.active, true);
  assert.equal(lastBroadcast.alert.destinations.sanctuary, true);
  assert.equal(lastBroadcast.alert.destinations.livestream, false);
  assert.equal(lastBroadcast.alert.destinations.stage, true);

  // Clear live alert
  engine.clearLiveAlert();
  assert.equal(engine.currentAlert.active, false);
  assert.equal(engine.currentAlert.text, '');
  const clearBroadcast = broadcasts[broadcasts.length - 1];
  assert.equal(clearBroadcast.alert.active, false);
});

test('Display.html: Destination filtering and overlay styling in projection outputs', () => {
  // Mock display.html applyLiveAlert implementation
  const alertContainer = {
    className: '',
    style: {}
  };
  const contentEl = { textContent: '' };
  const tagEl = { textContent: '' };

  function applyLiveAlert(alert, isSanctuary, isStream, isStage) {
    if (!alert || !alert.active || !alert.text) {
      alertContainer.className = '';
      contentEl.textContent = '';
      return;
    }

    const dest = alert.destinations || { sanctuary: true, livestream: true, stage: true };
    const shouldShow =
      (isSanctuary && dest.sanctuary) ||
      (isStream && dest.livestream) ||
      (isStage && dest.stage) ||
      (!isSanctuary && !isStream && !isStage); // Default preview fallback

    if (!shouldShow) {
      alertContainer.className = '';
      contentEl.textContent = '';
      return;
    }

    const pos = alert.position || 'lowerthird';
    let posClass = 'alert-lower-third';
    if (pos === 'upperthird') posClass = 'alert-upper-third';
    else if (pos === 'fullscreen') posClass = 'alert-fullscreen';

    const isMarquee = Boolean(alert.loop);
    const isUrgent = alert.urgency === 'urgent';

    alertContainer.className = `active ${posClass}${isMarquee ? ' alert-marquee' : ''}${isUrgent ? ' alert-urgent' : ''}`;
    tagEl.textContent = alert.tag || (isUrgent ? 'Urgent Notice' : 'Announcement');
    contentEl.textContent = alert.text;
  }

  const sampleAlert = {
    active: true,
    text: 'Please move car with license plate XYZ-789',
    tag: 'Urgent Car Notice',
    position: 'upperthird',
    loop: true,
    urgency: 'urgent',
    destinations: { sanctuary: true, livestream: false, stage: true }
  };

  // 1. Sanctuary Projector view (dest.sanctuary is true -> should display)
  applyLiveAlert(sampleAlert, true, false, false);
  assert.match(alertContainer.className, /\bactive\b/);
  assert.match(alertContainer.className, /\balert-upper-third\b/);
  assert.match(alertContainer.className, /\balert-marquee\b/);
  assert.match(alertContainer.className, /\balert-urgent\b/);
  assert.equal(contentEl.textContent, 'Please move car with license plate XYZ-789');
  assert.equal(tagEl.textContent, 'Urgent Car Notice');

  // 2. Livestream OBS view (dest.livestream is false -> MUST NOT DISPLAY)
  applyLiveAlert(sampleAlert, false, true, false);
  assert.equal(alertContainer.className, '', 'Livestream should NOT show alert when dest.livestream is false');
  assert.equal(contentEl.textContent, '');

  // 3. Clear alert (active: false -> instant 0ms removal)
  applyLiveAlert({ active: false, text: '' }, true, false, false);
  assert.equal(alertContainer.className, '');
  assert.equal(contentEl.textContent, '');
});

test('saved selection only fills composer; timed sends expire without an extra user action', () => {
  const { context, engine, broadcasts, elements } = setupAlertEngineEnvironment();
  const timers = new Map(); let seq = 0;
  context.setTimeout = (fn) => { timers.set(++seq, fn); return seq; };
  context.clearTimeout = id => timers.delete(id);
  context.window.loadAnnouncementComposer({ id: 'saved', text: 'Meeting after service', durationSeconds: 30 });
  assert.equal(broadcasts.length, 0);
  assert.equal(elements.get('live-alert-input').value, 'Meeting after service');
  assert.equal(elements.get('alert-dest-stage').checked, false);
  engine.sendLiveAlert({ text: 'Timed notice', durationSeconds: 30, destinations: { stage: true } });
  assert.ok(engine.currentAlert.expiresAt > Date.now());
  const finish = [...timers.values()][0]; finish();
  assert.equal(engine.currentAlert.active, false);
  assert.equal(broadcasts.at(-1).alert.active, false);
});

test('replacing an expiring message cannot let the previous timer clear the new message', () => {
  const { context, engine } = setupAlertEngineEnvironment();
  const callbacks=[]; context.setTimeout=fn=>{callbacks.push(fn);return callbacks.length}; context.clearTimeout=()=>{};
  engine.sendLiveAlert({text:'First',durationSeconds:30});
  engine.sendLiveAlert({text:'Second',durationSeconds:60});
  callbacks[0](); assert.equal(engine.currentAlert.text,'Second'); assert.equal(engine.currentAlert.active,true);
});

test('tray open and close preserves draft, does not broadcast or rebuild its saved list', () => {
  const { context, engine, elements, broadcasts } = setupAlertEngineEnvironment();
  let renders=0; engine.renderSavedList=()=>renders++;
  context.window.openAnnouncementHub();
  elements.get('live-alert-input').value='Keep this draft';
  assert.equal(elements.get('bento-announcement-btn').attributes['aria-expanded'],'true');
  context.window.closeAnnouncementHub();
  assert.equal(elements.get('announcement-hub-drawer').hidden,true);
  context.window.openAnnouncementHub();
  assert.equal(elements.get('live-alert-input').value,'Keep this draft');
  assert.equal(renders,1);
  assert.equal(broadcasts.length,0);
});

 test('composer saves and edits without broadcasting or requiring destinations', () => {
  const { context, engine, elements, broadcasts } = setupAlertEngineEnvironment();
  context.window.resetAnnouncementComposer();
  elements.get('live-alert-input').value = 'New notice';
  context.window.saveAnnouncementDraft();
  assert.equal(engine.savedAnnouncements.length, 1);
  const id = engine.savedAnnouncements[0].id;
  context.window.loadAnnouncementComposer(engine.savedAnnouncements[0]);
  elements.get('live-alert-input').value = 'Updated notice';
  context.window.saveAnnouncementDraft();
  assert.equal(engine.savedAnnouncements.length, 1);
  assert.equal(engine.savedAnnouncements[0].id, id);
  assert.equal(engine.savedAnnouncements[0].text, 'Updated notice');
  assert.equal(broadcasts.length, 0);
  assert.equal(engine.currentAlert, null);
 });
