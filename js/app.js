// Wires the game logic to the page. All game rules live in game.js;
// this file only turns taps into actions and state into DOM.

import { DARTS_PER_TURN, MAX_LEGS, MAX_SETS, MAX_TURN_SCORE, START_SCORES, TOAST_MS } from './config.js';
import { hitTest, isOnBoard } from './board.js';
import { getCheckouts } from './checkout.js';
import { describeTravel, describeTurn } from './feedback.js';
import * as Game from './game.js';
import * as History from './history.js';
import { loadSession, saveSession } from './storage.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// ---- State ------------------------------------------------------------------

const saved = loadSession();
let game = saved?.game ?? Game.createGame();
let history = saved?.history ?? History.createHistory();

// The turn being entered. Not part of the game until it is submitted.
const turn = {
	keypad: '',   // digits typed on the keypad
	darts: [],    // darts tapped on the board
};
const checkoutChoice = new Map(); // player id -> which suggested route to show

/** Apply a change to the game, keeping the old state for undo. */
function commit(next) {
	if (next === game) return;
	history = History.record(history, game);
	game = next;
	checkoutChoice.clear();
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

// ---- Scoreboard -------------------------------------------------------------

const scoresBody = $('.scores-tbl tbody');
const addPlayerRow = $('.scores-tbl .add-player');

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

	const historyRow = document.createElement('tr');
	historyRow.className = 'history-row';
	historyRow.dataset.id = player.id;
	historyRow.innerHTML = `
		<td colspan="7" class="history scrollable"></td>
		<td colspan="2" class="checkout hidden"></td>`;

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

	return [playerRow, historyRow];
}

function renderScoreboard() {
	const rowsById = new Map();
	for (const row of $$('.player-row, .history-row', scoresBody)) {
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

	game.players.forEach((player, index) => {
		const rows = rowsById.get(player.id) ?? createPlayerRows(player);
		rowsById.delete(player.id);
		const [playerRow, historyRow] = rows;
		place(playerRow);
		place(historyRow);

		const isActive = index === game.active && game.winner === null;
		playerRow.classList.toggle('active', isActive);
		$('.player-wins u', playerRow).innerHTML = `${player.legs}&#8196;&#8196;`;
		$('.player-sets', playerRow).textContent = player.sets;
		$('.target-wins', playerRow).innerHTML = `&nbsp;/${game.settings.legs}<br>&nbsp;/${game.settings.sets}`;
		const scoreCell = $('.player-score', playerRow);
		if (scoreCell.textContent !== String(player.score)) {
			if (scoreCell.textContent !== '') replay(scoreCell, 'bump');
			scoreCell.textContent = player.score;
		}
		const input = $('input', playerRow);
		if (document.activeElement !== input) input.value = player.name;

		renderHistory($('.history', historyRow), player);
		renderCheckout(historyRow, player, isActive);
	});

	for (const rows of rowsById.values()) rows.forEach(row => row.remove());
	addPlayerRow.classList.toggle('hidden', !Game.canAddPlayer(game));
}

function renderHistory(cell, player) {
	const key = player.turns.length;
	if (cell.dataset.turns === String(key)) return;
	const added = cell.dataset.turns !== undefined && key > Number(cell.dataset.turns);
	cell.dataset.turns = key;
	cell.replaceChildren(...player.turns.slice().reverse().map(t => {
		const span = document.createElement('span');
		const bold = document.createElement('b');
		bold.textContent = t.score;
		span.append(bold);
		if (t.bust) span.title = `Bust (${t.attempted})`;
		return span;
	}));
	// The newest turn is first; slide it in.
	if (added) cell.firstElementChild?.classList.add('enter');
}

function renderCheckout(historyRow, player, isActive) {
	// The thrower's suggestion follows the darts already on the board.
	const dartsLeft = isActive ? DARTS_PER_TURN - turn.darts.length : DARTS_PER_TURN;
	const remaining = isActive ? player.score - dartsTotal() : player.score;
	const routes = game.winner === null ? getCheckouts(remaining, dartsLeft) : [];
	const historyCell = $('.history', historyRow);
	const checkoutCell = $('.checkout', historyRow);
	if (routes.length) {
		const route = routes[(checkoutChoice.get(player.id) ?? 0) % routes.length];
		historyCell.setAttribute('colspan', '5');
		checkoutCell.classList.remove('hidden');
		checkoutCell.innerHTML = `&#127919; ${route.join(' ')}`;
	} else {
		historyCell.setAttribute('colspan', '7');
		checkoutCell.classList.add('hidden');
		checkoutCell.textContent = '';
		checkoutChoice.delete(player.id);
	}
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
		radius: rect.width / 2,
	};
}

board.addEventListener('mousemove', event => {
	const { dx, dy, radius } = boardOffset(event);
	board.style.cursor = isOnBoard(dx, dy, radius) ? 'crosshair' : 'default';
});

board.addEventListener('click', event => {
	const { dx, dy, radius } = boardOffset(event);
	const dart = hitTest(dx, dy, radius);
	if (debug) {
		const pct = Math.round(Math.hypot(dx, dy) / radius * 100);
		debugSpan.textContent = `(${Math.round(dx)}, ${Math.round(dy)}) ${pct}% ${dart?.label ?? 'off'}`;
	}
	if (!dart || turn.darts.length >= DARTS_PER_TURN) return;
	turn.darts.push(dart);
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
		span.replaceChildren(label);
		// Doubles, trebles and bulls also show what they are worth.
		if (dart.multiplier > 1 || dart.sector === 25) span.append(document.createElement('br'), String(dart.value));
	});

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

const matchStarted = () => game.players.some(p => p.turns.length > 0);

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
	}
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
