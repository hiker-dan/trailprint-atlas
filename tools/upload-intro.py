#!/usr/bin/env python3
"""Put the baked intro film on Cloudinary, and tell the page where it is.

The film is the one asset the Atlas cannot serve from its own repository the way
it serves everything else. renders/ is git-ignored on purpose: a ~50 MB binary
that is re-cut every time the choreography is retuned is exactly what git is
worst at, and the master would be in the history forever.

So the master is uploaded ONCE, as a video, and Cloudinary derives whatever the
visitor's browser and screen actually want from it — format, codec and width —
which is the whole reason for delivering it from there rather than from a static
file. One 2880-wide master; a phone is sent a 1280-wide h.264.

    python3 tools/upload-intro.py                     # uploads renders/intro-final-2880.webm
    python3 tools/upload-intro.py --file renders/x.webm
    python3 tools/upload-intro.py --check             # just verify what is live

Needs tools/cloudinary-credentials.json (git-ignored; copy the .example file),
the same one tools/new-hike.py uses.
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLOUD_NAME = "dgdniwosl"
CREDS_FILE = ROOT / "tools" / "cloudinary-credentials.json"
DEFAULT_MASTER = ROOT / "renders" / "intro-final-2880.webm"

# Flat public id, like every other asset in this account. The Media Library
# folder is cosmetic — it is how the assets are organised for a human, and it is
# NOT part of the delivery URL.
PUBLIC_ID = "atlas-intro-film"
ASSET_FOLDER = "trailprint-atlas/intro"

# The widths the page asks for. Each one is a derived asset Cloudinary builds on
# first request and then caches at its CDN; they cost transformations once, not
# per visitor. Kept in step with INTRO_WIDTHS in the page.
WIDTHS = (1280, 1920, 2560)


def delivery_url(width):
    """h.264, pinned — NOT f_auto:video. f_auto sends VP9 to Chrome and Firefox,
    and Apple Silicon has no VP9 decoder (VideoToolbox on an M3: h.264 and HEVC
    hardware, VP9 software), so f_auto was quietly putting every Mac visitor on a
    CPU decode of a 1080p stream and the film juddered. h.264 has a hardware
    decoder in essentially everything built since 2010. It costs bytes and buys a
    decode that cannot fall behind. Kept in step with introUrl() in the page.

    q_auto picks the bitrate from the content. c_limit never upscales, so a wide
    screen still gets the master's own resolution rather than a blown-up copy."""
    return (f"https://res.cloudinary.com/{CLOUD_NAME}/video/upload/"
            f"f_mp4,vc_h264,q_auto,w_{width},c_limit/{PUBLIC_ID}.mp4")


def load_creds():
    if not CREDS_FILE.exists():
        sys.exit(f"No credentials at {CREDS_FILE.relative_to(ROOT)} — copy the .example file.")
    return json.loads(CREDS_FILE.read_text())


def curl_json(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        sys.exit(f"Cloudinary said something that isn't JSON:\n{r.stdout[:400] or r.stderr[:400]}")


def upload(path, creds):
    """Signed upload of resource_type=video. curl rather than urllib for the same
    reason new-hike.py uses it: macOS system Python has no CA bundle of its own."""
    ts = str(int(time.time()))
    params = {
        "asset_folder": ASSET_FOLDER,
        "display_name": PUBLIC_ID,
        "invalidate": "true",       # a re-cut must not be served from a stale CDN copy
        "overwrite": "true",
        "public_id": PUBLIC_ID,
        "timestamp": ts,
    }
    to_sign = "&".join(f"{k}={v}" for k, v in sorted(params.items())) + creds["api_secret"]
    sig = hashlib.sha1(to_sign.encode()).hexdigest()
    cmd = ["curl", "-s", "--max-time", "1800", "-F", f"file=@{path}",
           "-F", f"api_key={creds['api_key']}", "-F", f"signature={sig}"]
    for k, v in params.items():
        cmd += ["-F", f"{k}={v}"]
    cmd.append(f"https://api.cloudinary.com/v1_1/{CLOUD_NAME}/video/upload")

    mb = os.path.getsize(path) / 1e6
    print(f"Uploading {Path(path).name}  ({mb:.1f} MB) ...")
    t0 = time.time()
    res = curl_json(cmd)
    if res.get("public_id") != PUBLIC_ID:
        sys.exit(f"Upload failed: {res.get('error', res)}")
    print(f"  stored as {res['public_id']}  "
          f"{res.get('width')}x{res.get('height')}  {res.get('duration', 0):.2f}s  "
          f"({time.time() - t0:.0f}s)")
    if res.get("asset_folder") != ASSET_FOLDER:
        print(f"  ! landed in '{res.get('asset_folder')}' rather than '{ASSET_FOLDER}'")
    return res


def check():
    """Ask for each width the way a browser would and report what comes back.
    The first request for a width is what makes Cloudinary transcode, so this
    doubles as warming every derived asset before a visitor waits on one.

    HEAD, not GET, deliberately: the transcode still happens, but the bytes are
    not sent — pulling all three widths in full would spend ~30 MB of the very
    delivery allowance this whole exercise is about."""
    ok = True
    for w in WIDTHS:
        url = delivery_url(w)
        r = subprocess.run(
            ["curl", "-s", "-I", "--max-time", "600", "-L",
             "-H", "User-Agent: Mozilla/5.0 (Macintosh) Chrome/126 Safari/537.36",
             "-w", "\n%{http_code} %{size_download} %{content_type}", url],
            capture_output=True, text=True)
        tail = r.stdout.strip().splitlines()[-1].split() if r.stdout.strip() else []
        code, ctype = (tail + ["", "", ""])[0], (tail + ["", "", ""])[2]
        length = 0
        for line in r.stdout.splitlines():
            if line.lower().startswith("content-length:"):
                length = int(line.split(":", 1)[1].strip() or 0)
        good = code == "200"
        ok &= good
        print(f"  w_{w:<5} {code}  {length/1e6:6.2f} MB  {ctype}"
              f"{'' if good else '   <- NOT SERVING'}")
    return ok


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--file", default=str(DEFAULT_MASTER), help="the master to upload")
    p.add_argument("--check", action="store_true", help="verify delivery, upload nothing")
    a = p.parse_args()

    if not a.check:
        src = Path(a.file)
        if not src.exists():
            sys.exit(f"No such file: {src}  (render one first: tools/render-intro.py)")
        upload(src, load_creds())
        print("Warming the derived widths (the first request is the slow one):")
    else:
        print("Checking delivery:")
    ok = check()
    print("\nThe page reads these:")
    for w in WIDTHS:
        print(f"  {delivery_url(w)}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
