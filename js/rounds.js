// What doubles practice and 121 share: a leg where everyone throws until they
// have nothing left to throw at, and only then is it decided. The last to throw
// needn't be the winner, so the game keeps who won each leg (results). Pure,
// like game.js.

import * as Game from './game.js';
import { endLeg, restoreMatch, restoreResults } from './match.js';

/**
 * A game's flow, from what makes it that game: its id and normalizeSettings;
 * start: a player's own fields as a leg starts; canThrow(player): whether they
 * have anything left to throw at; legWinner(players): an index, or null for a
 * drawn leg; restorePlayer(raw): a saved player's own fields, repaired.
 */
export function roundsGame({ id, normalizeSettings, start, canThrow, legWinner, restorePlayer }) {
	const fresh = p => ({ ...p, ...start });

	const createGame = (settings = {}) => ({
		mode: id, settings: normalizeSettings(settings), players: [], results: [],
		leg: 0, active: 0, starter: 0, winner: null, nextId: 1,
	});

	const addPlayer = (state, name) => Game.addPlayer(state, name, start);

	/** Same players, everything else back to zero. */
	const newMatch = (state, settings = state.settings) => ({
		...state,
		mode: id,
		settings: normalizeSettings(settings),
		players: state.players.map(p => ({ ...fresh(p), legs: 0, sets: 0, turns: [] })),
		results: [],
		leg: 0,
		active: 0,
		starter: 0,
		winner: null,
	});

	/** The next player who can throw after `from` (themselves last), or null when the leg is over. */
	const nextThrower = (players, from) => {
		for (let k = 1; k <= players.length; k++) {
			const i = (from + k) % players.length;
			if (canThrow(players[i])) return i;
		}
		return null;
	};

	/** On to the next thrower; with none left, the leg is decided. */
	const moveOn = (state, event) => {
		const next = nextThrower(state.players, state.active);
		if (next !== null) return { state: { ...state, active: next }, event };
		const winner = legWinner(state.players);
		const results = [...state.results, winner === null ? null : state.players[winner].id];
		const { state: done, event: legEvent } = endLeg(state, state.players.slice(), winner, fresh);
		return { state: { ...done, results }, event: legEvent };
	};

	/** After a change to the players: if the thrower can't throw, the next one does (or the leg ends). */
	const settle = state => {
		if (state.winner !== null || !state.players.length || canThrow(state.players[state.active])) return state;
		return moveOn(state, null).state;
	};

	const removePlayer = (state, index) => settle(Game.removePlayer(state, index));

	/** Hand the throw to a player who can throw. */
	const setActive = (state, index) => {
		if (!state.players[index] || !canThrow(state.players[index])) return state;
		return Game.setActive(state, index);
	};

	const restoreGame = raw => {
		if (!raw || typeof raw !== 'object') return null;
		const settings = normalizeSettings(raw.settings);
		const state = restoreMatch(raw, settings, restorePlayer);
		if (!state) return null;
		const { settings: _, players, ...rest } = state; // in the order createGame has, so a reloaded game saves the same
		return { mode: id, settings, players, results: restoreResults(raw.results, state.leg), ...rest };
	};

	/** The legs a player won, for the history's leg dots. */
	const wonLegs = (state, player) => new Set(state.results.flatMap((winner, leg) => (winner === player.id ? [leg] : [])));

	return { createGame, addPlayer, newMatch, moveOn, removePlayer, setActive, restoreGame, wonLegs };
}
