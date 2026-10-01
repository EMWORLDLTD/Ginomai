// Keep HTTP connections available for navigation, assets and output previews.
(() => {
  if (!window.EventSource || location.protocol === 'file:') return;
  const NativeEventSource = window.EventSource;
  const workerUrl = new URL('shared-events-worker.js', document.currentScript.src).href;
  const clients = new Set();
  window.AppEventSource = class extends EventTarget {
    constructor(url) {
      super();
      this.url = new URL(url, location.href).href;
      this.readyState = 0;
      clients.add(this);
      const relay = message => {
        this.readyState = message.readyState;
        const event = new MessageEvent(message.type, { data: message.data });
        this.dispatchEvent(event);
        this['on' + message.type]?.(event);
      };
      const fallback = () => {
        if (this.native || this.readyState === 2) return;
        this.worker?.port.postMessage({ type: 'close' });
        this.native = new NativeEventSource(this.url);
        for (const type of ['open', 'message', 'error', 'output-session']) {
          this.native.addEventListener(type, e => relay({ type, data: e.data, readyState: this.native.readyState }));
        }
      };
      try {
        this.worker = new SharedWorker(workerUrl, 'ginomia-events');
        this.worker.port.onmessage = e => relay(e.data);
        this.worker.onerror = fallback;
        this.worker.port.start();
        this.worker.port.postMessage({ type: 'subscribe', url: this.url });
      } catch (_) { fallback(); }
    }
    close() {
      this.readyState = 2;
      this.native?.close();
      this.worker?.port.postMessage({ type: 'close' });
      this.worker?.port.close();
      clients.delete(this);
    }
  };
  window.addEventListener('pagehide', () => { for (const client of clients) client.close(); });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
})();
