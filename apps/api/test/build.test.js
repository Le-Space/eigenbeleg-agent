// Which build answers (build.js): the API names its version and commit, as the page's footer does.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/app.js';
import { apiBuild, buildFields, checkedBuild } from '../src/build.js';

const deps = { fetch: async () => new Response('{}', { status: 404 }) };
const COMMIT = 'ab'.repeat(20);

/** @param {import('express').Express} app */
async function serve(app) {
	const server = app.listen(0, '127.0.0.1');
	await new Promise((r) => server.once('listening', r));
	const { port } = /** @type {any} */ (server.address());
	return { base: `http://127.0.0.1:${port}`, close: () => server.close() };
}

test('the build: the manifest\'s version, the commit handed in with its instant; nothing guessed', () => {
	const b = apiBuild({ SOURCE_COMMIT: COMMIT.toUpperCase(), SOURCE_COMMIT_DATE: '2026-11-21T08:00:00+01:00' });
	assert.match(b.version, /^\d+\.\d+\.\d+/);
	assert.deepEqual([b.commit, b.date], [COMMIT, '2026-11-21T07:00:00.000Z'], 'lower case, the instant in UTC');
	// What is not a commit or not an instant is left out, whatever was handed in.
	assert.deepEqual(checkedBuild({ version: 'latest', commit: 'main"><script>', date: 'yesterday' }), { version: '', commit: '', date: '' });
	assert.deepEqual(checkedBuild({ version: '1.2.3', commit: COMMIT, date: 'never' }), { version: '1.2.3', commit: '', date: '' });
	assert.deepEqual(buildFields({ version: '', commit: '', date: '' }), {});
});

test('GET /, /health, /openapi.json and /llms.txt name the same build', async () => {
	const build = { version: '1.2.3', commit: COMMIT, date: '2026-11-21T07:00:00.000Z' };
	const { base, close } = await serve(createApp({ paywall: { middleware: null, info: { mode: 'none' } }, deps, log: () => {}, web: null, build }));
	try {
		const named = { version: '1.2.3', commit: COMMIT, built: '2026-11-21T07:00:00.000Z' };
		const root = await (await fetch(base + '/')).json();
		assert.deepEqual({ version: root.version, commit: root.commit, built: root.built }, named);
		assert.deepEqual(await (await fetch(base + '/health')).json(), { ok: true, paywall: 'none', ...named });
		const doc = await (await fetch(base + '/openapi.json')).json();
		assert.deepEqual([doc.info.version, doc.info['x-commit'], doc.info['x-built']], ['1.2.3', COMMIT, named.built]);
		assert.match(await (await fetch(base + '/llms.txt')).text(), /This instance: version 1\.2\.3, commit abababababab of 2026-11-21\./);
	} finally {
		close();
	}
	// A build that knows no commit says only its version; one that knows nothing says nothing.
	const bare = await serve(createApp({ paywall: { middleware: null, info: { mode: 'none' } }, deps, log: () => {}, web: null, build: { version: '', commit: '', date: '' } }));
	try {
		assert.deepEqual(await (await fetch(bare.base + '/health')).json(), { ok: true, paywall: 'none' });
		assert.doesNotMatch(await (await fetch(bare.base + '/llms.txt')).text(), /This instance/);
		assert.equal((await (await fetch(bare.base + '/openapi.json')).json()).info.version, '0.0.0');
	} finally {
		bare.close();
	}
});
