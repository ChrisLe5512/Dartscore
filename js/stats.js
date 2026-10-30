// Match stats for the stats line and the match summary. Pure: reads a
// player's turns and the match settings, no DOM.

import { canCheckout } from './checkout.js';

// Only the visit that wins a leg can take fewer than three darts: any other
// visit used all three, however many of them were tapped on the board.
const dartsIn = t => (t.checkout ? t.darts?.length || 3 : 3);

/** The stats line: three-dart average, best visit, visits. */
export function playerStats(player) {
	let points = 0;
	let darts = 0;
	let best = 0;
	for (const t of player.turns) {
		points += t.score;
		darts += dartsIn(t);
		best = Math.max(best, t.score);
	}
	return { average: darts ? points / darts * 3 : 0, darts, visits: player.turns.length, best };
}

/**
 * A player's turns split into legs, in order. A leg ends when the turn's leg
 * changes, or after the player wins it (turns saved before legs were
 * recorded have no leg).
 */
function legsOf(turns) {
	const legs = [];
	let current = null;
	for (const t of turns) {
		if (!current || current.done || (t.leg !== undefined && t.leg !== current.leg)) {
			current = { leg: t.leg, turns: [], done: false };
			legs.push(current);
		}
		current.turns.push(t);
		if (t.checkout) current.done = true;
	}
	return legs;
}

/**
 * Everything in the match summary, for one player:
 * - average, first9: three-dart averages, over every visit and over each leg's first three
 * - finishes, chances: legs won, and visits started on a score they could finish
 *   (so checkout % is finishes / chances)
 * - bestLeg: fewest darts in a leg won; highFinish: biggest winning visit
 * - tons: visits of 100-139, 140-179 and 180
 */
export function matchStats(player, settings) {
	const line = playerStats(player);
	let first9Points = 0;
	let first9Darts = 0;
	let finishes = 0;
	let chances = 0;
	let bestLeg = null;
	let highFinish = null;
	const tons = { 100: 0, 140: 0, 180: 0 };

	for (const leg of legsOf(player.turns)) {
		let remaining = settings.startScore;
		let darts = 0;
		leg.turns.forEach((t, i) => {
			if (i < 3) {
				first9Points += t.score;
				first9Darts += dartsIn(t);
			}
			if (canCheckout(remaining, 3, settings.doubleOut)) chances++;
			darts += dartsIn(t);
			remaining -= t.score;
			if (t.checkout) {
				finishes++;
				bestLeg = Math.min(bestLeg ?? Infinity, darts);
				highFinish = Math.max(highFinish ?? 0, t.score);
			}
			if (t.score === 180) tons[180]++;
			else if (t.score >= 140) tons[140]++;
			else if (t.score >= 100) tons[100]++;
		});
	}

	return {
		...line,
		first9: first9Darts ? first9Points / first9Darts * 3 : 0,
		finishes,
		chances,
		bestLeg,
		highFinish,
		tons,
	};
}
