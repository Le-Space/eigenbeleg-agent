// Ported from Le-Space/belege bridge/src/chains/cosmos.js (unitsToDecimal only) at ed7f5f5 (AGPL-3.0 there).
// Relicensed under MIT for this repository by the rights holder, Le Space UG, on 2026-11-06.
// Pre-hackathon code (baseline); see the README.

export function unitsToDecimal(units, decimals) {
	const negative = units < 0n;
	const digits = (negative ? -units : units).toString().padStart(decimals + 1, '0');
	const int = digits.slice(0, digits.length - decimals);
	const frac = digits.slice(digits.length - decimals).replace(/0+$/, '');
	return `${negative ? '-' : ''}${int}${frac ? `.${frac}` : ''}`;
}
