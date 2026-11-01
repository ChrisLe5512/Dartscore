import test from 'node:test';
import assert from 'node:assert/strict';
import { DART_VIEW } from '../js/config.js';
import { dartLayout, dartOrder, dartPose, dartSee, dartShape, tapDistance } from '../js/dart3d.js';

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
	const { face } = dartShape(0.8, 0, { lean: [0.5, 0], roll: 0 });
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
	const [{ mark: [mx, my] }] = dartLayout([{ x: 0.4, y: 0.3 }]);
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
	const [place] = dartLayout([{ x, y }]);
	assert.ok(tapDistance({ x, y }, place, onBody) < 0.01);
	assert.ok(tapDistance({ x, y }, place, place.mark) < 1e-9);
	assert.ok(tapDistance({ x, y }, place, [x - 0.2, y + 0.2]) > 0.1);
});

test('dart: shadows fall away from one lamp, so they fan out across the board', () => {
	const angle = ({ from, to }) => Math.atan2(to[1] - from[1], to[0] - from[0]);
	const left = dartShape(-0.7, 0.5, straight).shadow;
	const right = dartShape(0.7, 0.5, straight).shadow;
	assert.ok(angle(right) < angle(left));
});

test('dart: it leans back towards the player, so outer darts splay out less', () => {
	assert.ok(dartPose(0.85, 0).lean[0] < 0);
	assert.ok(dartPose(-0.85, 0).lean[0] > 0);
	assert.ok(dartPose(0, 0.85).lean[1] < 0); // a low dart's tail up, towards the player
	const splay = x => tailEnd(dartShape(x, 0, dartPose(x, 0)))[0] - x * 100;
	assert.ok(splay(0.85) < tailEnd(dartShape(0.85, 0, straight))[0] - 85);
});

test('dart: its angle is its own, unless its flights would land on a dart already in', () => {
	const near = { x: 0.3, y: -0.4 }, far = { x: -0.5, y: 0.5 };
	const layout = dartLayout([near, far, { x: 0.305, y: -0.395 }]);
	assert.deepEqual(layout[0].pose, dartPose(near.x, near.y));
	assert.deepEqual(layout[1].pose, dartPose(far.x, far.y));
	assert.notDeepEqual(layout[2].pose.lean, dartPose(0.305, -0.395).lean);
	assert.equal(layout[2].pose.roll, dartPose(0.305, -0.395).roll);
});

test('dart: pushed aside, its flights end up further from the other, and not far off its own angle', () => {
	const tailGap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) * DART_VIEW.length;
	for (let i = 0; i < 50; i++) {
		const spot = { x: -0.6 + i * 0.024, y: 0.5 - i * 0.02 };
		const [first, second] = dartLayout([spot, spot]).map(({ pose }) => pose.lean);
		const own = dartPose(spot.x, spot.y, DART_VIEW, 1).lean;
		assert.ok(tailGap(first, second) >= tailGap(first, own));
		assert.ok(Math.hypot(second[0] - own[0], second[1] - own[1]) <= DART_VIEW.push + 1e-9);
	}
});

test('dart: darts in the same exact spot each have an angle of their own, kept when redrawn', () => {
	const spot = { x: 0.3, y: -0.4 };
	const poses = () => dartLayout([spot, spot, spot]).map(({ pose }) => pose);
	const [first, second, third] = poses();
	assert.deepEqual(first, dartPose(spot.x, spot.y));
	assert.notDeepEqual(second, first);
	assert.notDeepEqual(third, first);
	assert.notDeepEqual(third, second);
	assert.deepEqual(poses(), [first, second, third]);
});

test('dart: see-through only where its flight covers a dart behind it', () => {
	const seeOf = hits => {
		const layout = dartLayout(hits);
		return { see: dartSee(hits, layout, dartOrder(hits, layout)), order: dartOrder(hits, layout) };
	};
	// Well apart: all solid.
	assert.deepEqual(seeOf([{ x: -0.6, y: 0.5 }, { x: 0.6, y: 0.5 }, { x: 0, y: -0.6 }]).see, [0, 0, 0]);
	// In one spot: the one at the back stays solid, the one in front goes see-through.
	const spot = { x: 0.3, y: -0.4 };
	const { see, order } = seeOf([spot, spot]);
	assert.equal(see[order[0]], 0);
	assert.equal(see[order[1]], 1);
	// A dart just below another: its tail, up, covers the other's point.
	const { see: stacked } = seeOf([{ x: 0.1, y: -0.45 }, { x: 0.1, y: -0.3 }]);
	assert.ok(stacked[1] > 0);
	assert.equal(stacked[0], 0);
});

test('dart: where two cross on screen, the nearer the eye there is drawn in front', () => {
	const pose = { lean: [0, -0.3], roll: 0 }; // tails well up
	const low = { x: 0, y: -0.3 }, high = { x: 0, y: -0.4 };
	const place = () => ({ pose, mark: [0, 0] });
	// The low dart's tail passes in front of the high dart's point, whichever was thrown first.
	assert.deepEqual(dartOrder([high, low], [place(), place()]), [0, 1]);
	assert.deepEqual(dartOrder([low, high], [place(), place()]), [1, 0]);
});

test('dart: apart from that, the later thrown is in front', () => {
	const pose = { lean: [0, 0], roll: 0 };
	const place = () => ({ pose, mark: [0, 0] });
	assert.deepEqual(dartOrder([{ x: 0.2, y: 0 }, { x: 0.2, y: 0 }], [place(), place()]), [0, 1]);
});

test('dart: markers in a tight group do not overlap', () => {
	const layout = dartLayout([{ x: 0.3, y: -0.4 }, { x: 0.305, y: -0.395 }, { x: 0.295, y: -0.4 }]);
	for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) {
		const [p, q] = [layout[a].mark, layout[b].mark];
		assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1]) >= 0.06, `markers ${a} and ${b}`);
	}
});

test('an almost straight dart keeps its shading through the wobble', () => {
	const pose = { lean: [0.002, 0], roll: 0 };
	const direction = sway => {
		const { across } = dartShape(0.01, 0, pose, { sway });
		const [dx, dy] = [across.to[0] - across.from[0], across.to[1] - across.from[1]];
		return [dx, dy].map(v => v / Math.hypot(dx, dy));
	};
	const rest = direction([0, 0]);
	for (const sway of [[0.05, 0], [-0.05, 0], [0, 0.05], [0, -0.05]]) {
		const swung = direction(sway);
		assert.ok(rest[0] * swung[0] + rest[1] * swung[1] > 0.99);
	}
});
