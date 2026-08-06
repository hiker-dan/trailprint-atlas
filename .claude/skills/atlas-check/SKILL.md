---
name: atlas-check
description: Verify a change to the Atlas in a real browser — console errors across pages, wide-screen width sweeps, clipping assertions, tile-request counts, and the film's WebGL/dropped-frame instrumentation. Use when a change needs checking that Danny cannot see cheaply in one refresh. Also use for "check the pages", "sweep the widths", "any console errors", "measure the film", "count tile requests".
---

# Checking the Atlas in a browser

## First: is this check even wanted?

**Danny reviews visual work himself, in Live Server, in one refresh.** That is his standing
call (1 Aug 2026) and it is not laziness on our part — it is faster and he is better at it.

Do **not** run this harness to prove a fix he can see. No screenshot of a nudged margin, no
before/after of a colour, no "confirming the button moved."

Run it only for what a human cannot see cheaply:

| Worth checking | Not worth checking |
|---|---|
| Console errors across every page at once | "Does the new panel look right" |
| Horizontal overflow at 6 viewport widths | A spacing or colour tweak |
| An element clipped out of its container | Whether text wrapped nicely |
| Data counts (123 hikes rendered, 0 clipped) | Anything on one page he already has open |
| Tile requests / network payload | |
| Dropped video frames, long animation frames | |

And when you do run it: **once**, then hand over. No exhaustive re-sweeps.

## The server

Every page fetches local `.json` and `.gpx`, which fails from `file://`. Serve first, from the
repo root:

```bash
python3 -m http.server 8931
```

Use a port that is not 5500 — that is Danny's Live Server, and taking it fights his own window.

## Two harnesses, and when to use which

**The browser MCP (`chrome-devtools`)** is the default. It drives a real Chrome on the real GPU,
so its frame timings are honest. Use it for console errors, screenshots, width sweeps, DOM
assertions, network requests, and performance traces. `navigate_page` accepts an `initScript`,
which runs before any page script — that is what makes the WebGL instrumentation below possible
without the Python harness at all.

**The Python/Playwright harness** (`tools/.render-venv/bin/python`, launched with
`channel="chrome"`) is the fallback, and still the right tool for a scripted sweep across many
viewports in one run. If screenshots hang at wide viewports, add `--disable-gpu`; that is
SwiftShader starving `requestAnimationFrame`, not a page bug — **and frame rates measured that
way are meaningless**, so never report them.

## The page inventory

A full console sweep means all of these, not just the one that changed:

```
/index.html                          the volume + the film
/map.html                            the land        (?state=CA, ?country=Canada, ?trip=<tag>)
/hike.html?id=tta_47                 the day
/trip.html?tag=<trip_tag>            the chapter
/echoes.html                         the present tense
/crew.html                           the muster roll (?open=Will%20R.)
/crew-member.html?name=Will%20R.     the service record
/credits.html                        the overlook
/404.html                            self-contained by design
```

Assert **zero** `error` and zero `warn` messages. The Atlas ran clean on 5 Aug 2026 — a warning
is a regression, not background noise.

## The width sweep

Desktop-first, so sweep **1280 / 1600 / 1920 / 2560 / 3440 / 3840**. Mobile widths are out of
scope by decision; do not add them.

The assertion, at every width and on every page:

```js
document.documentElement.scrollWidth <= document.documentElement.clientWidth
```

A failure means something exceeded its box and a horizontal scrollbar appeared. The usual
culprit in this codebase is **a padded element given `width: 100%`** — there is no global
`box-sizing: border-box` here, so the padding is added *outside* the declared width. `flex`
already fills its container; that is the fix, not a width.

Also watch for clipping, which does not trip the overflow assertion:

```js
// an element wider or taller than the box that is supposed to hold it
const r = el.getBoundingClientRect(), p = el.parentElement.getBoundingClientRect();
r.right > p.right + 1 || r.bottom > p.bottom + 1
```

## The film: WebGL draws and dropped frames

The instrumentation below counts draw calls **per canvas**, which is how the hidden-globe
problem was found (75–78% of all draws were going to a `visibility: hidden` canvas). Inject it
as `initScript` before navigating.

```js
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
```

Tag the canvases once the film exists, then let it settle ~6 s into the video half, zero the
counters, sample 5 s, and read `window.__M` plus:

```js
const v = document.querySelector('#hero-film video');
const q = v.getVideoPlaybackQuality();
({ w: v.videoWidth, dropped: q.droppedVideoFrames, total: q.totalVideoFrames })
```

**Baseline, 31 July 2026, before Task A** (measured in this repo, not assumed):

```
1920x1080 dpr1    frames=577  draws=830,776   {GLOBE: 625,364, ATLAS: 205,412}  video 1920, dropped 0
2560x1440 dpr1.5  frames=584  draws=1,286,326 {GLOBE: 1,002,502, ATLAS: 283,824} video 2560, dropped 0
```

`dropped` must stay at 0. A non-zero count means the decoder is behind — check the codec is
still pinned to h.264 (`f_mp4,vc_h264`) before anything else, because VP9 on Apple Silicon has
no hardware decoder and that alone reproduces the symptom.

## The map: tile requests

map.html's efficiency was measured, not estimated, and the number is a regression test. A fixed
session — load, 3 zoom steps in, a pan, 2 steps out — costs **674 tile requests** (down from
1,916). Count them by filtering network requests to the tile hosts.

If that number climbs, the three cuts that earned it are the first suspects: predictive
neighbour-zoom warming (removed), `keepBuffer` (8 → 2), and dropping the two full-screen
`multiply` blends during a zoom via `.is-zooming`. None should be undone.

## Reporting

State what was measured, the number, and whether it passed. If something failed, give the page,
the width, and the element. Plain English, no code dumps — and per the standing rule, say
plainly whether the issue is closed or still open.
