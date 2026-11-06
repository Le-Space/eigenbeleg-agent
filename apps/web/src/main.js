// SPDX-License-Identifier: AGPL-3.0-or-later
// The page: form → free preview → wallet → x402 payment → downloads.
// Text from the API or the chain is only ever set with textContent.

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
		includeKinds: fd.getAll('includeKinds').map(String)
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
		say('form-error', 'Die API ist nicht erreichbar.');
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
}

/** @param {SubmitEvent} e */
async function onPreview(e) {
	e.preventDefault();
	say('form-error', '');
	resetAfterForm();
	const f = values();
	if (f.includeKinds.length === 0) return say('form-error', 'Bitte mindestens eine Art wählen.');
	const btn = /** @type {HTMLButtonElement} */ ($('btn-preview'));
	btn.disabled = true;
	btn.textContent = 'Lese die Chain …';
	try {
		const r = await fetch('/eigenbeleg/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(previewBody(f)) });
		const body = await r.json().catch(() => ({}));
		if (!r.ok)
			return say(
				'form-error',
				r.status === 429
					? 'Zu viele Vorschauen. Bitte in einer Minute noch einmal.'
					: r.status === 502
						? `Die Chain oder die Kurse sind gerade nicht lesbar, bitte später noch einmal (${body.error ?? r.status}).`
						: `Abgelehnt: ${body.error ?? r.status}`
			);
		showSummary(body);
		previewed = previewKey(f);
		$('step-preview').hidden = false;
		if (body.positions > 0) {
			$('step-pay').hidden = false;
			say('cli-command', cliCommand(f, location.origin));
			await loadOffer(f);
		} else {
			say('preview-note', 'Keine Positionen in diesem Zeitraum: Es gibt nichts zu kaufen.');
		}
	} finally {
		btn.disabled = false;
		btn.textContent = 'Vorschau (kostenlos)';
	}
}

/** @param {unknown} v */
const eur = (v) => {
	const n = Number(v);
	return Number.isFinite(n) ? n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 4 }) : String(v);
};

/** @param {any} s */
function showSummary(s) {
	const rows = [
		['Eigenbelege', `${s.eigenbelege?.length ?? s.transactions ?? '?'} (${s.number})`],
		['Blockchain', `${s.chain} (${s.network})`],
		['Zeitraum', `${s.period.from} bis ${s.period.to}`],
		['Positionen', String(s.positions)],
		['Nicht auf den Belegen (andere Arten)', String(s.notOnIt)],
		['Summe', eur(s.totalEur)],
		...Object.entries(s.quantities ?? {}).map(([asset, q]) => [`Menge ${asset}`, String(q)])
	];
	for (const k of s.kontoauszuege ?? []) {
		const how = k.method === 'archive' ? 'mit der Chain abgeglichen' : 'vom heutigen Saldo abgeleitet';
		rows.push([`Kontoauszug ${k.number}`, `${k.account} (${how})`]);
		for (const a of k.assets ?? []) {
			const ok = a.reconciled === true ? ' ✓' : a.reconciled === false ? ' (Abweichung)' : '';
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
	say('preview-note', 'Name und Anschrift kommen erst beim Kauf dazu. Der Kauf liest die Chain noch einmal.');
}

/** Asks the paid route without a payment: the 402 says what it costs. @param {import('./request.js').FormValues} f */
async function loadOffer(f) {
	// Placeholders, not the payer's data: the real name and address go only with the payment.
	const ask = { ...previewBody(f), format: 'json', payer: { name: 'Angebot', address: 'Angebot' } };
	const r = await fetch('/eigenbeleg', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ask) });
	if (r.status === 400) {
		const b = await r.json().catch(() => ({}));
		say('pay-error', `Abgelehnt: ${b.error ?? 'Anfrage ungültig'}`);
		return;
	}
	if (r.status !== 402) {
		say('price', 'Diese API verlangt keine Zahlung (Entwicklungsmodus).');
		offer = null;
		/** @type {HTMLButtonElement} */ ($('btn-pay')).disabled = false;
		return;
	}
	const req = decodeHeader(r.headers.get('payment-required'));
	const a = req?.accepts?.find((/** @type {any} */ x) => x.scheme === 'exact' && String(x.network).startsWith('near:'));
	if (!a) return say('pay-error', 'Die API bietet keine Zahlung auf NEAR an.');
	offer = { asset: a.asset, payTo: a.payTo, amount: a.amount, network: a.network };
	say('price', `Preis: ${usdc(a.amount)} an ${a.payTo} (${a.network}). Gas zahlt die API.`);
	/** @type {HTMLButtonElement} */ ($('btn-pay')).disabled = !connected;
}

async function onWallet() {
	say('pay-error', '');
	const btn = /** @type {HTMLButtonElement} */ ($('btn-wallet'));
	try {
		if (connected) {
			await connector.disconnect(connected.wallet);
			connected = null;
			btn.textContent = 'Wallet verbinden';
			say('wallet-state', 'Getrennt.');
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
		if (!accountId) throw new Error('Die Wallet hat kein Konto geliefert.');
		connected = { wallet, accountId };
		btn.textContent = 'Wallet trennen';
		say('wallet-state', `Verbunden: ${accountId} (${wallet.manifest?.name ?? 'Wallet'}). Dieses Konto zahlt die USDC; es muss nicht auf dem Eigenbeleg stehen.`);
		/** @type {HTMLButtonElement} */ ($('btn-pay')).disabled = false;
	} catch (e) {
		say('pay-error', `Wallet: ${String(/** @type {Error} */ (e)?.message ?? e).slice(0, 200)}`);
	}
}

async function onPay() {
	const f = values();
	say('pay-error', '');
	$('status').replaceChildren();
	if (previewKey(f) !== previewed) return say('pay-error', 'Die Anfrage hat sich seit der Vorschau geändert. Bitte erst neu prüfen.');
	if (f.name.trim().length < 2 || f.postal.trim().length < 5) return say('pay-error', 'Bitte Name und Anschrift des Zahlers ausfüllen (oben im Formular).');
	const btn = /** @type {HTMLButtonElement} */ ($('btn-pay'));
	btn.disabled = true;
	try {
		let doFetch = fetch;
		if (offer) {
			if (!connected) throw new Error('Bitte zuerst eine Wallet verbinden.');
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
		status('Frage den Eigenbeleg an …');
		const r = await doFetch('/eigenbeleg', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(paidBody(f)) });
		if (!r.ok) {
			const b = await r.json().catch(() => ({}));
			throw new Error(r.status === 402 ? `Zahlung nicht angenommen${b.error ? `: ${b.error}` : ''}. Es wurde nichts abgebucht.` : `${r.status}: ${b.error ?? 'Fehler'}`);
		}
		const out = await r.json();
		showResult(out, decodeHeader(r.headers.get('payment-response')));
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

/** @param {any} out @param {any} settlement */
function showResult(out, settlement) {
	for (const u of blobUrls) URL.revokeObjectURL(u);
	blobUrls = [];
	const first = fileName(out.eigenbelege?.[0] ?? out.number);
	const links = [download(`Eigenbelege (PDF/A, ${out.eigenbelege?.length ?? 1})`, bytes(out.pdf), 'application/pdf', `${first}.pdf`)];
	for (const k of out.kontoauszuegePdf ?? [])
		links.push(download(`Kontoauszug ${k.account} (PDF/A)`, bytes(k.pdf), 'application/pdf', `${fileName(k.number)}.pdf`));
	links.push(download('Alle Bewegungen (CSV)', out.csv, 'text/csv;charset=utf-8', `${first}.csv`));
	$('downloads').replaceChildren(...links);
	const tx = /** @type {HTMLAnchorElement} */ ($('tx-link'));
	const url = settlement?.transaction ? explorerUrl(settlement.network, settlement.transaction) : null;
	if (url) {
		tx.href = url;
		tx.textContent = `${settlement.transaction} (${settlement.network})`;
	} else {
		tx.removeAttribute('href');
		tx.textContent = settlement?.transaction ?? 'ohne Zahlung (Entwicklungsmodus)';
	}
	status(`Fertig: ${out.number}, ${out.positions} Positionen, ${(out.kontoauszuegePdf ?? []).length} Kontoauszug/-auszüge.`);
	$('result').hidden = false;
}

function syncPeriod() {
	const range = values().periodMode === 'range';
	$('l-month').hidden = range;
	$('l-from').hidden = !range;
	$('l-to').hidden = !range;
}

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
