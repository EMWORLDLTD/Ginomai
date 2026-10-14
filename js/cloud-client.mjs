export class CloudClient {
  constructor(config = {}, {storage = globalThis.localStorage, fetcher = globalThis.fetch?.bind(globalThis), now = Date.now, pageLocation = globalThis.location} = {}) {
    this.config = config; this.storage = storage; this.fetcher = fetcher; this.now = now; this.listeners = new Set(); this.generation = 0;
    this.url = (config.url || '').replace(/\/$/, '');
    this.testingLocally = config.enabled === false && config.localTesting === true && ['http:', 'https:'].includes(pageLocation?.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(pageLocation?.hostname);
    this.configured = (config.enabled !== false || this.testingLocally) && /^https:\/\/[^/]+$/.test(this.url) && Boolean(config.publishableKey) && !config.publishableKey.startsWith('sb_secret_');
    // Reject legacy privileged JWT keys too.
    try {if (config.publishableKey?.split('.').length === 3 && JSON.parse(atob(config.publishableKey.split('.')[1])).role === 'service_role') this.configured = false;} catch {this.configured = false;}
    this.key = `ginomai.cloud.auth.v1:${this.url}`;
    try {this.session = JSON.parse(storage.getItem(this.key) || 'null'); this.pending = JSON.parse(storage.getItem(this.key + ':pending') || 'null');} catch {this.session = this.pending = null;}
    if (!this.session?.access_token || !this.session?.refresh_token || !this.session?.user?.id) this.session = null;
  }
  subscribe(fn) {this.listeners.add(fn); return () => this.listeners.delete(fn);}
  changed() {this.listeners.forEach(fn => fn());}
  saveSession(session) {
    const value = {...session, expires_at: session.expires_at || Math.floor(this.now() / 1000) + session.expires_in};
    this.storage.setItem(this.key, JSON.stringify(value)); this.session = value; this.changed();
  }
  async request(path, {method = 'POST', body, token, signal} = {}) {
    if (!this.configured) throw Error('Cloud accounts are not configured yet. You can continue using Ginomai locally.');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
    const abort = () => controller.abort(); signal?.addEventListener('abort', abort, {once: true}); if (signal?.aborted) controller.abort();
    try {
      const response = await this.fetcher(this.url + path, {method, signal: controller.signal, cache: 'no-store', headers: {
        apikey: this.config.publishableKey, 'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})
      }, ...(body !== undefined ? {body: JSON.stringify(body)} : {})});
      const data = response.status === 204 ? null : await response.json();
      if (!response.ok) {
        const error = Error(response.status === 429 ? 'Too many requests. Wait before trying again.' : data?.msg || data?.message || data?.error_description || 'Cloud request failed. Please retry.');
        error.status = response.status; throw error;
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw Error('Cloud request stopped or timed out. Local work is still available.');
      throw error;
    } finally {clearTimeout(timeout); signal?.removeEventListener('abort', abort);}
  }
  async sendCode(email) {
    email = email.trim(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw Error('Enter a valid email address.');
    if (this.pending?.email === email && this.now() - this.pending.sentAt < 60000) throw Error('Wait 60 seconds before requesting another code.');
    const generation = this.generation;
    await this.request('/auth/v1/otp', {body: {email, create_user: true}});
    if (generation !== this.generation) return;
    this.pending = {email, sentAt: this.now()}; this.storage.setItem(this.key + ':pending', JSON.stringify(this.pending)); this.changed();
  }
  async verifyCode(code) {
    if (!this.pending || !/^\d{6,10}$/.test(code.trim())) throw Error('Enter the 6–10 digit code sent to your email.');
    const generation = this.generation;
    const data = await this.request('/auth/v1/verify', {body: {email: this.pending.email, token: code.trim(), type: 'email'}});
    if (generation !== this.generation) return;
    this.saveSession(data); this.pending = null; this.storage.removeItem(this.key + ':pending'); this.changed();
  }
  resetPending() {
    this.generation++; this.pending = null;
    this.storage.removeItem(this.key + ':pending'); this.changed();
  }
  async accessToken() {
    if (!this.session) throw Error('Sign in to use cloud backups.');
    if (this.session.expires_at > this.now() / 1000 + 60) return this.session.access_token;
    if (this.refreshing) return this.refreshing;
    const generation = this.generation, refreshToken = this.session.refresh_token;
    this.refreshing = (async () => {
      try {
        const data = await this.request('/auth/v1/token?grant_type=refresh_token', {body: {refresh_token: refreshToken}});
        if (generation !== this.generation) throw Error('Account changed. Sign in again.');
        this.saveSession(data); return data.access_token;
      } catch (error) {
        if (generation === this.generation && [400, 401, 403].includes(error.status)) this.clearLocal();
        throw error;
      } finally {this.refreshing = null;}
    })();
    return this.refreshing;
  }
  clearLocal() {
    this.generation++; this.session = this.pending = null;
    this.storage.removeItem(this.key); this.storage.removeItem(this.key + ':pending'); this.changed();
  }
  async signOut() {
    const token = this.session?.access_token; this.clearLocal();
    if (token) try {await this.request('/auth/v1/logout?scope=local', {token});} catch {return 'Signed out on this device. Cloud session revocation could not be confirmed; its access token will expire.';}
    return 'Signed out on this device. Local songs and sessions are kept.';
  }
}
