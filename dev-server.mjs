// Dependency-free development server for the single-file NutriTrack app.
//
// The whole app is one static index.html (no bundler, no backend), so the dev
// server does two things: serve the repo as-is on 0.0.0.0:3000 and push a
// live-reload event over SSE whenever a served file changes. Polling stat()
// instead of fs.watch is deliberate - inotify events are not reliable on
// bind-mounted filesystems inside containers.
//
// Usage: node dev-server.mjs   (PORT env var optional, default 3000)
import { createServer } from 'node:http';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 3000);
const RELOAD_PATH = '/__dev/reload';
const POLL_MS = 400;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const RELOAD_SNIPPET =
  '<script>(()=>{const es=new EventSource("' + RELOAD_PATH + '");' +
  'es.onmessage=()=>location.reload()})()</script>';

/** Connected live-reload clients. */
const clients = new Set();

/** Snapshot of served file mtimes, refreshed by the poller. */
let snapshot = snap();

function snap() {
  const out = new Map();
  for (const name of readdirSync(ROOT)) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    try {
      out.set(name, statSync(join(ROOT, name)).mtimeMs);
    } catch {
      /* file vanished mid-scan - ignore */
    }
  }
  return out;
}

function changed(a, b) {
  if (a.size !== b.size) return true;
  for (const [name, mtime] of b) if (a.get(name) !== mtime) return true;
  return false;
}

function broadcast() {
  for (const res of clients) res.write('data: reload\n\n');
}

setInterval(() => {
  const next = snap();
  if (changed(snapshot, next)) {
    snapshot = next;
    broadcast();
  }
}, POLL_MS).unref();

function resolvePath(url) {
  const path = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  if (path === '/' || path.endsWith('/')) return 'index.html';
  return path.replace(/^\/+/, '');
}

const server = createServer((req, res) => {
  // Live-reload event stream.
  if (req.url?.split('?')[0] === RELOAD_PATH) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    res.write('retry: 1000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  const rel = resolvePath(req.url || '/');
  const file = resolve(ROOT, rel);

  // Only ever serve files inside the project directory.
  if (file !== ROOT && !file.startsWith(ROOT + sep)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found\n');
    return;
  }

  let body;
  try {
    body = readFileSync(file);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found\n');
    return;
  }

  // Inject the reload client into HTML responses only.
  if (extname(file) === '.html') {
    const html = body.toString('utf8');
    const injected = html.includes('</body>')
      ? html.replace('</body>', RELOAD_SNIPPET + '</body>')
      : html + RELOAD_SNIPPET;
    res.writeHead(200, {
      'Content-Type': TYPES['.html'],
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(injected),
    });
    res.end(injected);
    return;
  }

  res.writeHead(200, {
    'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
  });
  res.end(body);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`NutriTrack dev server: http://0.0.0.0:${PORT} (serving ${ROOT})`);
});
