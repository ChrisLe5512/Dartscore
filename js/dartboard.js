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

/** A gradient along a line on the board, [offset, colour, opacity] stops, for one dart. */
function gradient(parent, [x1, y1], [x2, y2], stops) {
	const id = `dart-${++gradients}`;
	const node = el('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: round(x1), y1: round(y1), x2: round(x2), y2: round(y2) }, parent);
	for (const [offset, color, opacity = 1] of stops) el('stop', { offset, 'stop-color': color, 'stop-opacity': opacity }, node);
	return `url(#${id})`;
}

/**
 * Draw a dart into its group (emptied first), back to front: its shadow,
 * point, barrel, shaft, then the flight, nearest the eye. The barrel and
 * shaft are shaded as cylinders lit from the top left.
 */
function paintDart(group, { x, y }, motion = {}) {
	const shape = dartShape(x, y, dartPose(x, y), motion);
	group.replaceChildren();
	const defs = el('defs', {}, group);
	if (shape.shadow) {
		// Darkest at the point, gone before the flight.
		const fill = gradient(defs, shape.shadow.from, shape.shadow.to, [[0, 'black', 0.6], [0.6, 'black', 0.25], [1, 'black', 0]]);
		el('line', { class: 'dart-shadow', stroke: fill, x1: round(shape.shadow.from[0]), y1: round(shape.shadow.from[1]), x2: round(shape.shadow.to[0]), y2: round(shape.shadow.to[1]) }, group);
	}
	const { from, to } = shape.across;
	const steel = gradient(defs, from, to, [[0, '#30343a'], [0.4, '#7d838c'], [0.72, '#e4e7eb'], [0.86, '#aeb3ba'], [1, '#5a6068']]);
	const shaft = gradient(defs, from, to, [[0, '#050505'], [0.55, '#2a2a2c'], [0.75, '#6a6c70'], [1, '#141414']]);
	for (const piece of shape.point) el('polygon', { class: 'dart-point', fill: steel, points: points(piece) }, group);
	for (const piece of shape.barrel) el('polygon', { class: 'dart-barrel', fill: steel, points: points(piece) }, group);
	// Grip rings round the middle of the barrel.
	const [, body] = shape.barrel;
	const ring = (a, b) => [a[0] + (b[0] - a[0]) * 0.5, a[1] + (b[1] - a[1]) * 0.5];
	const spine = [ring(body[0], body[3]), ring(body[1], body[2])];
	const span = (t, u) => [spine[0].map((v, i) => v + (spine[1][i] - v) * t), spine[0].map((v, i) => v + (spine[1][i] - v) * u)];
	const [g1, g2] = span(0.15, 0.85);
	const width = Math.hypot(body[0][0] - body[3][0], body[0][1] - body[3][1]);
	el('line', { class: 'dart-grip', 'stroke-width': round(width * 0.92), x1: round(g1[0]), y1: round(g1[1]), x2: round(g2[0]), y2: round(g2[1]) }, group);
	for (const piece of shape.shaft) el('polygon', { class: 'dart-shaft', fill: shaft, points: points(piece) }, group);
	for (const vane of shape.vanes) el('polygon', { class: 'dart-vane', points: points(vane) }, group);
	group.style.opacity = motion.opacity ?? '';
}

// Darts in the air: when each was thrown, by where it landed. They keep
// flying when the board is redrawn mid-flight.
const flying = new Map();
const dartId = ({ x, y }) => `${x},${y}`;

/** Where a thrown dart is `ms` after the throw: coming in along its line, then wobbling about its point. */
function motionAt(ms) {
	const { flightIn, flightMs, wobbleMs } = DART_VIEW;
	if (ms < flightMs) {
		const t = ms / flightMs;
		return { away: flightIn * (1 - t * t), opacity: Math.min(1, t * 3) };
	}
	const t = Math.min(1, (ms - flightMs) / wobbleMs);
	const swing = 0.06 * Math.sin(t * Math.PI * 4) * (1 - t) ** 2;
	return { sway: [swing * 0.4, swing] };
}

function flyDarts(svg) {
	const now = performance.now();
	for (const [id, thrown] of flying) {
		const group = svg.querySelector(`.dart[data-dart="${id}"]`);
		const ms = now - thrown;
		if (!group || ms > DART_VIEW.flightMs + DART_VIEW.wobbleMs) {
			flying.delete(id);
			if (group) paintDart(group, group.hit);
		} else paintDart(group, group.hit, motionAt(ms));
	}
	if (flying.size) requestAnimationFrame(() => flyDarts(svg));
}

/**
 * Darts where they landed, each with a numbered marker beside its point:
 * [{ x, y }] as fractions of the radius. kind: 'live' or 'review'; pop:
 * indexes to fly in; editing: index of the dart being moved.
 */
export function drawMarks(svg, hits, { kind = 'live', pop = [], editing = null } = {}) {
	const layer = svg.querySelector('.marks');
	if (!layer) return;
	if (!hits.length) {
		for (const place of [...layer.children]) fadeOut(place);
		return;
	}
	const at = ({ x, y }) => ({ transform: `translate(${round(x * 100)} ${round(y * 100)})` });
	const state = index => [kind, pop.includes(index) && 'pop', editing === index && 'editing'];
	const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
	const wasFlying = flying.size > 0;
	// All the darts first, then all the markers, so no dart covers a number.
	const darts = hits.map((hit, index) => {
		const id = dartId(hit);
		const group = el('g', { class: ['dart', ...state(index)].filter(Boolean).join(' '), 'data-dart': id });
		group.hit = hit;
		if (pop.includes(index) && !still && !flying.has(id)) flying.set(id, performance.now());
		paintDart(group, hit, flying.has(id) ? motionAt(performance.now() - flying.get(id)) : {});
		return group;
	});
	layer.style.setProperty('--dart-flight-time', `${DART_VIEW.flightMs}ms`);
	if (flying.size && !wasFlying) requestAnimationFrame(() => flyDarts(svg));
	// Each marker beside its dart's point, a short line pointing at it, so
	// where the dart went in shows.
	const marks = hits.map((hit, index) => {
		const [mx, my] = markSpot(hit.x, hit.y);
		const place = el('g', at({ x: mx, y: my }));
		const toTip = [(hit.x - mx) * 100, (hit.y - my) * 100];
		const reach = Math.hypot(...toTip);
		const unit = toTip.map(v => v / reach);
		const lead = { x1: round(unit[0] * 3.6), y1: round(unit[1] * 3.6), x2: round(unit[0] * (reach - 0.9)), y2: round(unit[1] * (reach - 0.9)) };
		const leader = el('g', { class: ['mark-leader', ...state(index)].filter(Boolean).join(' ') }, place);
		el('line', { class: 'under', ...lead }, leader);
		el('line', lead, leader);
		const mark = el('g', { class: ['mark', ...state(index)].filter(Boolean).join(' ') }, place);
		// Dashes are measured along a pathLength of 25: always five, at any size.
		el('circle', { r: 3.6, pathLength: 25 }, mark);
		el('text', {}, mark).textContent = index + 1;
		return place;
	});
	layer.replaceChildren(...darts, ...marks);
}
