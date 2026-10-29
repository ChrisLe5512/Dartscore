# Dartscore

A darts scoreboard for 301, 501 and 701, built for tablets in landscape and installable as an app. No build step, no dependencies: plain HTML, CSS and JavaScript modules.

## Run it locally

ES modules don't load from `file://`, so serve the folder instead of double-clicking `index.html`:

```
npm run dev        # http://localhost:8080
npm test           # game logic tests (Node 20+)
```

VS Code's Live Server or `python -m http.server` work too.

## How to play

- **Players:** tap **+** under the scores before the first throw (up to 12); after that, add them in **⚙ Settings**. Tap a name to rename it. Reorder or remove players in Settings. The score column resizes to the number of players: one or two get a large score and stats (average, best turn, darts), three get a stats line, and five or more shrink and scroll.
- **Keypad:** type the turn's total and tap **✓**. Tap the top or bottom half of the score box to adjust it by 1. Totals that three darts can't make (179, 178, …) can't be submitted.
- **Dartboard:** tap where each dart landed, then **DONE**. Each dart is marked on the board with a number that matches its slot in the darts column. The outer number ring counts as a miss (0). Tap a dart in the column to remove it, or **Clear** to start the turn over.
- **History:** each player's turns run left to right under their name. Turns entered on the dartboard are underlined: tap one to see where its darts landed.
- **▾** above the keypad folds it away to give the players more room; tap again to bring it back.
- **BUST** ends the turn with no score. Going below zero is also a bust.
- **Checkout** suggestions appear in green once a finish is possible and update as you tap darts on the board. Tap the suggestion to see other routes.
- **↶ / ↷** undo and redo whole turns, players added or removed, and new games.
- **Settings:** start score, legs per set, sets to win, and **Double out** (finishes must end on a double or bull, and leaving 1 is a bust). Changing these before the first throw applies immediately; mid-game they start a new game.
- The game is saved on the device, so a refresh or closing the app doesn't lose it.
- Keyboard: digits, Enter, Backspace, Esc, ↑/↓, Ctrl+Z / Ctrl+Y, F11 for full screen.

Each new leg starts with the next player in order. Winning a set resets everyone's legs.

## Project layout

```
index.html         page markup
css/styles.css     all styling (colours and borders as variables at the top)
js/config.js       rules and board geometry constants
js/game.js         game state and rules (pure functions, no DOM)
js/checkout.js     checkout suggestions
js/board.js        dartboard hit detection and dart colours
js/history.js      undo / redo
js/storage.js      saving to the device
js/feedback.js     status messages (undo, bust, leg won, …)
js/app.js          connects everything to the page
sw.js              offline cache (active on HTTPS only)
tests/             node:test unit tests
scripts/serve.js   local dev server
```

The previous prototypes (`dartscore_old/`, `dartscore_new/`) are in the git history.
