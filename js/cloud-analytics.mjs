export class ActivityTracker {
  constructor(client, platform, {storage = globalThis.localStorage, now = Date.now, makeId = () => crypto.randomUUID()} = {}) {
    this.client = client; this.platform = platform; this.storage = storage; this.now = now; this.makeId = makeId;
    this.key = `ginomai.cloud.analytics.v1:${client.url}`; this.generation = 0; this.running = null;
  }
  get consent() {try {const saved = this.storage.getItem(this.key + ':consent'); return saved === null || saved === 'true';} catch {return false;}}
  setConsent(value) {
    this.storage.setItem(this.key + ':consent', value ? 'true' : 'false'); this.generation++;
    this.controller?.abort();
    if (!value) {this.storage.removeItem(this.key + ':last'); this.storage.removeItem(this.key + ':installation');}
  }
  async track() {
    if (!this.consent || !this.client.configured) return;
    if (this.running) {await this.running; if (!this.consent) return;}
    const day = new Date(this.now()).toISOString().slice(0, 10), account = this.client.session?.user?.id || 'guest';
    const stamp = `${day}:${account}`;
    if (this.storage.getItem(this.key + ':last') === stamp) return;
    const generation = this.generation, accountGeneration = this.client.generation;
    let installation = this.storage.getItem(this.key + ':installation');
    if (!installation) {installation = this.makeId(); this.storage.setItem(this.key + ':installation', installation);}
    this.controller = new AbortController(); const controller = this.controller;
    this.running = (async () => {
      try {
        const token = this.client.session ? await this.client.accessToken() : undefined;
        if (!this.consent || generation !== this.generation || accountGeneration !== this.client.generation) return;
        await this.client.request('/rest/v1/rpc/record_cloud_activity', {token, signal: controller.signal, body: {
          p_installation_id: installation, p_platform: this.platform, p_app_version: this.client.config.appVersion || 'unknown', p_consent: true
        }});
        if (this.consent && generation === this.generation && accountGeneration === this.client.generation) this.storage.setItem(this.key + ':last', stamp);
      } catch { /* Activity is best-effort; never interrupt local work or show recurring errors. */ }
      finally {this.running = null; if (this.controller === controller) this.controller = null;}
    })();
    await this.running;
  }
}
export function mountAnalytics(panel, client, platform) {
  const tracker = new ActivityTracker(client, platform), {node} = panel;
  const label = node('label', '', 'ginomai-analytics-toggle'), checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = tracker.consent;
  const text = node('span'); text.append(node('strong','Help improve Ginomai'),node('small','Share basic usage statistics to improve the app. Turn off anytime.'));
  label.append(checkbox,text);
  const row = node('div', '', 'ginomai-analytics-row'), info = node('span', '', 'ginomai-analytics-info'), button = node('button', '', 'ginomai-analytics-info-button');
  button.type = 'button'; button.setAttribute('aria-label', 'About usage statistics'); button.setAttribute('aria-expanded', 'false');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','aria-hidden':'true'})) svg.setAttribute(key,value);
  for (const d of ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0','M12 11v6','M12 7h.01']) {const path = document.createElementNS(svg.namespaceURI,'path'); path.setAttribute('d',d); svg.append(path);}
  button.append(svg);
  const tooltip = node('p', 'We collect your app version, desktop or web usage, daily activity and a random installation code. Signed-in activity is linked to your account. Songs, service plans, sermon content and other workspace content are never included.', 'ginomai-analytics-tooltip');
  tooltip.id = 'ginomai-analytics-details'; tooltip.hidden = true; tooltip.setAttribute('role', 'tooltip'); button.setAttribute('aria-describedby', tooltip.id);
  const reveal = () => {tooltip.hidden = false; button.setAttribute('aria-expanded', 'true');};
  const dismiss = () => {tooltip.hidden = true; button.setAttribute('aria-expanded', 'false');};
  let pinned = false;
  info.onpointerenter = reveal; info.onpointerleave = () => {if (!pinned && document.activeElement !== button) dismiss();};
  button.onfocus = reveal; button.onblur = () => {pinned = false; dismiss();};
  button.onclick = () => {pinned = !pinned; if (pinned) reveal(); else dismiss();};
  tooltip.addEventListener('dismiss', () => {pinned = false; dismiss();});
  info.append(button,tooltip); row.append(label,info); panel.analyticsHost.append(row);
  const schedule = () => {if (document.visibilityState !== 'hidden') setTimeout(() => tracker.track(), 0);};
  checkbox.onchange = () => {tracker.setConsent(checkbox.checked); schedule();};
  client.subscribe(schedule);
  window.addEventListener('storage', event => {if (event.key === tracker.key + ':consent') {tracker.generation++; tracker.controller?.abort(); checkbox.checked = tracker.consent;}});
  document.addEventListener('visibilitychange', schedule);
  const timer = setInterval(schedule, 3600000); window.addEventListener('pagehide', () => clearInterval(timer), {once: true});
  setTimeout(schedule, 1000);
  return {update() {checkbox.checked = tracker.consent;}, opened() {}};
}
