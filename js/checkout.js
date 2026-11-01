// Checkout suggestions: every finish of up to three darts, ranked the way
// checkout charts usually rank them. With double out a finish ends on a double
// or the bull; without, any dart can finish.

const ROUTES_PER_SCORE = 5;

// Lower = more preferred finishing double (the classic "good" doubles first).
const DOUBLE_PREFERENCE = [20, 16, 18, 12, 10, 8, 14, 6, 4, 2, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1];

function makeDart(label, value, cost) {
	return { label, value, cost };
}

// Darts that can set up a finish. Singles are safest, trebles are riskier
// (and riskier still on low numbers you would not normally aim for).
// trebleCost(n): what aiming at treble n costs.
function setupDarts(trebleCost) {
	const darts = [];
	for (let n = 1; n <= 20; n++) {
		darts.push(makeDart(String(n), n, 0));
		darts.push(makeDart(`T${n}`, 3 * n, n === 20 ? 4 : trebleCost(n)));
		darts.push(makeDart(`D${n}`, 2 * n, 12 + DOUBLE_PREFERENCE.indexOf(n) * 0.3));
	}
	darts.push(makeDart('OB', 25, 8));
	darts.push(makeDart('B', 50, 10));
	return darts;
}

const SETUP_DARTS = setupDarts(n => 5 + (20 - n) ** 2 * 0.1);
// Without double out the big finishes are all trebles, so a low treble costs
// less next to T20 T20 (141 is T20 T20 T7, not T16 T16 T15).
const ANY_OUT_DARTS = setupDarts(n => 5 + (20 - n) * 0.5);

const FINISHING_DARTS = DOUBLE_PREFERENCE.map((n, rank) => makeDart(`D${n}`, 2 * n, rank));
FINISHING_DARTS.push(makeDart('B', 50, 12));

// table[dartCount][score] = [{ darts: [labels], cost }], one for each way out.
const tables = { double: null, any: null };

// Same darts in another order are the same route: the bigger dart goes first.
const before = (a, b) => b.value > a.value || (b.value === a.value && b.cost < a.cost);

function buildTable(anyOut) {
	const table = [null, [], [], []];
	const add = (darts, finish) => {
		// Without double out the last dart is just another dart.
		if (anyOut && darts.length && before(darts.at(-1), finish)) return;
		const total = darts.reduce((sum, d) => sum + d.value, finish.value);
		const route = {
			darts: [...darts.map(d => d.label), finish.label],
			cost: darts.reduce((sum, d) => sum + d.cost, finish.cost),
		};
		const bucket = (table[route.darts.length][total] ??= []);
		bucket.push(route);
	};

	const setup = anyOut ? ANY_OUT_DARTS : SETUP_DARTS;
	for (const finish of anyOut ? setup : FINISHING_DARTS) {
		add([], finish);
		for (const a of setup) {
			add([a], finish);
			for (const b of setup) {
				if (!before(a, b)) add([a, b], finish);
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
	return table;
}

/**
 * Ranked finishes for `score` with at most `dartsLeft` darts.
 * Each route is an array of labels, e.g. ['T20', 'D20'].
 */
export function getCheckouts(score, dartsLeft = 3, doubleOut = true) {
	if (!Number.isInteger(score) || score < 1 || dartsLeft < 1) return [];
	const table = doubleOut ? (tables.double ??= buildTable(false)) : (tables.any ??= buildTable(true));
	const routes = [];
	for (let n = 1; n <= Math.min(dartsLeft, 3); n++) {
		// Fewer darts always beats a cheaper route with more darts.
		for (const route of table[n][score] ?? []) routes.push(route.darts);
	}
	return routes;
}

/**
 * The finish to show as the darts land: the suggestion stays while the darts
 * follow it, with `done` of it thrown; a dart off it means a new one from what's
 * left. choice: which of the ranked ways out. Returns { route, done, index, total }
 * (index: which of the total ways out it is), or null when there is none (or a bust).
 */
export function followCheckout(score, thrown, doubleOut = true, choice = 0) {
	const pick = (left, darts) => {
		const routes = getCheckouts(left, darts, doubleOut);
		const index = choice % routes.length;
		return routes.length ? { route: routes[index], done: 0, index, total: routes.length } : null;
	};
	let left = score;
	let plan = pick(left, 3);
	thrown.forEach((dart, index) => {
		left -= dart.value;
		if (plan?.route[plan.done] === dart.label) plan = { ...plan, done: plan.done + 1 };
		else plan = pick(left, 3 - index - 1);
	});
	return plan;
}

export function canCheckout(score, dartsLeft = 3, doubleOut = true) {
	return getCheckouts(score, dartsLeft, doubleOut).length > 0;
}
