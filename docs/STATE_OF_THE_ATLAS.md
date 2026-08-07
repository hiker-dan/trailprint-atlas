# State of the Atlas — July 2026 (re-audited 31 July)

*The living plan of record for The Trailprint Atlas. This revision re-audits the July
plan against the actual code and data after the map redesign — which ran far longer
than anyone expected — plus the backlog, the elevation ground-truthing, and the
homepage inset plates. Everything below was verified in the codebase or in a live
browser, not assumed. The June 2026 audit and the original six-phase roadmap live
in git history.*

*The 31 July revision adds four newly-found problems (the film's jitter, the home
page's remaining old skin, the onX clock, and the almanac's pop-in) and re-orders
the roadmap around them. The step-by-step build brief for those lives in its own
working document, **[EXECUTION_AUG_2026.md](EXECUTION_AUG_2026.md)** — file, line,
measurement and acceptance check for each. This file stays the plan; that file is
the instructions.*

---

## Where the build actually stands

**The redesign arc is nearly closed, and the 24 July claim that it *was* closed is
withdrawn.** The interactive map, the hike page, Echoes, `trip.html` (The Traverse)
and `crew.html` + `crew-member.html` (The Muster Roll and The Service Record) all
speak the engraved-atlas language. **The home page does not.** Below the film it is
still four coloured bands of white rounded drop-shadow cards, which is the exact
system this arc set out to retire, and it is the same fault the 24 July audit named
on `trip.html` and `crew.html`. It was missed because the home page had just been
rebuilt *structurally* (Threads → Observatory → Record Books) and a rebuilt page
reads as a finished one. Item D closes it.

**The data is complete and caught up.** 123 records, 8 Jan 2022 → 18 Jul 2026;
113 hikes and 10 viewpoints; every `description`, `flora` and `fauna` filled.
The logbook has no gaps.

**Two whole workstreams landed that were never in any plan:** the USGS elevation
ground-truthing (every summit re-surveyed against 3DEP) and the map's efficiency
diet (1,916 → 674 tile requests on a fixed session).

---

## Status of the original six phases

| Phase | State |
|---|---|
| **0 — Trailhead** (housekeeping) | ✅ Done |
| **1 — New Bones** (architecture) | ✅ Done (config.js, atlas-data.js, single nav, extracted CSS/JS) |
| **2 — Pack Lighter** (perf + mobile) | ✅ Perf done, and then some — the July map diet cut tile traffic ~65%. ⏸ **Mobile still deferred by choice** |
| **3 — Catch Up the Logbook** (data) | ✅ **Done.** Pipeline shipped; backlog fully entered (123 records through 18 Jul 2026). Runyon became Echoes' Local Loop |
| **4 — Find Your Voice** (storytelling) | ◐ Trip pages ✅, Local Loop ✅, elevation profiles ✅, fire memorial ✅, loading phrases ✅. **Journal (`notes`, 0/123) and The Overlook statement still empty — deferred by choice** |
| **5 — New Summits** (expansion) | ◐ Trail Crew ✅ *(rebuilt as The Muster Roll + The Service Record, July 2026)*, Observatory ✅, hero film + map expedition ✅. **Park Badges, Gear catalog, Year in Review, achievement badges pending. Photo privacy gate cut** |

---

## Closed since the July plan was written

- **The hike page redesign, all four stages except the last.** The Cartographer's
  Light Table shipped; the sheet lands on map.html; hike.html traded its strip for
  the doors. **Stage 3 is now done too** — the Surveyor's Chain (`atlas-chain.js`)
  is live on the map, the deck's old year-banded scrub is retired, and the
  explicitly-deferred bug ("returning from a hike page resets the animation to the
  end") is fixed: `restoreLandState` restores `inkIx` and parks the chain on it.
  **Stage 4 is now complete**: the trip page (The Traverse) and the crew pages
  (The Muster Roll + The Service Record) both shipped, closing the redesign arc.
- **The backlog (old item 5).** Finished ahead of its slot in the order.
- **Elevation ground truth** (unplanned). `tools/correct-elevations.py` asks USGS
  3DEP what the ground really is; `summit_elevation` is derived, never typed;
  `peak_name` added to the schema and backfilled (15 summits, 14 named).
- **Map efficiency** (unplanned). Speculative tile warming removed, `keepBuffer`
  8 → 2, blends suspended during a zoom.
- **The hero film's far-north problem** — flagged in the last revision as "watch
  the framing when a far-north outlier joins." It arrived, it broke the framing,
  and it's solved: the film frames the lower 48 and Alaska rides an **inset plate**
  (Hawaii's is cut and waiting).
- **Tundra** added as a 10th geography.

---

## Live problems, found in this audit

**1. Canada readiness was skipped, and it is now a bug, not a prep task.**
The last plan said Canada work "must precede the backlog." The backlog went in
first, so three BC hikes are live against code that doesn't know what a province
is. Verified in the browser:
- The Territories tile for BC renders the **generic pennant fallback**, not a
  silhouette, is labelled **"BC"** rather than "British Columbia", and links to
  the bare `map.html` instead of a filtered view.
- The Observatory's profile line reads **"left tracks across 8 states"** — the 8
  includes BC.
- The header sub-line ("7 states · 1 country") survives, but calls a province a
  country.

**2. Three pages still wear the old skin: `trip.html`, `crew.html`,
`crew-member.html`.** Confirmed by rendering all three — they share one dated
visual system, not three separate problems:
- an **evergreen slab hero** with white overlay text (`#trip-hero`, `#crew-hero`)
- **white rounded cards with drop shadows** on a near-white page (`#fdfdfd`)
- **green sans headings with an underline rule**
- **default Esri World Topo tiles** with stock zoom controls — bright green maps
  with none of the Atlas basemap wardrobe or parchment wash
- ~~and on the trip page, the retired timeline strip still riding on top~~
  *(fixed July 2026 — the trip page was rebuilt as The Traverse and the strip is gone)*

The **bones differ in quality, and that matters for how each is treated.** The crew
pages' structure is genuinely good and stays: the core-crew field cards, the
register with era bars, and above all the per-companion **region-grouped shared-trail
maps** on `crew-member.html`, which are one of the site's best ideas. Those need a
coat of paint, not a rebuild. The trip page needs more than paint — it's a chapter,
and the map's expedition engine already knows what a chapter is.

**3. Retirement debt from the map rebuild.** The deck's `#timeline-scrub` markup
still exists and `buildTimelineChrome()`/`syncScrub()` still write to it, though
CSS has hidden it (`.deck-track { display: none }`). `timeline-nav.js` now serves
only `trip.html`. Both should die with stage 4.

**4. The geography taxonomy is still lopsided, though less so.** Over 123 records:
Desert 33, Chaparral 24, Mountain Forest 22, Urban Edge 15, Riparian Canyon 13,
Riparian Forest 6, Coastal Chaparral 4, and three two-member categories (Coastal,
Tundra, Riparian Meadow). No singletons any more, but the tail is still thin.

**5. Mobile is the deferred elephant, and the herd keeps growing.** Everything
built this year is desktop-only; the audience is family on phones.

---

## Live problems found on 31 July (measured, not assumed)

**6. The opening film still judders, and three quarters of the reason is invisible
work.** Measured in Chrome with every WebGL draw call counted and tagged by canvas:
during the **baked-video** half of the film, when the picture on screen is a
`<video>`, the page is still flying the old live 3D map behind it at full size.
At a 2560 window it costs **1,002,502 draw calls in five seconds** on a canvas that
is `visibility: hidden`, out of 1,286,326 total. The other 284,000 go to the Atlas
sheet, which is at `opacity: 0`. **Essentially all of the graphics work during the
video half is thrown away.** Muting just the hidden map's draws took the worst frame
from 125 ms to 25 ms and dropped video frames from 6 to 0, on a fast Mac with nothing
else running. Two smaller causes ride along: a 4K screen is served the **2560 video
cut** (14.8 MB) because the width rule floors the request at the window's own width,
and both MapLibre canvases are built at full device pixel ratio (**3840 × 2100 each**
on a 1.5× display). Fix in EXECUTION_AUG_2026 Task A.

**7. The home page is the last page wearing the old skin.** The audit above condemned
"white rounded cards with drop shadows on a near-white page" on `trip.html` and
`crew.html`. Both were rebuilt; the home page still has it verbatim — `.obs-panel` is
`#fffdf6` + `border-radius: 16px` + `box-shadow`. On top of that the page is four
stacked bands in four near-identical creams, each repeating the same eyebrow / 3.2 em
title / centred lede formula, which is a marketing landing page rather than an atlas.
Danny's own words: "elements just splashed on the page one by one." Fix in Task D.

**8. The home page ignores a large monitor.** Every section is hard-capped at
1080–1120 px, so a 3840 px display shows about 1,360 px of empty parchment on each
side. It cannot simply be uncapped: the charts are fixed-aspect SVGs, so the Effort
Field at 2,400 px wide would be **1,148 px tall** and clipped. The answer is to
re-draw them wider rather than scale them, and to pair square panels instead of
stretching them. Same job as item 7 and done with it, not after it.

**9. Six hikes report an impossible time on the trail.** The onX Backcountry export
thins the recording and re-stamps the survivors at a made-up 3-second rhythm, so the
file's elapsed time is proportional to how many points it kept rather than to how long
Danny was out. Measured: onX points sit 5.3–7.8 m apart where AllTrails' sit 3.5–3.7 m,
giving implied speeds of up to 20 mph. Strawberry Peak claims 1 h 08 m for 7.2 miles;
its own photographs span 3 h 26 m. Nothing in our parsing is wrong. Recoverable,
because every intake photo carries a **GPS UTC timestamp** and a position, and
`recorded_times` already exists in the schema and already wins over the GPX. Fix in
Task B.

**10. The almanac arrives with a jolt.** It is `display:none` until the Open-Meteo call
returns, and it sits above four other cards, so its arrival shoves them down. It
happens twice, because the "On the trail" row waits on the GPX and lands separately.
The real fix is to bake the weather the way every other derived dataset in this
project is baked: historical weather for a past date never changes. Fix in Task C.

---

## Decisions locked

- **Single track, features first.** No parallel work.
- **Mobile** deferred until the site is near-final.
- **Park badges** get procedural placeholder art now; commissioned art drops in later.
- **Park type is derived from `location`**, not a new field.
- **The journal + The Overlook voice** deferred until the build is further along.
- **AI descriptions stay** as the field-guide layer beneath Danny's journal words.
- **Photo privacy gate: cut.**
- **Territories abroad are whole COUNTRIES, not subdivisions** (decided 24 July 2026,
  reversing the earlier province plan). The US keeps its state-by-state grid because
  that's where the miles are; every other country gets **one tile with its own
  national silhouette** — Canada, Ireland, Italy. There will always be far fewer
  hikes abroad, and a lone province tile beside 50 states reads as an accident
  rather than a collection. `region` still records "City, PROV" for the detail.

---

## The roadmap from here — one track, in order

*Re-ordered 31 July. Sequencing logic is unchanged: fix what's visibly wrong before
adding anything new; finish the redesign arc; then build the new rooms; batch the
taxonomy change over the complete set; and sweep the whole build last, when there's
nothing left to make untidy. What changed is that the audit found four things that
are visibly wrong today, so they go in front. Steps, files and acceptance checks for
items A–E are in **[EXECUTION_AUG_2026.md](EXECUTION_AUG_2026.md)**.*

### A. The film plays smoothly  *(first: it's the first thing anyone sees)*
Five staged cuts, each independently verifiable, none of which changes what the film
does. Stop driving the hidden 3D map during the video half (three quarters of the
work, and the whole reason it judders); take that map's WebGL context down entirely;
cap the film at the 1920 cut so a 4K screen stops pulling 14.8 MB; cap MapLibre's
pixel ratio so a Retina display isn't shading 8 megapixels twice over; and stop
rewriting every pen's gradient on every frame. Then one idea rather than a device
matrix: **let the film watch its own first two seconds and tune itself down if it is
struggling.** The file already does exactly this for video width; it just needs to
cover the live half too.

### B. The Hike Almanac tells the truth  *(a correctness bug on six records)*
A pace guard in the page so no wrong clock can ever be shown again, from any app;
`tools/recover-times.py` to rebuild the real windows from the photographs' GPS
timestamps; six hand-checked `recorded_times` entries; and a warning in
`new-hike.py` so it can't happen silently again. **Do not rewrite the GPX files** —
they are the archival record of what the app exported.

### C. The Hike Almanac arrives without a jolt
Reserve the card's space from first paint as a ruled-but-unwritten ledger, ink the
values in rather than appearing, settle the "On the trail" row before revealing
anything, and then remove the wait entirely by baking `data/almanac.json` the way
`elevations.json` and `trails.geojson` are baked. That also takes a third-party API
out of the visitor's page load.

### D. The home page joins the Atlas  *(the centrepiece)*
A real visual redo, not a restyle, following the house ritual: three concepts →
mockups on Fable 5 → Danny picks → staged build. The framing question is answered
in the brief — the home page is **the volume's front matter**, and the recommended
concept is one continuous parchment desk with engraved collars and plate numbers in
place of four coloured bands. The film keeps its wow and does not change.

This item also absorbs two things that would otherwise be separate errands:
- **The wide-screen work** (problem 8). Charts get re-drawn wider rather than scaled,
  square panels pair instead of stretching, prose keeps its measure, and a screenshot
  sweep at six widths asserts that nothing is ever clipped.
- **The Triangulation Network** (below), which is the one piece of the crew arc still
  owed and which belongs in the Observatory.

### E. Trail Crew refinement  *(the list exists now — 6 Aug 2026)*
Danny wanted to refine the Muster Roll and the Service Record but hadn't said what,
which blocked this item for weeks. The list now exists: a two-assessment design
review of `crew.html`, run with the Atlas's own brief supplied, produced a measured
set of findings and a working A/B mockup (`mockups/crew-full-impeccable.*`, local).
The confirmed items are the lane click reporting back, the cross-read naming *which*
outings are shared rather than only counting them, the year key moving onto the axis
it decodes, colliding marks so the printed count is countable, the viewpoint-only
companion no longer printing `0 mi · 0.0k ft`, keyboard reach into the register, and
frozen entry numbers under the Outings sort. The Triangulation Network was the one
refinement already known and was done inside D.

**Still owed inside E, in order:**

1. **`crew-member.html` has not been reviewed at all.** The pass was scoped to
   `crew.html`; the Service Record received only the shared-stylesheet contrast fixes
   as spillover. It needs the identical treatment — its own isolated sandbox, its own
   two assessments, its own A/B — and it is the harder page: live Leaflet plates, the
   enlarged lane with its own mark stacking, the 75km clustering, the loose sheet.
2. **Motion, Danny's note 7 Aug 2026.** Two things read as mechanical on a site whose
   whole subject is walking outdoors:
   - The scroll that brings an opened drawer into view is an instant jump
     (`scrollTop +=`, no easing). It should ease out. Careful: the Threads ledger has
     to cancel in-flight smooth scrolls before measuring or the before/after
     measurements describe different pages — the same trap applies here.
   - **The page turn "feels weak and ugly" in execution.** The concept stays; the
     execution needs real work. Note that `crew-book.js` documents its easing as
     load-bearing (a page is steeply foreshortened for most of its arc, so both curves
     spend their time where the page can be seen) — that is the theory, and the theory
     is not landing. Treat as redesign scope, not as a bug.

### F. Cross-browser parity  *(found 6 Aug 2026, in use)*
**The whole Atlas has only ever been checked in one engine.** Danny develops in Zen
(Gecko) and the headless harness drives Chrome (Blink), and the two have now visibly
disagreed: on `crew.html` in Chrome he had no scroll and the shell did not follow a
window resize, while the same page in Zen behaved. Not yet reproduced from the
harness — a maximized Chrome window cannot be resized over CDP — so the first job is
to reproduce it by hand at a stated window size.

What the audit already shows, and what makes this systemic rather than one page:

- **Eight of nine stylesheets build a fixed-viewport shell** (`100vh` and/or
  `position: fixed` + `overflow: hidden`): credits, crew, echoes, hike, home, keymap,
  map, trip. In that pattern the page never scrolls as a whole, so anything that does
  not fit must live inside an internal scroller, and reaching it depends on where the
  cursor is. Browsers differ on exactly that: scroll chaining and overlay-scrollbar
  visibility are not the same in Gecko and Blink.
- **Nothing uses `dvh`/`svh`/`lvh`** — every shell is the older `100vh`.
- **No shell declares a `min-height`**, so there is no floor at which a short window
  stops clipping and starts scrolling.

Deliverable: reproduce, decide the shell contract (page-scroll fallback below a
stated height, or an explicit internal scroller with a visible affordance), apply it
once across all eight, then a parity sweep of every page in Chrome, Firefox and
Safari. Desktop only — the mobile pass stays deferred.

---

*The next two entries are **finished work**, kept in place so the roadmap still reads
as one continuous record rather than losing its own history. Live work resumes at G.*

### ✅ Territories abroad — **DONE** (commit `f7f7eda`, 24 July 2026)
Verified 31 July: `country` is on all 123 records (120 United States, 3 Canada);
`territoryKey()` / `territoryName()` / `isUsState()` / `hikeCountry()` live in
`atlas-data.js` as the single source; `tools/build-countries.py` and
`assets/countries.json` give Canada a real silhouette; `?state=XX` and `?country=Name`
both deep-link the map. Left here as a record, not as work.

### ✅ The re-skin: trip + crew — **DONE** (July 2026)
*The home page was the third page in this arc and was missed. It is item D above.*

**`trip.html` is done — THE TRAVERSE shipped July 2026.** Five concepts → three
mockups → a combined fourth (Journey Ribbon + Route Card) → three rounds of
refinement → build. It answers the starting question directly: a trip *is* a
chapter, so the page is built like map.html — the land is the page, the camera
cuts and never flies — with one rule the map doesn't have: **it never roams.**
Every hike's real profile is stitched end to end into one normalised line;
hikes are numbered stations, viewpoints are lettered sightings that never touch
the baseline; the datum carries a labelled scale and a hatched cut so it can't
read as sea level; trips under 100 ft of climbing collapse to a survey rule that
says so in words. The preview card is map.css's own sheet, compacted. Opening
photographs are curated (`ATLAS_CONFIG.TRIP_STARS`, all 21 picked), held on
screen until they actually load, and the whole door architecture between land,
chapter and day is now written down in CLAUDE.md. Verified across all 21 trips
and 73 stop framings, plus a 17-page regression sweep.

Two retirements fell out of it:
- **`timeline-nav.js` + `styles/timeline-nav.css` — ✅ deleted.** Verified gone
  31 July. hike.html dropped the strip in the Continuous Expedition rebuild;
  trip.html was the last holdout.
- The old trip page's journey map, stop clustering and itinerary are gone with it.

Still outstanding from the map rebuild, and now the *only* item left for the sweep's
consolidation pass that this audit has actually named: **the deck's hidden
`#timeline-scrub`**. The markup survives in `map.html` and `map.js` still writes to
it in 15 places, every frame, for an element CSS hides (`.deck-track { display: none }`).

**`crew.html` + `crew-member.html` are done — THE MUSTER ROLL shipped July 2026,
and it is not the coat of paint this item planned.** Three concepts were mocked
up (Triangulation Network, Muster Roll, Trail Register), then the last two were
blended, because they turned out to be the same object: a muster roll *is* a
register, and both already ordered people by arrival. So Trail Crew is a bound
volume open on a desk — cover and roll on `crew.html`, record and plates on
`crew-member.html` — with a **page turn** (`crew-book.js`) carrying a visitor
between them, filmed across two documents so the swap is never seen.

What the rebuild added beyond the surface:
- **Order of arrival, not rank.** The ranked list was hiding the Atlas's social
  eras; ordered by first signature, the circles visibly arrive and hand off.
- **Ledger brace + ditto** for a party who signed in on one outing (five did, at
  Astral Drive, March 2022).
- **The cross-read** — hover a lane and the outings shared with everyone else
  light across the other lanes. The triangulation idea, on the time axis.
- **The counter-lane** of outings walked alone, drawn hollow.
- The plate maps traded stock Esri Topo for the real Atlas basemap, and the
  enlarged personal lane became the **index** to them.
- Every companion now has a Service Record, so a companion's name anywhere in
  the Atlas leads to the same place instead of a generic front door.

**The Triangulation Network is not dropped** — Danny wants a version of it as an
**Observatory** element on the home page, since that section is already the
Atlas's data room. Unbuilt; it is the one piece of this arc still owed, and it is
now scheduled **inside item D** (the home page rebuild) rather than as its own
errand, because that is the section it belongs to and that section is being rebuilt
anyway. `mockups/crew-network.html` is the reference.

**What the re-skin did NOT cover, and Danny has since raised twice:** the home page
itself still wears the old system (problem 7 above). The redesign arc is therefore
*not* closed, which the 24 July revision claimed. Item D closes it.

---

### G. Park Badges  *(the trophy case)*
47 unique `location` values are waiting. Park type derives from `location` via a
`parkTypeOf()` helper (same pattern as `isViewpoint()`) — no new field,
self-maintaining. **Procedural placeholder medallions** in the site's language make
the wall look intentionally collected from day one; commissioned art drops into the
identical frame later, one park at a time.

### H. Gear section bones
A `gear.json` schema + the page scaffold with empty slots. "My first kit" → how it
evolved. Bones first, data later.

### I. Geography deep-dive + reclassification
Over the complete set: is 10 the right taxonomy? Resolve the thin tail, reclassify
in one batch.

### J. The sweep — consolidation + future-proofing  *(last, and deliberately so)*
Two passes over the finished build, **changing nothing a visitor can see**:

- **Consolidation.** Four rebuilds in one year leave sediment: retired components
  still loaded, rules re-derived in three places, CSS for elements that no longer
  exist, dead parameters. This audit already turned up three copies of a US-state
  list (now fixed) and a hidden deck scrub still being written to every frame (still
  there, 15 write sites in `map.js`) — that's the shape of what a full sweep would
  find. The 31 July audit adds a third example of the same species, and it is the
  most expensive one yet: **a whole 3D map being flown behind a video that replaced
  it** (problem 6). Item A removes that one early rather than waiting, because it is
  not tidiness, it is the reason the film judders. Every removal verified against the
  rendered page, since "no visual change" is the whole contract.
- **Future-proofing.** Ask what breaks as the Atlas grows, and fix it while it's
  cheap. Known candidates: the map holds every trail's geometry in memory and
  draws every stamp (fine at 123 outings — at 500?); `hikes.json` is fetched whole
  by every page; the hero film builds one SVG path per trail at load; the chain
  lays out every dot on a single track; Cloudinary's free tier has a ceiling; the
  year palette is generated but the timeline's fixed spine is not infinite. The
  deliverable is a written list of thresholds — *this breaks around here, and this
  is the fix* — not speculative rewriting.

It goes last on purpose: consolidating before the redesigns are done would mean
tidying code that's about to be replaced.

---

## Deferred (revisit when the build is near-final)
- **The Voice** — the journal (`notes`, 0/123) and The Overlook personal statement.
  Danny's words, shaped together; never invented.
- **The mobile pass** — all pages: touch timeline, tap-toggled tooltips, responsive
  type, thumb-reach layouts.

## Leftover, pick-and-choose (anytime)
- Year in Review pages (auto-stats + a retrospective paragraph, minted each January).
- Hike-specific achievement medallions ("First Backpacking Trip," "Highest Summit").

---

## Model note
Concept sketching and mockup-building both run on **Fable 5** — the divergent
ideation stage is where the capability edge shows up most (range and originality of
concepts), not just the coding.

---

*Re-audited 24 July 2026 against the code and a live browser, after the map redesign,
the backlog, the elevation ground-truthing, and the inset plates.*

*Re-audited again 31 July 2026, this time with instruments: every WebGL draw call in
the opening film counted and attributed, every GPX in the logbook parsed and compared
against its own photographs, and every home-page width measured. Four new problems,
one stale "done" corrected, and one claim withdrawn — the redesign arc is not closed
while the home page still wears the old skin. The build brief is
[EXECUTION_AUG_2026.md](EXECUTION_AUG_2026.md). The trail keeps going; so do we.*
