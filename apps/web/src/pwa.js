// SPDX-License-Identifier: AGPL-3.0-or-later
// Registers the service worker (public/sw.js), which keeps the app shell and
// the fonts for offline use. As in Le Space Belege, a new version waits until
// the page is reloaded, so a running document is never cut off.
export function registerServiceWorker() {
	if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
	navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
		// no offline copy; the page works the same
	});
}
