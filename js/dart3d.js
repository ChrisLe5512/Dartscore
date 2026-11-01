// A dart stuck in the board, seen in perspective from an eye in front of the
// bull: near the bull you look down its tail; further out it splays outward.
// Pure geometry: positions in board units (100 = the board's edge), the board
// at z = 0 and the eye at z = DART_VIEW.eye. dartboard.js draws the shapes.

import { DART_VIEW } from './config.js';

// Along the dart from where it goes into the board (fractions of its length;
// as much point again is in the board): [from, to, radius at from, radius at to],
// radii in board units. The barrel tapers into the point and into the shaft.
const PARTS = {
	point: [0, 0.1, 0.18, 0.4],
	nose: [0.1, 0.13, 0.45, 1.8],
	barrel: [0.13, 0.4, 1.8, 1.8],
	tail: [0.4, 0.44, 1.8, 0.85],
	shaft: [0.44, 0.6, 0.85, 0.75], // ends where the flight starts, so it doesn't show through it
};
// How much of the point is in the board: it shows as the dart comes out.
const BURIED = 0.1;
// One vane of the flight: [along, out] corners, fractions of the length.
// Its leading edge curves out from the shaft.
const VANE = [[0.6, 0], [0.64, 0.06], [0.69, 0.12], [0.75, 0.16], [0.8, 0.17], [0.9, 0.17], [0.91, 0]];
// The light: one lamp, above and to the left of the board, in front of it
// (as a board's light is near it, not far off like the sun): every dart's
// shadow falls away from the same point.
const LAMP = [-70, -160, 360];
/** Where a point casts its shadow on the board, in the lamp's light. */
const cast = ([px, py, height]) => {
	const k = LAMP[2] / (LAMP[2] - height);
	return [LAMP[0] + (px - LAMP[0]) * k, LAMP[1] + (py - LAMP[1]) * k];
};
/** Which way the lamp's light falls across the board at x, y (board units). */
const lightAt = (x, y) => norm([x - LAMP[0], y - LAMP[1]]);
// The shadow has faded out by this far along the dart, just before the shaft's
// end, so no edge shows there: its flight casts none, which would hide the board.
const SHADOW_END = 0.56;
// How far the numbered marker sits from the point, beside the dart.
const MARK_OFF = 8;
const ROUND = 14; // points round each end of a part

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
 * (tan of the angle across and up) and how its flight is turned. It points
 * back the way it came, towards the player in front of the bull, tail a
 * little up from its fall, give or take a little.
 */
export function dartPose(x, y, view = DART_VIEW) {
	const random = seeded(x, y);
	const spread = () => (random() * 2 - 1) * view.tilt;
	const back = [-x * 100 / view.thrower, -y * 100 / view.thrower];
	return { lean: [back[0] + spread(), back[1] + view.droop + spread()], roll: random() * Math.PI / 2 };
}

const add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const norm = v => {
	const length = Math.hypot(...v);
	return length ? v.map(n => n / length) : v;
};
const cross = ([a, b, c], [d, e, f]) => [b * f - c * e, c * d - a * f, a * e - b * d];

/** The smallest convex outline round some points (monotone chain). */
function hull(points) {
	const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
	const half = list => list.reduce((out, p) => {
		while (out.length > 1 && turn(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
		out.push(p);
		return out;
	}, []);
	const lower = half(sorted), upper = half(sorted.reverse());
	return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * The dart's shapes on screen. away: how far it still is from the board,
 * along its own line (0 when stuck in it); sway: an extra lean, for the
 * wobble as it lands. Returns:
 * - tip: where its point is (on the board once it's in);
 * - point, nose, barrel, tail, shaft: outlines round both round ends of each
 *   part, as lists of [x, y];
 * - face: the end of the barrel facing the eye, and end: the shaft's, as
 *   ellipses { cx, cy, rx, ry, angle } (seen head-on, nearly round);
 * - across: from the barrel's shaded side to its lit side, for its shading;
 * - grip: the barrel's middle line, end to end, for its grip rings;
 * - vanes: the flight's four vanes, back to front, each { points, root, edge };
 * - shadow: on the board, its parts' outlines, from (the point) to where it
 *   has faded out.
 */
export function dartShape(x, y, pose, { away = 0, sway = [0, 0] } = {}, view = DART_VIEW) {
	const tip = [x * 100, y * 100, 0];
	const axis = norm([pose.lean[0] + sway[0], pose.lean[1] + sway[1], 1]);
	const start = add(tip, axis, away);
	const along = t => add(start, axis, t * view.length);
	const eye = [0, 0, view.eye];
	const scale = ([, , z]) => view.eye / (view.eye - z);
	const flat = p => [p[0] * scale(p), p[1] * scale(p)];

	// Which way is across the dart on screen; the lit side towards the light.
	const back = flat(along(1));
	const ahead = norm(add(back, flat(tip), -1));
	let side = [-ahead[1], ahead[0]];
	if (!side[0] && !side[1]) side = [-0.6, -0.8];
	if (dot(side, lightAt(tip[0], tip[1])) > 0) side = side.map(v => -v);
	const lengthwise = [side[1], -side[0]];

	// A round section of the dart at t, radius r: on screen an ellipse, as
	// wide as the circle across the dart and as deep as it is turned to the eye.
	const ring = (t, r) => {
		const centre = along(t);
		const facing = Math.abs(dot(axis, norm(add(eye, centre, -1))));
		const [cx, cy] = flat(centre);
		return { cx, cy, rx: r * scale(centre), ry: r * scale(centre) * facing, angle: Math.atan2(side[1], side[0]) * 180 / Math.PI };
	};
	const outline = ({ cx, cy, rx, ry }) => Array.from({ length: ROUND }, (_, i) => {
		const a = i / ROUND * 2 * Math.PI;
		return add(add([cx, cy], side, rx * Math.cos(a)), lengthwise, ry * Math.sin(a));
	});
	const part = ([from, to, r1, r2]) => hull([...outline(ring(from, r1)), ...outline(ring(to, r2))]);
	const pieces = { ...PARTS, point: [-Math.min(away / view.length, BURIED), ...PARTS.point.slice(1)] };
	const parts = Object.fromEntries(Object.entries(pieces).map(([name, piece]) => [name, part(piece)]));

	const middle = ring((PARTS.barrel[0] + PARTS.barrel[1]) / 2, PARTS.barrel[2]);
	const across = { from: add([middle.cx, middle.cy], side, -middle.rx), to: add([middle.cx, middle.cy], side, middle.rx) };

	// Four vanes round the shaft, turned by the pose's roll; the nearest the eye drawn last.
	const right = norm(cross([0, 1, 0], axis));
	const up = cross(axis, right);
	const vanes = [0, 1, 2, 3].map(k => {
		const angle = pose.roll + k * Math.PI / 2;
		const out = add(right.map(v => v * Math.cos(angle)), up, Math.sin(angle));
		const corners = VANE.map(([t, w]) => add(along(t), out, w * view.length));
		const depth = corners.reduce((sum, p) => sum + p[2], 0);
		const root = flat(along((VANE[0][0] + VANE.at(-1)[0]) / 2));
		const edge = flat(add(along(0.85), out, 0.17 * view.length));
		return { points: corners.map(flat), root, edge, depth };
	}).sort((a, b) => a.depth - b.depth);

	// Its shadow: each part's round ends cast on the board in the lamp's light.
	const section = (t, r) => Array.from({ length: ROUND }, (_, i) => {
		const a = i / ROUND * 2 * Math.PI;
		return cast(add(add(along(t), right, r * Math.cos(a)), up, r * Math.sin(a)));
	});
	const shadow = {
		from: cast(along(0)),
		to: cast(along(SHADOW_END)),
		parts: Object.values(pieces).map(([from, to, r1, r2]) => hull([...section(from, r1), ...section(to, r2)])),
	};
	return {
		tip: flat(start),
		...parts,
		face: ring(PARTS.barrel[1], PARTS.barrel[3]),
		grip: [ring(PARTS.barrel[0], 0), ring(PARTS.barrel[1], 0)].map(({ cx, cy }) => [cx, cy]),
		end: ring(PARTS.shaft[1], PARTS.shaft[3]),
		across, vanes, shadow,
	};
}

/** How far a point is from the line between a and b. */
function fromSegment(p, a, b) {
	const ab = add(b, a, -1);
	const t = Math.max(0, Math.min(1, dot(add(p, a, -1), ab) / (dot(ab, ab) || 1)));
	return Math.hypot(...add(p, add(a, ab, t), -1));
}

/**
 * How far a tap at [px, py] is from a dart in the board at x, y (fractions of
 * the radius): from its point, its marker or its body, point to shaft end.
 * The body is narrow, so it counts as further: taps beside it still reach
 * the board.
 */
export function tapDistance(x, y, [px, py], view = DART_VIEW) {
	const tap = [px * 100, py * 100];
	const { tip, end } = dartShape(x, y, dartPose(x, y, view), {}, view);
	const [mx, my] = markSpot(x, y, view);
	return Math.min(
		Math.hypot(...add(tap, [x * 100, y * 100], -1)),
		Math.hypot(...add(tap, [mx * 100, my * 100], -1)),
		fromSegment(tap, tip, [end.cx, end.cy]) * 1.6,
	) / 100;
}

/**
 * Where a dart's numbered marker goes (fractions of the radius): beside the
 * point, away from the dart and its shadow, so the point itself shows.
 */
export function markSpot(x, y, view = DART_VIEW) {
	const { end } = dartShape(x, y, dartPose(x, y, view), {}, view);
	const tip = [x * 100, y * 100];
	const tail = norm(add([end.cx, end.cy], tip, -1));
	const away = norm(add(tail, lightAt(...tip))).map(v => -v);
	return [(tip[0] + away[0] * MARK_OFF) / 100, (tip[1] + away[1] * MARK_OFF) / 100];
}
