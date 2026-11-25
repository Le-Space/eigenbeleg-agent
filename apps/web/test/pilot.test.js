// SPDX-License-Identifier: AGPL-3.0-or-later
// The create button waits for the test-phase notice (#120, AGB section 9a): inactive until #pilot-ok
// is ticked, inactive again when it is unticked, and a submit that comes another way (Enter in a
// field, requestSubmit) still reads nothing. The page runs from Vite's dev server in Chromium;
// every request off the page's own origin is refused and counted. Needs `npx playwright install chromium` once.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TEXTS } from '../src/i18n.js';

test('the create button is inactive until the test phase is confirmed (#120)', async (t) => {
	let chromium;
	try {
		({ chromium } = await import('playwright'));
	} catch {
		t.skip('playwright is not installed (npm ci installs it; then npx playwright install chromium)');
		return;
	}
	const browser = await chromium.launch().catch((/** @type {Error} */ e) => {
		t.skip(`no Chromium for Playwright (npx playwright install chromium): ${e.message.split('\n')[0]}`);
		return null;
	});
	if (!browser) return;
	const { createServer } = await import('vite');
	const server = await createServer({ root: new URL('..', import.meta.url).pathname, logLevel: 'silent', server: { port: 0, host: '127.0.0.1' } });
	try {
		await server.listen();
		const origin = /** @type {string} */ (server.resolvedUrls?.local[0]).replace(/\/$/, '');
		const page = await browser.newPage();
		/** @type {string[]} */
		const outside = [];
		await page.route('**/*', (route) => {
			if (route.request().url().startsWith(origin)) return route.continue();
			outside.push(route.request().url());
			return route.abort();
		});
		/** @type {string[]} */
		const errors = [];
		page.on('pageerror', (e) => errors.push(String(e)));

		const button = page.locator('#btn-create');
		const box = page.locator('#pilot-ok');
		const reason = page.locator('#pilot-reason');
		const state = async () => ({ disabled: await button.isDisabled(), aria: await button.getAttribute('aria-disabled'), reason: await reason.isVisible() });

		await page.goto(`${origin}/?lang=de`);
		// The reason is linked to the button and to the box.
		assert.equal(await button.getAttribute('aria-describedby'), 'pilot-reason');
		assert.equal(await box.getAttribute('aria-describedby'), 'pilot-reason');

		// At first: inactive, with the reason in the page's language.
		assert.deepEqual(await state(), { disabled: true, aria: 'true', reason: true });
		assert.equal((await reason.textContent())?.trim(), TEXTS.de.pilotReason);

		// Ticked with the keyboard: active, the reason gone.
		await box.focus();
		await page.keyboard.press('Space');
		assert.equal(await box.isChecked(), true);
		assert.deepEqual(await state(), { disabled: false, aria: 'false', reason: false });

		// Unticked again: inactive again.
		await page.keyboard.press('Space');
		assert.equal(await box.isChecked(), false);
		assert.deepEqual(await state(), { disabled: true, aria: 'true', reason: true });

		// A filled form and Enter in a field: no run, nothing read from a chain.
		await page.fill('#addresses', 'wolkenfabrik.testnet');
		await page.fill('#postal', 'Musterstraße 1\n12345 Beispielstadt');
		await page.fill('#name', 'Wolkenfabrik Hosting GmbH');
		await page.locator('#name').press('Enter');
		await page.waitForTimeout(300);
		assert.equal((await page.locator('#form-error').textContent())?.trim(), '', 'Enter submits nothing while the button is inactive');
		// A submit that comes around the button meets the handler's own check.
		await page.evaluate(() => /** @type {HTMLFormElement} */ (document.getElementById('form')).requestSubmit());
		await page.waitForTimeout(300);
		assert.equal((await page.locator('#form-error').textContent())?.trim(), TEXTS.de.pilotNeeded);
		assert.equal((await button.textContent())?.trim(), TEXTS.de.btnCreate);
		assert.equal(await page.locator('#step-result').isHidden(), true);
		assert.deepEqual(outside, [], 'nothing was asked of a chain or a rate source');

		// In English the reason is English.
		await page.goto(`${origin}/?lang=en`);
		assert.deepEqual(await state(), { disabled: true, aria: 'true', reason: true });
		assert.equal((await reason.textContent())?.trim(), TEXTS.en.pilotReason);
		assert.deepEqual(errors, []);
	} finally {
		await browser.close();
		await server.close();
	}
});
