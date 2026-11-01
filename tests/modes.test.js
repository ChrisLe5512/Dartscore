import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CHOICES, MODES, choiceOf, createGame, modeOf, newGame, restoreGame, wonLegs } from '../js/modes.js';
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
		assert.ok(mode.STAT_ROWS.length && Number.isInteger(mode.maxInput) && Array.isArray(mode.OPTIONS));
		for (const option of mode.OPTIONS) {
			const values = option.type === 'choice' ? option.choices.map(([value]) => value) : [true];
			for (const value of values) assert.equal(mode.normalizeSettings({ ring: 'any', [option.key]: value })[option.key], value, `${option.key} keeps ${value}`);
		}
	}
});

test('switching mode keeps the players and their order, nothing else', () => {
	let s = withPlayers(Game.createGame({ startScore: 301 }));
	s = Game.submitTurn(s, 60).state;
	const names = ['Ann', 'Bob'];
	const clock = newGame('clock', { ring: 'double', legs: 2 }, names, s);
	assert.equal(clock.mode, 'clock');
	assert.deepEqual(clock.players, [
		{ id: 1, name: 'Ann', step: 0, legs: 0, sets: 0, turns: [] },
		{ id: 2, name: 'Bob', step: 0, legs: 0, sets: 0, turns: [] },
	]);
	assert.deepEqual(clock.settings, { ring: 'double', skip: false, legs: 2, sets: 1, practice: false });
	assert.equal(choiceOf(clock).value, 'clock');

	// And back: an X01 game as if it had never been anything else.
	const x01 = newGame('x01', { startScore: 701 }, names, clock);
	const plain = Game.newMatch(Game.addPlayer(Game.addPlayer(Game.createGame(), 'Ann'), 'Bob'), { startScore: 701 });
	assert.deepEqual({ ...x01, nextId: 0 }, { ...plain, nextId: 0 });
	assert.deepEqual(x01.players.map(p => p.id), [1, 2]);
	assert.equal(choiceOf(x01).value, '701');
	assert.equal(GAME_CHOICES.filter(c => c.mode === 'x01').length, 3);
});

test('saves of every mode load back, packed undo steps included', () => {
	for (const mode of ['x01', 'clock', 'doubles', '121']) {
		const names = ['Ann', 'Bob'];
		let game = newGame(mode, {}, names);
		let history = createHistory();
		for (let i = 0; i < 40; i++) {
			history = record(history, game);
			const next = modeOf(game).submitTurn(game, i % 3).state;
			if (next === game) break;
			game = next;
		}
		history = record(history, game);
		game = newGame(mode, {}, names, game);
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
	assert.equal(describeTravel(newGame('clock', {}, ['Ann', 'Bob'], t), t, 'undo').detail, 'Settings changed');
});

test('a new game with chosen players, in order, all at the start', () => {
	const s = newGame('121', { legs: 2 }, ['Ann', ' ', 'Cat']);
	assert.equal(s.mode, '121');
	assert.deepEqual(s.players.map(p => p.name), ['Ann', 'Player 2', 'Cat']);
	assert.deepEqual(s.players.map(p => p.target), [121, 121, 121]);
	assert.equal(s.settings.legs, 2);
	const x01 = newGame('x01', { startScore: 301 }, ['Solo']);
	assert.equal(x01.mode, undefined);
	assert.equal(x01.players[0].score, 301);
	assert.equal(newGame('x01', {}, []).players.length, 0);
});

test('players who play again keep their id; newcomers get new ones', () => {
	const before = newGame('x01', {}, ['Ann', 'Bob', 'Cat']);
	const after = newGame('clock', {}, ['Cat', 'Dan', 'Ann'], before);
	const [cat, dan, ann] = after.players;
	assert.deepEqual([cat.id, ann.id], [3, 1]);
	assert.ok(dan.id > 3 && after.nextId > dan.id, 'Dan is new');
});

test('X01 stats line: average and checkout over the match, darts for this leg', () => {
	const line = (turns, leg) => MODES.x01.statsLine({ turns }, { leg, settings: { startScore: 101, doubleOut: true } });
	assert.deepEqual(line([], 0), [['Avg', '–'], ['CO', '–'], ['Leg darts', 0]]);
	// A leg won in 2 visits (5 darts), then a second begun: 161 points in 8 darts; all
	// 3 visits started on a finish (from 101), and 1 of them went out.
	const turns = [
		{ score: 61, leg: 0 },
		{ score: 40, leg: 0, checkout: true, darts: ['20', 'D10'] },
		{ score: 60, leg: 1 },
	];
	assert.deepEqual(line(turns, 1), [['Avg', '60.4'], ['CO', '33%'], ['Leg darts', 3]]);
	assert.deepEqual(line(turns, 0), [['Avg', '60.4'], ['CO', '33%'], ['Leg darts', 5]]);
});
