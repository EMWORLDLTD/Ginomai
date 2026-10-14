// The existing projector renderer handles text fitting. This bridge only supplies local state.
(() => {
  const CHANNEL = 'ginomai_web_live_v1', KEY = 'ginomai.web.live.v1';
  const preview = new URLSearchParams(location.search).has('preview');
  const id = crypto.randomUUID();
  let latest = 0, channel;
  try {channel = new BroadcastChannel(CHANNEL);} catch {}
  const acknowledge = () => channel?.postMessage({type: 'OUTPUT_ACK', id, preview, timestamp: latest});
  function receive(payload) {
    if (!payload || typeof payload.text !== 'string' || !Number.isFinite(payload._timestamp) || payload._timestamp < latest) return;
    window.applyState(payload); latest = payload._timestamp; acknowledge();
  }
  if (channel) channel.onmessage = event => {
    if (event.data?.type === 'LIVE') receive(event.data.payload);
    if (event.data?.type === 'CHECK_OUTPUTS') acknowledge();
  };
  addEventListener('message', event => {
    if (event.origin !== location.origin || (event.source !== parent && event.source !== opener)) return;
    if (event.data?.type === 'GINOMAI_WEB_LIVE') receive(event.data.payload);
  });
  addEventListener('storage', event => {
    if (event.key === KEY && event.newValue) {try {receive(JSON.parse(event.newValue));} catch {}}
  });
  try {receive(JSON.parse(localStorage.getItem(KEY) || 'null'));} catch {}
  channel?.postMessage({type: 'REQUEST_STATE'});
  const heartbeat = setInterval(acknowledge, 2000);
  addEventListener('pagehide', () => {clearInterval(heartbeat); channel?.postMessage({type: 'OUTPUT_CLOSED', id}); channel?.close();});
  if (!preview) {
    const button = document.createElement('button');
    button.textContent = 'Enter fullscreen';
    Object.assign(button.style, {position: 'fixed', right: '16px', top: '16px', zIndex: '100000', padding: '12px 16px', color: '#fff', background: '#151823', border: '1px solid #ffffff40', borderRadius: '8px', cursor: 'pointer', fontFamily: 'Arial'});
    button.onclick = () => document.documentElement.requestFullscreen?.().catch(() => {button.textContent = 'Use your browser’s fullscreen option';});
    document.body.append(button);
    addEventListener('fullscreenchange', () => {button.hidden = Boolean(document.fullscreenElement);});
  }
})();
