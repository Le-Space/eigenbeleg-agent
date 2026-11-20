// SPDX-License-Identifier: AGPL-3.0-or-later
// The subscription (issue #20): paid once with x402, twelve monthly
// Kontoauszüge (Aleph: Verbrauchsauszüge) by mail, each early in the month
// for the month before.
//
// This is the one thing the API keeps beyond a request: chain, network,
// addresses, the payer's name and address, the e-mail address, the options
// and how many months are left. Each subscription is one file in SUBSCRIPTION_DIR,
// encrypted with a key from the environment (SUBSCRIPTION_KEY, AES-256-GCM),
// so a copy of the volume alone shows nothing. The cancel token is inside
// that file. No accounts, no login. After the last mail, or on the cancel
// link, the file is deleted. Log lines carry the subscription's id only.
//
// The scheduler runs in the API process once an hour: a subscription is due
// from the 2nd of the month after its next month (archival balances exist
// then, and Aleph has the whole month). A failed run is retried hourly; after
// three days the subscriber gets a mail about it, once, and the retries go on.

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { RequestError, generate, isUsageStatement, parseRequest } from '@eigenbeleg/pipeline';
import { composeMail } from './mail.js';

/** How many months a subscription buys by default, and at most: a year. */
export const MONTHS = 12;
/** The months a subscription may buy: 1 to MONTHS, each its own route, so the paywall has one price per route. */
export const MONTH_CHOICES = Array.from({ length: MONTHS }, (_, i) => i + 1);
/** The day of the month from which the previous month's statement is made. */
export const FROM_DAY = 2;
/** After this long of failed runs, the subscriber is told once. */
export const REPORT_AFTER_MS = 3 * 24 * 3600_000;
export const ROUTE = 'POST /eigenbeleg/subscribe';
/** The route that buys `months` months at months × the price (the plain ROUTE buys MONTHS). @param {number} months */
export const routeFor = (months) => `${ROUTE}/${months}`;

/**
 * @typedef {object} Subscription
 * @property {string} id 16 hex characters, in the cancel link and the log
 * @property {string} createdAt ISO
 * @property {string} origin this API's public origin at creation, for the cancel link in each mail
 * @property {string} token the cancel token (the file is encrypted; see above)
 * @property {{ chain: string, network: string, addresses: string[], payer: { name: string, address: string }, email: string, includeKinds: string[], logo: boolean, document: 'eigenbelege' | 'kontoauszug' | 'beide' }} job
 *   the request body of each month, without the period
 * @property {number} monthsLeft
 * @property {string} nextMonth YYYY-MM, the next month to deliver (the month after it, from FROM_DAY)
 * @property {string | null} failingSince ISO of the first failed run since the last success
 * @property {boolean} reported whether the subscriber was told about the failing runs
 */

/** @typedef {{ list: () => Promise<Subscription[]>, get: (id: string) => Promise<Subscription | null>, put: (s: Subscription) => Promise<void>, remove: (id: string) => Promise<void> }} Store */

const ID = /^[0-9a-f]{16}$/;

/**
 * The store: one encrypted file per subscription in `dir`.
 *
 * @param {{ dir: string, key: string }} o key: SUBSCRIPTION_KEY, any string of 16 characters or more; its SHA-256 is the AES key
 * @returns {Store}
 */
export function createStore({ dir, key }) {
	if (typeof key !== 'string' || key.length < 16) throw new Error('SUBSCRIPTION_KEY: at least 16 characters');
	const aes = createHash('sha256').update(key).digest();
	const file = (/** @type {string} */ id) => join(dir, `${id}.json`);
	/** @param {Subscription} s */
	const seal = (s) => {
		const iv = randomBytes(12);
		const cipher = createCipheriv('aes-256-gcm', aes, iv);
		const data = Buffer.concat([cipher.update(JSON.stringify(s), 'utf8'), cipher.final()]);
		return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
	};
	/** @param {string} text @returns {Subscription} */
	const open = (text) => {
		const { iv, tag, data } = JSON.parse(text);
		const decipher = createDecipheriv('aes-256-gcm', aes, Buffer.from(iv, 'base64'));
		decipher.setAuthTag(Buffer.from(tag, 'base64'));
		return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8'));
	};
	return {
		async list() {
			const names = await readdir(dir).catch(() => []);
			/** @type {Subscription[]} */
			const out = [];
			for (const n of names.filter((n) => /^[0-9a-f]{16}\.json$/.test(n)).sort()) {
				try {
					out.push(open(await readFile(join(dir, n), 'utf8')));
				} catch {
					// a file this key cannot open, or a torn write: left alone
				}
			}
			return out;
		},
		async get(id) {
			if (!ID.test(id)) return null;
			try {
				return open(await readFile(file(id), 'utf8'));
			} catch {
				return null;
			}
		},
		async put(s) {
			await mkdir(dir, { recursive: true });
			// Written next to the file and renamed into place, so a reader never sees half a file.
			const tmp = `${file(s.id)}.${randomBytes(4).toString('hex')}.tmp`;
			await writeFile(tmp, seal(s), { mode: 0o600 });
			await rename(tmp, file(s.id));
		},
		async remove(id) {
			if (ID.test(id)) await rm(file(id), { force: true });
		}
	};
}

/** @param {Date} d */
const ymd = (d) => d.toISOString().slice(0, 10);
/** @param {Date} d */
const ym = (d) => d.toISOString().slice(0, 7);
/** The month after YYYY-MM. @param {string} month */
export function nextMonthOf(month) {
	const [y, m] = month.split('-').map(Number);
	return ym(new Date(Date.UTC(y, m, 1)));
}
/** The first day a statement for `month` is made: FROM_DAY of the month after. @param {string} month */
export function dueDate(month) {
	const [y, m] = month.split('-').map(Number);
	return ymd(new Date(Date.UTC(y, m, FROM_DAY)));
}
/** @param {Subscription} s @param {Date} now */
export const isDue = (s, now) => ymd(now) >= dueDate(s.nextMonth);

/**
 * Checks a subscription request: the body of POST /eigenbeleg plus `email`,
 * without `period` (`months`, if given, must be the route's). The same checks
 * as the paid route, with the current month as the period, so chain, addresses
 * and payer are refused here before a price is named.
 *
 * @param {any} body
 * @param {{ today: string, blocks: Record<string, any>, months?: number }} o months: the route's, default MONTHS
 * @returns {Subscription['job']}
 */
export function subscriptionJob(body, { today, blocks, months = MONTHS }) {
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestError('body must be a JSON object');
	if (body.period !== undefined) throw new RequestError('period: a subscription has none; each month is made for the month before');
	if (body.months !== undefined && body.months !== months) throw new RequestError(`months: this route sells ${months}; POST /eigenbeleg/subscribe/<months> sells 1 to ${MONTHS}`);
	if (body.format !== undefined && body.format !== 'json') throw new RequestError('format: a subscription has none; the files go by mail');
	const probe = parseRequest({ ...body, period: { month: today.slice(0, 7) }, format: 'json', document: body.document ?? 'kontoauszug' }, { today, blocks });
	if (!probe.email) throw new RequestError('email: needed for a subscription; the statements go by mail, like belege@example.org');
	return { chain: probe.chain, network: probe.network, addresses: probe.addresses, payer: { name: probe.payer.name, address: probe.payer.address }, email: probe.email, includeKinds: probe.includeKinds, logo: probe.logo, document: probe.document, language: probe.language };
}

/**
 * A new subscription, not yet stored: the first month is the current one,
 * delivered from FROM_DAY of the next.
 *
 * @param {Subscription['job']} job
 * @param {{ now: Date, origin: string, months?: number }} o months bought, default MONTHS
 * @returns {Subscription}
 */
export function newSubscription(job, { now, origin, months = MONTHS }) {
	return { id: randomBytes(8).toString('hex'), createdAt: now.toISOString(), origin, token: randomBytes(24).toString('hex'), job, monthsLeft: months, nextMonth: ym(now), failingSince: null, reported: false };
}

/** The cancel link that goes into every mail. @param {Subscription} s */
export const cancelUrl = (s) => `${s.origin}/eigenbeleg/subscribe/${s.id}/cancel?token=${s.token}`;

/** @param {Subscription} s @param {string} token */
export function tokenMatches(s, token) {
	const a = Buffer.from(s.token);
	const b = Buffer.from(String(token ?? ''));
	return a.length === b.length && timingSafeEqual(a, b);
}

/** The lines a subscription's notice ends with, in the subscription's language (en unless it says de). @param {Subscription} s */
function footer(s) {
	return [
		'',
		s.job.language === 'de'
			? `Abo ${s.id}: noch ${s.monthsLeft} Monat(e) nach diesem. Beenden (löscht alle Angaben, keine Erstattung der Restmonate): ${cancelUrl(s)}`
			: `Subscription ${s.id}: ${s.monthsLeft} month(s) left after this one. Cancel (deletes every detail, no refund of the remaining months): ${cancelUrl(s)}`
	];
}

/**
 * One pass over the store: every due subscription gets its month made and
 * mailed. Called hourly by the scheduler, and once on start.
 *
 * @param {object} o
 * @param {Store} o.store
 * @param {Parameters<typeof generate>[1]} o.deps with `blocks`
 * @param {import('./mail.js').Mailer} o.mailer
 * @param {(line: string) => void} [o.log]
 * @param {() => Date} [o.now] the clock; default deps.now, else the real one
 * @param {string} [o.source] where the source of this running version is, for the mail's footer
 * @returns {Promise<{ made: string[], failed: string[] }>} ids
 */
export async function runDue({ store, deps, mailer, log = () => {}, now, source }) {
	const clock = now ?? deps?.now ?? (() => new Date());
	/** @type {{ made: string[], failed: string[] }} */
	const result = { made: [], failed: [] };
	for (const s of await store.list()) {
		const at = clock();
		if (!isDue(s, at)) continue;
		try {
			const req = parseRequest({ ...s.job, period: { month: s.nextMonth }, format: 'json' }, { today: ymd(at), blocks: deps?.blocks });
			const out = await generate(req, deps);
			// The statement's mail says what this is, and how to end it.
			const next = { ...s, monthsLeft: s.monthsLeft - 1, nextMonth: nextMonthOf(s.nextMonth), failingSince: null, reported: false };
			const mail = composeMail(req, out, { origin: s.origin, source, subscription: { id: s.id, monthsLeft: next.monthsLeft, cancel: cancelUrl(next) } });
			await mailer.send(mail);
			if (next.monthsLeft <= 0) await store.remove(s.id);
			else await store.put(next);
			result.made.push(s.id);
			log(`${at.toISOString()} subscription ${s.id}: ${s.nextMonth} sent${next.monthsLeft <= 0 ? ', last one; deleted' : ''}`);
		} catch (e) {
			const message = String(/** @type {Error} */ (e)?.message ?? e).slice(0, 200);
			const failing = { ...s, failingSince: s.failingSince ?? at.toISOString() };
			if (!failing.reported && at.getTime() - Date.parse(failing.failingSince) >= REPORT_AFTER_MS) {
				try {
					await mailer.send({
						to: s.job.email,
						subject: s.job.language === 'de' ? `Eigenbeleg-Abo ${s.id}: Auszug ${s.nextMonth} verzögert sich` : `Eigenbeleg subscription ${s.id}: statement ${s.nextMonth} delayed`,
						text: [
							s.job.language === 'de'
								? `Der ${isUsageStatement(s.job.chain) ? 'Verbrauchsauszug' : 'Kontoauszug'} für ${s.nextMonth} konnte seit ${failing.failingSince.slice(0, 10)} nicht erstellt werden (${message}). Es wird stündlich weiter versucht; sobald es klappt, kommt die Mail.`
								: `The statement for ${s.nextMonth} could not be made since ${failing.failingSince.slice(0, 10)} (${message}). Retrying hourly; the mail comes as soon as it works.`,
							...footer(s)
						].join('\n'),
						attachments: []
					});
					failing.reported = true;
				} catch {
					// told next time
				}
			}
			await store.put(failing).catch(() => {});
			result.failed.push(s.id);
			log(`${at.toISOString()} subscription ${s.id}: ${s.nextMonth} failed: ${message}`);
		}
	}
	return result;
}

/**
 * Runs `runDue` now and then every `intervalMs`. The timer does not keep the
 * process alive; the returned function stops it.
 *
 * @param {Parameters<typeof runDue>[0] & { intervalMs?: number }} o
 */
export function startScheduler({ intervalMs = 3600_000, ...o }) {
	const tick = () => runDue(o).catch((e) => (o.log ?? (() => {}))(`${new Date().toISOString()} subscriptions: ${String(/** @type {Error} */ (e)?.message ?? e).slice(0, 200)}`));
	void tick();
	const t = setInterval(tick, intervalMs);
	t.unref();
	return () => clearInterval(t);
}
