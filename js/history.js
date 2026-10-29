import { MAX_UNDO_STEPS } from './config.js';

/** Undo/redo stacks of game-state snapshots. */
export function createHistory(past = [], future = []) {
	return { past: past.slice(-MAX_UNDO_STEPS), future: future.slice(0, MAX_UNDO_STEPS) };
}

/** Remember `previous` before a change; a new change clears redo. */
export function record(history, previous) {
	return { past: [...history.past, previous].slice(-MAX_UNDO_STEPS), future: [] };
}

export function undo(history, current) {
	if (!history.past.length) return null;
	return {
		state: history.past[history.past.length - 1],
		history: { past: history.past.slice(0, -1), future: [current, ...history.future] },
	};
}

export function redo(history, current) {
	if (!history.future.length) return null;
	return {
		state: history.future[0],
		history: { past: [...history.past, current], future: history.future.slice(1) },
	};
}
