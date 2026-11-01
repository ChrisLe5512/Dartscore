// Pure game state for X01. Every function takes a state and returns a new one,
// so the UI can keep snapshots for undo/redo and save them as JSON.

import { DEFAULT_SETTINGS, IMPOSSIBLE_TURN_SCORES, MAX_PLAYERS, MAX_TURN_SCORE, START_SCORES } from './config.js';
import { isDouble } from './board.js';
import { canCheckout } from './checkout.js';
import { clampInt, cleanName, endLeg, makeTurn, matchSettings, nextIndex, restoreMatch } from './match.js';

/**
 * State shape:
 * {
 *   settings: { startScore, legs, sets, doubleOut, practice },
 *     legs, sets: first to this many; practice: legs go on with no sets and no winner
 *   players: [{ id, name, score, legs, sets, turns: [{ score, leg, bust?, attempted?, checkout?, darts?, hits? }] }],
 *     leg: the leg the turn was thrown in
 *   leg: the leg being played, counting from 0 across the whole match (every set),
 *   active: index of the player throwing,
 *   starter: index of the player who started the current leg,
 *   winner: index of the match winner, or null,
 *   nextId: counter for player ids,
 * }
 */

export function createGame(settings = {}) {
	return {
		settings: normalizeSettings(settings),
		players: [],
		leg: 0,
		active: 0,
		starter: 0,
		winner: null,
		nextId: 1,
	};
}

export function normalizeSettings(settings = {}) {
	const s = { ...DEFAULT_SETTINGS, ...settings };
	const { legs, sets, practice } = matchSettings(s);
	return {
		startScore: START_SCORES.includes(Number(s.startScore)) ? Number(s.startScore) : DEFAULT_SETTINGS.startScore,
		legs,
		sets,
		doubleOut: Boolean(s.doubleOut),
		practice,
	};
}

/** Whether three darts can make this total. */
export function isValidTurnScore(score) {
	return Number.isInteger(score) && score >= 0 && score <= MAX_TURN_SCORE && !IMPOSSIBLE_TURN_SCORES.has(score);
}

// ---- Players ----------------------------------------------------------------

export function canAddPlayer(state) {
	return state.players.length < MAX_PLAYERS;
}

/** fields: the new player's own fields for the mode (X01: the score). */
export function addPlayer(state, name, fields = { score: state.settings.startScore }) {
	if (!canAddPlayer(state)) return state;
	const id = state.nextId;
	const player = {
		id,
		name: cleanName(name, `Player ${state.players.length + 1}`),
		...fields,
		legs: 0,
		sets: 0,
		turns: [],
	};
	return { ...state, players: [...state.players, player], nextId: id + 1 };
}

export function renamePlayer(state, index, name) {
	const player = state.players[index];
	if (!player) return state;
	const players = state.players.slice();
	players[index] = { ...player, name: cleanName(name, player.name) };
	return { ...state, players };
}

export function removePlayer(state, index) {
	if (!state.players[index]) return state;
	const players = state.players.filter((_, i) => i !== index);
	const fix = i => {
		if (players.length === 0) return 0;
		if (i > index) return i - 1;
		return i % players.length;
	};
	let winner = state.winner;
	if (winner === index) winner = null;
	else if (winner !== null && winner > index) winner--;
	return { ...state, players, active: fix(state.active), starter: fix(state.starter), winner };
}

export function movePlayer(state, index, offset) {
	const to = index + offset;
	if (!state.players[index] || to < 0 || to >= state.players.length) return state;
	const players = state.players.slice();
	[players[index], players[to]] = [players[to], players[index]];
	const swap = i => (i === index ? to : i === to ? index : i);
	const winner = state.winner === null ? null : swap(state.winner);
	return { ...state, players, active: swap(state.active), starter: swap(state.starter), winner };
}

/** Move a player from one place in the order to another (e.g. by dragging). */
export function movePlayerTo(state, from, to) {
	if (!state.players[from] || !state.players[to]) return state;
	const step = to > from ? 1 : -1;
	let next = state;
	for (let i = from; i !== to; i += step) next = movePlayer(next, i, step);
	return next;
}

// ---- Match flow -------------------------------------------------------------

/** Same players, everything else back to zero. */
export function newMatch(state, settings = state.settings) {
	const normalized = normalizeSettings(settings);
	return {
		...state,
		settings: normalized,
		players: state.players.map(p => ({ ...p, score: normalized.startScore, legs: 0, sets: 0, turns: [] })),
		leg: 0,
		active: 0,
		starter: 0,
		winner: null,
	};
}

/**
 * Hand the throw to another player (e.g. when someone was skipped). Before the
 * leg's first dart (e.g. after a bull-off) they also start the leg, so the
 * next leg goes to the player after them.
 */
export function setActive(state, index) {
	if (!state.players[index] || state.winner !== null || index === state.active) return state;
	const legStarted = state.players.some(p => p.turns.some(t => t.leg === state.leg));
	return { ...state, active: index, starter: legStarted ? state.starter : index };
}

/**
 * Whether a turn of `score` (optionally with the darts thrown) is a bust.
 * Darts are only known when the score was entered on the dartboard.
 */
export function isBust(state, score, darts) {
	const player = state.players[state.active];
	const remaining = player.score - score;
	if (remaining < 0) return true;
	if (!state.settings.doubleOut) return false;
	if (remaining === 1) return true;
	if (remaining === 0) {
		const finishingDart = darts?.findLast(d => d.value > 0);
		if (finishingDart) return !isDouble(finishingDart);
		return !canCheckout(player.score); // keypad: only finishes that are possible on a double
	}
	return false;
}

/**
 * Record a turn for the active player.
 * Returns { state, event } where event is one of
 * 'turn' | 'bust' | 'leg' | 'set' | 'match' | null (nothing happened).
 */
export function submitTurn(state, score, darts = null) {
	if (state.players.length === 0 || state.winner !== null) return { state, event: null };
	if (!isValidTurnScore(score)) return { state, event: null };

	const players = state.players.slice();
	const player = { ...players[state.active] };
	players[state.active] = player;
	const turn = makeTurn(score, darts, state.leg);

	if (isBust(state, score, darts)) {
		player.turns = [...player.turns, { ...turn, score: 0, bust: true, attempted: score }];
		return { state: { ...state, players, active: nextIndex(state.active, players.length) }, event: 'bust' };
	}

	player.score -= score;
	if (player.score === 0) turn.checkout = true;
	player.turns = [...player.turns, turn];

	if (player.score > 0) {
		return { state: { ...state, players, active: nextIndex(state.active, players.length) }, event: 'turn' };
	}

	// Leg won. Next leg: scores back to the start.
	return endLeg(state, players, state.active, p => ({ ...p, score: state.settings.startScore }));
}

// ---- Persistence ------------------------------------------------------------

/** Repair anything loaded from storage; returns null if it is unusable. */
export function restoreGame(raw) {
	if (!raw || typeof raw !== 'object') return null;
	const settings = normalizeSettings(raw.settings);
	return restoreMatch(raw, settings, p => ({
		score: clampInt(p.score, 0, settings.startScore, settings.startScore),
	}));
}
