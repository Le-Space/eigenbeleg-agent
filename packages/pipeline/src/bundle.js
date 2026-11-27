// SPDX-License-Identifier: AGPL-3.0-or-later
// Every file of one answer in one ZIP, to pass on, to a tax adviser say. The first
// entry is a notice, HINWEIS.txt (German documents) or NOTICE.txt (English): the
// test phase's notice, what the documents cover – the chain, the period and how
// many addresses, never an address, an amount or a name –, when and by which build
// they were made, and where the terms are. The same code for the page and the API.
//
// The documents themselves carry no such mark: a "test phase" on an Eigenbeleg or
// a statement could weaken its acceptance. The notice travels beside them.
import { strToU8, zipSync } from 'fflate';

/** Where discrepancies are reported. */
export const CONTACT = 'eigenbeleg@le-space.de';

/** The test phase's notice, in the documents' language. `en` is the API's PILOT_NOTICE. */
export const PILOT_NOTICES = {
	de: `Testphase (Pilot): Die Dokumente können Fehler enthalten. Prüfen Sie jedes Dokument (Beträge, Daten, Transaktions-Hashes, Kurse), bevor Sie es verwenden, und melden Sie Unstimmigkeiten mit dem Transaktions-Hash an ${CONTACT}.`,
	en: `Test phase (pilot): the documents may contain errors. Check every document (amounts, dates, transaction hashes, rates) before using it and report any discrepancy, with the transaction hash, to ${CONTACT}.`
};

const WORDS = {
	de: {
		name: 'HINWEIS.txt',
		heading: 'HINWEIS ZU DIESEN DOKUMENTEN',
		chain: 'Chain',
		period: 'Zeitraum',
		bis: 'bis',
		addresses: 'Adressen',
		created: 'Erstellt am',
		build: 'Version',
		files: 'Dateien',
		terms: 'Bedingungen (AGB, Ziffern 3, 9 und 9a)',
		contact: 'Fehler und Fragen',
		unknown: 'unbekannt'
	},
	en: {
		name: 'NOTICE.txt',
		heading: 'NOTICE ON THESE DOCUMENTS',
		chain: 'Chain',
		period: 'Period',
		bis: 'to',
		addresses: 'Addresses',
		created: 'Created',
		build: 'Version',
		files: 'Files',
		terms: 'Terms (sections 3, 9 and 9a)',
		contact: 'Errors and questions',
		unknown: 'unknown'
	}
};

/** @typedef {{ version?: string, commit?: string }} BundleBuild what made the files; '' where not known */
/** @typedef {{ name: string, data: Uint8Array }} BundleFile */

/** A file name that is safe everywhere. @param {string} n */
const safe = (n) => String(n).replace(/[^A-Za-z0-9._-]/g, '_');

/**
 * The documents of one answer as files, named as the page and the mail name them.
 *
 * @param {Awaited<ReturnType<typeof import('./generate.js').generate>>} out
 * @param {{ document: 'eigenbelege' | 'kontoauszug' | 'beide', prefix?: string }} o what was asked for; `prefix` before every name (TEST- on testnet)
 * @returns {BundleFile[]}
 */
export function bundleFiles(out, { document, prefix = '' }) {
	const s = out.summary;
	const first = safe(s.eigenbelege[0] ?? s.number);
	/** @type {BundleFile[]} */
	const files = [];
	if (out.pdf && document !== 'kontoauszug' && s.positions > 0) files.push({ name: `${prefix}${first}.pdf`, data: out.pdf });
	for (const k of out.statements) files.push({ name: `${prefix}${safe(k.number)}.pdf`, data: k.pdf });
	if (out.csv) files.push({ name: `${prefix}${document === 'kontoauszug' ? safe(out.statements[0]?.number ?? first) : first}.csv`, data: strToU8(out.csv) });
	return files;
}

/**
 * The notice: its name and its text, CRLF lines, for Windows' editor too.
 *
 * @param {object} p
 * @param {'de' | 'en'} [p.language] the documents' language
 * @param {string} p.chain
 * @param {string} p.network
 * @param {{ from: string, to: string }} p.period
 * @param {number} p.addresses how many; the addresses themselves stay out
 * @param {Date} p.created
 * @param {BundleBuild} [p.build]
 * @param {string} p.terms the terms' URL
 * @param {string[]} [p.files] the other entries' names
 * @returns {{ name: string, text: string }}
 */
export function noticeFile({ language = 'de', chain, network, period, addresses, created, build = {}, terms, files = [] }) {
	const lang = language === 'en' ? 'en' : 'de';
	const w = WORDS[lang];
	const version = [build.version, build.commit ? `commit ${build.commit.slice(0, 12)}` : ''].filter(Boolean).join(', ') || w.unknown;
	const lines = [
		w.heading,
		'',
		PILOT_NOTICES[lang],
		'',
		`${w.chain}: ${chain} (${network})`,
		`${w.period}: ${period.from === period.to ? period.from : `${period.from} ${w.bis} ${period.to}`}`,
		`${w.addresses}: ${addresses}`,
		`${w.created}: ${created.toISOString()}`,
		`${w.build}: ${version}`,
		...(files.length ? [`${w.files}: ${files.join(', ')}`] : []),
		'',
		`${w.terms}: ${terms}`,
		`${w.contact}: ${CONTACT}`,
		''
	];
	return { name: w.name, text: lines.join('\r\n') };
}

/**
 * Every file of the answer in one ZIP, the notice first.
 *
 * @param {Awaited<ReturnType<typeof import('./generate.js').generate>>} out
 * @param {object} o
 * @param {'eigenbelege' | 'kontoauszug' | 'beide'} o.document
 * @param {number} o.addresses
 * @param {string} o.terms
 * @param {BundleBuild} [o.build]
 * @param {Date} [o.created]
 * @param {string} [o.prefix]
 * @returns {{ name: string, zip: Uint8Array }}
 */
export function bundleZip(out, { document, addresses, terms, build, created = new Date(), prefix = '' }) {
	const s = out.summary;
	const files = bundleFiles(out, { document, prefix });
	const notice = noticeFile({
		language: s.documentLanguage,
		chain: s.chain,
		network: s.network,
		period: s.period,
		addresses,
		created,
		build,
		terms,
		files: files.map((f) => f.name)
	});
	// The BOM: an editor that guesses the encoding reads the umlauts right.
	/** @type {Record<string, [Uint8Array, { mtime: Date }]>} */
	const entries = { [notice.name]: [strToU8(`﻿${notice.text}`), { mtime: created }] };
	for (const f of files) entries[f.name] = [f.data, { mtime: created }];
	const base = files[0]?.name.replace(/\.[a-z]+$/, '') ?? `${prefix}${safe(s.number)}`;
	return { name: `${base}.zip`, zip: zipSync(entries, { level: 6 }) };
}
