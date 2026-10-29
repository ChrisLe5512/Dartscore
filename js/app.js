// Wires the game logic to the page. All game rules live in game.js;
// this file only turns taps into actions and state into DOM.

import {
	BOARD_LAYOUT, BOARD_LAYOUT_LIMITS, BOARD_OUTLINE_COLORS, BOARD_OUTLINE_LIMITS, BOARD_STYLE,
	DARTS_PER_TURN, MAX_LEGS, MAX_SETS, MAX_TURN_SCORE, SCORES_LAYOUT, START_SCORES, TOAST_MS,
} from './config.js';
import { boardRings, hitTest, isOnBoard, locate } from './board.js';
import { getCheckouts } from './checkout.js';
import { boardRadius, drawBoard, drawMarks, lightSegments, segmentKey } from './dartboard.js';
import { describeTravel, describeTurn } from './feedback.js';
import * as Game from './game.js';
import * as History from './history.js';
import { loadPrefs, loadSession, savePrefs, saveSession } from './storage.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// ---- State ------------------------------------------------------------------

const saved = loadSession();
const prefs = loadPrefs(); // this device's view choices (keypad, board look)
let game = saved?.game ?? Game.createGame();
let history = saved?.history ?? History.createHistory();

// The turn being entered. Not part of the game until it is submitted.
const turn = {
	keypad: '',   // digits typed on the keypad
	darts: [],    // darts tapped on the board
};
const checkoutChoice = new Map(); // player id -> which suggested route to show
let review = null; // { id, index }: a past turn whose darts are shown on the board

/** Apply a change to the game, keeping the old state for undo. */
function commit(next) {
	if (next === game) return;
	history = History.record(history, game);
	game = next;
	checkoutChoice.clear();
	review = null;
	persist();
	render();
}

function persist() {
	saveSession(game, history);
}

function undo() {
	travel(History.undo(history, game), 'undo');
}

function redo() {
	travel(History.redo(history, game), 'redo');
}

function travel(result, direction) {
	if (!result) return;
	// Renaming isn't an undoable step, so names always stay as last typed.
	const names = new Map(game.players.map(p => [p.id, p.name]));
	const next = { ...result.state, players: result.state.players.map(p => ({ ...p, name: names.get(p.id) ?? p.name })) };
	showToast(describeTravel(game, next, direction));
	game = next;
	history = result.history;
	checkoutChoice.clear();
	review = null;
	clearTurn();
	persist();
	render();
}

function clearTurn() {
	turn.keypad = '';
	turn.darts = [];
}

/** Returns the game event, or null if the turn wasn't recorded. */
function submit(score, darts = null) {
	const { state, event } = Game.submitTurn(game, score, darts);
	if (!event) {
		if (game.winner !== null) showWinner();
		return null;
	}
	const before = game;
	clearTurn();
	commit(state);
	if (event === 'match') showWinner();
	else showToast(describeTurn(before, event, score));
	return event;
}

/** Restart a CSS animation class on an element that stays on the page. */
function replay(el, className) {
	el.classList.remove(className);
	void el.offsetWidth; // let the browser see the class go before it comes back
	el.classList.add(className);
}

/** Play a dialog's closing animation, then hide it. */
function closeDialog(dialog) {
	if (dialog.hidden || dialog.classList.contains('closing')) return;
	dialog.classList.add('closing');
	const closing = dialog.getAnimations({ subtree: true })
		.filter(a => a.effect?.getComputedTiming().iterations !== Infinity); // e.g. the trophy's glow
	Promise.allSettled(closing.map(a => a.finished)).then(() => {
		if (!dialog.classList.contains('closing')) return; // reopened meanwhile
		dialog.classList.remove('closing');
		dialog.hidden = true;
	});
}

function openDialog(dialog) {
	dialog.classList.remove('closing');
	dialog.hidden = false;
}

const dartsTotal = () => turn.darts.reduce((sum, d) => sum + d.value, 0);
const matchStarted = () => game.players.some(p => p.turns.length > 0);

// ---- Scoreboard -------------------------------------------------------------

const scoresSection = $('.scores-section');
const scoresTable = $('.scores-tbl');
const scoresBody = $('tbody', scoresTable);
const addPlayerRow = $('.add-player', scoresTable);

function addPlayer() {
	if (!Game.canAddPlayer(game)) return;
	commit(Game.addPlayer(game));
	return game.players.length - 1;
}

addPlayerRow.addEventListener('click', () => {
	const index = addPlayer();
	if (index === undefined) return;
	const input = $$('.player-name input', scoresBody)[index];
	input.focus();
	input.select();
});

function createPlayerRows(player) {
	const playerRow = document.createElement('tr');
	playerRow.className = 'player-row';
	playerRow.dataset.id = player.id;
	playerRow.innerHTML = `
		<td class="player-wins"><u></u><br><span class="player-sets"></span></td>
		<td class="target-wins"></td>
		<td colspan="4" class="player-name"><input type="text" autocomplete="off" spellcheck="false" aria-label="Player name"></td>
		<td class="player-score"></td>`;

	// History and checkout share one line; the checkout takes what it needs.
	const historyRow = document.createElement('tr');
	historyRow.className = 'history-row';
	historyRow.dataset.id = player.id;
	historyRow.innerHTML = `
		<td colspan="7" class="history-cell"><div class="history-line">
			<div class="history scrollable"></div>
			<div class="checkout hidden" role="button" aria-label="Next checkout route"></div>
		</div></td>`;

	// Only shown when there is room (see layoutScores). In the big layout the
	// score moves down here, next to the stats, so the name gets the full width.
	const statsRow = document.createElement('tr');
	statsRow.className = 'stats-row';
	statsRow.dataset.id = player.id;
	statsRow.innerHTML = `
		<td colspan="7" class="stats-cell"><div class="stats-line">
			<div class="stats">
				<span>Avg <b class="stat-average"></b></span>
				<span>Best <b class="stat-best"></b></span>
				<span>Darts <b class="stat-darts"></b></span>
			</div>
			<div class="big-score"></div>
		</div></td>`;

	const input = $('input', playerRow);
	input.addEventListener('input', () => {
		const index = game.players.findIndex(p => p.id === player.id);
		game = Game.renamePlayer(game, index, input.value);
		persist();
	});
	input.addEventListener('change', () => render());
	input.addEventListener('keydown', event => {
		if (event.key === 'Enter') input.blur();
	});

	$('.checkout', historyRow).addEventListener('click', () => {
		checkoutChoice.set(player.id, (checkoutChoice.get(player.id) ?? 0) + 1);
		renderScoreboard();
	});

	const history = $('.history', historyRow);
	history.addEventListener('scroll', () => {
		history.dataset.pinned = atEnd(history);
		updateFades(history);
	}, { passive: true });
	historyResize.observe(history);
	// Tap a turn entered on the board to see where its darts landed.
	history.addEventListener('click', event => {
		const span = event.target.closest('span');
		const current = game.players.find(p => p.id === player.id);
		if (span && current) toggleReview(current, [...history.children].indexOf(span));
	});

	return [playerRow, statsRow, historyRow];
}

function renderScoreboard() {
	const rowsById = new Map();
	for (const row of $$('.player-row, .history-row, .stats-row', scoresBody)) {
		const id = Number(row.dataset.id);
		if (!rowsById.has(id)) rowsById.set(id, []);
		rowsById.get(id).push(row);
	}

	// Only move rows that are out of place: re-inserting a row restarts its animations.
	let cursor = scoresBody.firstElementChild;
	const place = row => {
		if (row === cursor) cursor = cursor.nextElementSibling;
		else scoresBody.insertBefore(row, cursor);
	};

	let activeRows = null;
	game.players.forEach((player, index) => {
		const rows = rowsById.get(player.id) ?? createPlayerRows(player);
		rowsById.delete(player.id);
		rows.forEach(place);
		const [playerRow, statsRow, historyRow] = rows;

		const isActive = index === game.active && game.winner === null;
		if (isActive && !playerRow.classList.contains('active')) activeRows = rows;
		playerRow.classList.toggle('active', isActive);
		statsRow.classList.toggle('active', isActive);
		$('.player-wins u', playerRow).innerHTML = `${player.legs}&#8196;&#8196;`;
		$('.player-sets', playerRow).textContent = player.sets;
		$('.target-wins', playerRow).innerHTML = `&nbsp;/${game.settings.legs}<br>&nbsp;/${game.settings.sets}`;
		for (const scoreCell of [$('.player-score', playerRow), $('.big-score', statsRow)]) {
			if (scoreCell.textContent === String(player.score)) continue;
			if (scoreCell.textContent !== '') replay(scoreCell, 'bump');
			scoreCell.textContent = player.score;
		}
		const input = $('input', playerRow);
		if (document.activeElement !== input) input.value = player.name;

		renderHistory($('.history', historyRow), player);
		renderCheckout(historyRow, player, isActive);
		renderStats(statsRow, player);
	});

	for (const rows of rowsById.values()) rows.forEach(row => row.remove());
	// New players join from the scoreboard before the first throw, from Settings after.
	addPlayerRow.classList.toggle('hidden', !Game.canAddPlayer(game) || matchStarted());
	layoutScores();

	// Keep the thrower in view when the list scrolls.
	if (activeRows) {
		const [first, , last] = activeRows;
		last.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		first.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}
}

/**
 * Size the player rows to the space there is. The base sizes in the CSS fit
 * four players above the keypad. With room to spare a stats line appears
 * ("roomy"), then the score moves to its own big line ("big"). With more
 * players the rows shrink and the list scrolls.
 */
function layoutScores() {
	const { rows, bigRows, addRow, minScale, maxScale, bigMaxScale } = SCORES_LAYOUT;
	const count = game.players.length;
	const available = scoresSection.offsetHeight / (innerHeight / 100); // in vh
	const add = addPlayerRow.classList.contains('hidden') ? 0 : addRow;
	const fit = block => (count ? available / (count * block + add) : 1);
	const big = count > 0 && fit(bigRows) >= 1;
	const roomy = big || (count > 0 && fit(rows + SCORES_LAYOUT.stats) >= 1);
	const scale = big ? Math.min(bigMaxScale, fit(bigRows)) : fit(rows + (roomy ? SCORES_LAYOUT.stats : 0));
	scoresTable.style.setProperty('--s', Math.min(big ? bigMaxScale : maxScale, Math.max(minScale, scale)).toFixed(3));
	scoresTable.classList.toggle('roomy', roomy);
	scoresTable.classList.toggle('big', big);
}

new ResizeObserver(layoutScores).observe(scoresSection);

const atEnd = el => el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;

/** Fade whichever edge of the history has more turns hidden past it. */
function updateFades(el) {
	el.classList.toggle('fade-left', el.scrollLeft > 1);
	el.classList.toggle('fade-right', !atEnd(el));
}

/** Show the latest turn unless the player scrolled back to look at older ones. */
function stickToEnd(el, behavior = 'instant') {
	if (el.dataset.pinned !== 'false') el.scrollTo({ left: el.scrollWidth, behavior });
	updateFades(el);
}

// The history narrows when a checkout appears or the rows resize.
const historyResize = new ResizeObserver(entries => entries.forEach(entry => stickToEnd(entry.target)));

function renderHistory(cell, player) {
	const key = player.turns.length;
	if (cell.dataset.turns === String(key)) return;
	const added = cell.dataset.turns !== undefined && key > Number(cell.dataset.turns);
	cell.dataset.turns = key;
	// Oldest on the left, so the line reads in the order the turns were thrown.
	cell.replaceChildren(...player.turns.map(t => {
		const span = document.createElement('span');
		const bold = document.createElement('b');
		bold.textContent = t.score;
		span.append(bold);
		if (t.bust) span.title = `Bust (${t.attempted})`;
		if (t.hits) span.classList.add('has-hits');
		return span;
	}));
	if (added) {
		cell.lastElementChild?.classList.add('enter');
		cell.dataset.pinned = true;
	}
	stickToEnd(cell, added ? 'smooth' : 'instant');
}

function renderCheckout(historyRow, player, isActive) {
	// The thrower's suggestion follows the darts already on the board.
	const dartsLeft = isActive ? DARTS_PER_TURN - turn.darts.length : DARTS_PER_TURN;
	const remaining = isActive ? player.score - dartsTotal() : player.score;
	const routes = game.winner === null ? getCheckouts(remaining, dartsLeft) : [];
	const checkoutCell = $('.checkout', historyRow);
	if (routes.length) {
		const route = routes[(checkoutChoice.get(player.id) ?? 0) % routes.length];
		checkoutCell.classList.remove('hidden');
		checkoutCell.textContent = `\u{1F3AF} ${route.join(' ')}`;
	} else {
		checkoutCell.classList.add('hidden');
		checkoutCell.textContent = '';
		checkoutChoice.delete(player.id);
	}
}

function renderStats(statsRow, player) {
	const { average, darts, best } = Game.playerStats(player);
	const none = darts === 0; // nothing thrown yet
	$('.stat-average', statsRow).textContent = none ? '–' : average.toFixed(1);
	$('.stat-best', statsRow).textContent = none ? '–' : best;
	$('.stat-darts', statsRow).textContent = darts;
}

// ---- Keypad -----------------------------------------------------------------

const backBtn = $('.back-score');
const checkBtn = $('.check-score');
const resetBtn = $('.reset-score');
const scoreDisplay = $('.calc-score');

function typeDigit(digit) {
	const next = String(parseInt(turn.keypad + digit, 10));
	if (Number(next) <= MAX_TURN_SCORE) turn.keypad = next;
	renderKeypad();
}

function stepKeypad(step) {
	if (turn.keypad === '') return;
	const next = Number(turn.keypad) + step;
	if (next >= 0 && next <= MAX_TURN_SCORE) turn.keypad = String(next);
	renderKeypad();
	// The score box rocks like a switch towards the half that was pressed.
	scoreDisplay.classList.remove('tip-up', 'tip-down');
	replay(scoreDisplay, step > 0 ? 'tip-up' : 'tip-down');
}

function backspace() {
	turn.keypad = turn.keypad.slice(0, -1);
	renderKeypad();
}

function resetKeypad() {
	turn.keypad = '';
	renderKeypad();
}

function submitKeypad() {
	if (turn.keypad === '') return;
	const score = Number(turn.keypad);
	if (Game.isValidTurnScore(score)) submit(score);
}

$$('.calc-tbl td[data-digit]').forEach(cell => {
	cell.addEventListener('click', () => typeDigit(cell.dataset.digit));
});
backBtn.addEventListener('click', backspace);
resetBtn.addEventListener('click', resetKeypad);
checkBtn.addEventListener('click', submitKeypad);
scoreDisplay.addEventListener('click', event => {
	const rect = scoreDisplay.getBoundingClientRect();
	stepKeypad(event.clientY < rect.top + rect.height / 2 ? 1 : -1);
});

function renderKeypad() {
	const score = turn.keypad;
	const up = score === String(MAX_TURN_SCORE) ? 'b' : 'i'; // <b> = greyed arrow at the limit
	const down = score === '0' ? 'b' : 'i';
	scoreDisplay.innerHTML = score === '' ? '' : `<${up}>&#x25B4;</${up}><br>${score}<br><${down}>&#x25BE;</${down}>`;

	const empty = score === '';
	[backBtn, resetBtn, scoreDisplay].forEach(el => el.classList.toggle('disabled', empty));
	checkBtn.classList.toggle('disabled', empty || !Game.isValidTurnScore(Number(score)));
}

// ---- Dartboard and darts column ----------------------------------------------

const board = $('#dartboard');
const dartSpans = $$('.darts span');
const bustBtn = $('.bust-btn');
const doneBtn = $('.done-btn');
const dartsClearBtn = $('.darts-clear');
const dartsTotalCell = $('.darts-total');
const debugSpan = $('.debug-span');
const debug = new URLSearchParams(location.search).has('debug');
debugSpan.hidden = !debug;

function boardOffset(event) {
	const rect = board.getBoundingClientRect();
	return {
		dx: event.clientX - (rect.left + rect.width / 2),
		dy: event.clientY - (rect.top + rect.height / 2),
		radius: boardRadius(rect.width),
	};
}

// With a mouse, the segment under the pointer lights up faintly.
let hovered = null;
board.addEventListener('mousemove', event => {
	const { dx, dy, radius } = boardOffset(event);
	board.style.cursor = isOnBoard(dx, dy, radius) ? 'crosshair' : 'default';
	const spot = locate(dx, dy, radius, rings);
	const key = spot && segmentKey(spot.sector, spot.ring);
	if (key === hovered) return;
	hovered = key;
	renderLights();
});
board.addEventListener('mouseleave', () => {
	hovered = null;
	renderLights();
});

board.addEventListener('click', event => {
	const { dx, dy, radius } = boardOffset(event);
	const dart = hitTest(dx, dy, radius, rings);
	if (debug) {
		const pct = Math.round(Math.hypot(dx, dy) / radius * 100);
		debugSpan.textContent = `(${Math.round(dx)}, ${Math.round(dy)}) ${pct}% ${dart?.label ?? 'off'}`;
	}
	if (!dart || turn.darts.length >= DARTS_PER_TURN) return;
	// Keep where it landed (as a fraction of the radius) to mark it on the board.
	turn.darts.push({ ...dart, x: dx / radius, y: dy / radius });
	review = null;
	renderDarts();
});

dartSpans.forEach((span, index) => {
	span.addEventListener('click', () => {
		if (!turn.darts[index]) return;
		turn.darts.splice(index, 1);
		renderDarts();
	});
});

dartsClearBtn.addEventListener('click', () => {
	turn.darts = [];
	renderDarts();
});

doneBtn.addEventListener('click', () => {
	if (turn.darts.length) submit(dartsTotal(), turn.darts);
});

bustBtn.addEventListener('click', () => {
	const name = game.players[game.active]?.name;
	if (submit(0) === 'turn') showToast({ kind: 'bust', title: 'Bust', detail: name });
});

let dartsShown = 0;

function renderDarts() {
	dartSpans.forEach((span, index) => {
		const dart = turn.darts[index];
		const landed = dart && index >= dartsShown;
		span.className = dart ? dart.color : '';
		if (landed) replay(span, 'pop');
		if (!dart) {
			span.replaceChildren();
			return;
		}
		const label = document.createElement('u');
		label.textContent = dart.label;
		// Corner number, matching the dart's marker on the board.
		const number = document.createElement('i');
		number.className = 'dart-num';
		number.textContent = index + 1;
		span.replaceChildren(number, label);
		// Doubles, trebles and bulls also show what they are worth.
		if (dart.multiplier > 1 || dart.sector === 25) span.append(document.createElement('br'), String(dart.value));
	});

	renderMarks(dartsShown);
	dartsShown = turn.darts.length;

	const hasDarts = turn.darts.length > 0;
	dartsClearBtn.textContent = hasDarts ? 'Clear' : 'Darts';
	dartsClearBtn.classList.toggle('disabled', !hasDarts);
	dartsTotalCell.textContent = hasDarts ? dartsTotal() : '';
	dartsTotalCell.classList.toggle('disabled', !hasDarts);
	doneBtn.classList.toggle('disabled', !hasDarts);

	// The active player's checkout follows the darts on the board.
	renderScoreboard();
}

// ---- Board markers ------------------------------------------------------------

// Numbered markers where the darts of this turn landed, and their segments lit
// up. Tapping a turn in a player's history shows that turn's darts instead
// (when it was entered on the board).
let rings = boardRings(prefs.boardLayout);
drawBoard(board, rings, prefs.boardStyle);

/** Redraw the board, e.g. after its layout or outline changed in Settings. */
function redrawBoard() {
	rings = boardRings(prefs.boardLayout);
	drawBoard(board, rings, prefs.boardStyle);
	renderMarks();
}

/** The darts on show: this turn's, or the reviewed turn's. */
function shownHits() {
	if (turn.darts.length) return { hits: turn.darts, kind: 'live' };
	const reviewed = review && reviewedTurn();
	return { hits: reviewed?.hits?.map(([x, y]) => ({ x, y })) ?? [], kind: 'review' };
}

function renderMarks(alreadyShown = DARTS_PER_TURN) {
	const { hits, kind } = shownHits();
	drawMarks(board, hits, kind, kind === 'live' ? alreadyShown : hits.length);
	renderLights();

	for (const span of $$('.history span.reviewing', scoresBody)) span.classList.remove('reviewing');
	if (kind === 'review' && hits.length) {
		$(`.history-row[data-id="${review.id}"] .history`, scoresBody)?.children[review.index]?.classList.add('reviewing');
	}
}

function renderLights() {
	const { hits, kind } = shownHits();
	const lights = hits.map(({ x, y }) => locate(x, y, 1, rings))
		.filter(Boolean)
		.map(spot => ({ key: segmentKey(spot.sector, spot.ring), kind: kind === 'live' ? 'hit' : 'review' }));
	if (hovered && !lights.some(light => light.key === hovered)) lights.push({ key: hovered, kind: 'hover' });
	lightSegments(board, lights);
}

function reviewedTurn() {
	return game.players.find(p => p.id === review.id)?.turns[review.index];
}

/** Show (or, tapped again, hide) where a turn's darts landed. */
function toggleReview(player, index) {
	const same = review?.id === player.id && review.index === index;
	const turnThrown = player.turns[index];
	if (same || !turnThrown?.hits || turn.darts.length) {
		review = null;
	} else {
		review = { id: player.id, index };
		const detail = `${turnThrown.darts.join(' ')} = ${turnThrown.bust ? `bust (${turnThrown.attempted})` : turnThrown.score}`;
		showToast({ kind: 'info', title: player.name, detail });
	}
	renderMarks();
}


// ---- Controls ---------------------------------------------------------------

const undoBtn = $('.ctrl-tbl .undo');
const redoBtn = $('.ctrl-tbl .redo');
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);
$('.ctrl-tbl .settings-btn').addEventListener('click', openSettings);
$('.ctrl-tbl .full-screen').addEventListener('click', toggleFullscreen);

function renderControls() {
	undoBtn.classList.toggle('disabled', history.past.length === 0);
	redoBtn.classList.toggle('disabled', history.future.length === 0);
}

// The keypad can fold away; remembered on this device.
const sidebar = $('aside');
const keypadToggle = $('.ctrl-tbl .keypad-btn');

function setKeypadHidden(hidden) {
	sidebar.classList.toggle('keypad-hidden', hidden);
	keypadToggle.setAttribute('aria-expanded', String(!hidden));
	keypadToggle.setAttribute('aria-label', hidden ? 'Show keypad' : 'Hide keypad');
	if (Boolean(prefs.keypadHidden) === hidden) return;
	prefs.keypadHidden = hidden;
	savePrefs(prefs);
}

keypadToggle.addEventListener('click', () => setKeypadHidden(!sidebar.classList.contains('keypad-hidden')));
setKeypadHidden(Boolean(prefs.keypadHidden));

function toggleFullscreen() {
	const doc = document.documentElement;
	const active = document.fullscreenElement ?? document.webkitFullscreenElement;
	if (active) (document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document);
	else (doc.requestFullscreen ?? doc.webkitRequestFullscreen)?.call(doc)?.catch?.(() => {});
}

// ---- Settings ---------------------------------------------------------------

const settingsDialog = $('#settings');
const startScoreSelect = $('#start-score');
const legsInput = $('#num-legs');
const setsInput = $('#num-sets');
const doubleOutInput = $('#double-out');
const playersBody = $('.players-tbl tbody');
const playersAddRow = $('.players-add');
const noteRow = $('.settings-note-row');

startScoreSelect.append(...START_SCORES.map(score => new Option(score, score)));
legsInput.max = MAX_LEGS;
setsInput.max = MAX_SETS;


function readSettingsForm() {
	return Game.normalizeSettings({
		startScore: startScoreSelect.value,
		legs: legsInput.value,
		sets: setsInput.value,
		doubleOut: doubleOutInput.checked,
	});
}

const sameSettings = (a, b) => Object.keys(a).every(key => a[key] === b[key]);

function openSettings() {
	const { startScore, legs, sets, doubleOut } = game.settings;
	startScoreSelect.value = startScore;
	legsInput.value = legs;
	setsInput.value = sets;
	doubleOutInput.checked = doubleOut;
	renderSettings();
	showVisuals(false);
	openDialog(settingsDialog);
}

function closeSettings() {
	// Before the first throw, new settings apply straight away.
	const settings = readSettingsForm();
	if (!matchStarted() && !sameSettings(settings, game.settings)) commit(Game.newMatch(game, settings));
	closeDialog(settingsDialog);
}

function renderSettings() {
	noteRow.hidden = !matchStarted() || sameSettings(readSettingsForm(), game.settings);

	const rows = game.players.map((player, index) => {
		const row = document.createElement('tr');
		row.className = 'players-row';
		row.innerHTML = `
			<td><input type="text" autocomplete="off" spellcheck="false" aria-label="Player name"></td>
			<td class="move-up" role="button" aria-label="Move up">&#x25B2;</td>
			<td class="move-down" role="button" aria-label="Move down">&#x25BC;</td>
			<td class="delete-player" role="button" aria-label="Remove player">&#10006;</td>`;
		const input = $('input', row);
		input.value = player.name;
		input.addEventListener('input', () => {
			game = Game.renamePlayer(game, index, input.value);
			persist();
			renderScoreboard();
		});
		input.addEventListener('keydown', event => {
			if (event.key === 'Enter') input.blur();
		});
		const up = $('.move-up', row);
		const down = $('.move-down', row);
		up.classList.toggle('disabled', index === 0);
		down.classList.toggle('disabled', index === game.players.length - 1);
		up.addEventListener('click', () => commit(Game.movePlayer(game, index, -1)));
		down.addEventListener('click', () => commit(Game.movePlayer(game, index, 1)));
		$('.delete-player', row).addEventListener('click', () => commit(Game.removePlayer(game, index)));
		return row;
	});
	playersBody.replaceChildren(...rows, playersAddRow);
	playersAddRow.classList.toggle('hidden', !Game.canAddPlayer(game));
}

[startScoreSelect, legsInput, setsInput, doubleOutInput].forEach(el => {
	el.addEventListener('change', renderSettings);
	el.addEventListener('input', renderSettings);
});
legsInput.addEventListener('blur', () => { legsInput.value = readSettingsForm().legs; });
setsInput.addEventListener('blur', () => { setsInput.value = readSettingsForm().sets; });

playersAddRow.addEventListener('click', () => {
	const index = addPlayer();
	if (index === undefined) return;
	const input = $$('input', playersBody)[index];
	input.focus();
	input.select();
});

settingsDialog.addEventListener('click', event => {
	const action = event.target.closest('[data-action]')?.dataset.action;
	if (action === 'new-game') {
		clearTurn();
		commit(Game.newMatch(game, readSettingsForm()));
		closeDialog(settingsDialog);
		showToast({ kind: 'info', title: 'New game', detail: `${game.settings.startScore}` });
	} else if (action === 'close' || event.target === settingsDialog) {
		closeSettings();
	} else if (action === 'visuals' || action === 'visuals-back') {
		showVisuals(action === 'visuals');
	} else if (action === 'visuals-reset') {
		delete prefs.boardLayout;
		delete prefs.boardStyle;
		savePrefs(prefs);
		redrawBoard();
		renderVisuals();
	}
});

// ---- Settings: board and visuals ----------------------------------------------

// Per device. Changes show straight away on the board and in the preview.
const settingsMain = $('.settings-section:not(.visuals-section)', settingsDialog);
const visualsSection = $('.visuals-section', settingsDialog);
const boardPreview = $('.board-preview', visualsSection);
const layoutInputs = $$('[data-layout]', visualsSection);
const outlineInput = $('[data-style="outline"]', visualsSection);
const wiresInput = $('[data-style="wires"]', visualsSection);
const swatches = $('.swatches', visualsSection);

for (const input of layoutInputs) [input.min, input.max] = BOARD_LAYOUT_LIMITS[input.dataset.layout];
[outlineInput.min, outlineInput.max] = BOARD_OUTLINE_LIMITS;
swatches.append(...BOARD_OUTLINE_COLORS.map(color => {
	const swatch = document.createElement('button');
	swatch.type = 'button';
	swatch.className = 'swatch';
	swatch.style.background = color;
	swatch.dataset.color = color;
	swatch.setAttribute('aria-label', `Outline ${color}`);
	return swatch;
}));

const boardLayout = () => ({ ...BOARD_LAYOUT, ...prefs.boardLayout });
const boardStyle = () => ({ ...BOARD_STYLE, ...prefs.boardStyle });

function showVisuals(show) {
	settingsMain.hidden = show;
	visualsSection.hidden = !show;
	if (show) renderVisuals();
}

function renderVisuals() {
	const layout = boardLayout();
	const style = boardStyle();
	for (const input of layoutInputs) input.value = layout[input.dataset.layout];
	outlineInput.value = style.outline;
	wiresInput.checked = style.wires;
	for (const input of [...layoutInputs, outlineInput]) input.previousElementSibling.textContent = Number(input.value).toFixed(1);
	for (const swatch of swatches.children) swatch.setAttribute('aria-pressed', String(swatch.dataset.color === style.outlineColor));
	drawBoard(boardPreview, boardRings(layout), style);
}

function changeVisuals(outlineColor = boardStyle().outlineColor) {
	prefs.boardLayout = Object.fromEntries(layoutInputs.map(input => [input.dataset.layout, Number(input.value)]));
	prefs.boardStyle = { outline: Number(outlineInput.value), outlineColor, wires: wiresInput.checked };
	savePrefs(prefs);
	redrawBoard();
	renderVisuals();
}

for (const input of [...layoutInputs, outlineInput, wiresInput]) input.addEventListener('input', () => changeVisuals());
swatches.addEventListener('click', event => {
	const color = event.target.closest('.swatch')?.dataset.color;
	if (color) changeVisuals(color);
});

// ---- Winner -----------------------------------------------------------------

const winnerDialog = $('#winner');

function showWinner() {
	if (game.winner === null) return;
	$('.winner-name', winnerDialog).textContent = game.players[game.winner].name;
	hideToast();
	openDialog(winnerDialog);
}

winnerDialog.addEventListener('click', event => {
	const action = event.target.closest('[data-action]')?.dataset.action;
	if (action === 'rematch') {
		clearTurn();
		commit(Game.newMatch(game));
		showToast({ kind: 'info', title: 'Rematch', detail: 'Game on' });
	}
	if (action || event.target === winnerDialog) closeDialog(winnerDialog);
});

// ---- Toast --------------------------------------------------------------------

const toast = $('.toast');
let toastTimer = 0;

/** Show a short status message; a new one replaces the last. */
function showToast(message) {
	if (!message) return;
	toast.className = `toast ${message.kind}`;
	$('.toast-title', toast).textContent = message.title;
	$('.toast-detail', toast).textContent = message.detail;
	toast.hidden = false;
	// Restart the pop-in even if a toast is already showing.
	toast.style.animation = 'none';
	void toast.offsetWidth;
	toast.style.animation = '';
	clearTimeout(toastTimer);
	toastTimer = setTimeout(hideToast, TOAST_MS);
}

function hideToast() {
	clearTimeout(toastTimer);
	if (toast.hidden) return;
	toast.classList.add('leaving');
	Promise.allSettled(toast.getAnimations().map(a => a.finished)).then(() => {
		if (toast.classList.contains('leaving')) toast.hidden = true;
	});
}

// ---- Keyboard -----------------------------------------------------------------

document.addEventListener('keydown', event => {
	if (event.key === 'F11') {
		event.preventDefault();
		toggleFullscreen();
		return;
	}

	const dialogOpen = !settingsDialog.hidden || !winnerDialog.hidden;
	if (event.key === 'Escape' && dialogOpen) {
		if (!settingsDialog.hidden) closeSettings();
		closeDialog(winnerDialog);
		return;
	}
	if (dialogOpen || event.target.closest('input, select, textarea')) return;

	const mod = event.ctrlKey || event.metaKey;
	if (mod && event.key.toLowerCase() === 'z') {
		event.preventDefault();
		event.shiftKey ? redo() : undo();
	} else if (mod && event.key.toLowerCase() === 'y') {
		event.preventDefault();
		redo();
	} else if (mod || event.altKey) {
		return;
	} else if (/^[0-9]$/.test(event.key)) {
		setKeypadHidden(false); // show what is being typed
		typeDigit(event.key);
	} else if (event.key === 'Backspace') {
		backspace();
	} else if (event.key === 'Escape') {
		resetKeypad();
	} else if (event.key === 'ArrowUp') {
		stepKeypad(1);
	} else if (event.key === 'ArrowDown') {
		stepKeypad(-1);
	} else if (event.key === 'Enter') {
		if (turn.keypad !== '') submitKeypad();
		else if (turn.darts.length) doneBtn.click();
	}
});

// ---- Screen on, offline -------------------------------------------------------

// Keep the tablet awake while scoring. Silently skipped where unsupported.
let wakeLock = null;
async function keepAwake() {
	if (wakeLock || document.visibilityState !== 'visible' || !navigator.wakeLock) return;
	try {
		wakeLock = await navigator.wakeLock.request('screen');
		wakeLock.addEventListener('release', () => { wakeLock = null; });
	} catch { /* not allowed right now */ }
}
document.addEventListener('pointerdown', keepAwake);
document.addEventListener('visibilitychange', keepAwake);

// Only over HTTPS, so local development always loads fresh files.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
	navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---- Render -------------------------------------------------------------------

function render() {
	renderScoreboard();
	renderKeypad();
	renderDarts();
	renderControls();
	if (!settingsDialog.hidden) renderSettings();
}

render();
