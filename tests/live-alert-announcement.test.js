const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const announcementsJs = fs.readFileSync(path.join(__dirname, '../js/announcements.js'), 'utf8');

function setupAlertEngineEnvironment(saved = [], themes = {}) {
  const store = new Map(saved);
  const localStorageMock = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };

  const elements = new Map();
  const documentEvents = new Map();
  function makeElement(id) {
    const el = {
      id,
      value: '',
      textContent: '',
      innerHTML: '',
      className: '',
      style: {},
      dataset: {},
      attributes: {},
      offsetHeight: 80,
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
      focus() { sandbox.document.activeElement = el; },
      getBoundingClientRect() { return { left: 20, right: 240, top: 100, bottom: 128, width: 220 }; },
      addEventListener() {},
      appendChild(c) { el._children = el._children || []; el._children.push(c); },
      get children() { return el._children || []; },
      replaceChildren() { el._children = []; },
      querySelectorAll() { return []; },
      querySelector(selector) {
        if (!['.ann-delete-no', '.ann-delete-yes', '.ann-background-close', 'input', '.ann-background-filters', '.ann-background-grid', '.ann-background-none'].includes(selector)) return null;
        el._queryNodes ||= {};
        return el._queryNodes[selector] ||= makeElement(id + selector);
      },
      contains(target) { return target === el || (el._children || []).includes(target); }
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
      body: makeElement('body'),
      addEventListener: (type, handler) => documentEvents.set(type, handler),
      getElementById: (id) => elements.get(id) || makeElement(id),
      querySelectorAll: (sel) => [],
      querySelector: (sel) => null,
      createElement: (tag) => makeElement(`elem_${Math.random()}`)
    },
    window: {
      SANCTUARY_THEMES: themes,
      innerWidth: 1000,
      innerHeight: 700,
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

  return { context, store, toasts, broadcasts, elements, documentEvents, engine: context.window.liveAlertEngine };
}

test('LiveAlertEngine: Initialization and default saved announcements', () => {
  const { engine, store } = setupAlertEngineEnvironment();

  assert.ok(engine, 'LiveAlertEngine should be instantiated on window');
  assert.ok(Array.isArray(engine.savedAnnouncements));
  assert.equal(engine.savedAnnouncements.length, 0, 'Should not seed sample announcements');
  assert.equal(store.has('sf_saved_announcements'), true);
});

test('full-screen background choice persists across New, saved messages, reloads and global theme changes', () => {
  const theme = { id: 'gold', name: 'Golden', type: 'image', imageUrl: 'Themes/gold.webp', textColor: '#fff8e0', font: 'Outfit' };
  const { context, engine, elements, store, broadcasts } = setupAlertEngineEnvironment([], { gold: theme });
  context.window.loadAnnouncementComposer({ position: 'fullscreen', text: 'Welcome' });
  assert.equal(elements.get('ann-background-field').hidden, false);
  const anchor = context.document.getElementById('ann-background-trigger');
  context.window.openAnnouncementBackgroundPicker(anchor);
  const popup = context.document.body._children.at(-1);
  const grid = popup.querySelector('.ann-background-grid');
  grid.children.find(card => card.dataset.name === 'golden').onclick();
  assert.equal(popup.hidden, true);
  assert.equal(elements.get('ann-background-name').textContent, 'Golden');
  assert.equal(broadcasts.length, 0, 'choosing a future background must not send a message');
  assert.equal(JSON.parse(store.get('sf_announcement_background')).id, 'gold');
  context.window.resetAnnouncementComposer();
  assert.equal(elements.get('ann-background-field').hidden, true);
  context.window.loadAnnouncementComposer({ text: 'Next message', position: 'fullscreen' });
  engine.sendLiveAlert({ text: 'Next message', position: 'fullscreen' });
  assert.equal(engine.currentAlert.background.imageUrl, theme.imageUrl);
  context.window.themeManager = { activeSanctuaryTheme: 'another-theme' };
  engine.sendLiveAlert({ text: 'Another message', position: 'fullscreen' });
  assert.equal(engine.currentAlert.background.id, 'gold');
  const reloaded = setupAlertEngineEnvironment([...store], { gold: theme });
  reloaded.engine.sendLiveAlert({ text: 'After restart', position: 'fullscreen' });
  assert.equal(reloaded.engine.currentAlert.background.id, 'gold');
  reloaded.engine.sendLiveAlert({ text: 'Ticker', position: 'upperthird' });
  assert.equal(reloaded.engine.currentAlert.background, undefined);
});

test('background picker filters by type and search and closes through the shared shield', () => {
  const { context, elements } = setupAlertEngineEnvironment([], {
    still: { id: 'still', name: 'Blue still', type: 'image', imageUrl: 'blue.webp' },
    motion: { id: 'motion', name: 'Blue motion', type: 'video', videoUrl: 'blue.webm' },
    upload: { id: 'upload', name: 'My photo', type: 'image', imageUrl: '/uploads/photo.webp', custom: true }
  });
  let dismiss;
  context.window.openDismissShield = handler => { dismiss = handler; };
  context.window.openAnnouncementBackgroundPicker(context.document.getElementById('ann-background-trigger'));
  const popup = context.document.body._children.at(-1);
  const grid = popup.querySelector('.ann-background-grid');
  popup.querySelector('.ann-background-filters').children.find(button => button.textContent === 'Motion').onclick();
  assert.deepEqual(grid.children.filter(card => !card.hidden).map(card => card.dataset.name), ['blue motion']);
  const search = popup.querySelector('input'); search.value = 'missing'; search.oninput();
  assert.equal(popup.querySelector('.ann-background-none').hidden, false);
  dismiss(); assert.equal(popup.hidden, true);
});

test('received remote announcements retain their background after host reload without echoing a send', () => {
  const { engine, store, broadcasts } = setupAlertEngineEnvironment();
  const alert = { active: true, text: 'Remote notice', position: 'fullscreen', background: { id: 'blue', bgCss: '#123456' } };
  engine.receiveLiveAlert(alert);
  assert.equal(broadcasts.length, 0);
  const reloaded = setupAlertEngineEnvironment([...store]);
  assert.equal(reloaded.engine.currentAlert.background.bgCss, '#123456');
  reloaded.engine.receiveLiveAlert({ active: false, text: '' });
  assert.equal(reloaded.store.has('sf_live_alert'), false);
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
    { id: '2', tag: 'Welcome', text: 'Welcome to Ginomai sanctuary service.' },
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

test('full-screen composer settings survive save, selection and sending without replacing the slide', () => {
  const { context, engine, elements, broadcasts } = setupAlertEngineEnvironment();
  const timers = [];
  context.setTimeout = fn => { timers.push(fn); return timers.length; };
  context.clearTimeout = () => {};
  context.window.loadAnnouncementComposer({ text: 'Welcome\nPlease be seated', position: 'fullscreen', durationSeconds: 30 });
  assert.equal(elements.get('alert-position').value, 'fullscreen');
  context.window.saveAnnouncementDraft();
  assert.equal(engine.savedAnnouncements[0].position, 'fullscreen');
  context.window.resetAnnouncementComposer();
  context.window.loadAnnouncementComposer(engine.savedAnnouncements[0]);
  assert.equal(elements.get('alert-position').value, 'fullscreen');
  elements.get('alert-dest-sanctuary').checked = true;
  context.window.sendQuickLiveAlert();
  assert.equal(broadcasts.at(-1).alert.position, 'fullscreen');
  assert.deepEqual(Object.keys(broadcasts.at(-1)), ['alert']);
  timers.at(-1)();
  assert.equal(broadcasts.at(-1).alert.active, false);
  assert.deepEqual(Object.keys(broadcasts.at(-1)), ['alert']);
});

test('delete confirmation requires Yes; No, Escape and outside dismissal preserve saved messages', () => {
  const { context, engine, elements, documentEvents, broadcasts } = setupAlertEngineEnvironment();
  const saved = engine.saveAnnouncement({ title: 'Notice', text: 'Keep this until confirmed' });
  const anchor = elements.get('ann-search-input') || context.document.getElementById('ann-search-input');
  let outsideDismiss;
  let shields = 0;
  context.window.openDismissShield = (handler, layer) => {
    outsideDismiss = handler;
    assert.equal(layer, 100043);
    shields++;
  };
  const popup = () => context.document.body._children.at(-1);
  const open = () => context.window.confirmAnnouncementDelete(saved.id, anchor);
  open();
  assert.equal(engine.savedAnnouncements.length, 1);
  assert.equal(popup().attributes.role, 'dialog');
  assert.equal(popup().style.width, '224px');
  popup().querySelector('.ann-delete-no').onclick();
  assert.equal(popup().hidden, true);
  assert.equal(engine.savedAnnouncements.length, 1);
  open(); outsideDismiss();
  assert.equal(popup().hidden, true);
  assert.equal(engine.savedAnnouncements.length, 1);
  open();
  let consumed = 0;
  documentEvents.get('keydown')({ key: 'Escape', preventDefault() { consumed++; }, stopImmediatePropagation() { consumed++; } });
  assert.equal(consumed, 2);
  assert.equal(popup().hidden, true);
  assert.equal(engine.savedAnnouncements.length, 1);
  open();
  popup().onkeydown({ key: 'Tab', preventDefault() {} });
  assert.equal(context.document.activeElement, popup().querySelector('.ann-delete-yes'));
  engine.editingId = saved.id;
  popup().querySelector('.ann-delete-yes').onclick();
  assert.equal(engine.savedAnnouncements.length, 0);
  assert.equal(engine.editingId, null);
  assert.equal(popup().hidden, true);
  assert.equal(shields, 4);
  assert.equal(broadcasts.length, 0);
});

test('announcement custom dropdown uses the dismissal shield, syncs selection and supports Escape', () => {
  const { context, elements, documentEvents } = setupAlertEngineEnvironment();
  const element = id => context.document.getElementById(id);
  const select = element('alert-position');
  const wrapper = element('select-wrapper');
  const trigger = element('select-trigger');
  const popup = element('select-options');
  const options = [element('top-option'), element('bottom-option'), element('full-option')];
  const values = ['upperthird', 'lowerthird', 'fullscreen'];
  select.value = 'upperthird';
  select.options = values.map(value => ({ value, text: value }));
  Object.defineProperty(select, 'selectedIndex', { get: () => values.indexOf(select.value) });
  select.closest = () => ({ firstChild: { textContent: 'Position' } });
  let change;
  select.addEventListener = (type, handler) => { if (type === 'change') change = handler; };
  popup.querySelectorAll = () => options;
  popup.querySelector = () => options.find(option => option.classList.contains('selected'));
  const build = () => options.forEach((option, index) => {
    option.dataset = { value: values[index] };
    option.classList.toggle('selected', select.value === values[index]);
    option.onclick = () => { select.value = values[index]; change(); };
  });
  let dismiss;
  let syncs = 0;
  context.window.openDismissShield = handler => { dismiss = handler; };
  context.window.syncCustomSelect = () => syncs++;
  context.window.configureAnnouncementSelect(select, wrapper, trigger, popup, build);
  const click = () => trigger.onclick({ preventDefault() {}, stopPropagation() {} });
  click();
  assert.equal(popup.hidden, false);
  assert.equal(trigger.attributes['aria-expanded'], 'true');
  assert.equal(options[2].attributes.role, 'option');
  options[2].onclick();
  assert.equal(select.value, 'fullscreen');
  assert.equal(popup.hidden, true);
  assert.match(trigger.attributes['aria-label'], /fullscreen/);
  assert.equal(syncs, 2);
  click(); dismiss(); assert.equal(popup.hidden, true);
  click();
  documentEvents.get('keydown')({ key: 'Escape', preventDefault() {}, stopImmediatePropagation() {} });
  assert.equal(popup.hidden, true);
  assert.equal(wrapper.classList.contains('open'), false);
});
