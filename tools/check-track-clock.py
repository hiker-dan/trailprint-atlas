#!/usr/bin/env python3
"""
check-track-clock.py — does this GPX's clock describe a person walking?

WHY THIS EXISTS
---------------
A GPX carries two independent things: where you went, and when. The "where" is
reliable. The "when" is not, because some apps THIN the recording on export and
then re-stamp the surviving points on a made-up cadence. The shape of the walk
survives; the clock does not.

Measured across every track in this Atlas on 31 July 2026:

    AllTrails exports   points ~3.5-3.7 m apart, 95th-percentile speed 3.3-4.1 mph
    onX web exports     points ~5.3-7.8 m apart, 95th-percentile speed 8.3-19.7 mph

Both write a point roughly every 3 seconds. The difference is how far apart the
points are, and 20 mph is not a person on a trail. Six hikes were reporting
"1h 08m" for a 7.2-mile day as a result.

WHAT TO USE IT FOR
------------------
1. Testing a re-export. onX's WEB export is the one that lies; the phone app may
   still hold the original recording. Export a hike from the phone, drop it
   anywhere, and run this on it. If it says PLAUSIBLE, the data is fixed at
   source and no workaround is needed, for this hike or any future one.
2. Screening the whole logbook, any time:  python3 tools/check-track-clock.py
3. Checking a single file:  python3 tools/check-track-clock.py intake/new.gpx

It reads only. It never edits a GPX or hikes.json.

Stdlib only, like the rest of tools/ — runs locally, never ships.
"""

import json
import math
import os
import re
import statistics
import sys
from datetime import datetime

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRAILS = os.path.join(REPO, 'data', 'trails')
HIKES = os.path.join(REPO, 'data', 'hikes.json')

# The ceiling a real hiking day never reaches. Across all 123 records the
# fastest genuine AVERAGE is 2.9 mph (the Zion Narrows Riverside Walk, flat and
# short), so 4.0 leaves real headroom for a brisk day and still rejects every
# synthesized clock measured. The same number guards the Hike Almanac.
MAX_AVG_MPH = 4.0
# Instantaneous speed is the sharper tell, because a synthesized cadence makes
# every gap the same while the distances keep varying. Real tracks sit under 4.1
# at the 95th percentile; the fabricated ones start at 8.3.
MAX_P95_MPH = 6.0


def haversine_m(a, b):
    r = 6371000.0
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(h))


def parse_time(s):
    # GPX times are ISO-8601 in UTC, with or without fractional seconds.
    return datetime.fromisoformat(s.strip().replace('Z', '+00:00'))


POINT_RE = re.compile(
    r'<trkpt[^>]*\blat="([-\d.]+)"[^>]*\blon="([-\d.]+)"[^>]*>(.*?)</trkpt>',
    re.S)
TIME_RE = re.compile(r'<time>([^<]+)</time>')


def read_track(path):
    with open(path, encoding='utf-8', errors='replace') as fh:
        text = fh.read()
    creator = re.search(r'creator="([^"]+)"', text)
    pts = []
    for lat, lon, body in POINT_RE.findall(text):
        t = TIME_RE.search(body)
        pts.append(((float(lat), float(lon)),
                    parse_time(t.group(1)) if t else None))
    return (creator.group(1) if creator else 'unknown'), pts


def assess(path):
    """Returns a dict describing this track's clock, or None if unreadable."""
    try:
        creator, pts = read_track(path)
    except Exception as exc:                       # a malformed file is a finding
        return {'error': str(exc)[:80]}

    total_m = sum(haversine_m(pts[i][0], pts[i + 1][0])
                  for i in range(len(pts) - 1))
    miles = total_m / 1609.344
    out = {'creator': creator, 'points': len(pts), 'miles': miles}

    timed = [p for p in pts if p[1] is not None]
    if len(timed) < 2:
        out['verdict'] = 'NO CLOCK'
        out['why'] = 'the file carries no timestamps at all'
        return out

    span_s = (max(t for _, t in timed) - min(t for _, t in timed)).total_seconds()
    out['hours'] = span_s / 3600.0
    out['avg_mph'] = miles / out['hours'] if out['hours'] > 0 else 0.0

    # Step-by-step speeds, ignoring the pauses and the occasional stray point
    # whose timestamp runs backwards.
    steps, gaps = [], []
    for i in range(len(timed) - 1):
        dt = (timed[i + 1][1] - timed[i][1]).total_seconds()
        if 0 < dt < 120:
            d = haversine_m(timed[i][0], timed[i + 1][0])
            steps.append(d / dt * 2.23694)
            gaps.append((dt, d))
    if steps:
        steps.sort()
        out['p95_mph'] = steps[int(len(steps) * 0.95)]
        out['median_gap_s'] = statistics.median(g for g, _ in gaps)
        out['median_step_m'] = statistics.median(d for _, d in gaps)

    reasons = []
    if out['avg_mph'] > MAX_AVG_MPH:
        reasons.append(f"average pace {out['avg_mph']:.1f} mph over the whole track")
    if out.get('p95_mph', 0) > MAX_P95_MPH:
        reasons.append(f"95th-percentile step speed {out['p95_mph']:.1f} mph")
    out['verdict'] = 'SUSPECT' if reasons else 'PLAUSIBLE'
    out['why'] = '; '.join(reasons) if reasons else 'pace reads like walking'
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    only_bad = '--suspect-only' in sys.argv

    if args:
        paths = []
        for a in args:
            if os.path.isdir(a):
                paths += [os.path.join(a, f) for f in sorted(os.listdir(a))
                          if f.lower().endswith('.gpx')]
            else:
                paths.append(a)
    else:
        paths = [os.path.join(TRAILS, f) for f in sorted(os.listdir(TRAILS))
                 if f.lower().endswith('.gpx')]

    # Miles from hikes.json beat miles derived from the track where we have
    # them: the record is what the site actually shows.
    recorded = {}
    try:
        with open(HIKES, encoding='utf-8') as fh:
            for h in json.load(fh):
                if h.get('gpx_file'):
                    recorded[h['gpx_file']] = (h.get('trail_id'), h.get('miles'))
    except Exception:
        pass

    counts = {'PLAUSIBLE': 0, 'SUSPECT': 0, 'NO CLOCK': 0, 'UNREADABLE': 0}
    suspects = []

    print(f"\nChecking {len(paths)} track{'s' if len(paths) != 1 else ''}"
          f"  (a real hiking day averages under {MAX_AVG_MPH} mph)\n")

    for p in paths:
        name = os.path.basename(p)
        r = assess(p)
        if r is None or 'error' in r:
            counts['UNREADABLE'] += 1
            print(f"  UNREADABLE  {name}  ({r.get('error') if r else 'no points'})")
            continue

        tid, rec_miles = recorded.get(name, (None, None))
        miles = rec_miles if rec_miles else r['miles']
        counts[r['verdict']] += 1
        if r['verdict'] == 'SUSPECT':
            suspects.append((tid, name, r, miles))
        if only_bad and r['verdict'] != 'SUSPECT':
            continue

        head = f"  {r['verdict']:10s} {(tid + '  ') if tid else ''}{name}"
        print(head)
        print(f"             {r['creator']}  ·  {r['points']} points  ·  {miles:.1f} mi")
        if 'hours' in r:
            h, m = int(r['hours']), round((r['hours'] % 1) * 60)
            print(f"             says {h}h {m:02d}m on the trail  ->  {r['avg_mph']:.1f} mph"
                  f"{'   <-- not a walking pace' if r['verdict'] == 'SUSPECT' else ''}")
            if 'median_step_m' in r:
                print(f"             a point every {r['median_gap_s']:.0f}s and "
                      f"{r['median_step_m']:.1f} m  ·  95th-pct step {r['p95_mph']:.1f} mph")
        else:
            print(f"             {r['why']}")
        print()

    print("-" * 68)
    print(f"  {counts['PLAUSIBLE']} plausible   {counts['SUSPECT']} suspect   "
          f"{counts['NO CLOCK']} with no clock   {counts['UNREADABLE']} unreadable")
    if suspects:
        print("\n  These report a pace nobody walks, so their timestamps cannot be")
        print("  trusted. The route itself is fine — it is only the clock that is wrong.")
        for tid, name, r, miles in suspects:
            print(f"    · {(tid + ' ') if tid else ''}{name}  ({r['why']})")
        print("\n  Two ways out, in order of preference:")
        print("    1. Re-export the hike from the recording app on your PHONE and run")
        print("       this on the new file. If it says PLAUSIBLE, replace the GPX and")
        print("       the problem is gone at source.")
        print("    2. Put the real start and end into `recorded_times` on the record")
        print("       in hikes.json. That field already wins over the GPX everywhere.")
    print()


if __name__ == '__main__':
    main()
