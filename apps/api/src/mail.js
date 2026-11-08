// SPDX-License-Identifier: AGPL-3.0-or-later
// The files by mail, when a request asks for it (`email`): a document
// management system's inbox sorts them by subject and file name. The mail
// goes out once the response is settled; the address lives in memory until
// then and is in no log line.

import nodemailer from 'nodemailer';

/**
 * @typedef {{ to: string, subject: string, text: string, attachments: { filename: string, content: Buffer | string, contentType: string }[] }} Mail
 * @typedef {{ send: (mail: Mail) => Promise<void> }} Mailer
 */

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
			await transport.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text, attachments: mail.attachments });
		}
	};
}

/**
 * The mail for one result: the files as attachments, the summary as text.
 * Subject and file names are stable and ASCII-safe, for inbox rules.
 *
 * @param {ReturnType<typeof import('@eigenbeleg/pipeline').parseRequest>} job
 * @param {Awaited<ReturnType<typeof import('@eigenbeleg/pipeline').generate>>} out
 * @returns {Mail}
 */
export function composeMail(job, out) {
	const s = out.summary;
	const name = (/** @type {string} */ n) => n.replace(/[^A-Za-z0-9._-]/g, '_');
	const wantBelege = job.document !== 'kontoauszug';
	const wantStatement = job.document !== 'eigenbelege';
	/** @type {Mail['attachments']} */
	const attachments = [];
	if (out.pdf && wantBelege) attachments.push({ filename: `${name(s.eigenbelege[0] ?? s.number)}.pdf`, content: Buffer.from(out.pdf), contentType: 'application/pdf' });
	for (const st of out.statements) attachments.push({ filename: `${name(st.number)}.pdf`, content: Buffer.from(st.pdf), contentType: 'application/pdf' });
	if (out.csv && wantBelege) attachments.push({ filename: `${name(s.eigenbelege[0] ?? s.number)}.csv`, content: out.csv, contentType: 'text/csv; charset=utf-8' });
	const period = s.period.from === s.period.to ? s.period.from : `${s.period.from} bis ${s.period.to}`;
	// s.number is the range (EB-…-042 – EB-…-066) when there are several.
	const title = wantBelege ? `${s.eigenbelege.length > 1 ? 'Eigenbelege' : 'Eigenbeleg'} ${s.number}` : `${job.chain === 'aleph' ? 'Verbrauchsauszug' : 'Kontoauszug'} ${s.kontoauszuege[0]?.number ?? job.statementNumber}`;
	const subject = `${title} · ${s.chain} ${s.network} · ${period}`;
	const lines = [
		`${title} für ${s.chain} (${s.network}), ${period}.`,
		'',
		...(wantBelege ? [`Eigenbelege: ${s.transactions} (${s.positions} Positionen, ${s.totalEur} EUR).`] : []),
		...(wantStatement
			? s.kontoauszuege.flatMap((k) => [
					`${k.number} für ${k.account}:`,
					...k.assets.map((a) => `  ${a.asset}: Anfangsbestand ${a.opening}, Endbestand ${a.closing}${a.reconciled === null ? '' : a.reconciled ? ', abgestimmt' : ', nicht abgestimmt'}`)
				])
			: []),
		'',
		'Erstellt von der Eigenbeleg-API auf Anfrage des Kontoinhabers. Diese Mail und ihre Adresse werden nicht gespeichert.',
		'Made by the Eigenbeleg API at the account holder\'s request. Neither this mail nor its address is kept.'
	];
	return { to: /** @type {string} */ (job.email), subject, text: lines.join('\n'), attachments };
}
