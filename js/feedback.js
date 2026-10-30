// Short status messages for the toast. Pure: compares game states, no DOM.
// Each message is { kind: 'info' | 'bust' | 'win', title, detail }, or null for nothing to say.

const turnCount = state => state.players.reduce((sum, p) => sum + p.turns.length, 0);
const total = (state, key) => state.players.reduce((sum, p) => sum + p[key], 0);

/** What a submitted turn did, from the state it was thrown in. */
export function describeTurn(before, event, score) {
	const name = before.players[before.active]?.name ?? '';
	if (event === 'bust') return { kind: 'bust', title: 'Bust', detail: name };
	if (event === 'leg') return { kind: 'win', title: 'Leg', detail: `${name} wins the leg` };
	if (event === 'set') return { kind: 'win', title: 'Set', detail: `${name} wins the set` };
	if (event === 'turn' && score === 180) return { kind: 'win', title: '180!', detail: name };
	return null;
}

/** What an undo or redo stepped over, going from `from` to `to`. */
export function describeTravel(from, to, direction) {
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
			const thrown = last.bust ? 'bust' : last.score;
			let detail = `${player.name}'s ${thrown}`;
			if (newer.winner !== null && older.winner === null) detail += undo ? ', match reopened' : ', match won';
			else if (total(newer, 'sets') !== total(older, 'sets')) detail += undo ? ', set reopened' : ', set won';
			else if (total(newer, 'legs') !== total(older, 'legs')) detail += undo ? ', leg reopened' : ', leg won';
			return { kind: 'info', title, detail };
		}
	}

	const ids = state => state.players.map(p => p.id).join();
	if (ids(from) !== ids(to)) return { kind: 'info', title, detail: 'Players changed' };
	const settings = state => JSON.stringify(state.settings);
	if (settings(from) !== settings(to)) return { kind: 'info', title, detail: 'Settings changed' };
	return { kind: 'info', title, detail: '' };
}

// Visits worth picking out in a player's history line.
const TIERS = [[180, 'max'], [140, 'ton-forty'], [100, 'ton']];
const BEST_FROM = 2; // visits before the best one is marked

/**
 * Class names for each turn in a history line: 'bust', 'zero', 'checkout',
 * 'max' (180), 'ton-forty' (140+), 'ton' (100+), 'bull' (a bullseye thrown)
 * and 'best' (the highest visit so far, once there are a few).
 */
export function historyMarks(turns) {
	const best = turns.length >= BEST_FROM ? Math.max(...turns.map(t => t.score)) : 0;
	return turns.map(t => {
		const marks = [];
		if (t.bust) marks.push('bust');
		else if (t.score === 0) marks.push('zero');
		if (t.checkout) marks.push('checkout');
		const tier = TIERS.find(([min]) => t.score >= min);
		if (tier) marks.push(tier[1]);
		if (t.darts?.includes('B')) marks.push('bull');
		if (best > 0 && t.score === best) marks.push('best');
		return marks;
	});
}
