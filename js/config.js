// Game rules and board geometry. Change values here, not in the logic.

export const START_SCORES = [301, 501, 701];
export const MAX_PLAYERS = 12;
export const MAX_LEGS = 15;
export const MAX_SETS = 15;
export const MAX_TURN_SCORE = 180;
export const DARTS_PER_TURN = 3;
export const MAX_NAME_LENGTH = 24;

export const DEFAULT_SETTINGS = Object.freeze({
	startScore: 301,
	legs: 2,
	sets: 2,
	doubleOut: false,
});

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
export const BOARD_STYLE = Object.freeze({ outline: 1, outlineColor: '#ffffff', wires: false });
export const BOARD_OUTLINE_LIMITS = Object.freeze([0, 2.5]);
export const BOARD_OUTLINE_COLORS = Object.freeze(['#ffffff', '#c8c8c8', '#d4af37', '#000000']);

export const STORAGE_KEY = 'dartscore:v2';
export const PREFS_KEY = 'dartscore:prefs'; // per-device view choices, e.g. keypad hidden
export const LEGACY_STORAGE_KEYS = ['dartGameData'];
export const MAX_UNDO_STEPS = 200;

// How long a status toast stays on screen.
// How close (as a fraction of the board radius) a tap must be to a dart's
// marker to pick that dart up. The marker itself is 0.036 across the middle.
export const MARK_REACH = 0.05;

export const TOAST_MS = 2200;

// Player rows: heights in vmin at scale 1 (as in css/styles.css), and how far they may grow or shrink.
// rows: name + history; stats: the stats line; bigRows: name + big score + history.
export const SCORES_LAYOUT = Object.freeze({
	rows: 15, stats: 5, bigRows: 30, addRow: 10,
	minScale: 0.7, maxScale: 1, bigMaxScale: 1.25,
	tolerance: 0.97, // a layout still counts as fitting at 97% size
});
