// SPDX-License-Identifier: AGPL-3.0-or-later
// The build stamp in the footer, in the reader's own terms (the Le-Space time
// and date convention, as in Belege's app/src/lib/moment.js): their locale's
// format, their clock and the zone named, because around midnight a time
// without its zone names the wrong day for half the readers; the same instant
// in UTC for hovering and for machines.

export const SOURCE_URL = 'https://github.com/Le-Space/eigenbeleg-agent';

const STAMP_FORMAT = /** @type {const} */ ({ year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });

/**
 * @param {Date} date
 * @param {string | string[]} [locale] the reader's, when left out
 * @param {string} [timeZone] the reader's, when left out
 * @returns {string} e.g. `13.11.2026, 10:15 MEZ` or `11/13/2026, 04:15 AM EST`
 */
export function localStamp(date, locale, timeZone) {
	return new Intl.DateTimeFormat(locale, { ...STAMP_FORMAT, timeZone }).format(date);
}

/** @param {Date} date @returns {string} e.g. `2026-11-13 09:15 UTC` */
export function utcStamp(date) {
	return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/**
 * What the build wrote into the footer's data attributes, checked; null without a commit
 * (a dev server outside git, or placeholders nobody filled).
 *
 * @param {{ release?: string, commit?: string, date?: string }} data
 * @returns {{ release: string, commit: string, short: string, when: Date } | null}
 */
export function parseBuild({ release = '', commit = '', date = '' }) {
	const sha = commit.trim().toLowerCase();
	const when = new Date(date);
	if (!/^[0-9a-f]{7,40}$/.test(sha) || Number.isNaN(when.getTime())) return null;
	return { release: /^v\d+\.\d+\.\d+/.test(release) ? release : '', commit: sha, short: sha.slice(0, 7), when };
}
