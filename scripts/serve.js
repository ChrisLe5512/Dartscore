// Tiny static server for local development: `npm run dev`, then open the URL.
// (ES modules don't load from file://, so double-clicking index.html won't work.)

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT) || 8080;

const types = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.woff2': 'font/woff2',
};

createServer(async (req, res) => {
	try {
		let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
		let file = join(root, path);
		if (!file.startsWith(root)) throw new Error('outside root');
		if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
		const body = await readFile(file);
		res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
		res.end(body);
	} catch {
		res.writeHead(404, { 'Content-Type': 'text/plain' });
		res.end('Not found');
	}
}).listen(port, () => {
	console.log(`Dartscore running at http://localhost:${port}`);
});
