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
	editing: null, // index of the dart being moved, if any
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
	turn.editing = null;
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
	if (index !== undefined) startRename(game.players[index].id);
});

function createPlayerRows(player) {
	const playerRow = document.createElement('tr');
	playerRow.className = 'player-row';
	playerRow.dataset.id = player.id;
	playerRow.innerHTML = `
		<td class="player-wins"><u></u><br><span class="player-sets"></span></td>
		<td class="target-wins"></td>
		<td colspan="4" class="player-name"><div class="name-text"><span></span></div><input type="text" autocomplete="off" spellcheck="false" aria-label="Player name" hidden></td>
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

	// Renaming happens in place, started from the player menu (Rename).
	const input = $('input', playerRow);
	input.addEventListener('blur', () => finishRename(player.id, input));
	input.addEventListener('keydown', event => {
		if (event.key === 'Enter') input.blur();
		if (event.key === 'Escape') {
			input.value = game.players.find(p => p.id === player.id)?.name ?? input.value;
			input.blur();
		}
	});

	// Tapping a player opens their menu beside the scores.
	for (const row of [playerRow, statsRow]) {
		row.addEventListener('click', event => {
			if (!event.target.closest('input')) togglePlayerMenu(player.id);
		});
	}

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
		const nameText = $('.name-text span', playerRow);
		if (nameText.textContent !== player.name) nameText.textContent = player.name;

		renderHistory($('.history', historyRow), player);
		renderCheckout(historyRow, player, isActive);
		renderStats(statsRow, player);
	});

	for (const rows of rowsById.values()) rows.forEach(row => row.remove());
	// New players join from the scoreboard before the first throw, from Settings after.
	addPlayerRow.classList.toggle('hidden', !Game.canAddPlayer(game) || matchStarted());
	layoutScores();
	fitNames();
	if (menuFor !== null) placePlayerMenu();

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
	// Inside the border, so the rows never overflow it.
	const available = scoresSection.clientHeight / (Math.min(innerWidth, innerHeight) / 100); // in vmin
	const add = addPlayerRow.classList.contains('hidden') ? 0 : addRow;
	const fit = block => (count ? available / (count * block + add) : 1);
	// A layout is used when it fits at (nearly) full size; the scale below makes it fit exactly.
	const big = count > 0 && fit(bigRows) >= SCORES_LAYOUT.tolerance;
	const roomy = big || (count > 0 && fit(rows + SCORES_LAYOUT.stats) >= SCORES_LAYOUT.tolerance);
	const scale = big ? Math.min(bigMaxScale, fit(bigRows)) : fit(rows + (roomy ? SCORES_LAYOUT.stats : 0));
	const clamped = Math.min(big ? bigMaxScale : maxScale, Math.max(minScale, scale));
	scoresTable.style.setProperty('--s', Math.floor(clamped * 1000) / 1000); // round down: never a pixel too tall
	scoresTable.classList.toggle('roomy', roomy);
	scoresTable.classList.toggle('big', big);
}

new ResizeObserver(() => {
	layoutScores();
	fitNames();
}).observe(scoresSection);

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

// ---- Player names -------------------------------------------------------------

// Long names are made to fit instead of being cut off: first the letters get
// narrower, then a name with several words goes onto two lines, then the text
// gets smaller. Only as a last resort does it end in "…".
const NAME_WIDTHS = [75, 62, 50]; // Roboto Flex widths (%) that still read well
const NAME_NARROWEST = 40;
const NAME_SIZES = [0.9, 0.8, 0.7, 0.6];

function fitName(box) {
	const text = box.firstElementChild;
	const key = `${text.textContent}|${box.clientWidth}|${box.clientHeight}`;
	if (box.dataset.fit === key) return;
	box.dataset.fit = key;

	box.classList.remove('narrow', 'two-lines', 'clipped');
	box.style.removeProperty('font-stretch');
	box.style.removeProperty('--name-size');
	const style = getComputedStyle(box);
	const width = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
	// scrollWidth catches a single word too long for its line when wrapping.
	const fits = () => Math.max(text.offsetWidth, text.scrollWidth) <= width + 1 && text.offsetHeight <= box.clientHeight + 1;
	const tryWidths = widths => widths.some(stretch => {
		box.style.fontStretch = `${stretch}%`;
		return fits();
	});
	if (fits()) return;

	box.classList.add('narrow');
	if (tryWidths(NAME_WIDTHS)) return;
	// Several words: two lines read better than very narrow letters.
	if (/\S\s+\S/.test(text.textContent)) {
		box.classList.add('two-lines');
		if (tryWidths(NAME_WIDTHS)) return;
	}
	if (tryWidths([NAME_NARROWEST])) return;
	for (const size of NAME_SIZES) {
		box.style.setProperty('--name-size', size);
		if (fits()) return;
	}
	box.classList.add('clipped');
}

const fitNames = () => $$('.name-text', scoresBody).forEach(fitName);
document.fonts?.addEventListener('loadingdone', () => {
	for (const box of $$('.name-text', scoresBody)) delete box.dataset.fit; // measured with a fallback font
	fitNames();
});

function startRename(id) {
	const row = $(`.player-row[data-id="${id}"]`, scoresBody);
	const player = game.players.find(p => p.id === id);
	if (!row || !player) return;
	const input = $('input', row);
	input.value = player.name;
	$('.name-text', row).hidden = true;
	input.hidden = false;
	input.focus();
	input.select();
}

function finishRename(id, input) {
	if (input.hidden) return;
	const index = game.players.findIndex(p => p.id === id);
	if (index >= 0) {
		game = Game.renamePlayer(game, index, input.value);
		persist();
	}
	input.hidden = true;
	input.closest('.player-row').querySelector('.name-text').hidden = false;
	render();
}

// ---- Player menu --------------------------------------------------------------

// Opens beside a player's rows, over the board: rename, hand them the throw,
// move them in the order, or remove them. Everything but renaming can be undone.
const playerMenu = $('.player-menu');
const portrait = matchMedia('(orientation: portrait)');
portrait.addEventListener('change', () => closePlayerMenu());
let menuFor = null; // id of the player whose menu is open

function togglePlayerMenu(id) {
	if (menuFor === id) {
		closePlayerMenu();
		return;
	}
	menuFor = id;
	playerMenu.hidden = false;
	replay(playerMenu, 'opening');
	placePlayerMenu();
}

function closePlayerMenu() {
	menuFor = null;
	playerMenu.hidden = true;
	for (const row of $$('.menu-open', scoresBody)) row.classList.remove('menu-open');
}

/** Line the menu up with its player's rows and refresh which items apply. */
function placePlayerMenu() {
	const index = game.players.findIndex(p => p.id === menuFor);
	const rows = $$(`[data-id="${menuFor}"]`, scoresBody);
	if (index < 0 || !rows.length) {
		closePlayerMenu();
		return;
	}
	$('.player-menu-name', playerMenu).textContent = game.players[index].name;
	$('[data-menu="throw"]', playerMenu).disabled = index === game.active || game.winner !== null;
	$('[data-menu="up"]', playerMenu).disabled = index === 0;
	$('[data-menu="down"]', playerMenu).disabled = index === game.players.length - 1;

	for (const row of $$('.menu-open', scoresBody)) row.classList.remove('menu-open');
	rows.forEach(row => row.classList.add('menu-open'));
	const row = rows[0].getBoundingClientRect();
	const room = innerHeight - playerMenu.offsetHeight - 8;
	if (portrait.matches) {
		// Scores run along the bottom: open just above them, clear of the buttons on the left.
		playerMenu.style.left = `${$('.ctrl-tbl').getBoundingClientRect().right + 8}px`;
		playerMenu.style.top = `${Math.max(8, sidebar.getBoundingClientRect().top - playerMenu.offsetHeight - 8)}px`;
	} else {
		playerMenu.style.left = `${sidebar.getBoundingClientRect().right + 8}px`;
		playerMenu.style.top = `${Math.max(8, Math.min(row.top, room))}px`;
	}
}

playerMenu.addEventListener('click', event => {
	const action = event.target.closest('[data-menu]')?.dataset.menu;
	const index = game.players.findIndex(p => p.id === menuFor);
	if (!action || index < 0) return;
	const { id, name } = game.players[index];
	closePlayerMenu();
	if (action === 'rename') {
		startRename(id);
	} else if (action === 'throw') {
		clearTurn();
		commit(Game.setActive(game, index));
		showToast({ kind: 'info', title: name, detail: 'to throw' });
	} else if (action === 'up' || action === 'down') {
		commit(Game.movePlayer(game, index, action === 'up' ? -1 : 1));
		togglePlayerMenu(id); // keep it open to move again
	} else if (action === 'remove') {
		commit(Game.removePlayer(game, index));
		showToast({ kind: 'info', title: 'Removed', detail: `${name} · Undo brings them back` });
	}
});

// Tapping anywhere else closes the menu.
document.addEventListener('pointerdown', event => {
	if (menuFor === null || playerMenu.contains(event.target)) return;
	if (event.target.closest(`[data-id="${menuFor}"]`)) return; // the player's own rows toggle it
	closePlayerMenu();
});
scoresSection.addEventListener('scroll', () => menuFor !== null && placePlayerMenu(), { passive: true });

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
	if (!dart) return;
	// Keep where it landed (as a fraction of the radius) to mark it on the board.
	const placed = { ...dart, x: dx / radius, y: dy / radius };
	review = null;
	if (turn.editing !== null) {
		// Moving a dart: it keeps its number.
		const index = turn.editing;
		turn.darts[index] = placed;
		turn.editing = null;
		renderDarts([index]);
		return;
	}
	if (turn.darts.length >= DARTS_PER_TURN) return;
	turn.darts.push(placed);
	renderDarts([turn.darts.length - 1]);
});

// Tap a dart to pick it up (then tap the board to move it); tap it again to remove it.
dartSpans.forEach((span, index) => {
	span.addEventListener('click', () => {
		if (!turn.darts[index]) return;
		if (turn.editing === index) {
			turn.darts.splice(index, 1);
			turn.editing = null;
		} else {
			turn.editing = index;
			showToast({ kind: 'info', title: `Dart ${index + 1}`, detail: 'Tap board to move · tap again to remove' });
		}
		renderDarts();
	});
});

dartsClearBtn.addEventListener('click', () => {
	turn.darts = [];
	turn.editing = null;
	renderDarts();
});

doneBtn.addEventListener('click', () => {
	if (turn.darts.length) submit(dartsTotal(), turn.darts);
});

bustBtn.addEventListener('click', () => {
	const name = game.players[game.active]?.name;
	if (submit(0) === 'turn') showToast({ kind: 'bust', title: 'Bust', detail: name });
});

/** pop: indexes of darts that just landed or moved, to animate. */
function renderDarts(pop = []) {
	dartSpans.forEach((span, index) => {
		const dart = turn.darts[index];
		span.className = dart ? dart.color : '';
		span.classList.toggle('editing', turn.editing === index);
		if (dart && pop.includes(index)) replay(span, 'pop');
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

	renderMarks(pop);

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

function renderMarks(pop = []) {
	const { hits, kind } = shownHits();
	drawMarks(board, hits, { kind, pop: kind === 'live' ? pop : [], editing: kind === 'live' ? turn.editing : null });
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

// The icon's corners point in while in full screen (also when left with Esc).
const fullscreenBtn = $('.ctrl-tbl .full-screen');
function renderFullscreen() {
	const active = Boolean(document.fullscreenElement ?? document.webkitFullscreenElement);
	fullscreenBtn.classList.toggle('active', active);
	fullscreenBtn.setAttribute('aria-label', active ? 'Exit full screen' : 'Full screen');
}
document.addEventListener('fullscreenchange', renderFullscreen);
document.addEventListener('webkitfullscreenchange', renderFullscreen);

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
const playersScroll = $('.players-scroll');
const playersList = $('.players-list');
const playersAddBtn = $('.players-add');
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

	const items = game.players.map((player, index) => {
		const item = document.createElement('li');
		item.className = 'player-item';
		item.innerHTML = `
			<div class="player-field">
				<span class="grip" role="button" aria-label="Drag to reorder">&#x2807;</span>
				<input type="text" autocomplete="off" spellcheck="false" aria-label="Player name">
				<button type="button" class="field-btn move-up" aria-label="Move up">&#x25B2;</button>
				<button type="button" class="field-btn move-down" aria-label="Move down">&#x25BC;</button>
				<button type="button" class="field-btn delete-player" aria-label="Remove player">&#10006;</button>
			</div>`;
		const input = $('input', item);
		input.value = player.name;
		input.addEventListener('input', () => {
			game = Game.renamePlayer(game, index, input.value);
			persist();
			renderScoreboard();
		});
		input.addEventListener('keydown', event => {
			if (event.key === 'Enter') input.blur();
		});
		const up = $('.move-up', item);
		const down = $('.move-down', item);
		up.disabled = index === 0;
		down.disabled = index === game.players.length - 1;
		up.addEventListener('click', () => commit(Game.movePlayer(game, index, -1)));
		down.addEventListener('click', () => commit(Game.movePlayer(game, index, 1)));
		$('.delete-player', item).addEventListener('click', () => commit(Game.removePlayer(game, index)));
		$('.grip', item).addEventListener('pointerdown', event => startDrag(event, item, index));
		return item;
	});
	playersList.replaceChildren(...items);
	playersAddBtn.hidden = !Game.canAddPlayer(game);
	updateListFades();
}

// Drag a player by the grip to reorder; saved as one undoable step on release.
function startDrag(event, item, from) {
	event.preventDefault();
	const grip = event.currentTarget;
	try {
		grip.setPointerCapture(event.pointerId); // keep getting moves when the pointer leaves the grip
	} catch { /* pointer already gone */ }
	item.classList.add('dragging');
	let startY = event.clientY;

	const move = moveEvent => {
		let offset = moveEvent.clientY - startY;
		// Swap places with a neighbour once dragged past half of it.
		const prev = item.previousElementSibling;
		const next = item.nextElementSibling;
		if (prev && offset < -prev.offsetHeight / 2) {
			playersList.insertBefore(item, prev);
			startY -= prev.offsetHeight;
		} else if (next && offset > next.offsetHeight / 2) {
			playersList.insertBefore(next, item);
			startY += next.offsetHeight;
		}
		offset = moveEvent.clientY - startY;
		item.style.transform = `translateY(${offset}px)`;

		// Scroll the list when dragging near its edges.
		const box = playersScroll.getBoundingClientRect();
		if (moveEvent.clientY < box.top + 20) playersScroll.scrollTop -= 8;
		else if (moveEvent.clientY > box.bottom - 20) playersScroll.scrollTop += 8;
	};

	const end = () => {
		grip.removeEventListener('pointermove', move);
		grip.removeEventListener('pointerup', end);
		grip.removeEventListener('pointercancel', end);
		item.classList.remove('dragging');
		item.style.transform = '';
		const to = [...playersList.children].indexOf(item);
		if (to !== from) commit(Game.movePlayerTo(game, from, to));
		else renderSettings();
	};

	grip.addEventListener('pointermove', move);
	grip.addEventListener('pointerup', end);
	grip.addEventListener('pointercancel', end);
}

/** Fade the list's top or bottom edge where more players are scrolled out of view. */
function updateListFades() {
	const { scrollTop, scrollHeight, clientHeight } = playersScroll;
	playersScroll.classList.toggle('fade-top', scrollTop > 1);
	playersScroll.classList.toggle('fade-bottom', scrollTop + clientHeight < scrollHeight - 1);
}

[startScoreSelect, legsInput, setsInput, doubleOutInput].forEach(el => {
	el.addEventListener('change', renderSettings);
	el.addEventListener('input', renderSettings);
});
legsInput.addEventListener('blur', () => { legsInput.value = readSettingsForm().legs; });
setsInput.addEventListener('blur', () => { setsInput.value = readSettingsForm().sets; });

playersScroll.addEventListener('scroll', updateListFades, { passive: true });
new ResizeObserver(updateListFades).observe(playersScroll);

playersAddBtn.addEventListener('click', () => {
	const index = addPlayer();
	if (index === undefined) return;
	const input = $$('input', playersList)[index];
	input.scrollIntoView({ block: 'nearest' });
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
const settingsMain = $('.settings-main', settingsDialog);
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

	if (event.key === 'Escape' && menuFor !== null) {
		closePlayerMenu();
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
		if (turn.editing === null) resetKeypad();
		else {
			turn.editing = null; // put the picked-up dart back
			renderDarts();
		}
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
