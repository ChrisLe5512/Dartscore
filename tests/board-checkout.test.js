import test from 'node:test';
import assert from 'node:assert/strict';
import { boardRings, DEFAULT_RINGS, hitTest, locate, makeDart, randomDart } from '../js/board.js';
import { canCheckout, getCheckouts } from '../js/checkout.js';
import { boardStyle } from '../js/dartboard.js';

const R = 100; // board radius in px for these tests
// Point at `percent` of the radius, `deg` degrees clockwise from the top.
const at = (percent, deg) => {
	const rad = (deg - 90) * Math.PI / 180;
	return [Math.cos(rad) * percent, Math.sin(rad) * percent];
};
const hit = (percent, deg) => hitTest(...at(percent, deg), R);

test('rings', () => {
	assert.equal(hit(3, 0).label, 'B');
	assert.equal(hit(3, 0).value, 50);
	assert.equal(hit(12, 0).label, 'OB');
	assert.equal(hit(25, 0).label, '20');
	assert.equal(hit(45, 0).label, 'T20');
	assert.equal(hit(65, 0).label, '20');
	assert.equal(hit(80, 0).label, 'D20');
	assert.equal(hit(95, 0).label, '0');
	assert.equal(hit(95, 0).value, 0);
	assert.equal(hit(101, 0), null);
});

test('sectors go clockwise from 20', () => {
	const order = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
	order.forEach((n, i) => assert.equal(hit(25, i * 18).sector, n, `sector at ${i * 18}°`));
	assert.equal(hit(25, 8).sector, 20);
	assert.equal(hit(25, 10).sector, 1);
	assert.equal(hit(25, 352).sector, 20);
});

test('default layout ring edges', () => {
	assert.deepEqual({ ...DEFAULT_RINGS }, { bull: 6, outerBull: 16, innerSingle: 40, treble: 50, outerSingle: 75, double: 85, numberRing: 100 });
});

test('custom layouts move the rings and hit detection follows', () => {
	const rings = boardRings({ bull: 4, outerBull: 10, trebleAt: 55, treble: 6, double: 6, legend: 12 });
	assert.deepEqual(rings, { bull: 4, outerBull: 10, innerSingle: 55, treble: 61, outerSingle: 82, double: 88, numberRing: 100 });
	assert.equal(hitTest(...at(58, 0), R, rings).label, 'T20');
	assert.equal(hitTest(...at(40, 0), R, rings).label, '20'); // inner single with this layout
	assert.equal(hitTest(...at(85, 0), R, rings).label, 'D20');
	assert.equal(hitTest(...at(90, 0), R, rings).label, '0');
	assert.deepEqual(locate(...at(8, 0), R, rings), { sector: 25, ring: 'outerBull' });
	assert.deepEqual(locate(...at(95, 0), R, rings), locate(...at(95, 123), R, rings)); // the number ring is one zone
});

test('layouts are clamped and keep the rings in order', () => {
	const rings = boardRings({ bull: 99, outerBull: 1, trebleAt: 99, treble: 99, double: 99, legend: 99 });
	const order = [rings.bull, rings.outerBull, rings.innerSingle, rings.treble, rings.outerSingle, rings.double, rings.numberRing];
	order.slice(1).forEach((edge, i) => assert.ok(edge > order[i], `ring ${i + 1} is outside ring ${i}`));
	assert.deepEqual(boardRings({ bull: 'x' }), boardRings());
});

test('colours match the real board', () => {
	assert.equal(makeDart(20, 1).color, 'black');
	assert.equal(makeDart(1, 1).color, 'white');
	assert.equal(makeDart(20, 3).color, 'red');
	assert.equal(makeDart(1, 2).color, 'green');
	assert.equal(makeDart(25, 2).color, 'red');
	assert.equal(makeDart(25, 1).color, 'green');
	assert.equal(makeDart(7, 0).color, 'zero');
});

test('standard checkouts', () => {
	const best = s => getCheckouts(s)[0]?.join(' ');
	assert.equal(best(170), 'T20 T20 B');
	assert.equal(best(100), 'T20 D20');
	assert.equal(best(40), 'D20');
	assert.equal(best(50), 'B');
	assert.equal(best(60), '20 D20');
	assert.equal(best(141), 'T20 T19 D12');
});

test('every suggested route adds up and ends on a double', () => {
	const value = l => l === 'B' ? 50 : l === 'OB' ? 25
		: l[0] === 'D' ? 2 * l.slice(1) : l[0] === 'T' ? 3 * l.slice(1) : Number(l);
	for (let s = 2; s <= 170; s++) {
		for (const route of getCheckouts(s)) {
			assert.equal(route.reduce((t, l) => t + value(l), 0), s, `${s}: ${route}`);
			assert.match(route.at(-1), /^(D\d+|B)$/);
			assert.ok(route.length <= 3);
		}
	}
});

test('no checkout for bogey numbers, above 170, or 1', () => {
	for (const s of [1, 159, 162, 163, 165, 166, 168, 169, 171, 301]) assert.equal(canCheckout(s), false, String(s));
});

test('darts left limits the routes', () => {
	assert.equal(canCheckout(100, 1), false);
	assert.deepEqual(getCheckouts(100, 2)[0], ['T20', 'D20']);
	assert.ok(getCheckouts(121, 2).every(r => r.length <= 2));
	assert.equal(canCheckout(40, 0), false);
});

test('without double out any dart finishes, up to 180', () => {
	const best = s => getCheckouts(s, 3, false)[0]?.join(' ');
	assert.equal(best(180), 'T20 T20 T20');
	assert.equal(best(171), 'T20 T20 T17');
	assert.equal(best(60), 'T20');
	assert.equal(best(20), '20');
	assert.equal(best(1), '1');
	assert.equal(canCheckout(179, 3, false), false);
	assert.equal(canCheckout(100, 1, false), false);
	// The same darts in another order are one route.
	for (const s of [100, 141, 180]) {
		const sets = getCheckouts(s, 3, false).map(r => [...r].sort().join());
		assert.equal(new Set(sets).size, sets.length, String(s));
	}
});

test('board style: wires are a thickness (0 for none); older on/off saves keep what they showed', () => {
	assert.equal(boardStyle({}).wire, 0);
	assert.equal(boardStyle({ wire: 0.8 }).wire, 0.8);
	assert.equal(boardStyle({ outline: 1.5, wires: true }).wire, 0.9); // on, before wires had a thickness
	assert.equal(boardStyle({ wires: true, wire: 1.2 }).wire, 1.2);
	assert.equal(boardStyle({ wires: false, wire: 1.2 }).wire, 0); // switched off
	assert.equal('wires' in boardStyle({ wires: true }), false);
});

test('board style: darts are solid by default, and older saves get that too', () => {
	assert.equal(boardStyle().seeThrough, false);
	assert.equal(boardStyle({ outline: 2 }).seeThrough, false);
	assert.equal(boardStyle({ seeThrough: true }).seeThrough, true);
});

test('randomDart lands in a scoring bed, where it says it did', () => {
	for (let i = 0; i < 300; i++) {
		const dart = randomDart();
		assert.ok(dart.value > 0);
		assert.equal(hitTest(dart.x, dart.y, 1).label, dart.label);
	}
});
