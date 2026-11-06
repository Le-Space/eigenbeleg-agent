# Akash Console CORS proxy

The web UI reads every chain from the browser. The Akash Console indexer
(`console-api.akash.network`) sends no `Access-Control-Allow-Origin`, so a
browser may not read it; this Cloudflare Worker forwards exactly what the Akash
reader needs and adds CORS for the UI's origins.

- **Forwards** only `GET /v1/addresses/<akash1…>/transactions/<skip>/<limit>`
  and `GET /v1/transactions/<hash>`, no query string; everything else is 404
  without a request upstream.
- **Answers** only the origins in `ALLOWED_ORIGINS` (`wrangler.toml`).
- **Keeps nothing:** no logs (observability off), `cache-control: no-store`,
  only the content type is passed on from upstream. The Akash address in the
  path passes through and is gone with the response.
- **Rate limit:** 60 requests a minute per IP (Workers rate limiting binding).

Do: `npx wrangler deploy` in this folder, with `CLOUDFLARE_API_TOKEN` set
("Workers Scripts: Edit"). See: the URL it prints; then
`curl -H 'Origin: https://eigenbeleg.le-space.de' <url>/v1/transactions/<hash>`
answers with `access-control-allow-origin`, and the same without the header
answers 403. The web UI takes the URL at build time as `VITE_AKASH_INDEXER`.

Test: `node --test deploy/akash-proxy/test/worker.test.js` (part of `npm test`).
