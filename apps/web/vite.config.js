// SPDX-License-Identifier: AGPL-3.0-or-later
// The UI is served by the API at /ui/ (same origin: no CORS, the PAYMENT-*
// headers are readable). `npm run web:dev` proxies the API on :4402.
import { defineConfig } from 'vite';

const api = process.env.API_URL ?? 'http://127.0.0.1:4402';

export default defineConfig({
	base: '/ui/',
	build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 2000 },
	server: { proxy: { '/blocks': api, '/eigenbeleg': api, '/health': api } }
});
