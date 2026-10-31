import test from 'node:test';
import assert from 'node:assert/strict';
import { dartPose, dartShape } from '../js/dart3d.js';

const straight = { lean: [0, 0], roll: 0 };
const tailEnd = shape => shape.shaft.b;

test('dart: in the bull and straight, you look down its tail', () => {
	const shape = dartShape(0, 0, straight);
	assert.deepEqual(shape.point.a, [0, 0]);
	assert.ok(Math.hypot(...tailEnd(shape)) < 1e-9);
});

test('dart: further out, its tail splays away from the bull', () => {
	const near = dartShape(0.2, 0, straight);
	const far = dartShape(0.8, 0, straight);
	assert.ok(tailEnd(near)[0] > 20);
	assert.ok(tailEnd(far)[0] - 80 > tailEnd(near)[0] - 20);
	assert.ok(Math.abs(tailEnd(far)[1]) < 1e-9);
});

test('dart: nearer the eye, it is drawn bigger', () => {
	const shape = dartShape(0.5, 0.5, straight);
	assert.ok(shape.barrel.width > 2 * 1.8);
	assert.ok(dartShape(0.5, 0.5, straight, { away: 60 }).barrel.width > shape.barrel.width);
});

test('dart: the same spot gives the same pose; poses vary', () => {
	assert.deepEqual(dartPose(0.31, -0.42), dartPose(0.31, -0.42));
	assert.notDeepEqual(dartPose(0.31, -0.42), dartPose(0.32, -0.42));
});

test('dart: four vanes; no shadow while it is in the air', () => {
	assert.equal(dartShape(0.1, 0.1, straight).vanes.length, 4);
	assert.ok(dartShape(0.1, 0.1, straight).shadow);
	assert.equal(dartShape(0.1, 0.1, straight, { away: 10 }).shadow, null);
});
