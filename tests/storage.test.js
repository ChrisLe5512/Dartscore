import test from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createGame, newMatch, submitTurn } from '../js/game.js';
import { createHistory, record, undo } from '../js/history.js';
import { packSession, unpackSession } from '../js/storage.js';

const dart = { label: 'T20', value: 60, sector: 20, multiplier: 3, x: 0.01, y: -0.5 };

/** A long match entered on the board, every turn an undo step (as in the app). */
function longMatch(players = 4, turns = 400) {
	let game = createGame({ startScore: 501, legs: 15, sets: 15, doubleOut: false });
	for (let i = 0; i < players; i++) game = addPlayer(game);
	let history = createHistory();
	for (let i = 0; i < turns; i++) {
		const p = game.players[game.active];
		const score = p.score > 120 ? 60 : p.score; // keypad-free: three darts every time
		history = record(history, game);
		game = submitTurn(game, score, [dart, dart, { ...dart, value: score - 120 }]).state;
	}
	return { game, history };
}

const roundTrip = session => unpackSession(JSON.parse(JSON.stringify(packSession(session.game, session.history))));

test('a long match saves its undo steps without repeating every turn', () => {
	const session = longMatch();
	const size = JSON.stringify(packSession(session.game, session.history)).length;
	const full = JSON.stringify(session).length;
	// Each step is just its scores and names, not the whole match again.
	const limit = JSON.stringify(session.game).length + session.history.past.length * 1000;
	assert.ok(size < limit, `${size} bytes (${full} unpacked)`);
});

test('packed sessions load back exactly, and pack again just as small', () => {
	let { game, history } = longMatch(2, 60);
	// Some redo steps too, and a new game in the middle of the undo steps.
	history = record(history, game);
	game = newMatch(game);
	game = submitTurn(game, 60).state;
	({ state: game, history } = undo(history, game));
	const loaded = roundTrip({ game, history });
	assert.deepEqual(loaded.game, game);
	assert.deepEqual(loaded.history, history);
	assert.equal(JSON.stringify(packSession(loaded.game, loaded.history)), JSON.stringify(packSession(game, history)));
});

test('saves from before packing still load, and then pack small', () => {
	const session = longMatch(2, 80);
	const loaded = unpackSession(JSON.parse(JSON.stringify(session))); // every step in full
	assert.deepEqual(loaded.history, session.history);
	assert.equal(JSON.stringify(packSession(loaded.game, loaded.history)), JSON.stringify(packSession(session.game, session.history)));
});

test('a broken step loses only the undo steps before it', () => {
	const { game, history } = longMatch(2, 10);
	const packed = JSON.parse(JSON.stringify(packSession(game, history)));
	packed.history.past[4].players[0].turns = 999;
	const loaded = unpackSession(packed);
	assert.equal(loaded.history.past.length, history.past.length - 5);
	assert.deepEqual(loaded.game, game);
	assert.equal(unpackSession({ game: null }), null);
});
