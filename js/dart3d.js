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
// One vane of the flight: [along, out] corners, fractions of the length. A
// trapezoid like a real flight: long against the shaft, a shorter outer edge
// parallel to it, slanted ends, the corners a little rounded.
const VANE = [[0.6, 0], [0.7, 0.14], [0.715, 0.155], [0.735, 0.162], [0.835, 0.162], [0.855, 0.155], [0.87, 0.135], [0.92, 0]];
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
// Markers keep this far from each other (board units), and from any dart's body.
const MARK_ROOM = 7;
const BODY_ROOM = 4;
// The angles a marker tries round its point, its best side first.
const MARK_TURNS = [0, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1, 2.8, -2.8];
// Points checked along each dart when working out which is in front.
const DEPTH_STEPS = 16;
const ROUND = 14; // points round each end of a part

/** Which of the darts at its exact spot each one is: 0 for the first there, 1 for the next, and so on. */
export function spotTurns(hits) {
	const atSpot = new Map();
	return hits.map(({ x, y }) => {
		const spot = `${x},${y}`;
		const turn = atSpot.get(spot) ?? 0;
		atSpot.set(spot, turn + 1);
		return turn;
	});
}

/** The same random numbers for the same spot every time: a dart keeps its pose when redrawn. */
function seeded(x, y, spotTurn) {
	let seed = (Math.round(x * 1e4) * 73856093) ^ (Math.round(y * 1e4) * 19349663) ^ (spotTurn * 83492791);
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
 * little up from its fall, give or take a little. spotTurn: see spotTurns.
 */
export function dartPose(x, y, view = DART_VIEW, spotTurn = 0) {
	const random = seeded(x, y, spotTurn);
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

	// Which way is across a dart on screen, along a given axis.
	const sideAlong = line => {
		const ahead = norm(add(flat(add(tip, line, view.length)), flat(tip), -1));
		return ahead[0] || ahead[1] ? [-ahead[1], ahead[0]] : [-0.6, -0.8];
	};
	const side = sideAlong(axis);
	const lengthwise = [side[1], -side[0]];
	// Its lit side, towards the light, goes by how it comes to rest: an almost
	// straight dart's line swings right round in the wobble, its shading mustn't.
	let lit = sideAlong(norm([...pose.lean, 1]));
	if (dot(lit, lightAt(tip[0], tip[1])) > 0) lit = lit.map(v => -v);

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
	const across = { from: add([middle.cx, middle.cy], lit, -middle.rx), to: add([middle.cx, middle.cy], lit, middle.rx) };

	// Four vanes round the shaft, turned by the pose's roll; the nearest the eye drawn last.
	const right = norm(cross([0, 1, 0], axis));
	const up = cross(axis, right);
	const vanes = [0, 1, 2, 3].map(k => {
		const angle = pose.roll + k * Math.PI / 2;
		const out = add(right.map(v => v * Math.cos(angle)), up, Math.sin(angle));
		const corners = VANE.map(([t, w]) => add(along(t), out, w * view.length));
		const depth = corners.reduce((sum, p) => sum + p[2], 0);
		const root = flat(along((VANE[0][0] + VANE.at(-1)[0]) / 2));
		const edge = flat(add(along(0.785), out, 0.162 * view.length));
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

/** A dart stuck in the board, on screen: its point and the end of its shaft. */
function bodyLine(x, y, pose, view) {
	const tip = [x * 100, y * 100, 0];
	const end = add(tip, norm([...pose.lean, 1]), PARTS.shaft[1] * view.length);
	const scale = view.eye / (view.eye - end[2]);
	return [[tip[0], tip[1]], [end[0] * scale, end[1] * scale]];
}

/**
 * How a turn's darts sit together: each its own pose, and each marker in a
 * free spot. hits: [{ x, y }] as fractions of the radius, in the order thrown.
 * Returns [{ pose, mark: [x, y] }].
 */
export function dartLayout(hits, view = DART_VIEW) {
	const turns = spotTurns(hits);
	const poses = hits.map(({ x, y }, index) => dartPose(x, y, view, turns[index]));
	const bodies = hits.map(({ x, y }, index) => bodyLine(x, y, poses[index], view));
	const marks = [];
	hits.forEach(({ x, y }, index) => {
		const tip = [x * 100, y * 100];
		const [, tail] = bodies[index];
		const back = norm(add(norm(add(tail, tip, -1)), lightAt(...tip))).map(v => -v);
		// Round the point from the best side, then a little further out. Clear of
		// the markers placed so far and the darts down so far.
		const free = spot => marks.every(mark => Math.hypot(...add(spot, mark, -1)) >= MARK_ROOM)
			&& bodies.slice(0, index + 1).every(([a, b]) => fromSegment(spot, a, b) >= BODY_ROOM);
		const spots = [MARK_OFF, MARK_OFF * 1.5].flatMap(far => MARK_TURNS.map(turn => {
			const [c, s] = [Math.cos(turn), Math.sin(turn)];
			return add(tip, [back[0] * c - back[1] * s, back[0] * s + back[1] * c], far);
		}));
		marks.push(spots.find(free) ?? spots[0]);
	});
	return poses.map((pose, index) => ({ pose, mark: marks[index].map(v => v / 100) }));
}

/**
 * The order to draw a turn's darts, back to front (indexes into hits). Where
 * two cross on screen, the one nearer the eye there goes in front, as a low
 * dart's tail passes in front of the point of the dart above it. Otherwise,
 * the later thrown goes in front.
 */
export function dartOrder(hits, layout, view = DART_VIEW) {
	const scale = z => view.eye / (view.eye - z);
	const lines = hits.map(({ x, y }, index) => {
		const axis = norm([...layout[index].pose.lean, 1]);
		return Array.from({ length: DEPTH_STEPS + 1 }, (_, step) => {
			const p = add([x * 100, y * 100, 0], axis, step / DEPTH_STEPS * view.length);
			return { at: [p[0] * scale(p[2]), p[1] * scale(p[2])], z: p[2] };
		});
	});
	/** Whether dart a is nearer the eye than dart b where they come closest on screen. */
	const inFront = (a, b) => {
		let best = Infinity, depth = 0;
		for (const p of lines[a]) for (const q of lines[b]) {
			const apart = Math.hypot(p.at[0] - q.at[0], p.at[1] - q.at[1]);
			if (apart < best) [best, depth] = [apart, p.z - q.z];
		}
		return depth === 0 ? a > b : depth > 0;
	};
	const wins = index => hits.filter((_, other) => other !== index && inFront(index, other)).length;
	return hits.map((_, index) => index).sort((a, b) => wins(a) - wins(b) || a - b);
}

/**
 * How far a tap at [px, py] is from a dart (fractions of the radius): from its
 * point, its marker or its body, point to shaft end. The body is narrow, so
 * it counts as further: taps beside it still reach the board. place: the
 * dart's entry from dartLayout.
 */
export function tapDistance({ x, y }, { pose, mark }, [px, py], view = DART_VIEW) {
	const tap = [px * 100, py * 100];
	const [tip, end] = bodyLine(x, y, pose, view);
	return Math.min(
		Math.hypot(...add(tap, [x * 100, y * 100], -1)),
		Math.hypot(...add(tap, mark.map(v => v * 100), -1)),
		fromSegment(tap, tip, end) * 1.6,
	) / 100;
}
