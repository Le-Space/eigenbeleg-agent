// SPDX-License-Identifier: AGPL-3.0-or-later
// A NEAR account's secret key (the agent's own payer account), from the environment or from
// the near-cli legacy keychain file (~/.near-credentials/<network>/<id>.json).
// The key is passed to the signer and never printed, logged or answered.

import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ACCOUNT = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

/**
 * @param {string} accountId
 * @param {'mainnet' | 'testnet'} network
 * @param {string | undefined} fromEnv
 * @returns {Promise<`ed25519:${string}` | `secp256k1:${string}`>}
 */
export async function nearSecretKey(accountId, network, fromEnv) {
	if (fromEnv) return /** @type {any} */ (fromEnv.trim());
	if (!ACCOUNT.test(accountId)) throw new Error('not a NEAR account id');
	const dir = process.env.NEAR_CREDENTIALS_DIR ?? join(homedir(), '.near-credentials');
	const file = join(dir, network, `${accountId}.json`);
	let json;
	try {
		json = JSON.parse(await readFile(file, 'utf8'));
	} catch {
		throw new Error(`no key for ${accountId}: set the secret key in the environment or keep it in ${join(dir, network)}`);
	}
	const key = json.private_key ?? json.secret_key;
	if (typeof key !== 'string' || !/^(ed25519|secp256k1):/.test(key)) throw new Error(`the key file for ${accountId} has no usable key`);
	return /** @type {any} */ (key);
}

/**
 * The agent's DOI key (WIF), for paying in DOI: from the environment (AGENT_DOI_KEY), from a
 * file only its owner can read (AGENT_DOI_KEY_FILE), or from the macOS keychain
 * (AGENT_DOI_KEYCHAIN: the service name of a generic password). Never from the command line:
 * that ends up in the shell history and the process list. The key goes to the signer and is
 * never printed; no error quotes it.
 *
 * @param {Record<string, string | undefined>} env
 * @param {(service: string) => Promise<string>} [keychain] reads the macOS keychain (a test's fake)
 * @returns {Promise<string | undefined>}
 */
export async function doiKey(env, keychain = macKeychain) {
	if (env.AGENT_DOI_KEY) return env.AGENT_DOI_KEY.trim();
	if (env.AGENT_DOI_KEY_FILE) {
		let mode;
		try {
			mode = (await stat(env.AGENT_DOI_KEY_FILE)).mode;
		} catch {
			throw new Error('AGENT_DOI_KEY_FILE: no such file');
		}
		if (mode & 0o077) throw new Error('AGENT_DOI_KEY_FILE can be read by others: chmod 600 it');
		return (await readFile(env.AGENT_DOI_KEY_FILE, 'utf8')).trim();
	}
	if (env.AGENT_DOI_KEYCHAIN) {
		if (!/^[\w .-]{1,64}$/.test(env.AGENT_DOI_KEYCHAIN)) throw new Error('AGENT_DOI_KEYCHAIN: the name of a keychain item');
		return (await keychain(env.AGENT_DOI_KEYCHAIN)).trim();
	}
	return undefined;
}

/** @param {string} service */
function macKeychain(service) {
	return new Promise((resolve, reject) => {
		execFile('/usr/bin/security', ['find-generic-password', '-s', service, '-w'], (error, stdout) => {
			if (error) reject(new Error(`no keychain item "${service}" (security add-generic-password -s ${service} -a doi -w)`));
			else resolve(stdout);
		});
	});
}
