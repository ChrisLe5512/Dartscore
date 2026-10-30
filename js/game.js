// Pure game state for X01. Every function takes a state and returns a new one,
// so the UI can keep snapshots for undo/redo and save them as JSON.

import {
	DEFAULT_SETTINGS, IMPOSSIBLE_TURN_SCORES, MAX_LEGS, MAX_NAME_LENGTH,
	MAX_PLAYERS, MAX_SETS, MAX_TURN_SCORE, START_SCORES,
} from './config.js';
import { isDouble } from './board.js';
import { canCheckout } from './checkout.js';

/**
 * State shape:
 * {
 *   settings: { startScore, legs, sets, doubleOut },
 *   players: [{ id, name, score, legs, sets, turns: [{ score, leg, bust?, checkout?, darts?, hits? }] }],
 *     leg: which leg of the match the turn was thrown in, counting from 0 (see currentLeg)
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
		active: 0,
		starter: 0,
		winner: null,
		nextId: 1,
	};
}

export function normalizeSettings(settings = {}) {
	const s = { ...DEFAULT_SETTINGS, ...settings };
	return {
		startScore: START_SCORES.includes(Number(s.startScore)) ? Number(s.startScore) : DEFAULT_SETTINGS.startScore,
		legs: clampInt(s.legs, 1, MAX_LEGS, DEFAULT_SETTINGS.legs),
		sets: clampInt(s.sets, 1, MAX_SETS, DEFAULT_SETTINGS.sets),
		doubleOut: Boolean(s.doubleOut),
	};
}

function clampInt(value, min, max, fallback) {
	const n = Math.trunc(Number(value));
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function cleanName(name, fallback) {
	const trimmed = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
	return trimmed || fallback;
}

/** Whether three darts can make this total. */
export function isValidTurnScore(score) {
	return Number.isInteger(score) && score >= 0 && score <= MAX_TURN_SCORE && !IMPOSSIBLE_TURN_SCORES.has(score);
}

// ---- Players ----------------------------------------------------------------

export function canAddPlayer(state) {
	return state.players.length < MAX_PLAYERS;
}

export function addPlayer(state, name) {
	if (!canAddPlayer(state)) return state;
	const id = state.nextId;
	const player = {
		id,
		name: cleanName(name, `Player ${state.players.length + 1}`),
		score: state.settings.startScore,
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
		active: 0,
		starter: 0,
		winner: null,
	};
}

/** Hand the throw to another player (e.g. when someone was skipped). */
export function setActive(state, index) {
	if (!state.players[index] || state.winner !== null || index === state.active) return state;
	return { ...state, active: index };
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
	const turn = darts?.length ? { score, darts: darts.map(d => d.label) } : { score };
	turn.leg = currentLeg(state);
	// Where each dart landed, when every dart was tapped on the board.
	if (darts?.length && darts.every(isHit)) turn.hits = darts.map(d => [round3(d.x), round3(d.y)]);

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

	// Leg won
	player.legs += 1;
	let event = 'leg';
	if (player.legs >= state.settings.legs) {
		player.sets += 1;
		event = 'set';
		for (let i = 0; i < players.length; i++) {
			if (players[i].legs) players[i] = { ...players[i], legs: 0 };
		}
		if (player.sets >= state.settings.sets) {
			// Leave the board as it finished so everyone can see it.
			return { state: { ...state, players, winner: state.active }, event: 'match' };
		}
	}

	// Next leg: scores back to the start, the next player in order throws first.
	const starter = nextIndex(state.starter, players.length);
	for (let i = 0; i < players.length; i++) {
		players[i] = { ...players[i], score: state.settings.startScore };
	}
	return { state: { ...state, players, starter, active: starter }, event };
}

/** The leg being played, counting from 0 across the whole match (every set). */
export function currentLeg(state) {
	return state.players.reduce((sum, p) => sum + p.turns.filter(t => t.checkout).length, 0);
}

function nextIndex(i, length) {
	return length ? (i + 1) % length : 0;
}

// A board position: x, y as a fraction of the board radius from the centre.
const isHit = d => Number.isFinite(d?.x) && Number.isFinite(d?.y) && Math.hypot(d.x, d.y) <= 1.5;
const round3 = n => Math.round(n * 1000) / 1000;

// ---- Stats ------------------------------------------------------------------

/**
 * Match stats for one player. visits: turns at the board. The three-dart average
 * counts keypad turns as three darts and board turns as the darts tapped; busts
 * score nothing but their darts still count.
 */
export function playerStats(player) {
	let points = 0;
	let darts = 0;
	let best = 0;
	for (const t of player.turns) {
		points += t.score;
		darts += t.darts?.length || 3;
		best = Math.max(best, t.score);
	}
	return { average: darts ? points / darts * 3 : 0, darts, visits: player.turns.length, best };
}

// ---- Persistence ------------------------------------------------------------

/** Repair anything loaded from storage; returns null if it is unusable. */
export function restoreGame(raw) {
	if (!raw || typeof raw !== 'object' || !Array.isArray(raw.players)) return null;
	const settings = normalizeSettings(raw.settings);
	let nextId = 1;
	const players = raw.players.slice(0, MAX_PLAYERS).map((p, i) => {
		const id = Number.isInteger(p?.id) && p.id > 0 ? p.id : i + 1;
		nextId = Math.max(nextId, id + 1);
		return {
			id,
			name: cleanName(p?.name, `Player ${i + 1}`),
			score: clampInt(p?.score, 0, settings.startScore, settings.startScore),
			legs: clampInt(p?.legs, 0, settings.legs, 0),
			sets: clampInt(p?.sets, 0, settings.sets, 0),
			turns: Array.isArray(p?.turns)
				? p.turns.filter(t => t && Number.isInteger(t.score)).map(restoreTurn)
				: [],
		};
	});
	const index = (v, fallback = 0) =>
		Number.isInteger(v) && v >= 0 && v < players.length ? v : fallback;
	return {
		settings,
		players,
		active: index(raw.active),
		starter: index(raw.starter),
		winner: raw.winner === null || raw.winner === undefined ? null : index(raw.winner, null),
		nextId: Math.max(nextId, Number.isInteger(raw.nextId) ? raw.nextId : 1),
	};
}

function restoreTurn(raw) {
	const turn = { ...raw };
	const valid = Array.isArray(turn.hits) && turn.hits.length === turn.darts?.length
		&& turn.hits.every(h => Array.isArray(h) && isHit({ x: h[0], y: h[1] }));
	if (valid) turn.hits = turn.hits.map(([x, y]) => [x, y]);
	else delete turn.hits;
	if (!Number.isInteger(turn.leg) || turn.leg < 0) delete turn.leg; // saved before legs were recorded
	return turn;
}
