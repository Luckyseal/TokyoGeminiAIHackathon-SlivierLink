import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const distDir = resolve(__dirname, 'dist');
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '0.0.0.0';

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
]);

const sendFile = (res, filePath, method) => {
  const extension = extname(filePath);
  const headers = {
    'Content-Type': mimeTypes.get(extension) || 'application/octet-stream',
  };

  if (filePath.includes(`${sep}assets${sep}`)) {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  }

  res.writeHead(200, headers);
  if (method === 'HEAD') {
    res.end();
    return;
  }

  createReadStream(filePath).pipe(res);
};

const resolveStaticPath = (pathname) => {
  const decodedPath = decodeURIComponent(pathname);
  const normalizedPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(distDir, normalizedPath);

  if (!filePath.startsWith(`${distDir}${sep}`) && filePath !== distDir) {
    return null;
  }

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    return filePath;
  }

  return null;
};

const server = createServer((req, res) => {
  if (!req.url || !req.method) {
    res.writeHead(400).end('Bad request');
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const staticPath = resolveStaticPath(url.pathname);

  if (staticPath) {
    sendFile(res, staticPath, req.method);
    return;
  }

  const hasExtension = extname(url.pathname) !== '';
  const indexPath = join(distDir, 'index.html');

  if (!hasExtension && existsSync(indexPath)) {
    sendFile(res, indexPath, req.method);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
});

server.listen(port, host, () => {
  console.log(`SilverLink server listening on http://${host}:${port}`);
});
