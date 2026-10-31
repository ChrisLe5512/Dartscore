import test from 'node:test';
import assert from 'node:assert/strict';
import { dartPose, dartShape, markSpot, tapDistance } from '../js/dart3d.js';

const straight = { lean: [0, 0], roll: 0 };
// The middle of the shaft's far end.
const tailEnd = shape => [shape.end.cx, shape.end.cy];
const barrelWidth = shape => Math.hypot(shape.across.to[0] - shape.across.from[0], shape.across.to[1] - shape.across.from[1]);

test('dart: in the bull and straight, you look down its tail', () => {
	const shape = dartShape(0, 0, straight);
	assert.ok(Math.hypot(...tailEnd(shape)) < 1e-9);
	// Seen end-on, its round parts look round.
	assert.ok(Math.abs(shape.face.rx - shape.face.ry) < 1e-9);
});

test('dart: seen from the side, its round ends look flattened', () => {
	const { face } = dartShape(0.8, 0, straight);
	assert.ok(face.ry < face.rx * 0.97);
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
	assert.ok(barrelWidth(shape) > 2 * 1.8);
	assert.ok(barrelWidth(dartShape(0.5, 0.5, straight, { away: 60 })) > barrelWidth(shape));
});

test('dart: the same spot gives the same pose; poses vary', () => {
	assert.deepEqual(dartPose(0.31, -0.42), dartPose(0.31, -0.42));
	assert.notDeepEqual(dartPose(0.31, -0.42), dartPose(0.32, -0.42));
});

test('dart: its shadow starts at the point and falls down and right', () => {
	const { shadow } = dartShape(0.1, 0.1, straight);
	assert.deepEqual(shadow.from, [10, 10]);
	assert.ok(shadow.to[0] > 10 && shadow.to[1] > 10);
	assert.equal(dartShape(0.1, 0.1, straight).vanes.length, 4);
});

test('dart: its marker sits beside the point, up and left of the shadow', () => {
	const [mx, my] = markSpot(0.4, 0.3);
	const off = Math.hypot(mx - 0.4, my - 0.3);
	assert.ok(off > 0.05 && off < 0.12);
	assert.ok(mx < 0.4 + 0.02);
});

test('dart: coming out of the board, more of its point shows', () => {
	const extent = shape => Math.max(...shape.point.map(p => Math.hypot(p[0] - shape.point[0][0], p[1] - shape.point[0][1])));
	const side = { lean: [0.4, 0], roll: 0 };
	assert.ok(extent(dartShape(0.5, 0, side, { away: 6 })) > extent(dartShape(0.5, 0, side)) * 1.3);
});

test('dart: a tap on its body or marker reaches it; one well beside it does not', () => {
	const [x, y] = [0.5, 0.2];
	const { end } = dartShape(x, y, dartPose(x, y));
	const onBody = [(x * 100 + end.cx) / 200, (y * 100 + end.cy) / 200];
	assert.ok(tapDistance(x, y, onBody) < 0.01);
	assert.ok(tapDistance(x, y, markSpot(x, y)) < 1e-9);
	assert.ok(tapDistance(x, y, [x - 0.2, y + 0.2]) > 0.1);
});
