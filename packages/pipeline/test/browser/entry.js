// SPDX-License-Identifier: AGPL-3.0-or-later
// The browser side of browser.test.js: the same fixture run as in Node, bundled
// by Vite with the "browser" condition (fonts fetched, no node: modules).
import raw from '../fixtures/relay-aurora-2026-11-01.json';
import { fixtureRun } from '../fixture-run.js';

const w = /** @type {any} */ (window);
fixtureRun(raw).then(
	(r) => (w.result = r),
	(e) => (w.result = { error: String(e?.stack ?? e) })
);
