// SPDX-License-Identifier: AGPL-3.0-or-later
// A static build: relative paths, so the same files run at /ui/ on the API
// host, on any static host and on an IPFS path gateway.
//
// The Content-Security-Policy is made here from the pipeline's data sources
// (@eigenbeleg/pipeline dataSources, and keyedSources: Alchemy, asked only
// with the person's own key, #25): the page may connect to exactly those
// hosts and nothing else. It goes into index.html as a <meta> (for static
// hosts) and into dist/csp.txt, which the API sends as a header (adding
// frame-ancestors, which a <meta> cannot carry).
//
// Settings (env at build time):
//   VITE_AKASH_INDEXER  the Akash CORS proxy (deploy/akash-proxy), e.g. https://….workers.dev
//   VITE_PUBLIC_URL     the public origin for the share cards when no API fills it in
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import { dataSources, keyedSources } from '@eigenbeleg/pipeline';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), 'VITE_');
	const connect = ["'self'", ...dataSources({ akashIndexer: env.VITE_AKASH_INDEXER || null }).map((s) => s.origin), ...keyedSources().map((s) => s.origin)];
	const csp = [
		"default-src 'self'",
		"script-src 'self'",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob:",
		"font-src 'self'",
		`connect-src ${connect.join(' ')}`,
		"worker-src 'self'",
		"manifest-src 'self'",
		"object-src 'none'",
		"base-uri 'none'",
		"form-action 'none'"
	].join('; ');
	let outDir = '';
	return {
		base: './',
		build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 2000, assetsInlineLimit: 0 },
		plugins: [
			{
				name: 'eigenbeleg-csp',
				configResolved(c) {
					outDir = c.build.outDir.startsWith('/') ? c.build.outDir : join(c.root, c.build.outDir);
				},
				transformIndexHtml(html) {
					const out = html.replace('__CSP__', csp);
					return env.VITE_PUBLIC_URL ? out.replaceAll('__PUBLIC_URL__', env.VITE_PUBLIC_URL.replace(/\/+$/, '')) : out;
				},
				async writeBundle() {
					await writeFile(join(outDir, 'csp.txt'), csp + '\n');
					// The service worker's precache list: every file the app needs offline (the share cards are for
					// crawlers, csp.txt for the API), as ./paths relative to the worker; the cache's name is a hash
					// of the files' contents, so every new build installs afresh.
					const files = (await readdir(outDir, { recursive: true, withFileTypes: true }))
						.filter((d) => d.isFile())
						.map((d) => join(d.parentPath, d.name).slice(outDir.length + 1).split('\\').join('/'))
						.filter((f) => f !== 'sw.js' && f !== 'csp.txt' && !f.startsWith('social/') && !f.endsWith('.woff'))
						.sort();
					const hash = createHash('sha256');
					for (const f of files) hash.update(f).update(await readFile(join(outDir, f)));
					const list = ['./', ...files.filter((f) => f !== 'index.html').map((f) => `./${f}`)];
					const sw = join(outDir, 'sw.js');
					const src = await readFile(sw, 'utf8');
					const out = src
						.replace('const PRECACHE = /** @type {string[]} */ ([]);', `const PRECACHE = ${JSON.stringify(list)};`)
						.replace("const CACHE = 'eigenbeleg-dev';", `const CACHE = 'eigenbeleg-${hash.digest('hex').slice(0, 12)}';`);
					if (out === src) throw new Error('sw.js: the precache placeholders are gone');
					await writeFile(sw, out);
				}
			}
		]
	};
});
