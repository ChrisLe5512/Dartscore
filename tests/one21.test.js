import test from 'node:test';
import assert from 'node:assert/strict';
import * as One21 from '../js/one21.js';
import { makeDart } from '../js/board.js';

const twoPlayers = (settings = {}) =>
	One21.addPlayer(One21.addPlayer(One21.createGame({ legs: 1, sets: 1, doubleOut: true, ...settings }), 'Ann'), 'Bob');

function play(state, ...scores) {
	let event;
	for (const s of scores) ({ state, event } = One21.submitTurn(state, s));
	return { state, event };
}

test('a player throws on at 121 until they check out or use three visits', () => {
	const s = twoPlayers();
	assert.equal(s.mode, '121');
	let { state, event } = play(s, 60);
	assert.equal(event, 'turn');
	assert.equal(state.active, 0, 'still Ann');
	assert.equal(state.players[0].score, 61);
	assert.equal(One21.checkoutFrom(state.players[0]), 61);
	({ state, event } = play(state, 21));
	assert.equal(state.players[0].score, 40);
	({ state, event } = play(state, 40));
	assert.equal(event, 'checkout');
	assert.deepEqual([state.players[0].target, state.players[0].score, state.players[0].round], [122, 122, 1]);
	assert.equal(state.players[0].turns.at(-1).target, 121);
	assert.equal(state.active, 1);
});

test('missing keeps the same target; a bust counts as a visit', () => {
	let { state, event } = play(twoPlayers(), 100, 20, 0);
	assert.equal(event, 'missed');
	assert.deepEqual([state.players[0].target, state.players[0].score, state.players[0].round], [121, 121, 1]);
	assert.equal(state.players[0].turns.at(-1).missed, true);
	assert.equal(state.active, 1);
	({ state, event } = play(state, 120));
	assert.equal(event, 'bust', 'leaves 1');
	assert.equal(state.players[1].score, 121);
	assert.equal(state.players[1].visit, 1);
	// On the board, a finish that isn't on a double is a bust.
	({ state, event } = One21.submitTurn(state, 121, [makeDart(20, 3), makeDart(20, 3), makeDart(1, 1)]));
	assert.equal(event, 'bust');
	assert.equal(One21.submitTurn(state, 179).event, null);
});

test('after ten targets each, the highest target wins the leg', () => {
	let s = twoPlayers({ legs: 2 });
	// Ann checks out every target in one visit; Bob misses every target.
	for (let r = 0; r < 10; r++) {
		s = play(s, s.players[0].score).state;
		const { state, event } = play(s, 0, 0, 0);
		s = state;
		if (r < 9) assert.equal(event, 'missed');
		else assert.equal(event, 'leg');
	}
	assert.equal(s.players[0].legs, 1);
	assert.deepEqual(s.results, [s.players[0].id]);
	assert.ok(s.players.every(p => p.target === 121 && p.round === 0));
	assert.equal(s.active, 1);
	const stats = One21.matchStats(s.players[0], s);
	assert.equal(stats.checkouts, 10);
	assert.equal(stats.targets, 10);
	assert.equal(stats.top, 130);
	assert.deepEqual([...One21.wonLegs(s, s.players[0])], [0]);
});

test('level on target draws the leg; alone, the leg is always won', () => {
	let s = twoPlayers();
	for (let r = 0; r < 10; r++) s = play(s, 0, 0, 0, 0, 0, 0).state;
	assert.deepEqual(s.results, [null]);
	assert.equal(s.leg, 1);

	let solo = One21.addPlayer(One21.createGame({ legs: 1 }), 'Solo');
	let event;
	for (let r = 0; r < 10; r++) ({ state: solo, event } = play(solo, 0, 0, 0));
	assert.equal(event, 'match');
	assert.equal(solo.winner, 0);
});

test('stats line and a saved game', () => {
	const { state } = play(twoPlayers(), 60);
	assert.deepEqual(One21.statsLine(state.players[0]), [['Target', 121], ['Visit', '2/3'], ['Round', '1/10']]);
	assert.deepEqual(One21.restoreGame(JSON.parse(JSON.stringify(state))), state);
	const broken = One21.restoreGame({ players: [{ target: 5, score: 900, visit: 7 }] });
	assert.deepEqual([broken.players[0].target, broken.players[0].score, broken.players[0].visit], [121, 121, 2]);
});
