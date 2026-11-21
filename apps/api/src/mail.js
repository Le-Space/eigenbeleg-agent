// SPDX-License-Identifier: AGPL-3.0-or-later
// The files by mail, when a request asks for it (`email`): a document
// management system's inbox sorts them by subject and file name, and the
// person who opens it reads a short, friendly note: what is attached, what to
// do with it, and where it came from. Plain text and an HTML part with the
// same words; the language is the request's (en unless it says de). The mail
// goes out once the response is settled; the address lives in memory until
// then and is in no log line. Everything from the chain or the request
// (account names, numbers) is escaped before it goes into the HTML.

import nodemailer from 'nodemailer';
import { isUsageStatement } from '@eigenbeleg/pipeline';

/**
 * @typedef {{ to: string, subject: string, text: string, html?: string, attachments: { filename: string, content: Buffer | string, contentType: string }[] }} Mail
 * @typedef {{ send: (mail: Mail) => Promise<void> }} Mailer
 * @typedef {{ id: string, monthsLeft: number, cancel: string }} SubscriptionNote what a subscription's mail says about itself
 */

/** Where the source is, unless the instance says otherwise (SOURCE_URL). */
export const SOURCE_URL = 'https://github.com/Le-Space/eigenbeleg-agent';

/**
 * The mailer from the environment: SMTP_URL (smtps://user:pass@host:465, or smtp://… with STARTTLS)
 * and MAIL_FROM. Without SMTP_URL this instance offers no mail (null).
 *
 * @param {{ smtpUrl?: string, from?: string }} o
 * @returns {Mailer | null}
 */
export function createMailer({ smtpUrl, from }) {
	if (!smtpUrl) return null;
	if (!from) throw new Error('MAIL_FROM is needed with SMTP_URL');
	const transport = nodemailer.createTransport(smtpUrl);
	return {
		async send(mail) {
			await transport.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html, attachments: mail.attachments });
		}
	};
}

/** @param {string} s */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/** The words of the mail, per language. */
const WORDS = {
	de: {
		hello: 'Guten Tag,',
		intro: (/** @type {string} */ what, /** @type {string} */ where, /** @type {string} */ period) => `anbei ${what} für ${where}, ${period}, als PDF/A für die Buchhaltung.`,
		attached: 'Im Anhang',
		eigenbelege: (/** @type {number} */ n, /** @type {number} */ positions, /** @type {string} */ eur, currency = 'EUR') => `${n} ${n === 1 ? 'Eigenbeleg' : 'Eigenbelege'} (${positions} Positionen, ${eur} ${currency})`,
		statement: (/** @type {string} */ kind, /** @type {string} */ account) => `${kind} für ${account}`,
		balance: (/** @type {{ asset: string, opening: string, closing: string, reconciled: boolean | null }} */ a) => `${a.asset}: Anfangsbestand ${a.opening}, Endbestand ${a.closing}${a.reconciled === null ? '' : a.reconciled ? ', mit der Chain abgestimmt' : ', nicht abgestimmt – bitte prüfen'}`,
		csv: 'alle Bewegungen, für die Tabellenkalkulation',
		next: 'So geht es weiter',
		signHint: 'Eigenbelege ausdrucken, prüfen und unterschreiben: ein Eigenbeleg gilt erst mit Unterschrift. Ob der Steuerberater ihn anerkennt, entscheidet er.',
		fileHint: 'Den Kontoauszug wie einen Bankauszug ablegen. Jede Buchung ist über ihren Transaktions-Hash in einem öffentlichen Block-Explorer nachprüfbar.',
		subscription: (/** @type {SubscriptionNote} */ s) => `Aus Ihrem Abo der Eigenbeleg-API (${s.id}): noch ${s.monthsLeft} Monat(e) nach diesem. Ihre Angaben bleiben verschlüsselt bis zum letzten Auszug oder bis Sie beenden.`,
		cancel: 'Abo beenden (löscht alle Angaben, keine Erstattung der Restmonate):',
		made: 'Erstellt von der Eigenbeleg-API auf Anfrage des Kontoinhabers. Diese Mail und ihre Adresse werden nicht gespeichert.',
		web: 'Für Menschen, kostenlos im Browser:',
		source: 'Quellcode (AGPL-3.0-or-later):',
		bis: 'bis',
		kontoauszug: 'Kontoauszug',
		verbrauchsauszug: 'Verbrauchsauszug',
		docs: 'die Eigenbelege und den Kontoauszug',
		docsEb: 'die Eigenbelege',
		docEb: 'den Eigenbeleg',
		docKa: 'den Kontoauszug',
		docVa: 'den Verbrauchsauszug'
	},
	en: {
		hello: 'Hello,',
		intro: (/** @type {string} */ what, /** @type {string} */ where, /** @type {string} */ period) => `attached ${what} for ${where}, ${period}, as PDF/A for the books. The documents are in German, as German bookkeeping needs them.`,
		attached: 'Attached',
		eigenbelege: (/** @type {number} */ n, /** @type {number} */ positions, /** @type {string} */ eur, currency = 'EUR') => `${n} ${n === 1 ? 'Eigenbeleg' : 'Eigenbelege'} (${positions} positions, ${eur} ${currency})`,
		statement: (/** @type {string} */ kind, /** @type {string} */ account) => `${kind} for ${account}`,
		balance: (/** @type {{ asset: string, opening: string, closing: string, reconciled: boolean | null }} */ a) => `${a.asset}: opening balance ${a.opening}, closing balance ${a.closing}${a.reconciled === null ? '' : a.reconciled ? ', reconciled with the chain' : ', not reconciled – please check'}`,
		csv: 'every movement, for the spreadsheet',
		next: 'What to do next',
		signHint: 'Print, check and sign the Eigenbelege: an Eigenbeleg counts only with a signature. Whether the tax adviser accepts it is their call.',
		fileHint: 'File the statement like a bank statement. Every booking can be checked by its transaction hash in a public block explorer.',
		subscription: (/** @type {SubscriptionNote} */ s) => `From your Eigenbeleg API subscription (${s.id}): ${s.monthsLeft} month(s) left after this one. Your details stay encrypted until the last statement or until you cancel.`,
		cancel: 'Cancel the subscription (deletes every detail, no refund of the remaining months):',
		made: "Made by the Eigenbeleg API at the account holder's request. Neither this mail nor its address is kept.",
		web: 'For people, free, in the browser:',
		source: 'Source code (AGPL-3.0-or-later):',
		bis: 'to',
		kontoauszug: 'account statement (Kontoauszug)',
		verbrauchsauszug: 'usage statement (Verbrauchsauszug)',
		docs: 'the Eigenbelege and the account statement',
		docsEb: 'the Eigenbelege',
		docEb: 'the Eigenbeleg',
		docKa: 'the account statement (Kontoauszug)',
		docVa: 'the usage statement (Verbrauchsauszug)'
	}
};

/**
 * The mail for one result: the files as attachments, a short note as text and HTML.
 * Subject and file names are stable and ASCII-safe, for inbox rules.
 *
 * @param {ReturnType<typeof import('@eigenbeleg/pipeline').parseRequest>} job
 * @param {Awaited<ReturnType<typeof import('@eigenbeleg/pipeline').generate>>} out
 * @param {{ origin?: string, source?: string, subscription?: SubscriptionNote }} [o] where the web UI and the source are; the subscription this mail is part of
 * @returns {Mail}
 */
export function composeMail(job, out, { origin, source = SOURCE_URL, subscription } = {}) {
	const s = out.summary;
	const w = WORDS[job.language === 'de' ? 'de' : 'en'];
	const name = (/** @type {string} */ n) => n.replace(/[^A-Za-z0-9._-]/g, '_');
	const wantBelege = job.document !== 'kontoauszug';
	const wantStatement = job.document !== 'eigenbelege';
	const statementKind = isUsageStatement(job.chain) ? w.verbrauchsauszug : w.kontoauszug;
	/** @type {Mail['attachments']} */
	const attachments = [];
	/** @type {[string, string][]} file name and what it is */
	const listed = [];
	if (out.pdf && wantBelege) {
		attachments.push({ filename: `${name(s.eigenbelege[0] ?? s.number)}.pdf`, content: Buffer.from(out.pdf), contentType: 'application/pdf' });
		listed.push([`${name(s.eigenbelege[0] ?? s.number)}.pdf`, w.eigenbelege(s.eigenbelege.length, s.positions, s.totalEur, s.currency)]);
	}
	for (const st of out.statements) attachments.push({ filename: `${name(st.number)}.pdf`, content: Buffer.from(st.pdf), contentType: 'application/pdf' });
	if (wantStatement) for (const k of s.kontoauszuege) listed.push([`${name(k.number)}.pdf`, `${w.statement(statementKind, k.account)} – ${k.assets.map(w.balance).join('; ')}`]);
	if (out.csv && wantBelege) {
		attachments.push({ filename: `${name(s.eigenbelege[0] ?? s.number)}.csv`, content: out.csv, contentType: 'text/csv; charset=utf-8' });
		listed.push([`${name(s.eigenbelege[0] ?? s.number)}.csv`, w.csv]);
	}
	const period = s.period.from === s.period.to ? s.period.from : `${s.period.from} ${w.bis} ${s.period.to}`;
	// s.number is the range (EB-…-042 – EB-…-066) when there are several.
	const title = wantBelege ? `${s.eigenbelege.length > 1 ? 'Eigenbelege' : 'Eigenbeleg'} ${s.number}` : `${isUsageStatement(job.chain) ? 'Verbrauchsauszug' : 'Kontoauszug'} ${s.kontoauszuege[0]?.number ?? job.statementNumber}`;
	const subject = `${title} · ${s.chain} ${s.network} · ${period}`;
	const what = wantBelege && wantStatement ? w.docs : wantBelege ? (s.eigenbelege.length > 1 ? w.docsEb : w.docEb) : isUsageStatement(job.chain) ? w.docVa : w.docKa;
	const where = `${s.chain} (${s.network})`;
	const hints = [...(wantBelege ? [w.signHint] : []), ...(wantStatement ? [w.fileHint] : [])];
	const web = origin ? `${origin}/ui/` : null;

	const text = [
		w.hello,
		'',
		w.intro(what, where, period),
		'',
		`${w.attached}:`,
		...listed.map(([file, about]) => `- ${file}: ${about}`),
		'',
		`${w.next}:`,
		...hints.map((h) => `- ${h}`),
		...(subscription ? ['', w.subscription(subscription), `${w.cancel} ${subscription.cancel}`] : []),
		'',
		w.made,
		...(web ? [`${w.web} ${web}`] : []),
		`${w.source} ${source}`
	].join('\n');

	const p = (/** @type {string} */ t) => `<p style="margin:0 0 14px">${t}</p>`;
	const html = [
		'<!doctype html><html><head><meta charset="utf-8"></head>',
		'<body style="margin:0;padding:24px 16px;background:#f6f4ee;color:#1f2937;font:15px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif">',
		'<div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e1d6;border-radius:8px;padding:28px 28px 20px">',
		'<div style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#6b7280;margin-bottom:18px">Eigenbeleg</div>',
		p(esc(w.hello)),
		p(esc(w.intro(what, where, period))),
		`<p style="margin:0 0 6px;font-weight:600">${esc(w.attached)}</p>`,
		'<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 16px;width:100%">',
		...listed.map(([file, about]) => `<tr><td style="padding:6px 10px 6px 0;vertical-align:top;white-space:nowrap;font-family:ui-monospace,Menlo,monospace;font-size:13px">${esc(file)}</td><td style="padding:6px 0;vertical-align:top;border-bottom:1px solid #eee">${esc(about)}</td></tr>`),
		'</table>',
		`<p style="margin:0 0 6px;font-weight:600">${esc(w.next)}</p>`,
		`<ul style="margin:0 0 16px;padding-left:20px">${hints.map((h) => `<li style="margin:0 0 6px">${esc(h)}</li>`).join('')}</ul>`,
		...(subscription
			? [`<div style="margin:0 0 16px;padding:12px 14px;background:#f6f4ee;border-radius:6px;font-size:14px">${esc(w.subscription(subscription))}<br>${esc(w.cancel)} <a href="${esc(subscription.cancel)}" style="color:#1f2937">${esc(subscription.cancel)}</a></div>`]
			: []),
		`<p style="margin:16px 0 0;padding-top:12px;border-top:1px solid #e5e1d6;font-size:12px;color:#6b7280">${esc(w.made)}${web ? `<br>${esc(w.web)} <a href="${esc(web)}" style="color:#6b7280">${esc(web)}</a>` : ''}<br>${esc(w.source)} <a href="${esc(source)}" style="color:#6b7280">${esc(source)}</a></p>`,
		'</div></body></html>'
	].join('\n');

	return { to: /** @type {string} */ (job.email), subject, text, html, attachments };
}
