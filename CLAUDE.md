# Dartscore

Darts X01 scoreboard web app (301/501/701), built for tablets in landscape and installable as a PWA. Plain HTML/CSS/JS ES modules, no build step, no dependencies.

## Commands

- `npm run dev`: local server at http://localhost:8080 (ES modules don't load from file://)
- `npm test`: node:test unit tests (Node 20+)

## Layout

- `js/config.js`: rules and board geometry constants. Put tunable values here.
- `js/game.js`: pure game state and rules (no DOM). Every function returns a new state.
- `js/checkout.js`: ranked checkout suggestions
- `js/board.js`: dartboard hit-testing and dart colours
- `js/history.js`: undo/redo snapshot stacks
- `js/storage.js`: localStorage save/load (key `dartscore:v2`)
- `js/app.js`: DOM wiring only. Turns taps into game actions and state into DOM.
- `sw.js`: offline cache (HTTPS only). Bump `CACHE` when cached files change.

## Environment

- Owner's machine: Windows, VS Code, PowerShell terminal, GitHub Desktop. Node LTS.
- Repo: github.com/ChrisLe5512/Dartscore. Local path: Documents\GitHub\Dartscore.

## Rules for changes

- **The owner likes the current look and layout. Don't change styling or layout unless asked.** Verify visual changes with before/after screenshots.
- Keep game rules in `game.js` with tests, not in `app.js`.
- Never insert user text (player names) with innerHTML. Use textContent.
- Indent with tabs.
- Work on the `dev` branch. `main` is what GitHub Pages may be serving. Merge to `main` only through a pull request the owner approves.
- Run `npm test` after changing anything in `js/`.
- The owner follows changes in VS Code (Git Graph). Make small, focused commits with clear messages.

## Roadmap (owner's goals)

1. Polish the app (current phase: development, not shipping yet)
2. Host it (Cloudflare Pages or Vercel; no domain chosen yet)
3. Accounts, match history and stats in a database
4. Monetization: free scorer plus a paid tier (stats, more game modes)
