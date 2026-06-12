# State of the Atlas — June 2026

*A full technical and creative audit of The Trailprint Atlas, with a phased roadmap for its next chapter.*

---

## The Verdict First: Renovate, Don't Rebuild

You asked the big question directly — fresh repo and start over, or rebuild what exists? After reading every line of code, every data record, and the original PRD, my answer is clear: **keep this repo, keep this architecture, and renovate it in place.**

Here's the reasoning:

1. **Your data model is the crown jewel, and it's excellent.** `hikes.json` is a thoughtful, complete, internally consistent schema. All 71 hikes validate cleanly. Every one of the 75 GPX files on disk is referenced, and every referenced file exists — zero orphans in either direction. Six months of dust, and the foundation passes inspection. Data is the part of a project like this that's genuinely hard to recreate; code is the part that's cheap to reshape around it.

2. **The architectural bet was correct and remains correct.** Static site + GitHub Pages + Cloudinary free tier + Leaflet + vanilla JS = $0/month, no servers, no build step, no framework churn. For a solo-maintained, decades-horizon personal archive, this is not a compromise — it's the *right* answer. A React/Astro/Next rebuild would add a build toolchain you'd have to maintain, for almost no benefit at 71 (or 300) hikes. The site's problems are not caused by the architecture; they're caused by how the code is organized *within* it.

3. **The git history is part of the story.** Forty-five commits of this thing evolving — the timeline feature going through four redesigns, the state map being rebuilt — that's the project's own trailprint. Don't throw it away.

4. **What's actually wrong is refactorable.** The issues are real (detailed below): monolithic HTML files, duplicated code, a handful of genuine bugs, serious performance waste, and zero mobile consideration. But every one of these is a renovation task, not a teardown. A rebuild would burn weeks recreating features you already have, just to arrive at the same place with fresher paint.

The one structural change I *do* recommend: adding a small **local tooling layer** (scripts you run on your machine for GPX processing and hike entry — they never ship to the site). That gives us build-tool benefits with zero hosting complexity.

---

## Part I: What's Working Well — An Honest Appreciation

Before the critique, credit where it's due. This is not a beginner's mess. There's craft here.

- **The single-source-of-truth discipline held.** Every page derives from `hikes.json`. No hike data is hardcoded anywhere. Six months later, that's why this audit was even possible.
- **`trail-renderer.js` shows real architectural instinct** — one shared renderer with an `isInteractive` flag powering both the homepage dot-map and the full interactive map. That's the DRY pattern the rest of the codebase should follow.
- **The feature set is genuinely creative.** Ghost trails (faded halos showing repeat hikes), the trip-capsule timeline with hover expansion, seasonal background shifts with a parallax mountainscape, the historical weather almanac via Open-Meteo, the dark-mode "clean trailprint" toggle, the state map with computed tooltips. These aren't tutorial features — they're personal data-storytelling inventions.
- **The filters work correctly on grouped data** — search plus multi-select tags, client-side, with proper active-filter display and reset. Solid.
- **Consistent naming conventions** for GPX files (`Trail_Name_MM.DD.YY.gpx`) and Cloudinary images (`tta_XX-trail-name-##`) — these conventions are what will let us automate later.
- **You credited your asset sources** in a dedicated, designed page. Most personal projects never do.

---

## Part II: The Technical Audit

### A. Confirmed Bugs (things visitors can see today)

| # | Bug | Where | Detail |
|---|-----|-------|--------|
| 1 | **"Miles Hiked" undercounts; "Feet Climbed" doesn't** | `index.html` (stats calc) | `totalMiles` sums only one entry per unique trail (`group[0].miles`), but `totalElevation` sums every hike. Your 7 Tee Pee Trail laps count once for miles and 7× for elevation. The two headline numbers use different definitions of "hiked." |
| 2 | **Raw `**asterisks**` on hike pages** | `hike-detail.js:854`, `index.html:1275` | 5 fire-impacted hikes have `**Severely impacted by January 2025 Palisades fire**` in their descriptions. There's no markdown parsing, so visitors see literal asterisks. |
| 3 | **Timezone off-by-one in stats** | `achievements.html` (busiest month), `map.js` (year filter) | Dates parse as UTC midnight, then `getMonth()`/`getFullYear()` read in the *viewer's* timezone. For anyone west of UTC, a hike dated the 1st of a month counts toward the previous month/year. The seasonal chart does it correctly (`getUTCMonth`) — the codebase disagrees with itself. |
| 4 | **`setInterval` leak on the hike page** | `hike-detail.js` (`displayHike`) | Every timeline-dot click creates a new 15-second tile-cycling interval that is never cleared. Browse 10 hikes and 10 intervals fight over map layers (the old map is removed, but the timers live on). |
| 5 | **Two referenced assets don't exist** | `index.html:1502`, `trail-renderer.js:31`, `hike-detail.js:697` | `assets/landscapes/fallback-hero.jpg` and `assets/icons/hiker-icon.png` are both fallbacks that 404 when triggered. |
| 6 | **Trip tag year typo** | `hikes.json` (tta_43, tta_44) | "Lost Palms Oasis Backpacking Trip - Apr **2025**" on hikes dated April **2024**. |
| 7 | **Placeholder text is live in production** | `credits.html` | "Your personal story and mission will go here." is published on The Overlook page. |
| 8 | **Confusing nav label** | All 5 pages | The link labeled "Map Collection" actually opens the *latest hike's detail page* (`hike.html?id=<latest>`). A visitor clicking "Map Collection" gets one hike. |

### B. Structural Debt (why the code feels heavy to work in)

- **`index.html` is a 1,599-line monolith**: ~700 lines of inline CSS across three `<style>` blocks and ~550 lines of inline JS across four `<script>` blocks. `hike.html` is 985 lines, ~840 of them inline CSS. The named CSS files (`key-stats.css`, etc.) coexist with the inline blocks, so styles for one page live in up to four places.
- **The nav bar is hand-copied 5 times in two different structures** (index/achievements use the `top-bar-container` + `main-nav` pattern; map/hike/credits use a bare `<nav>`). The commit log shows you already fought one round of "make the navs match" — that battle will recur forever until the nav is defined once.
- **Config is scattered.** The Cloudinary cloud name `dgdniwosl` is hardcoded in 3 places (and one of them declares a `cloudName` const the other ignores). Color maps and icon maps live in `trail-renderer.js` (good), but date formatting and trail-grouping logic are re-implemented in 4+ files.
- **No `.gitignore`** — `.DS_Store` files are committed.
- **`GEMINI.md` is the stale ghost of a previous partnership** — and it contradicts reality (it declares "Key Libraries: None. We are committed to a vanilla JS approach" while the site rests on Leaflet + leaflet-gpx). It should be replaced by a `CLAUDE.md` that documents what's actually true.
- **README.md is a pasted PRD**, not a readme. Useful history, wrong place.

### C. Performance (the biggest invisible problem)

This matters because your stated audience is friends and family — who will open this on **phones, on cell connections**.

1. **The map page fires ~70 separate GPX requests totaling 8.2 MB of XML**, each parsed client-side by an outdated plugin (leaflet-gpx 1.7.0, pinned from CDN). The Pacific Crest Trail file alone is 694 KB / 5,345 trackpoints — for a line on a map that's maybe 300 pixels long. **A simplification pipeline (GPX → simplified GeoJSON, bundled into one file) would cut this to roughly 300–500 KB in a single request** — a ~95% reduction — with zero visible difference at map zoom levels. We keep the raw GPX files in the repo as the archival source of truth.
2. **`timeline-landscape-fall.svg` is 5.9 MB** — loaded on *every* hike page as a decorative background. It is, by itself, larger than all 71 hikes' worth of simplified trail data would be. It needs to be optimized (SVGO) or re-exported; this is likely a 5.9 MB → ~50 KB fix.
3. **The 10-second intro animation gates the homepage** on first visit with no skip button (only repeat visits within a session skip it via `sessionStorage`). Cinematic is good — *hostage* is not. It needs a tap/click-to-skip affordance, and probably a shorter cut on mobile.
4. **`hike-detail.js` re-fetches `hikes.json` on every back/forward navigation** instead of using the copy it already has.

### D. The Sharing Gap

For a site whose entire purpose is "this is how people who love me see my hikes," there is **no Open Graph / Twitter card metadata and no favicon**. When you text someone a link to a hike, they get a bare URL with no preview image, no title, no description. This is small to fix and disproportionately important to your mission.

### E. Mobile Reality Check

The PRD scoped mobile out of the MVP — fair. But the MVP shipped, and the audience is on phones. Today: the timeline is drag/hover-driven (hover doesn't exist on touch), the state map tooltips are hover-only, intro stat fonts use `3.5vw` (tiny on phones), and the hike-page two-column grid stacks but was never designed for thumb reach. **A mobile pass is no longer polish — it's the main door most of your visitors enter through.**

---

## Part III: The Creative Audit

This is the part I'd most want you to sit with, because the gap here isn't code — it's voice.

### 1. The Atlas currently has no *you* in it

The PRD's most beautiful line: *"This isn't just a map. It's a memory trail."* The GEMINI.md goal: *"a living digital memoir."*

Here's the honest measurement: **the `notes` field — the journal, the personal reflection, the *memoir* — is empty on all 71 hikes.** Every word a visitor reads was AI-generated: competent naturalist descriptions, flora/fauna factlets. They're good reference material. But the Atlas right now tells people *what the trail is*, and never once *what it was like to be you on it*. Your own roadmap flagged this ("De-AI-ify the website") — it's the single highest-value creative investment available, and no amount of feature work substitutes for it.

The fix doesn't require you to write 71 essays. A journal line can be one sentence ("First time I understood why people do this"). Phase 4 lays out a workflow where you voice-memo or bullet-point memories and we shape them together — your words, lightly edited, never invented.

### 2. Your best stories have no stage

You have 13 trip tags — the PCT backpacking trip, Big Sur, three Joshua Tree eras, the NY→LA road trip, the East Coast summer. These are the *expeditions* of your hiking life, and right now they exist only as a label and one rotating homepage panel. **Trips deserve their own pages**: a combined map of all days, the route between trailheads, cumulative stats, a day-by-day narrative arc, the photo set. This is the difference between an atlas and a memoir — chapters.

### 3. The Runyon Canyon Record is invisible

Your spreadsheet has a third sheet: **41 ascents of Runyon Canyon, 2022–2023**, with companions logged. None of it is in the Atlas. This is one of the best stories you have — the *hometown trail*, the default walk, the one you took everyone to. It shouldn't be 41 near-identical JSON entries cluttering the map; it deserves a designed feature ("The Local Loop" — a counter, a companions list, a love letter to the unglamorous trail that started it all).

### 4. The GPX files contain unused storytelling gold

Every AllTrails GPX has **timestamps and elevation on every trackpoint**. Currently unused. That data contains: actual start time ("boots on trail at 6:42 AM"), duration, pace, and the full **elevation profile** — the literal shape of the day's effort. The almanac section (sunrise/sunset/weather — already one of the site's best ideas) is begging to be joined by "you started 19 minutes before sunrise."

### 5. The fire annotations deserve better than bold text

Five trails carry notes that they burned in the January 2025 Palisades and Eaton fires — trails that, in some cases, no longer exist as you hiked them. Right now that's a broken-markdown footnote. It could be one of the most moving things in the Atlas: a designed "memorial" treatment — a small flame mark on the map, a muted banner on the hike page ("This landscape was transformed by the Eaton Fire, January 2025. This record preserves it as it was."). Your GPX files are now historical documents. That's worth honoring properly.

### 6. The people are data, not characters

`hiked_with` faithfully logs Max M., Luke R., Will R., Hannah M. — but no view answers "who has walked this with me?" A **Companions page** (each person: hikes shared, miles together, first/latest hike) would be deeply in the spirit of "I built this instead of having social media." It's the feature version of a photo wall.

### 7. Identity details that signal care

No favicon, no link previews (covered above), the title "The Trailprint Atlas" set against loading phrases you've already said you want to rewrite in your own voice. Small things; they're the handshake.

---

## Part IV: The Roadmap

Six phases. Each is independently shippable — the site works and looks better after every one. Order matters: fix the foundation before building on it, catch up the data before designing around it.

### Phase 0 — Trailhead *(housekeeping; one short session)*
> Clear the deadfall before the climb.

- [ ] Fix all 8 confirmed bugs from Part II-A (stats definitions, markdown rendering, timezone-safe date utils, interval leak, missing assets, trip-tag typo, nav label, placeholder text or hide The Overlook until written).
- [ ] Add `.gitignore`; remove `.DS_Store` files.
- [ ] Replace `GEMINI.md` with `CLAUDE.md` — the new working contract, describing the *actual* stack, conventions, data schema, and roadmap (this document becomes its companion).
- [ ] Rewrite `README.md` as a real readme; move the PRD to `docs/` as historical record.
- [ ] Add favicon + Open Graph/Twitter meta tags to all pages (hike pages get per-hike previews in Phase 2 when we restructure).

### Phase 1 — New Bones *(architecture renovation; 1–2 sessions)*
> Same house, real framing.

- [x] Extract all inline CSS into a clean shared system: `styles/base.css` (typography, colors as CSS custom properties, nav, footer) + one stylesheet per page. Define the earthy palette once.
- [ ] Extract all inline JS from `index.html` into `scripts/home.js`.
- [ ] Create `scripts/config.js` — Cloudinary cloud name + image URL builder, color/icon maps, season definitions. One place.
- [ ] Create `scripts/atlas-data.js` — shared data layer: fetch + cache `hikes.json`, group-by-trail, group-by-trip, UTC-safe date helpers, canonical stats functions (used by home, map, achievements — ending the "three definitions of total miles" problem).
- [ ] Single nav component (one JS-injected partial), ending the five-copies problem. Include a real footer with attribution links.
- **Exit test:** every page renders identically to before (minus bugs), and `view-source` on index.html fits on a few screens.

### Phase 2 — Pack Lighter *(performance + mobile; 1–2 sessions)*
> The Atlas should load like a day pack, not a bear canister.

- [ ] Build `tools/build-trails.py` (or Node — runs locally, never ships): parses every GPX, simplifies geometry (Douglas-Peucker), extracts per-hike derived stats (start time, duration, elevation profile, actual distance), and emits one compact `data/trails.geojson` for the map page + small per-hike profile data. Raw GPX stays in repo as archive. Target: map page payload from ~8.2 MB → under 500 KB, one request instead of 70.
- [ ] Drop the leaflet-gpx plugin on the map page (render GeoJSON natively); keep or replace it on the hike page.
- [ ] Optimize `timeline-landscape-fall.svg` (5.9 MB → tens of KB).
- [ ] Intro animation: add click/tap-to-skip, shorten on mobile, keep the cinematic full cut for desktop first visits.
- [ ] Mobile pass on all five pages: touch-friendly timeline (tap instead of hover, momentum scroll), tap-toggled state-map tooltips, responsive type scale, thumb-reachable hike-page layout.
- **Exit test:** the map page loads fast on a throttled mobile connection, and every feature is usable with a thumb.

### Phase 3 — Catch Up the Logbook *(data; ongoing sessions, parallelizable with Phase 4)*
> A living atlas needs its missing years — and a faster pen.

- [ ] **Build the 5-minute hike-entry pipeline** (the PRD promised this; it's why the Atlas went quiet). New workflow: you drop a GPX export + photos + a few quick facts (companions, difficulty, trip tag, a memory line) → a `tools/new-hike` script extracts date/distance/elevation/coords from the GPX, scaffolds the JSON entry, and renames files to convention → I draft description/flora/fauna for your review → you approve, we commit. Target: under 5 minutes of *your* time per hike.
- [ ] Backfill **all 2025 and 2026 hikes** (currently absent from both spreadsheet and site) using that pipeline.
- [ ] Migrate the spreadsheet's role: `hikes.json` becomes the sole source of truth going forward; the spreadsheet is archived as historical input. (One tool, not two, or they'll drift.)
- [ ] Decide and implement the **Runyon Canyon Record** treatment (see Phase 4's "Local Loop").
- [ ] Fill data gaps where recoverable: 6 hikes missing GPX, 9 missing images.

### Phase 4 — Find Your Voice *(the storytelling layer; 2–3 sessions + your words over time)*
> The phase that turns an atlas into a memoir.

- [ ] **The journal workflow:** for each hike (starting with the ~15 that matter most), you give me raw material — voice memo transcript, bullet points, a text — and we shape a short entry in *your* voice. Hike pages get a designed journal treatment (your words visually distinct from, and above, the reference description).
- [ ] **Trip pages:** `trip.html?tag=...` — combined multi-day map, cumulative stats, day-by-day timeline with photos and journal, prev/next day navigation. Trip tags across the site become links. The homepage "Grand Traverse" panel links into them.
- [ ] **The Local Loop:** the Runyon Canyon feature — 41 ascents, the companions roll-call, designed as a love letter to the hometown trail.
- [ ] **Hike page upgrades from GPX gold:** elevation profile chart (the shape of the day), start time + duration in the almanac ("on trail at 6:42 AM, 19 minutes before sunrise").
- [ ] **The fire memorial treatment:** designed banner + map mark for burned trails, replacing the broken bold text.
- [ ] **Write The Overlook** — your personal statement, your thanks. Your words; I'll only edit.
- [ ] Rewrite the loading phrases in your own voice (your "De-AI-ify" item).

### Phase 5 — New Summits *(expansion; pick-and-choose, in rough priority order)*
> The once-in-a-lifetime features, built on a foundation that can hold them.

- [ ] **Companions page** — every person you've shared a trail with: hikes together, miles, first/latest adventure.
- [ ] **Park Medallions** — the trophy case for parks visited (needs `park_type`/`park_name` fields added in Phase 3's pipeline; National Parks, State Parks, National Forests as collectible badge art).
- [ ] **Year in Review pages** — "2024: 34 hikes, the Sierra summer, the PCT" — auto-computed stats + your retrospective paragraph; new ones mint each January.
- [ ] **Trailprint Replay** — animated time-lapse of the map drawing itself hike by hike, 2022 → now. (The intro animation already gestures at this; this is the full realization.)
- [ ] **Data Deep-Dive page** — the dashboard the PRD imagined: elevation vs. distance scatter, cumulative miles over time, difficulty mix by year.
- [ ] **Hike-specific achievement medallions** — "First Backpacking Trip," "Highest Summit," "First Hike in a New State" badges on hike pages.
- [ ] **Gear catalog** — the firsts and the favorites (your Phase 2 idea, preserved).
- [ ] **Photo privacy gate** — simple passphrase before galleries load (your Phase 3 idea; honest framing: it's a curtain, not a vault — fine for its purpose).

---

## Part V: Decisions I Need From You

Everything above I can execute, but five calls are yours:

1. **Miles semantics:** Should "Miles Hiked" count every hike including repeats (my recommendation — it's the truth of your boots), with "Unique Trail Miles" as a secondary stat? Or keep unique-only?
2. **The intro:** Keep the 10-second cinematic open (with a skip button added), shorten it, or retire it in favor of an instant-load hero?
3. **AI descriptions:** Keep them as the "field guide" layer alongside your journal (my recommendation — they're useful reference), or progressively replace them with your own words?
4. **Runyon Canyon:** Designed "Local Loop" feature (my recommendation), full 41 JSON entries, or leave it out?
5. **Photo privacy:** Still want the passphrase gate from your old roadmap, or has your thinking changed?

---

*Compiled June 10, 2026 — from a full read of all 5 pages, 4 scripts, 4 stylesheets, 71 hike records, 75 GPX files, the original PRD, the Gemini-era roadmap, and the source spreadsheet (all three sheets). The trail's still there. Let's get back on it.*
