import test from 'node:test';
import assert from 'node:assert/strict';
import {
	addPlayer, createGame, isValidTurnScore, movePlayer, movePlayerTo, newMatch, removePlayer,
	playerStats, renamePlayer, restoreGame, setActive, submitTurn,
} from '../js/game.js';
import { makeDart } from '../js/board.js';

const twoPlayers = (settings = {}) =>
	addPlayer(addPlayer(createGame({ startScore: 301, legs: 2, sets: 1, ...settings }), 'Ann'), 'Bob');

function play(state, ...scores) {
	let event;
	for (const s of scores) ({ state, event } = submitTurn(state, s));
	return { state, event };
}

test('players are added with defaults and capped at twelve', () => {
	let s = createGame();
	for (let i = 0; i < 14; i++) s = addPlayer(s);
	assert.equal(s.players.length, 12);
	assert.deepEqual(s.players.slice(0, 4).map(p => p.name), ['Player 1', 'Player 2', 'Player 3', 'Player 4']);
	assert.equal(s.players[11].name, 'Player 12');
	assert.ok(s.players.every(p => p.score === 301));
	assert.equal(new Set(s.players.map(p => p.id)).size, 12);
});

test('names are trimmed, limited and never blank', () => {
	let s = addPlayer(createGame(), '   <b>Ann</b>   ');
	assert.equal(s.players[0].name, '<b>Ann</b>');
	s = renamePlayer(s, 0, '   ');
	assert.equal(s.players[0].name, '<b>Ann</b>');
	s = renamePlayer(s, 0, 'x'.repeat(100));
	assert.equal(s.players[0].name.length, 24);
});

test('turns subtract and pass to the next player', () => {
	const { state, event } = play(twoPlayers(), 60);
	assert.equal(event, 'turn');
	assert.equal(state.players[0].score, 241);
	assert.equal(state.active, 1);
});

test('adding a player mid-game keeps everyone else\'s scores', () => {
	let { state } = play(twoPlayers(), 60, 45);
	state = addPlayer(state, 'Cat');
	assert.deepEqual(state.players.map(p => p.score), [241, 256, 301]);
});

test('going below zero is a bust and is recorded as 0', () => {
	let { state } = play(twoPlayers(), 180, 0, 100); // Ann on 21
	const result = submitTurn(state, 0);
	({ state } = submitTurn(result.state, 40));
	assert.equal(state.players[0].score, 21);
	assert.deepEqual(state.players[0].turns.at(-1), { score: 0, bust: true, attempted: 40 });
	assert.equal(state.active, 1);
});

test('impossible turn totals are rejected', () => {
	for (const s of [-1, 181, 179, 172, 163, 1.5]) assert.equal(isValidTurnScore(s), false, String(s));
	for (const s of [0, 1, 60, 171, 180]) assert.equal(isValidTurnScore(s), true, String(s));
	const { state, event } = submitTurn(twoPlayers(), 179);
	assert.equal(event, null);
	assert.equal(state.players[0].score, 301);
});

test('winning a leg resets scores and rotates the starting player', () => {
	let { state, event } = play(twoPlayers(), 180, 0, 121);
	assert.equal(event, 'leg');
	assert.equal(state.players[0].legs, 1);
	assert.deepEqual(state.players.map(p => p.score), [301, 301]);
	assert.equal(state.starter, 1);
	assert.equal(state.active, 1, 'Bob starts leg 2');
});

test('winning a set resets everyone\'s legs, not just the winner\'s', () => {
	let state = twoPlayers({ legs: 2, sets: 2 });
	({ state } = play(state, 180, 0, 121)); // Ann leg 1, Bob starts leg 2
	({ state } = play(state, 180, 0, 121)); // Bob leg 1, Ann starts leg 3
	assert.deepEqual(state.players.map(p => p.legs), [1, 1]);
	const result = play(state, 180, 0, 121); // Ann wins leg -> set
	assert.equal(result.event, 'set');
	assert.deepEqual(result.state.players.map(p => p.legs), [0, 0]);
	assert.deepEqual(result.state.players.map(p => p.sets), [1, 0]);
});

test('winning the match locks the game until a new match', () => {
	let state = twoPlayers({ legs: 1, sets: 1 });
	const result = play(state, 180, 0, 121);
	assert.equal(result.event, 'match');
	assert.equal(result.state.winner, 0);
	assert.equal(result.state.players[0].score, 0, 'board stays as it finished');
	assert.equal(submitTurn(result.state, 60).event, null);
	const fresh = newMatch(result.state);
	assert.equal(fresh.winner, null);
	assert.deepEqual(fresh.players.map(p => [p.name, p.score, p.legs, p.sets, p.turns.length]),
		[['Ann', 301, 0, 0, 0], ['Bob', 301, 0, 0, 0]]);
});

test('double out: finishing on a non-double or leaving 1 is a bust', () => {
	let { state } = play(twoPlayers({ doubleOut: true }), 180, 0, 81, 0); // Ann on 40, her turn
	assert.equal(state.players[0].score, 40);
	assert.equal(submitTurn(state, 39).event, 'bust', 'leaves 1');
	const single = [makeDart(20, 1), makeDart(20, 1)];
	assert.equal(submitTurn(state, 40, single).event, 'bust', 'finished on a single');
	const double = [makeDart(20, 2)];
	assert.equal(submitTurn(state, 40, double).event, 'leg');
	const withMiss = [makeDart(20, 2), makeDart(5, 0)];
	assert.equal(submitTurn(state, 40, withMiss).event, 'leg', 'a miss after the double still counts');
});

test('double out: keypad finishes only allowed when a double finish exists', () => {
	let s = createGame({ startScore: 301, doubleOut: true });
	s = addPlayer(s);
	s = { ...s, players: [{ ...s.players[0], score: 168 }] };
	assert.equal(submitTurn(s, 168).event, 'bust');
	s = { ...s, players: [{ ...s.players[0], score: 170 }] };
	assert.notEqual(submitTurn(s, 170).event, 'bust');
});

test('without double out, any exact finish wins the leg', () => {
	let { state } = play(twoPlayers(), 180, 0, 81, 0); // Ann on 40, her turn
	assert.equal(submitTurn(state, 40, [makeDart(20, 1), makeDart(20, 1)]).event, 'leg');
});

test('removing and moving players keeps active/starter/winner pointing at the right people', () => {
	let s = addPlayer(twoPlayers(), 'Cat');
	({ state: s } = play(s, 10)); // Bob active
	assert.equal(s.players[s.active].name, 'Bob');
	let r = removePlayer(s, 0);
	assert.equal(r.players[r.active].name, 'Bob');
	r = removePlayer(s, 1);
	assert.equal(r.players[r.active].name, 'Cat', 'next player takes the turn');
	r = removePlayer(s, 2);
	assert.equal(r.players[r.active].name, 'Bob');
	const m = movePlayer(s, 1, -1);
	assert.deepEqual(m.players.map(p => p.name), ['Bob', 'Ann', 'Cat']);
	assert.equal(m.players[m.active].name, 'Bob');
	assert.equal(movePlayer(s, 0, -1), s);
	const empty = removePlayer(removePlayer(removePlayer(s, 0), 0), 0);
	assert.equal(empty.players.length, 0);
	assert.equal(empty.active, 0);
});

test('restoreGame repairs bad saves and rejects garbage', () => {
	assert.equal(restoreGame(null), null);
	assert.equal(restoreGame({ players: 'nope' }), null);
	const s = restoreGame({
		settings: { startScore: 999, legs: -4, sets: 'x', doubleOut: 1 },
		players: [{ name: '', score: 5000, turns: [{ score: 60 }, null, { bad: true }] }],
		active: 7, winner: 3,
	});
	assert.deepEqual(s.settings, { startScore: 301, legs: 1, sets: 2, doubleOut: true });
	assert.equal(s.players[0].name, 'Player 1');
	assert.equal(s.players[0].score, 301);
	assert.deepEqual(s.players[0].turns, [{ score: 60 }]);
	assert.equal(s.active, 0);
	assert.equal(s.winner, null);
	const round = restoreGame(JSON.parse(JSON.stringify(play(twoPlayers(), 60, 45).state)));
	assert.deepEqual(round, play(twoPlayers(), 60, 45).state);
});

test('board turns keep where each dart landed', () => {
	const s = twoPlayers();
	const at = (dart, x, y) => ({ ...dart, x, y });
	const darts = [at(makeDart(20, 3), 0.01234, -0.4), at(makeDart(1, 1), 0.2, -0.6), at(makeDart(5, 1), -0.2, -0.6)];
	const { state } = submitTurn(s, 61, darts);
	assert.deepEqual(state.players[0].turns[0].hits, [[0.012, -0.4], [0.2, -0.6], [-0.2, -0.6]]);
	assert.deepEqual(state.players[0].turns[0].darts, ['T20', '1', '5']);

	// Keypad turns and darts without positions have no hits.
	assert.equal(submitTurn(s, 60).state.players[0].turns[0].hits, undefined);
	assert.equal(submitTurn(s, 60, [makeDart(20, 3)]).state.players[0].turns[0].hits, undefined);
});

test('restoreGame keeps valid hits and drops broken ones', () => {
	const raw = {
		players: [{ id: 1, name: 'Ann', score: 240, turns: [
			{ score: 61, darts: ['T20', '1'], hits: [[0, -0.4], [0.2, -0.6]] },
			{ score: 0, darts: ['0'], hits: [['x', 1]] },
			{ score: 0, darts: ['0', '0'], hits: [[0, 0]] },
		] }],
	};
	const turns = restoreGame(raw).players[0].turns;
	assert.deepEqual(turns[0].hits, [[0, -0.4], [0.2, -0.6]]);
	assert.equal(turns[1].hits, undefined);
	assert.equal(turns[2].hits, undefined);
});

test('playerStats gives the three-dart average, darts thrown and best turn', () => {
	assert.deepEqual(playerStats({ turns: [] }), { average: 0, darts: 0, best: 0 });
	const player = { turns: [{ score: 100 }, { score: 0, bust: true }, { score: 41, darts: ['T7', 'D10'] }] };
	const stats = playerStats(player);
	assert.equal(stats.darts, 8);
	assert.equal(stats.best, 100);
	assert.equal(stats.average.toFixed(2), (141 / 8 * 3).toFixed(2));
});

test('movePlayerTo moves a player to any place and keeps active pointing at the thrower', () => {
	let s = addPlayer(addPlayer(twoPlayers(), 'Cy'), 'Di');
	s = submitTurn(s, 60).state; // Bob throws next
	const names = state => state.players.map(p => p.name).join(' ');
	const down = movePlayerTo(s, 0, 3);
	assert.equal(names(down), 'Bob Cy Di Ann');
	assert.equal(down.players[down.active].name, 'Bob');
	const up = movePlayerTo(s, 3, 1);
	assert.equal(names(up), 'Ann Di Bob Cy');
	assert.equal(up.players[up.active].name, 'Bob');
	assert.equal(movePlayerTo(s, 1, 1), s);
	assert.equal(movePlayerTo(s, 0, 9), s);
});

test('setActive hands the throw to another player, but not after the match is won', () => {
	const s = twoPlayers();
	assert.equal(setActive(s, 1).active, 1);
	assert.equal(setActive(s, 0), s);
	assert.equal(setActive(s, 5), s);
	assert.equal(setActive({ ...s, winner: 0 }, 1).active, 0);
});
