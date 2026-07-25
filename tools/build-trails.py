#!/usr/bin/env python3
"""Build data/trails.geojson and data/elevations.json from the raw GPX archive.

The map page draws every trail, but raw GPX records a point every few
seconds — far more detail than any screen can show. This script reads
data/hikes.json, parses each hike's GPX from data/trails/, simplifies the
geometry (Douglas-Peucker), and bundles all trails into one compact
GeoJSON file the site fetches in a single request. It also distills each
track's elevation readings into a small, smoothed profile (feet above sea
level) so pages can draw the true shape of a climb without ever fetching
raw GPX — the homepage's True Ascents panorama reads elevations.json.

Run it from the repo root whenever a GPX file is added or changed:

    python3 tools/build-trails.py

The raw GPX files remain the archival source of truth and never ship to
visitors. Uses only the Python standard library — nothing to install.
"""

import json
import math
import os
import sys
import xml.etree.ElementTree as ET

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HIKES_PATH = os.path.join(REPO_ROOT, "data", "hikes.json")
TRAILS_DIR = os.path.join(REPO_ROOT, "data", "trails")
OUTPUT_PATH = os.path.join(REPO_ROOT, "data", "trails.geojson")
ELEV_OUTPUT_PATH = os.path.join(REPO_ROOT, "data", "elevations.json")
GROUND_PATH = os.path.join(REPO_ROOT, "data", "ground-elevations.json")

# Profile resolution: enough points to keep every ridge and dip readable at
# panorama size, few enough that a hundred hikes stay a few tens of KB.
ELEV_POINTS = 120

# Max distance (in degrees, ~5.5 m) a dropped point may sit from the simplified
# line. Raised from 0.00002 in July 2026 after an A/B at z17 — past the zoom the
# map ever frames a trail at — showed no discernible difference, while halving
# the wire payload (139 KB -> 77 KB gzipped across 113 trails). Going further
# (~9 m) does start to round off switchbacks; this is the sweet spot.
TOLERANCE_DEG = 0.00005

# ~1.1 m precision; more decimals is GPS noise, not information.
COORD_DECIMALS = 5

GPX_NS = "{http://www.topografix.com/GPX/1/1}"


def parse_gpx_segments(tree):
    """Return a list of segments, each a list of (lon, lat) tuples."""
    segments = []
    for seg in tree.getroot().iter(f"{GPX_NS}trkseg"):
        points = [
            (float(pt.get("lon")), float(pt.get("lat")))
            for pt in seg.iter(f"{GPX_NS}trkpt")
        ]
        if len(points) >= 2:
            segments.append(points)
    return segments


def elevation_profile(tree):
    """Distill a track's <ele> readings (metres) into ELEV_POINTS smoothed
    integer feet. Index-based sampling is fine here: the profile conveys the
    shape of the day, not a distance axis. Returns None when the GPX carries
    no usable elevation data."""
    els = [
        float(e.text) * 3.28084
        for e in tree.getroot().iter(f"{GPX_NS}ele")
        if e.text
    ]
    if len(els) < 20:
        return None
    n = ELEV_POINTS
    pts = [els[int(i * (len(els) - 1) / (n - 1))] for i in range(n)]
    # ±4-point mean smooths GPS altimeter jitter without flattening real ridges
    return [
        round(sum(pts[max(0, i - 4):min(n, i + 5)]) / (min(n, i + 5) - max(0, i - 4)))
        for i in range(n)
    ]


def perpendicular_distance(point, start, end):
    """Distance from point to the line through start-end (planar approx —
    fine at trail scale, where a degree is locally flat)."""
    if start == end:
        return math.hypot(point[0] - start[0], point[1] - start[1])
    dx, dy = end[0] - start[0], end[1] - start[1]
    return abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) / math.hypot(dx, dy)


def simplify(points, tolerance):
    """Iterative Douglas-Peucker (recursion would overflow on 5k+ points)."""
    if len(points) < 3:
        return list(points)
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        max_dist, index = 0.0, 0
        for i in range(first + 1, last):
            d = perpendicular_distance(points[i], points[first], points[last])
            if d > max_dist:
                max_dist, index = d, i
        if max_dist > tolerance:
            keep[index] = True
            stack.append((first, index))
            stack.append((index, last))
    return [p for p, k in zip(points, keep) if k]


def round_coords(points):
    return [[round(lon, COORD_DECIMALS), round(lat, COORD_DECIMALS)] for lon, lat in points]


def main():
    with open(HIKES_PATH) as f:
        hikes = json.load(f)

    # USGS-corrected ground elevations, if correct-elevations.py has been run.
    # These beat the GPX's own <ele> readings, which are GPS altitude and run
    # 15-130 ft high. Trails missing from the file fall back to the raw track.
    try:
        with open(GROUND_PATH) as f:
            ground = json.load(f)
    except (OSError, ValueError):
        ground = {}

    features = []
    warnings = []
    elevations = {}
    uncorrected = []
    points_before = points_after = 0

    referenced = set()
    for hike in hikes:
        gpx_name = hike.get("gpx_file")
        if not gpx_name:
            continue  # viewpoints / missing tracks render as dots, not lines
        referenced.add(gpx_name)
        gpx_path = os.path.join(TRAILS_DIR, gpx_name)
        if not os.path.exists(gpx_path):
            warnings.append(f"{hike['trail_id']}: gpx_file '{gpx_name}' not found in data/trails/")
            continue

        tree = ET.parse(gpx_path)
        segments = parse_gpx_segments(tree)
        if not segments:
            warnings.append(f"{hike['trail_id']}: no track points in '{gpx_name}'")
            continue

        corrected = ground.get(hike["trail_id"], {}).get("profile")
        if corrected:
            elevations[hike["trail_id"]] = corrected
        else:
            profile = elevation_profile(tree)
            if profile:
                elevations[hike["trail_id"]] = profile
                uncorrected.append(hike["trail_id"])

        simplified = []
        for seg in segments:
            points_before += len(seg)
            slim = simplify(seg, TOLERANCE_DEG)
            points_after += len(slim)
            simplified.append(round_coords(slim))

        geometry = (
            {"type": "LineString", "coordinates": simplified[0]}
            if len(simplified) == 1
            else {"type": "MultiLineString", "coordinates": simplified}
        )
        features.append({
            "type": "Feature",
            "properties": {"trail_id": hike["trail_id"]},
            "geometry": geometry,
        })

    # A GPX nobody references is usually a new hike missing from hikes.json.
    for name in sorted(set(os.listdir(TRAILS_DIR)) - referenced):
        if name.endswith(".gpx"):
            warnings.append(f"data/trails/{name} is not referenced by any hike in hikes.json")

    collection = {"type": "FeatureCollection", "features": features}
    with open(OUTPUT_PATH, "w") as f:
        json.dump(collection, f, separators=(",", ":"))

    with open(ELEV_OUTPUT_PATH, "w") as f:
        json.dump(elevations, f, separators=(",", ":"))

    raw_bytes = sum(
        os.path.getsize(os.path.join(TRAILS_DIR, n))
        for n in os.listdir(TRAILS_DIR) if n.endswith(".gpx")
    )
    out_bytes = os.path.getsize(OUTPUT_PATH)
    print(f"trails.geojson: {len(features)} trails")
    print(f"elevations.json: {len(elevations)} profiles "
          f"({os.path.getsize(ELEV_OUTPUT_PATH) / 1e3:.0f} KB), "
          f"{len(elevations) - len(uncorrected)} USGS-corrected")
    if uncorrected:
        print(f"  still on raw GPS altitude: {', '.join(uncorrected)}\n"
              f"  -> run: python3 tools/correct-elevations.py")
    print(f"track points:   {points_before:,} -> {points_after:,} "
          f"({100 - 100 * points_after / points_before:.0f}% removed)")
    print(f"payload:        {raw_bytes / 1e6:.1f} MB of GPX -> {out_bytes / 1e3:.0f} KB "
          f"({100 - 100 * out_bytes / raw_bytes:.0f}% smaller)")

    if warnings:
        print("\nWARNINGS:", file=sys.stderr)
        for w in warnings:
            print(f"  - {w}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
