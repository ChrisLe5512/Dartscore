// A dart stuck in the board, seen in perspective from an eye in front of the
// bull: near the bull you look down its tail; further out it splays outward.
// Pure geometry: positions in board units (100 = the board's edge), the board
// at z = 0 and the eye at z = DART_VIEW.eye. dartboard.js draws the shapes.

import { DART_VIEW } from './config.js';

// Along the dart from its point (fractions of its length): where each part
// starts and ends, and its radius in board units.
const PARTS = {
	point: { from: 0, to: 0.2, r: 0.35 },
	barrel: { from: 0.2, to: 0.53, r: 1.8 },
	shaft: { from: 0.53, to: 0.75, r: 0.85 },
};
// One vane of the flight: [along, out] corners, fractions of the length.
const VANE = [[0.71, 0], [0.82, 0.17], [0.99, 0.17], [1, 0]];

/** The same random numbers for the same spot every time: a dart keeps its pose when redrawn. */
function seeded(x, y) {
	let seed = (Math.round(x * 1e4) * 73856093) ^ (Math.round(y * 1e4) * 19349663);
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * How a dart that landed at x, y (fractions of the radius) sits: its lean
 * (tan of the angle across and up) and how its flight is turned.
 */
export function dartPose(x, y, view = DART_VIEW) {
	const random = seeded(x, y);
	const spread = () => (random() * 2 - 1) * view.tilt;
	return { lean: [spread(), view.lift + spread()], roll: random() * Math.PI / 2 };
}

const add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k);
const norm = v => {
	const length = Math.hypot(...v);
	return v.map(n => n / length);
};
const cross = ([a, b, c], [d, e, f]) => [b * f - c * e, c * d - a * f, a * e - b * d];

/**
 * The dart's shapes on screen. away: how far it still is from the board,
 * along its own line (0 when stuck in it); sway: an extra lean, for the
 * wobble as it lands. Returns the parts as [x, y] ends and on-screen widths,
 * the flight's vanes as polygons, and its shadow on the board.
 */
export function dartShape(x, y, pose, { away = 0, sway = [0, 0] } = {}, view = DART_VIEW) {
	const tip = [x * 100, y * 100, 0];
	const axis = norm([pose.lean[0] + sway[0], pose.lean[1] + sway[1], 1]);
	const start = add(tip, axis, away);
	const along = t => add(start, axis, t * view.length);
	const scale = ([, , z]) => view.eye / (view.eye - z);
	const flat = p => [p[0] * scale(p), p[1] * scale(p)];

	const parts = {};
	for (const [name, { from, to, r }] of Object.entries(PARTS)) {
		const middle = along((from + to) / 2);
		parts[name] = { a: flat(along(from)), b: flat(along(to)), width: 2 * r * scale(middle) };
	}

	// Four vanes round the shaft, turned by the pose's roll.
	const side = norm(cross([0, 1, 0], axis));
	const up = cross(axis, side);
	const vanes = [0, 1, 2, 3].map(k => {
		const angle = pose.roll + k * Math.PI / 2;
		const out = add(side.map(v => v * Math.cos(angle)), up, Math.sin(angle));
		return VANE.map(([t, w]) => flat(add(along(t), out, w * view.length)));
	});

	// Its shadow, cast down and to the right (light from the top left); none in the air.
	const reach = view.length * 0.35;
	const shadow = away ? null : { a: [tip[0], tip[1]], b: [tip[0] + reach * 0.7, tip[1] + reach] };
	return { ...parts, vanes, shadow };
}
