# CLAUDE.md — The Trailprint Atlas

Working guide for Claude (and any future collaborator) on this project. Its companion is
[docs/STATE_OF_THE_ATLAS.md](docs/STATE_OF_THE_ATLAS.md) — the full audit and six-phase
roadmap we are executing. Read that for *where we're going*; read this for *how to work here*.

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
| `index.html` | Homepage shell. Logic lives in `scripts/home.js`, styles in `styles/home.css`; a 5-line sessionStorage intro check stays inline by design (must run before first paint). |
| `404.html` | Branded "Off the Trail" page (GitHub Pages serves it for bad URLs). Self-contained on purpose — no relative assets. |
| `scripts/config.js` | `ATLAS_CONFIG` (Cloudinary cloud + `cloudinaryUrl()`, year colors, type icons, seasons). Load before all other Atlas scripts. |
| `scripts/atlas-data.js` | Data layer: cached `fetchHikes()`, `groupByTrail`/`groupByTrip`, `hikeYear`/`hikeMonth`, `formatHikeDate`, `getAtlasStats`. |
| `scripts/nav.js` | Injects the single shared nav structure (synchronously) + the site footer on every page. |
| `scripts/home.js` | All homepage logic: showcase map + intro choreography, stats, state map, seasonal chart, slideshows, loading-bar phrases. |
| `map.html` + `scripts/map.js` | Interactive map: all trails, filters, search, trail list, legend, dark-mode toggle. |
| `hike.html` + `scripts/hike-detail.js` | Single-hike page: timeline nav, hero, cycling map, gallery, almanac, logbook. |
| `achievements.html` | Personal records (longest hike, biggest climb, highest summit, busiest month). |
| `credits.html` | "The Overlook": hero slideshow + asset credits. Personal statement arrives in Phase 4. |
| `scripts/trail-renderer.js` | Shared renderer for both maps (`isInteractive` flag), plus `formatHikeText()` for `**bold**`/newline rendering. |
| `scripts/nav-updater.js` | Points the "Logbook" nav link at the most recent hike; highlights the active page. |
| `styles/` | `base.css` (the earthy palette as CSS custom properties + nav + footer) and one sheet per page: `home.css`, `map.css`, `hike.css`, `achievements.css`, `credits.css`, plus the `key-stats.css`/`map-stats.css` dashboard sheets. No inline CSS anywhere except `404.html` (self-contained by design). |
| `data/hikes.json` | **The single source of truth.** All hike data. |
| `data/trails/*.gpx` | Raw GPX tracks, one per hike — the archival record. |
| `assets/` | Icons, the US map SVG, the timeline mountainscape. |
| `docs/` | The roadmap (`STATE_OF_THE_ATLAS.md`) and historical documents (original PRD). |

## Data

### `hikes.json` schema (71 records as of June 2026)

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
| `hike_type` | string | Day Hike / Backpacking / Day Trip / Overnight Trip / Car Camping / Viewpoint. Drives map icons. |
| `hike_size` | string | Solo / Duo / Group. |
| `hiked_with` | string[] | Names as `"First L."` (e.g. "Luke R."). Empty for solo. |
| `description` | string | AI-drafted field-guide text. May contain `**bold**` — render via `formatHikeText()`. |
| `flora`, `fauna` | string | One species spotlight each, "Name (Latin) — fact" format. |
| `notes` | string\|null | **Danny's journal — currently null on all 71.** Phase 4 fills it. His words only. |
| `trip_tag` | string\|null | Groups multi-day trips: `"Trip Name - Mon YYYY"`. Must match exactly across a trip's hikes. |
| `all_trails_url`, `official_trail_url` | string\|null | External links. |
| `latitude`, `longitude` | number | Trailhead coords — used for dots, viewpoint markers, weather. |
| `gpx_file` | string\|null | Filename in `data/trails/`. Null for viewpoints / missing tracks. |
| `images` | string[] | Cloudinary public IDs (no URL, no extension). |
| `videos` | string[]\|null | YouTube URLs. *Field absent on older records* — always guard. |

### Naming conventions

- GPX files: `Trail_Name_MM.DD.YY.gpx`
- Cloudinary image IDs: `tta_NN-trail-name-##` (kebab-case trail name, 2-digit photo index)

## Code conventions

- **UTC dates, always.** `date_completed` parses as UTC midnight; reading it with local-time
  getters shifts hikes a day for anyone west of UTC. Use `getUTCFullYear()` / `getUTCMonth()`
  etc. — never the local variants — when deriving year/month/day from hike dates. (Sorting via
  `new Date(a) - new Date(b)` is fine.)
- **Long-form text** (`description`, `notes`, `flora`, `fauna`) renders through
  `formatHikeText()` in `trail-renderer.js` — it converts `**bold**` → `<strong>` and
  newlines → `<br>`.
- **Year colors and hike-type icons** come from `RENDERER_CONFIG` in `trail-renderer.js`
  (2022 blue → 2026 purple). Don't define new color/icon maps elsewhere.
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
