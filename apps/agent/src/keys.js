// A NEAR account's secret key (the agent's own payer account), from the environment or from
// the near-cli legacy keychain file (~/.near-credentials/<network>/<id>.json).
// The key is passed to the signer and never printed, logged or answered.

import { readFile } from 'node:fs/promises';
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
