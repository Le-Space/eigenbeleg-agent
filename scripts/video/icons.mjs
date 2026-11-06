// SPDX-License-Identifier: AGPL-3.0-or-later
// Renders the PWA icons (apps/web/public/icons) from the signet: 192 and 512
// on ink, as Belege's favicon, and a maskable 512 with the signet inside the
// safe zone. Run from the repository root: node scripts/video/icons.mjs
import { chromium } from 'playwright';

const signet = (/** @type {string} */ fg) =>
	`<circle cx="36" cy="38" r="27" fill="none" stroke="${fg}" stroke-width="17"/><path fill="${fg}" fill-rule="evenodd" d="M43 47h50a9 9 0 0 1 9 9v37a9 9 0 0 1-9 9H43a9 9 0 0 1-9-9V56a9 9 0 0 1 9-9zM58 60h20a6 6 0 0 1 6 6v17a6 6 0 0 1-6 6H58a6 6 0 0 1-6-6V66a6 6 0 0 1 6-6z"/>`;
const icon = (/** @type {number} */ scale, /** @type {number} */ rx) =>
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" rx="${rx}" fill="#0F1B2D"/><g transform="translate(${(100 - 100 * scale) / 2} ${(100 - 100 * scale) / 2}) scale(${scale})">${signet('#F4F6FB')}</g></svg>`;

const out = new URL('../../apps/web/public/icons/', import.meta.url).pathname;
const browser = await chromium.launch();
for (const [name, size, svg] of /** @type {[string, number, string][]} */ ([
	['icon-192.png', 192, icon(0.68, 22)],
	['icon-512.png', 512, icon(0.68, 22)],
	['maskable-512.png', 512, icon(0.56, 0)]
])) {
	const page = await browser.newPage({ viewport: { width: size, height: size } });
	await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
	await page.screenshot({ path: out + name, omitBackground: true });
	await page.close();
	console.log(`apps/web/public/icons/${name}`);
}
await browser.close();
