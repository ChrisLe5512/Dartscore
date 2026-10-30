// What every game mode shares: how a turn is recorded, how a leg won (or
// drawn) moves the match on through legs and sets, and repairing a saved
// match. Pure, like game.js.

import { DEFAULT_SETTINGS, MAX_LEGS, MAX_NAME_LENGTH, MAX_PLAYERS, MAX_SETS } from './config.js';

export function clampInt(value, min, max, fallback) {
	const n = Math.trunc(Number(value));
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function cleanName(name, fallback) {
	const trimmed = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
	return trimmed || fallback;
}

export function nextIndex(i, length) {
	return length ? (i + 1) % length : 0;
}

/** The settings every mode has: legs and sets to win (first to), and practice (legs go on, no winner). */
export function matchSettings(settings = {}) {
	const s = { ...DEFAULT_SETTINGS, ...settings };
	return {
		legs: clampInt(s.legs, 1, MAX_LEGS, DEFAULT_SETTINGS.legs),
		sets: clampInt(s.sets, 1, MAX_SETS, DEFAULT_SETTINGS.sets),
		practice: Boolean(s.practice),
	};
}

// A board position: x, y as a fraction of the board radius from the centre.
export const isHit = d => Number.isFinite(d?.x) && Number.isFinite(d?.y) && Math.hypot(d.x, d.y) <= 1.5;
const round3 = n => Math.round(n * 1000) / 1000;

/** A turn as recorded: its score, the darts' labels, and where they landed when every dart was tapped on the board. */
export function makeTurn(score, darts, leg) {
	const turn = darts?.length ? { score, darts: darts.map(d => d.label) } : { score };
	turn.leg = leg;
	if (darts?.length && darts.every(isHit)) turn.hits = darts.map(d => [round3(d.x), round3(d.y)]);
	return turn;
}

/**
 * The leg is over and `winner` (an index, or null for a drawn leg) takes it.
 * `players` already has the last turn in it, and is changed in place; `reset`
 * gives a player as they start a leg. Returns { state, event } with event
 * 'leg' | 'set' | 'match' | 'draw'. The match ends with the board left as it
 * finished, so everyone can see it; otherwise the next player in order starts
 * the next leg.
 */
export function endLeg(state, players, winner, reset) {
	const leg = state.leg + 1;
	let event = 'draw';
	if (winner !== null) {
		const player = { ...players[winner], legs: players[winner].legs + 1 };
		players[winner] = player;
		event = 'leg';
		if (!state.settings.practice && player.legs >= state.settings.legs) {
			player.sets += 1;
			event = 'set';
			for (let i = 0; i < players.length; i++) {
				if (players[i].legs) players[i] = { ...players[i], legs: 0 };
			}
			if (player.sets >= state.settings.sets) {
				return { state: { ...state, players, leg, winner }, event: 'match' };
			}
		}
	}
	const starter = nextIndex(state.starter, players.length);
	for (let i = 0; i < players.length; i++) players[i] = reset(players[i]);
	return { state: { ...state, players, leg, starter, active: starter }, event };
}

// ---- Persistence ------------------------------------------------------------

/**
 * Repair the parts of a saved match every mode has; null if it is unusable.
 * `restorePlayer(raw)` gives the mode's own fields of a player.
 */
export function restoreMatch(raw, settings, restorePlayer) {
	if (!raw || typeof raw !== 'object' || !Array.isArray(raw.players)) return null;
	let nextId = 1;
	const players = raw.players.slice(0, MAX_PLAYERS).map((p, i) => {
		const id = Number.isInteger(p?.id) && p.id > 0 ? p.id : i + 1;
		const turns = Array.isArray(p?.turns) ? p.turns.filter(t => t && Number.isInteger(t.score)).map(restoreTurn) : [];
		nextId = Math.max(nextId, id + 1);
		return {
			id,
			name: cleanName(p?.name, `Player ${i + 1}`),
			...restorePlayer(p ?? {}),
			legs: clampInt(p?.legs, 0, settings.practice ? turns.length : settings.legs, 0),
			sets: clampInt(p?.sets, 0, settings.sets, 0),
			turns,
		};
	});
	const index = (v, fallback = 0) =>
		Number.isInteger(v) && v >= 0 && v < players.length ? v : fallback;
	// Saved before the leg was kept: every leg won so far, counted.
	const legsPlayed = players.reduce((sum, p) => sum + p.turns.filter(t => t.checkout).length, 0);
	return {
		settings,
		players,
		leg: Number.isInteger(raw.leg) && raw.leg >= 0 ? raw.leg : legsPlayed,
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

/** Per leg, the id of the player who won it (null: drawn), for modes where the last to throw needn't be the winner. */
export function restoreResults(raw, legs) {
	return (Array.isArray(raw) ? raw : []).slice(0, legs).map(id => (Number.isInteger(id) ? id : null));
}
