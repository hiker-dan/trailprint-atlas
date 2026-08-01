# Build Brief — The Home Page becomes THE KEY MAP

**Written 31 July 2026, after four concepts were mocked up and Danny chose this one.**
This is Task D of `docs/EXECUTION_AUG_2026.md`, now specified for execution. Tasks A, B and C
are done and pushed. Read this file, then work the stages in order.

**The spec mockup is `mockups/home-d-key-map.html`.** It is a working page on real data.
Open it before writing anything — every decision below was made against it, and it is faster
to look at than to read about. `mockups/home-b-open-volume.html`, `home-a-front-matter.html`
and `home-c-survey-desk.html` are the rejected concepts; they can be deleted once this lands.

---

## 1. What we are building, and why

The home page is the last part of the Atlas still wearing the old skin: four stacked bands in
four near-identical creams, four repetitions of eyebrow → centred title → centred lede, and
`.obs-panel` — white rounded cards with drop shadows on a near-white page, which is the exact
thing the July audit condemned in `trip.html` and `crew.html`. Both of those were rebuilt.
This one wasn't. It is also hard-capped at 1080/1120 px, which leaves ~1,360 px of empty
parchment on each side of a 4K monitor.

**The framing idea:** the three scales of place are taken (the land, the chapter, the day) and
crew is the people page. The home page is **the volume itself — its front matter.**

**The device:** every bound atlas ever printed opens with a **key map** — the whole territory
at small scale, with each plate in the book outlined on it. That is exactly what front matter
is for. So the page is a volume lying open:

- **The left leaf is a live key map** of every trailprint in the Atlas, sticky, riding
  alongside the reader for the whole page.
- **The right leaf is the front matter**, plate by plate.
- **Everything on the right is cross-lit to the land on the left.** Hover a milestone, a dot
  in the Effort Field, a territory tile or a record crown, and the country answers.

That cross-light is not an invention. `crew-member.js` already does it: *"The enlarged lane is
the plates' index, not decoration — hover a mark and its trail lights on whichever plate holds
it, and back the other way."* This applies a proven Atlas gesture at the volume's scale.

**Three things it buys that the rejected concepts could not:**

1. **The seam under the film stops existing.** The film ends parked on the Atlas sheet showing
   the whole country. Scroll one inch and the whole country is *still there*, on the left leaf.
2. **The wide screen pays.** At 3840 the left leaf is not empty margin getting wider — it is
   more country. This was the specific fault Danny named in Concept B.
3. **It is the shortest page of the four** (3,018 px at 1920 against B's 3,354) because the
   key map absorbs height the other concepts spend stacking panels.

---

## 2. The laws this build must not break

These are already written into `CLAUDE.md` and were learned expensively. Nothing here is
negotiable.

| Law | Where it came from |
|---|---|
| **The camera never moves.** Roaming belongs to `map.html`. | hike.html, trip.html, the crew Service Record all keep it |
| **All motion belongs to the ink.** | `map.js`'s founding rule |
| **The camera cuts, it never flies.** Live multi-zoom flights on raster tiles were tried three times and rejected. | `CLAUDE.md`, map.js |
| **Never stack floating elements.** | Danny's standing feedback |
| **Never emoji as UI icons.** Hand-drawn SVG only. | Danny's standing feedback |
| **Nothing is ever clipped.** Every fluid element gets a written height contract. | Danny's explicit ask |
| **The hero film does not change, in any respect.** | It is the wow; Task A just finished tuning it |
| **Nothing the sections *say* changes.** This is a visual redo. Milestone logic, stats, records, biome picks all stay. | Task D's own scope |
| **New CSS goes in a stylesheet, never inline.** Reuse the palette variables. | `CLAUDE.md` |
| **There is no global `box-sizing: border-box`** in this codebase. | `CLAUDE.md` — a padded element with `width: 100%` overflows |

---

## 3. The target architecture

```
index.html
├── <section class="hero-film" id="hero-film">        UNCHANGED — do not touch
└── <div class="volume">
    └── <div class="spread">
        ├── <aside class="keyleaf">                   THE KEY MAP (sticky)
        │   └── .keyleaf-in > .keyframe
        │       ├── .kf-collar          engraved title block
        │       ├── #keymap             the country, fixed camera
        │       ├── .detail-k + #detailplate   the detail plate, cuts
        │       ├── .kf-foot            readout + scale bar
        │       └── a.atlas-door        into map.html
        └── <div class="matter">                      THE FRONT MATTER
            ├── Plate I   — The Abstract          (was .odo-section)
            ├── Plate II  — Threads of the Trail  (was .threads-section)
            ├── Plate III — The Observatory       (was .obs-section)
            └── Plate IV  — The Record Books      (was .records-section)
```

### Files

| File | What happens |
|---|---|
| `scripts/keymap.js` | **NEW.** Owns both Leaflet maps and publishes `AtlasKeyMap`. The only file on this page that knows Leaflet exists. |
| `styles/keymap.css` | **NEW.** The volume, the spread, the leaf, both plates. |
| `index.html` | Restructured into the volume. Re-adds Leaflet (see §7). |
| `styles/home.css` | Hero film section untouched. Odometer styles → the Abstract's ruled vitals band. |
| `scripts/home.js` | `AtlasIntro` and the nav phrases untouched. The Odometer reel keeps rolling; only its skin changes. |
| `scripts/threads.js` | **Loses ~450 lines** (the procedural quadrangle). **Keeps the milestone engine and the glyphs** — see §5, Stage 3. |
| `styles/threads.css` | Sheet art retired; the ledger and hover card survive, re-set. |
| `scripts/observatory.js` | Panels re-skinned; three charts made fluid; Effort Field + Territories cross-lit. |
| `styles/observatory.css` | `.obs-panel` loses its radius and shadow. |
| `scripts/records.js` | Crowns become mounted plates; cross-lit. |
| `styles/records.css` | Band gradient retired. |

### The one API

**Every section talks to the map through `AtlasKeyMap` and nothing else. No section
outside `keymap.js` may reference Leaflet, `L`, or a layer.** This is how the codebase
already separates `AtlasChain`, `AtlasFilm`, `AtlasIntro` and `AtlasShape`.

```js
window.AtlasKeyMap = {
    ready,                          // Promise — resolves when both plates are drawn
    light(ids, label),              // light these trail_ids, fade the rest, cut the detail plate
    clear(),                        // back to whatever the current plate rests at
    plate(mode, label),             // the scroll-driven resting state ('all'|'milestones'|'records')
    benchmarks(list),               // plant milestone disks: [{ id, n, glyph, trail_id }]
    showBenchmarks(on, only)        // reveal / isolate them
};
```

Note `AtlasIntro` in `home.js` is declared with `const`, so it is a global *binding* and
**not** a property of `window` — code that tested `window.AtlasIntro` silently did nothing.
Declare `AtlasKeyMap` explicitly on `window`, as above, so sections can guard on it.

---

## 4. The open decisions

Ask these **one at a time, at the moment each blocks work**, with a recommendation — the
house rule. Do not batch them into one question up front.

**Decision 1 (blocks Stage 3, the big one): does the Threads procedural quadrangle retire?**

`threads.js` builds a beautiful seeded USGS quadrangle — invented contours, a lake, a full
collar — and plants the milestone benchmarks along a fixed wandering spine on it. In the new
page that sheet sits inches from a leaf showing *real* terrain, and milestones planted on
invented ground next to a map of real ground is a contradiction the page can't win.

**Recommendation: retire the quadrangle, keep everything else.** The milestone *engine*
(priorities, dedupe, cumulative crossings, the hand-drawn category glyphs, the notes) is the
valuable part and it survives intact. The benchmarks move onto the key map at each hike's real
coordinates, and the ledger on the right leaf becomes how you read them. That is a stronger
version of the same idea: *"Every marker is a milestone surveyed onto the map the day it was
earned"* becomes literally true for the first time.

**Decision 2 (blocks Stage 2): do the Odometer's green enamel plates survive?**

The rolling reels are genuinely good. The dark green enamel plates they sit on are the single
loudest remnant of the old skin, and nothing else in the Atlas wears them.
**Recommendation: keep the roll, drop the plates** — the numerals still count up, but as
engraved display numerals in a ruled vitals band, the idiom the hike sheet and map deck use.

**Decision 3 (blocks Stage 7): where does the Triangulation Network go?**
It is the one piece of the crew arc still owed; `mockups/crew-network.html` is the reference.
The plan of record says the Observatory. **Recommendation: a sixth Observatory panel**, paired
under R3 with the Cadence.

**Decision 4 (blocks Stage 1): does the key map get a basemap wardrobe or a year filter?**
**Recommendation: no.** It is a plate, not a console. Adding controls turns the front matter
into a second `map.html` and invites the camera to move. Keep it one plate, one basemap.

---

## 5. The stages

Each stage is independently visible in the browser and independently revertible. After each,
tell Danny what changed, where to look, and **what to try** — then wait for his OK before
starting the next. Approving one stage is not standing permission for the next.

### Stage 1 — The volume and the key map

Build the shell and the left leaf. **Every existing section moves inside `.matter` unchanged**,
still wearing its old skin. Nothing is re-styled yet. This alone will show whether the shape
is right, and it is worth seeing on its own.

- `styles/keymap.css`: `.volume`, `.spread`, `.keyleaf`, `.keyleaf-in`, `.keyframe`,
  `#keymap`, `.detail-k`, `#detailplate`, `.kf-foot`.
- `scripts/keymap.js`: both Leaflet maps, the Atlas basemap stack, every mark drawn, the
  detail plate at rest on the home ground, `AtlasKeyMap` published.
- `index.html`: wrap the four sections; add Leaflet's CSS + JS.

**Check:** the map is framed on the whole Atlas and never moves; it stays beside you as you
scroll all four sections; the detail plate rests on California; no horizontal scrollbar at
1280 or 3840.

### Stage 2 — Plate I, The Abstract

The Odometer becomes the statistical abstract: a ruled vitals band inside the volume, hairline
cells, engraved labels. Keep `home.js`'s reel. Retire `.odo-section`'s band gradient and
`.odo-plate`'s green enamel (pending Decision 2).

Introduce the **plate collar** here — kicker + uppercase display title + hairline rule + a
right-hand note — and use it for all four plates. It is the map deck's and trip sheet's own
divider.

### Stage 3 — Plate II, Threads of the Trail  *(the largest stage)*

Pending Decision 1. Split `threads.js`:

- **Keep**: the milestone definitions block (`fetchHikes().then(...)` — priorities, `cumCross`,
  the dedupe by `trail_id`, chronological sort), the `G.*` engraved glyphs, the notes.
- **Retire**: `mulberry32` and the seeded height field, marching squares, the contour group,
  the water, the collar/neatline/declination diagram, the fixed spine and `pointAtLen`, the
  "survey in progress" dots — roughly lines 28–330 and the spine placement.
- **Build**: a ledger on the right leaf, one row per milestone (disk + glyph, kicker, the
  hike, the date). Hovering a row calls `AtlasKeyMap.light([trail_id], label)` and isolates
  that benchmark; the detail plate cuts to the hike. Clicking opens `hike.html?id=`.
- **Plant** the benchmarks at each milestone hike's real `latitude`/`longitude`.

The existing hover card (`#threads-tip`) and its close-delay bridging logic can be kept or
folded into the ledger row — the row already has room for the note. Prefer folding it in:
one fewer floating element, which is Danny's standing preference.

### Stage 4 — Plate III part one, the Observatory's skin and the Effort Field

- `.obs-panel` loses `border-radius: 16px` and `box-shadow`, gains the hard edge and the
  engraved collar head.
- The band gradient goes.
- **The Effort Field becomes fluid** (rule R2 below) and **cross-lit**: hovering a dot calls
  `AtlasKeyMap.light([id], name)` and swells the dot; clicking opens the hike.

### Stage 5 — Plate III part two, the remaining panels

Territories (cross-lit by territory — the biggest single delight after the milestones), True
Ascents, the Cadence, the Specimen Drawer. Fluid rules applied.

### Stage 6 — Plate IV, The Record Books

Crowns become paper mounts in the `.ms-print` / 35 mm-slide idiom, not rounded photo cards
with drop shadows. Cross-lit on hover. The podium grows moderately and stays capped.

**Bug already found and fixed in the mockup:** the four crowns resolve to three trails,
because the PCT leg holds both distance and climb. A trail that already wears a crown must
step aside for the next best, or the page prints the same photo twice and reads as a bug.

### Stage 7 — The fluid-width rules, and the Triangulation Network

All four rules at once, because they interlock. Then the Network (Decision 3).

---

## 6. The fluid-width rules

**R1 — Text keeps a measure; panels take the page.** Ledes stay at 620–640 px. The *page
measure* grows: `min(96vw, 2280px)` in the mockup.

**R2 — A wide chart gains PLOT AREA, never HEIGHT.** This is the crux of Danny's worry and it
has an exact answer. Today the Effort Field is `viewBox="0 0 920 440"` at `width: 100%`
([observatory.js:96](../scripts/observatory.js#L96)), so its aspect is locked at 2.09 and at
2,400 px wide it becomes **1,148 px tall** and gets clipped.

Stop *scaling* and start *re-drawing*: measure the container's real pixel width `W`, emit
`viewBox="0 0 W 440"` with `height: 440px`. Scale is then 1:1 in both axes — dots stay the
same size, labels stay the same size, and the plot simply gets wider. Re-draw on resize,
debounced ~150 ms. Same treatment for **The True Ascents** (`1060 × 470`,
[observatory.js:192](../scripts/observatory.js#L192)).

**R3 — A square element must NOT grow; it must PAIR.** The Cadence is `620 × 560`
([observatory.js:473](../scripts/observatory.js#L473)). A 2,400 px wheel is absurd. Square
panels get a hard max width and pair with a neighbour past a breakpoint.

**R4 — Nothing is ever clipped, and we assert it.** Headless sweep at
**1280 / 1600 / 1920 / 2560 / 3440 / 3840**, checking `scrollWidth === clientWidth` and that no
element's box escapes the viewport. The sweep script is in §9.

| panel | shape | wide-screen behaviour |
|---|---|---|
| The Abstract | band | grows with the measure |
| Milestone ledger | list | grows with the measure |
| The Effort Field | wide (2.09) | **re-drawn** wider, fixed height |
| The True Ascents | wide (2.26) | **re-drawn** wider, fixed height |
| Territories | fluid grid | free win — more tiles per row means it gets *shorter* |
| The Cadence | square (1.1) | capped, **pairs** past ~1700 px |
| The Specimen Drawer | cabinet | capped, pairs with the Cadence |
| Record crowns | `auto-fit minmax(180px)` | uncapped; four across is comfortable |
| The Expedition podium | 3 columns | grows moderately, stays capped |

---

## 7. Gotchas already paid for

Every one of these cost real debugging time in the mockup or elsewhere in this repo. Do not
rediscover them.

**Layout**

1. **`.spread` must be `align-items: stretch`, not `start`.** A grid item sized to its own
   content is only as tall as the key map, and `position: sticky` can only travel inside its
   own containing block — so the map rides along for ~700 px and then scrolls away for the
   remaining three plates. This is subtle and looks like a sticky bug.
2. **The binding gradient must sit where the columns actually divide.** In Concept B it was
   left at 50% while the split was at 26%, and a gutter running down the middle of the facing
   plate stops reading as a book and starts reading as a smudge.
3. **No global `box-sizing: border-box`.** Never give a padded element `width: 100%`.
4. **Territories' rules belong on the tiles, not the container.** Drawing them as a 1 px grid
   `gap` over a coloured container background paints the last row's empty tail as a solid tan
   block. Use `border-right`/`border-bottom` on `.tt`.

**The map**

5. **The mark, not the shape.** At continental scale a 12-mile trail is a third of a pixel —
   123 polylines produced a page that looked *empty*. Each outing is one `circleMarker` in its
   year's ink at r≈4.2. The trail geometry still extends the bounds, so the frame is honestly
   set by ground walked.
6. **Pixel padding, never a geographic `pad()`.** The printed collar doesn't scale with the
   latitude span, and Alaska stretching the bounds pushes southern hikes under the frame's
   edge. `map.js`'s `ATLAS_FRAME` learned this already.
7. **The detail plate cuts, never flies, and the cut is buffered ~220 ms.** Running a cursor
   down 113 dots would otherwise ask the tile server for a new region 113 times. `map.js`
   buffers rapid steps ~1.2 s for the same reason.
8. **`re-fit after layout settles.`** The sticky column's real height isn't known at first
   paint; call `fitBounds` again after ~250 ms and on resize. A resize re-frame is a *layout*
   event, not a camera gesture — it is the only thing permitted to move the camera.
9. **`mix-blend-mode` over a moving map is catastrophic** — it forces a backdrop readback and
   a full-stack re-composite every frame, and it was half of Task A's jitter. It is safe here
   **only because this map never moves.** If anything ever animates the key map, the parchment
   wash must come off first.

**Behaviour**

10. **The plate observer and the cursor fight.** Scroll-then-point happens in that order, but
    an `IntersectionObserver` callback lands a frame *later* — so it reset the readout after
    the hover had set it, and the map said "the whole Atlas" while the detail plate stood on
    Alaska. Keep a `pointing` flag; the cursor is the more specific instruction and wins until
    it leaves.

**API signatures that have bitten**

11. `cloudinaryUrl(publicId, transform)` is a **bare global**, not `ATLAS_CONFIG.cloudinaryUrl`.
12. `territoryName(key)` takes a **key**, not a hike. Pair it with `territoryKey(hike)`.
13. `formatHikeDate(dateStr, options)` takes a **date string**, not a hike.
14. Sort with `compareHikesChrono` / `compareHikesChronoDesc`, never by `date_completed` alone.
15. Read hike dates with `getUTC*` getters, never the local variants.
16. Exclude viewpoints from any "hikes" tally with `isViewpoint()`; counts that mix both say
    **"outings"**.
17. The mockups carry `<base href="../">` because they live in `mockups/` and `atlas-data.js`
    fetches `data/hikes.json` relative to the document. **The real `index.html` must not have
    that line** — it is at the repo root already.

**index.html**

18. **Leaflet has to come back.** `CLAUDE.md` currently states *"Leaflet is NOT loaded here"*
    for `index.html`, and there is a comment in the file saying the same. Both must be updated
    when the key map lands, with the reason. The film is still MapLibre; the key map is
    Leaflet, like every other static plate in the Atlas. **Two map libraries on one page is a
    real payload cost — measure it (§9) and report the number.**
19. The inline `sessionStorage` / `prefers-reduced-motion` check must stay inline and must
    stay first — it runs before first paint to fast-forward the film for repeat visits.

---

## 8. Where the film meets the map

The pitch rests on the handover being invisible: the film ends parked on the Atlas sheet
showing the whole country, and the key map shows the whole country.

Those two frames are computed differently today. `intro-film.js`'s `atlasEnd` is built from
`natFeatures` (the national silhouettes) padded by `PAD = 0.06`; the key map frames from trail
geometry with pixel padding. **They will not match by accident.**

**Do this as a measurement, not a guess:** screenshot the film's last frame (`?q=1` parks it)
and the key map at the same viewport width, and compare the visible span. Then tune the key
map's padding — *not* the film's, which is baked into a video and whose `zSpan` is recorded in
`data/intro-film.json` precisely so it can never be re-derived. **Changing anything that
touches `atlasEnd` invalidates the baked flight and forces a ~20-minute re-render.** The key
map bends to the film, never the reverse.

---

## 9. Acceptance checks

Run these before handing any stage over.

**No clipping, any width** — the R4 assertion:

```bash
python3 -m http.server 8899          # from the repo root
tools/.render-venv/bin/python sweep.py
```

```python
# sweep.py
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome")
    for w in (1280, 1600, 1920, 2560, 3440, 3840):
        pg = b.new_page(viewport={"width": w, "height": 1000})
        pg.goto("http://localhost:8899/index.html", wait_until="networkidle")
        pg.add_init_script("sessionStorage.setItem('introShown','1')")
        pg.wait_for_timeout(2600)
        r = pg.evaluate("""() => {
            const de = document.documentElement;
            const over = [...document.querySelectorAll('*')].filter(e => {
                const b = e.getBoundingClientRect();
                return b.width > 0 && (b.right > de.clientWidth + 2 || b.left < -2);
            }).map(e => e.tagName);
            return {sw: de.scrollWidth, cw: de.clientWidth, h: de.scrollHeight,
                    over: [...new Set(over)].slice(0, 4)};
        }""")
        print(w, r)
        pg.close()
    b.close()
```

`IMG.leaflet-tile` reporting out-of-bounds is a **false positive** — it is Leaflet's normal
tile apron inside an `overflow: hidden` container. `scrollWidth === clientWidth` is the real
test.

**Baseline to beat (measured 31 July on the mockups, full page height):**

| width | A | B | C | **D** |
|---|---|---|---|---|
| 1920 | 3,331 | 3,354 | 3,472 | **3,045** |
| 2560 | 3,363 | 3,326 | 3,513 | **3,018** |
| 3840 | 3,363 | 3,326 | 3,513 | **3,018** |

**Tile cost.** Count requests for a load + a full scroll to the footer, and again with a
scrub down the milestone ledger and across the Territories tiles. The key map should fetch
its tiles once; the detail plate should fetch once per *settled* cut, not per hover. If a
scrub of 20 milestones costs more than ~20 region fetches, the buffer isn't working.

**The film still plays smoothly.** Task A's harness is at the bottom of
`docs/EXECUTION_AUG_2026.md`. Adding Leaflet below the fold must not cost the film frames —
run it before and after and compare `longFrames` and `droppedVideoFrames`.

**Reduced motion.** With `prefers-reduced-motion: reduce`, the film fast-forwards and the page
must land straight onto the finished state, key map included.

---

## 10. What must NOT change

- The hero film, in any respect. Task A just finished tuning it and the flight is a baked
  video.
- Anything the sections *say*. Milestone logic, stats, records, biome picks stay exactly as
  they are. This is a visual redo.
- `base.css`'s `.atlas-door`. If the home page grows doors — and it grows one, into the land —
  it uses that component as-is, sizes only.
- The doors table in `CLAUDE.md`. The key map's door into `map.html` is ordinary navigation
  from the front matter, not a fourth kind of crossing.

---

## 11. Housekeeping when this lands

- Update `CLAUDE.md`'s `index.html` row: the volume, the key map, and **Leaflet is loaded here
  again** (with the reason).
- Add rows for `scripts/keymap.js` and `styles/keymap.css`.
- Update the `scripts/threads.js` row: the quadrangle is gone, the milestone engine remains.
- `mockups/home-d-key-map.html` becomes **load-bearing** (it is the spec, like
  `mockups/hike-light-table-v2.html` and `mockups/map-chapters.html`) — so per the standing
  rule it **should be committed**. Delete `home-a-front-matter.html`, `home-b-open-volume.html`
  and `home-c-survey-desk.html`, which were exploratory.
- Mark Task D done in `docs/EXECUTION_AUG_2026.md` and fold the outcome into
  `docs/STATE_OF_THE_ATLAS.md`. Task E (Trail Crew refinement) is next, and it needs Danny's
  list before it can be planned — ask him plainly: *what specifically about the Muster Roll
  and the Service Record still bothers you?*
