import test from 'node:test';
import assert from 'node:assert/strict';
import { describeTravel, describeTurn, historyLegs, historyMarks, OUTCOME_WORDS, undoWarning } from '../js/feedback.js';
import { addPlayer, createGame, movePlayer, newMatch, removePlayer, submitTurn } from '../js/game.js';

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

test('undo asks first only when it takes back more than a turn', () => {
	const s = twoPlayers();
	const turn = throwTurn(s, 60);
	assert.equal(undoWarning(turn, s), null); // a plain turn

	let leg = throwTurn(throwTurn(throwTurn(s, 180), 60), 81);
	leg = throwTurn(leg, 60);
	const legWon = throwTurn(leg, 40);
	assert.deepEqual(undoWarning(legWon, leg), { title: 'Back to the last leg?', detail: "Ann's 40 won it; undoing takes that back." });

	let one = addPlayer(createGame({ startScore: 301, legs: 1, sets: 1 }), 'Ann');
	one = throwTurn(throwTurn(one, 180), 81);
	assert.equal(undoWarning(throwTurn(one, 40), one).title, 'Reopen the match?');

	assert.equal(undoWarning(newMatch(turn), turn).title, 'Back to the last game?');
	assert.equal(undoWarning(addPlayer(s, 'Cat'), s).title, 'Remove Cat?');
	assert.equal(undoWarning(removePlayer(s, 1), s).title, 'Bring back Bob?');
	assert.equal(undoWarning(movePlayer(s, 0, 1), s).title, 'Undo the player change?');
	assert.equal(undoWarning(newMatch(s, { ...s.settings, startScore: 501 }), s).title, 'Back to the last settings?');
});

test('history in legs: earlier legs are done, won where the player checked out', () => {
	const turns = [
		{ score: 100, leg: 0 }, { score: 41, leg: 0, checkout: true },
		{ score: 60, leg: 1 },
		{ score: 26, leg: 2 }, { score: 45, leg: 2 },
	];
	assert.deepEqual(historyLegs(turns, 2), [
		{ leg: 0, turns: [0, 1], done: true, won: true },
		{ leg: 1, turns: [2], done: true, won: false },
		{ leg: 2, turns: [3, 4], done: false, won: false },
	]);
	// Saved before legs were recorded: all in the current leg.
	assert.deepEqual(historyLegs([{ score: 60 }, { score: 45 }], 3), [{ leg: 3, turns: [0, 1], done: false, won: false }]);
});

test('history marks: busts, zeros, tons, 180s, checkouts and the best visit', () => {
	const marks = historyMarks([
		{ score: 0, bust: true, attempted: 60 },
		{ score: 0 },
		{ score: 100 },
		{ score: 140 },
		{ score: 180 },
		{ score: 50, darts: ['B'] },
		{ score: 40, checkout: true },
		{ score: 26 },
	]);
	assert.deepEqual(marks, [
		['bust'], ['zero'], ['ton'], ['ton-forty'], ['max', 'best'], [], ['finish'], [],
	]);
	// No best until there is another visit to compare it with.
	assert.deepEqual(historyMarks([{ score: 60 }]), [[]]);
	assert.deepEqual(historyMarks([{ score: 60 }, { score: 45 }]), [['best'], []]);
});

test('the leg-winning visit is recorded as a checkout', () => {
	let s = addPlayer(createGame({ startScore: 301, legs: 3, sets: 1 }), 'Ann');
	s = throwTurn(s, 180);
	s = throwTurn(s, 121);
	assert.deepEqual(s.players[0].turns.map(t => t.checkout ?? false), [false, true]);
});

test('undoing a new game that changed both the game and the players says so', async () => {
	const { newGame } = await import('../js/modes.js');
	const before = newGame('x01', {}, ['Ann']);
	const after = newGame('121', {}, ['Ann', 'Bob'], before);
	assert.equal(undoWarning(after, before).title, 'Back to the last game?');
	const samePlayers = newGame('121', {}, ['Ann'], before);
	assert.equal(undoWarning(samePlayers, before).title, 'Back to the last settings?');
});

test('what sending a turn would do has a word for a bust, leg, set and match, not an ordinary turn', () => {
	const game = settings => addPlayer(createGame({ startScore: 301, ...settings }), 'Ann');
	const word = (state, score) => OUTCOME_WORDS[submitTurn(state, score, null).event];
	const onLast = settings => {
		const state = game(settings);
		return { ...state, players: state.players.map(p => ({ ...p, score: 40 })) };
	};
	assert.equal(word(onLast({ legs: 2, sets: 1 }), 20), undefined);
	assert.equal(word(onLast({ legs: 2, sets: 1 }), 60), 'Bust');
	assert.equal(word(onLast({ legs: 2, sets: 1 }), 40), 'Leg');
	assert.equal(word(onLast({ legs: 1, sets: 2 }), 40), 'Set');
	assert.equal(word(onLast({ legs: 1, sets: 1 }), 40), 'Game');
});

test('the star: one per leg, the first to reach the top score, and green for the game once there are two legs', () => {
	const marks = turns => historyMarks(turns).map(list => list.filter(m => m.startsWith('best')));
	// A tie doesn't take it.
	assert.deepEqual(marks([{ score: 60, leg: 0 }, { score: 85, leg: 0 }, { score: 85, leg: 0 }, { score: 85, leg: 0 }]), [[], ['best'], [], []]);
	// The first leg alone: the leg's star. Then the top of them all goes green; each other leg keeps its own.
	assert.deepEqual(marks([
		{ score: 100, leg: 0 }, { score: 40, leg: 0 },
		{ score: 60, leg: 1 }, { score: 45, leg: 1 },
	]), [['best-game'], [], ['best'], []]);
	// Tying the game's top in a later leg: that leg's star only.
	assert.deepEqual(marks([
		{ score: 100, leg: 0 }, { score: 40, leg: 0 },
		{ score: 100, leg: 1 }, { score: 45, leg: 1 },
	]), [['best-game'], [], ['best'], []]);
	// Nothing scored: no star.
	assert.deepEqual(marks([{ score: 0, leg: 0 }, { score: 0, leg: 0 }]), [[], []]);
});
