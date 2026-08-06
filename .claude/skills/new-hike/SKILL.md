---
name: new-hike
description: Add a hike to the Atlas end to end — run the entry wizard, then finish the four things it deliberately leaves owed (USGS elevation correction, summit_elevation, the almanac, and the drafted field-guide prose). Use when Danny has dropped a GPX and photos into intake/, or asks to "add a hike", "log a hike", "enter the new hike", or when a record is missing its description.
---

# Adding a hike to the Atlas

`tools/new-hike.py` does the entry. It does **not** finish the job, and what it leaves undone
fails silently. This skill is the whole ritual.

## Step 1 — Danny runs the wizard

He drops the AllTrails GPX export and the photos into `intake/` (git-ignored), then launches it
himself — double-click `New Hike.command`, or VS Code's Terminal → Run Task → "New Hike", or:

```bash
python3 tools/new-hike.py            # --dry-run rehearses, writes nothing
```

It is his to answer: it derives what it can from the GPX and pre-fills the rest from the Atlas's
own history, so he mostly presses Enter. **Do not run it for him** unless he asks — the answers
are his, and several are judgement calls (miles, difficulty, hike type, the trip star).

What it does write: the record at the top of `hikes.json` (a textual splice, so existing records
stay byte-identical), the GPX into `data/trails/`, the photos to Cloudinary, a `TRIP_STARS` entry
in `scripts/config.js` if the hike joins a starless trip, and a rebuild of `trails.geojson`.

## Step 2 — The elevation correction the wizard cannot do

**This is the part that fails silently, and it is the reason this skill exists.**

The wizard runs `build-trails.py` at the end (its step 4). But it does **not** run
`correct-elevations.py` first, and it cannot: the GPX has only just been filed. So the profile
written into `elevations.json` for the new trail comes from **raw GPS altitude**, which reads
15–130 ft high.

Nothing warns you. The site loads. The graphs are just wrong.

So after the wizard, always:

```bash
python3 tools/correct-elevations.py          # asks USGS 3DEP for the true ground
python3 tools/build-trails.py                # AGAIN — now it picks up the correction
```

`build-trails.py` names any trail still riding on raw GPS altitude in its output. Read that list.
The new hike must not be on it.

## Step 3 — `summit_elevation`, which no tool writes

If the hike is a summit, the wizard deliberately left `summit_elevation` as `null` and told Danny
it "will be measured from the track." That measurement lands in `data/ground-elevations.json`,
under the trail's id, as `high_ft`.

**No script copies it into `hikes.json`.** That is a hand edit, and it is owed on every summit
hike. Take `high_ft` for the new `trail_id` and write it into the record's `summit_elevation`.

The Atlas records **the boots, not the peak** — the height of the highest ground actually walked.
A loop that tops out 17 ft below Mount Waterman's true summit says 8,020, not 8,038. The
mountain's own height is context and lives in `peak_name`.

A summit with no named peak is still a summit: `peak_name` stays `null`, `summit_trail` stays
true, and it reads "High Point" through `summitLabel()`.

## Step 4 — The rest of the generated data

```bash
python3 tools/build-almanac.py               # weather + sunrise/sunset + on-trail window
python3 tools/build-countries.py             # self-guarding; catches a new country for free
```

See the `rebuild-data` skill for why `build-countries.py` belongs in every run rather than only
when you think a new country appeared.

## Step 5 — Check the clock, if the track came from onX

Some apps thin the recording on export and re-stamp the survivors on a synthetic cadence: the
route survives, the timing does not. Measured, onX's web export put points 5.3–7.8 m apart and
peaked at 8–20 mph, printing "1h 08m" on a 7.2-mile day.

```bash
python3 tools/check-track-clock.py <gpx or the whole logbook>
```

That file **owns the thresholds** (>4.0 mph whole-track average, >6.0 mph 95th-percentile step).
`build-almanac.py` imports its `assess()`; `shape-of-day.js` mirrors it. Retune there, not here.

If a track is flagged, **never rewrite the GPX**. The real window can be recovered from photo
GPS EXIF and preserved by hand in `recorded_times` (UTC), which wins over the GPX when present.

## Step 6 — The prose Claude owes

The wizard leaves `description`, `flora` and `fauna` empty on purpose. An empty `description`
means drafting is still owed. Draft all three, then give them to Danny to review.

- **`description`** — the AI-drafted field-guide layer. **~60–70 words, two or three tight
  sentences.** May use `**bold**`, which renders through `formatHikeText()`.
- **`flora`** and **`fauna`** — one species spotlight each, in `Name (Latin) — fact` format.
  That format's dash is the one em-dash that stays; avoid interjecting em-dashes anywhere else,
  they read as AI.

**`notes` is Danny's journal and stays `null`.** Never draft there, never "helpfully" fill it.
Same rule for The Overlook statement and the loading phrases. That is the voice rule, and it is
not negotiable.

## Step 7 — Hand it over

Tell him which hike page to open in Live Server, and what to look at: the description, the
vitals band, the acetate's shape, and the summit figure if there is one. Then wait.

Do not run a browser sweep to prove it — he can see a hike page in one refresh. (`atlas-check`
is for what he can't see cheaply.)

## Never

- Let the wizard's own `build-trails.py` run stand as final. It is provisional by construction.
- Type a `summit_elevation` by hand from anything but `ground-elevations.json`'s `high_ft`.
- Hand-edit `trails.geojson`, `elevations.json`, `ground-elevations.json`, `almanac.json`,
  `countries.json` or `atlas-frame.json`. Change the source and rebuild.
- Write in `notes`.
- Re-sort `hiked_with` at display time — the wizard stores it alphabetically, pages render it in
  file order.
