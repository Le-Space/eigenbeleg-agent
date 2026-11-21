// SPDX-License-Identifier: AGPL-3.0-or-later
// The issuer's logo of a preview, kept for a day (Le-Space/belege#906).
//
// The free preview checks a picture and, where this store is on, keeps it:
// the answer names an id, and the paid request or the subscription made
// within 24 hours names that id instead of sending the picture again.
//
// What is kept is the picture as the documents carry it (a PNG laid on white,
// a JPEG without its EXIF), one file each in LOGO_DIR. The id is random and is
// the only key: the file's name is a hash of it and its content is encrypted
// with a key made from it (AES-256-GCM), so the directory alone, or a copy of
// the volume, shows no picture and no id. Nothing else is written: no address,
// no name, no log line with the id.
//
// A file is gone 24 hours after it was written: `get` no longer opens it, and
// the sweep, which runs in the API process on start and once an hour, deletes
// it. Unpaid uploads are bounded: the preview's limit per IP, and at most
// MAX_FILES files, beyond which a preview still checks the picture but keeps
// none.

import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** How long a preview's picture is kept. */
export const LOGO_TTL_MS = 24 * 3600_000;
/** How many pictures are kept at once; with 512 kB each at most, about half a gigabyte. */
export const MAX_FILES = 1000;

const ID = /^[0-9a-f]{64}$/;
const FILE = /^[0-9a-f]{32}\.logo$/;
/** The file's first bytes: when it was written, in milliseconds, as eight bytes. */
const HEAD = 8;

/** @typedef {{ put: (bytes: Uint8Array) => Promise<{ id: string, until: string } | null>, get: (id: unknown) => Promise<{ bytes: Uint8Array, until: string } | null>, sweep: () => Promise<number> }} LogoStore */

/**
 * @param {{ dir: string, now?: () => Date, ttlMs?: number, maxFiles?: number }} o
 * @returns {LogoStore}
 */
export function createLogoStore({ dir, now = () => new Date(), ttlMs = LOGO_TTL_MS, maxFiles = MAX_FILES }) {
	const nameOf = (/** @type {string} */ id) => `${createHash('sha256').update(`eigenbeleg logo file ${id}`).digest('hex').slice(0, 32)}.logo`;
	const keyOf = (/** @type {string} */ id) => Buffer.from(hkdfSync('sha256', Buffer.from(id, 'hex'), Buffer.alloc(0), 'eigenbeleg logo key', 32));
	/** When a file was written, from its first bytes; NaN for anything else. @param {Buffer} file */
	const writtenAt = (file) => (file.length > HEAD + 28 ? Number(file.readBigUInt64BE(0)) : NaN);
	const until = (/** @type {number} */ at) => new Date(at + ttlMs).toISOString();
	return {
		/** Keeps a picture; null when the store is full or cannot write (the preview goes on without). */
		async put(bytes) {
			try {
				await mkdir(dir, { recursive: true, mode: 0o700 });
				if ((await readdir(dir)).filter((n) => FILE.test(n)).length >= maxFiles) return null;
				const id = randomBytes(32).toString('hex');
				const at = now().getTime();
				const head = Buffer.alloc(HEAD);
				head.writeBigUInt64BE(BigInt(at));
				const iv = randomBytes(12);
				const cipher = createCipheriv('aes-256-gcm', keyOf(id), iv);
				// The time is part of what is sealed: a file with another time does not open.
				cipher.setAAD(head);
				const data = Buffer.concat([cipher.update(bytes), cipher.final()]);
				const tmp = join(dir, `${randomBytes(8).toString('hex')}.tmp`);
				await writeFile(tmp, Buffer.concat([head, iv, cipher.getAuthTag(), data]), { mode: 0o600 });
				await rename(tmp, join(dir, nameOf(id)));
				return { id, until: until(at) };
			} catch {
				return null;
			}
		},
		/** The picture of an id, while it is kept; null for anything else. */
		async get(id) {
			if (typeof id !== 'string' || !ID.test(id)) return null;
			try {
				const file = await readFile(join(dir, nameOf(id)));
				const at = writtenAt(file);
				if (!(now().getTime() - at < ttlMs)) return null;
				const decipher = createDecipheriv('aes-256-gcm', keyOf(id), file.subarray(HEAD, HEAD + 12));
				decipher.setAAD(file.subarray(0, HEAD));
				decipher.setAuthTag(file.subarray(HEAD + 12, HEAD + 28));
				const bytes = Buffer.concat([decipher.update(file.subarray(HEAD + 28)), decipher.final()]);
				return { bytes: new Uint8Array(bytes), until: until(at) };
			} catch {
				return null;
			}
		},
		/** Deletes every picture older than a day, and what a torn write left; returns how many files went. */
		async sweep() {
			let gone = 0;
			const at = now().getTime();
			for (const n of await readdir(dir).catch(() => /** @type {string[]} */ ([]))) {
				const path = join(dir, n);
				try {
					if (FILE.test(n)) {
						if (at - writtenAt(await readFile(path)) < ttlMs) continue;
					} else if (!/^[0-9a-f]{16}\.tmp$/.test(n)) continue;
					await rm(path, { force: true });
					gone++;
				} catch {
					// read again next time
				}
			}
			return gone;
		}
	};
}

/**
 * Sweeps now and then every `intervalMs`. The timer does not keep the process
 * alive; the returned function stops it. A log line says how many went, never which.
 *
 * @param {{ store: LogoStore, intervalMs?: number, log?: (line: string) => void }} o
 */
export function startLogoSweep({ store, intervalMs = 3600_000, log = () => {} }) {
	const tick = () =>
		store.sweep().then(
			(n) => void (n && log(`${new Date().toISOString()} logos: ${n} deleted after 24 hours`)),
			(e) => log(`${new Date().toISOString()} logos: sweep failed: ${String(/** @type {Error} */ (e)?.message ?? e).slice(0, 200)}`)
		);
	void tick();
	const t = setInterval(tick, intervalMs);
	t.unref();
	return () => clearInterval(t);
}
