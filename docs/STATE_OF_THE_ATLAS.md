# State of the Atlas — July 2026 (re-audited 24 July)

*The living plan of record for The Trailprint Atlas. This revision re-audits the July
plan against the actual code and data after the map redesign — which ran far longer
than anyone expected — plus the backlog, the elevation ground-truthing, and the
homepage inset plates. Everything below was verified in the codebase or in a live
browser, not assumed. The June 2026 audit and the original six-phase roadmap live
in git history.*

---

## Where the build actually stands

**The redesign arc is closed.** Every page of the Atlas now speaks the engraved-
atlas language: home, the interactive map, the hike page, Echoes, `trip.html`
(The Traverse, July 2026) and finally `crew.html` + `crew-member.html`
(The Muster Roll and The Service Record, July 2026). There is no page left
wearing the old slab-hero, white-card system.

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

Sequencing logic: fix what's visibly wrong before adding anything new; finish the
redesign arc; then build the new rooms; batch the taxonomy change over the complete
set; and sweep the whole build last, when there's nothing left to make untidy.

### 1. Territories abroad  *(small, overdue, and currently wrong on the live site)*
Canada is the first case; the work is built once for every country after it.
- **Country becomes a first-class field.** It can't be derived — "Dublin, ??" has no
  state abbreviation to key off — so it goes in the schema, per the standing rule
  that new per-hike information starts there.
- **A silhouette source for countries**, generated locally the way trails.geojson is
  (a tool, a committed asset, no runtime dependency), so Canada gets a real outline
  instead of the fallback pennant.
- Fix the **"N states"** wording everywhere → states *and* countries.
- Give a country tile a working destination, as state tiles have.
- Teach `new-hike.py` to ask, and infer the obvious cases.
- Safe as-is: interactive map, weather almanac (Open-Meteo is global), park badges.

### 2. The last re-skin: trip ✅ + crew  *(stage 4 — closes the redesign arc)*

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
- **`timeline-nav.js` + `styles/timeline-nav.css` are now loaded by no page.**
  hike.html dropped the strip in the Continuous Expedition rebuild; trip.html was
  the last holdout. Kept for now, deleted in stage 6 unless it finds a new home.
- The old trip page's journey map, stop clustering and itinerary are gone with it.

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
Atlas's data room. Unbuilt; it is the one piece of this arc still owed.
`mockups/crew-network.html` is the reference.

### 3. Park Badges  *(the trophy case)*
47 unique `location` values are waiting. Park type derives from `location` via a
`parkTypeOf()` helper (same pattern as `isViewpoint()`) — no new field,
self-maintaining. **Procedural placeholder medallions** in the site's language make
the wall look intentionally collected from day one; commissioned art drops into the
identical frame later, one park at a time.

### 4. Gear section bones
A `gear.json` schema + the page scaffold with empty slots. "My first kit" → how it
evolved. Bones first, data later.

### 5. Geography deep-dive + reclassification
Over the complete set: is 10 the right taxonomy? Resolve the thin tail, reclassify
in one batch.

### 6. The sweep — consolidation + future-proofing  *(last, and deliberately so)*
Two passes over the finished build, **changing nothing a visitor can see**:

- **Consolidation.** Four rebuilds in one year leave sediment: retired components
  still loaded, rules re-derived in three places, CSS for elements that no longer
  exist, dead parameters. This audit already turned up three copies of a US-state
  list and a hidden deck scrub still being written to every frame — that's the
  shape of what a full sweep would find. Every removal verified against the
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
the backlog, the elevation ground-truthing, and the inset plates. The trail keeps
going; so do we.*
