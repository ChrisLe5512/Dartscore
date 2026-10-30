# Dartscore

Darts X01 scoreboard web app (301/501/701), built for tablets in landscape (16:10 first, 4:3 too) with a portrait layout, and installable as a PWA. Plain HTML/CSS/JS ES modules, no build step, no dependencies.

## Commands

- `npm run dev`: local server at http://localhost:8080 (ES modules don't load from file://)
- `npm test`: node:test unit tests (Node 20+)

## Layout

- `js/config.js`: rules and board geometry constants. Put tunable values here.
- `js/game.js`: pure X01 game state and rules (no DOM). Every function returns a new state.
- `js/clock.js`, `js/doubles.js`, `js/one21.js`: the practice games (around the clock, doubles practice, 121), pure rules modules like `game.js`, each with how it shows (score text, stats line, history marks, STAT_ROWS).
- `js/match.js`: what every mode shares (turn records, legs/sets via `endLeg`, restoring a save).
- `js/modes.js`: the mode registry. `modeOf(state)` gives a game's rules and look (no `mode` = X01, so old saves load); `GAME_CHOICES` fills the Game picker. A new mode (cricket) is a new module with the same exports, added here.
- `js/checkout.js`: ranked checkout suggestions
- `js/feedback.js`: status toast messages for turns and undo/redo (pure)
- `js/board.js`: board geometry (adjustable ring layout), hit-testing and dart colours (pure)
- `js/dartboard.js`: draws the board as SVG from the geometry; lit beds and dart markers
- `js/history.js`: undo/redo snapshot stacks
- `js/stats.js`: match stats (pure)
- `js/storage.js`: localStorage save/load (game: `dartscore:v2`; per-device view prefs such as keypad and board look: `dartscore:prefs`). Undo steps are packed so turns are saved once (packSession).
- `js/app.js`: DOM wiring only. Turns taps into game actions and state into DOM.
- `js/version.js`: the version shown in Settings. `sw.js` names its cache after it: bump it when cached files change.
- `sw.js`: offline cache (HTTPS only). Add new files to `APP_SHELL`.
- `css/styles.css`: colours, borders (`--line`) and board colours (`--board-*`) are variables at the top. Themes should only need to change those. Sizes use `vmin` (never `vh`, except the portrait band's height), so landscape is sized by height and portrait by width; portrait overrides are in the PORTRAIT block at the end.

## Environment

- Owner's machine: Windows, VS Code, PowerShell terminal, GitHub Desktop. Node LTS.
- Repo: github.com/ChrisLe5512/Dartscore. Local path: Documents\GitHub\Dartscore.

## Rules for changes

- **The owner likes the current look and layout. Don't change styling or layout unless asked.** Verify visual changes with before/after screenshots.
- Keep game rules in the mode modules (`game.js` for X01) with tests, not in `app.js`. `app.js` reaches them through `mode()`.
- Never insert user text (player names) with innerHTML. Use textContent.
- Indent with tabs.
- Work on the `dev` branch. `main` is what GitHub Pages may be serving. Merge to `main` only through a pull request the owner approves.
- Run `npm test` after changing anything in `js/`.
- The owner follows changes in VS Code (Git Graph). Make small, focused commits with clear messages.

## Roadmap (owner's goals)

1. Polish the app (current phase: development, not shipping yet)
2. Host it (Cloudflare Pages or Vercel; no domain chosen yet)
3. Accounts, match history and stats in a database
4. Monetization: free scorer plus paid extras

### Monetization rules (from the owner)

- Never paywall anything needed to score a game. Only optional extras are paid or unlockable: themes and board looks, extra stats, more game modes, some account features.
- Ads only where they don't cover anything: between screens (e.g. after a match), inside existing popups, or one small fixed banner in space that is otherwise unused. Never overlays, interstitials over the board, or ads that move the layout.
- Keep the impact on visuals and speed minimal; the app must stay fully usable offline.

### To do

- Themes: a theme is a set of the CSS variables above (plus a board style). Add a theme picker in Settings > Board & visuals; some themes free, some unlockable.
- Accounts and database: sign-in, match history and stats synced across devices. The game state is already plain JSON (`game.js`), so matches can be saved as-is. Pick a hosted backend that suits Cloudflare Pages or Vercel.
- Entitlements: one place that answers "is this extra unlocked?" (free, unlocked by playing, or paid), checked by the UI only. Never by game rules.
- Ads: a single banner slot and a post-match slot, off by default in development, removed for paying users.
- More game modes: cricket next, as a rule module registered in `modes.js` (around the clock, doubles practice and 121 are done).
- Owner to review: choices made for the practice games (picker, 121 and doubles rules, display). See `docs/review/game-modes.md`.
- Parked: automatic scoring hardware add-on. See `docs/ideas/auto-scoring.md` before starting.
