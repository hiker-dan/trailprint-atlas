# Execution Brief — August 2026

*A working document, not the plan of record. The plan of record is
[STATE_OF_THE_ATLAS.md](STATE_OF_THE_ATLAS.md), which says **what** we are doing and in
what order. This says **how**: the file, the line, the measurement behind the claim, and
the check that proves it landed. It is written so the build can run on a lower Opus
setting without re-deriving any of the analysis below.*

*Everything in the "what was measured" sections was measured in this repo on 31 July 2026,
not assumed. Fold this into the plan of record and delete it when the arc closes.*

---

## How to use this

Work the tasks in the order given (A → B → C → D → E). Inside a task, work the stages in
order. Each stage is sized to be **one visible step**: make it, say what changed and where
to look in the browser, and wait for Danny's OK before the next one. Never batch.

Every stage has an **Acceptance** line. That is the one check to run. Run it once, then
hand over. Do not run exhaustive sweeps (see the standing rule: verify once, then stop).

The measurement harness is written out at the bottom of this file. It needs a local server
(`python3 -m http.server 8899`) and the Playwright that already lives in
`tools/.render-venv`.

---

# TASK A — The film plays smoothly

**Danny's report:** the opening animation is still jittery on some devices, in *both* the
baked-video half and the live-map half. He asked whether capping the top resolution would
help, and asked for simple approaches rather than a matrix of fixes per browser/GPU/display.

He is right about the resolution, and there is a much bigger problem underneath it.

## What was measured

A Chrome run of `index.html` at two window sizes, counting every WebGL draw call and
tagging it by which canvas it went to, sampled over 5 seconds at t ≈ 8.5 s (well inside the
**baked video** half, where the picture on screen is a `<video>` and nothing else):

| window | canvases | draw calls in 5 s | hidden globe's share |
|---|---|---|---|
| 1920 × 1080, dpr 1 | two, each 1920 × 1040 | 830,776 | **625,364 (75%)** |
| 2560 × 1440, dpr 1.5 | two, each **3840 × 2100** | 1,286,326 | **1,002,502 (78%)** |

The `.if-globe` canvas is `visibility: hidden` at that moment
([intro-film.js:1687](../scripts/intro-film.js#L1687)) and the `.if-atlas` canvas is at
`opacity: 0` ([intro-film.js:2338](../scripts/intro-film.js#L2338)).

**So during the video half of the film, essentially 100% of the WebGL work being done is
invisible, and three quarters of it goes to a map nobody can see.**

In plain terms: while the baked video plays, the page is *also* still flying the old live
3D map behind it at full size, drawing a picture that is then thrown away, every frame. The
video is competing for the graphics card against a ghost of the thing it replaced.

Why it survives: `cameraAt()` calls `globe.jumpTo(...)` on every frame with no video-mode
guard ([intro-film.js:1843-1858](../scripts/intro-film.js#L1843-L1858)), and `renderAt()`
calls `setAnfLit()`, `runPens(globe, …)` and `inkHero()` unconditionally
([intro-film.js:2245-2268](../scripts/intro-film.js#L2245-L2268)). `visibility: hidden`
hides a canvas; it does not stop WebGL drawing into it.

A/B, same page, same 8-second window, with the hidden globe's draw calls made free:

| | long frames (>25 ms) | worst frame | dropped video frames |
|---|---|---|---|
| globe drawing (today) | 7 | **125 ms** | 6 of 244 (2%) |
| globe muted | 2 | **25 ms** | **0** |

That is on a fast Mac with nothing else running. On a slower machine, or one pushing a 4K
display, that headroom is exactly what is missing.

Two other facts from the same runs:

- At a 2560 CSS-wide window the page pulled the **2560 video cut** (confirmed:
  `videoWidth: 2560`). On a native 4K desktop it also lands on 2560, because
  `want = Math.max(css, …)` floors the request at the CSS width and the ladder tops out
  there ([intro-film.js:723-727](../scripts/intro-film.js#L723-L727)). Danny's hunch is
  correct: 4K monitors get the 14.8 MB cut.
- Both MapLibre canvases are built at the full device pixel ratio: **3840 × 2100 each**,
  8.1 megapixels, two of them, on a machine emulating a modest 1.5× display. A real Retina
  or 4K screen is worse.

## A1 — Stop driving the hidden globe in video mode  *(the big one)*

**The change.** In video mode (`!LIVE_FLIGHT`), nothing should touch the `globe` map during
playback. Everything it would draw is already baked into the video.

Four call sites:

1. **`cameraAt(q)`** — [intro-film.js:1843](../scripts/intro-film.js#L1843). The two
   `globe.jumpTo(...)` calls and the `globeParked` bookkeeping. Keep the trailing
   `setAtlasView(...)`, which is the *sheet* and is genuinely needed.
2. **`renderAt(q)`** — [intro-film.js:2245-2246](../scripts/intro-film.js#L2245-L2246).
   `setAnfLit(doneCount(SCHED.anf, q, 0))` and `runPens(globe, gPens, SCHED.anf, q, true)`.
3. **`renderAt(q)`** — [intro-film.js:2260 and 2268](../scripts/intro-film.js#L2260).
   Both `inkHero(...)` calls.
4. Anything else that reaches for `globe` inside the frame loop. Grep `globe\.` and check
   each hit is either boot-time or `LIVE_FLIGHT`-only.

**The one trap.** `SCHED` is built at module load by *walking* `cameraAt`
([intro-film.js:2009-2011](../scripts/intro-film.js#L2009-L2011)), and that walk is what
gives the sheet's reveal its gates. Read the walk carefully before gating: in video mode
the flight's half of it is **already** skipped (`if (LIVE_FLIGHT && q < S2)` at
[line 2015](../scripts/intro-film.js#L2015)), and the sheet's half uses
`footIn(atlasMap, …)`, not the globe. So in video mode the walk does not need the globe
either, and the gate can be flat: *in video mode, `cameraAt` never moves the globe.*
Verify that reading before you rely on it.

**Do not** delete the globe's construction, its pens, or its layers in this stage. This
stage is only about not *driving* it, which is small, reversible, and where the whole win
is.

**Acceptance.** Run the harness at 2560 × dpr 1.5. `byCanvas.GLOBE` over a 5-second sample
during the video half should be **~0** (it was 1,002,502). The film must look identical:
compare `?q=0.15`, `?q=0.45`, `?q=0.62` screenshots against the same three taken before the
change. Also check the cutting room still works: `mockups/option-c-3d-cinematic.html?live=1`
must fly exactly as before, because `LIVE_FLIGHT` takes every one of these branches.

## A2 — Retire the globe's WebGL context entirely  *(only after A1 is verified)*

Once nothing drives the globe, in video mode it can be taken down after boot:
`globe.remove()` at the end of the boot sequence, which frees a whole WebGL context and its
tile cache. Guard it: `if (!LIVE_FLIGHT) globe.remove()`.

This is a separate stage on purpose. If anything still reaches for the globe it will throw
rather than quietly waste work, so it must land on top of a verified A1, not with it.

**Acceptance.** Play the film through to the sheet, press Replay, then load with `?q=0.5`
and `?p=…`. No console errors. Chrome's task manager (or `about:gpu`) should show one fewer
WebGL context.

## A3 — ~~Cap the film at the 1920 cut~~ — **DROPPED by Danny, 31 July**

After A1 landed, Danny watched the film on his own 4K monitor and reported the video half
"so much smoother," explicitly saying he no longer thinks the resolution needs cutting.
So **4K screens keep the 2560 cut**, and the width rule below is left exactly as it is.

Removing the invisible 3D map was enough on its own. Do not re-open this unless a future
report is specifically about the *video* half; the remaining work is all on the live map.

*Original analysis kept below, because it is still correct if the trade ever needs revisiting.*

## ~~A3 (original text)~~ — Cap the film at the 1920 cut

**The change.** [intro-film.js:723-727](../scripts/intro-film.js#L723-L727). Today:

```js
const want = Math.max(css, Math.min(1920, css * (window.devicePixelRatio || 1)));
```

The `Math.max(css, …)` is what defeats the 1920 intent: a window wider than 1920 CSS pixels
asks for at least its own width, so a 4K desktop lands on the 2560 rung. Change to:

```js
const want = Math.min(1920, Math.max(css, css * (window.devicePixelRatio || 1)));
```

Now every screen tops out at 1920. A 1280-wide Retina laptop still gets 1920 (it has 2560
device pixels); a 1024-wide window still gets 1280.

**The trade, stated plainly.** On a 4K monitor the film is now upscaled from 1920 to 3840.
That sounds bad and is not: the shot is a hazy, motion-blurred aerial flight wearing a
vignette and a parchment wash, which is the least detail-critical thing a screen can be
asked to show. Against it: 8 MB less to download (14.8 → 9.4 MB) and 44% fewer pixels to
decode, thirty times a second. A film that plays smoothly beats a sharper one that judders.

**Do not delete the 2560 rung.** Leave `INTRO_WIDTHS` and `tools/upload-intro.py` alone so
the derived file stays cached at Cloudinary and `?vid=2560` still fetches it for
comparison. This change must stay a one-line revert.

**Acceptance.** Load at a 2560+ window and confirm `document.querySelector('#hero-film
video').videoWidth === 1920`. Then look at it: at a 4K window, does the upscale read as
soft? If Danny says yes, the revert is one line and A1/A4/A5 still stand on their own.

## A4 — ✅ **DONE, 31 July.** The sheet's pixel budget, and three dead ends worth not repeating

Danny's follow-up after A1: the video half is smooth on 4K now, but the **live map's
pull-back is still choppy on a FIRST watch and much smoother on Replay**, with "a couple of
frame flickers" even then.

**Dead end 1 — the tile cache.** The obvious theory: the sheet crosses six zoom levels in
one move, MapLibre's viewport-derived cache evicts the early ones, and every re-shown tile
is re-decoded mid-zoom, which would explain Replay being smoother. Tried
`maxTileCacheSize: 900` (the warm list is 705). It changed the re-requests during the
pull-back **not at all** (390 → 383) and made Replay measurably **worse**: long frames
4 → 14, worst frame 83 ms → 224 ms, presumably from holding ~200 MB of raster textures.
Reverted. The note now sits in the code beside the globe's matching one.

**Dead end 2 — the network.** Also wrong, and this one is genuinely good news. Measured
with a cold cache at 50, 12 and **5 Mbps**: the warm completes in full every time
(`705 / 705` before the cut) and the tiles the sheet asks for mid-zoom come back in
**2–4 ms median**. The bytes are always there. The cost is *drawing* them, not fetching them.

**Dead end 3 — capping the pixel RATIO.** Two traps, both hit:
1. `pixelRatio` as a **constructor option is silently ignored** by MapLibre 5.6.1. The
   canvas came back 3840 × 2100, exactly as before. It is `map.setPixelRatio()`, a runtime
   call. This is the kind of change that looks landed and does nothing.
2. Even done correctly, `Math.min(devicePixelRatio, 1.5)` **does nothing on a native 4K
   monitor**, because such a display already reports `devicePixelRatio: 1` while building
   an 8.3-megapixel canvas. The one display that needed it most was the one it missed.

**What actually shipped: a pixel COUNT budget, and only while the sheet is moving.**
`setSheetDetail(full)` converts a 2560-pixel width budget back into a ratio through the CSS
width. `run()` drops to the budget, `land()` restores full resolution 900 ms later, on a
picture that has stopped moving and can afford it. The cutting room and the offline renderer
are exempt (`LIVE_FLIGHT`), since they exist to judge the picture.

Measured, sheet canvas during the pull-back → at rest:

| display | before | during film | at rest |
|---|---|---|---|
| native 4K (3840 css, dpr 1) | 3840 × 2160 | **2560 × 1413** | 3840 × 2120 |
| Retina (1920 css, dpr 2) | 3840 × 2160 | **2560 × 1386** | 3840 × 2080 |
| laptop (1440 css, dpr 1) | 1440 × 860 | 1440 × 860 | 1440 × 860 |

56% fewer pixels to shade during the one moment it matters, full sharpness the rest of the
time, and no change at all below the budget.

**Also shipped:** the sheet's relief `raster-fade-duration` 450 → 250, matching the flight's
own setting. A 450 ms crossfade during an uninterrupted six-level zoom means two raster
levels are dissolved through each other for most of the film, which is both a full-screen
blend to pay for and the likeliest source of the "couple of frame flickers."

*Original plan text below, superseded.*

## ~~A4 (original)~~ — Cap MapLibre's pixel ratio on both maps

**The change.** Both `new maplibregl.Map({…})` calls take a `pixelRatio`:
[intro-film.js:505](../scripts/intro-film.js#L505) (`atlasMap`) and
[intro-film.js:809](../scripts/intro-film.js#L809) (`globe`). Add to each:

```js
pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
```

**Why 1.5 and not 1.** The sheet carries hairline state borders and 2px trail strokes. At
dpr 1 on a Retina screen those visibly alias. At 1.5 they stay clean, and a 2× display
still drops 44% of its fragment work. This is the single biggest lever for the **live half**
on the exact hardware Danny is describing.

**Why it is safe.** `SCHED`'s framing gate reads `getCanvas().clientWidth/clientHeight`
([intro-film.js:1979-1982](../scripts/intro-film.js#L1979-L1982)), which are **CSS** pixels
and are unaffected by `pixelRatio`. Nothing else in the file reads canvas backing-store
size.

**Acceptance.** At 2560 × dpr 1.5, the harness should report canvases of **3840 → 2560**
wide. Screenshot the landed sheet (`?q=1`) before and after at 2× density and look at the
trail strokes and the state borders. If they soften, try 2.0 before giving up on the idea.

## A5 — Stop rewriting every pen's gradient on every frame

**The problem.** `runPens()` ([intro-film.js:2166](../scripts/intro-film.js#L2166)) calls
`map.setPaintProperty(lid, 'line-gradient', grad(…))` for every active pen on **every**
animation frame. Each of those forces MapLibre to re-evaluate the expression and rebuild a
gradient texture. There are 10 pens; on the flight each wears 3 layers. At a 120 Hz display
that is up to 3,600 gradient rebuilds a second, on the main thread.

A single stroke lasts about 0.7 s. Advancing its tip in 30 ms steps instead of 8 ms steps
is a 4% quantisation of a moving pen tip, which is not visible.

**The change.** In `penDraw`, skip the write when neither the progress nor the colour has
meaningfully changed: keep the last written `p` on the pen object and return early unless
`p` has moved more than ~1/64 of the stroke **or** ~28 ms have passed. Keep `penHold`'s
existing "only when the trail changes" rule exactly as it is.

**What NOT to throttle.** `setAtlasView` must stay at full frame rate. The sheet's pull-back
is one continuous zoom, and stepping the camera would be immediately visible. Same for the
cloud puffs.

**Acceptance.** Watch the live half at `?q=0.85` through to the end and confirm the strokes
still read as drawn rather than stepped. Then re-run the harness and compare `long(>25ms)`
frame counts during the live half.

## A6 — Let the film tune itself down, rather than guessing at the device

This is the answer to Danny's actual question: *instead of mapping a solution for every
possible environment, is there a simple approach that effectively solves it?*

The file already has the right idea and applies it to one thing only.
`noteStruggle()`/`introDemotion()`
([intro-film.js:690-698](../scripts/intro-film.js#L690-L698)) watch what actually happened,
write one number to `localStorage`, and start a rung lower next visit, because "a machine
does not get faster between visits." That is honest, it needs no device detection, and it
already works.

Two extensions, both small:

1. **Make the demotion cover the live half too, not just the video width.** When
   `introDemotion() > 0`, also drop `pixelRatio` to 1 and skip the parchment wash's
   `mix-blend-mode` (A7). Same key, same rule, no new machinery.
2. **Let it help the *first* visit as well.** `land()` only learns after the film is over,
   which is too late for the visit that suffered. Instead, sample the first ~2 seconds of
   playback: if `getVideoPlaybackQuality().droppedVideoFrames` is already over ~5%, drop
   the live half's `pixelRatio` to 1 for the rest of the run, and call `noteStruggle()`
   immediately. It costs one check, it is self-correcting, and it works on hardware nobody
   has ever tested on.

**Deliberately NOT done, so nobody tries it later:** capping the film's own animation frame
rate to 60. On a 120 Hz Mac that would make the camera step visibly, which trades a smooth
picture for a stuttery one. The right answer is to make each frame cheap (A1, A4, A5), not
to draw fewer of them.

## A7 — The full-screen blend during a continuous zoom  *(last, and it has a visual risk)*

The sheet wears a full-screen `mix-blend-mode: multiply` wash
([intro-film.js:540-542](../scripts/intro-film.js#L540-L542)), live for the whole live half,
which is one uninterrupted zoom. `map.js` already learned that a full-screen multiply is
expensive during a zoom and drops it for the ~250 ms of one (`.is-zooming`, the July
efficiency diet). Here the zoom never pauses, so it cannot simply be dropped.

Two options, cheapest first:

1. **Move the tint inside the map's own shader.** The relief raster layer already accepts
   `raster-saturation` and `raster-brightness-min/max`
   ([intro-film.js:522-523](../scripts/intro-film.js#L522-L523)). Tinting there costs
   nothing extra, because the map is already shading those pixels. The parchment
   `background` layer can carry the rest.
2. If the colour cannot be matched that way, replace the `multiply` with a flat
   `rgba()` overlay tuned by eye to the same result. Plain alpha compositing is much
   cheaper than a blend mode.

Also worth one experiment: the relief layer's `raster-fade-duration: 450`. During a
continuous zoom that holds two raster levels crossfading for most of the pull-back. The
flight's own reasoning settled on 250 for exactly this
([intro-film.js:877-888](../scripts/intro-film.js#L877-L888)); try 250 here and compare.

**This stage changes how the film looks**, so it goes last and it needs a before/after
screenshot pair at `?q=0.9` and `?q=1` put side by side for Danny. If the parchment shifts
at all, stop and revert. The wash is the sheet's whole character.

---

# TASK B — The Hike Almanac tells the truth about time on the trail

**Danny's report:** "On the trail" times look right for AllTrails-era hikes and wildly wrong
for the ones tracked with onX Backcountry (the Alaska trip, Strawberry Peak). Is the data
bad, or is the parsing bad?

## What was measured — the answer is the data, and it is not recoverable from the file

Every GPX in `data/trails/` was parsed and compared. Six use onX; the rest are AllTrails.

| | median gap between points | median distance between points | 95th-percentile implied speed |
|---|---|---|---|
| AllTrails (4 sampled) | 3.0 s | **3.5 – 3.7 m** | **3.3 – 4.1 mph** |
| onX (all 6) | 3.0 – 5.0 s | **5.3 – 7.8 m** | **8.3 – 19.7 mph** |

Both apps write a point roughly every 3 seconds. The difference is how far apart the points
are. AllTrails' spacing says 2.7 mph, which is a person walking. onX's says 5.8 mph and
tops out near 20, which is a person in a car.

In plain terms: **onX's export thins the recording out, then re-stamps the surviving points
at a made-up 3-second rhythm.** The shape of the walk survives, the clock does not. The
file's total elapsed time ends up proportional to how many points it kept, not to how long
Danny was actually out. The **start** time is real; everything after it is compressed.

The six affected hikes:

| hike | GPX claims | miles | implied pace |
|---|---|---|---|
| tta_123 Strawberry Peak | 1 h 08 m | 7.2 | 6.3 mph |
| tta_117 Savage Alpine | 1 h 17 m | 6.3 | 4.9 mph |
| tta_114 Williwaw Nature Trail | 0 h 30 m | 2.4 | 4.8 mph |
| tta_116 McKinley Station | 1 h 48 m | 7.7 | 4.3 mph |
| tta_119 Mile 43: East Fork River | 1 h 33 m | 5.7 | 3.7 mph |
| tta_120 Mile 32: Igloo Creek | 1 h 38 m | 2.7 | 1.6 mph |

Nothing in the parsing is wrong. `renderOnTrailCard`
([hike-detail.js:197](../scripts/hike-detail.js#L197)) reads the first and last `<time>` and
converts UTC to the trail's wall clock correctly. It is faithfully reporting a bad clock.

## The evidence that fixes it: the photos

Every intake photo carries **`GPSDateStamp` + `GPSTimeStamp`**, which is a UTC reading taken
from the GPS satellites, plus a GPS position. That is a hardware clock, immune to time
zones, and it is exactly what `recorded_times` wants.

Checked on tta_123 (Strawberry Peak): the GPX claims 1 h 08 m, and the photographs alone
span **3 h 26 m** (15:41:25 → 19:07:15 UTC). The GPX's start time, 15:34:51 UTC, is 7
minutes before the first photo, which is a trailhead start. So the start is real and the
end is fiction, exactly as the pace analysis predicted.

**One trap that would silently ruin this.** The phone's `OffsetTimeOriginal` reads
**−07:00 even in Alaska**, so the *local* EXIF times on the Alaska hikes are an hour wrong.
Only the **GPS UTC** stamps can be trusted. Any tool written here must read
`GPSDateStamp`/`GPSTimeStamp` and must ignore `DateTimeOriginal`.

**A second trap.** Not every photo was taken on the trail. Snapping each photo to the
nearest recorded track point, the worst misses are **11.6 km** (tta_120) and **15.4 km**
(tta_119) — those are bus-window and camp photographs. A naive "first photo to last photo"
bracket gives tta_119 a 9-hour hike. Photos further than ~150 m from the track must be
discarded.

## B1 — The guard in the page  *(do this first; it is small and it is permanent)*

**The change.** In `renderOnTrailCard`
([hike-detail.js:197-205](../scripts/hike-detail.js#L197-L205)), beside the existing
16-hour sanity check, add a **pace** check. If the hike's `miles` divided by the GPX's
implied duration exceeds a walking ceiling, show no clock at all.

**The ceiling is 4.0 mph.** Across all 123 records the fastest genuine average is 2.9 mph
(the Zion Narrows Riverside Walk, which is flat and short). 4.0 leaves real headroom and
rejects five of the six onX files outright.

Two rules that matter:

- Apply the guard **only to a GPX-derived clock, never to `recorded_times`**. A
  hand-verified window is the truth by definition and must always win.
- tta_120 (1.6 mph) will pass the guard and keep showing a wrong time. That is fine and
  expected: the guard's job is to stop obvious nonsense, and B2 is what fixes the rest.

Comment it with the reason: **no clock is better than a wrong clock**, and this protects
the Atlas from any future export, from any app, that does the same thing.

**Acceptance.** Open `hike.html?id=tta_123` and `?id=tta_117`: no "On the trail" row.
Open `?id=tta_88` (which has `recorded_times`) and any AllTrails hike with a clock, e.g.
`?id=tta_45`: both still show their row unchanged.

## B2 — `tools/recover-times.py`, and six hand-checked records

**The tool.** A new local-only Python tool, in the house style (stdlib plus Pillow, which is
already in `tools/.render-venv`). For a given `tta_NN`:

1. Read every photo in `intake/processed-tta_NN/`, taking **GPS UTC** and GPS position.
2. Snap each photo to the nearest point of the hike's GPX; **discard anything beyond 150 m**.
3. Start = the GPX's own first timestamp (measured: 6–43 minutes before the first photo,
   which is what a trailhead start looks like).
4. End = the last on-track photo, plus the remaining track distance divided by the pace the
   photos themselves imply.
5. **Print the evidence and propose. Never write.** Show the photo times, how far along the
   track each one sits, the implied pace, and the proposed window. Danny confirms against
   his own memory of the day, then the record is edited by hand.

`recorded_times` already exists in the schema, is already read by the almanac, and already
wins over the GPX ([hike-detail.js:179-182](../scripts/hike-detail.js#L179-L182)). This is
the `tta_88` precedent, applied five more times.

**Do not rewrite the GPX files.** `data/trails/*.gpx` is the archival record of what the app
actually exported. Fixing the record is a data question, not a forgery.

**A first pass, for Danny to sanity-check against his memory:**

| hike | GPX claims | on-track photo bracket | first estimate |
|---|---|---|---|
| tta_123 Strawberry Peak | 1 h 08 m | 3 h 26 m | ~3 h 35 m (2.0 mph) |
| tta_116 McKinley Station | 1 h 48 m | 3 h 21 m | ~3 h 35 m (2.1 mph) |
| tta_114 Williwaw | 0 h 30 m | 0 h 21 m | ~1 h 15 m (1.9 mph) |
| tta_117 Savage Alpine | 1 h 17 m | 5 h 53 m | ~6 h 30 m (1.0 mph) — **ask Danny**, this is slow even for an alpine traverse |
| tta_119 Mile 43 East Fork | 1 h 33 m | contaminated by off-track photos | re-run with the 150 m filter |
| tta_120 Mile 32 Igloo Creek | 1 h 38 m | contaminated by off-track photos | re-run with the 150 m filter |

## B3 — Teach `new-hike.py` so it cannot happen again silently

At entry time, `tools/new-hike.py` should compute the GPX's implied pace and, if it exceeds
the 4.0 mph ceiling, say so in plain words: *"this track's timestamps imply 6.3 mph, which
is not a walking pace — the recording app has probably re-stamped the points."* Then offer
to derive `recorded_times` from the intake photos on the spot, using B2's machinery.

Also detect `creator="onXmaps…"` in the GPX and name it, so the source is visible in the log.

## B4 — The bonus, and it is Danny's call, not a side effect

**35 hikes have GPX files with no `<time>` at all** and therefore no "On the trail" row.
The same photo-EXIF machinery could give every one of them a real, evidence-backed window.
That is a nice gain, but it touches 35 records, so **ask before doing it**. It is not part
of fixing the bug.

---

# TASK C — The Hike Almanac arrives without a jolt

**Danny's report:** the almanac takes several seconds, so the page lands without it and then
it pops in 5–10 seconds later. He wants either a blank card from first paint that fills in
smoothly, or the whole card arriving smoothly when ready.

## What is actually happening

`#almanac-section` is `display:none` in the markup ([hike.html:138](../hike.html#L138)) and
flipped to `block` after the Open-Meteo call returns
([hike-detail.js:174](../scripts/hike-detail.js#L174)). It sits in the right-hand paperwork
column **above** Trail Notes, the flora and fauna slips, and the Logbook.

So it is not a fade-in problem. It is a **layout shift**: a card that occupied zero height
suddenly occupies about 150 px and shoves four cards down the page.

And it happens **twice**. The weather arrives and the card appears; then `#ontrail-card`
([hike.html:149](../hike.html#L149)) waits on the GPX and appears *inside* it, pushing
everything down a second time.

## C1 — Reserve the box from first paint

Render the almanac immediately, at its final size, as a **ruled but unwritten ledger**:
labels present, values drawn as engraved rules. Zero layout shift, because nothing moves.

This is the Light Table's own paper language, and it does not contradict the standing
no-placeholder rule in `config.js`. That rule governs the **lightbox photo flip**, and
CLAUDE.md already records the same distinction for the slides' "developing" sheen.

## C2 — Ink the values in

A short opacity transition on the **value spans only**, never on the box. The card does not
appear; what is written on it does.

## C3 — Settle the "On the trail" row before revealing anything

Await both the weather and `trackPromise`, then write everything in one frame, so there is
one arrival rather than two. The GPX is a local file and resolves quickly; the weather is
the long pole.

For a hike that turns out to have no clock (35 of them, plus the ones B1 now rejects), the
row must never have been reserved. Decide it from the resolved track, not optimistically.

## C4 — Remove the wait entirely: bake the almanac  *(the real fix)*

Historical weather for a date in the past **never changes**. It is exactly the kind of thing
this codebase already bakes: `trails.geojson`, `elevations.json`, `ground-elevations.json`,
`countries.json`, `intro-film.json`.

**`tools/build-almanac.py` → `data/almanac.json`.** One row per hike: sunrise, sunset, the
day's apex temperature, the three weather codes the card shows, and `utc_offset_seconds`.
123 rows is roughly 15 KB. The page reads it with the same cached fetch pattern as
`hikes.json` and renders **instantly, on first paint, with no network call**.

Keep the live Open-Meteo call as the fallback for a hike not yet in the bake, so a
freshly-entered hike still works before the tool is re-run. Wire the tool into the hike-entry
ritual the way `build-trails.py` is.

This also removes a per-visitor dependency on a third-party API, which is a real robustness
win and matches the project's stated architecture.

**Acceptance.** Load `hike.html?id=tta_45` with the network throttled to Slow 3G. The
almanac must be present and complete in the first paint, and nothing below it may move.
Then load a hike deliberately absent from `almanac.json` and confirm the live fallback still
fills it in without a jolt (C1–C3 cover that case).

---

# TASK D — The home page joins the rest of the Atlas

**Danny's report, and he is exactly right:** the hike, trip and crew pages feel like one
cohesive design language; the home page after the film "feels like elements just splashed on
the page one by one," blocks separated by different coloured backgrounds, "remnants of the
old site." He wants a real visual redo that keeps the film's wow factor and the page's
distinctness, without losing anything.

He also asked, separately, for the page to use the horizontal space on a large monitor
instead of leaving big empty columns, **growing sideways without growing tall and without
ever clipping anything**. Those are the same job and must be done together. Retrofitting
fluid widths onto a layout that is about to be replaced would be wasted work.

## What is actually wrong, stated precisely

**1. The page is four stacked bands, each a different cream.**

| section | background |
|---|---|
| Odometer | `#efe7d5 → #e6dabd` |
| Threads of the Trail | `#ece7dc → #e7e1d2` |
| The Observatory | `#f4f1e8 → #efe9dc` |
| The Record Books | `#ece3ce → #e4d8bd` |

Four near-identical gradients whose only job is to say "new section." No other page in the
Atlas does this.

**2. Each band repeats the identical formula:** a green uppercase eyebrow, a 3.2 em display
title, a centred lede, then content. Four times. That eyebrow/title/lede rhythm over
alternating bands is a marketing landing page, and it is the last of the old skin.

**3. `.obs-panel` is literally the thing the July audit condemned.**
[observatory.css:19-28](../styles/observatory.css#L19-L28):

```css
background: #fffdf6; border-radius: 16px; box-shadow: 0 3px 14px rgba(60,50,30,0.07);
```

"White rounded cards with drop shadows on a near-white page" was the audit's exact phrase
for what was wrong with `trip.html` and `crew.html`. Those two were rebuilt. The home page
kept it.

**4. Meanwhile every other page speaks one language:** parchment `#f4ecd8`, card `#fffdf6`
with a **hard** edge, rule `#d8ccae`, ink `#24401f`, muted `#9a927c`, brass `#a5854a`;
**engraved collars** (display face at 8 px, 0.26 em tracking, uppercase, muted, over a heavy
rule); **ruled vitals bands** (flex cells divided by hairlines, big display numerals under
tiny engraved labels); `.atlas-door` for every crossing; hatching, cut bands, scale bars.

**5. The widths are hard-capped.** `max-width: 1080px` (odometer) and `1120px` (the other
three). On a 3840 px monitor that leaves about 1,360 px of empty parchment on each side.

## D1 — Concepts, then mockups, then Danny picks  *(follow the house ritual)*

Per the project's own note, concept sketching and mockup-building run on **Fable 5** — the
divergent stage is where the capability edge shows.

**The framing question to answer first:** what *is* the home page, in a bound atlas? The
three scales of place are taken (the land, the chapter, the day) and the people page is
taken. The home page is **the volume itself, and specifically its front matter.** A real
atlas opens with a frontispiece, a title page, a statistical abstract, an index map, and
then the plates. The film is already the frontispiece. Everything below it should read as
the front matter of the same book.

Three concepts to mock up:

1. **THE FRONT MATTER** *(recommended)*. One continuous parchment desk from the film to the
   footer. No band changes at all. Sections divided by engraved collars and **plate
   numbers** (PLATE I · THE ABSTRACT, PLATE II · THREADS OF THE TRAIL, …) over hairline
   rules, the way the trip sheet and the map deck already divide their content. The
   Odometer becomes the **statistical abstract**, set as a ruled vitals band in the
   `.ms-vitals` idiom, with the reels kept because they are genuinely good. Lowest risk,
   highest fidelity to the rest of the Atlas, and it directly answers "blocks separated by
   different colour backgrounds."
2. **THE OPEN VOLUME.** The crew book's device applied to the whole page: the Atlas lying
   open, scrolling turns leaves. Biggest wow, biggest risk, and it fights scrolling.
3. **THE SURVEY DESK.** The hike page's Light Table at whole-Atlas scale: one desk seen from
   above, each section a sheet laid on it, slightly rotated and overlapping, with
   instruments and slides between them. Strong personality, risks clutter across five
   panels.

**Written into all three briefs:** the film keeps its wow and its distinctness. The hero is
the one thing that does not change. What changes is that the page below it stops looking
like a different website.

**Mockups stay local** (not committed), per the standing rule.

## D2 — The fluid-width rules, designed in from the start

Four rules, in order of importance. These are the answer to "grow sideways, not down, and
never clip."

**R1 — Text keeps a measure; panels take the page.** Ledes and blurbs stay at 620–640 px.
That is correct typography and must not change; prose that stretches to 2,400 px is
unreadable. What grows is the **page measure** that the panels fill: something like
`min(94vw, 2000px)`, tuned in the mockup.

**R2 — A wide chart gains PLOT AREA, never HEIGHT.** This is the crux of Danny's worry and
it has an exact answer.

The Effort Field is `viewBox="0 0 920 440"` at `width: 100%`
([observatory.js:96-102](../scripts/observatory.js#L96-L102)). Its aspect ratio is locked at
2.09, so at 2,400 px wide it becomes **1,148 px tall** and gets clipped. Exactly what Danny
predicted.

The fix is to stop **scaling** and start **re-drawing**: measure the container's real pixel
width `W`, then emit `viewBox="0 0 W 440"` with `width: 100%; height: 440px`. The scale is
then exactly 1:1 in both axes, so dots stay the same size and labels stay the same size, and
the plot simply gets **wider**. Re-draw on resize, debounced.

Same treatment for:
- **The True Ascents**, `1060 × 470` ([observatory.js:192-197](../scripts/observatory.js#L192-L197)) — more room per peak.
- **The Threads field sheet** ([threads.js:44](../scripts/threads.js#L44)) — a wider quadrangle, which is what a real field sheet is.

**R3 — A square element must NOT grow; it must PAIR.** The Cadence year-wheel is `620 × 560`
([observatory.js:473-479](../scripts/observatory.js#L473-L479)). A 2,400 px wheel is absurd.
So square panels get a hard max width, and past a breakpoint the layout puts **two panels
side by side** instead of one enormous one. That is what a real atlas does with a big sheet:
more per plate, not bigger.

Concretely:

| panel | natural shape | wide-screen behaviour |
|---|---|---|
| The Effort Field | wide (2.09) | spans the measure, re-drawn wider, **fixed height** |
| The True Ascents | wide (2.26) | spans the measure, re-drawn wider, **fixed height** |
| Threads field sheet | wide | spans the measure, re-drawn wider |
| Territories | fluid grid already | **free win** — more tiles per row means it gets *shorter* |
| The Cadence | square (1.1) | capped, **pairs** with a neighbour above ~1500 px |
| The Specimen Drawer | cabinet + photo | capped, pairs with The Cadence |
| Record crowns | `auto-fit minmax(220px)` capped at 940 | uncap; four across becomes comfortable |
| The Expedition podium | 3 columns capped at 840 | grows moderately, stays capped |
| The Odometer | 4-column grid capped at 1080 | becomes the ruled vitals band; grows with the measure |

**R4 — Nothing is ever clipped, and we assert it.** Every fluid element gets a written
height contract, either a fixed pixel height or an explicit aspect cap. The acceptance check
is a headless screenshot sweep at **1280 / 1600 / 1920 / 2560 / 3440 / 3840**, confirming no
element exceeds its box and no horizontal scrollbar appears. Reuse the harness at the bottom
of this file.

## D3 — The Triangulation Network lands here

This is the one piece of the crew arc still owed. The plan of record already says it belongs
in the Observatory, because that section is the Atlas's data room. Build it as a sixth
Observatory panel **during** this task, not as a separate errand later.
`mockups/crew-network.html` is the reference. It is a square-ish element, so it pairs under
R3.

## D4 — Build order, once Danny has picked a concept

Stage it so each step is visible and reversible:

1. **The surface.** One continuous background; retire the four band gradients. Nothing else
   moves. This alone will change how the page reads, and it is worth showing on its own.
2. **The section headers.** Collars and plate numbers replace the eyebrow/title/lede
   formula. Keep the ledes; re-set them.
3. **The panels.** `.obs-panel` sheds the rounded corners and drop shadow for a collar and a
   hard edge. This is the largest single visual change.
4. **The Odometer** becomes the statistical abstract.
5. **The Record Books** cards become mounted plates, in the language of the hike page's 35 mm
   slides or the trip page's `.ms-print` mount.
6. **The fluid width** (D2), all four rules at once, because they interlock.
7. **The Triangulation Network** (D3).

## D5 — What must NOT change

- The hero film, in any respect. It is the wow, and Task A is already touching its internals.
- Anything the sections *say*. This is a visual redo, not a content edit. The milestone
  logic, the stats, the records, the biome picks all stay exactly as they are.
- `styles/base.css`'s `.atlas-door`. If the home page grows doors, it uses that component
  as-is.

---

# TASK E — Trail Crew refinement

Danny said he implemented the Trail Crew redesign but "definitely wanted to refine" it and
never got to it, because the intro film took over.

**This task needs his list before it can be planned.** Ask for it at the point the task
comes up, one question, plainly: *what specifically about the Muster Roll and the Service
Record still bothers you?*

The one item already known and already recorded is the **Triangulation Network**, and that
is absorbed into Task D, not done here.

---

# The order, and why

1. **Task A — the film.** First, because it is the first thing every visitor sees, it is a
   pure defect with measured evidence and no design risk, and the fixes are small and
   independently verifiable.
2. **Tasks B and C — the almanac.** Both live on the hike page and can share a session. B is
   a correctness bug on six records; C is a polish bug on all of them.
3. **Task D — the home page.** The big one, and the centrepiece. It absorbs the wide-screen
   work and the owed Triangulation Network.
4. **Task E — crew refinement.** Needs Danny's list, so it goes where the answer arrives.
5. **Then the standing roadmap resumes:** Park Badges → Gear bones → Geography deep-dive →
   The Sweep. Deferred by choice: the Voice (`notes`, The Overlook) and the mobile pass.

Defects before features. Small before large. Nothing is blocked behind anything else.

---

# The measurement harness

Needs a local server and the Playwright already installed in `tools/.render-venv`.

```bash
python3 -m http.server 8899          # from the repo root
tools/.render-venv/bin/python measure.py
```

```python
# measure.py — counts WebGL draw calls per canvas during the film,
# and reports dropped video frames and long animation frames.
from playwright.sync_api import sync_playwright
import json, time

INSTR = """
  window.__M = {draws:0, frames:0, longFrames:0, worst:0, byCanvas:{}};
  const P2 = window.WebGL2RenderingContext && WebGL2RenderingContext.prototype;
  for (const P of [WebGLRenderingContext.prototype, P2].filter(Boolean))
    for (const fn of ['drawElements','drawArrays']) {
      const o = P[fn];
      P[fn] = function(){
        window.__M.draws++;
        const id = (this.canvas && this.canvas.__tag) || 'untagged';
        window.__M.byCanvas[id] = (window.__M.byCanvas[id]||0)+1;
        return o.apply(this, arguments);
      };
    }
  let last = performance.now();
  const tick = (now) => { const d = now-last; last = now; window.__M.frames++;
    if (d > 25) window.__M.longFrames++;
    if (d > window.__M.worst) window.__M.worst = Math.round(d);
    requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
"""
TAG = """() => { document.querySelectorAll('#hero-film canvas').forEach(c => {
    const h = c.closest('.if-map');
    c.__tag = h ? (h.classList.contains('if-globe') ? 'GLOBE' : 'ATLAS') : 'other'; });
  return [...document.querySelectorAll('#hero-film canvas')]
    .map(c => ({tag:c.__tag, w:c.width, h:c.height})); }"""

with sync_playwright() as pw:
    for vw, vh, dpr in [(1920,1080,1), (2560,1440,1.5)]:
        b = pw.chromium.launch(channel="chrome")
        pg = b.new_page(viewport={"width":vw,"height":vh}, device_scale_factor=dpr)
        pg.add_init_script(INSTR)
        pg.goto("http://localhost:8899/index.html", wait_until="domcontentloaded")
        pg.wait_for_timeout(2000)
        print(f"\n== {vw}x{vh} dpr{dpr} ==")
        print(" canvases:", json.dumps(pg.evaluate(TAG)))
        pg.wait_for_timeout(6000)                      # settle inside the video half
        pg.evaluate("() => Object.assign(window.__M,{draws:0,frames:0,longFrames:0,worst:0,byCanvas:{}})")
        t = time.time(); pg.wait_for_timeout(5000); el = time.time() - t
        m = pg.evaluate("() => window.__M")
        print(f" {el:.1f}s: frames={m['frames']} long>25ms={m['longFrames']} "
              f"worst={m['worst']}ms draws={m['draws']}")
        print(" by canvas:", m['byCanvas'])
        print(" video:", pg.evaluate("""() => { const v=document.querySelector('#hero-film video');
              const q=v.getVideoPlaybackQuality();
              return {w:v.videoWidth, dropped:q.droppedVideoFrames, total:q.totalVideoFrames}; }"""))
        b.close()
```

**Baseline, 31 July 2026, before any of Task A:**

```
== 1920x1080 dpr1 ==
 canvases: [ATLAS 1920x1040, GLOBE 1920x1040]
 5.0s: frames=577 draws=830776
 by canvas: {GLOBE: 625364, ATLAS: 205412}
 video: {w: 1920, dropped: 0}

== 2560x1440 dpr1.5 ==
 canvases: [ATLAS 3840x2100, GLOBE 3840x2100]
 5.0s: frames=584 draws=1286326
 by canvas: {GLOBE: 1002502, ATLAS: 283824}
 video: {w: 2560, dropped: 0}
```

For the wide-screen sweep in D2/R4, the same harness with viewports of 1280 / 1600 / 1920 /
2560 / 3440 / 3840, checking `document.documentElement.scrollWidth <=
document.documentElement.clientWidth` and screenshotting each section.

---

*Written 31 July 2026, from measurements taken in this repository against a live browser.
Delete this file once Tasks A–E have landed and the plan of record has absorbed them.*
