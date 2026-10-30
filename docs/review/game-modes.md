# To review: game modes (v2.6.0)

These are judgement calls made while adding the practice games. All of them work and are tested. Each one is easy to change if you'd rather have it another way.

**Reviewed (v2.7.0):** all kept. Added as options, a checkbox under the Game row in Settings that shows only for that game:
- 121: "Miss: back to last checkout"
- Doubles practice: "Play on below 0"
- Around the clock: "Skip ahead"

121 now shows its target beside the score when the stats line has no room. Cricket comes after the practice games have been played for a while.

## 1. The Game picker is one list

Settings' "Start score" became "Game": 301, 501 and 701, then the practice games (Around the clock and its doubles and trebles versions, Doubles practice (27), 121 checkout). This keeps the settings row exactly as it was.

- **Alternative:** a separate "Mode" select, with each mode's options (start score, ring) beside it. This is cleaner once there are many modes (cricket and its variants), but it changes the settings layout.
- **Where:** `GAME_CHOICES` in `js/modes.js`, and the Settings section of `js/app.js`.

## 2. 121 rules

- A miss means trying the same number again.
  - Other variants: drop back to 121, or back to your last checkout.
- A leg is ten targets each, and the highest target wins it. A tie draws the leg.
  - Alternatives: a race to a target (first to 130 wins), or no end at all.
- Each player throws all three visits at a target before the next player's turn.
- Double out applies (it's a setting, on by default).
- **Where:** `ONE21` in `js/config.js` (start, visits, rounds), and `js/one21.js`.

## 3. Doubles practice rules (Bob's 27 style)

- Everyone starts on 27. A double hit adds its value; a visit that hits no double takes the double's value off.
- At 0 or below you're out.
  - Some people play on below zero instead. That could become a setting.
- The highest score still in wins the leg. A tie draws it.
  - Alone: finishing (not out) wins the leg; going out draws it.
- **Where:** `js/doubles.js`, and `DOUBLES_START` in `js/config.js`.

## 4. Around the clock details

- The bull: either bull counts, except in the doubles version (bullseye only). The trebles version has no treble bull, so either bull counts there too.
- The first player round wins the leg; the others don't get to finish the round.
- No "skip ahead" variant (where a double moves you on 2 and a treble 3).
- **Where:** `js/clock.js`.

## 5. How the practice games show

- **Big number:** the target in around the clock (7, D7, Bull), the score in doubles, what's left of the target in 121.
- **Stats line** (shown when there's room):
  - Around the clock and doubles: Hits / Darts / Rate.
  - 121: Target / Visit / Round.
  - With 3+ players the stats line is hidden, so 121's target and round aren't visible then.
- **History:** around the clock shows hits per visit (0–3); doubles shows +/− points; 121 shows visit scores, as in X01.
- **Doubles:** the double to aim at shows in the checkout's place ("🎯 D7"), with "Out" or "Done" in grey.
- **Keypad:** in around the clock and doubles you enter the number of hits (0–3). BUST still means "no score" (0 hits).
- **Match stats dialog:** each mode has its own rows (`STAT_ROWS` in each mode module).

## 6. Cricket, next

Cricket's marks grid won't fit the score cell. It will need a small per-mode display hook in `app.js` (an optional render function on the mode). Everything else (rules, undo, saves, picker) plugs in the same way as the practice games.
