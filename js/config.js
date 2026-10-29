// Game rules and board geometry. Change values here, not in the logic.

export const START_SCORES = [301, 501, 701];
export const MAX_PLAYERS = 4;
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

// Ring edges as a percentage of the board image's radius (measured on dartboard_base.webp).
export const BOARD_RINGS = Object.freeze({
	bull: 6,
	outerBull: 17,
	innerSingle: 34,
	treble: 46,
	outerSingle: 68,
	double: 83,
	numberRing: 100, // counts as a miss (0)
});

export const STORAGE_KEY = 'dartscore:v2';
export const LEGACY_STORAGE_KEYS = ['dartGameData'];
export const MAX_UNDO_STEPS = 200;

// How long a status toast stays on screen.
export const TOAST_MS = 2200;
