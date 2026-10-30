# Idea: automatic scoring add-on (parked)

A cheap add-on for any stock bristle board that detects where each dart lands and sends it to Dartscore. Parked until a hardware experiment proves it can work (see "Next step").

## Electrical sensing through the spider: ruled out

Probes on the outer ring wire can't locate a dart:

- The spider is one connected piece of metal, so 3 or 4 probes on it all measure the same electrical point.
- A tip in sisal doesn't touch the wires. The part that pokes out doesn't change that.
- A field change could at best show that a dart arrived, not where. Calibration can't add position information that isn't in the signal.

## Acoustic timing (TDOA): plausible, unproven

Piezo sensors on the board edge time the impact's shockwave. The differences in arrival time give the position.

- **Precision needed:** the treble and double rings are about 8 mm wide, and many darts land within 1 to 2 mm of a wire. If the wave travels at roughly 1,000 to 3,000 m/s, 1 mm is about 0.3 to 1 µs. Each throw must be timed consistently to well under 1 µs.
- **The clock isn't the limit; the signal is.** A dart entering sisal is a soft, damped thud whose rising edge likely takes tens to hundreds of µs. A 160 MHz timer only timestamps a blurry event precisely. Threshold triggers also fire earlier on stronger signals, which adds errors that depend on position.
- **The board isn't uniform.** The sisal fibres run front to back, the spider wires sit on the surface, and the backer and wall mount add their own effects. Calibration taps help, but players rotate their boards, which would mean calibrating again.
- **Gameplay events on the board that a "radius > 225.5 mm" check can't reject:**
  - bounce-outs: they score 0 but still make an impact
  - darts hitting darts already in the board
  - darts knocked out by a later dart
  - pulling darts out
  - knocks on the board itself
- **Realistic expectation:** the right number is probably achievable. The right ring near wires is the open question.

### Next step: a go/no-go experiment (about $20, one weekend)

1. Glue two piezo discs to the board edge.
2. Plug them into a USB audio adapter with stereo line-in.
3. Record at 96 kHz or higher (Audacity).
4. Throw 10 to 20 darts at the same spot. Measure the delay between the two channels by cross-correlation.

- If the delay varies by about 1 µs or less from throw to throw, it's promising: build an ESP32 prototype.
- If it varies by 10 µs or more, it can't resolve rings, so stop.

For a prototype, timestamp arrivals with the microcontroller's hardware capture unit (for example the ESP32's MCPWM capture) or sample with a fast multi-channel ADC. Software interrupts jitter by about 1 µs, which is millimetres of error.

## Fitting it into Dartscore

- `js/board.js` already turns a board position into a dart for board input. A sensor that sends x/y would use the same path, and the board stays tappable to correct a wrong reading.
- **Connection:**
  - The app is served over HTTPS (needed for the PWA), so it can't open a plain `ws://` connection to a device on the home network, because browsers block that as mixed content.
  - Web Bluetooth avoids this, but it works in Chrome on Android and desktop, not iPad Safari.
  - Choose the target tablets before choosing the link.
- Keep the firmware and experiments out of this repo until the experiment passes.

## Alternatives

- **A phone as the camera.** Darts land on a flat surface, so one camera can map the tip onto the board. The vision could run in the browser, with a spare phone streaming the video. It needs no new hardware, but accuracy and occlusion are concerns; commercial systems use several cameras.
- **Connecting to existing camera rigs** (Autodarts, Scolia). It hasn't been checked what interfaces they offer to third-party apps. If one does, supporting it is low effort and could be a paid extra under the monetization rules.
