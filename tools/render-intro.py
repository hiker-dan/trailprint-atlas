#!/usr/bin/env python3
"""Bake the intro film's satellite half to video.

The flight over the San Gabriels is a real 3D terrain render over real satellite
imagery, and no amount of camera tuning makes it play smoothly live: the camera
path has been measured to be indistinguishable from having no terrain at all,
and what is left — tiles arriving, levels re-skinning, Esri re-rendering its
imagery per zoom — belongs to the renderer, not to us. So that half stops being
a live fetch and becomes a finished shot. The cloud is the joint: the video ends
inside full white, the live map picks the same film up on the other side, and
because everything after the joint is still live, a new hike still appears in
the Atlas with no re-render.

    Draft first.  A full-quality bake is minutes of work per pass and there will
    be notes. So the same command renders a cheap, framed-identically draft by
    changing only the pixel density and the frame rate:

        python3 tools/render-intro.py                 # draft: 960x540, 15 fps
        python3 tools/render-intro.py --quality final # 1920x1080, 30 fps
        python3 tools/render-intro.py --from 0.3 --to 0.42   # one beat only

    Nothing about the composition changes between them — the CSS viewport is
    fixed at 1920x1080 for every quality, so a draft is the final film seen
    through a cheaper lens, not a different cut.

What makes the bake honest rather than merely slow: it drives the mockup's OWN
`renderAt(q)` through `__film`. The renderer holds no copy of the choreography,
so retuning a beat can never leave the video and the live map telling different
stories.

Two clocks, and which one to use was settled by measurement, not by argument:

  * `--clock settle` (default) parks the camera on each frame and waits for both
    maps to go quiet before shooting. Every frame is fully loaded.

  * `--clock virtual` drives Chrome's `Emulation.setVirtualTimePolicy`, so time
    in the page advances by exactly one frame per frame and freezes while a tile
    is in flight. It was built because settling each frame completes every
    250 ms raster crossfade instantly, which should turn the zoom-level swaps
    into hard cuts. Rendered both ways across a level crossing and compared for
    colour-cast and fine-detail jitter, THE TWO ARE INDISTINGUISHABLE — because
    a pitched 3D camera holds five tile levels on screen at once (measured:
    z11-13 through the pull-back), so a level change repaints a band, never the
    picture. Virtual time also occasionally hangs Chrome's own screenshot, which
    needs a compositor frame the stopped clock will not produce. So it is kept,
    documented, and not the default.

Requires nothing installed by hand: it builds its own virtual environment under
tools/.render-venv on first run and uses the ffmpeg Playwright already ships.
That ffmpeg can only read JPEG and write VP8/WebM, which is fine — Cloudinary
transcodes on upload and serves whatever the viewer's browser wants. If a full
ffmpeg is on PATH (`brew install ffmpeg`) this uses it instead and keeps the
frames lossless.
"""

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENV = ROOT / "tools" / ".render-venv"
NEEDS = ["playwright", "pillow", "numpy"]


def _bootstrap():
    """Re-exec inside a venv that has Playwright, building it the first time."""
    try:
        import playwright  # noqa: F401
        import PIL  # noqa: F401
        import numpy  # noqa: F401
        return
    except ImportError:
        pass

    py = VENV / "bin" / "python"
    if not py.exists():
        print("First run: building tools/.render-venv (a minute, once)...")
        subprocess.check_call([sys.executable, "-m", "venv", str(VENV)])
        subprocess.check_call([str(py), "-m", "pip", "install", "-q", "--upgrade", "pip"])
        subprocess.check_call([str(py), "-m", "pip", "install", "-q", *NEEDS])
        subprocess.check_call([str(py), "-m", "playwright", "install", "chromium"])
    os.execv(str(py), [str(py), str(Path(__file__).resolve()), *sys.argv[1:]])


_bootstrap()

import argparse  # noqa: E402
import asyncio  # noqa: E402
import functools  # noqa: E402
import http.server  # noqa: E402
import io  # noqa: E402
import json  # noqa: E402
import shutil  # noqa: E402
import threading  # noqa: E402
import time  # noqa: E402

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402

PAGE = "mockups/option-c-3d-cinematic.html"
OUT_DIR = ROOT / "renders"
# The one thing a bake leaves behind that IS committed: the handful of facts the
# live page needs in order to keep the second half of the film growing with the
# Atlas while the first half stays a finished video.
RECORD_FILE = ROOT / "data" / "intro-film.json"

# The composition is a function of the CSS viewport, so it is FIXED. Quality is
# pixel density and frame rate only — never size — or a draft would be framed
# differently from the film it is meant to preview.
CSS_W, CSS_H = 1920, 1080

QUALITIES = {
    # name        dsf   fps  jpeg  settle-cap ms
    "draft":    (0.50,  15,   90,  2500),
    "preview":  (1.00,  24,   95,  4000),
    "final":    (1.00,  30,   98,  8000),
    "ultra":    (2.00,  30,   98, 12000),
}

# --force-color-profile: without it Chrome composites in the display's own
# profile (Display P3 on any recent Mac) and the baked film comes out a
# different colour from the live page it has to sit next to.
CHROME_ARGS = [
    "--use-angle=metal",
    "--enable-unsafe-swiftshader",
    "--force-color-profile=srgb",
    "--font-render-hinting=none",
    "--hide-scrollbars",
    "--autoplay-policy=no-user-gesture-required",
]


# ---------------------------------------------------------------------------
# the local server — the page fetches hikes.json and trails.geojson, which a
# file:// origin refuses outright
# ---------------------------------------------------------------------------
def serve(root: Path):
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    handler = functools.partial(Quiet, directory=str(root))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


# ---------------------------------------------------------------------------
# the encoder
# ---------------------------------------------------------------------------
def find_ffmpeg():
    """A real ffmpeg if there is one; Playwright's stripped build otherwise.

    Playwright's build reads JPEG and writes VP8 only. That is enough — but a
    full ffmpeg keeps the frames lossless and can write h.264, so prefer it.
    """
    system = shutil.which("ffmpeg")
    if system:
        return system, True
    cache = Path.home() / "Library" / "Caches" / "ms-playwright"
    for d in sorted(cache.glob("ffmpeg-*"), reverse=True):
        for name in ("ffmpeg-mac", "ffmpeg-linux", "ffmpeg.exe"):
            if (d / name).exists():
                return str(d / name), False
    return None, False


class Encoder:
    """Frames in, one video file out. Frames are piped, never written to disk.

    A 30 fps bake of the flight is ~700 frames; at 4K that is 8 GB of PNGs for a
    file that ends up ~30 MB. Piping keeps the whole job in memory-sized pieces
    and means an interrupted render leaves nothing to clean up.
    """

    def __init__(self, path: Path, fps: int, full: bool, quality: str):
        self.path, self.full = path, full
        exe, self.is_system = find_ffmpeg()
        if not exe:
            sys.exit("No ffmpeg found. Install Playwright's browsers, or `brew install ffmpeg`.")
        # Playwright's ffmpeg is built --disable-everything: `-i -` finds no
        # protocol and the JPEG stream will not probe. Both have to be spelled
        # out, and they are harmless on a full build.
        src = ["-f", "image2pipe", "-c:v", "mjpeg", "-framerate", str(fps), "-i", "pipe:0"]
        fine = quality in ("final", "ultra")
        if self.is_system:
            # h.264 in an mp4: the widest thing to hand to Cloudinary.
            self.path = path.with_suffix(".mp4")
            args = [exe, "-y", "-hide_banner", *src,
                    "-c:v", "libx264", "-preset", "slow", "-crf", "16" if fine else "23",
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(self.path)]
        else:
            # VP8 at a near-lossless quantiser. It is an intermediate: Cloudinary
            # re-encodes on upload, so the only job here is to not be the
            # generation that loses anything visible.
            self.path = path.with_suffix(".webm")
            args = [exe, "-y", "-hide_banner", *src,
                    "-c:v", "libvpx", "-b:v", "0", "-crf", "6" if fine else "14",
                    "-qmin", "0", "-qmax", "24", "-auto-alt-ref", "0",
                    "-pix_fmt", "yuv420p", str(self.path)]
        self.log = open(path.with_suffix(".ffmpeg.log"), "wb")
        self.proc = subprocess.Popen(args, stdin=subprocess.PIPE,
                                     stdout=self.log, stderr=self.log)

    def write(self, jpeg_bytes: bytes):
        try:
            self.proc.stdin.write(jpeg_bytes)
        except BrokenPipeError:
            self.log.flush()
            sys.exit("ffmpeg stopped reading frames. Its log:\n" +
                     self.log.name + "\n" +
                     Path(self.log.name).read_text(errors="replace")[-2000:])

    def close(self):
        self.proc.stdin.close()
        code = self.proc.wait()
        self.log.close()
        if code != 0:
            sys.exit("ffmpeg failed:\n" +
                     Path(self.log.name).read_text(errors="replace")[-2000:])
        Path(self.log.name).unlink(missing_ok=True)
        return self.path


# ---------------------------------------------------------------------------
# the film
# ---------------------------------------------------------------------------
DBG_JS = """() => ({
    S2: __dbg.S2, S4: __dbg.S4, D: __dbg.D,
    CLOUD_IN: __dbg.CLOUD_IN, CLOUD_FULL: __dbg.CLOUD_FULL,
    CLOUD_HOLD: __dbg.CLOUD_HOLD, CLOUD_OUT: __dbg.CLOUD_OUT,
    HANDOFF_Z: __dbg.HANDOFF_Z, PRE_LIT: __dbg.PRE_LIT,
    anf: __dbg.SCHED.anf.length, nat: __dbg.SCHED.nat.length,
    dpr: window.devicePixelRatio
})"""

# What is TRUE OF THIS VIDEO and can never be worked out again from the data.
# The live page reads it back so the second half of the film can keep growing
# with the Atlas while the first half stays a finished picture — see the long
# note beside FILM in the page itself.
RECORD_JS = """() => ({
    zSpan: __dbg.Z_SPAN,
    handoffZ: __dbg.HANDOFF_Z,
    duration: __dbg.D,
    atlasStart: { center: __dbg.atlasStart.center, zoom: __dbg.atlasStart.zoom },
    inked: __dbg.INKED_IDS
})"""

GL_JS = """() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return 'no webgl';
    const e = gl.getExtension('WEBGL_debug_renderer_info');
    return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
}"""


class VirtualClock:
    """Chrome's virtual time, granted one frame at a time.

    The page's clock only moves when we say so and freezes whenever a tile is in
    flight, so every frame is complete and every timed transition in the page —
    the raster crossfades above all — advances by exactly one frame between
    screenshots, the same as it would on a perfect network.
    """

    def __init__(self, cdp):
        self.cdp = cdp
        self.expired = asyncio.Event()
        self.granted = 0.0
        cdp.on("Emulation.virtualTimeBudgetExpired", lambda _: self.expired.set())

    async def start(self):
        await self.cdp.send("Emulation.setVirtualTimePolicy", {"policy": "pause"})

    async def grant(self, ms: float, timeout: float = 90.0):
        self.expired.clear()
        await self.cdp.send("Emulation.setVirtualTimePolicy", {
            "policy": "pauseIfNetworkFetchesPending",
            "budget": max(1.0, ms),
            # A page that never stops scheduling timers would otherwise stall
            # virtual time forever; this lets it run on regardless.
            "maxVirtualTimeTaskStarvationCount": 100000,
        })
        try:
            await asyncio.wait_for(self.expired.wait(), timeout)
        except asyncio.TimeoutError:
            # Almost always a request that will never answer. Take the frame we
            # have rather than abandon a render that is otherwise fine.
            await self.cdp.send("Emulation.setVirtualTimePolicy", {"policy": "pause"})
        self.granted += max(1.0, ms)


async def shoot(page, jpeg_q: int, clock=None) -> bytes:
    """A frame, with the one deadlock a stopped clock can cause designed out.

    Playwright waits for `document.fonts.ready` before every screenshot. If
    anything in the page asks for a font while virtual time is paused, that
    promise can never settle and the shot hangs until it times out. A short
    grant of clock is all it takes to clear, so ask for one rather than lose a
    render fifteen minutes in.
    """
    for attempt in range(3):
        try:
            return await page.screenshot(type="jpeg", quality=jpeg_q,
                                         animations="allow", timeout=20000)
        except Exception:
            if attempt == 2 or clock is None:
                raise
            await clock.grant(120)


def blend(frames: list) -> bytes:
    """Average sub-frames into one, for motion blur on the final pass."""
    acc = None
    for b in frames:
        a = np.asarray(Image.open(io.BytesIO(b)).convert("RGB"), dtype=np.float32)
        acc = a if acc is None else acc + a
    out = io.BytesIO()
    Image.fromarray((acc / len(frames)).round().astype(np.uint8)).save(
        out, "JPEG", quality=98, subsampling=0)
    return out.getvalue()


async def main(cfg):
    dsf, fps, jpeg_q, settle_cap = QUALITIES[cfg.quality]
    if cfg.dsf:
        dsf = cfg.dsf
    if cfg.fps:
        fps = cfg.fps

    srv, port = serve(ROOT)
    # `live=1` is not optional: the page now plays the BAKED film by default, and
    # a renderer that forgot this would dutifully re-record last night's video.
    qs = "?q=0&live=1" + (f"&hero={cfg.hero}" if cfg.hero else "")
    if cfg.mark:
        qs += f"&mark={cfg.mark}"
    url = f"http://127.0.0.1:{port}/{PAGE}{qs}"

    OUT_DIR.mkdir(exist_ok=True)
    print(f"Serving {ROOT.name} on :{port}")
    print(f"Quality {cfg.quality}: {int(CSS_W*dsf)}x{int(CSS_H*dsf)} @ {fps} fps "
          f"(css {CSS_W}x{CSS_H}, dpr {dsf})")

    async with async_playwright() as pw:
        launch = dict(headless=not cfg.headed, args=CHROME_ARGS)
        try:
            browser = await pw.chromium.launch(channel="chrome", **launch)
        except Exception:
            browser = await pw.chromium.launch(**launch)
        ctx = await browser.new_context(viewport={"width": CSS_W, "height": CSS_H},
                                        device_scale_factor=dsf)
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        t_boot = time.time()
        print("Booting the film (loads every tile of the opening shot)...")
        await page.goto(url, wait_until="domcontentloaded")
        await page.wait_for_selector("#boot.done", timeout=300000)
        if errors:
            sys.exit("Page error during boot:\n  " + "\n  ".join(errors))

        gl = await page.evaluate(GL_JS)
        dbg = await page.evaluate(DBG_JS)
        rec = await page.evaluate(RECORD_JS)
        if cfg.record_only:
            # Write the record WITHOUT baking. Only correct when the video on
            # Cloudinary was cut from these exact numbers — i.e. nothing that
            # touches the flight (the ramp, the hand-off, the hero, the Angeles
            # cascade) has changed since. If in any doubt, bake instead: a full
            # render writes the record itself and cannot disagree with itself.
            rec["renderedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            RECORD_FILE.write_text(json.dumps(rec, indent=2) + "\n")
            print(f"Wrote {RECORD_FILE.relative_to(ROOT)} from a LIVE BOOT, no bake.")
            print(f"  {len(rec['inked'])} trails inked, zSpan {rec['zSpan']:.4f}, "
                  f"sheet starts z{rec['atlasStart']['zoom']:.4f}")
            srv.shutdown()
            await browser.close()
            return
        print(f"  booted in {time.time()-t_boot:5.1f}s   GPU: {gl}")
        if "SwiftShader" in gl or "Software" in gl:
            print("  (software rendering — correct, but several times slower)")

        # The film's own beats decide where the video ends. S4 is the frame the
        # live page swaps to the Atlas sheet on, and it sits inside the cloud's
        # full white — so the video carries everything up to there and the live
        # map continues from exactly the same q with nothing visible to match.
        q0 = cfg.q_from
        q1 = dbg["S4"] + 0.005 if cfg.q_to is None else cfg.q_to
        n = max(1, round((q1 - q0) * dbg["D"] / 1000 * fps))
        print(f"  beats: cloud in {dbg['CLOUD_IN']:.3f} full {dbg['CLOUD_FULL']:.3f} "
              f"swap {dbg['S4']:.3f} out {dbg['CLOUD_OUT']:.3f}")
        print(f"  range q {q0:.3f}-{q1:.3f}  =  {(q1-q0)*dbg['D']/1000:.1f}s  =  {n} frames")

        await page.evaluate("({credit}) => __film.dress({credit})", {"credit": cfg.credit})

        # Warm FIRST, on the real clock. Every tile the film will ask for goes
        # into the browser's cache in four parallel lanes, so the bake that
        # follows is nearly network-free and virtual time barely has to pause.
        t_warm = time.time()
        print("Warming the whole film's tiles...", flush=True)
        task = asyncio.create_task(page.evaluate("() => __film.warm()"))
        while not task.done():
            await asyncio.sleep(3)
            done, total = await page.evaluate("() => __film.warmProgress()")
            print(f"  {done}/{total} tiles  ({time.time()-t_warm:.0f}s)", flush=True)
        await task
        print(f"  warmed in {time.time()-t_warm:5.1f}s", flush=True)

        clock = None
        if cfg.clock == "virtual":
            cdp = await ctx.new_cdp_session(page)
            clock = VirtualClock(cdp)
            await clock.start()

        enc = None if cfg.dry_run else Encoder(
            OUT_DIR / (cfg.out or f"intro-{cfg.quality}"), fps, find_ffmpeg()[1], cfg.quality)
        step_ms = 1000.0 / fps
        sub = max(1, cfg.mblur)
        t0 = time.time()

        for i in range(n + 1):
            q = q0 + (q1 - q0) * i / n
            shots = []
            for s in range(sub):
                # Sub-frames sample ACROSS the frame's own slice of time, which
                # is what a shutter does; sampling around it would smear motion
                # the frame never had.
                qs_ = q + (q1 - q0) * (s / sub) / n if sub > 1 else q
                await page.evaluate("q => __seek(q)", min(q1, qs_))
                if clock:
                    # One frame of page time — advance to where the film should
                    # be, never by a fixed amount, so extra settling grants
                    # cannot let the transition clock drift ahead of the film.
                    target = (i + (s + 1) / sub) * step_ms
                    await clock.grant(target - clock.granted)
                    # A tile that arrives at the very end of a budget has not
                    # been DRAWN yet — it needs one more animation frame, which
                    # needs a little more clock. Asked synchronously: the clock
                    # is frozen here, so nothing that waits for a frame can
                    # answer.
                    for _ in range(6):
                        if await page.evaluate("() => __film.quiet()"):
                            break
                        await clock.grant(16)
                else:
                    await page.evaluate("ms => __film.settle(ms)", settle_cap)
                shots.append(await shoot(page, jpeg_q, clock))
            if enc:
                enc.write(shots[0] if sub == 1 else blend(shots))
            if i % 25 == 0 or i == n:
                el = time.time() - t0
                rate = el / max(1, i)
                print(f"  frame {i:4d}/{n}  {el:6.1f}s elapsed  "
                      f"~{rate*(n-i):6.1f}s left  ({rate:.2f}s/frame)")

        out = enc.close() if enc else None
        srv.shutdown()
        await browser.close()

        if errors:
            print("\nPage errors during the bake (frames may be wrong):")
            for e in errors[:5]:
                print("  " + e)
        if out and cfg.q_from == 0.0 and cfg.q_to is None:
            # Only a FULL bake may rewrite the record — a partial one (--from/--to,
            # used to look at a single beat) is not the film the live page will play.
            rec["renderedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            rec["frames"] = n
            RECORD_FILE.write_text(json.dumps(rec, indent=2) + "\n")
            print(f"Wrote {RECORD_FILE.relative_to(ROOT)}  "
                  f"({len(rec['inked'])} trails inked, zSpan {rec['zSpan']:.4f})")
        elif out:
            print("(partial bake — data/intro-film.json left alone)")
        if out:
            mb = out.stat().st_size / 1e6
            print(f"\nWrote {out.relative_to(ROOT)}  ({mb:.1f} MB, "
                  f"{(q1-q0)*dbg['D']/1000:.1f}s, {int(CSS_W*dsf)}x{int(CSS_H*dsf)})")
            print(f"Total {time.time()-t0:.0f}s of baking.")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--quality", choices=list(QUALITIES), default="draft")
    p.add_argument("--fps", type=int, help="override the quality's frame rate")
    p.add_argument("--dsf", type=float, help="override pixel density (1.0 = 1920x1080)")
    p.add_argument("--from", dest="q_from", type=float, default=0.0,
                   help="start of the film, 0..1")
    p.add_argument("--to", dest="q_to", type=float, default=None,
                   help="end of the film, 0..1 (default: the cloud swap)")
    p.add_argument("--out", default=None,
                   help="name under renders/ (default overwrites intro-<quality>; "
                        "give one to keep a cut for comparison)")
    p.add_argument("--clock", choices=["settle", "virtual"], default="settle")
    p.add_argument("--mblur", type=int, default=0,
                   help="sub-frames averaged per frame (final polish; 3 is plenty)")
    p.add_argument("--no-credit", dest="credit", action="store_false",
                   help="drop the Esri imagery credit (it is a licence condition)")
    p.add_argument("--hero", default=None, help="hero trail id, e.g. tta_47")
    p.add_argument("--mark", default=None, help="opening title mode: off / late / early")
    p.add_argument("--headed", action="store_true", help="show the browser while it bakes")
    p.add_argument("--dry-run", action="store_true", help="walk the film, write no video")
    p.add_argument("--record-only", action="store_true",
                   help="write data/intro-film.json from a live boot and stop — "
                        "only valid when the flight is unchanged since the last bake")
    asyncio.run(main(p.parse_args()))
