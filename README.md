# Dartscore

A darts scoreboard for 301, 501 and 701, built for tablets in landscape (with a portrait layout too) and installable as an app. No build step, no dependencies: plain HTML, CSS and JavaScript modules.

## Run it locally

ES modules don't load from `file://`, so serve the folder instead of double-clicking `index.html`:

```
npm run dev        # http://localhost:8080
npm test           # game logic tests (Node 20+)
```

VS Code's Live Server or `python -m http.server` work too.

## How to play

- **Players:** tap **+** under the scores before the first throw (up to 8); after that, add them in **⚙ Settings**. Tap a player to open their menu: Rename, Throw now (hand them the throw), Move up/down, Match stats, Remove. In Settings, drag a player anywhere on their slot to reorder. Long names narrow, wrap or shrink to fit. The score column resizes to the number of players: one or two get a large score and stats (3-dart average, best visit, visits), three get a stats line, and five or more shrink and scroll.
- **Who throws first:** after a bull-off, use **Throw now** on the winner before the first dart: they start the leg, and each leg after goes to the next player in order.
- **Keypad:** type the turn's total and tap **✓**. Tap the top or bottom half of the score box to adjust it by 1. Totals that three darts can't make (179, 178, …) can't be submitted.
- **Dartboard:** tap where each dart landed, then **DONE**. Each dart is marked on the board with a number that matches its slot in the darts column. The outer number ring counts as a miss (0). Tap a dart in the column to pick it up, then tap the board to move it (it keeps its number); tap it again to remove it. **Clear** starts the turn over.
- **History:** each player's turns run left to right under their name: 100+, 140+ and 180 in colour, the leg-winning visit in green, a bust as the score it would have been, struck through. Tap a turn entered on the dartboard to see where its darts landed. Finished legs fold into a dot (green: won, grey ring: lost); tap one to open the leg out.
- **▾** (above ⚙ beside the board) folds the keypad away to give the players more room; tap again to bring it back.
- **Board & visuals** (in ⚙ Settings): the controls take the place of the scores and keypad, and the board itself shows each change. Resize the bull, treble, double and number rings, change the outline thickness and colour, or add wires round every bed. Tapping follows your layout, and the bed each dart hits lights up.
- **BUST** is a quick turn of 0 (three misses, or a bust you didn't enter dart by dart). Entering a score that goes too far is a bust by itself.
- **Checkout** suggestions appear in green once a finish is possible and update as you tap darts on the board. Tap the suggestion to see other routes. They follow the Double out setting.
- **↶ / ↷** undo and redo whole turns, players added or removed, and new games. Undoing a leg, set or match win, a new game, or a player or settings change asks first.
- **Settings:** the game (301, 501 or 701, or a practice game, below; 501 by default), legs to win a set, sets to win, **Double out** (on by default: finishes must end on a double or bull, and leaving 1 is a bust) and **Practice** (legs go on and on, no winner). Changing these before the first throw applies immediately; mid-game they start a new game.
- **Match stats** (player menu, and under the winner): legs won, 3-dart and first-9 averages, checkout % (legs won from visits that started on a finish), best leg, high finish, and 100+/140+/180 counts. Visits are three darts, except a leg-winning one entered on the board.
- The game is saved on the device, so a refresh or closing the app doesn't lose it.
- Keyboard: digits, Enter, Backspace, Esc, ↑/↓, Ctrl+Z / Ctrl+Y, F11 for full screen.

Each new leg starts with the next player in order. Winning a set resets everyone's legs.

### Practice games

Pick one under **Game** in Settings. They use the same players, legs, sets, Practice, undo and match stats as X01. On the keypad, enter how many targets or doubles a visit hit (0 to 3); on the board, tap the darts and only the ones that count are counted.

- **Around the clock:** hit 1, 2, 3 … 20 in order, then the bull. The big number is the target. Variants count only doubles or only trebles (the bull: the bullseye for doubles, either bull for trebles). The first player round wins the leg.
- **Doubles practice (27):** everyone starts on 27 and goes round the doubles, D1 to D20 then the bullseye, one visit at each (the double to aim at shows beside the history). Each double hit adds its value; a visit with none takes the double's value off. At 0 or below you're out. When everyone is round or out, the highest score still in wins the leg; a tie draws it.
- **121 checkout:** three visits (nine darts) to check out 121, scored as in X01 (Double out applies). Check out and your next target is one higher; miss and you try the same number again. Each player throws all their visits at a target before the next player's turn. After ten targets each, the highest target reached wins the leg; a tie draws it.

## Project layout

```
index.html         page markup
css/styles.css     all styling (colours and borders as variables at the top)
js/config.js       rules and board geometry constants
js/game.js         X01 game state and rules (pure functions, no DOM)
js/clock.js        around the clock rules
js/doubles.js      doubles practice rules
js/one21.js        121 checkout rules
js/match.js        what every mode shares: recording turns, legs and sets, loading
js/modes.js        the game modes: each mode's rules and how it shows
js/checkout.js     checkout suggestions
js/board.js        board geometry, hit detection and dart colours
js/dartboard.js    draws the board (SVG)
js/history.js      undo / redo
js/storage.js      saving to the device
js/feedback.js     status messages (undo, bust, leg won, …)
js/stats.js        match stats (averages, checkout %, best leg, …)
js/version.js      the app version, which also names the offline cache
js/app.js          connects everything to the page
sw.js              offline cache (active on HTTPS only)
tests/             node:test unit tests
scripts/serve.js   local dev server
```

The previous prototypes (`dartscore_old/`, `dartscore_new/`) are in the git history.
