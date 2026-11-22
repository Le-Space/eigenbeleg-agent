// SPDX-License-Identifier: AGPL-3.0-or-later
// --reference ASSET=EUR@YYYY-MM-DD: the person's own euro value per unit of an asset no price source
// quotes (Doichain's DOI), from a day on. It becomes the request's `reference` field, exactly as
// --job takes it; the pipeline checks it again (which assets the chain takes, at most twelve values).
// No option, no field: the pipeline then takes the block's default (DOI: 0.04 EUR), printed as such.

const FORM = /^([A-Za-z][A-Za-z0-9]{0,19})=(\d{1,9}(?:\.\d{1,12})?)@(\d{4}-\d{2}-\d{2})$/;
const EXAMPLE = '--reference DOI=0.05@2026-01-01';

/** A YYYY-MM-DD string that is a real day (2026-02-31 is not). @param {string} d */
function isDay(d) {
	const t = new Date(`${d}T00:00:00Z`);
	return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

/**
 * The `reference` field of a request from the --reference values: one value of an asset as
 * { eur, from }, several (repeated option) as a list in the order given.
 * @param {string[] | undefined} given
 * @returns {Record<string, { eur: string, from: string } | { eur: string, from: string }[]> | undefined}
 */
export function parseReference(given) {
	if (!given?.length) return undefined;
	/** @type {Record<string, { eur: string, from: string }[]>} */
	const byAsset = {};
	for (const raw of given) {
		const m = FORM.exec(String(raw).trim());
		if (!m) throw new Error(`--reference: "${String(raw).slice(0, 40)}" is not ASSET=EUR@YYYY-MM-DD, e.g. ${EXAMPLE} (EUR per unit, from that day on)`);
		const [, asset, eur, from] = m;
		if (!(Number(eur) > 0)) throw new Error(`--reference: the euro value of ${asset.toUpperCase()} must be above 0, e.g. ${EXAMPLE}`);
		if (!isDay(from)) throw new Error(`--reference: ${from} is no day of the calendar (YYYY-MM-DD)`);
		const lines = (byAsset[asset.toUpperCase()] ??= []);
		if (lines.some((l) => l.from === from)) throw new Error(`--reference: ${asset.toUpperCase()} has two values from ${from}; give one per day`);
		lines.push({ eur, from });
	}
	return Object.fromEntries(Object.entries(byAsset).map(([a, lines]) => [a, lines.length === 1 ? lines[0] : lines]));
}
