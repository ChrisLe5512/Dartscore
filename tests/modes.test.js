import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CHOICES, MODES, choiceOf, createGame, modeOf, restoreGame, startMatch, wonLegs } from '../js/modes.js';
import { describeTravel, describeTurn, historyLegs, undoWarning } from '../js/feedback.js';
import * as Game from '../js/game.js';
import { createHistory, record, undo } from '../js/history.js';
import { packSession, unpackSession } from '../js/storage.js';

const withPlayers = state => modeOf(state).addPlayer(modeOf(state).addPlayer(state, 'Ann'), 'Bob');

test('a game without a mode is X01, and every mode has the same parts', () => {
	assert.equal(modeOf(createGame()).id, 'x01');
	assert.equal(modeOf({ mode: 'nope' }).id, 'x01');
	assert.equal(createGame().mode, undefined, 'X01 games look just as they did before modes');
	const parts = ['createGame', 'normalizeSettings', 'newMatch', 'addPlayer', 'renamePlayer', 'removePlayer', 'movePlayer',
		'movePlayerTo', 'setActive', 'canAddPlayer', 'submitTurn', 'restoreGame', 'isValidInput', 'scoreText', 'checkoutFrom',
		'hint', 'dartsValue', 'turnText', 'turnLabel', 'historyMarks', 'matchStats', 'statsLine', 'title'];
	for (const [key, mode] of Object.entries(MODES)) {
		assert.equal(mode.id, key);
		for (const part of parts) assert.equal(typeof mode[part], 'function', `${key}.${part}`);
		assert.ok(mode.STAT_ROWS.length && Number.isInteger(mode.maxInput));
	}
});

test('switching mode keeps the players and their order, nothing else', () => {
	let s = withPlayers(Game.createGame({ startScore: 301 }));
	s = Game.submitTurn(s, 60).state;
	const clock = startMatch(s, 'clock', { ring: 'double', legs: 2 });
	assert.equal(clock.mode, 'clock');
	assert.deepEqual(clock.players, [
		{ id: 1, name: 'Ann', step: 0, legs: 0, sets: 0, turns: [] },
		{ id: 2, name: 'Bob', step: 0, legs: 0, sets: 0, turns: [] },
	]);
	assert.equal(clock.nextId, 3);
	assert.deepEqual(clock.settings, { ring: 'double', legs: 2, sets: 1, practice: false });
	assert.equal(choiceOf(clock).value, 'clock-double');

	// And back: an X01 game as if it had never been anything else.
	const x01 = startMatch(clock, 'x01', { startScore: 701 });
	assert.deepEqual(x01, Game.newMatch(Game.addPlayer(Game.addPlayer(Game.createGame(), 'Ann'), 'Bob'), { startScore: 701 }));
	assert.equal(choiceOf(x01).value, '701');
	assert.equal(GAME_CHOICES.filter(c => c.mode === 'x01').length, 3);
});

test('saves of every mode load back, packed undo steps included', () => {
	for (const mode of ['x01', 'clock', 'doubles', '121']) {
		let game = withPlayers(startMatch(createGame(), mode, {}));
		let history = createHistory();
		for (let i = 0; i < 40; i++) {
			history = record(history, game);
			const next = modeOf(game).submitTurn(game, i % 3).state;
			if (next === game) break;
			game = next;
		}
		history = record(history, game);
		game = startMatch(game, mode, {});
		({ state: game, history } = undo(history, game)); // a redo step too
		const json = JSON.stringify(packSession(game, history));
		const loaded = unpackSession(JSON.parse(json));
		assert.deepEqual(loaded.game, game, mode);
		assert.deepEqual(loaded.history, history, mode);
		assert.equal(JSON.stringify(packSession(loaded.game, loaded.history)), json, `${mode} packs again the same`);
		assert.ok(json.length < JSON.stringify({ game, history }).length / 2, `${mode} packs small`);
		assert.equal(restoreGame(JSON.parse(JSON.stringify(game))).mode, game.mode);
	}
});

test('messages for the practice modes', () => {
	const Doubles = MODES.doubles;
	let s = withPlayers(Doubles.createGame({ legs: 3 }));
	for (let i = 0; i < 41; i++) s = Doubles.submitTurn(s, 1).state;
	const before = s;
	const { state: after, event } = Doubles.submitTurn(s, 0); // Bob's last bull misses, Ann wins
	assert.equal(event, 'leg');
	assert.equal(describeTurn(before, event, 0, after).detail, 'Ann wins the leg');
	assert.equal(describeTravel(after, before, 'undo', Doubles.turnLabel).detail, "Bob's −50, leg reopened");
	assert.equal(undoWarning(after, before, Doubles.turnLabel).detail, "Bob's −50 ended it; undoing takes that back.");
	assert.deepEqual(historyLegs(after.players[0].turns, after.leg, wonLegs(after, after.players[0]))[0].won, true);
	assert.deepEqual(historyLegs(after.players[1].turns, after.leg, wonLegs(after, after.players[1]))[0].won, false);
	assert.equal(wonLegs(Game.createGame(), {}), null);

	const One21 = MODES[121];
	const t = withPlayers(One21.createGame());
	const out = One21.submitTurn(t, 121, null);
	assert.deepEqual(describeTurn(t, out.event, 121, out.state), { kind: 'win', title: 'Checkout', detail: 'Ann · 122 next' });
	assert.deepEqual(describeTurn(t, 'draw', 0, t), { kind: 'info', title: 'Leg', detail: 'Drawn' });
	assert.equal(describeTravel(startMatch(t, 'clock', {}), t, 'undo').detail, 'Settings changed');
});
