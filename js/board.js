import { BOARD_BULLS, BOARD_LAYOUT, BOARD_LAYOUT_LIMITS, BOARD_SECTORS } from './config.js';

/**
 * A single dart: { sector, multiplier, value, label, color }
 *  - sector: 1-20, or 25 for the bull (multiplier 2 = bullseye)
 *  - multiplier: 0 (miss), 1, 2 or 3
 *  - color: the CSS class used to paint the dart chip
 */

export function makeDart(sector, multiplier) {
	const value = sector * multiplier;
	let label;
	if (multiplier === 0) label = '0';
	else if (sector === 25) label = multiplier === 2 ? 'B' : 'OB';
	else label = (multiplier === 2 ? 'D' : multiplier === 3 ? 'T' : '') + sector;
	return { sector, multiplier, value, label, color: dartColor(sector, multiplier) };
}

// Matches the colours of the real board: singles alternate black/white,
// doubles, trebles and bulls alternate red/green.
export function dartColor(sector, multiplier) {
	if (multiplier === 0) return 'zero';
	if (sector === 25) return multiplier === 2 ? 'red' : 'green';
	const odd = BOARD_SECTORS.indexOf(sector) % 2 === 1;
	if (multiplier === 1) return odd ? 'white' : 'black';
	return odd ? 'green' : 'red';
}

// ---- Geometry ----------------------------------------------------------------

/** A layout value clamped to its limits, or the default when missing. */
function layoutValue(layout, key) {
	const [min, max] = BOARD_LAYOUT_LIMITS[key];
	const n = Number(layout?.[key]);
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : BOARD_LAYOUT[key];
}

/**
 * Ring edges (outer radius of each ring, in % of the board radius) from a
 * layout like BOARD_LAYOUT. Values are clamped. One ring width sets the treble,
 * the double and the bulls alike, and the treble sits midway between the outer
 * bull and the double, so the two single beds match.
 */
export function boardRings(layout = BOARD_LAYOUT) {
	const width = layoutValue(layout, 'ring');
	const double = 100 - layoutValue(layout, 'legend');
	const outerSingle = double - width;
	const outerBull = width * BOARD_BULLS.outerBull;
	const trebleAt = (outerBull + outerSingle - width) / 2;
	return { bull: width * BOARD_BULLS.bull, outerBull, innerSingle: trebleAt, treble: trebleAt + width, outerSingle, double, numberRing: 100 };
}

export const DEFAULT_RINGS = Object.freeze(boardRings());

// Inside out: each ring's name and what a dart there scores.
export const RINGS = Object.freeze([
	['bull', 2], ['outerBull', 1], ['innerSingle', 1], ['treble', 3],
	['outerSingle', 1], ['double', 2], ['numberRing', 0],
]);

/**
 * Where a point lands: { sector, ring } with ring one of the RINGS names
 * (sector 25 for the bulls, 0 for the number ring, which is one miss zone
 * all round), or null outside the board.
 * dx, dy: offset from the board centre. radius: board radius, same units.
 */
export function locate(dx, dy, radius, rings = DEFAULT_RINGS) {
	const distance = Math.hypot(dx, dy) / radius * 100;
	const ring = RINGS.find(([name]) => distance <= rings[name])?.[0];
	if (!ring) return null;
	if (ring === 'bull' || ring === 'outerBull') return { sector: 25, ring };
	if (ring === 'numberRing') return { sector: 0, ring };
	const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360; // 0 = top, clockwise
	return { sector: BOARD_SECTORS[Math.floor((angle + 9) / 18) % 20], ring };
}

/**
 * Work out which dart a tap hit, or null when the tap is outside the board.
 * dx, dy: offset from the board centre in px. radius: board radius in px.
 */
export function hitTest(dx, dy, radius, rings = DEFAULT_RINGS) {
	const spot = locate(dx, dy, radius, rings);
	if (!spot) return null;
	const multiplier = RINGS.find(([name]) => name === spot.ring)[1];
	return makeDart(spot.sector, multiplier);
}

/** A dart in a random scoring bed, with where it landed (as a fraction of the radius). */
export function randomDart(rings = DEFAULT_RINGS, random = Math.random) {
	for (;;) {
		const angle = random() * 2 * Math.PI;
		const reach = Math.sqrt(random()); // even over the board's area, not bunched at the middle
		const [x, y] = [Math.cos(angle) * reach, Math.sin(angle) * reach];
		const dart = hitTest(x, y, 1, rings);
		if (dart?.value > 0) return { ...dart, x, y };
	}
}
