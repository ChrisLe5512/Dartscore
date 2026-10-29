import test from 'node:test';
import assert from 'node:assert/strict';
import { describeTravel, describeTurn } from '../js/feedback.js';
import { addPlayer, createGame, movePlayer, newMatch, submitTurn } from '../js/game.js';

const twoPlayers = () =>
	addPlayer(addPlayer(createGame({ startScore: 301, legs: 2, sets: 1 }), 'Ann'), 'Bob');

const throwTurn = (state, score) => submitTurn(state, score).state;

test('turns: bust, leg, set and 180 get a message, ordinary turns do not', () => {
	const s = twoPlayers();
	assert.deepEqual(describeTurn(s, 'bust', 0), { kind: 'bust', title: 'Bust', detail: 'Ann' });
	assert.equal(describeTurn(s, 'leg', 40).detail, 'Ann wins the leg');
	assert.equal(describeTurn(s, 'set', 40).detail, 'Ann wins the set');
	assert.deepEqual(describeTurn(s, 'turn', 180), { kind: 'win', title: '180!', detail: 'Ann' });
	assert.equal(describeTurn(s, 'turn', 60), null);
	assert.equal(describeTurn(s, 'match', 40), null);
});

test('undo and redo of a turn name the player and score', () => {
	const before = twoPlayers();
	const after = throwTurn(before, 60);
	assert.equal(describeTravel(after, before, 'undo').detail, "Ann's 60");
	assert.equal(describeTravel(before, after, 'redo').detail, "Ann's 60");
});

test('undoing a bust says bust', () => {
	const before = throwTurn(throwTurn(twoPlayers(), 180), 60);
	const after = throwTurn(before, 180);
	assert.equal(describeTravel(after, before, 'undo').detail, "Ann's bust");
});

test('undoing a leg-winning turn says the leg reopened', () => {
	let s = twoPlayers();
	s = throwTurn(throwTurn(throwTurn(s, 180), 60), 81);
	const before = throwTurn(s, 60);
	const after = throwTurn(before, 40);
	assert.equal(describeTravel(after, before, 'undo').detail, "Ann's 40, leg reopened");
	assert.equal(describeTravel(before, after, 'redo').detail, "Ann's 40, leg won");
});

test('undoing a match-winning turn says the match reopened', () => {
	let s = addPlayer(createGame({ startScore: 301, legs: 1, sets: 1 }), 'Ann');
	s = throwTurn(throwTurn(s, 180), 81);
	const after = throwTurn(s, 40);
	assert.equal(after.winner, 0);
	assert.equal(describeTravel(after, s, 'undo').detail, "Ann's 40, match reopened");
});

test('undo across a new game goes back to the previous game', () => {
	const played = throwTurn(throwTurn(twoPlayers(), 60), 45);
	const fresh = newMatch(played);
	assert.equal(describeTravel(fresh, played, 'undo').detail, 'Back to the previous game');
	assert.equal(describeTravel(played, fresh, 'redo').detail, 'New game');
});

test('player and settings changes get a generic message', () => {
	const s = twoPlayers();
	assert.equal(describeTravel(movePlayer(s, 0, 1), s, 'undo').detail, 'Players changed');
	assert.equal(describeTravel(addPlayer(s), s, 'undo').detail, 'Players changed');
	assert.equal(describeTravel(newMatch(s, { ...s.settings, startScore: 501 }), s, 'undo').detail, 'Settings changed');
});
