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
		const raw = JSON.parse(store.getItem(STORAGE_KEY));
		const game = restoreGame(raw?.game);
		if (!game) return null;
		const restoreAll = list => (Array.isArray(list) ? list.map(restoreGame).filter(Boolean) : []);
		return { game, history: createHistory(restoreAll(raw.history?.past), restoreAll(raw.history?.future)) };
	} catch {
		return null;
	}
}

export function saveSession(game, history) {
	const store = storage();
	if (!store) return;
	try {
		store.setItem(STORAGE_KEY, JSON.stringify({ game, history }));
	} catch {
		// Out of space: keep the game itself, drop undo history.
		try {
			store.setItem(STORAGE_KEY, JSON.stringify({ game, history: createHistory() }));
		} catch { /* nothing more we can do */ }
	}
}

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
