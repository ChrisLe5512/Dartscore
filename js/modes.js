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
import { matchStats, playerStats } from './stats.js';

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
	statsLine(player) {
		const { average, visits, best } = playerStats(player);
		const none = visits === 0; // nothing thrown yet
		return [['Avg', none ? '–' : average.toFixed(1)], ['Best', none ? '–' : best], ['Visits', visits]];
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

/** A new match of `mode` with the same players (names and order), all back to the start. */
export function startMatch(state, mode, settings) {
	const rules = MODES[mode] ?? X01;
	if (rules === modeOf(state)) return rules.newMatch(state, settings);
	const players = state.players.map(({ id, name }) => ({ id, name }));
	return rules.newMatch({ ...rules.createGame(settings), players, nextId: state.nextId }, settings);
}

/** The legs a player won (for the history's dots), or null where the visit that won a leg says so. */
export const wonLegs = (state, player) => modeOf(state).wonLegs?.(state, player) ?? null;

// The New game screen's choices: X01 by its start score, then the practice
// games (with around the clock's variants). Each choice is a mode and the
// settings it sets; note says in a few words what it is.
export const GAME_CHOICES = Object.freeze([
	...START_SCORES.map(score => ({ value: String(score), label: String(score), group: 'X01', mode: 'x01', settings: { startScore: score } })),
	{ value: 'clock', label: 'Around the clock', note: '1 to 20, then the bull', group: 'Practice', mode: 'clock', settings: { ring: 'any' } },
	{ value: 'clock-double', label: 'Around the clock', note: 'Doubles only', group: 'Practice', mode: 'clock', settings: { ring: 'double' } },
	{ value: 'clock-treble', label: 'Around the clock', note: 'Trebles only', group: 'Practice', mode: 'clock', settings: { ring: 'treble' } },
	{ value: 'doubles', label: 'Doubles practice', note: 'From 27, D1 to the bull', group: 'Practice', mode: 'doubles', settings: {} },
	{ value: '121', label: '121 checkout', note: 'Nine darts each target', group: 'Practice', mode: '121', settings: {} },
]);

/** The New game choice for a game being played. */
export function choiceOf(state) {
	const mode = modeOf(state).id;
	return GAME_CHOICES.find(choice => choice.mode === mode
		&& Object.entries(choice.settings).every(([key, value]) => state.settings[key] === value)) ?? GAME_CHOICES[0];
}
