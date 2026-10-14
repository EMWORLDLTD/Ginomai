'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const {build, destination} = require('./build.cjs');
const mime = {'.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml'};
async function main() {
  await build();
  const port = Number(process.env.GINOMAI_WEB_PORT || 8700);
  const server = http.createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {response.writeHead(405); response.end(); return;}
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const target = path.resolve(destination, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
      if (!target.startsWith(destination + path.sep)) {response.writeHead(403); response.end(); return;}
      const bytes = await fs.readFile(target);
      response.writeHead(200, {'Content-Type': (mime[path.extname(target)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff'});
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch {response.writeHead(404); response.end('Not found');}
  });
  server.listen(port, '127.0.0.1', () => console.log(`Open http://localhost:${port} — standalone browser preview; no desktop server required.`));
}
if (require.main === module) main().catch(error => {console.error(error); process.exitCode = 1;});
