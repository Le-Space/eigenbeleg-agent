// SPDX-License-Identifier: AGPL-3.0-or-later
// Where the documents get their fonts and colour profile: Node reads files,
// a browser fetches them (`#assets` picks the one by the "browser" condition).
// Each asset is loaded once per process or page.

import { loadAsset as platformLoad } from '#assets';

/** @type {Map<string, Promise<Uint8Array>>} */
const cache = new Map();

/** @param {string} name @returns {Promise<Uint8Array>} */
export function asset(name) {
	let p = cache.get(name);
	if (!p) {
		p = platformLoad(name);
		p.catch(() => cache.delete(name));
		cache.set(name, p);
	}
	return p;
}

export const FONTS = /** @type {const} */ (['DejaVuSansCondensed.ttf', 'DejaVuSansCondensed-Bold.ttf', 'DejaVuSansMono.ttf']);

/** The chains' marks (assets/logos, see assets/README.md): PNG on white, drawn only when a request asks for the logo. */
export const LOGOS = /** @type {Record<string, string>} */ ({ near: 'logos/near.png', akash: 'logos/akash.png', filecoin: 'logos/filecoin.png', aleph: 'logos/aleph.png' });
