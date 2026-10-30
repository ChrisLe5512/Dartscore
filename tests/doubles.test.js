import test from 'node:test';
import assert from 'node:assert/strict';
import * as Doubles from '../js/doubles.js';
import { makeDart } from '../js/board.js';

const twoPlayers = (settings = {}) =>
	Doubles.addPlayer(Doubles.addPlayer(Doubles.createGame({ legs: 1, sets: 1, ...settings }), 'Ann'), 'Bob');

function play(state, ...visits) {
	let event;
	for (const v of visits) ({ state, event } = Array.isArray(v) ? Doubles.submitTurn(state, 0, v) : Doubles.submitTurn(state, v));
	return { state, event };
}

test('everyone starts on 27 at D1; hits add the double, a blank visit takes it off', () => {
	const s = twoPlayers();
	assert.equal(s.mode, 'doubles');
	assert.equal(s.players[0].score, 27);
	assert.deepEqual(Doubles.hint(s, 0), { text: '\u{1F3AF} D1' });
	let { state, event } = play(s, 2, 0);
	assert.equal(event, 'turn');
	assert.equal(state.players[0].score, 31);
	assert.equal(state.players[1].score, 25);
	assert.deepEqual(state.players.map(p => p.round), [1, 1]);
	assert.equal(state.active, 0);
	assert.deepEqual(Doubles.hint(state, 0), { text: '\u{1F3AF} D2' });
	assert.equal(Doubles.turnText(state.players[0].turns[0]), '+4');
	assert.equal(Doubles.turnText(state.players[1].turns[0]), '−2');
	// From the board: only the double counts.
	({ state } = play(state, [makeDart(2, 2), makeDart(2, 1), makeDart(2, 3)]));
	assert.equal(state.players[0].score, 35);
	assert.equal(state.players[0].turns.at(-1).made, 1);
	assert.equal(Doubles.dartsValue(state, [makeDart(2, 2)]), '+4');
	assert.equal(Doubles.dartsValue(state, [makeDart(2, 1)]), '−4');
});

test('at 0 or below a player is out and skipped', () => {
	// Bob misses D1-D4: 27 - 2 - 4 - 6 - 8 = 7, then D5 takes him to -3.
	let { state, event } = play(twoPlayers(), 1, 0, 1, 0, 1, 0, 1, 0, 1, 0);
	assert.equal(event, 'out');
	assert.equal(state.players[1].out, true);
	assert.equal(state.players[1].score, -3);
	assert.deepEqual(Doubles.hint(state, 1), { text: 'Out', muted: true });
	assert.equal(state.active, 0);
	({ state } = play(state, 1));
	assert.equal(state.active, 0, 'Ann throws on alone');
	assert.equal(Doubles.setActive(state, 1), state, 'the throw cannot go to a player who is out');
});

test('after the bull the highest score still in wins the leg', () => {
	const s = twoPlayers({ legs: 2 });
	const visits = [];
	for (let i = 0; i < 21; i++) visits.push(1, 1);
	visits[visits.length - 1] = 2; // Bob hits two bulls
	const { state, event } = play(s, ...visits);
	assert.equal(event, 'leg');
	assert.equal(state.players[1].legs, 1);
	assert.deepEqual(state.results, [state.players[1].id]);
	assert.ok(state.players.every(p => p.score === 27 && p.round === 0 && !p.out));
	assert.equal(state.active, 1);
	assert.deepEqual([...Doubles.wonLegs(state, state.players[1])], [0]);
	assert.equal(Doubles.matchStats(state.players[1], state).high, 27 + 420 + 100);
});

test('a tie, or everyone out, draws the leg', () => {
	const visits = [];
	for (let i = 0; i < 21; i++) visits.push(1, 1);
	let { state, event } = play(twoPlayers(), ...visits);
	assert.equal(event, 'draw');
	assert.deepEqual(state.results, [null]);
	assert.equal(state.leg, 1);
	assert.ok(state.players.every(p => p.legs === 0));

	// Alone and out: the leg is drawn.
	const solo = Doubles.addPlayer(Doubles.createGame(), 'Solo');
	({ state, event } = play(solo, 0, 0, 0, 0, 0));
	assert.equal(event, 'draw');
	assert.equal(Doubles.legWinner([{ out: false, score: 3 }, { out: true, score: 90 }]), 0);
});

test('removing the thrower hands the throw on', () => {
	let { state } = play(twoPlayers(), 1);
	assert.equal(state.active, 1);
	state = Doubles.removePlayer(state, 1);
	assert.equal(state.active, 0);
	assert.equal(state.players.length, 1);
});

test('stats line and marks', () => {
	const { state } = play(twoPlayers(), 3, 0);
	assert.deepEqual(Doubles.statsLine(state.players[0], state), [['Hits', 3], ['Darts', 3], ['Rate', '100%']]);
	assert.deepEqual(Doubles.historyMarks(state.players[0].turns), [['ton-forty']]);
	assert.deepEqual(Doubles.historyMarks(state.players[1].turns), [['zero']]);
});

test('a saved game loads back the same', () => {
	const visits = [];
	for (let i = 0; i < 21; i++) visits.push(1, 0);
	const { state } = play(twoPlayers({ legs: 3 }), ...visits, 1);
	assert.equal(state.results.length, 1);
	assert.deepEqual(Doubles.restoreGame(JSON.parse(JSON.stringify(state))), state);
	const broken = Doubles.restoreGame({ players: [{ score: 'x', round: 50 }], results: ['a', 3], leg: 1 });
	assert.deepEqual(broken.players[0].score, 27);
	assert.deepEqual(broken.players[0].round, 21);
	assert.deepEqual(broken.results, [null]);
});
