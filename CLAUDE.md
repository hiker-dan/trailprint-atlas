# CLAUDE.md — The Trailprint Atlas

Working guide for Claude (and any future collaborator) on this project. Its companion is
[docs/STATE_OF_THE_ATLAS.md](docs/STATE_OF_THE_ATLAS.md) — the living plan of record (the
July 2026 revision; the original six-phase audit lives in git history). Read that for
*where we're going*; read this for *how to work here*.

## What this is

The Trailprint Atlas is a living journal of Danny's hiking life — a personal memoir told
through maps, data, and (eventually) his own words. The audience is friends and family, not
the public. It is intentionally **not** a generic hiking app: every design choice should make
it feel more like *his* atlas.

Guiding principles (inherited from the project's first charter, still true):
- **Data as narrative** — don't just show numbers; make them tell the story of a day outside.
- **Visual first** — map-centric, natural palettes, clean and immersive.
- **Simplicity & power** — vanilla web tech, no frameworks, no build step. Craft over tooling.
- **Personal & authentic** — the voice belongs to Danny. See "The voice rule" below.

## How we work together (read this first)

Danny is a non-coder ("vibecoder at best"). Claude is his hands-on technical partner.

1. **Explain everything in plain English as you go** — what you're doing and why.
2. **Small visible steps.** He watches changes land live via the VS Code Live Server
   extension. After each meaningful change: say what changed, where to look in the browser,
   and **wait for his OK** before moving on. Never one giant batch.
3. **Decisions in Part V of the roadmap are his.** Ask one at a time, at the moment the
   decision actually blocks work, with a recommendation and plain-English reasoning.
   Decided so far (June 2026): "Miles Hiked" counts **every hike including repeats**;
   the nav link to the latest hike is labeled **"Logbook"**.
4. **Desktop first.** All mobile-specific work is deferred to its own future phase. Don't
   "fix" mobile things in passing. Performance work (payload size, load speed) is in scope —
   it benefits everyone.
5. **Git: no feature branches.** Solo project. Once Danny approves a chunk of work, commit
   straight to `main` and push — GitHub Pages deploys it live immediately. Keep commits
   small and verified; the site should work at every commit.

### The voice rule

The `notes` field, The Overlook personal statement, and the loading phrases are **Danny's
words only** — draft nothing there without his raw material, and only ever edit, never invent.
The `description`/`flora`/`fauna` fields are the AI-drafted "field guide" layer; drafting
there is fine, with his review.

## Stack (the real one)

- Static site: HTML + CSS + vanilla JS (ES6+). **No build step, no bundler, no framework.**
- [Leaflet 1.9.4](https://leafletjs.com) + leaflet-gpx 1.7.0, pinned from CDNs in each page's HTML.
- **Cloudinary** (cloud name `dgdniwosl`) serves all photos via URL transforms
  (`w_800,h_600,c_fill,q_auto,f_auto/...`). Free tier.
- **Open-Meteo archive API** powers the Hike Almanac (historical weather + sunrise/sunset).
- Hosted on **GitHub Pages**. Total cost: $0/month. This architecture is a deliberate,
  audited choice — renovate it, don't replace it.
- **Local dev:** must be served over HTTP (fetching local `.json`/`.gpx` fails from
  `file://`). Danny uses the Live Server VS Code extension.

## File map

| Path | What it is |
|---|---|
| `index.html` | Homepage shell for the July 2026 redesign, section by section: the hero film + Odometer (`scripts/home.js`), Threads of the Trail (`threads.js`), The Observatory (`observatory.js`), The Record Books (`records.js`). A small inline sessionStorage/reduced-motion check stays inline by design (must run before first paint — it fast-forwards the hero film for repeat visits and reduced-motion visitors). |
| `404.html` | Branded "Off the Trail" page (GitHub Pages serves it for bad URLs). Self-contained on purpose — no relative assets. |
| `scripts/config.js` | `ATLAS_CONFIG` (Cloudinary cloud + `cloudinaryUrl()`, year colors, type icons, `STAMPS` — the hand-drawn hike-type SVG glyphs rendered via `atlasStampSvg()`, seasons) + `blurUpShow()`/`blurUpPreload()` — the lightbox photo loader: hover warming + after-landing neighbor preloads make flips land instantly; the current frame simply holds while a cold photo travels. **No placeholder states by decision** (a holding card was tried and retired July 2026 — every variant flickered; don't reintroduce one). Load before all other Atlas scripts. |
| `scripts/atlas-data.js` | Data layer: cached `fetchHikes()`/`fetchTrailGeometries()`, `groupByTrail`/`groupByTrip`, `hikeYear`/`hikeMonth`, `formatHikeDate`, `compareHikesChrono`/`Desc`, `getAtlasStats`. |
| `scripts/nav.js` | Injects the single shared nav structure (synchronously) + the site footer on every page. |
| `scripts/home.js` | All homepage logic: **The Life in Trails** hero film (one SVG built from every trail's geometry; viewBox-driven zoom — never an animated transform, which GPU-snapshots and blurs — over static rings of Esri Shaded Relief tiles; skip/replay button, plays once per session), the Odometer stats reels, and the nav loading-bar phrases (Danny's words), all coordinated through `AtlasIntro`. `?p=0..1` freezes the film at a zoom progress for headless screenshot verification. |
| `scripts/threads.js` | **Threads of the Trail** (homepage): the milestone field sheet — a procedural vintage USGS quadrangle (seeded contours, a lake, full map collar) with brass benchmark disks planted along a fixed spine, hover focus cards. Milestones computed live from hikes.json. Styles in `styles/threads.css`. |
| `scripts/observatory.js` | **The Observatory** (homepage): profile line, the Effort Field scatter, Territories tiles, **The True Ascents** (summit climbs as their real elevation profiles from `data/elevations.json`, hazed panorama + fixed field card — no floating tooltip over the profiles), **The Cadence** year-wheel, and **The Specimen Drawer** (biome cabinet; hand-picked photos via the `SPECIMEN_PICKS` map — the section's one deliberate photo exception). |
| `scripts/records.js` | **The Record Books** (homepage closer): four standing-record crowns + the expedition podium — guideposts into hike and trip pages. |
| `map.html` + `scripts/map.js` | Interactive map (rebuilt July 2026): full-bleed map, floating Atlas-crafted cards, and the **expedition engine** — Chapters of the Land + the Expedition Line. **The camera never moves on screen: it is always parked on a scene or cutting behind the veil**, which lifts only when the tile sheets report loaded (live multi-zoom camera flights were tried three ways and rejected — never reintroduce them). All motion belongs to the ink: trails draw themselves along their GPX; a dashed journey line travels trailhead-to-trailhead between chapters. Structure (airtight, data-driven): **chapter** = a tagged trip that truly left home / a home stretch / a lone far-away day hike ("sortie"); distance overrides trip tags (local overnights stay home, `SORTIE_KM = 73`); **scene** = consecutive legs sharing one `location` tag; the camera parks per **shot** (scene legs merge only while their union still frames at z12 or closer — lone stops get the tightest frame); scene/shot changes are textless veil blinks, chapter changes get one combined ceremony slide. **Time-aware ink**: every VISIT owns its own stroke — the newest visible visit rides solid in its year's color, earlier visits fade to echo whispers, markers and the gold repeat ring follow `nowT` (never render a trail in a future year's color). Trailheads wear **stamps**, not pins (July 2026): a small year-ink dot at the exact point + the type's engraved SVG glyph (`ATLAS_CONFIG.STAMPS`) seated beside it, offset away from the trail's own ink (`stampVector` — opposite the bisector of the opening/closing bearings) and zoom-gated: below `ICON_REVEAL_ZOOM` the stamps fold into their dots. Gold repeats = ring on the dot + gold-leaf halo behind the glyph. The deck is the whole console: the **field plaque** (expedition ledger, no photo by decision) + transport + a per-leg year-banded timeline (labels live inside the track); rapid steps buffer ~1.2s before settling; any jump renders trails AND journey lines as if watched through. Free exploration: docked field card on click, the **finder** (search-first trail list — replaced the register drawer; filters the list, never the map), and the **control rail** (filters/key/basemaps in one column so panels can't overlap); `nowT` still drives the reveal. Basemap wardrobe: Atlas (CARTO Voyager + Esri World Hillshade multiply, crisp to z16, under the parchment wash + CARTO labels tinted beneath it), Topo, Satellite — crossfaded. At rest the chrome recedes (register tucked, key folded, engraved wordmark). `?state=XX` deep-links; `?leg=N` (+`&cinema=1`) are headless-screenshot hooks. The reference mockup lives at `mockups/map-chapters.html`. |
| `hike.html` + `scripts/hike-detail.js` | Single-hike page — **The Cartographer's Light Table** (rebuilt July 2026): one desk seen from above, holding the **slides** (left), the **sheet** (centre), the **paperwork** (right). Spec mockup: `mockups/hike-light-table-v2.html`. **The map never pans or zooms** — this page displays one GPX framed as large as the sheet allows; roaming belongs to map.html. Two stacked, identically-framed maps (topo clipped over satellite) are wiped by the **brass rail**, which the TOPO/AERIAL tab-pulls also drive; the framing pads for the rail's travel + knob so brass can never sit on the track. The sheet reads title block → **vitals band** (miles/gain/summit/grade as large engraved numerals, where a survey sheet carries them — viewpoints suppress it) → map → **acetate** → lower collar (provenance + scale bar). The acetate (`scripts/shape-of-day.js`) is bolted *under* the map so scrubbing the day's shape always happens with the trail in view; it walks a marker along both glasses. Its height is **fixed** (`ACETATE_PLOT_PX`), *not* AtlasShape's honest elevation-proportional scale — the map is the point of this page, and relative climb height is the home page's True Ascents. The gridline step adapts instead (`niceStep`): steep days step in 500s, flat ones in 5s. `⤢` gives the map the whole screen (Esc exits). Photos are **35mm slides**: a scrollable column, dim until hovered, full lightbox on click (the site's only true photo interaction) — each mount holds a "developing" sheen until Cloudinary delivers, which does *not* contradict config.js's no-placeholder rule (that governs the lightbox flip). Title-block lines auto-tighten onto one row (`fitOneLine`) and wrap at full size rather than squash. The timeline strip is deliberately **untouched** — its future is its own conversation. |
| `trip.html` + `scripts/trip.js` | One trip's chapter (`trip.html?tag=<trip_tag>`): hero, headline numbers, combined journey map, day-by-day itinerary. |
| `scripts/timeline-nav.js` | The shared timeline strip — the spine of the Atlas — used by hike.html and trip.html (styles in `styles/timeline-nav.css`). |
| `echoes.html` + `scripts/echoes.js` | **Echoes of the Trail** (rebuilt July 2026): the Atlas in the present tense. Fresh Tracks (latest logbook entries), Trail Echoes (this month's anniversaries as scattered scrapbook snapshots; photo-less hikes become postmarked field notes), and **The Local Loop** — the Runyon Canyon shrine (tally wall, routes drawn to scale, roll-call, photo strip + in-site lightbox, Danny's own story text in the HTML — his words only). |
| `data/local-loop.json` + `data/local-loop/` | The Runyon Canyon record: 54 dated ascents with companions, both custom routes (simplified points + raw GPX archived), landmarks, photo IDs (`local-loop-##` on Cloudinary), links. **Deliberately outside hikes.json** so it never floods the Atlas's stats, maps, or crew tallies (Part V decision #4, resolved July 2026). |
| `crew.html` + `scripts/crew.js` | **Trail Crew**: core-crew field cards (10+ shared hikes, `CREW_CORE_MIN_HIKES` in config.js) + the full trail-register ledger with era bars; rows expand in place. All derived from `hiked_with` at load time. |
| `crew-member.html` + `scripts/crew-member.js` | One core-crew member (`?name=Will%20R.`): hero, combined map of every shared trail, full chronological list. Companion names on hike pages link here (core crew) or to the register (everyone else). Both crew pages share `styles/crew.css`. |
| `credits.html` | "The Overlook": hero slideshow + asset credits. Personal statement arrives in Phase 4. |
| `scripts/trail-renderer.js` | Shared renderer for both maps (`isInteractive` flag), plus `formatHikeText()` for `**bold**`/newline rendering. |
| `scripts/nav-updater.js` | Points the "Logbook" nav link at the most recent hike; highlights the active page. |
| `styles/` | `base.css` (the earthy palette as CSS custom properties + nav + footer) and one sheet per page or section: `home.css` (hero film + Odometer), `threads.css`, `observatory.css`, `records.css`, `map.css`, `hike.css`, `echoes.css`, `crew.css`, `trip.css`, `credits.css`, `timeline-nav.css`. No inline CSS anywhere except `404.html` (self-contained by design). |
| `data/hikes.json` | **The single source of truth.** All hike data. |
| `data/crew.json` | Trail Crew portrait registry: `{"Will R.": "crew-will-r"}` — hand-picked Cloudinary photos of core-crew members (face-aware `g_auto` crops). The ritual: Danny drops `Will R.jpg` into `intake/`, Claude uploads it (public ID `crew-will-r`, Media Library folder `trailprint-atlas/trail-crew`) and adds the entry. Missing entries fall back to a landscape from a shared hike. |
| `data/trails/*.gpx` | Raw GPX tracks, one per hike — the archival record. Never served to visitors. |
| `data/trails.geojson` | **Generated — don't hand-edit.** All trails, simplified, in one file for the map page. Rebuild with `python3 tools/build-trails.py` whenever a GPX is added or changed. |
| `data/elevations.json` | **Generated — don't hand-edit.** Per-hike smoothed elevation profiles (120 integer feet values, keyed by trail_id), distilled from the GPX by build-trails.py. Feeds the homepage's True Ascents panorama; any future feature needing a climb's shape reads this, never raw GPX. |
| `tools/build-trails.py` | The GPX → trails.geojson + elevations.json build script (stdlib-only Python; runs locally, never ships). Warns if hikes.json and data/trails/ disagree. |
| `tools/new-hike.py` | **The hike-entry pipeline** (Phase 3). Drop a GPX + photos into `intake/` (git-ignored), launch the wizard — double-click `New Hike.command`, or VS Code: Terminal menu → Run Task → "New Hike" (tasks in `.vscode/tasks.json`), or `python3 tools/new-hike.py` — and answer it. It derives what it can from the GPX and pre-fills the rest from the Atlas's own history (Phase 3.2): suggests the trail name from the GPX's embedded title, detects repeats by trailhead proximity/name and defaults last time's answers (miles/elevation still default to *this* GPX's estimate — outings differ), offers location/region used by previous hikes near the coordinates so spellings never drift, and asks the trip question before hike_type so a hike joining an existing trip defaults to that trip's established style (keeping a trip's map icons consistent). Then it writes the record at the top of hikes.json (textual splice — existing records stay byte-identical), files the GPX, uploads photos to Cloudinary — flat public IDs, auto-filed into the Media Library's `trailprint-atlas/tta_NN-trail-name` folder per hike (needs `tools/cloudinary-credentials.json`, git-ignored; copy the `.example` file) — rebuilds trails.geojson, and verifies everything. `--dry-run` rehearses without writing. Leaves description/flora/fauna empty — Claude drafts those in-session. Supports GPX-less viewpoint entries. |
| `assets/` | Icons, the US map SVG, the timeline mountainscape. |
| `docs/` | The roadmap (`STATE_OF_THE_ATLAS.md`) and historical documents (original PRD). |

## Data

### Adding a hike (the Phase 3 pipeline)

New hikes enter through `tools/new-hike.py` — see its file-map row above. The ritual:
Danny drops the AllTrails GPX export + photos into `intake/` → launches the wizard
(double-click `New Hike.command`, or the "New Hike" VS Code task) → mostly presses Enter
(miles/elevation default to the GPX estimate; he can type AllTrails' numbers instead) →
Claude drafts `description`/`flora`/`fauna` for review → check the page in Live Server → commit.
Records land in the exact format below; the wizard leaves the three prose fields empty,
so a record with an empty `description` means "drafting still owed."

### `hikes.json` schema (103 records as of July 2026)

Every page derives from this file. **Never hardcode hike data anywhere else.** When a feature
needs new per-hike information, the first step is always to add the field to the schema.

| Field | Type | Notes |
|---|---|---|
| `trail_id` | string | `"tta_NN"`, sequential. Used in URLs (`hike.html?id=tta_43`). |
| `trail_name` | string | Repeat hikes share the same name — grouping key for "unique trails". |
| `date_completed` | string | `"YYYY-MM-DD"`. **Always read in UTC** (see conventions). |
| `location` | string | Park / natural area (e.g. "Joshua Tree National Park"). |
| `region` | string | `"City, ST"` — the state abbreviation feeds the state map. |
| `primary_geography` | string | One of: Chaparral, Coastal, Coastal Chaparral, Desert, Mountain Forest, Riparian Canyon, Riparian Forest, Riparian Meadow, Urban Edge. Drives hike-hero color. |
| `miles` | number | Trail distance. |
| `elevation_gain` | number | Feet. |
| `summit_trail` | bool | If true, `summit_elevation` (ft) should be set; else it's `null`. |
| `summit_elevation` | number\|null | |
| `difficulty` | string | Easy / Medium / Hard. |
| `hike_type` | string | Day Hike / Backpacking / Day Trip / Overnight Trip / Car Camping / Viewpoint. Drives map icons. **Describes the outing style — essentially how you slept — not the individual walk** (decided June 2026). Pick by: slept on the trail → Backpacking; tent/campground → Car Camping; lodging (hotel/Airbnb) → Overnight Trip; home the same day, no overnight → Day Trip; standalone outing from home → Day Hike; a scenic stop that isn't a real hike → Viewpoint (overrides the rest). So a relaxed day hike taken *during* a lodging trip is **Overnight Trip**, not Day Hike. This is independent of `trip_tag` (icon category vs. specific-trip grouping): every hike on a given trip shares one core type, and it's the norm for a trip's members to all carry it. |
| `hike_size` | string | Solo / Duo / Group. |
| `hiked_with` | string[] | Names as `"First L."` (e.g. "Luke R."). Empty for solo. |
| `description` | string | AI-drafted field-guide text. May contain `**bold**` — render via `formatHikeText()`. |
| `flora`, `fauna` | string | One species spotlight each, "Name (Latin) — fact" format. |
| `notes` | string\|null | **Danny's journal — currently null on every record.** Phase 4 fills it. His words only. |
| `fire_memorial` | object | *Absent on most records — always guard.* `{ "fire": "Eaton Fire", "date": "YYYY-MM-DD" }` on trails that burned **after** the hike (5 records: Eaton/Palisades/Bridge fires, verified against real perimeters July 2026). Drives the hike page's muted memorial banner ("Hiked six weeks before the Palisades Fire…"). Hand-added after research — not a wizard question; edge-singed trails (Dawn Mine) get a factual sentence in `description` instead. No map mark, by design. |
| `trip_tag` | string\|null | Groups multi-day trips: `"Trip Name - Mon YYYY"`. Must match exactly across a trip's hikes. |
| `all_trails_url`, `official_trail_url` | string\|null | External links. |
| `latitude`, `longitude` | number | Trailhead coords — used for dots, viewpoint markers, weather. |
| `gpx_file` | string\|null | Filename in `data/trails/`. Null for viewpoints / missing tracks. |
| `recorded_times` | object | *Absent on all but one record — always guard.* `{ "start": "YYYY-MM-DDTHH:MM:SSZ", "end": "..." }`, **UTC**. The almanac's "On the Trail" clock normally rides on the GPX's own per-point timestamps; this field supplies it when a track has been **replaced** by a timeless AllTrails route download and the day's real hours are still known. Wins over the GPX when present. So far only `tta_88`, whose recording paused mid-hike and drew a false line on the return, so the route was re-downloaded for accuracy while the genuine 9:33 AM–12:05 PM window was preserved here (recovered from the original recording in git history). Add it by hand, like `fire_memorial` — not a wizard question. |
| `images` | string[] | Cloudinary public IDs (no URL, no extension). |
| `videos` | string[]\|null | YouTube URLs. *Field absent on older records* — always guard. |

### Naming conventions

- GPX files: `Trail_Name_MM.DD.YY.gpx`
- Cloudinary image IDs: `tta_NN-trail-name-##` (kebab-case trail name, 2-digit photo index)

## Code conventions

- **Viewpoints are not hikes** (decided July 2026). Any user-facing "hikes" tally excludes
  `hike_type: "Viewpoint"` — use `isViewpoint()` from atlas-data.js, never re-test the string.
  Where viewpoints appear they're named as such (map wordmark/deck, Territories tiles, trip
  stats); counts that legitimately mix both say **"outings"** (crew tallies, echoes). Crew
  tallies deliberately keep viewpoints — excluding them would demote real companions below
  the core-crew threshold (Rachel G. sits at exactly 10 shared outings).
- **UTC dates, always.** `date_completed` parses as UTC midnight; reading it with local-time
  getters shifts hikes a day for anyone west of UTC. Use `getUTCFullYear()` / `getUTCMonth()`
  etc. — never the local variants — when deriving year/month/day from hike dates.
- **Sort hikes with `compareHikesChrono` / `compareHikesChronoDesc`** (atlas-data.js) — never
  by `date_completed` alone. Multi-hike trip days share a date; the comparators break ties by
  tta number (assigned in the order hiked), so same-day hikes display in the order they
  happened instead of file order (which is newest-first, i.e. backwards).
- **Long-form text** (`description`, `notes`, `flora`, `fauna`) renders through
  `formatHikeText()` in `trail-renderer.js` — it converts `**bold**` → `<strong>` and
  newlines → `<br>`.
- **Year colors and hike-type icons** come from `ATLAS_CONFIG` in `config.js`. The year
  inks are GENERATED by `atlasYearInk()` (July 2026 "Blaze Rose" palette: golden-angle
  wheel, parchment-adjacent yellows banned, back-to-back years always ≥115° apart) —
  `COLOR_MAP` builds itself 2022 → current year, so a new year needs no edit. Never
  hand-add a year color; retune the formula instead. Icons: `STAMPS`/`atlasStampSvg()`
  on the map page, `ICON_MAP` PNGs on the older pages. Don't define color/icon maps
  elsewhere.
- Comments explain the *why*, not the *what*. `const` by default, `async/await` for fetches.
- Phase 1's structural debts are all retired (five nav copies, hardcoded Cloudinary name,
  per-page data/date logic in 1.1–1.4; inline CSS extracted to `styles/` in 1.5). New CSS
  goes in the page's stylesheet — or `base.css` if genuinely shared — never inline. Reuse
  the palette variables (`--trail-green`, `--evergreen`, `--charcoal`, …) from `base.css`
  instead of hardcoding hex values.

## History

GEMINI.md (the previous collaboration charter) was replaced by this file in June 2026 —
its philosophy survives above; its tech claims and roadmap were stale. The original PRD
lives in `docs/` as a historical record. The roadmap that governs current work is
**docs/STATE_OF_THE_ATLAS.md** (Phase 0 completed June 2026).
