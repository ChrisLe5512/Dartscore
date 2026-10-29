import { BOARD_RINGS, BOARD_SECTORS } from './config.js';

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

export const MISS = Object.freeze(makeDart(0, 0));

// Matches the colours of the real board: singles alternate black/white,
// doubles, trebles and bulls alternate red/green.
export function dartColor(sector, multiplier) {
	if (multiplier === 0) return 'zero';
	if (sector === 25) return multiplier === 2 ? 'red' : 'green';
	const odd = BOARD_SECTORS.indexOf(sector) % 2 === 1;
	if (multiplier === 1) return odd ? 'white' : 'black';
	return odd ? 'green' : 'red';
}

export const isDouble = dart => dart.multiplier === 2;

/**
 * Work out which dart a tap hit.
 * dx, dy: offset from the board centre in px. radius: board radius in px.
 * Returns null when the tap is outside the board.
 */
export function hitTest(dx, dy, radius) {
	const distance = Math.round(Math.hypot(dx, dy) / radius * 100);
	if (distance > BOARD_RINGS.numberRing) return null;

	if (distance <= BOARD_RINGS.bull) return makeDart(25, 2);
	if (distance <= BOARD_RINGS.outerBull) return makeDart(25, 1);

	const angle = (Math.round(Math.atan2(dy, dx) * 180 / Math.PI) + 450) % 360; // 0 = top, clockwise
	const sector = BOARD_SECTORS[Math.floor((angle + 9) / 18) % 20];

	if (distance <= BOARD_RINGS.innerSingle) return makeDart(sector, 1);
	if (distance <= BOARD_RINGS.treble) return makeDart(sector, 3);
	if (distance <= BOARD_RINGS.outerSingle) return makeDart(sector, 1);
	if (distance <= BOARD_RINGS.double) return makeDart(sector, 2);
	return makeDart(sector, 0);
}

export function isOnBoard(dx, dy, radius) {
	return Math.round(Math.hypot(dx, dy) / radius * 100) <= BOARD_RINGS.numberRing;
}
