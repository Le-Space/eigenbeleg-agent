// SPDX-License-Identifier: AGPL-3.0-or-later
// The pipeline in Chromium gives the same files as in Node: same summary, and
// byte for byte the same Eigenbelege PDF, Kontoauszug PDF and CSV. Vite bundles
// test/browser/entry.js for the browser (fonts by fetch, no node: modules);
// Playwright runs it. Needs `npx playwright install chromium` once.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';

import { fixtureRun } from './fixture-run.js';

const raw = JSON.parse(await readFile(new URL('../../chain-near/test/fixtures/relay-aurora-2026-11-01.json', import.meta.url), 'utf8'));

/** @param {string} dir */
function serve(dir) {
	const types = { '.html': 'text/html', '.js': 'text/javascript', '.ttf': 'font/ttf', '.icc': 'application/vnd.iccprofile' };
	const server = createServer(async (req, res) => {
		const path = normalize(join(dir, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)));
		if (!path.startsWith(dir)) return void res.writeHead(403).end();
		try {
			const body = await readFile(path.endsWith('/') ? join(path, 'index.html') : path);
			res.writeHead(200, { 'content-type': /** @type {any} */ (types)[extname(path)] ?? 'application/octet-stream' }).end(body);
		} catch {
			res.writeHead(404).end();
		}
	});
	return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${/** @type {any} */ (server.address()).port}/`, close: () => server.close() })));
}

test('the same run in Chromium and in Node gives the same files', async (t) => {
	let chromium;
	try {
		({ chromium } = await import('playwright'));
	} catch {
		t.skip('playwright is not installed (npm ci installs it; then npx playwright install chromium)');
		return;
	}
	const node = await fixtureRun(raw);
	assert.ok(node.pdf && node.csv && node.statements.length === 1, 'the Node run made every file');

	const { build } = await import('vite');
	const out = await mkdtemp(join(tmpdir(), 'eb-pipeline-browser-'));
	const browser = await chromium.launch().catch((/** @type {Error} */ e) => {
		t.skip(`no Chromium for Playwright (npx playwright install chromium): ${e.message.split('\n')[0]}`);
		return null;
	});
	if (!browser) return;
	/** @type {any} */
	let site;
	try {
		await build({
			root: new URL('./browser/', import.meta.url).pathname,
			base: './',
			logLevel: 'silent',
			build: { outDir: out, emptyOutDir: true, assetsInlineLimit: 0 }
		});
		site = await serve(out);
		const page = await browser.newPage();
		/** @type {string[]} */
		const nodeOnly = [];
		page.on('pageerror', (e) => nodeOnly.push(String(e)));
		await page.goto(site.url + 'index.html');
		await page.waitForFunction(() => /** @type {any} */ (window).result, null, { timeout: 60_000 });
		const inBrowser = await page.evaluate(() => /** @type {any} */ (window).result);
		assert.equal(inBrowser.error, undefined, inBrowser.error);
		assert.deepEqual(nodeOnly, []);
		assert.deepEqual(inBrowser, node);
	} finally {
		await browser.close();
		site?.close();
		await rm(out, { recursive: true, force: true });
	}
});
