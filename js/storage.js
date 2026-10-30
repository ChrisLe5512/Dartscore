import { LEGACY_STORAGE_KEYS, PREFS_KEY, STORAGE_KEY } from './config.js';
import { restoreGame } from './game.js';
import { createHistory } from './history.js';

// localStorage can be missing or throw (private mode, blocked storage, full quota).
function storage() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

export function loadSession() {
	const store = storage();
	if (!store) return null;
	try {
		for (const key of LEGACY_STORAGE_KEYS) store.removeItem(key); // never loadable, see README
		return unpackSession(JSON.parse(store.getItem(STORAGE_KEY)));
	} catch {
		return null;
	}
}

export function saveSession(game, history) {
	const store = storage();
	if (!store) return;
	try {
		store.setItem(STORAGE_KEY, JSON.stringify(packSession(game, history)));
	} catch {
		// Out of space: keep the game itself, drop undo history.
		try {
			store.setItem(STORAGE_KEY, JSON.stringify({ game, history: createHistory() }));
		} catch { /* nothing more we can do */ }
	}
}

// Every undo step is a whole game, so written out in full a long match saves
// the same turns hundreds of times over (megabytes, more than the browser
// keeps). Instead, a step whose turns for a player are the start of that
// player's turns one step later saves just how many there are. The steps run
// past (oldest first), the game, then future; the game and the newest step
// are always saved in full.

/** The game and its undo history, ready to save as JSON. */
export function packSession(game, history) {
	const pack = (state, next) => ({
		...state,
		players: state.players.map(player => {
			const later = next.players.find(p => p.id === player.id)?.turns;
			const prefix = later && player.turns.length <= later.length && player.turns.every((t, i) => t === later[i]);
			return prefix ? { ...player, turns: player.turns.length } : player;
		}),
	});
	const { past, future } = history;
	return {
		game,
		history: {
			past: past.map((state, i) => pack(state, past[i + 1] ?? game)),
			future: future.map((state, i) => (i + 1 < future.length ? pack(state, future[i + 1]) : state)),
		},
	};
}

/** Back from packSession's form (or an older save, all in full); null if unusable. */
export function unpackSession(raw) {
	const game = restoreGame(raw?.game);
	if (!game) return null;
	// Rebuilt newest first, each step from the one after it.
	const unpack = (list, last) => {
		const states = [];
		let next = last;
		for (const rawState of (Array.isArray(list) ? [...list] : []).reverse()) {
			const state = unpackState(rawState, next);
			if (!state) return { states, broken: true };
			states.unshift(state);
			next = state;
		}
		return { states, broken: false };
	};
	const past = unpack(raw.history?.past, game).states; // a broken step loses only the older ones
	const future = unpack(raw.history?.future, null);
	return { game, history: createHistory(past, future.broken ? [] : future.states) };
}

function unpackState(raw, next) {
	if (!raw || !Array.isArray(raw.players)) return null;
	const counts = raw.players.map(p => p?.turns);
	const state = restoreGame({ ...raw, players: raw.players.map(p => (typeof p?.turns === 'number' ? { ...p, turns: [] } : p)) });
	if (!state) return null;
	for (const [i, player] of state.players.entries()) {
		const later = next?.players.find(p => p.id === player.id)?.turns;
		const count = counts[i];
		if (typeof count === 'number') {
			if (!later || !Number.isInteger(count) || count < 0 || count > later.length) return null;
			player.turns = later.slice(0, count); // the same turns, not copies, so they pack again
		} else if (later && isPrefix(player.turns, later)) {
			player.turns = later.slice(0, player.turns.length); // a save from before packing
		}
	}
	return state;
}

const isPrefix = (turns, later) => turns.length <= later.length
	&& turns.every((t, i) => JSON.stringify(t) === JSON.stringify(later[i]));

/** View choices for this device. Always returns an object. */
export function loadPrefs() {
	try {
		const prefs = JSON.parse(storage()?.getItem(PREFS_KEY));
		return prefs && typeof prefs === 'object' ? prefs : {};
	} catch {
		return {};
	}
}

export function savePrefs(prefs) {
	try {
		storage()?.setItem(PREFS_KEY, JSON.stringify(prefs));
	} catch { /* not saved, fine */ }
}
