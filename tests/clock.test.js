import test from 'node:test';
import assert from 'node:assert/strict';
import * as Clock from '../js/clock.js';
import { makeDart } from '../js/board.js';

const twoPlayers = (settings = {}) =>
	Clock.addPlayer(Clock.addPlayer(Clock.createGame({ legs: 1, sets: 1, ...settings }), 'Ann'), 'Bob');

function play(state, ...visits) {
	let event;
	for (const v of visits) ({ state, event } = Array.isArray(v) ? Clock.submitTurn(state, 0, v) : Clock.submitTurn(state, v));
	return { state, event };
}

test('players start on 1 and the keypad enters targets hit', () => {
	let s = twoPlayers();
	assert.equal(s.mode, 'clock');
	assert.deepEqual(s.settings, { ring: 'any', skip: false, legs: 1, sets: 1, practice: false });
	assert.equal(Clock.scoreText(s.players[0], s), '1');
	const { state, event } = play(s, 2);
	assert.equal(event, 'turn');
	assert.equal(state.players[0].step, 2);
	assert.equal(state.active, 1);
	assert.equal(Clock.scoreText(state.players[0], state), '3');
	assert.equal(Clock.submitTurn(state, 4).event, null);
	assert.equal(Clock.isValidInput(3), true);
});

test('darts count in order: a later number only once its turn has come', () => {
	const s = twoPlayers();
	// 2 before 1 doesn't count; 1 then 2 does.
	assert.equal(Clock.hitsFrom(0, [makeDart(2, 1), makeDart(1, 3), makeDart(2, 2)], 'any'), 2);
	assert.equal(Clock.dartsValue(s, [makeDart(1, 1)]), 1);
	const { state } = play(s, [makeDart(1, 1), makeDart(2, 1), makeDart(3, 1)]);
	assert.equal(state.players[0].step, 3);
	assert.deepEqual(state.players[0].turns[0].darts, ['1', '2', '3']);
});

test('doubles and trebles variants only count their bed', () => {
	assert.equal(Clock.hitsFrom(0, [makeDart(1, 1), makeDart(1, 3), makeDart(1, 2)], 'double'), 1);
	assert.equal(Clock.hitsFrom(0, [makeDart(1, 2), makeDart(1, 3), makeDart(2, 3)], 'treble'), 2);
	// The bull: bullseye for doubles, either bull otherwise.
	assert.equal(Clock.counts(makeDart(25, 1), 25, 'double'), false);
	assert.equal(Clock.counts(makeDart(25, 2), 25, 'double'), true);
	assert.equal(Clock.counts(makeDart(25, 1), 25, 'treble'), true);
	assert.equal(Clock.targetLabel(4, 'double'), 'D5');
	assert.equal(Clock.targetLabel(20, 'any'), 'Bull');
	assert.equal(Clock.title({ ring: 'treble' }), 'Around the clock: trebles');
});

test('going round wins the leg and the match', () => {
	let s = twoPlayers({ legs: 2 });
	// Ann needs 21 targets: seven visits of three; Bob hits nothing.
	const visits = [];
	for (let i = 0; i < 6; i++) visits.push(3, 0);
	let { state, event } = play(s, ...visits);
	assert.equal(state.players[0].step, 18);
	({ state, event } = play(state, 3));
	assert.equal(event, 'leg');
	assert.equal(state.players[0].legs, 1);
	assert.ok(state.players.every(p => p.step === 0));
	assert.equal(state.leg, 1);
	assert.equal(state.active, 1, 'the next player starts the next leg');
	assert.equal(state.players[0].turns.at(-1).checkout, true);
	assert.equal(Clock.matchStats(state.players[0]).bestLeg, 21);

	// Hitting more than is left just goes round.
	s = Clock.addPlayer(Clock.createGame({ legs: 1 }), 'Solo');
	({ state, event } = play(s, 3, 3, 3, 3, 3, 3, 2, 3));
	assert.equal(event, 'match');
	assert.equal(state.winner, 0);
	assert.equal(state.players[0].turns.at(-1).score, 1);
	assert.equal(Clock.scoreText(state.players[0], state), '✓');
	assert.equal(Clock.submitTurn(state, 1).event, null);
});

test('stats and history marks', () => {
	const { state } = play(twoPlayers(), 3, 0, 1);
	assert.deepEqual(Clock.statsLine(state.players[0], state), [['Hits', 4], ['Darts', 6], ['Rate', '67%']]);
	assert.deepEqual(Clock.statsLine(state.players[1], state), [['Hits', 0], ['Darts', 3], ['Rate', '0%']]);
	assert.deepEqual(Clock.historyMarks(state.players[0].turns), [['ton-forty'], []]);
	assert.deepEqual(Clock.historyMarks(state.players[1].turns), [['zero']]);
	assert.equal(Clock.turnLabel(state.players[0].turns[1]), '1 target');
});

test('a saved game loads back the same, and bad values are repaired', () => {
	const { state } = play(twoPlayers({ ring: 'double' }), [makeDart(1, 2)], 2);
	const loaded = Clock.restoreGame(JSON.parse(JSON.stringify(state)));
	assert.deepEqual(loaded, state);
	const broken = Clock.restoreGame({ ...state, settings: { ring: 'nope' }, players: [{ name: 'X', step: 99 }] });
	assert.equal(broken.settings.ring, 'any');
	assert.equal(broken.players[0].step, 21);
	assert.equal(Clock.restoreGame(null), null);
});

test('new match keeps the players and starts them on 1', () => {
	const { state } = play(twoPlayers(), 3, 2);
	const fresh = Clock.newMatch(state, { ring: 'treble' });
	assert.equal(fresh.settings.ring, 'treble');
	assert.deepEqual(fresh.players.map(p => [p.name, p.step, p.turns.length]), [['Ann', 0, 0], ['Bob', 0, 0]]);
});

test('skip: a double moves on two targets and a treble three; only when any bed counts', () => {
	let s = twoPlayers({ skip: true });
	assert.equal(s.settings.skip, true);
	assert.equal(twoPlayers({ skip: true, ring: 'double' }).settings.skip, false);
	// On 1: D1 moves to 3, T3 to 6, a single 6 to 7.
	let { state } = play(s, [makeDart(1, 2), makeDart(3, 3), makeDart(6, 1)]);
	assert.equal(state.players[0].step, 6);
	assert.equal(state.players[0].turns[0].score, 6);
	assert.equal(Clock.scoreText(state.players[0], state), '7');
	// The keypad enters targets moved on, up to nine.
	assert.equal(Clock.inputMax(state), 9);
	assert.equal(Clock.isValidInput(9, state), true);
	assert.equal(Clock.isValidInput(10, state), false);
	({ state } = play(state, 9));
	assert.equal(state.players[1].step, 9);
	assert.deepEqual(Clock.statsLine(state.players[0], state), [['Moved', 6], ['Darts', 3], ['Per dart', '2.00']]);
	// Never past the bull: a treble 20 from 19 goes round.
	s = { ...twoPlayers({ skip: true }) };
	s.players = s.players.map(p => ({ ...p, step: 18 }));
	({ state } = play(s, [makeDart(19, 3)]));
	assert.equal(state.players[0].step, 21, 'round, on the bull');
	assert.equal(Clock.hitsFrom(20, [makeDart(25, 2)], 'any', true), 1);
});
