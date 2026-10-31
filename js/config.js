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
	bull: 6,        // bullseye radius
	outerBull: 16,  // outer bull radius
	trebleAt: 40,   // where the treble ring starts
	treble: 10,     // treble ring width
	double: 10,     // double ring width
	legend: 15,     // number ring width (counts as a miss)
});

// [min, max] for each layout value.
export const BOARD_LAYOUT_LIMITS = Object.freeze({
	bull: [3, 12],
	outerBull: [8, 28],
	trebleAt: [20, 70],
	treble: [4, 20],
	double: [4, 20],
	legend: [8, 25],
});

// The white rings around the doubles and the board edge (width in % of the radius).
// wire: the wires round every bed, how thick (0: none), in the outline's colour.
// hitColor: the beds lit where darts landed (and everything else in that colour).
export const BOARD_STYLE = Object.freeze({ outline: 1, wire: 0, outlineColor: '#ffffff', hitColor: '#ffd24d' });
export const BOARD_OUTLINE_LIMITS = Object.freeze([0, 2.5]);
export const BOARD_WIRE_LIMITS = Object.freeze([0, 1.5]);
export const BOARD_OUTLINE_COLORS = Object.freeze(['#ffffff', '#c8c8c8', '#808080', '#d4af37', '#000000']);
export const BOARD_HIT_COLORS = Object.freeze(['#ffd24d', '#ff8a3d', '#ff5cd6', '#4dd2ff', '#ffffff']);

export const STORAGE_KEY = 'dartscore:v2';
export const PREFS_KEY = 'dartscore:prefs'; // per-device view choices, e.g. keypad hidden
export const LEGACY_STORAGE_KEYS = ['dartGameData'];
export const MAX_UNDO_STEPS = 200;

// The darts drawn in the board, in perspective from an eye in front of the
// bull. Lengths in % of the board radius (100 = the number ring's edge).
export const DART_VIEW = Object.freeze({
	eye: 300,      // how far the eye is from the board: nearer, the darts splay out more
	length: 76,    // point to the end of the flights (a real dart, to the board's scale)
	tilt: 0.09,    // how far a dart leans any way at random (tan of the angle)
	droop: -0.1,   // the usual lean: tails a little up (negative is up)
	flightIn: 120, // how far in front of the board a thrown dart comes from
	flightMs: 170, // in the air
	wobbleMs: 380, // the wobble as it lands
	lift: 6,       // picked up to move: how far it comes out of the board
	liftMs: 140,
	pullOut: 40,   // taken out (the score sent, cleared, removed): how far it's pulled before it's gone
	pullMs: 240,
	pullGap: 70,   // between darts 1, 2 and 3 being taken out
});

// How close (as a fraction of the board radius) a tap must be to a dart's
// marker or its point to pick that dart up. The marker is 0.03 from its middle to its edge.
export const MARK_REACH = 0.05;

// How long a status toast stays on screen.
export const TOAST_MS = 2200;

// Player rows: heights in vmin at scale 1 (as in css/styles.css), and how far they may grow or shrink.
// rows: name + history; stats: the stats line; bigRows: name + big score + history.
export const SCORES_LAYOUT = Object.freeze({
	rows: 15, stats: 5, bigRows: 30,
	minScale: 0.7, maxScale: 1, bigMaxScale: 1.25,
	tolerance: 0.97, // a layout still counts as fitting at 97% size
});
