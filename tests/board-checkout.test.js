import test from 'node:test';
import assert from 'node:assert/strict';
import { hitTest, makeDart } from '../js/board.js';
import { canCheckout, getCheckouts } from '../js/checkout.js';

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
	assert.equal(hit(40, 0).label, 'T20');
	assert.equal(hit(55, 0).label, '20');
	assert.equal(hit(75, 0).label, 'D20');
	assert.equal(hit(90, 0).label, '0');
	assert.equal(hit(90, 0).value, 0);
	assert.equal(hit(101, 0), null);
});

test('sectors go clockwise from 20', () => {
	const order = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
	order.forEach((n, i) => assert.equal(hit(25, i * 18).sector, n, `sector at ${i * 18}°`));
	assert.equal(hit(25, 8).sector, 20);
	assert.equal(hit(25, 10).sector, 1);
	assert.equal(hit(25, 352).sector, 20);
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
