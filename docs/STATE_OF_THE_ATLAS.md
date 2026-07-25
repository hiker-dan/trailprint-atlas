# State of the Atlas — July 2026 (re-audited 24 July)

*The living plan of record for The Trailprint Atlas. This revision re-audits the July
plan against the actual code and data after the map redesign — which ran far longer
than anyone expected — plus the backlog, the elevation ground-truthing, and the
homepage inset plates. Everything below was verified in the codebase or in a live
browser, not assumed. The June 2026 audit and the original six-phase roadmap live
in git history.*

---

## Where the build actually stands

**The redesign arc is one page from finished.** Home, the interactive map, the hike
page, Echoes, and Trail Crew all speak the engraved-atlas language. **`trip.html`
does not** — it is the last page still wearing the old skin (see item 1 below).

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
| **5 — New Summits** (expansion) | ◐ Trail Crew ✅, Observatory ✅, hero film + map expedition ✅. **Park Badges, Gear catalog, Year in Review, achievement badges pending. Photo privacy gate cut** |

---

## Closed since the July plan was written

- **The hike page redesign, all four stages except the last.** The Cartographer's
  Light Table shipped; the sheet lands on map.html; hike.html traded its strip for
  the doors. **Stage 3 is now done too** — the Surveyor's Chain (`atlas-chain.js`)
  is live on the map, the deck's old year-banded scrub is retired, and the
  explicitly-deferred bug ("returning from a hike page resets the animation to the
  end") is fixed: `restoreLandState` restores `inkIx` and parks the chain on it.
  **Only stage 4 remains** — the trip page, the retirements, the docs.
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

**2. `trip.html` is the last page in the old visual language.** Navy photo hero
with white overlay text, floating white stat cards, green underlined headings, a
default-styled Leaflet map with zoom controls, and the retired timeline strip on
top. Every other page has moved on; this one is jarring beside them.

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

## Decisions locked (unchanged)

- **Single track, features first.** No parallel work.
- **Mobile** deferred until the site is near-final.
- **Park badges** get procedural placeholder art now; commissioned art drops in later.
- **Park type is derived from `location`**, not a new field.
- **The journal + The Overlook voice** deferred until the build is further along.
- **AI descriptions stay** as the field-guide layer beneath Danny's journal words.
- **Photo privacy gate: cut.**
- **Canada:** `region` stays "City, PROV"; hikes abroad classify by province/territory.

---

## The roadmap from here — one track, in order

Sequencing logic: fix what's visibly wrong before adding anything new; finish the
redesign arc; then build the new rooms; batch the taxonomy change last, over the
complete set.

### 1. Canada readiness  *(small, and overdue — it's live)*
- A province name map and a **silhouette source for provinces** matching the US
  map's style, so BC gets a real tile.
- Fix the "N states" wording → states *and* provinces/countries, everywhere it appears.
- Deep-link BC's tile the way state tiles link (`map.html?state=…` equivalent).
- Teach `new-hike.py` the province convention.
- Safe as-is: interactive map, weather almanac (Open-Meteo is global), park badges.

### 2. Trip page redesign + the retirements  *(stage 4 — closes the redesign arc)*
The last page in the old language, and the natural home for the leftover cleanup:
retire `timeline-nav.js` and the dead deck scrub, and bring the docs current. The
proven method applies — concepts → mockups → build — and there's a strong starting
question already: a trip is a **chapter**, and the map's expedition engine already
knows what a chapter is.

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
