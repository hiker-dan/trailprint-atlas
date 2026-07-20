# State of the Atlas — July 2026

*The living plan of record for The Trailprint Atlas. This July revision supersedes the
June 2026 audit (preserved in git history), which had done its job: the original
six-phase roadmap is now substantially complete, and two full redesigns that weren't
even in that plan have since landed. This document is where we are and where we're going.*

---

## How we got here (June → July 2026)

The June audit delivered its verdict — *renovate, don't rebuild* — and we executed it.
Phases 0–2 (bug-fixing, architecture, performance) are done. The hike-entry pipeline
shipped (Phase 3). Then the work outran the plan: we rebuilt the **home page** (The Life
in Trails hero film, Threads of the Trail, The Observatory, The Record Books), rebuilt the
**interactive map** (Chapters of the Land + the Expedition Line — a locked-camera cinematic
expedition), rebuilt **Echoes** (Fresh Tracks, Trail Echoes, the Runyon Canyon Local Loop),
and shipped the **Trail Crew** companion pages. None of those were in the June roadmap; they
became the heart of the site. The map redesign closed in July with the engraved trailhead
stamps, the formula-driven **Blaze Rose** year palette, glowing echo halos, and
footprint-based framing.

So the six-phase structure has served its purpose. What follows is a fresh accounting.

---

## Status of the original six phases

| Phase | State |
|---|---|
| **0 — Trailhead** (housekeeping) | ✅ Done |
| **1 — New Bones** (architecture) | ✅ Done (config.js, atlas-data.js, single nav, extracted CSS/JS) |
| **2 — Pack Lighter** (perf + mobile) | ✅ Perf done (GPX→geojson pipeline, SVG optimization, intro skip). ⏸ **Mobile still deferred by choice** |
| **3 — Catch Up the Logbook** (data) | 🔜 Pipeline shipped (`new-hike.py`); **backlog nearly finished** (109 records through May 2026, a few months of 2026 left). Runyon became Echoes' Local Loop |
| **4 — Find Your Voice** (storytelling) | ◐ Trip pages ✅, Local Loop ✅, elevation profiles ✅, fire memorial ✅, loading phrases ✅. **Journal (`notes`) and The Overlook statement still empty — deferred** |
| **5 — New Summits** (expansion) | ◐ Companions (Trail Crew) ✅, Data Deep-Dive (Observatory) ✅, Trailprint Replay (hero film + map expedition) ✅. **Park Badges, Gear catalog, Year in Review, achievement badges pending. Photo privacy gate cut** |

---

## Audit: what still needs attention

Rendering the un-redesigned pages against the new engraved-atlas language surfaced these,
most urgent first:

1. ~~**The hike page is the single biggest gap.**~~ ✅ **Rebuilt July 2026** as The
   Cartographer's Light Table (see roadmap item 1). It was the most-visited page type and
   the only one that never got the redesign; it now speaks the same engraved language as
   the map, and it is ready to hold the journal when the voice arrives.
2. **The Overlook has no voice.** A lovely photo slideshow + asset credits, but the personal
   statement — the "why I built this" — is still absent. Deferred with the journal (your words).
3. **The geography taxonomy has a real smell.** The 9 categories are wildly lopsided:
   Desert 33, Mountain Forest 21, Chaparral 21 … then singletons — **Coastal (1),
   Riparian Meadow (1)**, Riparian Forest (3), Coastal Chaparral (4). One-member categories
   usually mean the taxonomy is too fine or miscatalogued. Deep dive owed — after the backlog.
4. **Mobile is the deferred elephant.** Every rich thing built this year is desktop-only;
   the audience is family on phones. Correctly deferred, but the gap grows with each
   desktop-only marvel. Scheduled for when the build is near-final (Danny's call).

---

## Decisions locked (July 2026)

- **Single track, features first, backlog last.** No parallel work — the build needs Danny's
  focused energy; the backlog is the satisfying finishing move.
- **Mobile** deferred until the site is near-final.
- **Park badges** get procedural placeholder art now; commissioned art drops in later.
- **Park type is derived from `location`, not a new field** (see below).
- **The journal + The Overlook voice** deferred until the build is further along.
- **AI descriptions stay** as the permanent field-guide layer beneath Danny's journal words.
- **Photo privacy gate: cut.**
- **Canada:** `region` stays "City, PROV" (e.g. *Whistler, BC*); hikes abroad are classified
  by **province/territory**, the direct analog of US states.

---

## The refined roadmap — one track, in order

Sequencing logic: build a section's bones before its data; fix Canada before the Canada trip
enters; batch the taxonomy change once, over the complete set, at the end.

### 1. Hike page redesign  ✅ *(shipped July 2026)*
The biggest un-redesigned page and every trail's destination. The proven method ran again:
**five concepts → three mockups → build.** Danny chose **The Cartographer's Light Table** —
the hike as one desk seen from above. What shipped:
- The **brass rail**, grafted from the runner-up "Stereoscope" concept: one drag wipes
  between the topo survey and the satellite land, the route ink unbroken across the divide.
- The map is **locked** (no pan/zoom) and framed as large as the sheet allows — this page
  shows the GPX in its glory; roaming belongs to map.html.
- The **elevation acetate is bolted under the map** at a fixed height, so scrubbing the
  day's shape always happens with the trail in view.
- Photos became **35mm slides** on the light box (the old polaroid framing was rejected as
  carried-over furniture), with a proper full-glory lightbox — the site's one place with
  true photo interaction.
- The **vitals band**: distance, gain, summit and grade as large engraved numerals in the
  title block, where a real survey sheet carries them.

**Still open — the timeline nav / navigation architecture.** Deliberately parked, and the
harder half of the original question. Not a styling problem: now that map.html and the hike
pages are tightly bound, what is the right way to move between them, and does a per-hike
timeline strip still earn its place or duplicate the map page? The beloved scroll-through-time
strip is kept as-is until that session happens.

### 2. Canada readiness  *(must precede the backlog)*
The next trip to add (Whistler, BC) leaves the US. Work:
- **Rebuild the Territories tiles** (home / Observatory). The code already separates US states
  from "countries," but draws each tile's silhouette from `assets/blank-us-map.svg`, which
  has no provinces — a Canadian hike would render a blank tile labeled "BC." Needs: a
  province name map, a **silhouette source for provinces** (find/commission a Canada SVG that
  matches the US map's style), and honest counting.
- **Fix the "X states" summary wording** → states *and* countries/territories.
- **Region convention:** "City, BC" with province abbreviations; teach `new-hike.py`.
- Safe as-is: interactive map, weather almanac (Open-Meteo is global), park badges (they key
  off `location`). Watch the home hero film's framing when a far-north outlier joins.

### 3. Park Badges  *(the trophy case)*
A collectible-badge page for parks visited. **Park type derives from `location`** via a small
`parkTypeOf()` helper (same pattern as `isViewpoint()`) — the keyword classifier sorts every
current park with zero ambiguity into National Park / National Forest / National Monument /
National Recreation Area / State Park (incl. reserves & rec areas) / Local & Regional. No new
field; self-maintaining. **Procedural placeholder medallions** (engraved frames in the site's
language, emblem chosen by derived type) make the wall look intentionally collected from day
one; commissioned art drops into the identical frame, one park at a time. Auto-fills as hikes
are added.

### 4. Gear section bones
A `gear.json` schema + the page scaffold with empty slots — foundation now, slow-fill later.
"My first kit" → how it evolved. Data collection deferred; the bones come first (Danny's rule).

### 5. The backlog  *(the finishing data move)*
Enter the remaining months of 2026 — including Canada, now that prep is done — through the
pipeline. `hikes.json` is the sole source of truth going forward.

### 6. Geography deep-dive + reclassification
Done last, over the complete set: re-examine whether 9 is the right taxonomy, resolve the
singletons, reclassify in one batch.

---

## Deferred (revisit when the build is near-final)
- **The Voice** — the journal (`notes`, still 0/109) and The Overlook personal statement.
  Danny's words, shaped together; never invented.
- **The mobile pass** — all pages: touch timeline, tap-toggled tooltips, responsive type,
  thumb-reach layouts.

## Leftover, pick-and-choose (anytime)
- Year in Review pages (auto-stats + a retrospective paragraph, minted each January).
- Hike-specific achievement medallions ("First Backpacking Trip," "Highest Summit").

---

## Model note
Concept sketching and mockup-building both run on **Fable 5** — the divergent ideation stage
is where the capability edge shows up most (range and originality of concepts), not just the
coding.

---

*Revised July 2026 after the home, map, and Echoes redesigns. The June audit — the full
technical + creative teardown that set this all in motion — lives in git history. The trail
keeps going; so do we.*
