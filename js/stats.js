// Match stats for the stats line and the match summary. Pure: reads a
// player's turns and the match settings, no DOM.

import { canCheckout } from './checkout.js';
import { dartsIn } from './match.js';

/** Darts the player has thrown in a leg. */
export const legDarts = (player, leg) => player.turns.filter(t => t.leg === leg).reduce((sum, t) => sum + dartsIn(t), 0);

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
	let points = 0;
	let darts = 0;
	let first9Points = 0;
	let first9Darts = 0;
	let finishes = 0;
	let chances = 0;
	let bestLeg = null;
	let highFinish = null;
	const tons = { 100: 0, 140: 0, 180: 0 };

	for (const leg of legsOf(player.turns)) {
		let remaining = settings.startScore;
		let inLeg = 0;
		leg.turns.forEach((t, i) => {
			if (i < 3) {
				first9Points += t.score;
				first9Darts += dartsIn(t);
			}
			if (canCheckout(remaining, 3, settings.doubleOut)) chances++;
			inLeg += dartsIn(t);
			points += t.score;
			darts += dartsIn(t);
			remaining -= t.score;
			if (t.checkout) {
				finishes++;
				bestLeg = Math.min(bestLeg ?? Infinity, inLeg);
				highFinish = Math.max(highFinish ?? 0, t.score);
			}
			if (t.score === 180) tons[180]++;
			else if (t.score >= 140) tons[140]++;
			else if (t.score >= 100) tons[100]++;
		});
	}

	return {
		average: darts ? points / darts * 3 : 0,
		visits: player.turns.length,
		first9: first9Darts ? first9Points / first9Darts * 3 : 0,
		finishes,
		chances,
		bestLeg,
		highFinish,
		tons,
	};
}
