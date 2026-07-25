#!/usr/bin/env python3
"""
build-countries.py — the national silhouettes for the Observatory's Territories.

The US is collected state by state (assets/blank-us-map.svg has every state's
outline). Everywhere else is collected as a WHOLE COUNTRY (decided July 2026):
there will always be far fewer hikes abroad, and a lone province tile beside
fifty states reads as an accident rather than a collection.

So each country the Atlas has actually walked needs one silhouette. This fetches
world country geometry once, keeps only the countries present in hikes.json,
projects and simplifies each, and writes assets/countries.json — a committed
asset, like data/trails.geojson. Nothing here runs in a visitor's browser.

Projection: Lambert azimuthal equal-area, centred on each country's OWN centre.
Web Mercator would do for a tile, but it stretches high-latitude countries badly
and Canada is the first customer — LAEA gives every country an honest,
undistorted shape whatever its latitude, which is what a silhouette is for.

Run it after adding a hike in a new country:  python3 tools/build-countries.py
  --force   re-fetch and rebuild every country, not just the missing ones
"""

import json
import math
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HIKES = os.path.join(ROOT, 'data', 'hikes.json')
OUT = os.path.join(ROOT, 'assets', 'countries.json')

# Plain GeoJSON (not TopoJSON) so this stays stdlib-only — one feature per
# country, with a readable `name` in its properties.
SOURCE = 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json'

# The Atlas's country names vs. the source's. Only the ones that differ.
ALIASES = {
    'United States': 'United States of America',
}

VIEW = 100.0        # every silhouette is normalised into a 100-unit box
TOLERANCE = 0.22    # Douglas-Peucker, in normalised units (~0.2% of the box)


def fetch(url):
    """curl, not urllib: the system cert store is the one that works here."""
    r = subprocess.run(['curl', '-fsSL', url], capture_output=True, timeout=120)
    if r.returncode != 0:
        print('  ! fetch failed:', r.stderr.decode()[:200])
        return None
    return json.loads(r.stdout)


def rings_of(geometry):
    polys = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
    return [ring for poly in polys for ring in poly]


def laea(lon, lat, lon0, lat0):
    """Lambert azimuthal equal-area about (lon0, lat0). Returns (x, y), y up."""
    p, p0 = math.radians(lat), math.radians(lat0)
    dl = math.radians(lon - lon0)
    denom = 1 + math.sin(p0) * math.sin(p) + math.cos(p0) * math.cos(p) * math.cos(dl)
    if denom <= 1e-9:
        return None                      # the antipode: unprojectable, drop it
    k = math.sqrt(2.0 / denom)
    return (k * math.cos(p) * math.sin(dl),
            k * (math.cos(p0) * math.sin(p) - math.sin(p0) * math.cos(p) * math.cos(dl)))


def simplify(pts, tol):
    """Douglas-Peucker, same idea as build-trails.py's."""
    if len(pts) < 3:
        return pts
    ax, ay = pts[0]
    bx, by = pts[-1]
    dx, dy = bx - ax, by - ay
    span = math.hypot(dx, dy)
    worst, wi = -1.0, 0
    for i in range(1, len(pts) - 1):
        px, py = pts[i]
        d = (abs(dy * px - dx * py + bx * ay - by * ax) / span) if span else math.hypot(px - ax, py - ay)
        if d > worst:
            worst, wi = d, i
    if worst <= tol:
        return [pts[0], pts[-1]]
    return simplify(pts[:wi + 1], tol)[:-1] + simplify(pts[wi:], tol)


def build(name, feature):
    rings = rings_of(feature['geometry'])
    lons = [c[0] for r in rings for c in r]
    lats = [c[1] for r in rings for c in r]

    # Centre the projection on the country's own middle. Islands that cross the
    # antimeridian would break a naive mean; none of ours do, and a country that
    # did would need its own handling anyway.
    lon0 = (min(lons) + max(lons)) / 2.0
    lat0 = (min(lats) + max(lats)) / 2.0

    projected = []
    for r in rings:
        pts = [laea(c[0], c[1], lon0, lat0) for c in r]
        pts = [p for p in pts if p]
        if len(pts) >= 3:
            projected.append(pts)
    if not projected:
        return None

    xs = [p[0] for r in projected for p in r]
    ys = [p[1] for r in projected for p in r]
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    scale = VIEW / max(w, h, 1e-9)
    ox, oy = min(xs), max(ys)            # y flips: SVG counts downward

    # Drop specks: an islet under ~0.35% of the box is a smudge at tile size,
    # not a landmass. The mainland always survives; this is what keeps the
    # asset small and the silhouette readable.
    keep = []
    for r in projected:
        rw = (max(p[0] for p in r) - min(p[0] for p in r)) * scale
        rh = (max(p[1] for p in r) - min(p[1] for p in r)) * scale
        if max(rw, rh) >= VIEW * 0.035:
            keep.append(r)
    if not keep:
        keep = [max(projected, key=len)]

    raw = sum(len(r) for r in keep)
    d, pts_out = '', 0
    for r in keep:
        norm = [((p[0] - ox) * scale, (oy - p[1]) * scale) for p in r]
        norm = simplify(norm, TOLERANCE)
        if len(norm) < 3:
            continue
        pts_out += len(norm)
        for i, (x, y) in enumerate(norm):
            d += ('M' if i == 0 else 'L') + f'{x:.2f},{y:.2f} '
        d += 'Z '

    print(f'  {name}: {len(rings)} rings -> {len(keep)} kept, {raw} -> {pts_out} points')
    return {
        'name': name,
        'viewBox': f'0 0 {VIEW * (w / max(w, h)):.2f} {VIEW * (h / max(w, h)):.2f}',
        'd': d.strip(),
    }


def main():
    force = '--force' in sys.argv
    hikes = json.load(open(HIKES))
    wanted = sorted({h.get('country') or 'United States' for h in hikes})
    # The US is drawn state by state from assets/blank-us-map.svg — it never
    # needs a whole-country silhouette, and shipping one would be dead weight.
    wanted = [c for c in wanted if c != 'United States']

    existing = {}
    if os.path.exists(OUT) and not force:
        existing = json.load(open(OUT))

    missing = [c for c in wanted if c not in existing]
    if not missing:
        print(f'Every country already has a silhouette ({", ".join(wanted) or "none needed"}). '
              'Use --force to rebuild.')
        return

    print(f'Fetching world outlines for: {", ".join(missing)}')
    world = fetch(SOURCE)
    if not world:
        print('! could not fetch country geometry — nothing written')
        sys.exit(1)

    by_name = {f['properties'].get('name'): f for f in world['features']}
    out = dict(existing)
    for c in missing:
        feat = by_name.get(ALIASES.get(c, c))
        if not feat:
            print(f'  ! no geometry found for "{c}" — skipped')
            continue
        built = build(c, feat)
        if built:
            out[c] = built

    # keep only countries the Atlas still walks, so retired ones don't linger
    out = {k: v for k, v in out.items() if k in wanted}
    with open(OUT, 'w') as f:
        json.dump(out, f, indent=1, sort_keys=True)
        f.write('\n')
    size = os.path.getsize(OUT)
    print(f'\nWrote {OUT} — {len(out)} countr{"y" if len(out) == 1 else "ies"}, {size / 1024:.1f} KB')


if __name__ == '__main__':
    main()
