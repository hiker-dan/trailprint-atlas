#!/usr/bin/env python3
"""Ground-truth the Atlas's elevation data.

A GPX holds two different qualities of information: WHERE you were (lat/lon,
accurate to a few metres) and HOW HIGH you were (barometric/GPS altitude, which
routinely reads 15-130 ft high and is the reason summit numbers never matched
the elevation graph). This tool throws away the bad half and keeps the good
half: it asks USGS's 10-metre 3DEP elevation model what the ground truly is at
each recorded coordinate.

Benchmarked July 2026 against surveyed peaks: mean error 16.6 ft for raw
single points, and within 1-3 ft of the published height wherever a track
actually crosses the summit. Open-Meteo's global model was ~99 ft off and was
rejected for this job.

Output: data/ground-elevations.json — one distance-sampled corrected profile
per trail, plus the true high point. build-trails.py and the hike page's
acetate both read it, so the graph's flag and the summit vitals can never
disagree again.

Runs locally, never ships. Network is only touched for trails not already in
the file, so a normal rebuild is offline and instant. Re-run after adding a
hike; pass --force to re-query everything.

    python3 tools/correct-elevations.py [--force] [--only tta_34,tta_38]
"""
import argparse
import json
import math
import os
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HIKES_PATH = os.path.join(REPO_ROOT, "data", "hikes.json")
TRAILS_DIR = os.path.join(REPO_ROOT, "data", "trails")
OUTPUT_PATH = os.path.join(REPO_ROOT, "data", "ground-elevations.json")

GPX_NS = "{http://www.topografix.com/GPX/1/1}"
M2FT = 3.28084
PROFILE_POINTS = 120        # matches elevations.json; the shape of the day
BATCH = 100                 # opentopodata's per-request ceiling
THROTTLE_S = 1.1            # public API allows 1 call/sec
# USGS 3DEP at 10 m is the sharpest thing going, but it stops at the US border
# (it reaches Vancouver, not Whistler). Anything it can't answer falls back to
# mapzen, a coarser global composite — still far better than GPS altitude.
API = "https://api.opentopodata.org/v1/ned10m"
API_GLOBAL = "https://api.opentopodata.org/v1/mapzen"
EARTH_MI = 3958.8


def haversine_mi(a, b):
    dlat = math.radians(b[0] - a[0])
    dlon = math.radians(b[1] - a[1])
    s = (math.sin(dlat / 2) ** 2 + math.cos(math.radians(a[0]))
         * math.cos(math.radians(b[0])) * math.sin(dlon / 2) ** 2)
    return 2 * EARTH_MI * math.asin(math.sqrt(s))


def track_points(path):
    """Every trkpt as (lat, lon), plus cumulative miles."""
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError as exc:
        print(f"    ! unreadable GPX: {exc}")
        return []
    pts = [(float(p.get("lat")), float(p.get("lon")))
           for p in root.iter(f"{GPX_NS}trkpt")]
    if len(pts) < 2:
        return []
    out, dist = [], 0.0
    for i, p in enumerate(pts):
        if i:
            dist += haversine_mi(pts[i - 1], p)
        out.append((p[0], p[1], dist))
    return out if dist > 0 else []


def sample_by_distance(pts, n=PROFILE_POINTS):
    """Evenly spaced along the ground walked — the axis the graph draws."""
    total = pts[-1][2]
    sampled, k = [], 0
    for i in range(n):
        target = total * i / (n - 1)
        while k < len(pts) - 2 and pts[k + 1][2] < target:
            k += 1
        a, b = pts[k], pts[k + 1]
        t = (target - a[2]) / (b[2] - a[2]) if b[2] > a[2] else 0.0
        sampled.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return sampled


def query_dem(coords):
    """Ground elevation in metres for each coordinate, USGS first and the
    global model for whatever falls outside its footprint. None only if both
    models decline."""
    out = query_one(coords, API)
    if out is None:
        return None
    gaps = [i for i, m in enumerate(out) if m is None]
    if gaps:
        print(f"    ({len(gaps)} pts outside USGS coverage -> global model)")
        filled = query_one([coords[i] for i in gaps], API_GLOBAL)
        if filled:
            for i, m in zip(gaps, filled):
                out[i] = m
    return out


def query_one(coords, endpoint):
    """Batched lookup against a single dataset. Returns metres, None per point
    where that dataset has no coverage; None entirely if the API never answers."""
    out = []
    for i in range(0, len(coords), BATCH):
        chunk = coords[i:i + BATCH]
        locs = "|".join(f"{a:.6f},{b:.6f}" for a, b in chunk)
        body = None
        for attempt in range(3):
            proc = subprocess.run(
                ["curl", "-s", "--max-time", "60", "-X", "POST",
                 "--data-urlencode", f"locations={locs}", endpoint],
                capture_output=True, text=True)
            try:
                body = json.loads(proc.stdout)
                if body.get("status") == "OK":
                    break
                print(f"    ! API said: {body.get('error', body)[:90]}")
            except Exception:
                print(f"    ! bad response (attempt {attempt + 1})")
            body = None
            time.sleep(3 * (attempt + 1))
        if body is None:
            return None
        out.extend(r["elevation"] for r in body["results"])
        time.sleep(THROTTLE_S)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true",
                    help="re-query trails already corrected")
    ap.add_argument("--only", help="comma-separated trail_ids")
    args = ap.parse_args()

    hikes = json.load(open(HIKES_PATH))
    try:
        store = json.load(open(OUTPUT_PATH))
    except (OSError, ValueError):
        store = {}

    only = set(args.only.split(",")) if args.only else None
    queue = []
    for h in hikes:
        tid, gpx = h["trail_id"], h.get("gpx_file")
        if not gpx:
            continue
        if only and tid not in only:
            continue
        if tid in store and not args.force:
            continue
        path = os.path.join(TRAILS_DIR, gpx)
        if not os.path.exists(path):
            print(f"  ! {tid}: {gpx} missing from data/trails/")
            continue
        queue.append((tid, path, h["trail_name"]))

    if not queue:
        print(f"Nothing to do — {len(store)} trails already corrected.")
        return 0

    est = sum(math.ceil(PROFILE_POINTS / BATCH) for _ in queue) * THROTTLE_S
    print(f"Correcting {len(queue)} trails against USGS 3DEP "
          f"(~{est / 60:.1f} min)...\n")

    failures = []
    for n, (tid, path, name) in enumerate(queue, 1):
        pts = track_points(path)
        if not pts:
            print(f"  {n:3}/{len(queue)}  {tid:8} no usable track")
            failures.append(tid)
            continue
        coords = sample_by_distance(pts)
        metres = query_dem(coords)
        if metres is None or all(m is None for m in metres):
            print(f"  {n:3}/{len(queue)}  {tid:8} DEM lookup failed")
            failures.append(tid)
            continue

        # Uncovered points (rare, outside 3DEP) borrow their nearest neighbour
        # so the profile stays continuous rather than punching a hole.
        filled = list(metres)
        for i, m in enumerate(filled):
            if m is None:
                near = next((filled[j] for j in range(i - 1, -1, -1)
                             if filled[j] is not None), None)
                if near is None:
                    near = next((m2 for m2 in filled[i + 1:] if m2 is not None), 0)
                filled[i] = near

        profile = [round(m * M2FT) for m in filled]
        hi = max(range(len(profile)), key=lambda i: profile[i])
        store[tid] = {
            "profile": profile,
            "high_ft": profile[hi],
            "low_ft": min(profile),
            "high_at": [round(coords[hi][0], 5), round(coords[hi][1], 5)],
            "high_frac": round(hi / (len(profile) - 1), 4),
        }
        print(f"  {n:3}/{len(queue)}  {tid:8} high {profile[hi]:>6,} ft   {name}")

    with open(OUTPUT_PATH, "w") as f:
        json.dump(store, f, separators=(",", ":"), sort_keys=True)

    size = os.path.getsize(OUTPUT_PATH) / 1e3
    print(f"\nground-elevations.json: {len(store)} trails ({size:.0f} KB)")
    if failures:
        print(f"failed: {', '.join(failures)} — re-run to retry")
    print("Next: python3 tools/build-trails.py")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
