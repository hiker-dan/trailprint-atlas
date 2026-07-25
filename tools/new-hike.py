#!/usr/bin/env python3
"""The 5-minute hike-entry pipeline for The Trailprint Atlas.

Drop a hike's raw materials into intake/ (one GPX export from AllTrails +
that hike's photos), then run:

    python3 tools/new-hike.py            # the real thing
    python3 tools/new-hike.py --dry-run  # rehearsal: shows everything, writes nothing

The wizard reads what a machine can know (date, coordinates, distance and
climb estimates, the next tta_NN id), asks only the human questions — each
with a default you can accept with Enter — and then does all the mechanical
work exactly to the Atlas's conventions.

It also mines the GPX and the Atlas's own history so you rarely type at all:
  - suggests the trail name from the GPX's embedded title (stripping
    AllTrails' "Afternoon hike at ..." prefix; boilerplate titles ignored)
  - recognizes a REPEAT — a start point at a trailhead you've logged before,
    or a matching name — and pre-fills last time's answers (name, location,
    region, geography, difficulty, type, summit, URLs). Miles and climb are
    NOT copied: every outing differs, so their default is this GPX's estimate.
  - for new trails, offers the locations/regions previous hikes near these
    coordinates used, so spellings never drift from the record.

Launch it from the terminal as above, by double-clicking "New Hike.command"
in the project folder, or in VS Code: Terminal menu -> Run Task -> New Hike.

The mechanical work, exactly to the Atlas's conventions:

  - renames the GPX to Trail_Name_MM.DD.YY.gpx and files it in data/trails/
  - renames photos to tta_NN-trail-name-## and uploads them to Cloudinary
    (needs tools/cloudinary-credentials.json — see CREDS_HELP below; without
    it, the script stages the photos and tells you exactly what to upload)
  - writes the new record at the TOP of data/hikes.json in the exact field
    order and formatting of the existing records (description/flora/fauna
    are left empty — Claude drafts those in-session for your review)
  - rebuilds data/trails.geojson via tools/build-trails.py
  - verifies everything (valid JSON, unique id, GPX parses, every image
    live on Cloudinary) and prints a checklist

Nothing is written, moved, or uploaded until you approve the final summary.
A backup of hikes.json is kept at data/hikes.json.bak (git-ignored).
Viewpoint-style entries (no GPX) are supported: run with an empty intake/
and the wizard will ask for the date and coordinates instead.

Uses only the Python standard library. Idempotent: re-running skips photos
that are already live on Cloudinary.
"""

import filecmp
import glob
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INTAKE_DIR = os.path.join(REPO_ROOT, "intake")
HIKES_PATH = os.path.join(REPO_ROOT, "data", "hikes.json")
TRAILS_DIR = os.path.join(REPO_ROOT, "data", "trails")
CREDS_PATH = os.path.join(REPO_ROOT, "tools", "cloudinary-credentials.json")
CLOUD_NAME = "dgdniwosl"

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".heic")

GEOGRAPHIES = [
    "Chaparral", "Coastal", "Coastal Chaparral", "Desert", "Mountain Forest",
    "Riparian Canyon", "Riparian Forest", "Riparian Meadow", "Tundra",
    "Urban Edge",
]
DIFFICULTIES = ["Easy", "Medium", "Hard"]
HIKE_TYPES = [
    "Day Hike", "Backpacking", "Day Trip", "Overnight Trip",
    "Car Camping", "Viewpoint",
]

CREDS_HELP = f"""
To let the script upload photos itself (one-time setup, ~2 minutes):
  1. Log in at cloudinary.com and open the Console.
  2. Go to Settings (gear icon) -> API Keys.
  3. Create the file  tools/cloudinary-credentials.json  containing:
     {{"api_key": "YOUR_API_KEY", "api_secret": "YOUR_API_SECRET"}}
That file is git-ignored — it never leaves this machine.
"""


# ----------------------------------------------------------------------------
# Small wizard helpers
# ----------------------------------------------------------------------------

def ask(prompt, default=None, validate=None, allow_empty=False):
    """Ask until the answer validates. Enter accepts the default (if any).
    validate: fn(str) -> (ok: bool, cleaned_value_or_error_message)."""
    suffix = f" [{default}]" if default not in (None, "") else ""
    while True:
        raw = input(f"  {prompt}{suffix}: ").strip()
        if raw == "" and default is not None:
            raw = str(default)
        if raw == "" and not allow_empty:
            print("    (an answer is needed here)")
            continue
        if validate is None:
            return raw
        ok, result = validate(raw)
        if ok:
            return result
        print(f"    {result}")


def pick(prompt, options, default_index=None):
    """Numbered menu; returns the chosen option string."""
    print(f"  {prompt}")
    for i, opt in enumerate(options, 1):
        print(f"    {i}. {opt}")
    suffix = f" [{default_index + 1}]" if default_index is not None else ""
    while True:
        raw = input(f"  Pick 1-{len(options)}{suffix}: ").strip()
        if raw == "" and default_index is not None:
            return options[default_index]
        if raw.isdigit() and 1 <= int(raw) <= len(options):
            return options[int(raw) - 1]
        print("    (enter one of the numbers above)")


def yes_no(prompt, default_no=True):
    d = "y/N" if default_no else "Y/n"
    raw = input(f"  {prompt} ({d}): ").strip().lower()
    if raw == "":
        return not default_no
    return raw in ("y", "yes")


# ----------------------------------------------------------------------------
# GPX reading + derived facts
# ----------------------------------------------------------------------------

def local_name(tag):
    return tag.rsplit("}", 1)[-1]


def parse_gpx(path):
    """Return dict with points [(lat, lon, ele_m, time)], namespace-proof."""
    root = ET.parse(path).getroot()
    points = []
    for el in root.iter():
        if local_name(el.tag) != "trkpt":
            continue
        lat, lon = float(el.get("lat")), float(el.get("lon"))
        ele, when = None, None
        for child in el:
            n = local_name(child.tag)
            if n == "ele" and child.text:
                ele = float(child.text)
            elif n == "time" and child.text:
                when = datetime.fromisoformat(child.text.replace("Z", "+00:00"))
        points.append((lat, lon, ele, when))
    if not points:
        raise ValueError(f"no track points found in {os.path.basename(path)}")
    return points


def haversine_miles(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * 3958.8 * math.asin(math.sqrt(h))


def gpx_estimates(points):
    """Rough distance (mi) and elevation gain (ft) — shown as sanity checks."""
    dist = sum(haversine_miles(points[i - 1], points[i]) for i in range(1, len(points)))
    elevations = [p[2] for p in points if p[2] is not None]
    gain_m = 0.0
    if len(elevations) > 5:
        # Light smoothing so GPS jitter doesn't inflate the climb.
        window = 5
        smoothed = [sum(elevations[max(0, i - window):i + 1]) / len(elevations[max(0, i - window):i + 1])
                    for i in range(len(elevations))]
        gain_m = sum(max(0.0, smoothed[i] - smoothed[i - 1]) for i in range(1, len(smoothed)))
    return round(dist, 1), int(round(gain_m * 3.28084))


def local_date_from_gpx(points):
    """GPX times are UTC; estimate the trail's local date from its longitude.
    (Good to the nearest hour — the wizard asks you to confirm regardless.)"""
    first_time = next((p[3] for p in points if p[3] is not None), None)
    if first_time is None:
        return None
    offset_hours = round(points[0][1] / 15)  # 15 degrees of longitude per hour
    local = first_time.astimezone(timezone.utc) + timedelta(hours=offset_hours)
    return local.date().isoformat()


# ----------------------------------------------------------------------------
# Smart suggestions from the GPX + the Atlas's own history
# ----------------------------------------------------------------------------

# Boilerplate titles AllTrails sometimes embeds instead of a trail name.
JUNK_GPX_NAMES = {"trail planner map", "park and trailhead",
                  "phone service available", "map", "custom map"}

# "Afternoon hike at ...", "Early morning walk in ..." — strip the diary prefix.
TIME_PREFIX_RE = re.compile(r"^(?:[a-z]+ )*?(?:hike|walk|run) (?:at|in|on|to)\s+",
                            re.IGNORECASE)


def gpx_embedded_name(path):
    """The recording's title from <metadata><name> (AllTrails always sets one)."""
    root = ET.parse(path).getroot()
    for el in root.iter():
        if local_name(el.tag) == "name" and el.text and el.text.strip():
            return el.text.strip()
    return None


def suggest_trail_name(raw):
    """'Afternoon hike at Tee Pee Trail' -> 'Tee Pee Trail'; junk titles -> None.
    Also drops AllTrails' status tags like 'Eaton Canyon Trail [CLOSED]'."""
    if not raw or raw.strip().lower() in JUNK_GPX_NAMES:
        return None
    name = TIME_PREFIX_RE.sub("", raw.strip())
    name = re.sub(r"\s*\[[^\]]*\]\s*$", "", name)
    return name or None


def normalize_name(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def dedupe(items):
    seen, out = set(), []
    for x in items:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def hikes_near(hikes, lat, lon, radius_mi):
    """Previous hikes whose trailhead lies within radius_mi, nearest first."""
    found = []
    for h in hikes:
        if h.get("latitude") is None or h.get("longitude") is None:
            continue
        d = haversine_miles((lat, lon), (h["latitude"], h["longitude"]))
        if d <= radius_mi:
            found.append((d, h))
    found.sort(key=lambda pair: pair[0])
    return found


def latest_record(records):
    """Most recent record of a trail; same-date ties break by tta number."""
    return max(records, key=lambda h: (h["date_completed"],
                                       int(h["trail_id"].split("_")[1])))


REPEAT_RADIUS_MI = 0.35   # same trailhead, allowing for GPS wobble
NEARBY_RADIUS_MI = 40     # "same corner of the world" for location suggestions


def repeat_candidates(hikes, lat, lon, gpx_name):
    """Trails this GPX plausibly repeats: any previous trail starting within
    REPEAT_RADIUS_MI of this start, plus any trail whose name matches the
    GPX's embedded title. Returns [(trail_name, times_hiked, latest_record)],
    best guess first (a name match outranks a merely-nearby trailhead)."""
    scores = {}
    if lat is not None:
        for d, h in hikes_near(hikes, lat, lon, REPEAT_RADIUS_MI):
            if d < scores.get(h["trail_name"], float("inf")):
                scores[h["trail_name"]] = d
    if gpx_name:
        want = normalize_name(gpx_name)
        for h in hikes:
            have = normalize_name(h["trail_name"])
            if want and have and (want == have or want in have or have in want):
                scores[h["trail_name"]] = -1.0
    ranked = sorted(scores, key=lambda name: scores[name])
    out = []
    for name in ranked:
        records = [h for h in hikes if h["trail_name"] == name]
        out.append((name, len(records), latest_record(records)))
    return out


def trip_core_type(hikes, tag):
    """A trip's established hike_type — the non-Viewpoint style its members
    already share. Used to default a new hike on that trip to the same style,
    so a trip's map icons stay consistent (see hike_type rule in CLAUDE.md).
    Returns None for a brand-new tag with no members yet."""
    counts = {}
    for h in hikes:
        if h.get("trip_tag") == tag and h["hike_type"] != "Viewpoint":
            counts[h["hike_type"]] = counts.get(h["hike_type"], 0) + 1
    return max(counts, key=lambda t: counts[t]) if counts else None


# ----------------------------------------------------------------------------
# Naming conventions
# ----------------------------------------------------------------------------

def kebab(name):
    """Trail name -> Cloudinary id fragment: 'Temescal Canyon' -> 'temescal-canyon'."""
    s = re.sub(r"[^a-z0-9]+", "-", name.lower())
    return s.strip("-")


def underscore(name):
    """Trail name -> GPX filename fragment: 'Temescal Canyon' -> 'Temescal_Canyon'."""
    s = re.sub(r"[^A-Za-z0-9]+", "_", name)
    return s.strip("_")


def gpx_filename(trail_name, date_str):
    d = datetime.strptime(date_str, "%Y-%m-%d")
    return f"{underscore(trail_name)}_{d.strftime('%m.%d.%y')}.gpx"


# ----------------------------------------------------------------------------
# Cloudinary
# ----------------------------------------------------------------------------

def cloudinary_exists(public_id):
    # Via curl rather than urllib: python.org Python installs on macOS often
    # lack linked SSL certificates, while curl always uses the system store.
    url = f"https://res.cloudinary.com/{CLOUD_NAME}/image/upload/{public_id}"
    result = subprocess.run(
        ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
         "--head", "--max-time", "30", url],
        capture_output=True, text=True)
    code = result.stdout.strip()
    if code == "200":
        return True
    if code in ("404", "401"):
        return False
    raise RuntimeError(f"could not reach Cloudinary to verify {public_id} (HTTP {code or 'none'})")


def load_credentials():
    if not os.path.exists(CREDS_PATH):
        return None
    with open(CREDS_PATH) as f:
        creds = json.load(f)
    if not creds.get("api_key") or not creds.get("api_secret"):
        return None
    return creds


def asset_folder_for(public_id):
    """Match the Media Library's existing organization: each hike's photos
    live in trailprint-atlas/tta_NN-trail-name (the id minus its -## suffix).
    Cloudinary creates the folder automatically on first upload."""
    return f"trailprint-atlas/{public_id.rsplit('-', 1)[0]}"


def cloudinary_upload(filepath, public_id, creds):
    """Signed upload via Cloudinary's REST API, sent with curl (see note in
    cloudinary_exists about macOS Python and SSL certificates). Signature =
    SHA-1 of the alphabetically-sorted params + the API secret."""
    ts = str(int(time.time()))
    folder = asset_folder_for(public_id)
    params = {
        "asset_folder": folder,
        "display_name": public_id,
        "public_id": public_id,
        "timestamp": ts,
    }
    to_sign = "&".join(f"{k}={v}" for k, v in sorted(params.items())) + creds["api_secret"]
    signature = hashlib.sha1(to_sign.encode()).hexdigest()

    cmd = ["curl", "-s", "--max-time", "300", "-F", f"file=@{filepath}",
           "-F", f"api_key={creds['api_key']}", "-F", f"signature={signature}"]
    for k, v in params.items():
        cmd += ["-F", f"{k}={v}"]
    cmd.append(f"https://api.cloudinary.com/v1_1/{CLOUD_NAME}/image/upload")
    result = subprocess.run(cmd, capture_output=True, text=True)
    try:
        response = json.loads(result.stdout)
    except json.JSONDecodeError:
        raise RuntimeError(f"Cloudinary upload failed: {result.stdout[:200] or result.stderr[:200]}")
    if response.get("public_id") != public_id:
        raise RuntimeError(f"Cloudinary upload error: {response.get('error', response)}")
    if response.get("asset_folder") != folder:
        raise RuntimeError(f"photo uploaded but landed in '{response.get('asset_folder')}' "
                           f"instead of '{folder}'")


# ----------------------------------------------------------------------------
# The wizard
# ----------------------------------------------------------------------------

def collect_intake():
    os.makedirs(INTAKE_DIR, exist_ok=True)
    files = sorted(os.listdir(INTAKE_DIR))
    gpxs = [f for f in files if f.lower().endswith(".gpx")]
    photos = [f for f in files
              if os.path.splitext(f)[1].lower() in IMAGE_EXTENSIONS]
    return gpxs, photos


def validate_date(raw):
    try:
        datetime.strptime(raw, "%Y-%m-%d")
        return True, raw
    except ValueError:
        return False, "dates look like 2026-06-28 (YYYY-MM-DD)"


def validate_region(raw):
    m = re.match(r"^(.+),\s*([A-Za-z]{2})$", raw)
    if not m:
        return False, 'region looks like "Pacific Palisades, CA" (City, two-letter state)'
    return True, f"{m.group(1).strip()}, {m.group(2).upper()}"


def validate_number(raw):
    try:
        v = float(raw)
        if v < 0:
            return False, "must be zero or more"
        return True, int(v) if v == int(v) else round(v, 2)
    except ValueError:
        return False, "just a number (e.g. 3.2)"


def validate_int(raw):
    try:
        return True, int(float(raw))
    except ValueError:
        return False, "a whole number of feet (e.g. 846)"


def validate_url(raw):
    if raw.lower() in ("", "none", "n/a", "-"):
        return True, None
    if raw.startswith("http://") or raw.startswith("https://"):
        return True, raw
    return False, "URLs start with https:// (or answer 'none')"


def validate_coords(raw):
    m = re.match(r"^\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*$", raw)
    if not m:
        return False, 'paste as "34.05478, -118.52906" (latitude, longitude)'
    lat, lon = float(m.group(1)), float(m.group(2))
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return False, "those aren't valid coordinates"
    return True, (lat, lon)


def run_wizard(hikes, gpxs, photos):
    """Ask everything; return (record, plan) without touching anything."""
    next_num = max(int(h["trail_id"].split("_")[1]) for h in hikes) + 1
    trail_id = f"tta_{next_num:02d}"

    print(f"\nThis will become hike {trail_id}.")

    # --- GPX (or viewpoint mode) ---
    gpx_source = None
    points = None
    if len(gpxs) == 1:
        gpx_source = gpxs[0]
        print(f"  Found GPX: {gpx_source}")
    elif len(gpxs) > 1:
        gpx_source = pick("Several GPX files are in intake/ — which one is this hike?", gpxs)
        if photos:
            print("  HEADS-UP: every photo currently in intake/ will attach to THIS hike.")
            print("  For multi-hike trips, do one hike at a time: this hike's GPX + its")
            print("  photos only, run me, then refill intake/ for the next hike.")
            if not yes_no("Are the photos in intake/ all from this hike?", default_no=False):
                print("  Good catch — sort intake/ out and run me again. Nothing was changed.")
                sys.exit(0)
    else:
        print("  No GPX in intake/ — that's fine for a Viewpoint-style entry.")
        if not yes_no("Continue without a GPX track?"):
            print("  Drop the GPX into intake/ and run me again. Nothing was changed.")
            sys.exit(0)

    name_suggestion = None
    repeat_of = None
    if gpx_source:
        gpx_path = os.path.join(INTAKE_DIR, gpx_source)
        points = parse_gpx(gpx_path)
        est_miles, est_gain = gpx_estimates(points)
        derived_date = local_date_from_gpx(points)
        lat, lon = points[0][0], points[0][1]
        print(f"  GPX says: ~{est_miles} mi, ~{est_gain} ft of climb, "
              f"{len(points)} track points, starts at {lat:.5f}, {lon:.5f}")

        # What does the GPX + the Atlas's own history already tell us?
        name_suggestion = suggest_trail_name(gpx_embedded_name(gpx_path))
        candidates = repeat_candidates(hikes, lat, lon, name_suggestion)
        if len(candidates) == 1:
            name, count, latest = candidates[0]
            times = f"hiked {count} time{'s' if count != 1 else ''}, last {latest['date_completed']}"
            if yes_no(f'This looks like a repeat of "{name}" ({times}) — same trail?',
                      default_no=False):
                repeat_of = latest
        elif candidates:
            options = [f'{name} — hiked {count}x, last {latest["date_completed"]}'
                       for name, count, latest in candidates]
            options.append("None of these — it's a new trail")
            choice = pick("This start point matches previous hikes:", options,
                          default_index=0)
            chosen = options.index(choice)
            if chosen < len(candidates):
                repeat_of = candidates[chosen][2]
        if repeat_of:
            print("  (last time's answers are pre-filled below — Enter accepts, or type to change)")
    else:
        est_miles = est_gain = None
        derived_date = None
        lat = lon = None

    print("\n--- The facts only you know ---")
    default_name = repeat_of["trail_name"] if repeat_of else name_suggestion
    trail_name = ask("Trail name (exactly as it should appear)", default=default_name)
    # Repeat hikes group by exact trail_name — snap to the existing spelling.
    existing_names = {h["trail_name"].lower(): h["trail_name"] for h in hikes}
    canonical = existing_names.get(trail_name.lower())
    if canonical and canonical != trail_name:
        print(f'  (matching existing trail "{canonical}" — using that exact spelling so repeats group)')
        trail_name = canonical
    elif canonical and not repeat_of:
        print("  (repeat of an existing trail — the Atlas will group them together)")
    date_prompt = ("Date completed" if derived_date
                   else "Date completed (YYYY-MM-DD, like 2026-02-15)")
    date_completed = ask(date_prompt, default=derived_date, validate=validate_date)

    # Backfill insurance: the same GPX wandering into intake/ twice would
    # otherwise become a second record and double-count everywhere.
    already = [h for h in hikes
               if h["trail_name"] == trail_name and h["date_completed"] == date_completed]
    if already:
        print(f'  WHOA: {already[0]["trail_id"]} is already "{trail_name}" on {date_completed} —')
        print("  this hike looks like it's in the Atlas already (a backfill double-entry?).")
        if not yes_no("Really log it a second time?"):
            print("  Good catch — nothing was changed.")
            sys.exit(0)

    # Location + region: pre-filled for repeats; otherwise offer what previous
    # hikes near these coordinates used, so spellings never drift.
    location = region = None
    if repeat_of:
        location = ask("Location (park / natural area)", default=repeat_of["location"])
        region = ask('Region ("City, ST")', default=repeat_of["region"],
                     validate=validate_region)
    elif lat is not None:
        nearby = hikes_near(hikes, lat, lon, NEARBY_RADIUS_MI)
        somewhere_new = "Somewhere new — type it"
        locations = dedupe(h["location"] for _, h in nearby)[:6]
        if locations:
            choice = pick("Location (park / natural area) — used near here before:",
                          locations + [somewhere_new], default_index=0)
            if choice != somewhere_new:
                location = choice
                regions = dedupe(h["region"] for _, h in nearby
                                 if h["location"] == location)[:5]
                choice = pick(f'Region ("City, ST") — previously paired with {location}:',
                              regions + [somewhere_new], default_index=0)
                if choice != somewhere_new:
                    region = choice
    if location is None:
        location = ask('Location — the park / natural area (like "Angeles National Forest")')
    if region is None:
        region = ask('Region — nearest town as "City, ST" (like "La Canada Flintridge, CA")',
                     validate=validate_region)

    geo_default = (GEOGRAPHIES.index(repeat_of["primary_geography"])
                   if repeat_of and repeat_of["primary_geography"] in GEOGRAPHIES
                   else None)
    geography = pick("Primary geography:", GEOGRAPHIES, default_index=geo_default)

    # Miles + climb: every outing differs, so even on repeats the default is
    # THIS hike's GPX estimate — Enter takes it, or type AllTrails' number.
    last_logged = (f" (last time you logged {repeat_of['miles']} mi, "
                   f"{repeat_of['elevation_gain']} ft)" if repeat_of else "")
    if est_miles is not None:
        miles = ask(f"Miles — Enter for the GPX estimate, or type AllTrails' number{last_logged}",
                    default=est_miles, validate=validate_number)
        elevation_gain = ask("Elevation gain in feet — Enter for the GPX estimate "
                             "(GPS gain often reads high), or type AllTrails'",
                             default=est_gain, validate=validate_int)
    else:
        miles = ask("Miles — AllTrails' listed distance (a number, like 3.2)",
                    validate=validate_number)
        elevation_gain = ask("Elevation gain in feet — AllTrails' number (like 850)",
                             validate=validate_int)

    was_summit = bool(repeat_of and repeat_of.get("summit_trail"))
    summit_trail = yes_no("Is this a summit trail?", default_no=not was_summit)
    # summit_elevation is NOT asked for (July 2026). GPS altitude reads 15-130 ft
    # high, which is why recorded summits never matched the elevation graph.
    # correct-elevations.py fills it from USGS 3DEP after the GPX is filed, so
    # the number and the graph's flag come from one source and cannot disagree.
    summit_elevation = None
    peak_name = None
    if summit_trail:
        # The peak often isn't the trail's name ("Waterman Mountain Loop Trail"
        # tops out on Mount Waterman), so the Atlas asks rather than guessing.
        prev_peak = repeat_of.get("peak_name") if repeat_of else None
        peak_name = ask("Name of the peak (like Mount Waterman) — Enter if the "
                        'high point has no name, and it will read "High Point"',
                        default=prev_peak, allow_empty=True) or None
        print("    summit elevation will be measured from the track by "
              "tools/correct-elevations.py")

    diff_default = (DIFFICULTIES.index(repeat_of["difficulty"])
                    if repeat_of and repeat_of["difficulty"] in DIFFICULTIES else None)
    difficulty = pick("Difficulty:", DIFFICULTIES, default_index=diff_default)

    # Trip tag comes BEFORE hike_type on purpose: knowing the trip lets us
    # default the type to the trip's established style, keeping a trip's map
    # icons consistent. (Single-day outings count too — a "trip" is any tagged
    # group of hikes.) Offer existing tags so spellings never drift.
    trip_tag = None
    if yes_no("Part of a trip (day trip or multi-day)?"):
        latest_use = {}
        for h in hikes:
            if h.get("trip_tag"):
                latest_use[h["trip_tag"]] = max(latest_use.get(h["trip_tag"], ""),
                                                h["date_completed"])
        # Newest trips first — the one you're mid-backfill on is always option 1.
        existing_tags = sorted(latest_use, key=lambda t: latest_use[t], reverse=True)
        if existing_tags and yes_no("Reuse an existing trip tag?", default_no=False):
            trip_tag = pick("Which trip?", existing_tags)
        else:
            trip_tag = ask('New trip tag — "Trip Name - Mon YYYY" (like "Joshua Tree Day Trip - Feb 2025")')

    # hike_type = the outing's style (how you slept), which drives the map icon.
    # Default to the trip's established style first (consistency), then to last
    # time's for a repeat, then to a plain guess.
    # A GPX-less entry defaults to Viewpoint, which wins even inside a trip:
    # Viewpoint is the orthogonal "not a real hike" type, so a scenic stop
    # stays a Viewpoint on a camping/overnight trip rather than inheriting its
    # style. Otherwise default to the trip's established style (consistency),
    # then to last time's for a repeat, then to no default.
    trip_core = trip_core_type(hikes, trip_tag) if trip_tag else None
    if not gpx_source:
        type_default = HIKE_TYPES.index("Viewpoint")
    elif trip_core and trip_core in HIKE_TYPES:
        type_default = HIKE_TYPES.index(trip_core)
        print(f'  (this trip\'s other hikes are logged as "{trip_core}" — '
              "matching keeps the map icons consistent)")
    elif repeat_of and repeat_of["hike_type"] in HIKE_TYPES:
        type_default = HIKE_TYPES.index(repeat_of["hike_type"])
    else:
        type_default = None
    hike_type = pick("Hike type:", HIKE_TYPES, default_index=type_default)

    tally = {}
    for h in hikes:
        for name in h.get("hiked_with") or []:
            tally[name] = tally.get(name, 0) + 1
    frequent = sorted(tally, key=lambda n: -tally[n])[:5]
    usual = f' (the usual suspects: {", ".join(frequent)})' if frequent else ""
    companions_raw = ask(f'Hiked with — names like "Max M.", comma-separated; Enter if solo{usual}',
                         default="", allow_empty=True)
    # Sorted on the way in so companion lists read alphabetically everywhere,
    # never in the order they happened to be typed (decided July 2026).
    hiked_with = sorted({n.strip() for n in companions_raw.split(",") if n.strip()},
                        key=str.lower)
    for name in hiked_with:
        if not re.match(r"^[A-Z][a-z]+.* [A-Z]\.$", name):
            print(f'    (heads-up: "{name}" doesn\'t match the usual "First L." style — keeping it as typed)')
    hike_size = {0: "Solo", 1: "Duo"}.get(len(hiked_with), "Group")
    print(f"  -> hike_size: {hike_size}")

    at_default = (repeat_of.get("all_trails_url") or "none") if repeat_of else "none"
    all_trails_url = ask("AllTrails URL (or 'none')", default=at_default,
                         validate=validate_url)
    official_default = (repeat_of.get("official_trail_url") or "none") if repeat_of else "none"
    official_trail_url = ask("Official trail URL (or 'none')", default=official_default,
                             validate=validate_url)

    if lat is None:
        lat, lon = ask('Trailhead coordinates — paste "lat, lon" from Google Maps',
                       validate=validate_coords)
    else:
        override = ask('Trailhead coordinates — Enter to use the GPX start, or paste "lat, lon"',
                       default=f"{lat}, {lon}", validate=validate_coords)
        lat, lon = override

    videos_raw = ask("YouTube video URLs (comma-separated, or Enter for none)",
                     default="", allow_empty=True)
    videos = [v.strip() for v in videos_raw.split(",") if v.strip()] or None

    # --- Photos plan ---
    slug = kebab(trail_name)
    photo_plan = [(f, f"{trail_id}-{slug}-{i:02d}") for i, f in enumerate(photos, 1)]

    record = {
        "trail_id": trail_id,
        "trail_name": trail_name,
        "date_completed": date_completed,
        "location": location,
        "region": region,
        "primary_geography": geography,
        "miles": miles,
        "elevation_gain": elevation_gain,
        "summit_trail": summit_trail,
        "summit_elevation": summit_elevation,
        "peak_name": peak_name,
        "difficulty": difficulty,
        "hike_type": hike_type,
        "hike_size": hike_size,
        "hiked_with": hiked_with,
        "description": "",
        "flora": "",
        "fauna": "",
        "notes": None,
        "trip_tag": trip_tag,
        "all_trails_url": all_trails_url,
        "official_trail_url": official_trail_url,
        "latitude": lat,
        "longitude": lon,
        "gpx_file": gpx_filename(trail_name, date_completed) if gpx_source else None,
        "images": [pid for _, pid in photo_plan],
        "videos": videos,
    }
    plan = {"gpx_source": gpx_source, "photo_plan": photo_plan}
    return record, plan


# ----------------------------------------------------------------------------
# Doing the work (only after approval)
# ----------------------------------------------------------------------------

def write_hikes_json(record):
    """Splice the new record in at the top of the array TEXTUALLY, so every
    existing record stays byte-for-byte untouched (some older entries use
    one-line arrays that a full re-dump would reformat). The spliced result
    is parse-validated before it replaces the real file."""
    old_text = open(HIKES_PATH, encoding="utf-8").read()
    if not old_text.startswith("[\n"):
        raise RuntimeError("hikes.json doesn't start with '[\\n' — refusing to splice")

    block = json.dumps(record, indent=2, ensure_ascii=False)
    indented = "\n".join("  " + line for line in block.splitlines())
    new_text = "[\n" + indented + ",\n" + old_text[2:]

    # Prove the splice is sound before touching anything on disk.
    parsed = json.loads(new_text)
    if parsed[0] != record or parsed[1:] != json.loads(old_text):
        raise RuntimeError("spliced hikes.json failed validation — aborting, file unchanged")

    shutil.copy2(HIKES_PATH, HIKES_PATH + ".bak")
    tmp = HIKES_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(new_text)
    os.replace(tmp, HIKES_PATH)


def execute(record, plan, creds):
    checklist = []

    # 1. File the GPX.
    if plan["gpx_source"]:
        src = os.path.join(INTAKE_DIR, plan["gpx_source"])
        dest = os.path.join(TRAILS_DIR, record["gpx_file"])
        if os.path.exists(dest):
            # Identical file = leftovers of an interrupted run; resume quietly.
            if filecmp.cmp(src, dest, shallow=False):
                checklist.append(("GPX already filed (resumed a previous run)", True))
            else:
                raise RuntimeError(
                    f"{record['gpx_file']} already exists in data/trails/ with DIFFERENT "
                    "content — is this a different hike with the same name and date?")
        else:
            shutil.copy2(src, dest)
            checklist.append(("GPX filed as data/trails/" + record["gpx_file"], True))

    # 2. Photos -> Cloudinary.
    pending_uploads = []
    for filename, public_id in plan["photo_plan"]:
        src = os.path.join(INTAKE_DIR, filename)
        if cloudinary_exists(public_id):
            checklist.append((f"photo {public_id} already on Cloudinary", True))
        elif creds:
            cloudinary_upload(src, public_id, creds)
            # A fresh upload can take a few seconds to reach Cloudinary's
            # delivery network — poll patiently instead of failing instantly.
            live = False
            for _ in range(8):
                if cloudinary_exists(public_id):
                    live = True
                    break
                time.sleep(2.5)
            checklist.append((f"photo {public_id} uploaded + verified live", live))
            if not live:
                raise RuntimeError(
                    f"uploaded {public_id} but it isn't serving after 20s — "
                    "re-run me in a minute; already-uploaded photos are skipped automatically")
        else:
            pending_uploads.append((filename, public_id))
            checklist.append((f"photo {public_id} NOT uploaded (no credentials)", False))

    # 3. Write the record (textual splice — existing records stay untouched).
    write_hikes_json(record)
    checklist.append((f"{record['trail_id']} written to data/hikes.json (backup: hikes.json.bak)", True))

    # 4. Rebuild the map bundle.
    if plan["gpx_source"]:
        result = subprocess.run(
            [sys.executable, os.path.join(REPO_ROOT, "tools", "build-trails.py")],
            capture_output=True, text=True)
        print(result.stdout.strip())
        if result.returncode != 0:
            print(result.stderr.strip())
        checklist.append(("trails.geojson rebuilt", result.returncode == 0))

    # 5. Tuck the processed intake files away (nothing is deleted).
    done_dir = os.path.join(INTAKE_DIR, f"processed-{record['trail_id']}")
    os.makedirs(done_dir, exist_ok=True)
    moved = ([plan["gpx_source"]] if plan["gpx_source"] else []) + \
            [f for f, _ in plan["photo_plan"]]
    for f in moved:
        shutil.move(os.path.join(INTAKE_DIR, f), os.path.join(done_dir, f))
    checklist.append((f"intake files moved to intake/processed-{record['trail_id']}/", True))

    # 6. Final integrity pass.
    reloaded = json.load(open(HIKES_PATH))
    ids = [h["trail_id"] for h in reloaded]
    checklist.append(("hikes.json still valid JSON", True))
    checklist.append(("trail_id is unique", ids.count(record["trail_id"]) == 1))

    return checklist, pending_uploads


def main():
    dry_run = "--dry-run" in sys.argv

    print("=" * 62)
    print("  The Trailprint Atlas — new hike entry")
    if dry_run:
        print("  (DRY RUN: nothing will be written, moved, or uploaded)")
    print("=" * 62)

    hikes = json.load(open(HIKES_PATH))
    gpxs, photos = collect_intake()
    if photos:
        print(f"  Found {len(photos)} photo(s) in intake/: {', '.join(photos)}")
    else:
        print("  No photos in intake/ — the gallery will be empty until some are added.")

    try:
        record, plan = run_wizard(hikes, gpxs, photos)
    except (KeyboardInterrupt, EOFError):
        print("\n  Aborted — nothing was changed.")
        sys.exit(1)

    # --- The moment of truth: show exactly what will happen. ---
    print("\n--- The record that will be written ---")
    print(json.dumps(record, indent=2, ensure_ascii=False))
    print("\n--- The plan ---")
    if plan["gpx_source"]:
        print(f"  file {plan['gpx_source']} -> data/trails/{record['gpx_file']}")
    for f, pid in plan["photo_plan"]:
        print(f"  upload {f} -> Cloudinary as {pid}")
    print(f"  insert {record['trail_id']} at the top of data/hikes.json")
    if plan["gpx_source"]:
        print("  rebuild data/trails.geojson")
    print("  (description / flora / fauna stay empty — Claude drafts them with you)")

    if dry_run:
        print("\nDRY RUN complete — nothing was changed.")
        sys.exit(0)

    creds = load_credentials()
    if plan["photo_plan"] and not creds:
        print("\n  NOTE: no Cloudinary credentials found, so photos won't auto-upload.")
        print(CREDS_HELP)

    try:
        approval = input("\nType 'go' to do all of this (anything else aborts): ").strip().lower()
    except (KeyboardInterrupt, EOFError):
        approval = ""
    if approval != "go":
        print("  Aborted — nothing was changed.")
        sys.exit(1)

    checklist, pending = execute(record, plan, creds)

    print("\n--- Checklist ---")
    ok = True
    for item, passed in checklist:
        print(f"  {'[ok]' if passed else '[!!]'} {item}")
        ok = ok and passed

    if pending:
        print("\n  To finish the photos, upload these to Cloudinary (Media Library ->")
        print("  Upload), setting each public ID exactly:")
        for filename, public_id in pending:
            print(f"    intake/processed-{record['trail_id']}/{filename}  ->  {public_id}")

    print("\n--- Next steps ---")
    print("  1. Ask Claude to draft the description / flora / fauna for your review.")
    print(f"  2. Check the page in Live Server: hike.html?id={record['trail_id']}")
    print("  3. When it looks right, commit.")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
