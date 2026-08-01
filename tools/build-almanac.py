#!/usr/bin/env python3
"""
build-almanac.py — bakes each hike's weather into data/almanac.json.

WHY THIS EXISTS
---------------
The Hike Almanac used to be fetched from Open-Meteo while the visitor watched.
It took five to ten seconds, so the page landed without it and the card dropped
in afterwards, shoving four cards down the sheet as it arrived.

But the weather on a day in the past NEVER CHANGES. It is exactly the kind of
thing this project already bakes: trails.geojson, elevations.json,
ground-elevations.json, countries.json, intro-film.json. So it is baked here
too, and the card is simply present when the page paints.

It also takes a third-party API out of every visitor's page load, which is a
robustness win on a site whose whole architecture is "no runtime dependencies
we don't control".

WHAT IT STORES
--------------
Only the six values the card actually shows, already resolved — not the raw
hourly arrays. Picking the right hour out of a 24-hour array is display logic,
and doing it here means the page has nothing left to work out:

    sunrise / sunset       local wall-clock, from the trailhead's own timezone
    sunrise_f / _code      temperature and conditions at first light
    apex_f / apex_code     the day's high, and the conditions at 1 PM
    sunset_f / _code       temperature and conditions at last light
    utc_offset             seconds, so the GPX's UTC clock can be read locally

USAGE
-----
    python3 tools/build-almanac.py            # only hikes not already cached
    python3 tools/build-almanac.py --force    # re-fetch everything
    python3 tools/build-almanac.py --only tta_123,tta_45

Run it after adding a hike, alongside build-trails.py. A hike missing from the
bake still works: the page falls back to the live API exactly as before.

Stdlib only, like the rest of tools/ — runs locally, never ships.
"""

import argparse
import datetime
import importlib.util
import json
import os
import subprocess
import time

# The clock test is imported, never re-implemented. check-track-clock.py owns
# the arithmetic and the thresholds; if they are ever retuned there, this and
# the page's own fallback guard follow automatically rather than drifting.
_spec = importlib.util.spec_from_file_location(
    'check_track_clock',
    os.path.join(os.path.dirname(os.path.abspath(__file__)), 'check-track-clock.py'))
_ctc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ctc)

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HIKES = os.path.join(REPO, 'data', 'hikes.json')
OUT = os.path.join(REPO, 'data', 'almanac.json')

# TWO days requested, not one, and that fixes a real bug rather than padding the
# data. Above the Arctic-ish latitudes this Atlas now reaches, a midsummer sun
# sets AFTER MIDNIGHT: Savage Alpine on 18 June has its sunset stamped
# 2026-06-19T00:21. Asked for a single day, the hourly array stops at 23:00 of
# the 18th, so reading "hour 0" returned midnight at the START of the hike day —
# roughly twenty hours before the sunset it was meant to describe. Two days of
# hours means the sunset always has its own hour to point at.
API = ('https://archive-api.open-meteo.com/v1/archive'
       '?latitude={lat}&longitude={lon}&start_date={d}&end_date={d2}'
       '&daily=temperature_2m_max,sunrise,sunset'
       '&hourly=weathercode,temperature_2m'
       '&temperature_unit=fahrenheit&timezone=auto')


def fetch(lat, lon, date, tries=3):
    """Via curl, not urllib — the same choice correct-elevations.py makes, and
    for the same reason: the system Python on macOS ships without a usable
    certificate bundle, so urllib fails SSL verification on a machine where
    every other tool works fine. curl carries its own trust store."""
    nxt = (datetime.date.fromisoformat(date) + datetime.timedelta(days=1)).isoformat()
    url = API.format(lat=lat, lon=lon, d=date, d2=nxt)
    for attempt in range(tries):
        proc = subprocess.run(['curl', '-s', '--max-time', '30', url],
                              capture_output=True, text=True)
        try:
            body = json.loads(proc.stdout)
            if 'error' not in body:
                return body
            reason = str(body.get('reason', body))[:70]
        except Exception:
            reason = 'unparseable response'
        if attempt == tries - 1:
            raise RuntimeError(reason)
        time.sleep(2 * (attempt + 1))     # a burst gets throttled; back off
    return None


def condense(data):
    """The six values the card shows, resolved. Returns None if the day is thin."""
    daily, hourly = data.get('daily'), data.get('hourly')
    if not daily or not hourly or not daily.get('time'):
        return None
    sunrise, sunset = daily['sunrise'][0], daily['sunset'][0]
    if not sunrise or not sunset:
        return None

    codes, temps = hourly['weathercode'], hourly['temperature_2m']
    times = hourly['time']

    # Matched by TIMESTAMP, never by hour arithmetic. "hour 5 of the array" and
    # "5 AM on the day the sun rose" are the same thing right up until a sunset
    # lands after midnight, which is exactly what happens in a Denali June.
    # Looking the stamp up cannot make that mistake.
    index = {t[:13]: i for i, t in enumerate(times)}

    def slot(stamp):
        return index.get(stamp[:13])

    def at(i, series):
        if i is None or i >= len(series) or series[i] is None:
            return None
        return series[i]

    sr, ss = slot(sunrise), slot(sunset)
    tmax = daily['temperature_2m_max'][0]
    out = {
        'sunrise': sunrise,
        'sunset': sunset,
        'sunrise_f': round(at(sr, temps)) if at(sr, temps) is not None else None,
        'sunrise_code': at(sr, codes),
        # 1 PM, which is where the old page read the day's conditions from
        'apex_f': round(tmax) if tmax is not None else None,
        'apex_code': at(slot(daily['time'][0] + 'T13'), codes),
        'sunset_f': round(at(ss, temps)) if at(ss, temps) is not None else None,
        'sunset_code': at(ss, codes),
        'utc_offset': data.get('utc_offset_seconds', 0),
    }
    # A row with no temperature and no code is not worth baking.
    if out['sunrise_f'] is None and out['apex_f'] is None:
        return None
    return out


def on_trail_window(hike):
    """The day's boots-on/boots-off window, in UTC, or None.

    BAKED HERE so the almanac card owes nothing to the GPX. The track is the
    biggest file the hike page loads (some are over 400 KB), and making a small
    weather card wait on it meant that on a slow connection the card arrived
    long after everything around it — which is the whole fault this bake exists
    to fix. The window is two timestamps; there is no reason to download a
    quarter-megabyte of coordinates to learn them.

    A track whose timestamps describe a pace nobody walks yields None, so the
    card shows no clock rather than a wrong one. `recorded_times` is not
    consulted here — the page applies that itself, because a hand-verified
    window must win over anything derived.
    """
    gpx = hike.get('gpx_file')
    if not gpx:
        return None
    path = os.path.join(REPO, 'data', 'trails', gpx)
    if not os.path.exists(path):
        return None
    try:
        verdict = _ctc.assess(path)
        if not verdict or verdict.get('verdict') != 'PLAUSIBLE':
            return None
        _, pts = _ctc.read_track(path)
        stamps = sorted(t for _, t in pts if t is not None)
        if len(stamps) < 2:
            return None
        return {'start': stamps[0].isoformat().replace('+00:00', 'Z'),
                'end': stamps[-1].isoformat().replace('+00:00', 'Z')}
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--force', action='store_true', help='re-fetch hikes already cached')
    ap.add_argument('--only', help='comma-separated trail_ids')
    args = ap.parse_args()

    with open(HIKES, encoding='utf-8') as fh:
        hikes = json.load(fh)

    cache = {}
    if os.path.exists(OUT) and not args.force:
        with open(OUT, encoding='utf-8') as fh:
            cache = json.load(fh)

    wanted = set(args.only.split(',')) if args.only else None

    todo = []
    for h in hikes:
        tid = h.get('trail_id')
        if wanted and tid not in wanted:
            continue
        if not h.get('latitude') or not h.get('longitude') or not h.get('date_completed'):
            continue
        if tid in cache and not args.force:
            continue
        todo.append(h)

    if not todo:
        print(f"almanac.json: nothing to do ({len(cache)} already cached)")
        return

    print(f"Fetching {len(todo)} day{'s' if len(todo) != 1 else ''} from Open-Meteo "
          f"(~{len(todo) * 0.5 / 60:.1f} min)...\n")

    failed = []
    for i, h in enumerate(todo, 1):
        tid = h['trail_id']
        try:
            row = condense(fetch(h['latitude'], h['longitude'], h['date_completed']))
        except Exception as exc:
            row = None
            print(f"  {i:3d}/{len(todo)}  {tid}  FAILED  {str(exc)[:60]}")
        if row:
            row['on_trail'] = on_trail_window(h)
            cache[tid] = row
            print(f"  {i:3d}/{len(todo)}  {tid}  {h['date_completed']}  "
                  f"{row['apex_f']}°F  sunrise {row['sunrise'].split('T')[1]}")
        else:
            failed.append(tid)
        time.sleep(0.4)          # polite on a free tier

    # trail_id order, so the file diffs cleanly when one hike is re-fetched
    ordered = {k: cache[k] for k in sorted(cache, key=lambda s: int(s.split('_')[1]))}
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(ordered, fh, indent=1, sort_keys=False)
        fh.write('\n')

    size = os.path.getsize(OUT) / 1024
    print(f"\nalmanac.json: {len(ordered)} days ({size:.0f} KB)")
    if failed:
        print(f"  no data for: {', '.join(failed)}  (the page falls back to the live API)")


if __name__ == '__main__':
    main()
