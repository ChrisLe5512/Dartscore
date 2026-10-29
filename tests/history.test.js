import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory, record, redo, undo } from '../js/history.js';

test('undo and redo walk back and forth', () => {
	let h = createHistory();
	assert.equal(undo(h, 'a'), null);
	h = record(h, 'a'); // now at b
	h = record(h, 'b'); // now at c
	let r = undo(h, 'c');
	assert.equal(r.state, 'b');
	r = undo(r.history, r.state);
	assert.equal(r.state, 'a');
	assert.equal(undo(r.history, r.state), null);
	r = redo(r.history, r.state);
	assert.equal(r.state, 'b');
	r = redo(r.history, r.state);
	assert.equal(r.state, 'c');
	assert.equal(redo(r.history, r.state), null);
});

test('a new action clears redo', () => {
	let h = record(createHistory(), 'a');
	const r = undo(h, 'b');
	h = record(r.history, r.state);
	assert.equal(h.future.length, 0);
});
