// Game rules and board geometry. Change values here, not in the logic.

export const START_SCORES = [301, 501, 701];
export const MAX_PLAYERS = 10;
export const MAX_LEGS = 15;
export const MAX_SETS = 15;
export const MAX_TURN_SCORE = 180;
export const DARTS_PER_TURN = 3;
export const MAX_NAME_LENGTH = 24;

export const DEFAULT_SETTINGS = Object.freeze({
	startScore: 501,
	legs: 3, // first to
	sets: 1, // first to
	doubleOut: true,
	practice: false, // legs go on and on: no sets, no winner
});

// Practice games. Around the clock and doubles practice go 1 to 20, then the bull.
export const CLOCK_TARGETS = Object.freeze([...Array.from({ length: 20 }, (_, i) => i + 1), 25]);
export const CLOCK_RINGS = Object.freeze(['any', 'double', 'treble']); // which beds count in around the clock
export const DOUBLES_START = 27; // doubles practice: the score everyone starts on
// 121: the first target, visits to check out each target in, targets per leg.
export const ONE21 = Object.freeze({ start: 121, visits: 3, rounds: 10 });

// Totals between 0 and 180 that three darts cannot make.
export const IMPOSSIBLE_TURN_SCORES = new Set([163, 166, 169, 172, 173, 175, 176, 178, 179]);

// Clockwise from the top of the board.
export const BOARD_SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

// Board layout in % of the board radius (100 = outer edge of the number ring).
// Adjustable in Settings > Visuals; hit detection always follows what is drawn.
export const BOARD_LAYOUT = Object.freeze({
	ring: 10,       // treble and double ring width; the bulls grow with it
	legend: 15,     // number ring width (counts as a miss)
});
// The bulls' radii, as a share of the ring width.
export const BOARD_BULLS = Object.freeze({ bull: 0.6, outerBull: 1.6 });

// [min, max] for each layout value.
export const BOARD_LAYOUT_LIMITS = Object.freeze({
	ring: [5, 18],
	legend: [8, 25],
});

// The rings around the doubles and the board edge (width in % of the radius).
// wire: the wires round every bed, how thick (0: none), in the outline's colour.
// hitColor: the beds lit where darts landed (and everything else in that colour).
export const BOARD_STYLE = Object.freeze({ outline: 0.7, wire: 0, outlineColor: '#c8c8c8', hitColor: '#ffd24d' });
export const BOARD_WIRE_LIMITS = Object.freeze([0, 1.5]);
export const BOARD_OUTLINE_COLORS = Object.freeze(['#c8c8c8', '#808080', '#d4af37', '#000000']);
export const BOARD_HIT_COLORS = Object.freeze(['#ffd24d', '#ff8a3d', '#ff5cd6', '#4dd2ff', '#ffffff']);

export const STORAGE_KEY = 'dartscore:v2';
export const PREFS_KEY = 'dartscore:prefs'; // per-device view choices, e.g. keypad hidden
export const LEGACY_STORAGE_KEYS = ['dartGameData'];
export const MAX_UNDO_STEPS = 200;

// The darts drawn in the board, in perspective from an eye in front of the
// bull. Lengths in % of the board radius (100 = the number ring's edge).
export const DART_VIEW = Object.freeze({
	eye: 380,      // how far the eye is from the board: nearer, the darts splay out more
	length: 76,    // point to the end of the flights (a real dart, to the board's scale)
	thrower: 520,  // where darts are thrown from, straight out from the bull: each leans back towards it
	tilt: 0.07,    // how far a dart leans any way at random besides (tan of the angle)
	droop: -0.15,  // the usual lean: tails a little up, from their fall (negative is up)
	push: 0.1,     // how far a dart leans away from one whose flights it would land on (tan of the angle; 0 for none)
	pushReach: 16, // flights this far apart don't push: the nearer they'd be, the harder
	flightIn: 120, // how far in front of the board a thrown dart comes from
	flightMs: 170, // in the air
	wobbleMs: 380, // the wobble as it lands
	lift: 12,      // picked up to move: how far it comes out of the board (clear of it: more than the point in it)
	liftMs: 140,
	seeWithin: [3, 7], // a flight's middle this near another dart: fully see-through at the first, solid from the second
	seeMs: 200,    // going see-through or back, when its flight comes to cover another dart or stops
	pullOut: 40,   // taken out (the score sent, cleared, removed): how far it's pulled before it's gone
	pullMs: 240,
	pullGap: 70,   // between darts 1, 2 and 3 being taken out
});

// How close (as a fraction of the board radius) a tap must be to a dart's
// marker or its point to pick that dart up. The marker is 0.03 from its middle to its edge.
export const MARK_REACH = 0.05;

// Board layout throws three test darts as it opens: the time between them.
export const TEST_DART_GAP_MS = 220;

// How long a mouse rests on an ⓘ before its tip shows, so sweeping across a few doesn't flash each one.
export const INFO_HOVER_MS = 350;
// How many px the pointer moves before a press on a player's grip becomes a drag.
export const DRAG_FROM = 6;

// How long a status toast stays on screen.
export const TOAST_MS = 2200;
// How long the counter shows beside a finish after a tap cycles it.
export const CHECKOUT_COUNT_MS = 1500;
// A past turn's toast: px to keep between its Close and Settings, or Close loses its word.
export const TOAST_CLOSE_ROOM = 16;

// Player rows: heights in vmin at scale 1 (as in css/styles.css), and how far they may grow or shrink.
// rows: name + history; stats: the stats line; bigRows: name + big score + history.
// roomyFrom, bigFrom: the scale a layout must reach to be used (a layout still counts as fitting at 97% size).
export const SCORES_LAYOUT = Object.freeze({
	rows: 15, stats: 5, bigRows: 30,
	minScale: 0.7, maxScale: 1, bigMaxScale: 1.25,
	roomyFrom: 0.97, bigFrom: 0.97,
	fullLabelsFrom: 35.5, // how wide a card (vmin at scale 1) has room for full stat labels beside the big score
});
// On a phone the cards have the screen's whole width, and vmin is small: everything
// can and must be larger, and an extra line isn't worth smaller text.
export const SCORES_LAYOUT_PHONE = Object.freeze({
	...SCORES_LAYOUT,
	minScale: 1, maxScale: 1.7, bigMaxScale: 1.9,
	roomyFrom: 1.3, bigFrom: 1.4,
});
