// SPDX-License-Identifier: AGPL-3.0-or-later
// The page: the form → the pipeline, in this browser → summary and downloads.
// The same code as the API (@eigenbeleg/pipeline): it checks the request,
// reads the chain from the data sources directly, values in EUR and draws the
// PDFs here. No request goes to a server of ours; name and address never
// leave the page. Text from the chain is only ever set with textContent.

// Brand typefaces, bundled and served with the page (SIL Open Font License 1.1); no font CDN.
import '@fontsource-variable/sora';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
// Only the request check, the list of chains and the data sources load with the page.
import { RequestError, parseRequest } from '@eigenbeleg/pipeline/request';
import { describeBlocks } from '@eigenbeleg/pipeline/blocks';
import { dataSources } from '@eigenbeleg/pipeline/sources';
import { detectLang, lang, locale, setLang, t } from './i18n.js';
import { fileName, rememberAccounts, rememberPayer, rememberedAccounts, rememberedPayer, requestBody } from './request.js';
import { AKASH_INDEXER } from './config.js';
import { registerServiceWorker } from './pwa.js';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const form = /** @type {HTMLFormElement} */ ($('form'));
const chainSel = /** @type {HTMLSelectElement} */ ($('chain'));
const networkSel = /** @type {HTMLSelectElement} */ ($('network'));
const remember = /** @type {HTMLInputElement} */ ($('remember'));
const rememberAcc = /** @type {HTMLInputElement} */ ($('remember-accounts'));

const blocks = describeBlocks();
// Akash's older history comes through the CORS proxy; without one, only what the public node keeps.
const endpoints = { akash: { indexer: AKASH_INDEXER ?? '' } };

/** what is on screen, so a language switch can draw it again */
/** @type {{ out: Awaited<ReturnType<typeof import('@eigenbeleg/pipeline/generate').generate>>, which: string } | null} */
let shown = null;

/** @returns {import('./request.js').FormValues} */
function values() {
	const fd = new FormData(form);
	const s = (/** @type {string} */ k) => String(fd.get(k) ?? '');
	return {
		chain: s('chain'),
		network: s('network'),
		addresses: s('addresses'),
		periodMode: /** @type {'month' | 'range'} */ (s('periodMode') || 'month'),
		month: s('month'),
		from: s('from'),
		to: s('to'),
		name: s('name'),
		postal: s('postal'),
		number: s('number'),
		statementNumber: s('statementNumber'),
		includeKinds: fd.getAll('includeKinds').map(String),
		logo: fd.get('logo') === 'on',
		document: /** @type {'eigenbelege' | 'kontoauszug' | 'beide'} */ (s('document') || 'eigenbelege')
	};
}

/** @param {string} id @param {string} text */
function say(id, text) {
	$(id).textContent = text;
}

function lastMonth() {
	const d = new Date();
	d.setUTCDate(1);
	d.setUTCMonth(d.getUTCMonth() - 1);
	return d.toISOString().slice(0, 7);
}

/** How the chains are written for people; the value stays the block's id. */
const CHAIN_NAMES = /** @type {Record<string, string>} */ ({ near: 'NEAR', akash: 'Akash (AKT)', filecoin: 'Filecoin (FIL, USDFC)', aleph: 'Aleph Cloud (Credits)' });

function fillChains() {
	chainSel.replaceChildren(...blocks.map((b) => new Option(CHAIN_NAMES[b.chain] ?? b.chain, b.chain)));
	fillNetworks();
}

function fillNetworks() {
	const b = blocks.find((x) => x.chain === chainSel.value);
	networkSel.replaceChildren(...(b?.networks ?? []).map((n) => new Option(n, n)));
	syncChain();
}

/** A block that gives only some documents, or reads whole months (Aleph): the form offers only those. */
function syncChain() {
	const b = blocks.find((x) => x.chain === chainSel.value);
	const docs = /** @type {NodeListOf<HTMLInputElement>} */ (form.querySelectorAll('input[name="document"]'));
	for (const r of docs) r.disabled = Boolean(b?.documents && !b.documents.includes(r.value));
	if ([...docs].find((r) => r.checked)?.disabled) {
		const first = [...docs].find((r) => !r.disabled);
		if (first) first.checked = true;
	}
	const monthly = b?.period === 'month';
	for (const r of /** @type {NodeListOf<HTMLInputElement>} */ (form.querySelectorAll('input[name="periodMode"]'))) {
		r.disabled = monthly && r.value !== 'month';
		if (monthly) r.checked = r.value === 'month';
	}
	$('chain-note').hidden = !monthly;
	syncPeriod();
}

function showSources() {
	$('sources-list').replaceChildren(
		...dataSources({ akashIndexer: AKASH_INDEXER }).map((s) => {
			const li = document.createElement('li');
			li.textContent = `${new URL(s.origin).host}: ${s.what} – ${s.learns === 'addresses' ? t('learnsAddresses') : t('learnsAssets')}`;
			return li;
		})
	);
}

function clearResult() {
	shown = null;
	$('step-result').hidden = true;
	for (const u of blobUrls) URL.revokeObjectURL(u);
	blobUrls = [];
	$('downloads').replaceChildren();
}

/** @param {SubmitEvent} e */
async function onCreate(e) {
	e.preventDefault();
	say('form-error', '');
	clearResult();
	const f = values();
	if (f.includeKinds.length === 0) return say('form-error', t('pickKind'));
	if (f.name.trim().length < 2 || f.postal.trim().length < 5) return say('form-error', t('needPayer'));
	rememberPayer(remember.checked ? { name: f.name.trim(), postal: f.postal.trim() } : null);
	rememberAccounts(rememberAcc.checked ? { chain: f.chain, network: f.network, addresses: f.addresses.trim() } : null);
	let req;
	try {
		req = parseRequest(requestBody(f));
	} catch (err) {
		return say('form-error', t('refused', { error: String(/** @type {Error} */ (err).message) }));
	}
	const btn = /** @type {HTMLButtonElement} */ ($('btn-create'));
	btn.disabled = true;
	btn.textContent = t('btnReading');
	try {
		// The readers, rates and PDF code (and its fonts) load only now, on the first run.
		const { generate } = await import('@eigenbeleg/pipeline/generate');
		/** @param {string} a a long address, shortened for the button */
		const short = (a) => (a.length > 20 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a);
		const out = await generate(req, { endpoints }, {
			onProgress: (p) => {
				btn.textContent = p.step === 'read' ? t('progressRead', { account: short(p.account), n: String(p.index + 1), of: String(p.count) }) : p.step === 'rates' ? t('progressRates') : t('progressDraw');
			}
		});
		shown = { out, which: f.document };
		showResult();
	} catch (err) {
		const message = String(/** @type {Error} */ (err)?.message ?? err).slice(0, 200);
		say('form-error', err instanceof RequestError ? t('refused', { error: message }) : t('unreadable', { error: message }));
	} finally {
		btn.disabled = false;
		btn.textContent = t('btnCreate');
	}
}

/** @param {unknown} v */
const eur = (v) => {
	const n = Number(v);
	return Number.isFinite(n) ? n.toLocaleString(locale(), { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 4 }) : String(v);
};

/** @type {string[]} */
let blobUrls = [];

/** @param {string} label @param {BlobPart} data @param {string} type @param {string} name */
function download(label, data, type, name) {
	const a = document.createElement('a');
	a.className = 'button';
	a.href = URL.createObjectURL(new Blob([data], { type }));
	a.download = name;
	a.textContent = label;
	blobUrls.push(a.href);
	return a;
}

/** Draws summary and downloads from `shown`. */
function showResult() {
	if (!shown) return;
	const { out, which } = shown;
	const s = out.summary;
	const rows = [
		...(which === 'kontoauszug' ? [] : [[t('sumEigenbelege'), `${s.eigenbelege.length} (${s.number})`]]),
		[t('sumChain'), `${s.chain} (${s.network})`],
		[t('sumPeriod'), t('sumPeriodValue', { from: s.period.from, to: s.period.to })],
		[t('sumPositions'), String(s.positions)],
		[t('sumNotOnIt'), String(s.notOnIt)],
		[t('sumTotal'), eur(s.totalEur)],
		...Object.entries(s.quantities ?? {}).map(([asset, q]) => [t('sumQuantity', { asset }), String(q)])
	];
	for (const k of s.kontoauszuege) {
		rows.push([t('sumStatement', { number: k.number }), `${k.account} (${k.method === 'archive' ? t('reconciled') : t('derived')})`]);
		for (const a of k.assets) rows.push([`  ${a.asset}`, `${a.opening} → ${a.closing}${a.reconciled === true ? ' ✓' : a.reconciled === false ? t('difference') : ''}`]);
	}
	$('summary').replaceChildren(
		...rows.flatMap(([k, v]) => {
			const dt = document.createElement('dt');
			dt.textContent = k;
			const dd = document.createElement('dd');
			dd.textContent = v;
			return [dt, dd];
		})
	);
	say('result-note', s.positions > 0 || out.statements.length ? '' : t('nothing'));
	for (const u of blobUrls) URL.revokeObjectURL(u);
	blobUrls = [];
	const links = [];
	const first = fileName(s.eigenbelege[0] ?? s.number);
	if (out.pdf && which !== 'kontoauszug' && s.positions > 0) links.push(download(t('dlEigenbelege', { n: s.eigenbelege.length }), out.pdf, 'application/pdf', `${first}.pdf`));
	for (const k of out.statements) links.push(download(t('dlStatement', { account: k.account }), k.pdf, 'application/pdf', `${fileName(k.number)}.pdf`));
	if (out.csv) links.push(download(t('dlCsv'), out.csv, 'text/csv;charset=utf-8', `${which === 'kontoauszug' ? fileName(out.statements[0]?.number ?? first) : first}.csv`));
	$('downloads').replaceChildren(...links);
	$('step-result').hidden = false;
}

function syncPeriod() {
	const v = values();
	$('l-number').hidden = v.document === 'kontoauszug';
	$('l-statement').hidden = v.document === 'eigenbelege';
	const range = v.periodMode === 'range';
	$('l-month').hidden = range;
	$('l-from').hidden = !range;
	$('l-to').hidden = !range;
}

/** Sets every static text, then draws what is on screen again in the chosen language. */
function applyLang() {
	const l = lang();
	document.documentElement.lang = l;
	for (const el of document.querySelectorAll('[data-i18n]')) {
		const key = /** @type {HTMLElement} */ (el).dataset.i18n;
		if (key) el.textContent = t(/** @type {any} */ (key));
	}
	$('btn-lang').lang = l === 'de' ? 'en' : 'de';
	for (const btn of document.querySelectorAll('button[data-copy]')) btn.setAttribute('aria-label', t('copy'));
	// Texts written in both languages in the markup (the privacy policy), and the Impressum on le-space.de.
	for (const el of document.querySelectorAll('[data-lang]')) /** @type {HTMLElement} */ (el).hidden = /** @type {HTMLElement} */ (el).dataset.lang !== l;
	/** @type {HTMLAnchorElement} */ ($('link-imprint')).href = l === 'de' ? 'https://le-space.de/#impressum' : 'https://le-space.de/#imprint';
	/** @type {HTMLTextAreaElement} */ ($('postal')).placeholder = t('postalPlaceholder');
	showSources();
	showResult();
}

setLang(detectLang());
applyLang();
$('btn-lang').addEventListener('click', () => {
	setLang(lang() === 'de' ? 'en' : 'de', true);
	applyLang();
});
/** @type {HTMLInputElement} */ ($('month')).value = lastMonth();
const saved = rememberedPayer();
if (saved) {
	/** @type {HTMLInputElement} */ ($('name')).value = saved.name;
	/** @type {HTMLTextAreaElement} */ ($('postal')).value = saved.postal;
	remember.checked = true;
}
remember.addEventListener('change', () => {
	if (!remember.checked) rememberPayer(null);
});
// The prompt and the curl lines: a button copies the block next to it.
for (const btn of document.querySelectorAll('button[data-copy]')) {
	btn.addEventListener('click', async () => {
		const pre = btn.parentElement?.querySelector('pre');
		const label = /** @type {HTMLElement} */ (btn.querySelector('span'));
		try {
			await navigator.clipboard.writeText(pre?.textContent ?? '');
			label.textContent = t('copied');
		} catch {
			// no clipboard (insecure context, denied): select the text so the person copies it
			if (pre) getSelection()?.selectAllChildren(pre);
			label.textContent = '';
		}
		setTimeout(() => (label.textContent = ''), 1500);
	});
}
// A link to #datenschutz opens the folded policy.
const openLegal = () => {
	if (location.hash === '#datenschutz') /** @type {HTMLDetailsElement} */ ($('datenschutz')).open = true;
};
openLegal();
window.addEventListener('hashchange', openLegal);
fillChains();
chainSel.addEventListener('change', fillNetworks);
const savedAccounts = rememberedAccounts();
if (savedAccounts) {
	if ([...chainSel.options].some((o) => o.value === savedAccounts.chain)) chainSel.value = savedAccounts.chain;
	fillNetworks();
	if ([...networkSel.options].some((o) => o.value === savedAccounts.network)) networkSel.value = savedAccounts.network;
	/** @type {HTMLTextAreaElement} */ ($('addresses')).value = savedAccounts.addresses;
	rememberAcc.checked = true;
}
rememberAcc.addEventListener('change', () => {
	const f = values();
	rememberAccounts(rememberAcc.checked ? { chain: f.chain, network: f.network, addresses: f.addresses.trim() } : null);
});
form.addEventListener('submit', onCreate);
form.addEventListener('change', syncPeriod);
registerServiceWorker();
