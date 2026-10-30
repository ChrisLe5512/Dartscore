// Draws the dartboard as SVG from the ring geometry in board.js, so ring
// sizes, outlines and colours (CSS variables) can change and segments can
// light up. DOM only: where a dart lands is worked out in board.js.

import { BOARD_SECTORS, BOARD_STYLE } from './config.js';
import { dartColor, RINGS } from './board.js';

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
		BOARD_SECTORS.forEach((sector, i) => list.push({
			key: segmentKey(sector, ring),
			d: wedge(inner(ring), rings[ring], i * 18 - 9, i * 18 + 9),
			color: ring === 'numberRing' ? 'legend' : dartColor(sector, multiplier),
		}));
	}
	return list;
}

export const segmentKey = (sector, ring) => `${sector}-${ring}`;

/**
 * Draw the board into `svg` (replacing what was there).
 * style: { outline, outlineColor, wires } as in BOARD_STYLE.
 */
export function drawBoard(svg, rings, style = BOARD_STYLE) {
	const { outline, outlineColor, wires } = { ...BOARD_STYLE, ...style };
	svg.setAttribute('viewBox', `${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`);
	svg.replaceChildren();
	const defs = el('defs', {}, svg);

	const beds = el('g', { class: wires ? 'beds wired' : 'beds' }, svg);
	if (wires) beds.style.setProperty('--wire', outlineColor);
	if (wires) beds.style.setProperty('--wire-width', outline * 0.6);
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

	// Outline around the doubles and the board edge.
	if (outline > 0) {
		const outlines = el('g', { class: 'outlines', fill: 'none', stroke: outlineColor, 'stroke-width': outline }, svg);
		el('circle', { r: rings.double }, outlines);
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

	el('g', { class: 'lit' }, svg);
	el('g', { class: 'marks' }, svg);
}

/**
 * Light up segments: [{ key, kind }] where kind is a class name
 * ('hit', 'review' or 'hover').
 */
export function lightSegments(svg, lights) {
	const layer = svg.querySelector('.lit');
	if (!layer) return;
	// Only add and remove what changed: re-adding a light replays its fade-in.
	const id = ({ key, kind }) => `${key} ${kind}`;
	const wanted = new Set(lights.map(id));
	const shown = new Map([...layer.children].map(path => [path.dataset.light, path]));
	for (const [light, path] of shown) if (!wanted.has(light)) path.remove();
	for (const light of lights) {
		const source = svg.querySelector(`.seg[data-key="${light.key}"]`);
		if (shown.has(id(light)) || !source) continue;
		el('path', { d: source.getAttribute('d'), class: `light ${light.kind}`, 'data-light': id(light) }, layer);
	}
}

/**
 * Numbered markers where darts landed: [{ x, y }] as fractions of the radius.
 * kind: 'live' or 'review'; pop: indexes to animate in; editing: index of
 * the dart being moved.
 */
export function drawMarks(svg, hits, { kind = 'live', pop = [], editing = null } = {}) {
	const layer = svg.querySelector('.marks');
	if (!layer) return;
	layer.replaceChildren(...hits.map(({ x, y }, index) => {
		const place = el('g', { transform: `translate(${round(x * 100)} ${round(y * 100)})` });
		const classes = ['mark', kind, pop.includes(index) && 'pop', editing === index && 'editing'];
		const mark = el('g', { class: classes.filter(Boolean).join(' ') }, place);
		el('circle', { r: 3.6 }, mark);
		el('text', {}, mark).textContent = index + 1;
		return place;
	}));
}
