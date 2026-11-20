// SPDX-License-Identifier: AGPL-3.0-or-later
// What a search engine and a share card read (build time, apps/web/vite.config.js).
//
// The page is one document in two languages; a crawler needs an address for
// each, and each address needs the text in its markup, not only after the
// script ran:
//
//   /ui/           the page as it adapts to the reader (the saved choice, else
//                  the browser's language): German in the markup. hreflang x-default.
//   /ui/?lang=de   German, whatever the browser says
//   /ui/?lang=en   English: dist/index.en.html, made here from index.html with
//                  every [data-i18n] text and the [data-lang] blocks switched
//
// A static host without the API serves index.html for all three; the script
// then follows `lang` in the address, so the reader sees the same.
//
// __PUBLIC_URL__ stays in for the API (or VITE_PUBLIC_URL) to fill: crawlers
// need absolute URLs.

import { TEXTS } from './src/i18n.js';

/** @typedef {'de' | 'en'} Lang */

/** @param {unknown} s for text and for a double-quoted attribute */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The address of a variant, from the public origin. @param {Lang | null} lang null: the adapting page */
export const pageUrl = (lang) => `__PUBLIC_URL__/ui/${lang ? `?lang=${lang}` : ''}`;

/**
 * schema.org: a free web application by Le Space. A data block, never run
 * (the page's script-src stays 'self').
 *
 * @param {Lang} lang @param {string} url
 */
export function jsonLd(lang, url) {
	const data = {
		'@context': 'https://schema.org',
		'@type': 'WebApplication',
		name: 'Le Space Eigenbeleg',
		url,
		description: TEXTS[lang].metaDescription,
		inLanguage: lang,
		applicationCategory: 'FinanceApplication',
		operatingSystem: 'Any',
		browserRequirements: 'A current browser with JavaScript',
		isAccessibleForFree: true,
		offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
		license: 'https://www.gnu.org/licenses/agpl-3.0.html',
		sameAs: 'https://github.com/Le-Space/eigenbeleg-agent',
		publisher: { '@type': 'Organization', name: 'Le Space UG (haftungsbeschränkt)', url: 'https://le-space.de' }
	};
	// "<" never ends the block early.
	return JSON.stringify(data).replace(/</g, '\\u003c');
}

/**
 * The head's lines for one variant: title, description, canonical, the
 * alternates, the share cards, the structured data.
 *
 * @param {Lang} lang the language of the markup
 * @param {Lang | null} [variant] which address this is; null: the adapting page
 */
export function seoHead(lang, variant = null) {
	const t = TEXTS[lang];
	const url = pageUrl(variant);
	const image = `__PUBLIC_URL__/ui/social/eigenbeleg-${lang}.png`;
	return [
		`<title>${esc(t.metaTitle)}</title>`,
		`<meta name="description" content="${esc(t.metaDescription)}" />`,
		`<link rel="canonical" href="${url}" />`,
		`<link rel="alternate" hreflang="de" href="${pageUrl('de')}" />`,
		`<link rel="alternate" hreflang="en" href="${pageUrl('en')}" />`,
		`<link rel="alternate" hreflang="x-default" href="${pageUrl(null)}" />`,
		// Share cards (Open Graph: Telegram, LinkedIn, WhatsApp, Mastodon; X reads twitter:*). Cards: scripts/video/social.mjs.
		'<meta property="og:type" content="website" />',
		'<meta property="og:site_name" content="Le Space Belege" />',
		`<meta property="og:locale" content="${lang === 'de' ? 'de_DE' : 'en_GB'}" />`,
		`<meta property="og:locale:alternate" content="${lang === 'de' ? 'en_GB' : 'de_DE'}" />`,
		`<meta property="og:title" content="${esc(t.title)}" />`,
		`<meta property="og:description" content="${esc(t.cardDescription)}" />`,
		`<meta property="og:url" content="${url}" />`,
		`<meta property="og:image" content="${image}" />`,
		'<meta property="og:image:width" content="1200" />',
		'<meta property="og:image:height" content="630" />',
		`<meta property="og:image:alt" content="${esc(t.cardAlt)}" />`,
		'<meta name="twitter:card" content="summary_large_image" />',
		`<meta name="twitter:title" content="${esc(t.title)}" />`,
		`<meta name="twitter:description" content="${esc(t.cardDescription)}" />`,
		`<meta name="twitter:image" content="${image}" />`,
		`<script type="application/ld+json">${jsonLd(lang, url)}</script>`
	].join('\n\t\t');
}

/** The place in index.html the head's lines go. */
export const SEO_SLOT = '<!-- __SEO_HEAD__ -->';

/**
 * The English page from the built German one: the head, every [data-i18n]
 * text, and the [data-lang] blocks the other way round.
 *
 * @param {string} html the built index.html, its head made by seoHead('de')
 * @param {(s: string) => string} [fill] what the build did to the head after it was made (the public origin put in)
 */
export function englishPage(html, fill = (s) => s) {
	const head = fill(seoHead('de'));
	if (!html.includes(head)) throw new Error('index.html: the German head is not where it was put');
	let out = html.replace(head, () => fill(seoHead('en', 'en'))).replace('<html lang="de">', '<html lang="en">');
	out = out.replace(/(data-i18n="(\w+)"[^>]*>)[^<]*</g, (all, open, key) => (key in TEXTS.en ? `${open}${esc(/** @type {any} */ (TEXTS.en)[key])}<` : all));
	out = out.replace(/(<[a-z]+\b[^>]*\bdata-lang="de")(?![^>]*\bhidden)/g, '$1 hidden').replace(/(<[a-z]+\b[^>]*\bdata-lang="en"[^>]*?) hidden/g, '$1');
	if (!out.includes('<html lang="en">')) throw new Error('index.html: no <html lang="de"> to switch');
	return out;
}

/**
 * The German page under its own address: the same markup, its own canonical.
 *
 * @param {string} html @param {(s: string) => string} [fill]
 */
export function germanPage(html, fill = (s) => s) {
	const head = fill(seoHead('de'));
	if (!html.includes(head)) throw new Error('index.html: the German head is not where it was put');
	return html.replace(head, () => fill(seoHead('de', 'de')));
}
