// SPDX-License-Identifier: AGPL-3.0-or-later
// Starts the API with the settings from the environment (.env.example).
import { readFileSync } from 'node:fs';
import { blocksFor } from '@eigenbeleg/pipeline';
import { createApp } from './app.js';
import { createMailer } from './mail.js';
import { createPaywall, createTestnetPaywall } from './paywall.js';
import { DEV_TESTNET_FLAG, isProduction } from './release.js';
import { join } from 'node:path';
import { createLogoStore, startLogoSweep } from './logos.js';
import { createStore, startScheduler } from './subscriptions.js';

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
// Per network, from the environment: PRICE_EIP155_1 is the price on eip155:1, EVM_RPC_EIP155_8453 its RPC.
const perNetwork = (/** @type {string} */ prefix) =>
	Object.fromEntries(
		Object.entries(env)
			.filter(([k, v]) => k.startsWith(prefix) && v)
			.map(([k, v]) => [k.slice(prefix.length).toLowerCase().replace('_', ':'), /** @type {string} */ (v)])
	);
// A production build takes mainnet payments only and refuses to start otherwise (release.js).
const production = isProduction(env);
const paywall = await createPaywall({
	production,
	allowTestnet: env[DEV_TESTNET_FLAG] === '1',
	mode: /** @type {any} */ (env.PAYWALL ?? 'x402'),
	price: env.PRICE,
	prices: perNetwork('PRICE_'),
	subscriptionPrice: env.PRICE_SUBSCRIPTION,
	subscriptionPrices: perNetwork('PRICE_SUBSCRIPTION_'),
	networks: (env.PAY_NETWORKS ?? env.PAY_NETWORK ?? '').split(',').map((n) => n.trim()).filter(Boolean),
	payTo: env.PAY_TO,
	relayerId: env.RELAYER_ACCOUNT_ID,
	relayerKey: env.RELAYER_SECRET_KEY,
	rpcUrl: env.NEAR_RPC_URL,
	payToEvm: env.PAY_TO_EVM,
	evmRelayerKey: env.EVM_RELAYER_KEY,
	evmRpcUrls: perNetwork('EVM_RPC_'),
	alchemyKey: env.ALCHEMY_KEY,
	timeoutSeconds: env.PAY_TIMEOUT_SECONDS ? Number(env.PAY_TIMEOUT_SECONDS) : undefined,
	pingApiKey: env.PING_API_KEY,
	pingUrl: env.PING_FACILITATOR_URL,
	pingAmountOut: env.PING_AMOUNT_OUT
}).catch((/** @type {Error} */ e) => {
	console.error(`eigenbeleg API not started: ${e.message}`);
	process.exit(1);
});
// The test route (POST /testnet/eigenbeleg): testnet data for testnet USDC, beside the main
// paywall, in production too; only with TESTNET_PAY_TO (paywall.js, createTestnetPaywall).
const testnet = await createTestnetPaywall({
	payTo: env.TESTNET_PAY_TO,
	relayerId: env.TESTNET_RELAYER_ACCOUNT_ID,
	relayerKey: env.TESTNET_RELAYER_SECRET_KEY,
	rpcUrl: env.TESTNET_NEAR_RPC_URL,
	timeoutSeconds: env.PAY_TIMEOUT_SECONDS ? Number(env.PAY_TIMEOUT_SECONDS) : undefined
}).catch((/** @type {Error} */ e) => {
	console.error(`eigenbeleg API not started: ${e.message}`);
	process.exit(1);
});
// The files by mail, when a request asks: SMTP_URL and MAIL_FROM; without them the API offers no mail.
const mailer = createMailer({ smtpUrl: env.SMTP_URL, from: env.MAIL_FROM });
const deps = { nearblocksKey: env.NEARBLOCKS_API_KEY, alchemyKey: env.ALCHEMY_KEY };
// Subscriptions (#20): only with mail and SUBSCRIPTION_KEY; the files live in SUBSCRIPTION_DIR (a volume).
const subscriptions = mailer && env.SUBSCRIPTION_KEY ? createStore({ dir: env.SUBSCRIPTION_DIR ?? '/var/lib/eigenbeleg', key: env.SUBSCRIPTION_KEY }) : null;
// A preview's logo, kept for 24 hours (logos.js): in LOGO_DIR, else beside the subscriptions where
// their directory is set; with neither the preview checks a picture and keeps none.
const logoDir = env.LOGO_DIR || (env.SUBSCRIPTION_DIR ? join(env.SUBSCRIPTION_DIR, 'logos') : '');
const logos = logoDir ? createLogoStore({ dir: logoDir }) : null;
const app = createApp({ paywall, testnet, deps, source: env.SOURCE_URL, publicUrl: env.PUBLIC_URL, mailer, subscriptions, logos });
// Behind a reverse proxy (Caddy): trust its X-Forwarded-Proto, so the x402
// resource URL says https. Express's syntax: e.g. "uniquelocal" or a subnet.
if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);
const host = env.HOST ?? '127.0.0.1';
const port = Number(env.PORT ?? 4402);
app.listen(port, host, () => {
	console.log(`eigenbeleg API on http://${host}:${port} – ${production ? 'production (mainnet payments only)' : 'development'}, paywall: ${JSON.stringify(paywall.info)}, mail: ${mailer ? 'on' : 'off'}, subscriptions: ${subscriptions ? 'on' : 'off'}, preview logos: ${logos ? 'kept 24 hours' : 'not kept'}, test route: ${testnet ? JSON.stringify(testnet.info.accepts) : 'off'}`);
	if (logos) startLogoSweep({ store: logos, log: (l) => console.log(l) });
	if (subscriptions && mailer) startScheduler({ store: subscriptions, deps: { ...deps, blocks: blocksFor(deps) }, mailer, log: (l) => console.log(l), source: env.SOURCE_URL });
});
