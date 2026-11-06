// SPDX-License-Identifier: AGPL-3.0-or-later
// A CORS proxy for the Akash Console indexer (console-api.akash.network), the
// one data source the web UI cannot read from a browser: it sends no
// Access-Control-Allow-Origin. A Cloudflare Worker (issue #5).
//
// It forwards only the two read paths the Akash reader uses
// (packages/chain-cosmos/src/vendor/akash-console.js), only GET, only for the
// origins in ALLOWED_ORIGINS. It keeps nothing: no logging, no cache
// (`no-store`), observability off in wrangler.toml. The address in the path
// passes through and is gone with the response. A rate limit per IP applies
// when the LIMITER binding is there.

const UPSTREAM = 'https://console-api.akash.network';
const PATHS = [/^\/v1\/addresses\/akash1[02-9ac-hj-np-z]{38,58}\/transactions\/\d{1,6}\/\d{1,3}$/, /^\/v1\/transactions\/[0-9A-Fa-f]{64}$/];

/**
 * @param {Request} request
 * @param {{ ALLOWED_ORIGINS?: string, LIMITER?: { limit: (o: { key: string }) => Promise<{ success: boolean }> } }} env
 * @param {unknown} [_ctx]
 * @param {typeof fetch} [upstream] for tests
 * @returns {Promise<Response>}
 */
export async function handle(request, env, _ctx, upstream = fetch) {
	const allowed = new Set(
		String(env.ALLOWED_ORIGINS ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
	);
	const origin = request.headers.get('origin') ?? '';
	const cors = allowed.has(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : { vary: 'Origin' };
	const reply = (/** @type {number} */ status, /** @type {string} */ body) => new Response(body, { status, headers: { ...cors, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

	if (!allowed.has(origin)) return reply(403, 'origin not allowed');
	if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET', 'access-control-max-age': '86400' } });
	if (request.method !== 'GET') return reply(405, 'GET only');
	const url = new URL(request.url);
	if (url.search || !PATHS.some((p) => p.test(url.pathname))) return reply(404, 'not a path this proxy forwards');
	if (env.LIMITER) {
		const ip = request.headers.get('cf-connecting-ip') ?? '';
		if (!(await env.LIMITER.limit({ key: ip })).success) return reply(429, 'too many requests, try again in a minute');
	}
	const res = await upstream(UPSTREAM + url.pathname, { headers: { accept: 'application/json' } });
	return new Response(res.body, { status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' } });
}

export default { fetch: (/** @type {Request} */ r, /** @type {any} */ env, /** @type {any} */ ctx) => handle(r, env, ctx) };
