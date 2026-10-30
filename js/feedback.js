// Short status messages for the toast. Pure: compares game states, no DOM.
// Each message is { kind: 'info' | 'bust' | 'win', title, detail }, or null for nothing to say.

const turnCount = state => state.players.reduce((sum, p) => sum + p.turns.length, 0);
const total = (state, key) => state.players.reduce((sum, p) => sum + p[key], 0);
// Game modes and their settings, compared as one.
const rules = state => JSON.stringify([state.mode, state.settings]);

/**
 * Who took a leg or set between two states: in some modes (doubles practice,
 * 121) the leg can end on someone else's visit.
 */
function taker(before, after) {
	const won = p => {
		const old = before.players.find(b => b.id === p.id);
		return old && (p.sets > old.sets || p.legs > old.legs);
	};
	return after?.players.find(won);
}

/**
 * What a submitted turn did, from the state it was thrown in (and the state
 * after, where a mode needs it to say more).
 */
export function describeTurn(before, event, score, after) {
	const name = before.players[before.active]?.name ?? '';
	const winner = taker(before, after)?.name ?? name;
	const next = after?.players.find(p => p.id === before.players[before.active]?.id);
	if (event === 'bust') return { kind: 'bust', title: 'Bust', detail: name };
	if (event === 'leg') return { kind: 'win', title: 'Leg', detail: `${winner} wins the leg` };
	if (event === 'set') return { kind: 'win', title: 'Set', detail: `${winner} wins the set` };
	if (event === 'draw') return { kind: 'info', title: 'Leg', detail: 'Drawn' };
	if (event === 'out') return { kind: 'bust', title: 'Out', detail: name };
	if (event === 'checkout') return { kind: 'win', title: 'Checkout', detail: next ? `${name} · ${next.target} next` : name };
	if (event === 'missed') return { kind: 'bust', title: 'Missed', detail: next ? `${name} · ${next.target} again` : name };
	if (event === 'turn' && score === 180) return { kind: 'win', title: '180!', detail: name };
	return null;
}

/**
 * What an undo or redo stepped over, going from `from` to `to`.
 * label: how a turn reads (the mode's, e.g. "2 hits"); X01's is the score.
 */
export function describeTravel(from, to, direction, label = t => t.score) {
	const undo = direction === 'undo';
	const title = undo ? 'Undo' : 'Redo';
	const older = undo ? to : from;
	const newer = undo ? from : to;

	// Across a "new game" or "rematch".
	if (turnCount(newer) === 0 && turnCount(older) > 0) {
		return { kind: 'info', title, detail: undo ? 'Back to the previous game' : 'New game' };
	}

	// A single turn.
	if (turnCount(newer) === turnCount(older) + 1) {
		const index = newer.players.findIndex((p, i) => p.turns.length > (older.players[i]?.turns.length ?? 0));
		const player = newer.players[index];
		const last = player?.turns.at(-1);
		if (last) {
			const thrown = last.bust ? 'bust' : label(last);
			let detail = `${player.name}'s ${thrown}`;
			if (newer.winner !== null && older.winner === null) detail += undo ? ', match reopened' : ', match won';
			else if (total(newer, 'sets') !== total(older, 'sets')) detail += undo ? ', set reopened' : ', set won';
			else if (total(newer, 'legs') !== total(older, 'legs')) detail += undo ? ', leg reopened' : ', leg won';
			else if (newer.leg !== older.leg) detail += undo ? ', leg reopened' : ', leg drawn';
			return { kind: 'info', title, detail };
		}
	}

	const ids = state => state.players.map(p => p.id).join();
	if (ids(from) !== ids(to)) return { kind: 'info', title, detail: 'Players changed' };
	if (rules(from) !== rules(to)) return { kind: 'info', title, detail: 'Settings changed' };
	return { kind: 'info', title, detail: '' };
}

/**
 * Whether undoing from `from` back to `to` takes back more than a plain turn
 * (a leg, set or match won, a new game, a player or settings change), and so
 * is asked about first: { title, detail } for the question, or null.
 */
export function undoWarning(from, to, label = t => t.score) {
	if (turnCount(from) === 0 && turnCount(to) > 0) {
		return { title: 'Back to the last game?', detail: 'This new game is dropped and the last one picks up where it was.' };
	}

	if (turnCount(from) === turnCount(to) + 1) {
		const player = from.players.find((p, i) => p.turns.length > (to.players[i]?.turns.length ?? 0));
		const last = player?.turns.at(-1);
		if (!last) return null;
		// The thrower won it, or (in some modes) their visit ended it for someone else.
		const ended = taker(to, from) && taker(to, from).id !== player.id ? 'ended' : 'won';
		const won = what => ({ title: `Reopen the ${what}?`, detail: `${player.name}'s ${label(last)} ${ended} it; undoing takes that back.` });
		if (from.winner !== null && to.winner === null) return won('match');
		if (total(from, 'sets') !== total(to, 'sets')) return won('set');
		if (total(from, 'legs') !== total(to, 'legs')) return { ...won('leg'), title: 'Back to the last leg?' };
		if (from.leg !== to.leg) {
			return { title: 'Back to the last leg?', detail: `${player.name}'s ${label(last)} ended it, drawn; undoing takes that back.` };
		}
		return null;
	}

	const ids = state => state.players.map(p => p.id);
	const added = from.players.filter(p => !ids(to).includes(p.id));
	const removed = to.players.filter(p => !ids(from).includes(p.id));
	if (added.length === 1 && !removed.length) return { title: `Remove ${added[0].name}?`, detail: 'Undoes adding them to the game.' };
	if (removed.length === 1 && !added.length) return { title: `Bring back ${removed[0].name}?`, detail: 'Undoes removing them, with their scores.' };
	if (ids(from).join() !== ids(to).join()) return { title: 'Undo the player change?', detail: 'The players go back to how they were.' };
	if (rules(from) !== rules(to)) {
		return { title: 'Back to the last settings?', detail: 'Undoes the settings change and the new game it started.' };
	}
	return null;
}

/**
 * A player's history in legs, oldest first: [{ leg, turns, done, won }], where
 * turns are indexes into `turns`. `current` is the leg being played (or the
 * last one, once the match is won); earlier legs are done, and won if the
 * player checked out in them (or, where a mode says, if `won` has the leg).
 * Turns saved before legs were recorded go with the current leg.
 */
export function historyLegs(turns, current, won = null) {
	const legs = [];
	turns.forEach((t, i) => {
		const leg = t.leg ?? current;
		let group = legs.at(-1);
		if (group?.leg !== leg) legs.push(group = { leg, turns: [], done: leg < current, won: false });
		group.turns.push(i);
		group.won = won ? won.has(leg) : group.won || Boolean(t.checkout);
	});
	return legs;
}

// Visits worth picking out in a player's history line.
const TIERS = [[180, 'max'], [140, 'ton-forty'], [100, 'ton']];
const BEST_FROM = 2; // visits before the best one is marked

/**
 * Class names for each turn in a history line: 'bust', 'zero', 'finish',
 * 'max' (180), 'ton-forty' (140+), 'ton' (100+), 'bull' (a bullseye thrown)
 * and 'best' (the highest visit so far, once there are a few).
 */
export function historyMarks(turns) {
	const best = turns.length >= BEST_FROM ? Math.max(...turns.map(t => t.score)) : 0;
	return turns.map(t => {
		const marks = [];
		if (t.bust) marks.push('bust');
		else if (t.score === 0) marks.push('zero');
		if (t.checkout) marks.push('finish'); // not 'checkout': that's the suggestion beside the history
		const tier = TIERS.find(([min]) => t.score >= min);
		if (tier) marks.push(tier[1]);
		if (t.darts?.includes('B')) marks.push('bull');
		if (best > 0 && t.score === best) marks.push('best');
		return marks;
	});
}
