// Wires the game logic to the page. All game rules live in the mode modules
// (game.js for X01, see modes.js); this file only turns taps into actions and
// state into DOM.

import {
	BOARD_HIT_COLORS, BOARD_LAYOUT, BOARD_LAYOUT_LIMITS, BOARD_OUTLINE_COLORS, BOARD_OUTLINE_LIMITS, BOARD_WIRE_LIMITS,
	CHECKOUT_COUNT_MS, DARTS_PER_TURN, DEFAULT_SETTINGS, DRAG_FROM, INFO_HOVER_MS, MARK_REACH, MAX_LEGS, MAX_NAME_LENGTH, MAX_PLAYERS, MAX_SETS, SCORES_LAYOUT, SCORES_LAYOUT_PHONE, TEST_DART_GAP_MS, TOAST_CLOSE_ROOM, TOAST_MS,
} from './config.js';
import { boardRings, hitTest, isOnBoard, locate, randomDart } from './board.js';
import { canCheckout, followCheckout } from './checkout.js';
import { dartLayout, tapDistance } from './dart3d.js';
import { boardRadius, boardStyle as savedBoardStyle, drawBoard, drawMarks, lightSegments, segmentKey } from './dartboard.js';
import { describeTravel, describeTurn, historyLegs, OUTCOME_WORDS, undoWarning } from './feedback.js';
import * as History from './history.js';
import { dartsSum } from './match.js';
import { GAME_CHOICES, MODES, choiceOf, createGame, modeOf, newGame, wonLegs } from './modes.js';
import { loadPrefs, loadSession, savePrefs, saveSession } from './storage.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const actionOf = event => event.target.closest('[data-action]')?.dataset.action;

// ---- State ------------------------------------------------------------------

const saved = loadSession();
const prefs = loadPrefs(); // this device's view choices (keypad, board look)
let game = saved?.game ?? createGame();
let history = saved?.history ?? History.createHistory();

/** The rules (and look) of the game being played. */
const mode = () => modeOf(game);

// The turn being entered. Not part of the game until it is submitted.
const turn = {
	keypad: '',   // digits typed on the keypad
	darts: [],    // darts tapped on the board
	editing: null, // index of the dart being moved, if any
	input: null,  // 'keypad' or 'board': the one used last, when both have something
};

// After a touch, nothing stays lit as if the pointer were over it, until a
// mouse moves again (a touch screen laptop has both; see HOVER in the CSS).
addEventListener('pointerdown', event => {
	document.documentElement.classList.toggle('touching', event.pointerType === 'touch');
}, true);
addEventListener('pointermove', event => {
	if (event.pointerType === 'mouse') document.documentElement.classList.remove('touching');
}, true);
const checkoutChoice = new Map(); // player id -> which suggested route to show
const phone = matchMedia('(orientation: portrait) and (max-aspect-ratio: 3/5)'); // see PHONE in the CSS
let review = null; // { id, index }: a past turn whose darts are shown on the board
let toastSticky = false; // the toast stays up (while a past turn is on show)

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

// An undo that takes back more than a turn (a leg won, a new game, a player
// added...) is asked about first.
function undo() {
	const result = History.undo(history, game);
	if (!result) return;
	const warning = undoWarning(game, result.state, mode().turnLabel);
	if (warning) confirmUndo(warning);
	else travel(result, 'undo');
}

function redo() {
	travel(History.redo(history, game), 'redo');
}

function travel(result, direction) {
	if (!result) return;
	// Renaming isn't an undoable step, so names always stay as last typed.
	const names = new Map(game.players.map(p => [p.id, p.name]));
	const next = { ...result.state, players: result.state.players.map(p => ({ ...p, name: names.get(p.id) ?? p.name })) };
	showToast(describeTravel(game, next, direction, mode().turnLabel));
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
	turn.input = null;
}

/** Returns the game event, or null if the turn wasn't recorded. */
function submit(score, darts = null) {
	const { state, event } = mode().submitTurn(game, score, darts);
	if (!event) {
		if (game.winner !== null) showWinner();
		return null;
	}
	const before = game;
	clearTurn();
	commit(state);
	if (event === 'match') showWinner();
	else showToast(describeTurn(before, event, score, state));
	return event;
}

/** Restart a CSS animation class on an element that stays on the page. */
function replay(el, className) {
	el.classList.remove(className);
	void el.offsetWidth; // let the browser see the class go before it comes back
	el.classList.add(className);
}

/** Run `done` once el's animations and transitions have finished. */
function afterAnimations(el, done) {
	Promise.allSettled(el.getAnimations().map(a => a.finished)).then(done);
}

/** Play a dialog's closing animation, then hide it. */
function closeDialog(dialog) {
	if (dialog.hidden || dialog.classList.contains('closing')) return;
	hideInfo();
	dialog.classList.remove('handoff');
	dialog.classList.add('closing');
	if (dialog.contains(document.activeElement)) focusBefore.get(dialog)?.focus({ preventScroll: true });
	const closing = dialog.getAnimations({ subtree: true })
		.filter(a => a.effect?.getComputedTiming().iterations !== Infinity); // e.g. the trophy's glow
	Promise.allSettled(closing.map(a => a.finished)).then(() => {
		if (!dialog.classList.contains('closing')) return; // reopened meanwhile
		dialog.classList.remove('closing');
		dialog.hidden = true;
	});
}

// Opening a dialog moves the keyboard focus into it (Tab then stays inside,
// see trapFocus); closing it gives the focus back.
const focusBefore = new WeakMap();

function openDialog(dialog, focus = dialog) {
	if (dialog.hidden && !dialog.contains(document.activeElement)) focusBefore.set(dialog, document.activeElement);
	dialog.classList.remove('closing');
	dialog.hidden = false;
	focus.focus({ preventScroll: true });
}

/**
 * Go straight from one dialog to another (Settings to New game, say): the
 * dimmed backdrop stays as it is and only the panel changes, instead of one
 * backdrop fading out under another fading in.
 */
function switchDialog(from, to, focus = to) {
	const before = focusBefore.get(from);
	from.classList.remove('closing', 'handoff');
	from.hidden = true;
	to.classList.add('handoff');
	openDialog(to, focus);
	focusBefore.set(to, before);
}

// ---- Info tips ------------------------------------------------------------------

// A small ⓘ beside something that may need explaining: tapped (or, with a
// mouse, hovered) it shows a bubble with the explanation. Tap it again, or
// anywhere else, or press Esc, to close it.
const infoTip = document.createElement('div');
infoTip.className = 'info-tip';
infoTip.setAttribute('role', 'tooltip');
infoTip.id = 'info-tip';
infoTip.hidden = true;
document.body.append(infoTip);
let infoFor = null; // the ⓘ whose bubble is showing

/** An ⓘ button explaining something: text is what the bubble says, about what it's about. */
function infoButton(text, about) {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'info-btn';
	button.setAttribute('aria-label', `About ${about}`);
	button.dataset.info = text;
	button.textContent = 'i';
	return button;
}

function showInfo(button) {
	infoFor?.removeAttribute('aria-describedby');
	infoFor = button;
	button.setAttribute('aria-describedby', infoTip.id);
	infoTip.textContent = button.dataset.info;
	infoTip.classList.remove('closing');
	infoTip.hidden = false;
	// Under the ⓘ, kept on screen; above it where there's no room below.
	const at = button.getBoundingClientRect();
	const tip = infoTip.getBoundingClientRect();
	const margin = 8;
	const left = Math.min(Math.max(margin, at.left + at.width / 2 - tip.width / 2), innerWidth - tip.width - margin);
	const below = at.bottom + margin;
	const top = below + tip.height <= innerHeight - margin ? below : Math.max(margin, at.top - margin - tip.height);
	infoTip.style.left = `${left}px`;
	infoTip.style.top = `${top}px`;
	replay(infoTip, 'opening');
}

function hideInfo() {
	clearTimeout(infoHover);
	if (!infoFor) return;
	infoFor.removeAttribute('aria-describedby');
	infoFor = null;
	// It fades out, unless another ⓘ opens it again first.
	infoTip.classList.remove('opening');
	infoTip.classList.add('closing');
	afterAnimations(infoTip, () => {
		if (infoTip.classList.contains('closing')) infoTip.hidden = true;
	});
}

// Taps toggle it (an ⓘ inside a label doesn't tick the box); a tap elsewhere closes it.
document.addEventListener('click', event => {
	const button = event.target.closest('.info-btn');
	if (!button) {
		hideInfo();
		return;
	}
	event.preventDefault();
	event.stopPropagation();
	clearTimeout(infoHover);
	if (infoFor === button) hideInfo();
	else showInfo(button);
}, true);
let infoHover = 0;
document.addEventListener('pointerover', event => {
	const button = event.target.closest('.info-btn');
	if (!button || event.pointerType !== 'mouse' || infoFor === button) return;
	clearTimeout(infoHover);
	infoHover = setTimeout(() => showInfo(button), INFO_HOVER_MS);
});
document.addEventListener('pointerout', event => {
	if (event.pointerType !== 'mouse' || !event.target.closest('.info-btn') || event.relatedTarget?.closest?.('.info-btn')) return;
	hideInfo();
});
document.addEventListener('keydown', event => {
	if (event.key === 'Escape' && infoFor) {
		hideInfo();
		event.stopPropagation(); // only the bubble closes, not the dialog it's in
	}
}, true);
addEventListener('resize', hideInfo);

const openDialogs = () => $$('[role="dialog"], [role="alertdialog"]').filter(d => !d.hidden && !d.classList.contains('closing'));

/** Tab from the last control goes back to the first, and the other way round. */
function trapFocus(event, dialog) {
	const focusable = $$('button, input, select', dialog).filter(el => !el.disabled && el.offsetParent !== null);
	if (!focusable.length) return;
	const at = focusable.indexOf(document.activeElement);
	if (event.shiftKey ? at <= 0 : at === focusable.length - 1) {
		event.preventDefault();
		(event.shiftKey ? focusable.at(-1) : focusable[0]).focus();
	}
}

const dartsTotal = () => dartsSum(turn.darts);
const matchStarted = () => game.players.some(p => p.turns.length > 0);

// ---- Scoreboard -------------------------------------------------------------

const scoresSection = $('.scores-section');
const scoresTable = $('.scores-tbl');
const scoresBody = $('tbody', scoresTable);

function addPlayer() {
	if (!mode().canAddPlayer(game)) return;
	commit(mode().addPlayer(game));
	return game.players.length - 1;
}

/** Scroll a list to its end, where a player was just added, so they're in view. */
const showLast = list => list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });

// The list's edge fades' heights in vmin, as in the CSS (.scores-section.fade-*).
const SCORE_FADES = { top: 4, bottom: 8 };

function createPlayerRows(player) {
	const playerRow = document.createElement('tr');
	playerRow.className = 'player-row';
	playerRow.dataset.id = player.id;
	playerRow.innerHTML = `
		<td class="player-wins"><u></u><br><span class="player-sets"></span></td>
		<td class="target-wins"></td>
		<td colspan="4" class="player-name"><i class="throw-first" title="Threw first this leg"></i><div class="name-text"><span></span></div></td>
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
			<div class="stats"><span></span><span></span><span></span></div>
			<div class="big-score"></div>
		</div></td>`;

	// Tapping a player opens their menu beside the scores, and with a mouse the
	// card lights up under the pointer to say so (see HOVER in the CSS). Not the
	// history line: its turns, leg dots and finish have taps of their own.
	const rows = [playerRow, statsRow, historyRow];
	for (const row of [playerRow, statsRow]) {
		row.addEventListener('mouseenter', () => rows.forEach(r => r.classList.add('card-hover')));
		row.addEventListener('mouseleave', () => rows.forEach(r => r.classList.remove('card-hover')));
		row.addEventListener('click', () => togglePlayerMenu(player.id));
	}

	$('.history-line > .checkout', historyRow).addEventListener('click', event => {
		const finish = event.currentTarget;
		if (finish.classList.contains('hint')) return;
		checkoutChoice.set(player.id, (checkoutChoice.get(player.id) ?? 0) + 1);
		renderScoreboard();
		// Which of how many, for a moment.
		finish.classList.add('counting');
		clearTimeout(finish.countTimer);
		finish.countTimer = setTimeout(() => finish.classList.remove('counting'), CHECKOUT_COUNT_MS);
	});

	const historyCell = $('.history', historyRow);
	historyCell.addEventListener('scroll', () => {
		historyCell.dataset.pinned = atEnd(historyCell);
		updateFades(historyCell);
	}, { passive: true });
	historyResize.observe(historyCell);
	// Tap a turn entered on the board to see where its darts landed, or a
	// finished leg's dot to open or fold it. Any other turn closes a turn on show.
	historyCell.addEventListener('click', event => {
		const dot = event.target.closest('.leg-dot');
		if (dot) {
			toggleLeg(player.id, Number(dot.dataset.leg));
			return;
		}
		const span = event.target.closest('span[data-index]');
		const current = game.players.find(p => p.id === player.id);
		if (!span || !current) return;
		const index = Number(span.dataset.index);
		if (current.turns[index]?.hits || review) toggleReview(current, index);
	});

	return rows;
}

function renderScoreboard() {
	// A new leg (or game) folds every finished leg away again.
	const leg = historyLeg();
	if (leg !== foldedAt) {
		openLegs.clear();
		foldedAt = leg;
	}

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
		rows.forEach(row => row.classList.toggle('active', isActive));
		// A dot by the name of whoever threw first this leg (with someone to throw after).
		playerRow.classList.toggle('starts', index === game.starter && game.players.length > 1);
		// Legs won over sets won, each beside what it takes. A one-set match
		// shows legs alone (its sets line would never say anything); Endless
		// (practice) just counts legs, with "legs" under the count.
		const { practice, legs, sets } = game.settings;
		const oneSet = !practice && sets === 1;
		$('.player-wins', playerRow).classList.toggle('endless', practice);
		$('.player-wins', playerRow).classList.toggle('one-set', oneSet);
		$('.player-wins u', playerRow).innerHTML = practice || oneSet ? String(player.legs) : `${player.legs}&#8196;&#8196;`;
		$('.player-sets', playerRow).textContent = practice ? 'legs' : oneSet ? '' : player.sets;
		$('.target-wins', playerRow).innerHTML = practice ? '' : oneSet ? `&nbsp;/${legs}` : `&nbsp;/${legs}<br>&nbsp;/${sets}`;
		const score = String(mode().scoreText(player, game));
		for (const scoreCell of [$('.player-score', playerRow), $('.big-score', statsRow)]) {
			if (scoreCell.textContent === score) continue;
			if (scoreCell.textContent !== '') replay(scoreCell, 'bump');
			scoreCell.textContent = score;
		}
		const note = mode().scoreNote?.(player, game);
		const scoreCell = $('.player-score', playerRow);
		if (note) scoreCell.dataset.note = note;
		else delete scoreCell.dataset.note;
		const nameText = $('.name-text span', playerRow);
		if (nameText.textContent !== player.name) nameText.textContent = player.name;

		renderHistory($('.history', historyRow), player);
		renderCheckout(historyRow, player, index, isActive);
		renderStats(statsRow, player);
	});

	for (const rows of rowsById.values()) rows.forEach(row => row.remove());
	renderInputting();
	layoutScores();
	fitNames();
	if (menuFor !== null) placePlayerMenu();

	// Keep the thrower's whole card (name to history) in view when the list
	// scrolls, clear of the edge fades, in one scroll: a second smooth scroll
	// would cut the first short.
	if (activeRows) {
		const [first, , last] = activeRows;
		const box = scoresSection.getBoundingClientRect();
		const vmin = Math.min(innerWidth, innerHeight) / 100;
		const top = first.getBoundingClientRect().top - box.top - SCORE_FADES.top * vmin;
		const bottom = last.getBoundingClientRect().bottom - box.top + SCORE_FADES.bottom * vmin;
		const by = top < 0 ? top : Math.min(top, Math.max(0, bottom - scoresSection.clientHeight));
		if (by) scoresSection.scrollBy({ top: by, behavior: 'smooth' });
	}
}

/**
 * Size the player rows to the space there is. The base sizes in the CSS fit
 * four players above the keypad. With room to spare a stats line appears
 * ("roomy"), then the score moves to its own big line ("big"). With more
 * players the rows shrink and the list scrolls.
 */
function layoutScores() {
	const { rows, stats, bigRows, minScale, maxScale, bigMaxScale, roomyFrom, bigFrom, fullLabelsFrom } = phone.matches ? SCORES_LAYOUT_PHONE : SCORES_LAYOUT;
	const count = game.players.length;
	// Inside the border, so the rows never overflow it.
	const available = scoresSection.clientHeight / (Math.min(innerWidth, innerHeight) / 100); // in vmin
	const fit = block => (count ? available / (count * block) : 1);
	// A layout is used when it fits at (nearly) full size; the scale below makes it fit exactly.
	const big = count > 0 && fit(bigRows) >= bigFrom;
	const roomy = big || (count > 0 && fit(rows + stats) >= roomyFrom);
	const scale = big ? Math.min(bigMaxScale, fit(bigRows)) : fit(rows + (roomy ? stats : 0));
	const clamped = Math.min(big ? bigMaxScale : maxScale, Math.max(minScale, scale));
	scoresTable.style.setProperty('--s', Math.floor(clamped * 1000) / 1000); // round down: never a pixel too tall
	scoresTable.classList.toggle('roomy', roomy);
	scoresTable.classList.toggle('big', big);
	// Stacked beside the big score, in full if the card's wide enough for that.
	const line = $('.stats-line', scoresTable);
	const lineWidth = line ? line.clientWidth / (Math.min(innerWidth, innerHeight) / 100 * clamped) : 0;
	scoresTable.classList.toggle('full-labels', big && lineWidth >= fullLabelsFrom);
	// Only rows too many to fit (at the smallest size) make the list scroll.
	scoresSection.classList.toggle('overflowing', scale < minScale);
	updateListFades(scoresSection);
}

// While the keypad folds away or comes back, the list is already laid out for
// where it's going (see setKeypadHidden), so nothing in it is redone on the
// way: re-laying the rows and names out on every frame made it stutter.
let keypadMoving = false;

new ResizeObserver(() => {
	if (keypadMoving) return;
	layoutScores();
	fitNames();
}).observe(scoresSection);
scoresSection.addEventListener('scroll', () => updateListFades(scoresSection), { passive: true });

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

// Finished legs fold into a dot: filled green if the player won the leg, a
// grey ring if not. Tapped, a leg opens out, its dot then marking where it
// ends and the next begins.
const openLegs = new Map(); // player id → the legs shown open
let foldedAt = null; // the leg being played when they were last all folded

/** The leg being played, or the last one once the match is won (left open to see). */
const historyLeg = () => game.leg - (game.winner === null ? 0 : 1);

async function toggleLeg(id, leg) {
	const cell = $(`.history-row[data-id="${id}"] .history`, scoresBody);
	if (cell.dataset.folding) return;
	const open = openLegs.get(id) ?? new Set();
	// Folding: the leg's turns draw into its dot first.
	if (open.has(leg)) {
		const player = game.players.find(p => p.id === id);
		const spans = [...cell.querySelectorAll('span[data-index]')]
			.filter(span => (player?.turns[span.dataset.index]?.leg ?? historyLeg()) === leg);
		cell.dataset.folding = true;
		spans.forEach(span => span.classList.add('folding'));
		await Promise.allSettled(spans.flatMap(span => span.getAnimations()).map(a => a.finished));
		delete cell.dataset.folding;
		if (!cell.isConnected) return;
	}
	const dotLeft = () => cell.querySelector(`.leg-dot[data-leg="${leg}"]`)?.getBoundingClientRect().left ?? 0;
	const before = dotLeft();
	if (open.has(leg)) open.delete(leg);
	else open.add(leg);
	openLegs.set(id, open);
	// Keep the tapped dot where it was, the leg opening out to its left.
	cell.dataset.pinned = false;
	renderScoreboard();
	cell.scrollLeft += dotLeft() - before;
	cell.dataset.pinned = atEnd(cell);
	updateFades(cell);
}

function turnSpan(t, index, marks) {
	const span = document.createElement('span');
	const bold = document.createElement('b');
	// A bust shows what it would have scored, struck through (it counts as 0).
	bold.textContent = t.bust ? t.attempted ?? 0 : mode().turnText(t);
	span.append(bold);
	span.classList.add(...marks);
	span.dataset.index = index;
	if (t.bust) span.title = t.attempted === undefined ? 'Bust' : `Bust (${t.attempted})`;
	if (t.hits) span.classList.add('has-hits');
	return span;
}

function legDot(leg, won, open, visits) {
	const dot = document.createElement('i');
	dot.className = `leg-dot ${won ? 'won' : 'lost'}`;
	dot.classList.toggle('open', open);
	dot.dataset.leg = leg;
	dot.setAttribute('role', 'button');
	dot.title = `Leg ${leg + 1}: ${won ? 'won' : 'lost'}, ${visits} visit${visits === 1 ? '' : 's'}`;
	dot.setAttribute('aria-expanded', String(open));
	return dot;
}

/** What a history item is, to tell which are new: a turn by its index, a leg dot by its leg. */
const historyKey = el => (el.dataset.leg !== undefined ? `leg ${el.dataset.leg}` : `turn ${el.dataset.index}`);

function renderHistory(cell, player) {
	const leg = historyLeg();
	const open = openLegs.get(player.id) ?? new Set();
	const key = `${player.turns.length} ${leg} ${[...open]}`;
	if (cell.dataset.key === key) return;
	const first = cell.dataset.turns === undefined;
	const added = !first && player.turns.length > Number(cell.dataset.turns);
	const removed = !first && player.turns.length < Number(cell.dataset.turns);
	const shown = new Map([...cell.children].filter(el => !el.classList.contains('leaving')).map(el => [historyKey(el), el]));
	cell.dataset.key = key;
	cell.dataset.turns = player.turns.length;
	// Oldest on the left, so the line reads in the order the turns were thrown.
	const marks = mode().historyMarks(player.turns);
	const items = [];
	for (const { leg: n, turns, done, won } of historyLegs(player.turns, leg, wonLegs(game, player))) {
		if (!done || open.has(n)) items.push(...turns.map(i => turnSpan(player.turns[i], i, marks[i])));
		if (done) items.push(legDot(n, won, open.has(n), turns.length));
	}
	// What wasn't there before eases in: a leg opened out, or one an undo
	// reopened. Undone turns ease out at the end of the line.
	if (!first) {
		let i = 0;
		for (const item of items) {
			if (shown.has(historyKey(item)) || (added && item === items.at(-1))) continue;
			item.classList.add('unfold');
			item.style.setProperty('--i', Math.min(i++, 10));
		}
	}
	const leaving = removed ? [...shown.values()].filter(el => Number(el.dataset.index) >= player.turns.length) : [];
	for (const el of leaving) el.style.maxWidth = `${el.offsetWidth}px`;
	cell.replaceChildren(...items, ...leaving);
	for (const el of leaving) {
		el.classList.remove('enter', 'unfold', 'reviewing');
		el.classList.add('leaving');
		el.addEventListener('animationend', () => el.remove(), { once: true });
	}
	if (added) {
		cell.lastElementChild?.classList.add('enter');
		cell.dataset.pinned = true;
	}
	stickToEnd(cell, added ? 'smooth' : 'instant');
}

// Beside the history: checkout routes where the mode has them (X01, 121), or
// the mode's hint (doubles practice: the double to throw at).
function renderCheckout(historyRow, player, index, isActive) {
	// The thrower's suggestion follows the darts already on the board.
	const from = mode().checkoutFrom(player, game);
	const plan = game.winner === null && from !== null
		? followCheckout(from, isActive ? turn.darts : [], game.settings.doubleOut, checkoutChoice.get(player.id) ?? 0)
		: null;
	const hint = game.winner === null && !plan ? mode().hint(game, index) : null;
	const checkoutCell = $('.history-line > .checkout', historyRow);
	checkoutCell.classList.toggle('hint', Boolean(hint));
	checkoutCell.classList.toggle('muted', Boolean(hint?.muted));
	checkoutCell.title = hint ? '' : 'Tap for another way to check out';
	if (plan) {
		checkoutCell.classList.remove('hidden');
		// The target, a counter (kept, so it slides out rather than appears), the route.
		if (!$('.checkout-steps', checkoutCell)) {
			const count = document.createElement('i');
			count.className = 'checkout-count';
			const steps = document.createElement('span');
			steps.className = 'checkout-steps';
			checkoutCell.replaceChildren('\u{1F3AF}', count, steps);
		}
		$('.checkout-count', checkoutCell).textContent = `${plan.index + 1}/${plan.total}`;
		const steps = $('.checkout-steps', checkoutCell);
		// Only rebuilt for a new route, so a dart thrown fades (.done) where it is.
		const key = plan.route.join(' ');
		if (checkoutCell.dataset.route !== key) {
			checkoutCell.dataset.route = key;
			steps.replaceChildren(...plan.route.flatMap((label, i) => {
				const step = document.createElement('span');
				step.textContent = label;
				return i ? [' ', step] : [step];
			}));
		}
		$$('span', steps).forEach((step, i) => step.classList.toggle('done', i < plan.done));
	} else if (hint) {
		checkoutCell.classList.remove('hidden');
		delete checkoutCell.dataset.route;
		checkoutCell.textContent = hint.text;
		checkoutChoice.delete(player.id);
	} else {
		checkoutCell.classList.add('hidden');
		delete checkoutCell.dataset.route;
		checkoutCell.textContent = '';
		checkoutChoice.delete(player.id);
	}
}

function renderStats(statsRow, player) {
	const line = mode().statsLine(player, game);
	$$('.stats > span', statsRow).forEach((span, i) => {
		const [label, value, short = label] = line[i];
		// Both forms are there: the CSS shows the one the layout has room for.
		if (span.firstChild?.textContent !== `${label} `) {
			const forms = [['stat-full', label], ['stat-short', short]].map(([name, text]) => {
				const form = document.createElement('span');
				form.className = name;
				form.textContent = `${text} `;
				return form;
			});
			span.replaceChildren(...forms, document.createElement('b'));
		}
		span.lastChild.textContent = value;
	});
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
	finishRename(true); // a rename in progress belongs to the player it started on
	menuFor = id;
	playerMenu.hidden = false;
	playerMenu.classList.remove('closing');
	replay(playerMenu, 'opening');
	placePlayerMenu();
}

function closePlayerMenu() {
	finishRename(true);
	menuFor = null;
	if (!playerMenu.hidden) {
		playerMenu.classList.add('closing');
		afterAnimations(playerMenu, () => {
			if (playerMenu.classList.contains('closing')) playerMenu.hidden = true;
		});
	}
	for (const row of $$('.menu-open', scoresBody)) row.classList.remove('menu-open');
	renderFocus();
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
	renderFocus();
	const row = rows[0].getBoundingClientRect();
	const room = innerHeight - playerMenu.offsetHeight - 8;
	if (portrait.matches) {
		// Scores run along the bottom: open just above them, clear of the buttons on the left.
		const left = $('.ctrl-top').getBoundingClientRect().right + 8;
		playerMenu.style.left = `${Math.max(8, Math.min(left, innerWidth - playerMenu.offsetWidth - 8))}px`;
		playerMenu.style.top = `${Math.max(8, sidebar.getBoundingClientRect().top - playerMenu.offsetHeight - 8)}px`;
	} else {
		playerMenu.style.left = `${sidebar.getBoundingClientRect().right + 8}px`;
		playerMenu.style.top = `${Math.max(8, Math.min(row.top, room))}px`;
	}
}

// Renaming happens in the menu: the pencil turns its name line into a text
// field (and itself into a tick that saves it).
const menuName = $('.player-menu-name', playerMenu);
const menuInput = $('.player-menu-input', playerMenu);
const renameBtn = $('[data-menu="rename"]', playerMenu);
menuInput.maxLength = MAX_NAME_LENGTH;

function startRename(id) {
	const player = game.players.find(p => p.id === id);
	if (!player) return;
	if (menuFor !== id) togglePlayerMenu(id);
	menuInput.value = player.name;
	menuName.hidden = true;
	menuInput.hidden = false;
	playerMenu.classList.add('renaming');
	$('span', renameBtn).textContent = '✓';
	$('span', renameBtn).classList.remove('flip');
	renameBtn.setAttribute('aria-label', 'Save name');
	menuInput.focus();
	menuInput.select();
}

/** Leave renaming, keeping the new name (save) or not. */
function finishRename(save) {
	if (menuInput.hidden) return;
	menuInput.hidden = true;
	menuName.hidden = false;
	playerMenu.classList.remove('renaming');
	$('span', renameBtn).textContent = '✎';
	$('span', renameBtn).classList.add('flip');
	renameBtn.setAttribute('aria-label', 'Rename');
	const index = game.players.findIndex(p => p.id === menuFor);
	if (save && index >= 0 && menuInput.value !== game.players[index].name) {
		game = mode().renamePlayer(game, index, menuInput.value);
		persist();
		render();
	}
}

menuInput.addEventListener('blur', () => finishRename(true));
menuInput.addEventListener('keydown', event => {
	if (event.key === 'Enter') finishRename(true);
	if (event.key === 'Escape') {
		event.stopPropagation(); // cancels the rename, leaves the menu open
		finishRename(false);
	}
});
// Keep the field focused when the tick is pressed, so the click saves it.
renameBtn.addEventListener('pointerdown', event => {
	if (!menuInput.hidden) event.preventDefault();
});

playerMenu.addEventListener('click', event => {
	// The whole name row renames, not just its pencil (but not the text field).
	const onName = event.target.closest('.player-menu-head') && !event.target.closest('input');
	const action = event.target.closest('[data-menu]')?.dataset.menu ?? (onName ? 'rename' : undefined);
	const index = game.players.findIndex(p => p.id === menuFor);
	if (!action || index < 0) return;
	if (action === 'rename') {
		if (menuInput.hidden) startRename(menuFor);
		else finishRename(true);
		return;
	}
	const { id, name } = game.players[index];
	closePlayerMenu();
	if (action === 'throw') {
		clearTurn();
		commit(mode().setActive(game, index));
		showToast({ kind: 'info', title: name, detail: 'to throw' });
	} else if (action === 'up' || action === 'down') {
		commit(mode().movePlayer(game, index, action === 'up' ? -1 : 1));
		togglePlayerMenu(id); // keep it open to move again
	} else if (action === 'remove') {
		commit(mode().removePlayer(game, index));
		showToast({ kind: 'info', title: 'Removed', detail: `${name} · Undo brings them back` });
	} else if (action === 'stats') {
		showStats();
	}
});

// Up and down move between the menu's items (not the keypad's score).
playerMenu.addEventListener('keydown', event => {
	if ((event.key !== 'ArrowDown' && event.key !== 'ArrowUp') || event.target === menuInput) return;
	event.preventDefault();
	event.stopPropagation();
	const items = $$('button:not(:disabled)', playerMenu);
	const at = items.indexOf(document.activeElement);
	const step = event.key === 'ArrowDown' ? 1 : -1;
	items[at < 0 ? (step > 0 ? 0 : items.length - 1) : (at + step + items.length) % items.length].focus();
});

// While the menu or a past turn is open, a tap anywhere else only closes it:
// the tap doesn't also press, type or throw on whatever is underneath. The
// exceptions: a finish always cycles; and with the menu open, a tap on another
// player's card moves the menu straight to them, and a tap on a history's board
// turn or leg dot opens it.
// The tap's click can come a while after the finger lifts (touch), so it is
// swallowed whenever it comes, unless a new tap starts first (a drag has none).
let swallowClick = false;

document.addEventListener('pointerdown', event => {
	swallowClick = false;
	if (menuFor !== null) {
		if (playerMenu.contains(event.target)) return;
		// A finish, a board turn or a leg's dot in any history: the menu closes and the tap counts.
		if (event.target.closest('.leg-dot, .history span.has-hits, .checkout:not(.hint)') && scoresBody.contains(event.target)) {
			closePlayerMenu();
			return;
		}
		const card = event.target.closest('[data-id]:not(.history-row)');
		if (card && scoresBody.contains(card) && Number(card.dataset.id) !== menuFor) return; // its click opens their menu
		closePlayerMenu();
	} else if (review !== null) {
		// Another of the same player's board turns: the tap just switches to it.
		if (event.target.closest(`.history-row[data-id="${review.id}"] .history span.has-hits`)) return;
		review = null;
		renderMarks();
		if (event.target.closest('.checkout:not(.hint)')) return;
	} else {
		return;
	}
	swallowClick = true;
	// Nothing reacts to the rest of this press either: no button sinks, no bed
	// lights up. Lifted once the press ends (after its click, if any).
	document.body.classList.add('dismissing');
}, true);

for (const type of ['pointerup', 'pointercancel']) {
	addEventListener(type, () => {
		if (document.body.classList.contains('dismissing')) setTimeout(() => document.body.classList.remove('dismissing'));
	}, true);
}

addEventListener('click', event => {
	if (!swallowClick) return;
	swallowClick = false;
	event.stopPropagation();
	event.preventDefault();
}, true);
scoresSection.addEventListener('scroll', () => menuFor !== null && placePlayerMenu(), { passive: true });

// ---- Keypad -----------------------------------------------------------------

const backBtn = $('.back-score');
const checkBtn = $('.check-score');
const resetBtn = $('.reset-score');
const scoreDisplay = $('.calc-score');

/** The most the keypad takes: the mode's, or with some options more (around the clock's skip). */
const inputMax = () => mode().inputMax?.(game) ?? mode().maxInput;

function typeDigit(digit) {
	const next = String(parseInt(turn.keypad + digit, 10));
	if (Number(next) <= inputMax()) turn.keypad = next;
	turn.input = 'keypad';
	renderKeypad();
}

function stepKeypad(step) {
	if (turn.keypad === '') return;
	const next = Number(turn.keypad) + step;
	if (next >= 0 && next <= inputMax()) turn.keypad = String(next);
	turn.input = 'keypad';
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
	if (mode().isValidInput(score, game)) submit(score);
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
// Done rocking: drop the class, or typing (which redraws the arrows) would rock it again.
scoreDisplay.addEventListener('animationend', event => {
	if (event.animationName.startsWith('tip-')) scoreDisplay.classList.remove('tip-up', 'tip-down');
});

// The input whose send button (✓ or Done) the mouse is over: shown as the one
// in use while it's there, as if it had been picked (see the Done listeners).
let previewInput = null;

/**
 * Dim the other players while a score is being entered, and show which way
 * it's going in: the keypad or the board (the one used last, if both have
 * something, or the one whose send button is under the mouse).
 */
function renderInputting() {
	const keypad = turn.keypad !== '';
	const board = turn.darts.length > 0;
	scoresTable.classList.toggle('inputting', keypad || board);
	scoresTable.classList.toggle('darts-down', board);
	const has = { keypad, board };
	const using = has[previewInput] ? previewInput
		: keypad && board ? turn.input : keypad ? 'keypad' : board ? 'board' : null;
	document.body.classList.toggle('keypad-input', using === 'keypad');
	document.body.classList.toggle('board-input', using === 'board');
}

function renderKeypad() {
	renderInputting();
	const score = turn.keypad;
	const up = score === String(inputMax()) ? 'b' : 'i'; // <b> = greyed arrow at the limit
	const down = score === '0' ? 'b' : 'i';
	// The arrows sit on a face that tips with the box; the number stays still.
	scoreDisplay.innerHTML = score === '' ? ''
		: `<span class="score-face"><${up}>&#x25B4;</${up}><${down}>&#x25BE;</${down}></span><span class="score-num">${score}</span>`;

	const empty = score === '';
	[backBtn, resetBtn, scoreDisplay].forEach(el => el.classList.toggle('disabled', empty));
	checkBtn.classList.toggle('disabled', empty || !mode().isValidInput(Number(score), game));
}

// ---- Dartboard and darts column ----------------------------------------------

const board = $('#dartboard');
const dartsCard = $('.darts');
const dartSpans = $$('.darts span');
const bustBtn = $('.bust-btn');
const doneBtn = $('.done-btn');
const dartsClearBtn = $('.darts-clear');
const doneTotal = $('.done-total', doneBtn);
const doneNote = $('.done-note > span', doneBtn);
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

/** A dart can go on the board: fewer than three are down, or one is picked up to move. */
const canAim = () => turn.darts.length < DARTS_PER_TURN || turn.editing !== null;

// With a mouse, the segment under the pointer lights up faintly (while a dart
// can still go there). A touch lights nothing.
let hovered = null;
board.addEventListener('pointermove', event => {
	if (event.pointerType !== 'mouse') return;
	const { dx, dy, radius } = boardOffset(event);
	const onMark = markAt(dx, dy, radius) >= 0;
	board.classList.toggle('aiming', canAim() && !onMark && isOnBoard(dx, dy, radius));
	board.classList.toggle('on-mark', onMark);
	const spot = locate(dx, dy, radius, rings);
	const key = spot && segmentKey(spot.sector, spot.ring);
	if (key === hovered) return;
	hovered = key;
	renderLights();
});
board.addEventListener('pointerleave', () => {
	hovered = null;
	renderLights();
});
board.addEventListener('pointerdown', event => {
	if (event.pointerType === 'mouse' || hovered === null) return;
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
	// Test darts in Board layout: after three, the next one starts again.
	if (realDarts && turn.darts.length >= DARTS_PER_TURN) {
		turn.darts = [];
		renderDarts();
	}
	// Using the board brings it (and its darts) back in front of the keypad.
	turn.input = 'board';
	renderInputting();
	// A dart (or its marker) works like its box in the darts column.
	const mark = markAt(dx, dy, radius);
	if (mark >= 0) {
		dartSpans[mark].click();
		return;
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

/**
 * The dart under a board offset (its point, body or marker), or -1. Darts can
 * be tapped once all three are down. While one is picked up, every tap on the
 * board places it, even a tap on itself (a nudge): -1.
 */
function markAt(dx, dy, radius) {
	if (turn.darts.length < DARTS_PER_TURN || turn.editing !== null) return -1;
	let closest = -1;
	let best = MARK_REACH;
	const layout = dartLayout(turn.darts);
	turn.darts.forEach((dart, index) => {
		const distance = tapDistance(dart, layout[index], [dx / radius, dy / radius]);
		if (distance <= best) [closest, best] = [index, distance];
	});
	return closest;
}

// Tap a dart to pick it up (then tap the board to move it); tap its box again to remove it.
dartSpans.forEach((span, index) => {
	span.addEventListener('click', () => {
		if (!turn.darts[index]) return;
		turn.input = 'board';
		if (turn.editing === index) {
			turn.darts.splice(index, 1);
			turn.editing = null;
		} else {
			turn.editing = index;
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

// With the mouse over ✓ or Done, that input shows as the one in use (its
// button green, the board's darts grey or lit) until the mouse leaves.
for (const [button, input] of [[checkBtn, 'keypad'], [doneBtn, 'board']]) {
	button.addEventListener('pointerenter', event => {
		if (event.pointerType !== 'mouse') return;
		previewInput = input;
		renderInputting();
	});
	button.addEventListener('pointerleave', () => {
		if (previewInput !== input) return;
		previewInput = null;
		renderInputting();
	});
}

// A quick way to a turn of 0 (three misses or a bust), with no darts kept.
bustBtn.addEventListener('click', () => {
	const name = game.players[game.active]?.name;
	if (submit(0) === 'turn') showToast({ kind: 'bust', title: 'No score', detail: name });
});

/** pop: indexes of darts that just landed or moved, to animate. */
function renderDarts(pop = []) {
	dartSpans.forEach((span, index) => {
		const dart = turn.darts[index];
		span.className = dart ? dart.color : 'empty';
		span.classList.toggle('editing', turn.editing === index);
		if (dart && pop.includes(index)) replay(span, 'pop');
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

	renderMarks(pop);

	const hasDarts = turn.darts.length > 0;
	dartsCard.classList.toggle('has-darts', hasDarts);
	dartsCard.dataset.left = DARTS_PER_TURN - turn.darts.length;
	dartsCard.classList.toggle('moving', turn.editing !== null);
	dartsClearBtn.disabled = !hasDarts;
	bustBtn.classList.toggle('away', hasDarts);
	// Done is a ✓ like the keypad's, with what the darts make beside it.
	doneTotal.textContent = hasDarts ? mode().dartsValue(game, turn.darts) : '';
	doneBtn.classList.toggle('disabled', !hasDarts);
	// And under that, what sending them would do. (The word stays as it slides away.)
	const event = hasDarts ? mode().submitTurn(game, dartsTotal(), turn.darts).event : null;
	const outcome = OUTCOME_WORDS[event];
	if (outcome) doneNote.textContent = outcome;
	doneBtn.classList.toggle('noting', Boolean(outcome));
	doneBtn.classList.toggle('winning', Boolean(outcome) && event !== 'bust');
	doneBtn.setAttribute('aria-label', outcome ? `Score the darts: ${outcome}` : 'Score the darts');

	// The active player's checkout follows the darts on the board.
	renderScoreboard();
}

// ---- Board markers ------------------------------------------------------------

// Numbered markers where the darts of this turn landed, and their segments lit
// up. Tapping a turn in a player's history shows that turn's darts instead
// (when it was entered on the board).
let rings = boardRings(prefs.boardLayout);
drawBoard(board, rings, prefs.boardStyle);
paintHitColor();

/** The highlight colour picked in Board layout, for everything drawn in it (--board-hit). */
function paintHitColor() {
	document.documentElement.style.setProperty('--board-hit', savedBoardStyle(prefs.boardStyle).hitColor);
}

/** Redraw the board, e.g. after its layout or outline changed in Settings. */
function redrawBoard() {
	rings = boardRings(prefs.boardLayout);
	drawBoard(board, rings, prefs.boardStyle);
	paintHitColor();
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
	for (const row of $$('.review-focus', scoresBody)) row.classList.remove('review-focus');
	if (kind === 'review' && hits.length) {
		$(`.history-row[data-id="${review.id}"] .history span[data-index="${review.index}"]`, scoresBody)?.classList.add('reviewing');
		for (const row of $$(`[data-id="${review.id}"]`, scoresBody)) row.classList.add('review-focus');
	} else if (toastSticky) {
		hideToast();
	}
	renderFocus();
}

/** Put the rest of the screen to sleep while the player menu or a past turn is open. */
function renderFocus() {
	const menu = menuFor !== null;
	const reviewing = !menu && $('.review-focus', scoresBody) !== null;
	document.body.classList.toggle('menu-focus', menu);
	document.body.classList.toggle('review-focus', reviewing);
	// The board stops hearing the pointer, so drop the light it left behind.
	if ((menu || reviewing) && hovered !== null) {
		hovered = null;
		board.classList.remove('aiming', 'on-mark');
		renderLights();
	}
}

// The number ring is a miss all round: a dart there lights it as the pointer
// does, not as a scoring bed.
const NUMBER_RING = segmentKey(0, 'numberRing');

function renderLights() {
	const { hits, kind } = shownHits();
	// The dart picked up to move: its bed flashes in the moving yellow (not the
	// number ring, which a miss lights all round).
	const lightKind = (key, index) => key === NUMBER_RING ? 'miss'
		: kind === 'live' && index === turn.editing ? 'editing'
		: kind === 'live' ? 'hit' : 'review';
	const lights = hits.flatMap(({ x, y }, index) => {
		const spot = locate(x, y, 1, rings);
		if (!spot) return [];
		const key = segmentKey(spot.sector, spot.ring);
		return [{ key, kind: lightKind(key, index) }];
	});
	// The pointer's light only where a dart can still go (not with three down).
	if (!canAim()) board.classList.remove('aiming');
	else if (hovered && !lights.some(light => light.key === hovered)) lights.push({ key: hovered, kind: 'hover' });
	lightSegments(board, lights);
}

/** "Visit 4" (in the leg being played), or "Leg 2, visit 4" for an earlier leg. */
function visitName(player, index) {
	const leg = player.turns[index].leg ?? historyLeg();
	const visit = player.turns.slice(0, index + 1).filter(t => (t.leg ?? historyLeg()) === leg).length;
	return leg === historyLeg() ? `Visit ${visit}` : `Leg ${leg + 1}, visit ${visit}`;
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
		const detail = `${visitName(player, index)}: ${turnThrown.darts.join(' ')} = ${turnThrown.bust ? `bust (${turnThrown.attempted})` : mode().turnLabel(turnThrown)}`;
		// Stays up for as long as the turn is on show.
		showToast({ kind: 'review', title: player.name, detail }, { sticky: true });
	}
	renderMarks();
}

// ---- Controls ---------------------------------------------------------------

const undoBtn = $('.ctrl-section .undo');
const redoBtn = $('.ctrl-section .redo');
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);
$('.btn-section .settings-btn').addEventListener('click', openSettings);

function renderControls() {
	undoBtn.classList.toggle('disabled', history.past.length === 0);
	redoBtn.classList.toggle('disabled', history.future.length === 0);
}

// The keypad can fold away; remembered on this device.
const sidebar = $('aside');
const keypadToggle = $('.ctrl-section .keypad-btn');

const calcSection = $('.calc-section');
let keypadSettled = 0;

/** The keypad's animation has ended (or never ran): settle the list where it ended up. */
function keypadStill() {
	clearTimeout(keypadSettled);
	if (!keypadMoving) return;
	keypadMoving = false;
	scoresTable.classList.remove('growing');
	layoutScores();
	fitNames();
}

calcSection.addEventListener('transitionend', event => {
	if (event.target === calcSection && (event.propertyName === 'height' || event.propertyName === 'width')) keypadStill();
});

function setKeypadHidden(hidden) {
	if (sidebar.classList.contains('keypad-hidden') !== hidden) {
		// Lay the list out for where it ends up (rows and names change once,
		// now), then put the panels back and let them slide there. Coming back,
		// the cards shrink with the room; folding away, they start at the size
		// that fits the room there is now and grow with it.
		const from = scoresSection.clientHeight;
		sidebar.classList.add('keypad-instant');
		sidebar.classList.toggle('keypad-hidden', hidden);
		layoutScores();
		fitNames();
		const to = scoresSection.clientHeight;
		const scale = scoresTable.style.getPropertyValue('--s');
		const grow = hidden && to > from && !scoresSection.classList.contains('overflowing');
		if (grow) scoresTable.style.setProperty('--s', Math.floor(scale * from / to * 1000) / 1000);
		sidebar.classList.toggle('keypad-hidden', !hidden);
		void sidebar.offsetHeight; // start from here
		sidebar.classList.remove('keypad-instant');
		if (grow) {
			scoresTable.classList.add('growing');
			scoresTable.style.setProperty('--s', scale);
		}
		keypadMoving = true;
		clearTimeout(keypadSettled);
		keypadSettled = setTimeout(keypadStill, 600); // in case no transition runs (hidden tab, say)
	}
	sidebar.classList.toggle('keypad-hidden', hidden);
	keypadToggle.setAttribute('aria-expanded', String(!hidden));
	keypadToggle.setAttribute('aria-label', hidden ? 'Show keypad' : 'Hide keypad');
	if (Boolean(prefs.keypadHidden) === hidden) return;
	prefs.keypadHidden = hidden;
	savePrefs(prefs);
}

keypadToggle.addEventListener('click', () => setKeypadHidden(!sidebar.classList.contains('keypad-hidden')));
// Hidden to begin with on a phone, where it takes the players' room.
setKeypadHidden(prefs.keypadHidden ?? phone.matches);

// The icon's corners point in while in full screen (also when left with Esc).
const fullscreenBtn = $('.ctrl-section .full-screen');
fullscreenBtn.addEventListener('click', toggleFullscreen);

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
const settingsSummary = $('.settings-summary', settingsDialog);
const playersScroll = $('.players-scroll', settingsDialog);
const playersList = $('.players-list', settingsDialog);
const playersAddBtn = $('.players-add', settingsDialog);

$('.settings-version', settingsDialog).textContent = `v${self.DARTSCORE_VERSION ?? ''}`;

function openSettings() {
	renderSettings();
	openDialog(settingsDialog);
}

/** The game being played: its name, then how it's played ("First to 3 legs", "Double out"). */
function gameSummary() {
	const { legs, sets, practice, doubleOut } = game.settings;
	const details = [];
	if (practice) details.push('Endless');
	else details.push(`First to ${legs} leg${legs === 1 ? '' : 's'}${sets > 1 ? `, ${sets} sets` : ''}`);
	if (doubleOut) details.push('Double out');
	for (const option of mode().OPTIONS) if (option.type !== 'choice' && game.settings[option.key]) details.push(option.label);
	return { name: mode().title(game.settings), details };
}

// Settings: what can change during a game (the players, the board's look).
// What to play is the New game screen's.
function renderSettings() {
	const { name, details } = gameSummary();
	const title = document.createElement('b');
	title.textContent = name;
	settingsSummary.replaceChildren(title, ...details.map(detail => ` · ${detail}`));

	const items = game.players.map((player, index) => {
		const item = playerItem(player.name, index, game.players.length, {
			grip: true,
			move: offset => slidePlayer(index, offset),
			remove: () => commit(mode().removePlayer(game, index)),
		});
		const input = $('input', item);
		input.addEventListener('input', () => {
			game = mode().renamePlayer(game, index, input.value);
			persist();
			renderScoreboard();
		});
		$('.grip', item).addEventListener('pointerdown', event => pressPlayer(event, item, index, $('.player-field', item)));
		return item;
	});
	playersList.replaceChildren(...items);
	playersAddBtn.hidden = !mode().canAddPlayer(game);
	updateListFades();
}

/** A player's line in a list: their name in a field, with buttons to move and remove them (and a grip to drag them by). */
function playerItem(name, index, count, { grip = false, move, remove }) {
	const item = document.createElement('li');
	item.className = 'player-item';
	item.innerHTML = `
		<div class="player-field">
			${grip ? '<span class="grip" role="button" aria-label="Drag to reorder"></span>' : ''}
			<input type="text" autocomplete="off" spellcheck="false" aria-label="Player name">
			<button type="button" class="field-btn move-up" aria-label="Move up">&#x25B2;</button>
			<button type="button" class="field-btn move-down" aria-label="Move down">&#x25BC;</button>
			<button type="button" class="field-btn delete-player" aria-label="Remove player">&#10006;</button>
		</div>`;
	const input = $('input', item);
	input.value = name;
	input.addEventListener('keydown', event => {
		if (event.key === 'Enter') input.blur();
	});
	const up = $('.move-up', item);
	const down = $('.move-down', item);
	up.disabled = index === 0;
	down.disabled = index === count - 1;
	up.addEventListener('click', () => move(-1));
	down.addEventListener('click', () => move(1));
	$('.delete-player', item).addEventListener('click', remove);
	return item;
}

/** Whether a move is still settling (the list is rebuilt when it ends). */
const sorting = () => playersList.classList.contains('sorting');

/** Move up or down with the buttons: the two players slide past each other. */
function slidePlayer(index, offset) {
	const items = [...playersList.children];
	const item = items[index];
	const other = items[index + offset];
	if (!other || sorting()) return;
	const step = other.offsetTop - item.offsetTop;
	playersList.classList.add('sorting');
	item.classList.add('moving');
	item.style.transform = `translateY(${step}px)`;
	other.style.transform = `translateY(${-step}px)`;
	afterAnimations(item, () => {
		playersList.classList.remove('sorting');
		commit(mode().movePlayer(game, index, offset));
	});
}

// A player is dragged by the grip (the three lines) on the left of their
// field; the rest of the field scrolls the list as usual.
function pressPlayer(event, item, from, field) {
	if (event.button !== 0 || sorting()) return;
	event.preventDefault();
	const { pointerId, clientY } = event;
	const move = moveEvent => {
		if (moveEvent.pointerId !== pointerId || Math.abs(moveEvent.clientY - clientY) < DRAG_FROM) return;
		stop();
		startDrag(moveEvent, field, item, from, clientY);
	};
	const stop = () => {
		removeEventListener('pointermove', move);
		removeEventListener('pointerup', stop);
		removeEventListener('pointercancel', stop);
	};
	addEventListener('pointermove', move);
	addEventListener('pointerup', stop);
	addEventListener('pointercancel', stop);
}

// Saved as one undoable step on release. The list keeps its order while
// dragging: the others slide aside to show where the player will land, and on
// release the player settles into that slot.
function startDrag(event, field, item, from, startY) {
	try {
		field.setPointerCapture(event.pointerId); // keep getting moves when the pointer leaves the field
	} catch { /* pointer already gone */ }
	// Dragging, not editing: drop the caret and any text the press selected.
	if (item.contains(document.activeElement)) document.activeElement.blur();
	getSelection()?.removeAllRanges();
	const items = [...playersList.children];
	const step = items.length > 1 ? items[1].offsetTop - items[0].offsetTop : item.offsetHeight;
	const startScroll = playersScroll.scrollTop;
	let pointerY = startY;
	let to = from;
	let frame = 0;
	playersList.classList.add('sorting');
	item.classList.add('dragging');

	const layout = () => {
		const offset = pointerY - startY + playersScroll.scrollTop - startScroll;
		const dy = Math.max(-from * step, Math.min((items.length - 1 - from) * step, offset));
		item.style.transform = `translateY(${dy}px)`;
		to = from + Math.round(dy / step);
		items.forEach((other, i) => {
			if (other === item) return;
			const shift = i > from && i <= to ? -step : i < from && i >= to ? step : 0;
			other.style.transform = shift ? `translateY(${shift}px)` : '';
		});
	};

	// Scroll the list while the pointer is held near its top or bottom edge.
	const autoScroll = () => {
		const box = playersScroll.getBoundingClientRect();
		const over = Math.min(step, Math.max(box.top + step - pointerY, 0)) - Math.min(step, Math.max(pointerY - box.bottom + step, 0));
		if (over) {
			playersScroll.scrollTop -= over * 0.25;
			layout();
		}
		frame = requestAnimationFrame(autoScroll);
	};
	frame = requestAnimationFrame(autoScroll);

	const move = moveEvent => {
		pointerY = moveEvent.clientY;
		layout();
	};

	const end = () => {
		cancelAnimationFrame(frame);
		field.removeEventListener('pointermove', move);
		field.removeEventListener('pointerup', end);
		field.removeEventListener('pointercancel', end);
		item.classList.replace('dragging', 'dropping');
		item.style.transform = `translateY(${(to - from) * step}px)`;
		afterAnimations(item, () => {
			playersList.classList.remove('sorting');
			if (to !== from) commit(mode().movePlayerTo(game, from, to));
			else renderSettings();
		});
	};

	pointerY = event.clientY;
	layout();
	field.addEventListener('pointermove', move);
	field.addEventListener('pointerup', end);
	field.addEventListener('pointercancel', end);
}

/** Fade a list's top or bottom edge where more players are scrolled out of view. */
function updateListFades(list = playersScroll) {
	const { scrollTop, scrollHeight, clientHeight } = list;
	list.classList.toggle('fade-top', scrollTop > 1);
	list.classList.toggle('fade-bottom', scrollTop + clientHeight < scrollHeight - 1);
}

playersScroll.addEventListener('scroll', () => updateListFades(), { passive: true });
new ResizeObserver(() => updateListFades()).observe(playersScroll);

playersAddBtn.addEventListener('click', () => {
	const index = addPlayer();
	if (index === undefined) return;
	const input = $$('input', playersList)[index];
	input.focus({ preventScroll: true });
	showLast(playersScroll);
	input.select();
});

settingsDialog.addEventListener('click', event => {
	const action = actionOf(event);
	if (action === 'new-game') {
		openNewGame(settingsDialog);
	} else if (action === 'close' || event.target === settingsDialog) {
		closeDialog(settingsDialog);
	} else if (action === 'visuals') {
		openVisuals();
	}
});

// ---- New game -------------------------------------------------------------------

// A new game in two steps: what to play (a game, and only the options that
// game has), then who plays (solo, or a list to add to and reorder). Nothing
// changes until Start, so Cancel always leaves the game in play as it was.
// It opens set to the last game and its players, so replaying is two taps.
const newGameDialog = $('#new-game');
const gameStep = $('[data-step="game"]', newGameDialog);
const playersStep = $('[data-step="players"]', newGameDialog);
const choicesBox = $('.game-choices', newGameDialog);
const legsStepper = $('[data-field="legs"]', newGameDialog);
const setsStepper = $('[data-field="sets"]', newGameDialog);
const doubleOutInput = $('#double-out');
const formatButtons = $$('.match-format button', newGameDialog);
const countsReveal = $('.counts-reveal', newGameDialog);
const checksBox = $('.game-checks', newGameDialog);
const soloName = $('.solo-name', newGameDialog);
const draftList = $('.draft-list', newGameDialog);
const draftAdd = $('.draft-add', newGameDialog);
const ngBackBtn = $('[data-action="back"]', newGameDialog);
const ngNextBtn = $('[data-action="next"]', newGameDialog);

// The form so far. Option values are kept by key while other games are picked.
const ngForm = { step: 'game', picked: GAME_CHOICES[0].value, legs: 3, sets: 1, endless: false, options: new Map(), solo: true, names: [] };

// A tile per game, under its group's heading (X01, Practice).
for (const group of new Set(GAME_CHOICES.map(choice => choice.group))) {
	const heading = document.createElement('h3');
	heading.className = 'game-group';
	heading.textContent = group;
	const tiles = document.createElement('div');
	tiles.className = 'game-tiles';
	tiles.setAttribute('role', 'radiogroup');
	tiles.setAttribute('aria-label', group);
	tiles.append(...GAME_CHOICES.filter(choice => choice.group === group).map(choice => {
		const tile = document.createElement('button');
		tile.type = 'button';
		tile.className = 'game-tile';
		tile.dataset.value = choice.value;
		tile.setAttribute('role', 'radio');
		const label = document.createElement('b');
		label.textContent = choice.label;
		tile.append(label);
		if (choice.note) {
			const note = document.createElement('small');
			note.textContent = choice.note;
			tile.append(note);
		}
		return tile;
	}));
	choicesBox.append(heading, tiles);
}

/** What the form would start: { mode, settings }, the settings as that mode keeps them. */
function readGameForm() {
	const choice = GAME_CHOICES.find(c => c.value === ngForm.picked) ?? GAME_CHOICES[0];
	return {
		mode: choice.mode,
		settings: MODES[choice.mode].normalizeSettings({
			legs: ngForm.legs,
			sets: ngForm.sets,
			doubleOut: doubleOutInput.checked,
			practice: ngForm.endless,
			...Object.fromEntries(ngForm.options),
			...choice.settings,
		}),
	};
}

/** Opens the New game screen; from: the dialog it replaces, if any. */
function openNewGame(from = null) {
	const { legs, sets, doubleOut, practice } = game.settings;
	Object.assign(ngForm, { step: 'game', picked: choiceOf(game).value, legs, sets });
	doubleOutInput.checked = doubleOut ?? DEFAULT_SETTINGS.doubleOut; // for a game switched to that has it
	ngForm.endless = practice;
	ngForm.options.clear();
	for (const { key } of mode().OPTIONS) ngForm.options.set(key, game.settings[key]);
	ngForm.names = game.players.map(player => player.name);
	ngForm.solo = ngForm.names.length <= 1;
	soloName.value = ngForm.names[0] ?? '';
	// Opening, the legs and sets are simply there (or not): no sliding out.
	countsReveal.classList.add('instant');
	renderNewGame();
	void countsReveal.offsetHeight;
	countsReveal.classList.remove('instant');
	if (from) switchDialog(from, newGameDialog, ngNextBtn);
	else openDialog(newGameDialog, ngNextBtn);
}

function renderNewGame() {
	const onGame = ngForm.step === 'game';
	gameStep.hidden = !onGame;
	playersStep.hidden = onGame;
	ngBackBtn.textContent = onGame ? 'Cancel' : '‹ Back';
	ngNextBtn.textContent = onGame ? 'Players ›' : 'Start';
	if (onGame) renderGameStep();
	else renderPlayersStep();
}

// Only what the picked game has: the match, First to (with the legs and sets
// sliding out beside it) or Endless; then its Options, Double out or the
// game's own choice and checkboxes.
function renderGameStep() {
	const { mode: id, settings } = readGameForm();
	for (const tile of $$('.game-tile', choicesBox)) tile.setAttribute('aria-checked', String(tile.dataset.value === ngForm.picked));
	for (const button of formatButtons) button.setAttribute('aria-checked', String((button.dataset.format === 'endless') === settings.practice));
	countsReveal.classList.toggle('open', !settings.practice);
	countsReveal.inert = settings.practice;
	for (const [stepper, value, max] of [[legsStepper, settings.legs, MAX_LEGS], [setsStepper, settings.sets, MAX_SETS]]) {
		$('output', stepper).textContent = value;
		$('[data-by="-1"]', stepper).disabled = value <= 1;
		$('[data-by="1"]', stepper).disabled = value >= max;
	}
	doubleOutInput.closest('.check-line').hidden = !('doubleOut' in settings);
	renderOptions(MODES[id], settings);
}

/**
 * The game's own options, on the Options line. A choice is a row of buttons
 * (no name of its own: its buttons say it), with the game's checkboxes after it, greyed where they
 * don't apply (e.g. Skip ahead with doubles only, so the line doesn't shift).
 * A game without a choice shows its checkboxes only where they apply.
 */
function renderOptions(rules, settings) {
	const choices = rules.OPTIONS.filter(option => option.type === 'choice');
	const checks = rules.OPTIONS.filter(option => option.type !== 'choice' && (choices.length || (option.applies?.(settings) ?? true)));
	const checkBox = option => {
		const box = document.createElement('label');
		box.className = 'settings-check';
		const input = document.createElement('input');
		input.type = 'checkbox';
		input.checked = Boolean(settings[option.key]);
		input.disabled = !(option.applies?.(settings) ?? true);
		input.addEventListener('change', () => {
			ngForm.options.set(option.key, input.checked);
			renderGameStep();
		});
		box.append(input, ` ${option.label}`);
		// The ⓘ goes beside the label, not in it: pressed inside a label, it
		// would flash the checkbox as if pressed too.
		const line = document.createElement('span');
		line.className = 'check-line mode-check';
		line.append(box);
		if (option.title) line.append(infoButton(option.title, option.label));
		return line;
	};
	for (const box of $$('.mode-check', checksBox)) box.remove();
	checksBox.append(...choices.map(option => {
		const buttons = document.createElement('div');
		buttons.className = 'segmented mode-check';
		buttons.setAttribute('role', 'radiogroup');
		buttons.setAttribute('aria-label', option.label);
		buttons.append(...option.choices.map(([value, text]) => {
			const button = document.createElement('button');
			button.type = 'button';
			button.setAttribute('role', 'radio');
			button.setAttribute('aria-checked', String(settings[option.key] === value));
			button.textContent = text;
			button.addEventListener('click', () => {
				ngForm.options.set(option.key, value);
				renderGameStep();
			});
			return button;
		}));
		return buttons;
	}), ...checks.map(checkBox));
}

function renderPlayersStep() {
	for (const button of $$('.who button', playersStep)) {
		button.setAttribute('aria-checked', String((button.dataset.who === 'solo') === ngForm.solo));
	}
	$('.who-solo', playersStep).hidden = !ngForm.solo;
	$('.who-group', playersStep).hidden = ngForm.solo;
	ngNextBtn.disabled = !ngForm.solo && !ngForm.names.length;
	if (ngForm.solo) return;

	const items = ngForm.names.map((name, index) => {
		const item = playerItem(name, index, ngForm.names.length, {
			move(offset) {
				const names = ngForm.names;
				[names[index], names[index + offset]] = [names[index + offset], names[index]];
				renderPlayersStep();
			},
			remove() {
				ngForm.names.splice(index, 1);
				renderPlayersStep();
			},
		});
		const input = $('input', item);
		input.placeholder = `Player ${index + 1}`;
		input.addEventListener('input', () => { ngForm.names[index] = input.value; });
		return item;
	});
	draftList.replaceChildren(...items);
	draftAdd.hidden = ngForm.names.length >= MAX_PLAYERS;
	updateListFades(draftList);
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const ngSection = $('.new-game-section', newGameDialog);
const stepTiming = { duration: 260, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' };

/** Change what the New game panel shows with render(), the panel easing from its old height to its new one. */
function easePanel(render) {
	const from = ngSection.offsetHeight;
	render();
	const to = ngSection.offsetHeight;
	if (reducedMotion.matches || from === to) return;
	// No scrollbar while the panel eases.
	ngSection.classList.add('sliding');
	ngSection.animate([{ height: `${from}px` }, { height: `${to}px` }], stepTiming)
		.finished.catch(() => {}).finally(() => ngSection.classList.remove('sliding'));
}

/** Move between the two steps: the new one slides in from the side it's on (players to the right), and the panel eases to its height. */
function goToStep(step) {
	easePanel(() => {
		ngForm.step = step;
		renderNewGame();
	});
	if (reducedMotion.matches) return;
	const side = step === 'players' ? 1 : -1;
	(step === 'players' ? playersStep : gameStep).animate(
		[{ opacity: 0, transform: `translateX(${side * 6}vmin)` }, { opacity: 1, transform: 'none' }], stepTiming);
}

function startNewGame() {
	const { mode: id, settings } = readGameForm();
	const names = ngForm.solo ? [soloName.value] : ngForm.names;
	clearTurn();
	commit(newGame(id, settings, names, game));
	closeDialog(newGameDialog);
	showToast({ kind: 'info', title: 'New game', detail: mode().title(game.settings) });
}

choicesBox.addEventListener('click', event => {
	const tile = event.target.closest('.game-tile');
	if (!tile) return;
	// Crossing between X01 and the practice games starts from the usual legs
	// and sets; moving within either group keeps what was set.
	const groupOf = value => GAME_CHOICES.find(c => c.value === value)?.group;
	if (groupOf(tile.dataset.value) !== groupOf(ngForm.picked)) {
		ngForm.legs = DEFAULT_SETTINGS.legs;
		ngForm.sets = DEFAULT_SETTINGS.sets;
	}
	const before = readGameForm().mode;
	ngForm.picked = tile.dataset.value;
	renderGameStep();
	// Another game's options fade in where the last one's were (not between
	// 301, 501 and 701, which have the same).
	if (readGameForm().mode !== before && !reducedMotion.matches) {
		checksBox.animate([{ opacity: 0, transform: 'translateY(0.8vmin)' }, { opacity: 1, transform: 'none' }], stepTiming);
	}
});

for (const [stepper, key] of [[legsStepper, 'legs'], [setsStepper, 'sets']]) {
	stepper.addEventListener('click', event => {
		const by = Number(event.target.closest('[data-by]')?.dataset.by);
		if (!by) return;
		ngForm[key] = readGameForm().settings[key] + by;
		renderGameStep();
	});
}
doubleOutInput.addEventListener('change', renderGameStep);
for (const button of formatButtons) {
	button.addEventListener('click', () => {
		ngForm.endless = button.dataset.format === 'endless';
		renderGameStep();
	});
}

playersStep.addEventListener('click', event => {
	const who = event.target.closest('[data-who]')?.dataset.who;
	if (!who || (who === 'solo') === ngForm.solo) return;
	// The names carry across: the solo name heads the list (with room for a
	// second player), and the list's first is the solo name.
	if (who === 'solo') {
		soloName.value = ngForm.names[0] ?? soloName.value;
	} else {
		ngForm.names[0] = soloName.value || (ngForm.names[0] ?? '');
		while (ngForm.names.length < 2) ngForm.names.push('');
	}
	easePanel(() => {
		ngForm.solo = who === 'solo';
		renderPlayersStep();
	});
	if (ngForm.solo) soloName.focus();
});

draftAdd.addEventListener('click', () => {
	easePanel(() => {
		ngForm.names.push('');
		renderPlayersStep();
	});
	$$('input', draftList).at(-1)?.focus({ preventScroll: true });
	showLast(draftList);
});

draftList.addEventListener('scroll', () => updateListFades(draftList), { passive: true });

soloName.addEventListener('keydown', event => {
	if (event.key === 'Enter') startNewGame();
});

newGameDialog.addEventListener('click', event => {
	const action = actionOf(event);
	if (action === 'next') {
		if (ngForm.step === 'players') {
			startNewGame();
			return;
		}
		goToStep('players');
		(ngForm.solo ? soloName : ngNextBtn).focus();
	} else if (action === 'back' && ngForm.step === 'players') {
		goToStep('game');
	} else if (action === 'back' || event.target === newGameDialog) {
		closeDialog(newGameDialog);
	}
});

// ---- Settings: board layout -------------------------------------------------------

// Per device. Settings steps aside and the controls take the place of the
// scores and keypad, so the board itself shows each change as it is made.
// Done goes back to Settings as it was left.
const visualsPanel = $('.visuals-panel');
const layoutInputs = $$('[data-layout]', visualsPanel);
const outlineInput = $('[data-style="outline"]', visualsPanel);
const wireInput = $('[data-style="wire"]', visualsPanel);
const seeThroughInput = $('[data-style="see-through"]', visualsPanel);
// A row of colours for each colour setting: { key in BOARD_STYLE: its row }.
const swatchRows = {
	outlineColor: $('.outline-swatches', visualsPanel),
	hitColor: $('.hit-swatches', visualsPanel),
};

for (const input of layoutInputs) [input.min, input.max] = BOARD_LAYOUT_LIMITS[input.dataset.layout];
[outlineInput.min, outlineInput.max] = BOARD_OUTLINE_LIMITS;
[wireInput.min, wireInput.max] = BOARD_WIRE_LIMITS;
for (const [key, colors] of [['outlineColor', BOARD_OUTLINE_COLORS], ['hitColor', BOARD_HIT_COLORS]]) {
	swatchRows[key].append(...colors.map(color => {
		const swatch = document.createElement('button');
		swatch.type = 'button';
		swatch.className = 'swatch';
		swatch.style.background = color;
		swatch.dataset.color = color;
		swatch.setAttribute('aria-label', `${swatchRows[key].getAttribute('aria-label')} ${color}`);
		return swatch;
	}));
	swatchRows[key].addEventListener('click', event => {
		const color = event.target.closest('.swatch')?.dataset.color;
		if (color) changeVisuals({ [key]: color });
	});
}

const boardLayout = () => ({ ...BOARD_LAYOUT, ...prefs.boardLayout });
const boardStyle = () => savedBoardStyle(prefs.boardStyle);

// The board stays live as a test: darts can be thrown at it to see the
// layout. The turn's own darts are put aside and come back with Done.
let realDarts = null;

function openVisuals() {
	closeDialog(settingsDialog);
	renderVisuals();
	visualsPanel.hidden = false;
	document.body.classList.add('visuals-open');
	realDarts = { darts: turn.darts, editing: turn.editing, input: turn.input };
	Object.assign(turn, { darts: [], editing: null });
	renderDarts();
	visualsPanel.focus({ preventScroll: true });
	throwTestDarts();
}

/** Three darts at random, one after another, to see the board's look with darts in it. */
function throwTestDarts() {
	const opened = realDarts;
	for (let i = 1; i <= DARTS_PER_TURN; i++) {
		setTimeout(() => {
			if (realDarts !== opened || turn.darts.length >= DARTS_PER_TURN) return;
			turn.darts.push(randomDart(rings));
			renderDarts([turn.darts.length - 1]);
		}, i * TEST_DART_GAP_MS);
	}
}

function closeVisuals() {
	visualsPanel.hidden = true;
	document.body.classList.remove('visuals-open');
	Object.assign(turn, realDarts);
	realDarts = null;
	renderDarts();
	renderSettings();
	openDialog(settingsDialog);
}

visualsPanel.addEventListener('click', event => {
	const action = actionOf(event);
	if (action === 'visuals-done') {
		closeVisuals();
	} else if (action === 'visuals-reset') {
		delete prefs.boardLayout;
		delete prefs.boardStyle;
		savePrefs(prefs);
		redrawBoard();
		renderVisuals();
	}
});

function renderVisuals() {
	const layout = boardLayout();
	const style = boardStyle();
	for (const input of layoutInputs) input.value = layout[input.dataset.layout];
	outlineInput.value = style.outline;
	wireInput.value = style.wire;
	seeThroughInput.checked = style.seeThrough;
	for (const input of [...layoutInputs, outlineInput, wireInput]) input.previousElementSibling.textContent = Number(input.value).toFixed(1);
	for (const [key, row] of Object.entries(swatchRows)) {
		for (const swatch of row.children) swatch.setAttribute('aria-pressed', String(swatch.dataset.color === style[key]));
	}
}

/** colors: a colour picked, e.g. { hitColor }; the rest is read from the controls. */
function changeVisuals(colors = {}) {
	const { outlineColor, hitColor } = boardStyle();
	prefs.boardLayout = Object.fromEntries(layoutInputs.map(input => [input.dataset.layout, Number(input.value)]));
	prefs.boardStyle = { outline: Number(outlineInput.value), wire: Number(wireInput.value), outlineColor, hitColor, seeThrough: seeThroughInput.checked, ...colors };
	savePrefs(prefs);
	redrawBoard();
	renderVisuals();
}

for (const input of [...layoutInputs, outlineInput, wireInput, seeThroughInput]) input.addEventListener('input', () => changeVisuals());

// ---- Winner -----------------------------------------------------------------

const winnerDialog = $('#winner');

function showWinner() {
	if (game.winner === null) return;
	$('.winner-name', winnerDialog).textContent = game.players[game.winner].name;
	fillStatsTable($('.stats-tbl', winnerDialog));
	hideToast();
	openDialog(winnerDialog);
}

winnerDialog.addEventListener('click', event => {
	const action = actionOf(event);
	if (action === 'rematch') {
		clearTurn();
		commit(mode().newMatch(game));
		showToast({ kind: 'info', title: 'Rematch', detail: 'Game on' });
	}
	if (action === 'new-game') openNewGame(winnerDialog);
	else if (action || event.target === winnerDialog) closeDialog(winnerDialog);
});

// ---- Match stats ----------------------------------------------------------------

// One line per stat, one column per player; each mode has its own lines
// (STAT_ROWS in its module).

const statsDialog = $('#stats');

function cell(tag, text, scope) {
	const el = document.createElement(tag);
	el.textContent = text;
	if (scope) el.scope = scope;
	return el;
}

/** The stats table for everyone in the match; with several players, each line's leader is picked out. */
function fillStatsTable(table) {
	const stats = game.players.map(player => mode().matchStats(player, game));
	const head = document.createElement('tr');
	head.append(cell('th', ''), ...game.players.map(player => cell('th', player.name, 'col')));
	const rows = mode().STAT_ROWS.map(({ label, value, show = String, note, low }) => {
		const row = document.createElement('tr');
		row.append(cell('th', typeof label === 'function' ? label(game.settings) : label, 'row'));
		const values = stats.map(value);
		const scored = values.filter(v => v !== null && v > 0);
		const lead = game.players.length > 1 && scored.length ? (low ? Math.min : Math.max)(...scored) : null;
		values.forEach((v, i) => {
			const td = cell('td', v === null ? '–' : show(v, game.settings));
			if (v !== null && note) td.append(' ', cell('small', note(stats[i])));
			if (v !== null && v === lead) td.className = 'lead';
			row.append(td);
		});
		return row;
	});
	const thead = document.createElement('thead');
	const tbody = document.createElement('tbody');
	thead.append(head);
	tbody.append(...rows);
	table.replaceChildren(thead, tbody);
}

function showStats() {
	fillStatsTable($('.stats-tbl', statsDialog));
	openDialog(statsDialog);
}

statsDialog.addEventListener('click', event => {
	if (event.target.closest('[data-action="close"]') || event.target === statsDialog) closeDialog(statsDialog);
});

// ---- Undo confirmation --------------------------------------------------------

const confirmDialog = $('#confirm-undo');

function confirmUndo({ title, detail }) {
	$('.confirm-title', confirmDialog).textContent = title;
	$('.confirm-detail', confirmDialog).textContent = detail;
	openDialog(confirmDialog, $('[data-action="undo"]', confirmDialog));
}

confirmDialog.addEventListener('click', event => {
	const action = actionOf(event);
	if (action === 'undo') travel(History.undo(history, game), 'undo');
	if (action || event.target === confirmDialog) closeDialog(confirmDialog);
});

// ---- Toast --------------------------------------------------------------------

const toast = $('.toast');
let toastTimer = 0;

/** A past turn's toast with no room for the word Close beside it, or itself cut short: just the ✕. */
function fitToastClose() {
	toast.classList.remove('tight');
	if (!toast.classList.contains('review')) return;
	const text = $('.toast-text', toast);
	const room = $('.btn-section .settings-btn').getBoundingClientRect().left - $('.toast-close', toast).getBoundingClientRect().right;
	toast.classList.toggle('tight', room < TOAST_CLOSE_ROOM || text.scrollWidth > text.clientWidth);
}
addEventListener('resize', () => !toast.hidden && fitToastClose());

/** Show a short status message; a new one replaces the last. sticky: stays until hidden. */
function showToast(message, { sticky = false } = {}) {
	if (!message) return;
	toast.className = `toast ${message.kind}`;
	$('.toast-title', toast).textContent = message.title;
	$('.toast-detail', toast).textContent = message.detail;
	toast.hidden = false;
	// Restart the pop-in even if a toast is already showing.
	toast.style.animation = 'none';
	void toast.offsetWidth;
	fitToastClose(); // measured here, before the pop-in's scale
	toast.style.animation = '';
	clearTimeout(toastTimer);
	toastSticky = sticky;
	if (!sticky) toastTimer = setTimeout(hideToast, TOAST_MS);
}

function hideToast() {
	clearTimeout(toastTimer);
	toastSticky = false;
	if (toast.hidden) return;
	toast.classList.add('leaving');
	afterAnimations(toast, () => {
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

	// Board layout: only its own controls, and Esc is Done.
	if (!visualsPanel.hidden) {
		if (event.key === 'Escape') closeVisuals();
		return;
	}

	const dialogs = openDialogs();
	if (event.key === 'Tab' && dialogs.length) {
		trapFocus(event, dialogs.at(-1));
		return;
	}

	if (event.key === 'Escape' && menuFor !== null) {
		closePlayerMenu();
		return;
	}

	if (event.key === 'Escape' && dialogs.length) {
		for (const dialog of [settingsDialog, winnerDialog, confirmDialog, statsDialog, newGameDialog]) closeDialog(dialog);
		return;
	}
	if (dialogs.length || event.target.closest('input, select, textarea')) return;
	// A focused button handles its own Enter and Space.
	if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('button')) return;

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

// Ready the checkout table while nothing's happening, so the first finish (the
// first score it's needed for) doesn't make that tap stutter.
(self.requestIdleCallback ?? setTimeout)(() => canCheckout(2, 1, game.settings.doubleOut ?? true));

// ---- Render -------------------------------------------------------------------

function render() {
	renderKeypad();
	renderDarts(); // and the scoreboard, whose checkout follows the darts
	renderControls();
	if (!settingsDialog.hidden) renderSettings();
	if (!newGameDialog.hidden) renderNewGame();
}

render();
// Opened with no game under way: start on the New game screen, set to the
// last game played, so it's one tap to play it again or a few to change it.
if (!matchStarted()) openNewGame();
