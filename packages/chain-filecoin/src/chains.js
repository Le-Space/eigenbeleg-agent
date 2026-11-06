// SPDX-License-Identifier: AGPL-3.0-or-later
// Filecoin as the Filecoin reader needs it. A trimmed copy of the Filecoin
// entry of Le-Space/belege bridge/src/chains/registry.js (AGPL-3.0-or-later,
// as in Belege; rights holder: Le Space UG).

export const FILECOIN = {
	id: 'filecoin',
	kind: 'filecoin',
	name: 'Filecoin',
	native: { symbol: 'FIL', decimals: 18 },
	// USDFC, Secured Finance's FIL-backed stablecoin (checked 2026-10-05 against
	// Secured Finance's contract list, CoinGecko and the contract itself).
	tokens: { '0x80b98d3aa09ffff255c3ba4a241111ff1262f045': { symbol: 'USDFC', decimals: 18 } },
	// From Sushi's own config: the routers and the wrapped FIL.
	contracts: {
		'0xac4c6e212a361c968f1725b4d055b47e63f80b75': 'SushiSwap',
		'0x46b3fdf7b5cde91ac049936bf0bdb12c5d22202e': 'SushiSwap V2 (Router)',
		'0x60e1773636cf5e4a227d9ac24f20feca034ee25a': 'WFIL'
	},
	endpoints: { api: 'https://filfox.info/api/v1' },
	explorer: { name: 'Filfox', tx: 'https://filfox.info/en/message/{tx}', address: 'https://filfox.info/en/address/{address}' }
};

/** @param {{ tx: string }} explorer @param {string} tx */
export const txUrl = (explorer, tx) => explorer.tx.replace('{tx}', encodeURIComponent(tx));
/** @param {{ address: string }} explorer @param {string} address */
export const addressUrl = (explorer, address) => explorer.address.replace('{address}', encodeURIComponent(address));
