// SPDX-License-Identifier: AGPL-3.0-or-later
// Starts the API with the settings from the environment (.env.example).
import { readFileSync } from 'node:fs';
import { createApp } from './app.js';
import { createPaywall } from './paywall.js';

// A .env next to the repository root, if there is one (no dependency for it).
try {
	for (const line of readFileSync(new URL('../../../.env', import.meta.url), 'utf8').split('\n')) {
		const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
		if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
	}
} catch {
	// no .env
}

const env = process.env;
const paywall = await createPaywall({
	mode: /** @type {any} */ (env.PAYWALL ?? 'near'),
	price: env.PRICE,
	network: /** @type {any} */ (env.PAY_NETWORK ?? 'near:testnet'),
	payTo: env.PAY_TO,
	relayerId: env.RELAYER_ACCOUNT_ID,
	relayerKey: env.RELAYER_SECRET_KEY,
	rpcUrl: env.NEAR_RPC_URL,
	timeoutSeconds: env.PAY_TIMEOUT_SECONDS ? Number(env.PAY_TIMEOUT_SECONDS) : undefined,
	pingApiKey: env.PING_API_KEY,
	pingUrl: env.PING_FACILITATOR_URL,
	pingAmountOut: env.PING_AMOUNT_OUT
});
const app = createApp({ paywall, deps: { nearblocksKey: env.NEARBLOCKS_API_KEY, alchemyKey: env.ALCHEMY_KEY }, source: env.SOURCE_URL, publicUrl: env.PUBLIC_URL });
// Behind a reverse proxy (Caddy): trust its X-Forwarded-Proto, so the x402
// resource URL says https. Express's syntax: e.g. "uniquelocal" or a subnet.
if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);
const host = env.HOST ?? '127.0.0.1';
const port = Number(env.PORT ?? 4402);
app.listen(port, host, () => {
	console.log(`eigenbeleg API on http://${host}:${port} – paywall: ${JSON.stringify(paywall.info)}`);
});
