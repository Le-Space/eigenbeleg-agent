// SPDX-License-Identifier: AGPL-3.0-or-later
// Renders the share cards for /ui/ (1200×630 PNG, German and English) into
// apps/web/public/social/. Run from the repository root after `npm ci` (fonts)
// and `npm ci --prefix scripts/video` (Playwright): node scripts/video/social.mjs

import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const TEXTS = {
	de: {
		title: 'Eigenbelege für <em>Blockchain-Zahlungen.</em>',
		sub: 'Netzwerkgebühren, Storage-Deposits: als PDF/A und CSV, mit Euro-Kurs des Tages. Bezahlt per x402.',
		facts: ['0,10 USDC je Abruf', 'AGPL-3.0', 'nichts gespeichert'],
		doc: 'Eigenbeleg',
		fee: 'Netzwerkgebühr',
		storage: 'Storage-Deposit',
		badge: 'PDF/A · CSV'
	},
	en: {
		title: 'Self-issued receipts for <em>blockchain payments.</em>',
		sub: 'Network fees, storage deposits: as PDF/A and CSV, with the day’s euro rate. Paid with x402.',
		facts: ['0.10 USDC a request', 'AGPL-3.0', 'nothing stored'],
		doc: 'Eigenbeleg',
		fee: 'Network fee',
		storage: 'Storage deposit',
		badge: 'PDF/A · CSV'
	}
};

const out = new URL('../../apps/web/public/social/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
for (const [lang, t] of Object.entries(TEXTS)) {
	await page.goto(new URL('social.html', import.meta.url).href);
	await page.evaluate((t) => {
		const set = (/** @type {string} */ id, /** @type {string} */ text) => ((/** @type {HTMLElement} */ (document.getElementById(id))).textContent = text);
		// The title's <em> is our own markup from TEXTS above, not input.
		(/** @type {HTMLElement} */ (document.getElementById('title'))).innerHTML = t.title;
		for (const k of ['sub', 'doc', 'fee', 'storage', 'badge']) set(k, t[k]);
		const facts = /** @type {HTMLElement} */ (document.getElementById('facts'));
		for (const f of t.facts) facts.append(Object.assign(document.createElement('span'), { textContent: f }));
	}, t);
	await page.evaluate(() => document.fonts.ready);
	await page.screenshot({ path: new URL(`eigenbeleg-${lang}.png`, out).pathname });
	console.log(`apps/web/public/social/eigenbeleg-${lang}.png`);
}
await browser.close();
