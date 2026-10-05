'use strict';
(() => {
  const byId = id => document.getElementById(id);
  const api = window.ginomiaInstaller;
  let preview = !api;
  const features = [0, 1, 2].map(index => byId(`feature-${index}`));
  const selectors = [...document.querySelectorAll('[data-feature]')];
  const primary = byId('primary-action');
  const track = byId('progress-track');
  let active = 0;
  let timer;
  let paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let state = 'ready';

  function showFeature(index) {
    features[active].hidden = true;
    selectors[active].classList.remove('active');
    selectors[active].setAttribute('aria-pressed', 'false');
    active = index;
    features[active].hidden = false;
    selectors[active].classList.add('active');
    selectors[active].setAttribute('aria-pressed', 'true');
  }
  function schedule() {
    clearInterval(timer);
    byId('pause-slides').textContent = paused ? 'Play' : 'Pause';
    byId('pause-slides').setAttribute('aria-label', `${paused ? 'Play' : 'Pause'} feature slides`);
    byId('pause-slides').setAttribute('aria-pressed', String(paused));
    if (!paused && !document.hidden) timer = setInterval(() => showFeature((active + 1) % 3), 7500);
  }
  selectors.forEach((button, index) => button.addEventListener('click', () => { showFeature(index); schedule(); }));
  byId('pause-slides').addEventListener('click', () => { paused = !paused; schedule(); });
  document.addEventListener('visibilitychange', schedule);

  function update(value) {
    state = value.state;
    document.body.dataset.state = state;
    byId('status-heading').textContent = value.heading;
    byId('status-message').textContent = value.message;
    const percent = typeof value.percent === 'number' ? Math.max(0, Math.min(100, value.percent)) : null;
    track.classList.toggle('indeterminate', percent === null && state === 'installing');
    if (percent === null) track.removeAttribute('aria-valuenow');
    else track.setAttribute('aria-valuenow', String(percent));
    track.setAttribute('aria-valuetext', value.message);
    byId('progress-fill').style.width = percent === null ? '' : `${percent}%`;
    byId('progress-value').textContent = percent === null ? '' : `${percent}%`;
    primary.disabled = state === 'installing' || preview;
    primary.textContent = state === 'complete' ? 'Open Ginomia' : state === 'installing' ? 'Installing…' : state === 'error' ? 'Try again' : 'Install Ginomia';
    byId('desktop-shortcut').disabled = state === 'installing' || state === 'complete' || preview;
    byId('change-location').disabled = state === 'installing' || state === 'complete' || preview;
    for (const id of ['close', 'mac-close']) byId(id).disabled = state === 'installing';
  }

  for (const id of ['close', 'mac-close']) byId(id).addEventListener('click', () => api?.close());
  for (const id of ['minimize', 'mac-minimize']) byId(id).addEventListener('click', () => api?.minimize());
  byId('details-toggle').addEventListener('click', () => {
    const expanded = byId('installation-details').hidden;
    byId('installation-details').hidden = !expanded;
    byId('details-toggle').setAttribute('aria-expanded', String(expanded));
    api?.resizeDetails(expanded);
  });
  byId('change-location').addEventListener('click', async () => {
    const directory = await api.chooseLocation();
    if (directory) byId('install-location').textContent = directory;
  });
  primary.addEventListener('click', async () => {
    if (!api || state === 'installing') return;
    if (state === 'complete') {
      try { await api.launch(); }
      catch (error) { byId('status-message').textContent = error.message; }
      return;
    }
    update({ state:'installing', heading:'Preparing Ginomia', message:'Checking the installation package…', percent:null });
    try { await api.install({ desktopShortcut:byId('desktop-shortcut').checked }); }
    catch (error) { update({ state:'error', heading:'Installation needs attention', message:error.message, percent:null }); }
  });

  async function init() {
    const info = api ? await api.info() : {
      platform:new URLSearchParams(location.search).get('platform') === 'darwin' ? 'darwin' : 'win32',
      version:'2.4.0', directory:'Preview only — installation is disabled'
    };
    preview = !api || Boolean(info.preview);
    document.body.dataset.platform = info.platform;
    byId('window-title').textContent = info.platform === 'darwin' ? 'Install Ginomia' : 'Ginomia Setup';
    byId('shortcut-option').hidden = info.platform === 'darwin';
    byId('install-location').textContent = info.directory;
    byId('version-label').textContent = `Ginomia ${info.version}${preview ? ' · Design preview' : ''}`;
    showFeature(info.platform === 'darwin' ? 1 : 0);
    if (api) api.onProgress(update);
    if (preview) {
      primary.disabled = true;
      byId('desktop-shortcut').disabled = true;
      byId('change-location').disabled = true;
      byId('status-message').textContent = 'Design preview — installation is disabled.';
    }
    schedule();
  }
  init().catch(error => update({ state:'error', heading:'Setup could not start', message:error.message, percent:null }));
})();
