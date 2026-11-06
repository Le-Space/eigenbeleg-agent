// SPDX-License-Identifier: AGPL-3.0-or-later
// Build-time settings (Vite env, set when building; see apps/web/vite.config.js).

/**
 * The CORS proxy in front of the Akash Console indexer (deploy/akash-proxy),
 * e.g. https://eigenbeleg-akash-proxy.<account>.workers.dev. Unset: Akash is
 * read only as far back as the public node keeps it.
 * @type {string | null}
 */
export const AKASH_INDEXER = import.meta.env?.VITE_AKASH_INDEXER || null;
