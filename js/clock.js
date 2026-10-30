// Around the clock: hit 1, 2, 3 … 20 in order, then the bull. The first
// player round wins the leg. With skip (any bed counts), a double moves you on
// two targets and a treble three. Pure, like game.js: every function takes a
// state and returns a new one.

import { CLOCK_RINGS, CLOCK_TARGETS, DARTS_PER_TURN, DEFAULT_SETTINGS } from './config.js';
import * as Game from './game.js';
import { clampInt, endLeg, makeTurn, matchSettings, nextIndex, restoreMatch } from './match.js';

export { canAddPlayer, movePlayer, movePlayerTo, removePlayer, renamePlayer, setActive } from './game.js';

/**
 * State: as in game.js, plus mode: 'clock'.
 *   settings: { ring, skip, legs, sets, practice }, ring: the beds that count, one of CLOCK_RINGS
 *   players: [{ id, name, step, legs, sets, turns }], step: targets passed so far this leg
 *   turns: [{ score, leg, darts?, hits?, checkout? }], score: targets the visit moved on
 */
export const id = 'clock';

export function normalizeSettings(settings = {}) {
	const s = { ...DEFAULT_SETTINGS, ...settings };
	const ring = CLOCK_RINGS.includes(s.ring) ? s.ring : CLOCK_RINGS[0];
	return { ring, skip: ring === 'any' && Boolean(s.skip), ...matchSettings(s) };
}

export function createGame(settings = {}) {
	return { mode: id, settings: normalizeSettings(settings), players: [], leg: 0, active: 0, starter: 0, winner: null, nextId: 1 };
}

export function addPlayer(state, name) {
	return Game.addPlayer(state, name, { step: 0 });
}

/** Same players, everything else back to zero. */
export function newMatch(state, settings = state.settings) {
	return {
		...state,
		mode: id,
		settings: normalizeSettings(settings),
		players: state.players.map(p => ({ ...p, step: 0, legs: 0, sets: 0, turns: [] })),
		leg: 0,
		active: 0,
		starter: 0,
		winner: null,
	};
}

/** Whether a dart counts for the target. The bull has no treble, so either bull counts there. */
export function counts(dart, target, ring) {
	if (!dart || dart.sector !== target || !(dart.multiplier > 0)) return false;
	if (ring === 'double') return dart.multiplier === 2;
	if (ring === 'treble') return target === 25 || dart.multiplier === 3;
	return true;
}

/** How many targets these darts move on, in order, starting from `step` (with skip, a double is two and a treble three). */
export function hitsFrom(step, darts, ring, skip = false) {
	let hits = 0;
	for (const dart of darts) {
		const target = CLOCK_TARGETS[step + hits];
		if (target === undefined) break;
		if (counts(dart, target, ring)) hits += skip ? dart.multiplier : 1;
	}
	return Math.min(hits, CLOCK_TARGETS.length - step);
}

/**
 * Each game's own options, shown on the New game screen: a checkbox, or with
 * type 'choice' one of `choices` ([value, label]). applies: whether it means
 * anything with these settings (hidden when not).
 */
export const OPTIONS = [
	{ key: 'ring', label: 'Counts', type: 'choice', choices: [['any', 'Any bed'], ['double', 'Doubles'], ['treble', 'Trebles']], title: 'Which beds count for the target: any, only its double, or only its treble. For the bull: the bullseye with doubles, either bull with trebles.' },
	{ key: 'skip', label: 'Skip ahead', title: 'A double moves you on two targets and a treble three, so a good visit can skip ahead. Any bed only.', applies: s => s.ring === 'any' },
];

/** The keypad enters how many targets the visit moved on: one per dart, or with skip up to three. */
export const maxInput = DARTS_PER_TURN;
export const inputMax = state => (state.settings.skip ? DARTS_PER_TURN * 3 : DARTS_PER_TURN);
export const isValidInput = (n, state) => Number.isInteger(n) && n >= 0 && n <= (state ? inputMax(state) : maxInput);

/**
 * Record a visit for the active player: the darts thrown, or (from the
 * keypad, darts null) how many targets they hit. Returns { state, event },
 * event 'turn' | 'leg' | 'set' | 'match' | null (nothing happened).
 */
export function submitTurn(state, score, darts = null) {
	if (state.players.length === 0 || state.winner !== null) return { state, event: null };
	if (!darts?.length && !isValidInput(score, state)) return { state, event: null };
	const before = state.players[state.active];
	const left = CLOCK_TARGETS.length - before.step;
	const { ring, skip } = state.settings;
	const hits = Math.min(left, darts?.length ? hitsFrom(before.step, darts, ring, skip) : score);
	const turn = makeTurn(hits, darts, state.leg);
	if (hits === left) turn.checkout = true;

	const players = state.players.slice();
	players[state.active] = { ...before, step: before.step + hits, turns: [...before.turns, turn] };
	if (!turn.checkout) {
		return { state: { ...state, players, active: nextIndex(state.active, players.length) }, event: 'turn' };
	}
	return endLeg(state, players, state.active, p => ({ ...p, step: 0 }));
}

export function restoreGame(raw) {
	if (!raw || typeof raw !== 'object') return null;
	const settings = normalizeSettings(raw.settings);
	const state = restoreMatch(raw, settings, p => ({ step: clampInt(p.step, 0, CLOCK_TARGETS.length, 0) }));
	return state && { mode: id, ...state };
}

// ---- How it shows -----------------------------------------------------------

const RING_PREFIX = { any: '', double: 'D', treble: 'T' };

/** The target a player is on, as it reads on the scoreboard: 7, D7, Bull; ✓ once round. */
export function targetLabel(step, ring) {
	const target = CLOCK_TARGETS[step];
	if (target === undefined) return '✓';
	if (target === 25) return ring === 'double' ? 'DB' : 'Bull';
	return `${RING_PREFIX[ring] ?? ''}${target}`;
}

export const scoreText = (player, state) => targetLabel(player.step, state.settings.ring);
export const checkoutFrom = () => null;
export const hint = () => null;

/** What the darts on the board so far would hit, for the darts column. */
export function dartsValue(state, darts) {
	const player = state.players[state.active];
	return player ? hitsFrom(player.step, darts, state.settings.ring, state.settings.skip) : 0;
}

export const turnText = t => t.score;
export const turnLabel = t => `${t.score} target${t.score === 1 ? '' : 's'}`;

export function historyMarks(turns) {
	return turns.map(t => {
		const marks = [];
		if (t.score === 0) marks.push('zero');
		if (t.score >= DARTS_PER_TURN) marks.push('ton-forty');
		if (t.checkout) marks.push('finish');
		if (t.darts?.includes('B')) marks.push('bull');
		return marks;
	});
}

// Only the visit that goes round can take fewer than three darts.
const dartsIn = t => (t.checkout ? t.darts?.length || DARTS_PER_TURN : DARTS_PER_TURN);
const percent = n => `${Math.round(n * 100)}%`;

/** legs: legs won; hits: targets moved on; darts; bestLeg: fewest darts to go round; threes: visits that moved three or more. */
export function matchStats(player) {
	let hits = 0;
	let darts = 0;
	let legs = 0;
	let threes = 0;
	let bestLeg = null;
	let legDarts = 0;
	let leg;
	for (const t of player.turns) {
		if (t.leg !== leg) [leg, legDarts] = [t.leg, 0];
		hits += t.score;
		darts += dartsIn(t);
		legDarts += dartsIn(t);
		if (t.score >= DARTS_PER_TURN) threes++;
		if (t.checkout) {
			legs++;
			bestLeg = Math.min(bestLeg ?? Infinity, legDarts);
		}
	}
	return { hits, darts, visits: player.turns.length, legs, threes, bestLeg };
}

// With skip a dart can move on more than one target, so the rate is per dart, not a percentage.
const rate = (n, settings) => (settings.skip ? n.toFixed(2) : percent(n));

/** The stats line under a player: [label, value] three times. */
export function statsLine(player, state) {
	const { hits, darts } = matchStats(player);
	const { skip } = state.settings;
	return [[skip ? 'Moved' : 'Hits', hits], ['Darts', darts], [skip ? 'Per dart' : 'Rate', darts ? rate(hits / darts, state.settings) : '–']];
}

export const STAT_ROWS = [
	{ label: 'Legs won', value: s => s.legs },
	{ label: settings => (settings.skip ? 'Targets per dart' : 'Hit rate'), value: s => (s.darts ? s.hits / s.darts : null), show: rate, note: s => `${s.hits}/${s.darts}` },
	{ label: 'Best leg', value: s => s.bestLeg, show: n => `${n} darts`, low: true },
	{ label: 'Three in a visit', value: s => s.threes },
];

const RING_NAMES = { any: '', double: ': doubles', treble: ': trebles' };
export const title = settings => `Around the clock${RING_NAMES[settings.ring] ?? ''}`;
