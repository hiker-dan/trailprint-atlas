#!/usr/bin/env python3
"""Shrink a decorative landscape SVG without visibly changing it.

The timeline mountainscape ships with ~80k cubic Bezier segments and
6-decimal coordinates — detail far below one screen pixel for a background
that renders a few hundred pixels tall. This script:

  1. flattens every path's curves into points,
  2. drops points that deviate less than TOLERANCE canvas units from the
     shape (Douglas-Peucker — same algorithm as tools/build-trails.py),
  3. re-emits compact path data (relative commands, 1 decimal place),
  4. compacts verbose rgb(..%) gradient stops to hex.

Original files stay safe in git history. Usage:

    python3 tools/optimize-landscape.py assets/landscapes/in.svg [out.svg]

If out.svg is omitted the input is rewritten in place.
"""

import re
import sys

# Max deviation in canvas units. The 4000-unit canvas displays at most a
# few hundred px tall, so 1 unit is well under half a display pixel.
TOLERANCE = 1.0


def flatten_cubic(p0, p1, p2, p3):
    """Sample a cubic Bezier into points; more samples for longer curves."""
    poly_len = (abs(p1[0] - p0[0]) + abs(p1[1] - p0[1])
                + abs(p2[0] - p1[0]) + abs(p2[1] - p1[1])
                + abs(p3[0] - p2[0]) + abs(p3[1] - p2[1]))
    n = max(2, min(24, int(poly_len / 2)))
    pts = []
    for i in range(1, n + 1):
        t = i / n
        mt = 1 - t
        x = mt**3 * p0[0] + 3 * mt**2 * t * p1[0] + 3 * mt * t**2 * p2[0] + t**3 * p3[0]
        y = mt**3 * p0[1] + 3 * mt**2 * t * p1[1] + 3 * mt * t**2 * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def perpendicular_distance(point, start, end):
    import math
    if start == end:
        return math.hypot(point[0] - start[0], point[1] - start[1])
    dx, dy = end[0] - start[0], end[1] - start[1]
    return abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) / math.hypot(dx, dy)


def simplify(points, tolerance):
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


_NUM = re.compile(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?")


def parse_subpaths(d):
    """Parse an absolute M/L/C/Z path into [(points, closed), ...]."""
    tokens = re.findall(r"[MLCZmlcz]|" + _NUM.pattern, d)
    subpaths = []
    points, closed = [], False
    cur = (0.0, 0.0)
    i = 0
    cmd = None
    while i < len(tokens):
        t = tokens[i]
        if t in "MLCZmlcz":
            cmd = t
            i += 1
            if cmd in "Zz":
                if points:
                    subpaths.append((points, True))
                points = []
            continue
        if cmd in "Mm":
            if points:
                subpaths.append((points, False))
                points = []
            cur = (float(tokens[i]), float(tokens[i + 1]))
            points = [cur]
            i += 2
            cmd = "L"  # subsequent pairs are implicit lineto
        elif cmd in "Ll":
            cur = (float(tokens[i]), float(tokens[i + 1]))
            points.append(cur)
            i += 2
        elif cmd in "Cc":
            p1 = (float(tokens[i]), float(tokens[i + 1]))
            p2 = (float(tokens[i + 2]), float(tokens[i + 3]))
            p3 = (float(tokens[i + 4]), float(tokens[i + 5]))
            points.extend(flatten_cubic(cur, p1, p2, p3))
            cur = p3
            i += 6
        else:
            raise ValueError(f"unsupported path command: {cmd}")
    if points:
        subpaths.append((points, False))
    return subpaths


def fmt(n):
    s = f"{n:.1f}"
    return s[:-2] if s.endswith(".0") else s


def emit(subpaths):
    """Emit compact path data: absolute M, relative l, Z."""
    out = []
    for points, closed in subpaths:
        if len(points) < 2:
            continue
        x0, y0 = points[0]
        out.append(f"M{fmt(x0)} {fmt(y0)}")
        px, py = round(x0, 1), round(y0, 1)
        coords = []
        for x, y in points[1:]:
            rx, ry = round(x, 1), round(y, 1)
            dx, dy = round(rx - px, 1), round(ry - py, 1)
            if dx == 0 and dy == 0:
                continue
            coords.append(f"{fmt(dx)} {fmt(dy)}")
            px, py = rx, ry
        if coords:
            out.append("l" + " ".join(coords))
        if closed:
            out.append("Z")
    return "".join(out)


def optimize_path_data(d):
    subpaths = parse_subpaths(d)
    simplified = [(simplify(pts, TOLERANCE), closed) for pts, closed in subpaths]
    return emit(simplified)


def compact_stop_colors(svg):
    """rgb(96.490479%, 85.734558%, 42.900085%) -> #f6da6d"""
    def to_hex(m):
        vals = [max(0, min(255, round(float(v) * 2.55))) for v in m.groups()]
        return '#{:02x}{:02x}{:02x}'.format(*vals)
    return re.sub(
        r"rgb\(([\d.]+)%,\s*([\d.]+)%,\s*([\d.]+)%\)", to_hex, svg)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else src
    svg = open(src).read()
    before = len(svg)

    svg = re.sub(r'( d=")([^"]+)(")',
                 lambda m: m.group(1) + optimize_path_data(m.group(2)) + m.group(3),
                 svg)
    svg = compact_stop_colors(svg)
    svg = re.sub(r">\s+<", "><", svg)  # strip inter-tag whitespace

    open(dst, "w").write(svg)
    print(f"{src}: {before / 1e6:.1f} MB -> {len(svg) / 1e3:.0f} KB "
          f"({100 - 100 * len(svg) / before:.0f}% smaller) -> {dst}")


if __name__ == "__main__":
    main()
