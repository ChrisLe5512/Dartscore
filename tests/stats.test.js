import test from 'node:test';
import assert from 'node:assert/strict';
import { matchStats } from '../js/stats.js';

const SETTINGS = { startScore: 301, doubleOut: true };

test('matchStats gives the three-dart average and visits', () => {
	const none = matchStats({ turns: [] }, SETTINGS);
	assert.equal(none.average, 0);
	assert.equal(none.visits, 0);
	const player = { turns: [{ score: 100 }, { score: 0, bust: true }, { score: 41, darts: ['T7', 'D10'], checkout: true }] };
	const stats = matchStats(player, SETTINGS);
	assert.equal(stats.visits, 3);
	assert.equal(stats.average.toFixed(2), (141 / 8 * 3).toFixed(2));
});

test('a visit that doesn\'t win the leg is three darts, however many were tapped', () => {
	const stats = matchStats({ turns: [{ score: 40, darts: ['20', '20'] }] }, SETTINGS);
	assert.equal(stats.average, 40);
});

test('matchStats: first 9, checkout %, best leg, high finish and tons', () => {
	const turns = [
		// Leg 0, won in 11 darts: 100, 140, 21 (finishable), 40 in two darts.
		{ score: 100, leg: 0 }, { score: 140, leg: 0 }, { score: 0, leg: 0, bust: true, attempted: 41 },
		{ score: 61, leg: 0, darts: ['T7', 'D20'], checkout: true },
		// Leg 1, lost: 180, then 60 (on 121: a chance) and 26 (on 61).
		{ score: 180, leg: 1 }, { score: 60, leg: 1 }, { score: 26, leg: 1 },
	];
	const stats = matchStats({ turns }, SETTINGS);
	assert.equal(stats.first9.toFixed(2), ((100 + 140 + 0 + 180 + 60 + 26) / 18 * 3).toFixed(2));
	assert.equal(stats.finishes, 1);
	assert.equal(stats.chances, 4); // on 61 and 61 in leg 0; on 121 and 61 in leg 1
	assert.equal(stats.bestLeg, 11);
	assert.equal(stats.highFinish, 61);
	assert.deepEqual(stats.tons, { 100: 1, 140: 1, 180: 1 });
});

test('matchStats with nothing thrown', () => {
	const stats = matchStats({ turns: [] }, SETTINGS);
	assert.equal(stats.chances, 0);
	assert.equal(stats.bestLeg, null);
	assert.equal(stats.highFinish, null);
});
