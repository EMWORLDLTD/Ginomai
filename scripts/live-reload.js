'use strict';

const fs = require('node:fs');

module.exports = function createLiveReload(root) {
  const clients = new Set();
  let revision = `${Date.now()}`;
  let timer;
  const send = client => client.write(`data: ${revision}\n\n`);
  const watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    const file = filename.toString().replace(/\\/g, '/');
    const parts = file.split('/');
    if (parts.some(part => part.startsWith('.') || ['node_modules', 'dist', 'release', 'installers', 'archive', 'scratch', 'output', 'backgrounds', 'media'].includes(part))) return;
    if (!/\.(html|css|js|json|svg|png|jpe?g|webp|gif|woff2?|mp4|webm)$/i.test(file)) return;
    if (file === 'server.js' || file.startsWith('scripts/') || file.startsWith('electron/') || file.startsWith('lib/') || file.startsWith('tests/') || file.startsWith('output/') || file.startsWith('backgrounds/') || file.startsWith('media/')) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      revision = `${Date.now()}`;
      for (const client of clients) send(client);
    }, 150);
  });
  const heartbeat = setInterval(() => {
    for (const client of clients) client.write(': keepalive\n\n');
  }, 15000);
  heartbeat.unref();
  const script = `<script>(()=>{let revision;const events=new EventSource('/__dev/events');events.onmessage=event=>{if(revision&&revision!==event.data){events.close();location.reload();}revision=event.data;};})();</script>`;
  return {
    handle(req, res, pathname) {
      if (pathname !== '/__dev/events') return false;
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      clients.add(res);
      send(res);
      req.on('close', () => clients.delete(res));
      return true;
    },
    serveHtml(filePath, res) {
      fs.readFile(filePath, 'utf8', (error, html) => {
        if (error) { res.writeHead(500); res.end('Unable to read page'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(html.includes('</body>') ? html.replace('</body>', `${script}</body>`) : html + script);
      });
    },
    close() {
      watcher.close();
      clearTimeout(timer);
      clearInterval(heartbeat);
      for (const client of clients) client.end();
    }
  };
};
