// A dart stuck in the board, seen in perspective from an eye in front of the
// bull: near the bull you look down its tail; further out it splays outward.
// Pure geometry: positions in board units (100 = the board's edge), the board
// at z = 0 and the eye at z = DART_VIEW.eye. dartboard.js draws the shapes.

import { DART_VIEW } from './config.js';

// Along the dart from its point (fractions of its length): each part as
// pieces [from, to, radius at from, radius at to], radii in board units.
// The barrel tapers into the point and into the shaft.
const PARTS = {
	point: [[0, 0.2, 0.12, 0.4]],
	barrel: [[0.2, 0.235, 0.45, 1.8], [0.235, 0.5, 1.8, 1.8], [0.5, 0.54, 1.8, 0.85]],
	shaft: [[0.54, 0.75, 0.85, 0.75]],
};
// One vane of the flight: [along, out] corners, fractions of the length.
const VANE = [[0.71, 0], [0.82, 0.17], [0.99, 0.17], [1, 0]];
// The light: from the top left, in front. A point `h` off the board casts its
// shadow h × this further down and right.
const LIGHT = [0.35, 0.5];
// The shadow fades out by this far along the dart: its flight casts none, which would hide the board.
const SHADOW_END = 0.8;
// How far the numbered marker sits from the point, beside the dart.
const MARK_OFF = 9;

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
	return length ? v.map(n => n / length) : v;
};
const cross = ([a, b, c], [d, e, f]) => [b * f - c * e, c * d - a * f, a * e - b * d];

/**
 * The dart's shapes on screen. away: how far it still is from the board,
 * along its own line (0 when stuck in it); sway: an extra lean, for the
 * wobble as it lands. Returns:
 * - point, barrel, shaft: outlines (tapered pieces) as lists of [x, y];
 * - across: from the barrel's shaded side to its lit side, for its shading;
 * - vanes: the flight's four vanes, as polygons;
 * - shadow: on the board, from the point back along the dart (none in the air).
 */
export function dartShape(x, y, pose, { away = 0, sway = [0, 0] } = {}, view = DART_VIEW) {
	const tip = [x * 100, y * 100, 0];
	const axis = norm([pose.lean[0] + sway[0], pose.lean[1] + sway[1], 1]);
	const start = add(tip, axis, away);
	const along = t => add(start, axis, t * view.length);
	const scale = ([, , z]) => view.eye / (view.eye - z);
	const flat = p => [p[0] * scale(p), p[1] * scale(p)];

	// Which way is across the dart on screen; the lit side towards the light.
	const back = flat(along(1));
	let side = norm([-(back[1] - tip[1]), back[0] - tip[0]]);
	if (!side[0] && !side[1]) side = [-0.6, -0.8];
	if (side[0] * -LIGHT[0] + side[1] * -LIGHT[1] < 0) side = side.map(v => -v);

	const piece = ([from, to, r1, r2]) => {
		const a = along(from), b = along(to);
		const [pa, pb] = [flat(a), flat(b)];
		const [wa, wb] = [r1 * scale(a), r2 * scale(b)];
		return [add(pa, side, wa), add(pb, side, wb), add(pb, side, -wb), add(pa, side, -wa)];
	};
	const parts = Object.fromEntries(Object.entries(PARTS).map(([name, pieces]) => [name, pieces.map(piece)]));

	const middle = along(0.37);
	const r = 1.8 * scale(middle);
	const centre = flat(middle);
	const across = { from: add(centre, side, -r), to: add(centre, side, r) };

	// Four vanes round the shaft, turned by the pose's roll.
	const right = norm(cross([0, 1, 0], axis));
	const up = cross(axis, right);
	const vanes = [0, 1, 2, 3].map(k => {
		const angle = pose.roll + k * Math.PI / 2;
		const out = add(right.map(v => v * Math.cos(angle)), up, Math.sin(angle));
		return VANE.map(([t, w]) => flat(add(along(t), out, w * view.length)));
	});

	const shade = t => {
		const [px, py, height] = along(t);
		return [px + LIGHT[0] * height, py + LIGHT[1] * height];
	};
	const shadow = away ? null : { from: shade(0), to: shade(SHADOW_END) };
	return { ...parts, across, vanes, shadow };
}

/**
 * Where a dart's numbered marker goes (fractions of the radius): beside the
 * point, away from the dart and its shadow, so the point itself shows.
 */
export function markSpot(x, y, view = DART_VIEW) {
	const shape = dartShape(x, y, dartPose(x, y, view), {}, view);
	const tip = [x * 100, y * 100];
	const tail = norm(add(shape.shaft[0][1], tip, -1));
	const away = norm(add(tail, norm(LIGHT))).map(v => -v);
	return [(tip[0] + away[0] * MARK_OFF) / 100, (tip[1] + away[1] * MARK_OFF) / 100];
}
