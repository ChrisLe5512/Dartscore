// 121: check out 121 in three visits (nine darts). Check out and the next
// target is one higher; miss and you try the same number again (or, with
// dropBack, go back to the last number you checked out). Each player
// throws all their visits at a target before the next player's turn. After
// ten targets each, the highest target reached wins the leg (a tie draws it).
// Busts work as in X01. Pure, like game.js.

import { DEFAULT_SETTINGS, MAX_TURN_SCORE, ONE21 } from './config.js';
import * as Game from './game.js';
import { historyMarks as x01Marks } from './feedback.js';
import { clampInt, dartsIn, dartsSum, makeTurn, matchSettings, percent } from './match.js';
import { roundsGame } from './rounds.js';

export { canAddPlayer, movePlayer, movePlayerTo, renamePlayer } from './game.js';

/**
 * State: as in game.js, plus mode: '121' and results.
 *   settings: { legs, sets, doubleOut, practice, dropBack }
 *   players: [{ id, name, score, target, safe, visit, round, legs, sets, turns }]
 *     score: what is left of the target; safe: the last target checked out (0: none yet);
 *     visit: visits thrown at the target; round: targets played this leg
 *   turns: as in X01, plus target (on a checkout: the target it finished)
 *     and missed (the last visit at a target that wasn't checked out)
 *   results: per leg played, the id of the player who won it, or null if drawn
 */
export const id = '121';

export function normalizeSettings(settings = {}) {
	const s = { ...DEFAULT_SETTINGS, ...settings };
	const { legs, sets, practice } = matchSettings(s);
	return { legs, sets, doubleOut: Boolean(s.doubleOut), practice, dropBack: Boolean(s.dropBack) };
}

export const OPTIONS = [
	{ key: 'dropBack', label: 'Drop back on a miss', title: 'Three visits without a checkout send you back to the last target you checked out (121 if none yet), instead of trying the same one again.' },
];

/** Targets left to play this leg. */
export const canThrow = p => p.round < ONE21.rounds;

const rules = roundsGame({
	id,
	normalizeSettings,
	start: Object.freeze({ score: ONE21.start, target: ONE21.start, safe: 0, visit: 0, round: 0 }),
	canThrow,
	legWinner,
	restorePlayer(p) {
		const target = clampInt(p.target, ONE21.start, ONE21.start + ONE21.rounds, ONE21.start);
		const safe = clampInt(p.safe, 0, ONE21.start + ONE21.rounds - 1, 0);
		return {
			score: clampInt(p.score, 0, target, target),
			target,
			safe: safe >= ONE21.start ? safe : 0,
			visit: clampInt(p.visit, 0, ONE21.visits - 1, 0),
			round: clampInt(p.round, 0, ONE21.rounds, 0),
		};
	},
});
const { moveOn } = rules;
export const { createGame, addPlayer, newMatch, removePlayer, setActive, restoreGame, wonLegs } = rules;

export const maxInput = MAX_TURN_SCORE;
export const isValidInput = Game.isValidTurnScore;

/**
 * Record a visit for the active player, as in X01. Returns { state, event },
 * event 'turn' | 'bust' | 'checkout' | 'missed' | 'leg' | 'set' | 'match' | 'draw' | null.
 * 'checkout' and 'missed' end a target; the player throws on until one does.
 */
export function submitTurn(state, score, darts = null) {
	if (state.players.length === 0 || state.winner !== null) return { state, event: null };
	const before = state.players[state.active];
	if (!canThrow(before) || !Game.isValidTurnScore(score)) return { state, event: null };

	let turn = makeTurn(score, darts, state.leg);
	let player = { ...before, visit: before.visit + 1 };
	let event = 'turn';
	if (Game.isBust(state, score, darts)) {
		turn = { ...turn, score: 0, bust: true, attempted: score };
		event = 'bust';
	} else {
		player.score -= score;
	}

	if (player.score === 0) {
		turn.checkout = true;
		turn.target = before.target;
		player = { ...player, target: before.target + 1, safe: before.target };
		event = 'checkout';
	} else if (player.visit >= ONE21.visits) {
		turn.missed = true;
		event = 'missed';
		if (state.settings.dropBack) player = { ...player, target: player.safe || ONE21.start };
	}
	player.turns = [...before.turns, turn];
	const players = state.players.slice();
	players[state.active] = player;
	if (event !== 'checkout' && event !== 'missed') return { state: { ...state, players }, event };

	// On to the next target, and the next player.
	players[state.active] = { ...player, score: player.target, visit: 0, round: player.round + 1 };
	return moveOn({ ...state, players }, event);
}

/** The leg's winner: the one player on the highest target, or null. */
export function legWinner(players) {
	const best = Math.max(...players.map(p => p.target));
	const top = players.filter(p => p.target === best);
	return top.length === 1 ? players.indexOf(top[0]) : null;
}

// ---- How it shows -----------------------------------------------------------

export const scoreText = player => player.score;

/** Beside the score when the stats line has no room: the target it is left of. */
export const scoreNote = player => `/${player.target}`;

/** What checkout suggestions start from: what is left of the target. */
export const checkoutFrom = player => (canThrow(player) ? player.score : null);
export const hint = () => null;

export const dartsValue = (state, darts) => dartsSum(darts);
export const turnText = t => t.score;
export const turnLabel = turnText;
export const historyMarks = x01Marks;

/** legs won; checkouts out of targets played; top: highest target checked out; average: three-dart average. */
export function matchStats(player, state) {
	let points = 0;
	let darts = 0;
	let checkouts = 0;
	let targets = 0;
	let top = null;
	for (const t of player.turns) {
		points += t.score;
		darts += dartsIn(t);
		if (t.checkout) {
			checkouts++;
			top = Math.max(top ?? 0, t.target ?? 0);
		}
		if (t.checkout || t.missed) targets++;
	}
	return {
		legs: wonLegs(state, player).size,
		checkouts,
		targets,
		top,
		average: darts ? points / darts * 3 : 0,
		visits: player.turns.length,
	};
}

/** The stats line under a player: [label, value] three times. */
export function statsLine(player) {
	const round = Math.min(player.round + 1, ONE21.rounds);
	return [['Target', player.target], ['Visit', `${player.visit + 1}/${ONE21.visits}`], ['Round', `${round}/${ONE21.rounds}`]];
}

export const STAT_ROWS = [
	{ label: 'Legs won', value: s => s.legs },
	{ label: 'Checkouts', value: s => (s.targets ? s.checkouts / s.targets : null), show: percent, note: s => `${s.checkouts}/${s.targets}` },
	{ label: 'Top checkout', value: s => s.top },
	{ label: '3-dart average', value: s => (s.visits ? s.average : null), show: n => n.toFixed(1) },
];

export const title = () => '121';
