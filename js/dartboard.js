// Draws the dartboard as SVG from the ring geometry in board.js, so ring
// sizes, outlines and colours (CSS variables) can change and segments can
// light up. DOM only: where a dart lands is worked out in board.js.

import { BOARD_SECTORS, BOARD_STYLE, DART_VIEW } from './config.js';
import { dartColor, RINGS } from './board.js';
import { dartPose, dartShape, markSpot } from './dart3d.js';

const NS = 'http://www.w3.org/2000/svg';

// The viewBox runs from -VIEW to VIEW; the board edge is at 100, the rest is
// room for the outline. Callers convert taps with boardRadius().
export const VIEW = 101;

/** The board's radius in px for an SVG drawn at `width` px. */
export const boardRadius = width => width / 2 * 100 / VIEW;

function el(name, attrs = {}, parent = null) {
	const node = document.createElementNS(NS, name);
	for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
	parent?.append(node);
	return node;
}

const round = n => Math.round(n * 1000) / 1000;

/** Point at radius r, `deg` degrees clockwise from the top. */
function point(r, deg) {
	const rad = deg * Math.PI / 180;
	return `${round(r * Math.sin(rad))} ${round(-r * Math.cos(rad))}`;
}

/** A ring segment between two radii and two angles. */
function wedge(inner, outer, from, to) {
	return `M${point(outer, from)} A${outer} ${outer} 0 0 1 ${point(outer, to)} `
		+ `L${point(inner, to)} A${inner} ${inner} 0 0 0 ${point(inner, from)}Z`;
}

/** A full ring (or a disc when inner is 0). */
function annulus(inner, outer) {
	const circle = r => `M${r} 0 A${r} ${r} 0 1 1 ${-r} 0 A${r} ${r} 0 1 1 ${r} 0Z`;
	return inner > 0 ? `${circle(outer)} ${circle(inner)}` : circle(outer);
}

/** Every segment of the board: { key, d, color } (key matches segmentKey). */
export function segments(rings) {
	const list = [];
	const inner = name => {
		const index = RINGS.findIndex(([ring]) => ring === name);
		return index > 0 ? rings[RINGS[index - 1][0]] : 0;
	};
	for (const [ring, multiplier] of RINGS) {
		if (ring === 'bull' || ring === 'outerBull') {
			list.push({ key: segmentKey(25, ring), d: annulus(inner(ring), rings[ring]), color: dartColor(25, multiplier) });
			continue;
		}
		// Anywhere in the number ring is the same miss: one zone all round.
		if (ring === 'numberRing') {
			list.push({ key: segmentKey(0, ring), d: annulus(inner(ring), rings[ring]), color: 'legend' });
			continue;
		}
		BOARD_SECTORS.forEach((sector, i) => list.push({
			key: segmentKey(sector, ring),
			d: wedge(inner(ring), rings[ring], i * 18 - 9, i * 18 + 9),
			color: dartColor(sector, multiplier),
		}));
	}
	return list;
}

export const segmentKey = (sector, ring) => `${sector}-${ring}`;

/** Fade a node out (.leaving in the CSS), then remove it. */
function fadeOut(node) {
	if (node.classList.contains('leaving')) return;
	node.classList.add('leaving');
	Promise.allSettled(node.getAnimations().map(a => a.finished)).then(() => node.remove());
}

/**
 * A saved board style with the defaults filled in. Wires are a thickness, 0
 * for none. Saves from when they were switched on or off (wires) keep what
 * they showed: off is 0; on is the thickness saved with it or, from before
 * wires had one, 60% of the outline.
 */
export function boardStyle(saved = {}) {
	const style = { ...BOARD_STYLE, ...saved };
	if (saved.wires === false) style.wire = 0;
	else if (saved.wires && saved.wire === undefined) style.wire = round((saved.outline ?? BOARD_STYLE.outline) * 0.6);
	delete style.wires;
	return style;
}

/**
 * Draw the board into `svg` (replacing what was there).
 * style: { outline, wire, outlineColor } as in BOARD_STYLE.
 */
export function drawBoard(svg, rings, style = BOARD_STYLE) {
	const { outline, outlineColor, wire } = boardStyle(style);
	svg.setAttribute('viewBox', `${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`);
	svg.replaceChildren();
	const defs = el('defs', {}, svg);

	const beds = el('g', { class: wire > 0 ? 'beds wired' : 'beds' }, svg);
	if (wire > 0) beds.style.setProperty('--wire', outlineColor);
	if (wire > 0) beds.style.setProperty('--wire-width', wire);
	for (const { key, d, color } of segments(rings)) {
		el('path', { d, class: `seg ${color}`, 'data-key': key }, beds);
	}

	// Soft shadow where rings meet, like the beds of a real board.
	const shading = el('g', { class: 'shading' }, svg);
	['bull', 'outerBull', 'innerSingle', 'treble', 'outerSingle'].forEach((ring, i) => {
		const edge = rings[ring];
		const width = 1.8;
		const gradient = el('radialGradient', { id: `groove-${i}`, gradientUnits: 'userSpaceOnUse', cx: 0, cy: 0, r: 100 }, defs);
		el('stop', { offset: Math.max(0, edge - width) / 100, 'stop-color': 'black', 'stop-opacity': 0 }, gradient);
		el('stop', { offset: edge / 100, 'stop-color': 'black', 'stop-opacity': 0.55 }, gradient);
		el('stop', { offset: (edge + width) / 100, 'stop-color': 'black', 'stop-opacity': 0 }, gradient);
		el('circle', { r: edge + width, fill: `url(#groove-${i})` }, shading);
	});

	// Lit beds, under the outline: a light's edge line, centred on its bed's
	// edge, would otherwise show past the doubles.
	el('g', { class: 'lit' }, svg);

	// Outline around the doubles and the board edge, each in the number ring:
	// centred on the doubles' edge, it covered their outer part, which then
	// looked like the number ring but still scored (and lit) as a double.
	if (outline > 0) {
		const outlines = el('g', { class: 'outlines', fill: 'none', stroke: outlineColor, 'stroke-width': outline }, svg);
		el('circle', { r: rings.double + outline / 2 }, outlines);
		el('circle', { r: 100 - outline / 2 }, outlines);
	}

	// Numbers, turned to follow the ring but never upside down.
	const legend = rings.numberRing - rings.double;
	const numbers = el('g', { class: 'numbers', 'font-size': round(legend * 0.8) }, svg);
	BOARD_SECTORS.forEach((sector, i) => {
		const angle = i * 18;
		const turn = angle > 90 && angle < 270 ? angle - 180 : angle;
		const text = el('text', { transform: `rotate(${turn}) translate(0 ${round(-(rings.double + legend / 2) * (turn === angle ? 1 : -1))})` }, numbers);
		text.textContent = sector;
	});

	el('g', { class: 'marks' }, svg);
}

/**
 * Light up segments: [{ key, kind }] where kind is a class name
 * ('hit', 'review', 'miss' or 'hover').
 */
export function lightSegments(svg, lights) {
	const layer = svg.querySelector('.lit');
	if (!layer) return;
	// Only add and remove what changed: re-adding a light replays its fade-in.
	// Two darts in one bed light it once.
	const id = ({ key, kind }) => `${key} ${kind}`;
	const wanted = new Set(lights.map(id));
	const shown = new Set();
	const hovered = new Set(); // beds the pointer's light was on
	// Lit beds fade out; the pointer's light just follows it.
	for (const path of [...layer.children]) {
		if (path.classList.contains('leaving')) continue;
		if (wanted.has(path.dataset.light) && !shown.has(path.dataset.light)) shown.add(path.dataset.light);
		else if (path.classList.contains('hover')) {
			hovered.add(path.dataset.key);
			path.remove();
		} else fadeOut(path);
	}
	for (const light of lights) {
		const source = svg.querySelector(`.seg[data-key="${light.key}"]`);
		if (shown.has(id(light)) || !source) continue;
		shown.add(id(light));
		// A bed lit where the pointer was (it was clicked) starts from the
		// pointer's light rather than fading in from nothing, which flickered.
		const from = light.kind !== 'hover' && hovered.has(light.key) ? ' from-hover' : '';
		el('path', { d: source.getAttribute('d'), class: `light ${light.kind}${from}`, 'data-light': id(light), 'data-key': light.key }, layer);
	}
}

// ---- Darts in the board ----

const points = list => list.map(p => p.map(round).join(',')).join(' ');
let gradients = 0; // numbers the darts' own gradients
const MARK_R = 3; // a marker's radius

/**
 * A gradient for one dart, [offset, colour, opacity] stops (colours may be
 * CSS variables). Linear along a line on the board, or radial over an ellipse.
 */
function gradient(parent, stops, line = null) {
	const id = `dart-${++gradients}`;
	const node = line
		? el('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: round(line[0][0]), y1: round(line[0][1]), x2: round(line[1][0]), y2: round(line[1][1]) }, parent)
		: el('radialGradient', { id, cx: 0.5, cy: 0.5, fx: 0.38, fy: 0.3, r: 0.5 }, parent);
	for (const [offset, color, opacity = 1] of stops) el('stop', { offset, style: `stop-color: ${color}; stop-opacity: ${opacity}` }, node);
	return `url(#${id})`;
}

/** A mask fading what it covers along a line: its stops go from white (shown) to black (gone). */
function fadeMask(parent, stops, line) {
	const mask = el('mask', { id: `dart-${++gradients}`, maskUnits: 'userSpaceOnUse', x: -300, y: -300, width: 600, height: 600 }, parent);
	el('rect', { x: -300, y: -300, width: 600, height: 600, fill: gradient(parent, stops, line) }, mask);
	return `url(#${mask.id})`;
}

const ellipse = ({ cx, cy, rx, ry, angle }, attrs, parent) =>
	el('ellipse', { cx: round(cx), cy: round(cy), rx: round(rx), ry: round(Math.max(ry, 0.01)), transform: `rotate(${round(angle)} ${round(cx)} ${round(cy)})`, ...attrs }, parent);

/**
 * Draw a dart into its group (emptied first), back to front: its shadow,
 * point, barrel, shaft, then the flight, nearest the eye. No outlines: the
 * steel is shaded as cylinders lit from the top left, the barrel's end
 * facing you as a shaded disc, and each vane from its root out.
 */
function paintDart(group, { x, y }, motion = {}) {
	const shape = dartShape(x, y, dartPose(x, y), motion);
	group.replaceChildren();
	const defs = el('defs', {}, group);
	// The dart itself, see-through as one (overlapping pieces don't darken).
	let body = group;
	const polygons = (list, attrs) => list.forEach(piece => el('polygon', { points: points(piece), ...attrs }, body));
	if (!motion.inAir) {
		// The dart's own shape as one flat layer (no darker overlaps), faded
		// by a mask from the point to nothing before the flight.
		const fade = fadeMask(defs, [[0, 'white'], [0.55, '#777'], [1, 'black']], [shape.shadow.from, shape.shadow.to]);
		const shadow = el('g', { class: 'dart-shadow', mask: fade }, group);
		for (const piece of shape.shadow.parts) el('polygon', { points: points(piece) }, shadow);
	}
	const across = [shape.across.from, shape.across.to];
	const steel = gradient(defs, [[0, '#121417'], [0.42, '#3d4249'], [0.72, '#a3a9b1'], [0.86, '#5e646c'], [1, '#202328']], across);
	const black = gradient(defs, [[0, '#030303'], [0.55, '#18181a'], [0.76, '#4a4c50'], [1, '#0b0b0b']], across);
	body = el('g', { class: 'dart-body' }, group);
	// The point black, so it doesn't look like its shadow.
	polygons([shape.point], { class: 'dart-point' });
	polygons([shape.nose, shape.barrel], { class: 'dart-steel', fill: steel });
	// Grip rings round the barrel.
	const [g1, g2] = shape.grip;
	const grip = [0.12, 0.88].map(t => [g1[0] + (g2[0] - g1[0]) * t, g1[1] + (g2[1] - g1[1]) * t]);
	const width = Math.hypot(shape.across.to[0] - shape.across.from[0], shape.across.to[1] - shape.across.from[1]);
	el('line', { class: 'dart-grip', 'stroke-width': round(width * 0.94), x1: round(grip[0][0]), y1: round(grip[0][1]), x2: round(grip[1][0]), y2: round(grip[1][1]) }, body);
	polygons([shape.tail], { class: 'dart-steel', fill: steel });
	// The barrel's end, facing you: a shaded disc, the shaft coming out of it.
	ellipse(shape.face, { class: 'dart-face', fill: gradient(defs, [[0, '#8d939b'], [0.55, '#3a3f45'], [1, '#141619']]) }, body);
	// The shaft thins out towards the flight: its top doesn't stand out through
	// the fins, but still reaches them, so they don't float.
	const fade = fadeMask(defs, [[0, 'white'], [0.5, '#ccc'], [1, '#777']], [[shape.face.cx, shape.face.cy], [shape.end.cx, shape.end.cy]]);
	el('polygon', { class: 'dart-shaft', fill: black, mask: fade, points: points(shape.shaft) }, body);
	// The flight: one see-through layer, so where the vanes meet doesn't darken.
	const flight = el('g', { class: 'dart-flight' }, group);
	for (const { points: vane, root, edge } of shape.vanes) {
		const fill = gradient(defs, [[0, 'color-mix(in srgb, var(--dart-flight) 45%, black)'], [0.5, 'var(--dart-flight)'], [1, 'color-mix(in srgb, var(--dart-flight) 70%, white)']], [root, edge]);
		el('polygon', { points: points(vane), fill }, flight);
	}
	// A past turn's darts are fainter.
	const faint = group.classList.contains('review') ? 0.6 : 1;
	group.style.opacity = (motion.opacity ?? 1) * faint;
}

// How each dart is moving, by where it landed (so it keeps moving when the
// board is redrawn): thrown (when), lifted (picked up to move: how far out,
// from and to, and since when). Darts being taken out keep theirs on their
// element (`pulled`), as they're no longer in the list.
const thrown = new Map();
const lifted = new Map();
const dartId = ({ x, y }) => `${x},${y}`;
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const moving = new WeakSet(); // board layers with darts on the move

/** A thrown dart `ms` after the throw: coming in along its line, then wobbling about its point. */
function throwAt(ms) {
	const { flightIn, flightMs, wobbleMs } = DART_VIEW;
	if (ms < flightMs) {
		const t = ms / flightMs;
		return { away: flightIn * (1 - t * t), opacity: Math.min(1, t * 3), inAir: true };
	}
	const t = Math.min(1, (ms - flightMs) / wobbleMs);
	const swing = 0.06 * Math.sin(t * Math.PI * 4) * (1 - t) ** 2;
	return { sway: [swing * 0.4, swing] };
}

/** How far out of the board a picked-up dart is at `now`. */
function liftAt(id, now) {
	const lift = lifted.get(id);
	if (!lift) return 0;
	const t = Math.min(1, (now - lift.since) / DART_VIEW.liftMs);
	return lift.from + (lift.to - lift.from) * (1 - (1 - t) ** 2);
}

/** A dart's motion at `now`: thrown, lifted and being pulled out, added up. Null once it's gone. */
function motionOf(group, now) {
	const id = group.dataset.dart;
	const motion = thrown.has(id) ? throwAt(now - thrown.get(id)) : {};
	let away = (motion.away ?? 0) + (group.pulled ? group.pulled.from : liftAt(id, now));
	if (group.pulled) {
		const t = (now - group.pulled.since) / DART_VIEW.pullMs;
		if (t >= 1) return null;
		if (t > 0) {
			away += DART_VIEW.pullOut * t * t;
			motion.opacity = 1 - t;
		}
	}
	return { ...motion, away };
}

/** Whether a dart still has somewhere to go. */
function isMoving(group, now) {
	const id = group.dataset.dart;
	const lift = lifted.get(id);
	return Boolean(group.pulled)
		|| (thrown.has(id) && now - thrown.get(id) < DART_VIEW.flightMs + DART_VIEW.wobbleMs)
		|| Boolean(lift && now - lift.since < DART_VIEW.liftMs);
}

/** Move the darts on, a frame at a time, until none is moving. */
function moveDarts(layer) {
	const now = performance.now();
	let more = false;
	for (const group of layer.querySelectorAll('.dart')) {
		const motion = motionOf(group, now);
		if (!motion) {
			group.remove();
			continue;
		}
		paintDart(group, group.hit, motion);
		if (isMoving(group, now)) more = true;
		else thrown.delete(group.dataset.dart);
	}
	if (more) requestAnimationFrame(() => moveDarts(layer));
	else moving.delete(layer);
}

function startMoving(layer) {
	if (moving.has(layer)) return;
	moving.add(layer);
	requestAnimationFrame(() => moveDarts(layer));
}

/**
 * Take darts out of the board: this turn's are pulled out and fade, one after
 * another in their order; a past turn's (or with reduced motion) fade
 * together. Their markers go with them.
 */
function takeOut(layer, darts) {
	if (!darts.length) return;
	const now = performance.now();
	darts.sort((a, b) => a.index - b.index).forEach((group, order) => {
		const mark = layer.querySelector(`.mark-place[data-dart="${group.dataset.dart}"]`);
		if (group.classList.contains('review') || still()) {
			fadeOut(group);
			if (mark) fadeOut(mark);
			return;
		}
		const delay = order * DART_VIEW.pullGap;
		group.pulled = { since: now + delay, from: liftAt(group.dataset.dart, now) };
		lifted.delete(group.dataset.dart);
		thrown.delete(group.dataset.dart);
		if (mark) {
			mark.style.animationDelay = `${delay}ms`;
			fadeOut(mark);
		}
	});
	startMoving(layer);
}

/**
 * Darts where they landed, each with a numbered marker beside its point:
 * [{ x, y }] as fractions of the radius. kind: 'live' or 'review'; pop:
 * indexes just thrown; editing: index of the dart being moved (it comes a
 * little out of the board). A past turn's darts are all thrown in at once.
 */
export function drawMarks(svg, hits, { kind = 'live', pop = [], editing = null } = {}) {
	const layer = svg.querySelector('.marks');
	if (!layer) return;
	const now = performance.now();
	const shown = [...layer.querySelectorAll('.dart')].filter(group => !group.pulled && !group.classList.contains('leaving'));
	const ids = new Set(hits.map(dartId));
	// Darts no longer listed are taken out.
	takeOut(layer, shown.filter(group => !ids.has(group.dataset.dart)));
	if (!hits.length) return;

	const before = new Set(shown.map(group => group.dataset.dart));
	const landing = index => (kind === 'review' ? !before.has(dartId(hits[index])) : pop.includes(index));
	const state = index => [kind, landing(index) && 'pop', editing === index && 'editing'];
	const at = ({ x, y }) => ({ transform: `translate(${round(x * 100)} ${round(y * 100)})` });

	// All the darts first, then all the markers, so no dart covers a number.
	const darts = hits.map((hit, index) => {
		const id = dartId(hit);
		const group = el('g', { class: ['dart', ...state(index)].filter(Boolean).join(' '), 'data-dart': id });
		group.hit = hit;
		group.index = index;
		if (landing(index) && !still()) thrown.set(id, now);
		// Picked up: out a little; put back: in again.
		const lift = editing === index ? DART_VIEW.lift : 0;
		if ((lifted.get(id)?.to ?? 0) !== lift) {
			lifted.set(id, { from: still() ? lift : liftAt(id, now), to: lift, since: now });
		}
		paintDart(group, hit, motionOf(group, now));
		if (isMoving(group, now)) startMoving(layer);
		return group;
	});
	for (const id of lifted.keys()) if (!ids.has(id)) lifted.delete(id);
	layer.style.setProperty('--dart-flight-time', `${DART_VIEW.flightMs}ms`);

	// Each marker beside its dart's point, a short line pointing at it, so
	// where the dart went in shows.
	// A picked-up dart's marker steps aside: it fades as the dart lifts, and back as it's put down.
	const wasLifted = new Set([...layer.querySelectorAll('.mark-place.lifted')].map(place => place.dataset.dart));
	const marks = hits.map((hit, index) => {
		const [mx, my] = markSpot(hit.x, hit.y);
		const id = dartId(hit);
		const lifted = editing === index;
		const step = lifted ? `lifted${wasLifted.has(id) ? '' : ' lifting'}` : wasLifted.has(id) ? 'landing' : '';
		const place = el('g', { class: `mark-place ${step}`.trim(), 'data-dart': id, ...at({ x: mx, y: my }) });
		const toTip = [(hit.x - mx) * 100, (hit.y - my) * 100];
		const reach = Math.hypot(...toTip);
		const unit = toTip.map(v => v / reach);
		// It fades towards the dart, so it doesn't sit on it.
		const [from, to] = [MARK_R, reach - 1].map(d => unit.map(v => v * d));
		const fade = gradient(place, [[0, 'white', 0.75], [1, 'white', 0]], [from, to]);
		el('line', { class: ['mark-leader', ...state(index)].filter(Boolean).join(' '), stroke: fade, x1: round(from[0]), y1: round(from[1]), x2: round(to[0]), y2: round(to[1]) }, place);
		const mark = el('g', { class: ['mark', ...state(index)].filter(Boolean).join(' ') }, place);
		// Dashes are measured along a pathLength of 25: always five, at any size.
		el('circle', { r: MARK_R, pathLength: 25 }, mark);
		el('text', {}, mark).textContent = index + 1;
		return place;
	});
	// Darts and markers on their way out stay until they're gone.
	const leaving = [...layer.children].filter(node => node.pulled || node.classList.contains('leaving'));
	const isDart = node => node.classList.contains('dart');
	layer.replaceChildren(...darts, ...leaving.filter(isDart), ...marks, ...leaving.filter(node => !isDart(node)));
}
