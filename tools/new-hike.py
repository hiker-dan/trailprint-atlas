#!/usr/bin/env python3
"""The 5-minute hike-entry pipeline for The Trailprint Atlas.

Drop a hike's raw materials into intake/ (one GPX export from AllTrails +
that hike's photos), then run:

    python3 tools/new-hike.py            # the real thing
    python3 tools/new-hike.py --dry-run  # rehearsal: shows everything, writes nothing

The wizard reads what a machine can know (date, coordinates, distance and
climb estimates, the next tta_NN id), asks only the human questions — each
with a default you can accept with Enter — and then does all the mechanical
work exactly to the Atlas's conventions:

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
    "Riparian Canyon", "Riparian Forest", "Riparian Meadow", "Urban Edge",
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

    if gpx_source:
        points = parse_gpx(os.path.join(INTAKE_DIR, gpx_source))
        est_miles, est_gain = gpx_estimates(points)
        derived_date = local_date_from_gpx(points)
        lat, lon = points[0][0], points[0][1]
        print(f"  GPX says: ~{est_miles} mi, ~{est_gain} ft of climb, "
              f"{len(points)} track points, starts at {lat:.5f}, {lon:.5f}")
    else:
        est_miles = est_gain = None
        derived_date = None
        lat = lon = None

    print("\n--- The facts only you know ---")
    trail_name = ask("Trail name (exactly as it should appear)")
    # Repeat hikes group by exact trail_name — snap to the existing spelling.
    existing_names = {h["trail_name"].lower(): h["trail_name"] for h in hikes}
    canonical = existing_names.get(trail_name.lower())
    if canonical and canonical != trail_name:
        print(f'  (matching existing trail "{canonical}" — using that exact spelling so repeats group)')
        trail_name = canonical
    elif canonical:
        print("  (repeat of an existing trail — the Atlas will group them together)")
    date_completed = ask("Date completed", default=derived_date, validate=validate_date)
    location = ask("Location (park / natural area)")
    region = ask('Region ("City, ST")', validate=validate_region)
    geography = pick("Primary geography:", GEOGRAPHIES)

    miles_hint = f" (GPX estimate: ~{est_miles})" if est_miles is not None else ""
    miles = ask(f"Miles — AllTrails' listed distance{miles_hint}", validate=validate_number)
    gain_hint = f" (GPX estimate: ~{est_gain})" if est_gain is not None else ""
    elevation_gain = ask(f"Elevation gain in feet — AllTrails' number{gain_hint}",
                         validate=validate_int)

    summit_trail = yes_no("Is this a summit trail?")
    summit_elevation = None
    if summit_trail:
        summit_elevation = ask("Summit elevation (feet)", validate=validate_int)

    difficulty = pick("Difficulty:", DIFFICULTIES)
    hike_type = pick("Hike type:", HIKE_TYPES,
                     default_index=None if gpx_source else HIKE_TYPES.index("Viewpoint"))

    companions_raw = ask('Hiked with (names like "Max M.", comma-separated; Enter if solo)',
                         default="", allow_empty=True)
    hiked_with = [n.strip() for n in companions_raw.split(",") if n.strip()]
    for name in hiked_with:
        if not re.match(r"^[A-Z][a-z]+.* [A-Z]\.$", name):
            print(f'    (heads-up: "{name}" doesn\'t match the usual "First L." style — keeping it as typed)')
    hike_size = {0: "Solo", 1: "Duo"}.get(len(hiked_with), "Group")
    print(f"  -> hike_size: {hike_size}")

    # Trip tag: offer existing tags so repeats never drift on spelling.
    # (Single-day outings count too — a "trip" is any tagged group of hikes.)
    trip_tag = None
    if yes_no("Part of a trip (day trip or multi-day)?"):
        existing_tags = sorted({h["trip_tag"] for h in hikes if h.get("trip_tag")})
        if existing_tags and yes_no("Reuse an existing trip tag?", default_no=False):
            trip_tag = pick("Which trip?", existing_tags)
        else:
            trip_tag = ask('New trip tag ("Trip Name - Mon YYYY")')

    all_trails_url = ask("AllTrails URL (or 'none')", default="none", validate=validate_url)
    official_trail_url = ask("Official trail URL (or 'none')", default="none", validate=validate_url)

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
