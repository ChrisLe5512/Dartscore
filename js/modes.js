// The game modes. Each is a pure rules module (X01 is game.js), and each also
// says how it shows: the big number, the stats line, the history and the
// match stats. The app asks the mode of the game being played for both, so
// adding a mode (cricket, say) means a new module here, not changes to the app.

import { MAX_TURN_SCORE, START_SCORES } from './config.js';
import * as Clock from './clock.js';
import * as Doubles from './doubles.js';
import { historyMarks } from './feedback.js';
import * as Game from './game.js';
import * as One21 from './one21.js';
import { legDarts, matchStats } from './stats.js';

// X01's rules are game.js; how it shows is here, so game.js stays rules only.
const X01 = {
	...Game,
	id: 'x01',
	maxInput: MAX_TURN_SCORE,
	isValidInput: Game.isValidTurnScore,
	OPTIONS: [],
	scoreText: player => player.score,
	checkoutFrom: player => player.score,
	hint: () => null,
	dartsValue: (state, darts) => darts.reduce((sum, d) => sum + d.value, 0),
	turnText: t => t.score,
	turnLabel: t => t.score,
	historyMarks,
	matchStats: (player, state) => matchStats(player, state.settings),
	// The average and checkout rate (CO) are over the match; the darts, as it says, this leg's.
	statsLine(player, state) {
		const { average, visits, finishes, chances } = matchStats(player, state.settings);
		return [
			['Avg', visits ? average.toFixed(1) : '–'],
			['CO', chances ? `${Math.round(finishes / chances * 100)}%` : '–'],
			['Leg darts', legDarts(player, state.leg)],
		];
	},
	// One line per stat. value: the number (null for none yet); show: how it
	// reads; note: small print after it; low: the lowest leads.
	STAT_ROWS: [
		{ label: 'Legs won', value: s => s.finishes },
		{ label: '3-dart average', value: s => (s.visits ? s.average : null), show: n => n.toFixed(1) },
		{ label: 'First 9 average', value: s => (s.visits ? s.first9 : null), show: n => n.toFixed(1) },
		{ label: 'Checkout', value: s => (s.chances ? s.finishes / s.chances : null), show: n => `${Math.round(n * 100)}%`, note: s => `${s.finishes}/${s.chances}` },
		{ label: 'Best leg', value: s => s.bestLeg, show: n => `${n} darts`, low: true },
		{ label: 'High finish', value: s => s.highFinish },
		{ label: '180s', value: s => s.tons[180] },
		{ label: '140+', value: s => s.tons[140] },
		{ label: '100+', value: s => s.tons[100] },
	],
	title: settings => String(settings.startScore),
};

export const MODES = Object.freeze({ x01: X01, clock: Clock, doubles: Doubles, 121: One21 });

/** The rules (and look) of a game; a game without a mode is X01, as every game saved before modes was. */
export const modeOf = state => MODES[state?.mode] ?? X01;

/** A new game: X01 with the default settings. */
export const createGame = () => X01.createGame();

/** Repair anything loaded from storage, whichever mode it is; null if it is unusable. */
export const restoreGame = raw => modeOf(raw).restoreGame(raw);

/** The legs a player won (for the history's dots), or null where the visit that won a leg says so. */
export const wonLegs = (state, player) => modeOf(state).wonLegs?.(state, player) ?? null;

// The New game screen's choices: X01 by its start score, then the practice
// games (with around the clock's variants). Each choice is a mode and the
// settings it sets; note says in a few words what it is.
export const GAME_CHOICES = Object.freeze([
	...START_SCORES.map(score => ({ value: String(score), label: String(score), group: 'X01', mode: 'x01', settings: { startScore: score } })),
	{ value: 'clock', label: 'Around the clock', note: '1 to 20, then the bull', group: 'Practice', mode: 'clock', settings: {} },
	{ value: 'doubles', label: 'Doubles practice', note: 'From 27, D1 to the bull', group: 'Practice', mode: 'doubles', settings: {} },
	{ value: '121', label: '121 checkout', note: 'Nine darts each target', group: 'Practice', mode: '121', settings: {} },
]);

/**
 * A new game of `mode` with these players (names, in order), everything at
 * the start. Players of `from` (the game it replaces) who play again keep
 * their id, so an undo can tell who came and went.
 */
export function newGame(mode, settings, names, from = null) {
	const rules = MODES[mode] ?? X01;
	const earlier = [...(from?.players ?? [])];
	let state = { ...rules.createGame(settings), nextId: from?.nextId ?? 1 };
	for (const name of names) {
		state = rules.addPlayer(state, name);
		const added = state.players.at(-1);
		const same = earlier.findIndex(p => p.name === added.name);
		if (same < 0) continue;
		const [{ id }] = earlier.splice(same, 1);
		state = { ...state, players: state.players.map(p => (p === added ? { ...p, id } : p)) };
	}
	return state;
}

/** The New game choice for a game being played. */
export function choiceOf(state) {
	const mode = modeOf(state).id;
	return GAME_CHOICES.find(choice => choice.mode === mode
		&& Object.entries(choice.settings).every(([key, value]) => state.settings[key] === value)) ?? GAME_CHOICES[0];
}
