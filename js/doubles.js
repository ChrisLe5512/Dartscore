// Doubles practice: everyone starts on 27 and goes round the doubles, D1 to
// D20 then the bullseye, one visit at each. Every double hit adds its value;
// a visit that hits none takes the double's value off, and at 0 or below a
// player is out. When everyone is round or out, the highest score still in
// wins the leg (a tie draws it). Pure, like game.js.

import { CLOCK_TARGETS, DARTS_PER_TURN, DEFAULT_SETTINGS, DOUBLES_START } from './config.js';
import * as Game from './game.js';
import { clampInt, endLeg, makeTurn, matchSettings, restoreMatch, restoreResults } from './match.js';

export { canAddPlayer, movePlayer, movePlayerTo, renamePlayer } from './game.js';

/**
 * State: as in game.js, plus mode: 'doubles' and results.
 *   settings: { legs, sets, practice }
 *   players: [{ id, name, score, round, out, legs, sets, turns }], round: doubles thrown at this leg
 *   turns: [{ score, made, leg, darts?, hits? }], score: points won or lost, made: doubles hit
 *   results: per leg played, the id of the player who won it, or null if drawn
 */
export const id = 'doubles';

export function normalizeSettings(settings = {}) {
	return matchSettings({ ...DEFAULT_SETTINGS, ...settings });
}

export function createGame(settings = {}) {
	return {
		mode: id, settings: normalizeSettings(settings), players: [], results: [],
		leg: 0, active: 0, starter: 0, winner: null, nextId: 1,
	};
}

const fresh = p => ({ ...p, score: DOUBLES_START, round: 0, out: false });

export function addPlayer(state, name) {
	return Game.addPlayer(state, name, { score: DOUBLES_START, round: 0, out: false });
}

/** Same players, everything else back to zero. */
export function newMatch(state, settings = state.settings) {
	return {
		...state,
		mode: id,
		settings: normalizeSettings(settings),
		players: state.players.map(p => ({ ...fresh(p), legs: 0, sets: 0, turns: [] })),
		results: [],
		leg: 0,
		active: 0,
		starter: 0,
		winner: null,
	};
}

/** Still in the leg, with doubles left to throw at. */
export const canThrow = p => !p.out && p.round < CLOCK_TARGETS.length;

/** The double a player is throwing at (25: the bullseye), or undefined when they are done. */
export const targetOf = p => (canThrow(p) ? CLOCK_TARGETS[p.round] : undefined);

/** Points for a visit at `target` that hit `made` doubles. */
export const visitPoints = (target, made) => (made ? made * target * 2 : -target * 2);

const doublesHit = (darts, target) => darts.filter(d => d.sector === target && d.multiplier === 2).length;

/** The keypad enters how many doubles the visit hit. */
export const maxInput = DARTS_PER_TURN;
export const isValidInput = n => Number.isInteger(n) && n >= 0 && n <= DARTS_PER_TURN;

/**
 * Record a visit for the active player: the darts thrown, or (from the
 * keypad, darts null) how many doubles they hit. Returns { state, event },
 * event 'turn' | 'out' | 'leg' | 'set' | 'match' | 'draw' | null.
 */
export function submitTurn(state, score, darts = null) {
	if (state.players.length === 0 || state.winner !== null) return { state, event: null };
	const before = state.players[state.active];
	if (!canThrow(before) || (!darts?.length && !isValidInput(score))) return { state, event: null };
	const target = targetOf(before);
	const made = darts?.length ? doublesHit(darts, target) : score;
	const turn = makeTurn(visitPoints(target, made), darts, state.leg);
	turn.made = made;

	const players = state.players.slice();
	const player = { ...before, score: before.score + turn.score, round: before.round + 1, turns: [...before.turns, turn] };
	if (player.score <= 0) player.out = true;
	players[state.active] = player;
	return moveOn({ ...state, players }, player.out ? 'out' : 'turn');
}

/** The next player still in after `from` (themselves last), or null when the leg is over. */
function nextThrower(players, from) {
	for (let k = 1; k <= players.length; k++) {
		const i = (from + k) % players.length;
		if (canThrow(players[i])) return i;
	}
	return null;
}

function moveOn(state, event) {
	const next = nextThrower(state.players, state.active);
	if (next !== null) return { state: { ...state, active: next }, event };
	return finishLeg(state);
}

/** The leg's winner: the one highest score among the players still in, or null. */
export function legWinner(players) {
	const scores = players.map(p => (p.out ? -Infinity : p.score));
	const best = Math.max(...scores);
	if (best === -Infinity || scores.filter(s => s === best).length > 1) return null;
	return scores.indexOf(best);
}

function finishLeg(state) {
	const winner = legWinner(state.players);
	const results = [...state.results, winner === null ? null : state.players[winner].id];
	const { state: next, event } = endLeg(state, state.players.slice(), winner, fresh);
	return { state: { ...next, results }, event };
}

/** After a change to the players: if the thrower can't throw, the next one does (or the leg ends). */
function settle(state) {
	if (state.winner !== null || !state.players.length || canThrow(state.players[state.active])) return state;
	return moveOn(state, null).state;
}

export function removePlayer(state, index) {
	return settle(Game.removePlayer(state, index));
}

/** Hand the throw to a player who is still in. */
export function setActive(state, index) {
	if (!state.players[index] || !canThrow(state.players[index])) return state;
	return Game.setActive(state, index);
}

export function restoreGame(raw) {
	if (!raw || typeof raw !== 'object') return null;
	const settings = normalizeSettings(raw.settings);
	const state = restoreMatch(raw, settings, p => ({
		score: clampInt(p.score, -999, 9999, DOUBLES_START),
		round: clampInt(p.round, 0, CLOCK_TARGETS.length, 0),
		out: Boolean(p.out),
	}));
	if (!state) return null;
	const { settings: _, players, ...rest } = state; // in the order createGame has, so a reloaded game saves the same
	return { mode: id, settings, players, results: restoreResults(raw.results, state.leg), ...rest };
}

// ---- How it shows -----------------------------------------------------------

const doubleName = target => (target === 25 ? 'Bull' : `D${target}`);
const signed = n => (n > 0 ? `+${n}` : `−${-n}`);
const percent = n => `${Math.round(n * 100)}%`;

export const scoreText = player => player.score;
export const checkoutFrom = () => null;

/** Beside the history: the double to throw at, or why there is none. */
export function hint(state, index) {
	const player = state.players[index];
	if (player.out) return { text: 'Out', muted: true };
	const target = targetOf(player);
	if (target === undefined) return { text: 'Done', muted: true };
	return { text: `\u{1F3AF} ${doubleName(target)}` };
}

/** What the darts on the board so far would score, for the darts column. */
export function dartsValue(state, darts) {
	const target = state.players[state.active] && targetOf(state.players[state.active]);
	return target === undefined ? '' : signed(visitPoints(target, doublesHit(darts, target)));
}

export const turnText = t => signed(t.score);
export const turnLabel = turnText;

export function historyMarks(turns) {
	return turns.map(t => {
		const marks = [];
		if (!t.made) marks.push('zero');
		if (t.made === DARTS_PER_TURN) marks.push('ton-forty');
		if (t.darts?.includes('B')) marks.push('bull');
		return marks;
	});
}

/** The legs a player won, for the history's leg dots. */
export const wonLegs = (state, player) => new Set(state.results.flatMap((winner, leg) => (winner === player.id ? [leg] : [])));

/** legs: legs won; made, darts: doubles hit and thrown; high: best score at the end of a leg; best: most doubles in a visit. */
export function matchStats(player, state) {
	const byLeg = new Map();
	let made = 0;
	let best = 0;
	for (const t of player.turns) {
		made += t.made ?? 0;
		best = Math.max(best, t.made ?? 0);
		byLeg.set(t.leg, (byLeg.get(t.leg) ?? DOUBLES_START) + t.score);
	}
	const darts = player.turns.length * DARTS_PER_TURN;
	return {
		legs: wonLegs(state, player).size,
		made,
		darts,
		visits: player.turns.length,
		high: byLeg.size ? Math.max(...byLeg.values()) : null,
		best,
	};
}

/** The stats line under a player: [label, value] three times. */
export function statsLine(player, state) {
	const { made, darts } = matchStats(player, state);
	return [['Hits', made], ['Darts', darts], ['Rate', darts ? percent(made / darts) : '–']];
}

export const STAT_ROWS = [
	{ label: 'Legs won', value: s => s.legs },
	{ label: 'Hit rate', value: s => (s.darts ? s.made / s.darts : null), show: percent, note: s => `${s.made}/${s.darts}` },
	{ label: 'High score', value: s => s.high },
	{ label: 'Most in a visit', value: s => (s.visits ? s.best : null) },
];

export const title = () => 'Doubles practice';
