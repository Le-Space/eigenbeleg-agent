// SPDX-License-Identifier: AGPL-3.0-or-later
// The page: form → free preview → wallet → x402 payment → downloads.
// Text from the API or the chain is only ever set with textContent.

import { detectLang, lang, locale, setLang, t } from './i18n.js';
import { cliCommand, decodeHeader, explorerUrl, paidBody, previewBody, previewKey, usdc } from './request.js';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const form = /** @type {HTMLFormElement} */ ($('form'));
const chainSel = /** @type {HTMLSelectElement} */ ($('chain'));
const networkSel = /** @type {HTMLSelectElement} */ ($('network'));

/** @type {{ chain: string, networks: string[] }[]} */
let blocks = [];
/** the request the preview showed; a change to the form clears it */
let previewed = '';
/** @type {{ asset: string, payTo: string, amount: string, network: string } | null} */
let offer = null;
/** @type {{ wallet: any, accountId: string } | null} */
let connected = null;
/** @type {any} */
let connector = null;
/** what is on screen, so a language switch can draw it again */
/** @type {{ summary: any, which: string, docs: string } | null} */
let shown = null;
/** @type {{ out: any, settlement: any } | null} */
let bought = null;

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
		document: /** @type {'eigenbelege' | 'kontoauszug' | 'beide'} */ (s('document') || 'eigenbelege')
	};
}

/** @param {string} id @param {string} text */
function say(id, text) {
	$(id).textContent = text;
}

/** @param {string} line */
function status(line) {
	const li = document.createElement('li');
	li.textContent = line;
	$('status').append(li);
}

function lastMonth() {
	const d = new Date();
	d.setUTCDate(1);
	d.setUTCMonth(d.getUTCMonth() - 1);
	return d.toISOString().slice(0, 7);
}

function fillNetworks() {
	const b = blocks.find((x) => x.chain === chainSel.value);
	networkSel.replaceChildren(...(b?.networks ?? []).map((n) => new Option(n, n)));
}

async function loadBlocks() {
	try {
		const r = await fetch('/blocks');
		blocks = (await r.json()).blocks ?? [];
	} catch {
		say('form-error', t('apiDown'));
		return;
	}
	chainSel.replaceChildren(...blocks.map((b) => new Option(b.chain, b.chain)));
	fillNetworks();
}

function resetAfterForm() {
	previewed = '';
	offer = null;
	$('step-preview').hidden = true;
	$('step-pay').hidden = true;
	$('result').hidden = true;
	$('status').replaceChildren();
	say('pay-error', '');
	shown = null;
	bought = null;
}

/** @param {SubmitEvent} e */
async function onPreview(e) {
	e.preventDefault();
	say('form-error', '');
	resetAfterForm();
	const f = values();
	if (f.includeKinds.length === 0) return say('form-error', t('pickKind'));
	const btn = /** @type {HTMLButtonElement} */ ($('btn-preview'));
	btn.disabled = true;
	btn.textContent = t('btnReading');
	try {
		const r = await fetch('/eigenbeleg/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(previewBody(f)) });
		const body = await r.json().catch(() => ({}));
		if (!r.ok)
			return say(
				'form-error',
				r.status === 429 ? t('tooMany') : r.status === 502 ? t('unreadable', { error: body.error ?? r.status }) : t('refused', { error: body.error ?? r.status })
			);
		shown = { summary: body, which: f.document, docs: '' };
		showSummary();
		previewed = previewKey(f);
		$('step-preview').hidden = false;
		if (body.positions > 0) {
			$('step-pay').hidden = false;
			say('cli-command', cliCommand(f, location.origin));
			await loadOffer(f);
		} else {
			say('preview-note', t('nothing'));
		}
	} finally {
		btn.disabled = false;
		btn.textContent = t('btnPreview');
	}
}

/** @param {unknown} v */
const eur = (v) => {
	const n = Number(v);
	return Number.isFinite(n) ? n.toLocaleString(locale(), { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 4 }) : String(v);
};

const DOCS = /** @type {const} */ ({ eigenbelege: 'docsEigenbelege', kontoauszug: 'docsKontoauszug', beide: 'docsBeide' });

/** Draws the preview from `shown`. */
function showSummary() {
	if (!shown) return;
	const { summary: s, which } = shown;
	const rows = [
		...(which === 'kontoauszug' ? [] : [[t('sumEigenbelege'), `${s.eigenbelege?.length ?? s.transactions ?? '?'} (${s.number})`]]),
		[t('sumChain'), `${s.chain} (${s.network})`],
		[t('sumPeriod'), t('sumPeriodValue', { from: s.period.from, to: s.period.to })],
		[t('sumPositions'), String(s.positions)],
		[t('sumNotOnIt'), String(s.notOnIt)],
		[t('sumTotal'), eur(s.totalEur)],
		...Object.entries(s.quantities ?? {}).map(([asset, q]) => [t('sumQuantity', { asset }), String(q)])
	];
	for (const k of s.kontoauszuege ?? []) {
		const how = k.method === 'archive' ? t('reconciled') : t('derived');
		rows.push([t('sumStatement', { number: k.number }), `${k.account} (${how})`]);
		for (const a of k.assets ?? []) {
			const ok = a.reconciled === true ? ' ✓' : a.reconciled === false ? t('difference') : '';
			rows.push([`  ${a.asset}`, `${a.opening} → ${a.closing}${ok}`]);
		}
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
	say('preview-note', s.positions > 0 ? t('previewNote') : t('nothing'));
	showPrice();
}

function showPrice() {
	if (!shown) return;
	if (offer) say('price', t('price', { docs: t(DOCS[/** @type {keyof typeof DOCS} */ (shown.which)] ?? 'docsEigenbelege'), amount: usdc(offer.amount), payTo: offer.payTo, network: offer.network }));
	else if (shown.docs === 'free') say('price', t('free'));
}

/** Asks the paid route without a payment: the 402 says what it costs. @param {import('./request.js').FormValues} f */
async function loadOffer(f) {
	// Placeholders, not the payer's data: the real name and address go only with the payment.
	const ask = { ...previewBody(f), format: 'json', payer: { name: 'Angebot', address: 'Angebot' } };
	const r = await fetch('/eigenbeleg', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ask) });
	if (r.status === 400) {
		const b = await r.json().catch(() => ({}));
		say('pay-error', t('refused', { error: b.error ?? r.status }));
		return;
	}
	if (r.status !== 402) {
		offer = null;
		if (shown) shown.docs = 'free';
		showPrice();
		/** @type {HTMLButtonElement} */ ($('btn-pay')).disabled = false;
		return;
	}
	const req = decodeHeader(r.headers.get('payment-required'));
	const a = req?.accepts?.find((/** @type {any} */ x) => x.scheme === 'exact' && String(x.network).startsWith('near:'));
	if (!a) return say('pay-error', t('noNear'));
	offer = { asset: a.asset, payTo: a.payTo, amount: a.amount, network: a.network };
	showPrice();
	/** @type {HTMLButtonElement} */ ($('btn-pay')).disabled = !connected;
}

async function onWallet() {
	say('pay-error', '');
	const btn = /** @type {HTMLButtonElement} */ ($('btn-wallet'));
	try {
		if (connected) {
			await connector.disconnect(connected.wallet);
			connected = null;
			btn.dataset.i18n = 'btnWallet';
			btn.textContent = t('btnWallet');
			$('wallet-state').dataset.i18n = 'disconnected';
			say('wallet-state', t('disconnected'));
			/** @type {HTMLButtonElement} */ ($('btn-pay')).disabled = Boolean(offer);
			return;
		}
		const network = offer?.network === 'near:mainnet' ? 'mainnet' : 'testnet';
		// NEAR Connect is loaded only now, on this click: before, the page runs no wallet code.
		if (!connector) {
			const [{ NearConnector }, manifest] = await Promise.all([import('@hot-labs/near-connect'), import('./wallet-manifest.json')]);
			const nonce = document.querySelector('meta[name="csp-nonce"]')?.getAttribute('content') ?? undefined;
			connector = new NearConnector({
				network,
				manifest: manifest.default,
				features: { signDelegateActions: true, [network]: true },
				cspNonce: nonce && nonce !== '__CSP_NONCE__' ? nonce : undefined,
				autoConnect: false,
				footerBranding: null
			});
		}
		const wallet = await connector.connect();
		const accounts = await wallet.getAccounts({ network });
		const accountId = accounts?.[0]?.accountId;
		if (!accountId) throw new Error(t('noAccount'));
		connected = { wallet, accountId };
		btn.dataset.i18n = 'btnDisconnect';
		btn.textContent = t('btnDisconnect');
		showConnected();
		/** @type {HTMLButtonElement} */ ($('btn-pay')).disabled = false;
	} catch (e) {
		say('pay-error', t('walletError', { error: String(/** @type {Error} */ (e)?.message ?? e).slice(0, 200) }));
	}
}

async function onPay() {
	const f = values();
	say('pay-error', '');
	$('status').replaceChildren();
	if (previewKey(f) !== previewed) return say('pay-error', t('changed'));
	if (f.name.trim().length < 2 || f.postal.trim().length < 5) return say('pay-error', t('needPayer'));
	const btn = /** @type {HTMLButtonElement} */ ($('btn-pay'));
	btn.disabled = true;
	try {
		let doFetch = fetch;
		if (offer) {
			if (!connected) throw new Error(t('connectFirst'));
			const [{ x402Client, wrapFetchWithPayment }, { ExactNearScheme }, { walletSigner }] = await Promise.all([
				import('@x402/fetch'),
				import('@x402/near/exact/client'),
				import('./delegate.js')
			]);
			const confirmed = offer;
			const network = confirmed.network === 'near:mainnet' ? 'mainnet' : 'testnet';
			const signer = walletSigner({ wallet: connected.wallet, accountId: connected.accountId, network, confirmed: () => confirmed, say: status });
			const client = new x402Client()
				.register(/** @type {any} */ (confirmed.network), new ExactNearScheme(/** @type {any} */ (signer)))
				.setSpendControls({ maxAmountPerPayment: `$${(Number(confirmed.amount) / 1e6).toFixed(6)}` });
			doFetch = wrapFetchWithPayment(fetch, client);
		}
		status(t('asking'));
		const r = await doFetch('/eigenbeleg', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(paidBody(f)) });
		if (!r.ok) {
			const b = await r.json().catch(() => ({}));
			throw new Error(r.status === 402 ? t('notAccepted', { error: b.error ? `: ${b.error}` : '' }) : t('failed', { status: r.status, error: b.error ?? '' }));
		}
		const out = await r.json();
		bought = { out, settlement: decodeHeader(r.headers.get('payment-response')) };
		status(/** @type {string} */ (showResult()));
	} catch (e) {
		say('pay-error', String(/** @type {Error} */ (e)?.message ?? e).slice(0, 300));
	} finally {
		btn.disabled = false;
	}
}

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

/** @param {string} b64 */
const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
/** @param {unknown} n */
const fileName = (n) => String(n).replace(/[^A-Za-z0-9._-]/g, '_');

/** Draws the downloads from `bought`; returns the status line. */
function showResult() {
	if (!bought) return '';
	const { out, settlement } = bought;
	for (const u of blobUrls) URL.revokeObjectURL(u);
	blobUrls = [];
	const first = fileName(out.pdf ? out.eigenbelege?.[0] ?? out.number : out.kontoauszuegePdf?.[0]?.number ?? out.number);
	const links = [];
	if (out.pdf) links.push(download(t('dlEigenbelege', { n: out.eigenbelege?.length ?? 1 }), bytes(out.pdf), 'application/pdf', `${first}.pdf`));
	for (const k of out.kontoauszuegePdf ?? [])
		links.push(download(t('dlStatement', { account: k.account }), bytes(k.pdf), 'application/pdf', `${fileName(k.number)}.pdf`));
	links.push(download(t('dlCsv'), out.csv, 'text/csv;charset=utf-8', `${first}.csv`));
	$('downloads').replaceChildren(...links);
	const tx = /** @type {HTMLAnchorElement} */ ($('tx-link'));
	const url = settlement?.transaction ? explorerUrl(settlement.network, settlement.transaction) : null;
	if (url) {
		tx.href = url;
		tx.textContent = `${settlement.transaction} (${settlement.network})`;
	} else {
		tx.removeAttribute('href');
		tx.textContent = settlement?.transaction ?? t('unpaid');
	}
	const ka = (out.kontoauszuegePdf ?? []).length;
	$('result').hidden = false;
	return t('done', { eb: out.pdf ? t('doneEb', { number: out.number }) : t('doneNoEb'), ka: ka ? t('doneKa', { n: ka }) : t('doneNoKa') });
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

function showConnected() {
	if (!connected) return;
	$('wallet-state').dataset.i18n = '';
	say('wallet-state', t('connected', { account: connected.accountId, wallet: connected.wallet.manifest?.name ?? 'Wallet' }));
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
	/** @type {HTMLTextAreaElement} */ ($('postal')).placeholder = t('postalPlaceholder');
	showSummary();
	showConnected();
	if (bought) showResult();
}

setLang(detectLang());
applyLang();
$('btn-lang').addEventListener('click', () => {
	setLang(lang() === 'de' ? 'en' : 'de', true);
	applyLang();
});
/** @type {HTMLInputElement} */ ($('month')).value = lastMonth();
chainSel.addEventListener('change', fillNetworks);
form.addEventListener('submit', onPreview);
form.addEventListener('change', () => {
	syncPeriod();
	if (previewed && previewKey(values()) !== previewed) resetAfterForm();
});
form.addEventListener('input', () => {
	if (previewed && previewKey(values()) !== previewed) resetAfterForm();
});
$('btn-wallet').addEventListener('click', onWallet);
$('btn-pay').addEventListener('click', onPay);
loadBlocks();
