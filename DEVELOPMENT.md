# Developer documentation

The technical side of Matrix Watchface Red. The user-facing and installation side
is in [README.md](README.md).

## Device and target

| | |
| --- | --- |
| Device | Amazfit T-Rex 3 Pro 48mm |
| Display | 480 × 480, round, AMOLED |
| `deviceSource` | 10551552 (CN), 10551553, 10551555 |
| `configVersion` | v2 (v2 and v3 are valid, v1 is deprecated) |
| API level | 4.2 |
| Target key | `480x480-amazfit-t-rex-3-pro` |
| `designWidth` | 480 |

## API

The device runs API level 4.2. The classic globals (`hmUI`, `hmSensor`,
`hmSetting`, `timer`) **no longer exist** there — touching any of them ends in
`TypeError: cannot read property … of undefined` and a black screen. Everything
comes from the `@zos` modules:

```js
import ui from '@zos/ui'
import { getScene, SCENE_AOD } from '@zos/app'
import { Time, Step, HeartRate, Battery } from '@zos/sensor'
```

`WatchFace({ … })`, `console.log`, `setInterval` and `clearInterval` stay
global. Do **not** use `createSysTimer` from `@zos/timer` for the one-second
tick: it is meant to survive a switched-off screen, and the firmware rejects
periods that short (`_check_param … bad repeat(1000)` in the log, and the timer
simply never runs).

The sensors need permissions in `app.json` or access fails:
`data:user.hd.step` and `data:user.hd.heart_rate`. Time and Battery need none.

## Project layout

```
app.json                    manifest, target and deviceSource
app.js                      app entry point (unchanged from the template)
watchface/index.js          the entire watchface
assets/480x480-amazfit-t-rex-3-pro/
  icon.png                  preview image, 480 x 480
  fonts/                    Chakra Petch Medium + OFL.txt
  image/rain/               Matrix rain frames
  image/flap/big/           split-flap frames of the large digits
  image/flap/sec/           split-flap frames of the seconds digits
  image/flap/sml/           split-flap frames of the small digits
  image/digit/              still images of the digits
design/                     design canvas source (*.dc.html)
design/frames/              frame generator for the rain
design/shots/               standalone HTML pages for the screenshots
docs/screenshots/           the images used in the README
```

This matches the official
[folder structure](https://docs.zepp.com/docs/v2/guides/architecture/folder-structure/):
`app.js` and `app.json` at the root, below that one folder per target under
`assets/`, named **exactly like the key in the `targets` object**, containing
`icon.png` and images under `image/`.

`design/` and `docs/` live in the project but never end up in the package — on
install the firmware only creates `watchface/` and `assets/`. They do trigger
rebuilds while `zeus dev` is running, though.

## Preview image

`icon.png` is the image shown in the watchface picker on the watch. The build
scales it down to 324 px (`[RESIZE] Succeed resize icon.png to target size 324`
in the log), which is the size the specification requires for a 480 × 480
device. It ships with the package, not only at publishing time.

Generated from the design draft:

```bash
msedge --headless=new --window-size=480,480   --screenshot=assets/480x480-amazfit-t-rex-3-pro/icon.png   "file:///<path>/design/shots/active.html?icon=1"
```

`?icon=1` drops the bezel ring so the image contains exactly the 480 × 480
panel.

## Typeface

Chakra Petch Medium, shipped as
`assets/<target>/fonts/ChakraPetch-Medium.ttf` and set on every `TEXT` widget
via `font: FONT`. According to the
[UI reference](https://docs.zepp.com/docs/reference/device-app-api/newAPI/ui/)
the TEXT widget takes a path relative to the asset folder — image digits are
not needed for this.

The licence (SIL Open Font License) sits next to it as `OFL.txt`; it permits
bundling but requires the licence to travel with the font. Do not delete it.

The cell widths below come from the measured digit width of this font:
**50.9 px at 80 px** font size and **14.0 px at 22 px**. Swapping the font means
measuring again — otherwise the digits sit crooked in their cells or get
clipped.

## Layout (480 × 480)

| Element | Position |
| --- | --- |
| `> SYS.TIME` | y 150, centred, 22 px |
| Time HH:MM | 4 cells of 51 × 76 + 20 px colon, block starting at x 128, centred on y 240 |
| Seconds | 2 cells of 18 × 30 starting at x 364 |
| Cursor | 10 × 26 at x 408 |
| Separator line | x 110, y 296, 260 × 1 |
| Data rows | label x 137, value x 233, digit cell 14 px, from y 308, pitch 32 |

The top and bottom 44 px stay free — that is where the system draws the status
dot and the offline voice hint. Minimum font size on a watchface is 22 px,
which is exactly why the data rows are that size.

## Code structure

`watchface/index.js` is split into sections: settings, colours, layout, state,
helpers, digit slots, build, update, entry point.

**Slots.** Every digit on the watchface is a slot. Without image assets that is
a `TEXT` widget, with assets an `IMG_ANIM`. `setDigits()` switches between the
two paths.

`setNumber()` places values of varying length **left-aligned** against the value
column `ROW.valueX` — like the date, so all four rows line up. Unused slots at
the end are hidden and the unit behind them (`BPM`, `%`) moves up: it keeps its
options object so `setProperty(ui.prop.MORE, options)` can re-set it with a new
`x`.

**Flap logic.** `rollTo()` pushes one entry per intermediate step onto the queue
and `playStep()` plays them back to back via `anim_complete_call`. That way the
reel always rolls forward, including across zero.

**Two sets of widgets.** `buildActive()` and `buildAod()` create the active and
the always-on face, separated by `show_level: ONLY_NORMAL` and `ONAL_AOD`
respectively. The time sits at the same position and size in both so nothing
jumps when switching.

## Update strategy

The display is updated event-driven rather than recomputed every second:

| Trigger | What it updates |
| --- | --- |
| `time.onPerMinute` | hour, minute, date, battery, the whole always-on face |
| `step.onChange` | step count |
| `heart.onLastChange` | heart rate |
| `battery.onChange` | battery level |
| `setInterval(…, 1000)` | seconds and cursor |

The timer only runs while the display is on — `WIDGET_DELEGATE` starts and stops
it via `resume_call` / `pause_call`, and in always-on mode
(`getScene() === SCENE_AOD`) none is created in the first place. The always-on
face still stays current because the system wakes the watchface for
`onPerMinute`.

On top of that, `setText()` only writes to a widget when the value really
changed, and `setDigits()` skips digits that are already correct. In the normal
case that leaves two writes per second: the seconds digit and the cursor.

## Feature flags

Right at the top of `watchface/index.js`:

```js
const USE_RAIN = true    // Matrix rain as a full-screen animation
const USE_FLAP = false   // split-flap digits instead of plain text digits
```

Both need the frame sequences described below. Set to `false`, the same
watchface runs without rain and with hard-switching text digits.

`USE_FLAP` is deliberately `false`. With text digits the watchface runs
reliably; the split-flap effect is the part that still has to be confirmed on
real hardware.

> **Why this is the way it is.** An `IMG_ANIM` only draws while it is running.
> When it stops, the cell stays empty — and the log still reports `ok`
> everywhere. That is why the time disappeared entirely the first time the flap
> effect was enabled. The giveaway was a burst of `_pause` messages right after
> `[matrix] clock ok`: the system pauses every animation that is not running.
>
> The fix is to build each digit from **two** widgets: an `IMG` still image from
> `image/digit/<size>/<digit>.png` that is always there, and the `IMG_ANIM` on
> top which is only shown while rolling. At the end of the chain `playStep` sets
> the still image to the target value and hides the animation again.
>
> To test, set `USE_FLAP` to `true`. That requires all 140 frames to be present
> (60 in `big`, 40 in `sec`, 40 in `sml`) plus the 30 still images under
> `image/digit/`. If any of them is missing, the affected digit stays blank.

## Frames

Everything under `assets/480x480-amazfit-t-rex-3-pro/`:

| Folder | Files | Size | State |
| --- | --- | --- | --- |
| `rain/` | `rain_0.png` … `rain_23.png` | 480 × 480 | **done, 2.4 MB** |
| `flap/big/` | `roll_<n>_<f>.png`, n = 0…9, f = 0…5 | 51 × 76 | **done** |
| `flap/sec/` | `roll_<n>_<f>.png`, n = 0…9, f = 0…3 | 18 × 30 | **done** |
| `flap/sml/` | `roll_<n>_<f>.png`, n = 0…9, f = 0…3 | 14 × 26 | **done** |

The file name is `<anim_prefix>_<index>.png` — confirmed against the official
sample (`anim_prefix: 'a'` gives `a_0.png`).

### Split-flap digits

**Every cell size needs its own frames.** An `IMG_ANIM` has exactly one pixel
size, hence three sets: `big` for hour and minute, `sec` for the seconds, `sml`
for steps, heart rate and battery. An earlier version pointed seconds and data
values at the same folder, which cannot work.

Generated from `design/frames/flap.html`, one call per frame:

```bash
msedge --headless=new --window-size=51,76   --screenshot=.../image/flap/big/roll_9_3.png   "file:///<path>/design/frames/flap.html?size=big&from=9&f=3&c=ffd9d9&g=255,45,45"
```

`size` picks the cell size, `from` the starting digit, `f` the single frame, `c`
the digit colour and `g` the glow colour as an RGB triple. The green variant
uses the same page with different colour values.

The speed lives in `FLAP_FPS` (currently 20). With six frames a digit step takes
300 ms; a jump from 9 to 2 flaps three times in a row, so just under a second.
Higher means faster and at some point invisible.

`roll_3` is the step **from 3 to 4**. The last frame of every sequence has to be
the finished target digit, because it stays on screen until the next change. The
background is always pure black.

The reference for the look is `design/shots/active.html` — cell size, font,
afterglow and the flap edge are already set there the way the frames should
look.

### Rain

Generated from `design/frames/rain.html?f=<0…23>`, one call per frame:

```bash
msedge --headless=new --window-size=480,480   --screenshot=assets/480x480-amazfit-t-rex-3-pro/rain/rain_0.png   "file:///<path>/design/frames/rain.html?f=0"
```

The speed lives entirely in `RAIN_FPS` (currently 6, i.e. 4 s per loop) — the
columns travel whole glyph rows per frame, so the frame rate scales the whole
rain. Lower means slower and at the same time less load; nothing has to be
re-rendered for it.

The loop closes seamlessly because every column travels whole glyph rows per
frame (1, 2 or 3) and the strand repeats every `PERIOD = 24` rows — after 24
frames every column has travelled a whole multiple of the period. `PERIOD`
therefore has to divide `FRAMES`. Every column additionally has a fixed phase,
otherwise all strands would sit at the same height.

Scrim, scanlines and vignette are baked into the frames — they only cost around
8 % file size and save a second overlay widget. Fewer frames would halve the
2.4 MB, but `PERIOD` has to follow.

## Build

```
zeus dev      # simulator with live reload
zeus preview  # QR code, install onto the device
zeus build    # .zab package into dist/
```

While `zeus dev` is running, **every** file change in the project folder
triggers a rebuild — including in `design/` and `docs/`. With many writes in a
row the watcher loses the connection to the simulator and exits with code 1.

## Regenerating the screenshots

The images in the README do not come from the device but from standalone HTML
pages under `design/shots/`, rendered with a headless Chromium:

```bash
msedge --headless=new --window-size=520,520 \
  --screenshot=docs/screenshots/active.png \
  file:///<path>/design/shots/active.html
```

`active.html?flap=1` shows the minute digit mid-flap, `aod.html` the always-on
face. Values and time are the sample data from the Zepp OS specification for
preview images: 10:09:36, 8670 steps, 86 bpm.

## Power consumption

A black background and a single red colour are the cheapest case on AMOLED —
only lit pixels draw power. The expensive part is the full-screen rain: Zepp OS
does not draw freely but plays back pre-rendered PNG sequences, and a 480 × 480
loop is the heaviest thing that fits on a watchface.

The knobs, all on `IMG_ANIM`:

- `repeat_count: 1` instead of `0` — the rain runs once on wrist raise instead
  of continuously
- `default_frame_index` — the image left on screen in power-saving mode
- `step` — skip frames
- a smaller animated area instead of full screen

For always-on mode the Zepp OS specification requires: at most 10 % lit pixels,
a black background, no seconds display, bright areas as outlines with at most
6 px stroke width, and elements must not jump between the modes. `buildAod()`
follows all of these.

## Open questions

Clarified and confirmed on the device: the globals are gone, everything goes
through `@zos`. The following still come from documentation or official samples
and are not yet backed by hardware:

- **Colour format.** `@zos/ui` takes colours as a plain number (`0xff2d2d`), the
  way the API reference and the 3.0 sample show it. Older samples generated with
  the Watchface Maker write `"0xAARRGGBB"` as a string instead. If text stays
  invisible even though the log reports `ok` everywhere, that is the first
  suspect.
- `ui.widget.WIDGET_DELEGATE` with `resume_call` / `pause_call` — no longer part
  of the 3.0 sample, which does not pause at all. If it fails,
  `[matrix] delegate FAILED` shows up and the timer keeps running.
- Reloading an `IMG_ANIM` via `setProperty(ui.prop.MORE, …)` to chain the flap
  steps.
- `time.getDay()` is assumed to be 1 = Monday … 7 = Sunday.

## Publishing

The process according to
[submitting a watchface](https://docs.zepp.com/docs/distribute/watchface/) and
the [specification](https://docs.zepp.com/docs/watchface/specification/):

1. Sign in at [console.zepp.com](https://console.zepp.com/) with the Zepp
   account.
2. **Create an app** and get a real `appId` from it. It is assigned
   automatically during registration and has to be entered in `app.json`. The
   `appId` in the package **must** match the one given at publishing time.
3. `zeus build` produces the `.zab` package in `dist/`.
4. In the console, upload the package under **Application Services →
   Watchface**. The console works out the supported devices from the package
   itself.
5. Fill in: country, category, works declaration, and name, description and
   preview image per language.
6. **Submit for approval.** Review usually takes 1 to 5 working days. A
   rejection comes with a reason; after that, `Edit` and submit again. Once
   approved, changes go through `Update`.

### Requirements for the preview image

For 480 × 480 the specification asks for a preview image of **324 × 324**. The
build scales `icon.png` down to that itself.

The content is not freely chosen; these sample values are prescribed:

| Value | Required | in the image |
| --- | --- | --- |
| Time | 10:09:36 | yes |
| Heart rate | 86 bpm | yes |
| Steps | 8670 | yes |
| Battery | 75 % | yes |
| Date | February or August | WED 12 AUG |

Generated with `design/shots/active.html?icon=1&preview=1`. Without `preview=1`
the same page shows the everyday values for the README screenshots.

### Open before submitting

* **`appId` is still the number from the template** (20972) and identical in
  both projects. Without separate IDs of their own from the console, green and
  red overwrite each other on the watch, and submission fails the "appId must
  match" check.
* **`vender` is set to `zepp`**, also from the template. That is where the
  developer's own name belongs.
* **Clear the naming rights.** Name and look quote a well-known film series.
  That is a question for the review, not for the code.

## Troubleshooting

Every build step and every callback reports to the log, visible in the output of
`zeus dev`:

```
[matrix] sensors ok
[matrix] background ok
[matrix] rain ok
[matrix] active ok
[matrix] aod ok
[matrix] events ok
[matrix] delegate ok
[matrix] clock ok
```

If something breaks, a `FAILED: <error>` appears instead of `ok` at exactly that
spot. Callbacks only report their first failure so a broken timer does not flood
the log. If the screen stays black and no `[matrix]` line shows up at all, the
module was never loaded — in that case it is the manifest, not the code.
