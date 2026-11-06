import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BLOCKS, checkBlock } from '../src/blocks.js';

test('parallel checks ask the data source once; unknown chains are no lookup', async () => {
	let calls = 0;
	const original = BLOCKS.filecoin.probe;
	BLOCKS.filecoin.probe = async () => (calls++, await new Promise((r) => setTimeout(r, 20)), { sample: 'x', entries: 1 });
	try {
		const results = await Promise.all(Array.from({ length: 10 }, () => checkBlock('filecoin')));
		assert.equal(calls, 1);
		assert.ok(results.every((r) => r.ok));
	} finally {
		BLOCKS.filecoin.probe = original;
	}
	assert.equal((await checkBlock('constructor')).ok, false);
});
