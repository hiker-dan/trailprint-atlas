---
name: rebuild-data
description: Rebuild the Atlas's generated data files (elevations, trails.geojson, almanac, country silhouettes) in the one order that produces correct output. Use after adding or changing a hike, after replacing a GPX, or whenever a generated file is suspected stale. Also use when asked to "rebuild the data", "re-run the generators", or "regenerate trails/elevations/almanac".
---

# Rebuilding the Atlas's derived data

Six files in this repo are **generated**. None may be hand-edited; all are committed.

| File | Written by | Rebuild when |
|---|---|---|
| `data/ground-elevations.json` | `correct-elevations.py` | a GPX is added or replaced |
| `data/trails.geojson` | `build-trails.py` | a GPX is added or replaced |
| `data/elevations.json` | `build-trails.py` | (same run) |
| `data/almanac.json` | `build-almanac.py` | a hike is added, or its date/coords change |
| `assets/countries.json` | `build-countries.py` | a hike lands in a **new country** |
| `assets/atlas-frame.json` | `build-countries.py` | (same run) |

`data/intro-film.json` is also generated, but by the film pipeline — see "The film" below. It is
not part of a routine rebuild.

## The order is load-bearing

Run these **in this order**. All are stdlib-only Python and run from the repo root.

```
python3 tools/correct-elevations.py     # 1. ask USGS what the ground truly is
python3 tools/build-trails.py           # 2. GPX -> trails.geojson + elevations.json
python3 tools/build-almanac.py          # 3. one Open-Meteo call per new hike
python3 tools/build-countries.py        # 4. no-op unless a new country appeared
```

**Why 1 must precede 2:** a GPX's coordinates are accurate, but its `<ele>` is GPS altitude and
reads 15–130 ft high. `correct-elevations.py` asks USGS 3DEP what the ground actually is and
writes `ground-elevations.json`; `build-trails.py` then *prefers* that file when writing the
profiles. Run them the other way round and the build succeeds, says nothing alarming, and ships
raw GPS altitude into `elevations.json` — which is what the home page's True Ascents and the hike
page's acetate both read. `build-trails.py` names any trail still riding on raw GPS altitude in
its output; read that list, don't skip past it.

**Step 3 is independent** of 1 and 2 — the almanac owes nothing to the GPX by design, because
the track is the largest file a hike page loads and a small weather card must not wait on it.
Order it last only for tidiness.

**Run `build-countries.py` every time — it guards itself.** It is tempting to run it only when
you know a hike landed somewhere new, but that puts a judgement call in a human's hands that the
script already makes correctly and for free. It reads `hikes.json`, works out the set of
countries actually walked, compares that against `assets/countries.json`, and **only touches the
network if something is genuinely missing**. When nothing is, it prints "Every country already
has a silhouette" and exits. Cost of a needless run: reading two small local files.

So it belongs in the standard sequence, not in a footnote a future session has to remember to
read. The failure it prevents is quiet — a hike in a new country with no silhouette to sit on.

```
python3 tools/build-countries.py          # self-guarding; safe to run always
python3 tools/build-countries.py --force  # re-fetch and rebuild every country
```

The US is deliberately excluded from the silhouettes (it is drawn state by state from
`assets/blank-us-map.svg`), but it *is* included in the atlas frame, because a dot in California
has to land on something.

## Flags

- `correct-elevations.py` — incremental by default (only queries trails it hasn't seen).
  `--force` re-queries everything; `--only tta_34` (comma-separated) targets specific trails.
  Falls back to the global `mapzen` model outside US 3DEP coverage.
- `build-almanac.py` — same shape: incremental, `--force`, `--only tta_123`.
- `build-trails.py` — takes no arguments; always rebuilds both outputs.
- `build-countries.py` — `--force` only, read from raw argv.

`correct-elevations.py` and `build-almanac.py` both use `curl` rather than urllib, because the
system Python on macOS has no usable certificate bundle. That is deliberate — don't "fix" it.

## After the run

1. `build-trails.py` warns if `hikes.json` and `data/trails/` disagree. Read the warning.
2. `git status` should show only the generated files above. If a source file changed, something
   went wrong.
3. `git diff --stat` on the generated files — a rebuild that touches every trail when you added
   one hike means an input changed underneath you.

## The film

`data/intro-film.json` records the handful of facts true of the *baked video* that can never be
re-derived from today's data — the zoom ramp the flight was cut with, the ground its last frame
shows, and the trail ids it actually draws. It is rewritten by `tools/render-intro.py`, and a
**full** bake writes it while a partial one (`--from`/`--to`) deliberately does not.

Do not rebuild it as part of a data refresh. Re-render only after a change to the flight itself
or to `atlasEnd`, and read the `data/intro-film.json` row in CLAUDE.md first — a new hike inside
the flight's gate, or one that widens the Atlas bounds, breaks the film in two ways that are
silent at build time.

## Never

- Hand-edit any file in the table above. Change the source (`hikes.json`, a GPX) and rebuild.
- Run `build-trails.py` before `correct-elevations.py`.
- Commit a rebuild without checking `git diff --stat` first.
