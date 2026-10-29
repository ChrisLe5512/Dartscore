// Checkout suggestions: every finish of up to three darts that ends on a
// double or the bull, ranked the way checkout charts usually rank them.

const ROUTES_PER_SCORE = 5;

// Lower = more preferred finishing double (the classic "good" doubles first).
const DOUBLE_PREFERENCE = [20, 16, 18, 12, 10, 8, 14, 6, 4, 2, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1];

function makeDart(label, value, cost) {
	return { label, value, cost };
}

// Darts that can set up a finish. Singles are safest, trebles are riskier
// (and riskier still on low numbers you would not normally aim for).
const SETUP_DARTS = [];
for (let n = 1; n <= 20; n++) {
	SETUP_DARTS.push(makeDart(String(n), n, 0));
	SETUP_DARTS.push(makeDart(`T${n}`, 3 * n, n === 20 ? 4 : 5 + (20 - n) ** 2 * 0.1));
	SETUP_DARTS.push(makeDart(`D${n}`, 2 * n, 12 + DOUBLE_PREFERENCE.indexOf(n) * 0.3));
}
SETUP_DARTS.push(makeDart('OB', 25, 8));
SETUP_DARTS.push(makeDart('B', 50, 10));

const FINISHING_DARTS = DOUBLE_PREFERENCE.map((n, rank) => makeDart(`D${n}`, 2 * n, rank));
FINISHING_DARTS.push(makeDart('B', 50, 12));

let table = null; // table[dartCount][score] = [{ darts: [labels], cost }]

function buildTable() {
	table = [null, [], [], []];
	const add = (darts, finish) => {
		const total = darts.reduce((sum, d) => sum + d.value, finish.value);
		const route = {
			darts: [...darts.map(d => d.label), finish.label],
			cost: darts.reduce((sum, d) => sum + d.cost, finish.cost),
		};
		const bucket = (table[route.darts.length][total] ??= []);
		bucket.push(route);
	};

	for (const finish of FINISHING_DARTS) {
		add([], finish);
		for (const a of SETUP_DARTS) {
			add([a], finish);
			for (const b of SETUP_DARTS) {
				// Same pair in the other order is the same route: keep the bigger dart first.
				if (b.value > a.value || (b.value === a.value && b.cost < a.cost)) continue;
				add([a, b], finish);
			}
		}
	}

	for (const byScore of table.slice(1)) {
		for (const routes of byScore) {
			if (!routes) continue;
			routes.sort((x, y) => x.cost - y.cost);
			routes.length = Math.min(routes.length, ROUTES_PER_SCORE);
		}
	}
}

/**
 * Ranked finishes for `score` with at most `dartsLeft` darts.
 * Each route is an array of labels, e.g. ['T20', 'D20'].
 */
export function getCheckouts(score, dartsLeft = 3) {
	if (!Number.isInteger(score) || score < 2 || score > 170 || dartsLeft < 1) return [];
	if (!table) buildTable();
	const routes = [];
	for (let n = 1; n <= Math.min(dartsLeft, 3); n++) {
		// Fewer darts always beats a cheaper route with more darts.
		for (const route of table[n][score] ?? []) routes.push(route.darts);
	}
	return routes;
}

export function canCheckout(score, dartsLeft = 3) {
	return getCheckouts(score, dartsLeft).length > 0;
}
