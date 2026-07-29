/**
 * THE LIFE IN TRAILS — the Atlas's opening film.
 *
 * Two halves joined by a cloud. The first is a baked video: a 3D flight over the
 * San Gabriels with the PCT leg inking itself and the Angeles forest lighting up
 * around it. The second is a LIVE MapLibre map: the Atlas sheet, pulling back to
 * the whole country while the rest of the trailprints draw themselves in.
 *
 * That split is the whole design. The flight needs real satellite imagery, real
 * terrain and 30 zoom levels of tiles — measured at ~30 MB and 2,200 requests to
 * fly live, which is not something to ask of a visitor. Baked, it is one ~9 MB
 * video. But a video can never show a hike added tomorrow, so everything from
 * the cloud onward stays live and is rebuilt from trails.geojson on every load.
 *
 * WHAT MAKES THAT SAFE is `data/intro-film.json` — the film record, written by
 * tools/render-intro.py at the moment the video is baked. See the long note
 * beside FILM below: it is what stops a new hike from being wrongly claimed by
 * the video, and what stops a new hike from silently desyncing it.
 *
 * ONE FILM, TWO HOSTS. This file is loaded by index.html (where it is the
 * homepage's opening) and by mockups/option-c-3d-cinematic.html (the cutting
 * room, where the renderer drives it and the instruments hang off it). It builds
 * its own stage inside whatever element it is given, adopts the page's own
 * chrome if the page has any, and publishes `window.AtlasFilm`. There is no
 * second copy of the choreography anywhere, and there must never be one.
 *
 * Requires: config.js (palette + Cloudinary), MapLibre GL 5.6.1.
 */
(async function () {

// The host. index.html gives it the hero section; the cutting room gives it a
// bare full-screen stage. Nothing else about the two pages differs.
const host = document.getElementById('hero-film');
if (!host) return;
// Set by the inline check in index.html, before first paint: a repeat visit
// this session, or a visitor whose system asks for reduced motion. The film
// still builds itself — the landed sheet IS the film — but nothing animates and
// the video is never fetched.
const FAST_FORWARD = document.documentElement.classList.contains('intro-fast-forward');
if (!window.maplibregl) { console.error('The intro film needs MapLibre.'); return; }

// Data paths come from THIS SCRIPT's own location, not from the page's, because
// the two hosts sit at different depths (`/index.html` and `/mockups/...`) and a
// relative fetch would resolve against the document.
const DATA = (document.currentScript && document.currentScript.src
    ? document.currentScript.src.replace(/scripts\/[^/]*$/, '')
    : new URL('.', location.href).href) + 'data/';

// ===== The stage ============================================================
// Built here rather than written into either page's markup, so the two hosts
// cannot drift apart and neither has to know the film's internal layering.
// Order is z-order: the flight surfaces at the bottom, the mask above them, the
// page's own vignette and titles on top.
const layer = (cls, tag) => {
    const el = document.createElement(tag || 'div');
    el.className = cls;
    host.appendChild(el);
    return el;
};
host.classList.add('is-film');
const atlasEl = layer('if-map if-atlas');     // the landing: the Atlas sheet
const globeEl = layer('if-map if-globe');     // the flight: satellite + terrain
const filmEl = layer('if-video', 'video');    // the baked flight
filmEl.muted = true; filmEl.playsInline = true; filmEl.preload = 'auto';
filmEl.setAttribute('aria-hidden', 'true');
const washEl = layer('if-wash');
const hazeEl = layer('if-haze');
const cloudsEl = layer('if-clouds');
cloudsEl.innerHTML = '<i class="c3"></i><i class="puff"></i><i class="puff"></i><i class="puff"></i><i class="puff"></i>';

// ---- the page's own chrome, adopted rather than replaced -------------------
// index.html already owns a vignette, a title, a scroll hint, a credit and the
// skip/replay button — they are the HOMEPAGE's furniture and outlive the film.
// The cutting room has none of that, so anything missing is created. Either way
// the film below talks to one set of handles.
const adopt = (sel, make) => host.querySelector(sel) || make();
// The vignette is the FILM's, never the page's, and it is built rather than
// adopted for a measurable reason: it is BAKED INTO THE VIDEO. The homepage used
// to carry a lighter, warmer one for the old SVG film, and letting the film wear
// that made the corners lift the instant the live half took over — the seam went
// from 1.01/255 to 2.19. Same gradient on both sides of the cut, or no cut.
const vigEl = layer('if-vig');
const titleEl = adopt('.hero-title', () => {
    const el = layer('hero-title');
    el.innerHTML = '<h1>The Trailprint Atlas</h1>';
    return el;
});
const hintEl = host.querySelector('.scroll-hint');
const creditEl = adopt('.terrain-credit', () => layer('terrain-credit'));
const btn = host.querySelector('.film-btn');

// The homepage's intro coordinator, if there is one. home.js declares it with
// `const`, which makes it a global BINDING but not a property of `window` — so
// `window.AtlasIntro` is undefined even on the page that owns it, and every
// check written that way silently does nothing. (It did: the skip button landed
// the film but left the nav's loading phrases running.) The cutting room has no
// home.js at all, hence the typeof guard rather than a bare reference.
const Intro = (typeof AtlasIntro !== 'undefined') ? AtlasIntro : null;

// Hooks the cutting room fills in and the homepage leaves alone. They are
// registered through the published API, which means a host has to be able to
// reach that API before the film has finished booting — hence AtlasFilmReady,
// published synchronously below, while AtlasFilm itself arrives at the end.
let onFrame = () => {}, onDress = () => {}, onStage = () => {};
let READY = () => {};
const ready = new Promise(res => { READY = res; });
let PUBLISH = () => {};
window.AtlasFilmReady = new Promise(res => { PUBLISH = res; });

// ===== THE PLATE ROOM ======================================================
// What a visitor looks at while the film loads, and it is not decoration: the
// film used to start on whatever had arrived, so the first watch stuttered
// while the video buffered underneath it, and a repeat visit flashed frames of
// the boot's own tile sweep before landing. Both were the same fault — nothing
// was covering the stage until the film was genuinely ready.
//
// So the stage is covered, and the cover shows the honest truth: a real
// trailprint from the Atlas, chosen at random, inking itself inside a small
// engraved plate, with the ring around it tracking what has ACTUALLY loaded.
// Different hike every time you arrive. It gives nothing of the film away —
// the film opens on satellite terrain, so parchment and brass is a deliberate
// contrast — and it is made of the same thing the whole site is made of.
const loadEl = layer('if-load');
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (t, a) => { const e = document.createElementNS(NS, t);
    for (const k in a) e.setAttribute(k, a[k]); return e; };
const R = 74, C = 2 * Math.PI * R;
const plate = svgEl('svg', { class: 'if-plate', viewBox: '0 0 200 200' });
// the neatline the whole Atlas is drawn inside
plate.appendChild(svgEl('circle', { class: 'pl-rule', cx: 100, cy: 100, r: R + 12 }));
plate.appendChild(svgEl('circle', { class: 'pl-face', cx: 100, cy: 100, r: R + 6 }));
// the compass: cardinal arms, engraved, and the eight half-winds as ticks
'0,45,90,135,180,225,270,315'.split(',').forEach(a => {
    const rad = a * Math.PI / 180, card = a % 90 === 0;
    const r0 = card ? R - 9 : R - 4, r1 = R + 2;
    plate.appendChild(svgEl('line', {
        class: 'pl-tick' + (card ? ' is-card' : ''),
        x1: 100 + Math.sin(rad) * r0, y1: 100 - Math.cos(rad) * r0,
        x2: 100 + Math.sin(rad) * r1, y2: 100 - Math.cos(rad) * r1 }));
});
// north, and only north — a compass that labels all four is a diagram
const nMark = svgEl('path', { class: 'pl-north', d: 'M100 8 l5 11 -5 -3 -5 3 Z' });
plate.appendChild(nMark);
// the ring: the true fraction of the film that has arrived
const ring = svgEl('circle', { class: 'pl-ring', cx: 100, cy: 100, r: R + 6 });
ring.style.strokeDasharray = C + 12 * 2 * Math.PI;
plate.appendChild(ring);
// and the trailprint itself, laid in later once the geometry is in hand
const inkPath = svgEl('path', { class: 'pl-ink' });
plate.appendChild(inkPath);
loadEl.appendChild(plate);
const loadCap = document.createElement('div');
loadCap.className = 'if-load-cap';
loadCap.textContent = 'Preparing the plate';
loadEl.appendChild(loadCap);

let ringLen = C + 12 * 2 * Math.PI, inkLen = 0;

// ---- One clean motion, however lumpy the truth underneath ------------------
// The real signals arrive in steps — data, then a tile sweep that reports
// nothing for several seconds, then a download that can finish in one burst —
// so a ring driven straight off them "loads to roughly 25%, stalls, then zooms
// ahead to 100%". Which is exactly what it did.
//
// So there are two numbers. `target` is the truth. `shown` is what the plate
// draws, and it only ever CREEPS toward the truth, on its own clock: fast
// enough to feel responsive when real progress lands, slow enough that a long
// silent stretch still moves. It can never go backwards and never jump.
let target = 0, shown = 0, ticking = false;
function paint() {
    ring.style.strokeDashoffset = ringLen * (1 - shown);
    // The trail runs slightly ahead of the ring, so the walk is complete and
    // readable as a shape a moment before the cover lifts off it.
    if (inkLen) inkPath.style.strokeDashoffset = inkLen * (1 - Math.min(1, shown * 1.18));
}
function tick() {
    if (!ticking) return;
    // Ease toward the truth, and if the truth is standing still, drift the last
    // stretch anyway — never past it, and never past 0.97 until the truth says
    // so, because a bar that sits on 100% while you wait is a lie.
    const gap = target - shown;
    shown += gap > 0 ? Math.max(gap * 0.055, 0.0012) : 0;
    if (shown > target) shown = target;
    paint();
    requestAnimationFrame(tick);
}
// The truth moved. `aim` never lets it fall back — progress that retreats reads
// as something having gone wrong.
function aim(p) {
    p = Math.max(0, Math.min(1, p));
    if (p > target) target = p;
    if (!ticking) { ticking = true; requestAnimationFrame(tick); }
}
// EVERY PHASE CREEPS, and that is the rule. The boot is a chain of waits and
// most of them cannot report anything: the tile sweep is silent, a stalled
// download is silent, waiting for the map's first frame is silent. Measured on
// the way here: a single global creep with one ceiling froze the ring for 8.6s
// at one point and, when the download itself stalled, for 55s at another.
//
// So each phase declares the band it owns and creeps across it asymptotically —
// always moving, never arriving, slowing as it goes — and any real signal
// inside that phase simply overtakes it, since `aim` takes the larger of the
// two. Nothing can freeze, and nothing can claim to be finished early.
let stopCreep = () => {};
function phase(from, ceil, tau) {
    stopCreep();
    aim(from);
    const t0 = performance.now();
    const id = setInterval(() => {
        aim(from + (ceil - from) * (1 - Math.exp(-(performance.now() - t0) / tau)));
    }, 80);
    stopCreep = () => { clearInterval(id); stopCreep = () => {}; };
}
aim(0);
paint();

// The trailprint is only laid in once the geometry has loaded — which is itself
// the first thing that happens, so the plate is never empty for long.
function layTrailprint(features, colorOf) {
    // Long enough to read as a walk rather than a smudge, and picked fresh on
    // every load: arriving at the Atlas twice should not look identical.
    const usable = features.filter(f => {
        const g = f.geometry, segs = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
        return segs[0] && segs[0].length > 40;
    });
    if (!usable.length) return;
    const f = usable[Math.floor(Math.random() * usable.length)];
    const g = f.geometry, segs = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
    const pts = segs[0];
    // Web Mercator, BOTH AXES IN THE SAME UNITS — longitude in radians, not in
    // degrees. Mixing degrees of longitude against a log-mercator latitude makes
    // the vertical span come out ~57x too small at this latitude, which drew
    // every trail as a flat horizontal dash. Aspect is then HELD: a trail
    // squashed to fill its box is not that trail any more.
    const mx = lo => lo * Math.PI / 180;
    const my = la => Math.log(Math.tan(Math.PI / 4 + la * Math.PI / 360));
    const xs = pts.map(c => mx(c[0])), ys = pts.map(c => my(c[1]));
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    const span = Math.max(x1 - x0, y1 - y0) || 1e-9;
    const k = (R * 1.28) / span;          // sized to the compass, with air
    let d = '';
    pts.forEach((c, i) => {
        const x = 100 + (mx(c[0]) - (x0 + x1) / 2) * k;
        const y = 100 - (my(c[1]) - (y0 + y1) / 2) * k;
        d += (i ? 'L' : 'M') + x.toFixed(2) + ',' + y.toFixed(2) + ' ';
    });
    inkPath.setAttribute('d', d);
    // its own year's ink, so even the loading screen speaks the palette.
    // INLINE STYLE, not a `stroke` attribute — a presentation attribute loses to
    // the stylesheet, so the CSS default silently won and every trail came out
    // the same grey-brown.
    inkPath.style.stroke = colorOf(f.properties.trail_id);
    inkLen = inkPath.getTotalLength();
    inkPath.style.strokeDasharray = inkLen;
    inkPath.style.strokeDashoffset = inkLen;
}

function showCover(caption) {
    loadEl.style.display = '';
    loadEl.classList.remove('is-gone');
    if (caption) loadCap.textContent = caption;
    target = shown = 0; paint();
    if (!ticking) { ticking = true; requestAnimationFrame(tick); }
}
function liftCover() {
    stopCreep();
    aim(1);
    // Let the last of the motion land before the cover starts to go, so the
    // ring is seen to close rather than being whisked away mid-stroke.
    setTimeout(() => loadEl.classList.add('is-gone'), 260);
    setTimeout(() => { loadEl.style.display = 'none'; ticking = false; }, 1400);
}

// ===== Data =================================================================
const [hikes, geo] = await Promise.all([
    fetch(DATA + 'hikes.json').then(r => r.json()),
    fetch(DATA + 'trails.geojson').then(r => r.json())
]);
const byId = {}; hikes.forEach(h => { byId[h.trail_id] = h; });
// The plate has something real to draw now.
layTrailprint(geo.features, id => {
    const h = byId[id];
    return ATLAS_CONFIG.COLOR_MAP[String(h ? new Date(h.date_completed).getUTCFullYear() : 2022)]
        || ATLAS_CONFIG.DEFAULT_COLOR;
});
phase(0, 0.22, 9000);        // fetching data, building the two maps
const yearColor = y => ATLAS_CONFIG.COLOR_MAP[String(y)] || ATLAS_CONFIG.DEFAULT_COLOR;
const yearOf = id => byId[id] ? new Date(byId[id].date_completed).getUTCFullYear() : 2022;

const featOf = {};
geo.features.forEach(f => { featOf[f.properties.trail_id] = f; });

// The hero trail. Nine visits over four years makes Tee Pee the most-walked
// ground in the Atlas, which is why the film opens on it — and tta_113 is the
// cleanest recording of the nine: one unbroken segment, 197 points, 8.2 km.
// tta_47, the PCT backpacking trip: Mill Creek Summit to Sulphur Springs, 12.8
// miles and 2,549 ft. It replaced Tee Pee (tta_113, 8.2 km but only 1.4 km
// across) because the film needs GROUND to cover — Tee Pee fits inside a single
// frame at z14, so most of the pull-back was spent leaving it behind rather than
// revealing it. The PCT leg spans 9.4 km, near seven times the extent, and it
// stays in the Angeles so the forest ignition around it is unchanged.
// ?hero=tta_113 to compare.
const HERO_ID = new URLSearchParams(location.search).get('hero') || 'tta_47';
// Its own return leg walks the identical ground the next day, so it would ink a
// second line straight down the hero's back. A repeat is real and the Atlas says
// so elsewhere; here it is just a doubled stroke.
const HERO_TWIN = { tta_47: 'tta_48', tta_48: 'tta_47' }[HERO_ID];
const heroFeat = featOf[HERO_ID];
const heroCoords = heroFeat.geometry.type === 'LineString'
    ? heroFeat.geometry.coordinates
    : heroFeat.geometry.coordinates.flat();
const HERO_COLOR = yearColor(yearOf(HERO_ID));

// Every Angeles hike, for the ignition in movement II. Sorted outward from the
// hero trail further down, once the anchor exists.
const ANF_IDS = hikes.filter(h => (h.location || '').toLowerCase().includes('angeles')
                                  && featOf[h.trail_id] && h.trail_id !== HERO_TWIN)
                     .map(h => h.trail_id);

// ===== The anchor ===========================================================
// The camera does NOT walk the route any more. Following a GPX means inheriting
// every wobble in the recording — consumer GPS wanders a few metres per sample,
// and at 15 m above the ground that is a camera shaking its head. No amount of
// smoothing removes it, because the jitter IS the data. Danny's word for
// watching it was motion sickness, and he was right.
//
// So the camera never translates meaningfully at all. It is pinned over one
// point and only ORBITS: bearing sweeps, zoom widens, pitch flattens. All three
// are smooth analytic curves of one variable, so there is nothing left that
// can stutter.
const heroBBox = (() => {
    let w = 180, e = -180, s = 90, n = -90;
    heroCoords.forEach(c => {
        if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0];
        if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1];
    });
    return { w, e, s, n, mid: [(w + e) / 2, (s + n) / 2] };
})();
const heroMid = heroBBox.mid;
// Open where the WALK began, not at the trail's middle. With a short hero the
// middle was right — the whole thing was on screen from the first frame either
// way. With a 9 km hero it is wrong: the camera would sit halfway along, the ink
// would start somewhere off to the left, and you would watch several seconds of
// empty ridge before it arrived. Standing on the trailhead, the ink starts under
// the camera and runs away from you into country you cannot see yet, which is
// the whole feeling the longer trail was chosen for.
const ANCHOR = heroCoords[0];
const heroLenKm = (() => {
    let L = 0;
    for (let i = 1; i < heroCoords.length; i++) {
        const a = heroCoords[i - 1], b = heroCoords[i];
        L += Math.hypot((b[0] - a[0]) * 111.32 * Math.cos(a[1] * Math.PI / 180), (b[1] - a[1]) * 111.32);
    }
    return L;
})();

// The forest lights OUTWARD from the trail you have just walked. Order is what
// makes an early start visible at all: while the camera is still tight on Tee
// Pee the only other hikes on screen are its neighbours, so igniting in file
// order (newest first, scattered across 40 km of range) would light trails over
// the horizon and show nothing. Outward from the anchor, the reveal rides the
// pull-back — each trail arrives roughly as the frame opens far enough to hold
// it.
const anfCentre = id => {
    const g = featOf[id].geometry, segs = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
    let sx = 0, sy = 0, n = 0;
    segs.forEach(s => s.forEach(c => { sx += c[0]; sy += c[1]; n++; }));
    return [sx / n, sy / n];
};
{
    const d = {};
    ANF_IDS.forEach(id => {
        const c = anfCentre(id);
        d[id] = Math.hypot((c[0] - ANCHOR[0]) * Math.cos(ANCHOR[1] * Math.PI / 180), c[1] - ANCHOR[1]);
    });
    ANF_IDS.sort((a, b) => d[a] - d[b]);
}
// The whole forest is loaded ONCE, and revealed with feature-state. The first
// cut rebuilt the source with setData every time another trail lit — thirty-odd
// full re-parses on a worker thread, each one landing during the most delicate
// stretch of the film. feature-state is a GPU-side flag: no re-parse, no
// re-upload, and a paint transition gives every trail its own soft ignition for
// free.
// The hero's own treatment, held one step back. A deep year ink laid over
// forest and scrub is nearly invisible, and the hero solved that with a
// cartographer's casing plus a hue-preserving lift; the rest of the forest has
// exactly the same problem and deserves the same answer. What keeps the hero
// the hero is that it also carries a wide bloom and a near-white core, and that
// its lift is stronger — not that everything else is left unreadable.
const ANF_CASE = c => shift(c, 0.05, -0.20);
const ANF_BODY = c => shift(c, 0.14, 0.09);
const ANF_GLOW_OP = 0.42;
// Declared once and used by BOTH the finished-trail layers and the pens. Two
// copies of these numbers would drift, and any drift between them is a visible
// step at the moment a stroke finishes.
const ANF_W = {
    glowBlur: ['interpolate', ['linear'], ['zoom'], 9, 2.5, 13, 8],
    glow: ['interpolate', ['linear'], ['zoom'], 9, 3.2, 11, 5.5, 13, 10],
    case: ['interpolate', ['linear'], ['zoom'], 9, 2.4, 11, 3.8, 13, 6.2],
    body: ['interpolate', ['linear'], ['zoom'], 9, 1.3, 11, 2.1, 13, 3.4]
};
const anfFC = {
    type: 'FeatureCollection',
    features: ANF_IDS.filter(id => id !== HERO_ID).map((id, i) => {
        const c = JSON.parse(JSON.stringify(featOf[id]));
        c.id = i;
        const col = yearColor(yearOf(id));
        c.properties.color = col;
        c.properties.case = ANF_CASE(col);
        c.properties.body = ANF_BODY(col);
        return c;
    })
};
const ANF_N = anfFC.features.length;

// ===== The Atlas sheet (the landing) ========================================
// Built exactly as mockup A builds it — Esri's shaded relief warmed by the
// parchment wash, state lines, year inks — because that is the frame Danny has
// already approved as the Atlas's own.
// Generous on purpose. Clipping the relief source tightly to the lower 48 left
// bare parchment bands above and below the sheet, because the landed frame is
// wider than the country it holds — the source has to cover the whole VIEWPORT,
// not just the trails.
const US_BOUNDS = [-138, 14, -52, 60];
const statesGeo = await Promise.race([
    fetch('https://cdn.jsdelivr.net/gh/PublicaMundi/MappingAPI@master/data/geojson/us-states.json')
        .then(r => r.ok ? r.json() : null).catch(() => null),
    new Promise(res => setTimeout(() => res(null), 3000))
]);
const statesFC = statesGeo ? {
    type: 'FeatureCollection',
    features: statesGeo.features.filter(f =>
        !['Alaska', 'Hawaii', 'Puerto Rico'].includes(f.properties && f.properties.name))
} : { type: 'FeatureCollection', features: [] };

// ===== Inset plates: the atlas answer to far-flung country ==================
// Lifted from home.js, definitions and all, because the two films must land on
// the SAME picture — this one hands the visitor to that one. Alaska sits too far
// north-west to share a frame with the lower 48: stretched to hold it, the
// continental map shrivels into a corner. Real atlases have solved this for a
// century — distant land gets its own framed plate, at its own scale, in a
// corner of the sheet. A plate is CHROME, not land: it never rides the camera's
// zoom, and it is laid down only once the camera has come to rest.
// Hawaii's plate is RESERVED — cut and labelled but unwalked — so the pair reads
// as a deliberate row and Alaska never shifts the day Hawaii inks.
const PLATE_DEFS = [
    { key: 'alaska', label: 'Alaska', state: 'Alaska', corner: 'se',
      holds: (la, lo) => la > 51 && lo < -129,
      // the Aleutians run another 1,200 miles west; dropping them keeps the
      // plate compact and the mainland readable, as most printed plates do
      keepRing: r => r.some(c => c[0] > -170) },
    { key: 'hawaii', label: 'Hawaii', state: 'Hawaii', reserved: true, corner: 'sw',
      holds: (la, lo) => la > 18 && la < 23 && lo > -161 && lo < -154,
      keepRing: () => true }
];
PLATE_DEFS.forEach(pd => { pd.ids = []; });
// ONE predicate, asked once — a second copy of these boxes is exactly the kind
// of drift that would put a trail on the sheet AND on a plate.
const plateFor = (la, lo) => PLATE_DEFS.find(p => p.holds(la, lo));

const natFeatures = [];
geo.features.forEach(f => {
    const g = f.geometry, segs = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
    const pd = plateFor(segs[0][0][1], segs[0][0][0]);
    if (pd) { pd.ids.push(f.properties.trail_id); return; }
    const c = JSON.parse(JSON.stringify(f));
    c.properties.color = yearColor(yearOf(f.properties.trail_id));
    c.id = natFeatures.length;
    natFeatures.push(c);
});
const natFC = { type: 'FeatureCollection', features: natFeatures };

// Learned building mockup A, and it applies unchanged here: at country scale
// most trails are a fraction of a pixel long, and a WIDE line drawn over one
// stacks its own overlapping round caps until the alpha accumulates into an
// opaque SQUARE. So there is no line halo on the sheet — each trail also gets a
// point at its centre, and the round dot does the glowing.
const natPointsFC = {
    type: 'FeatureCollection',
    features: natFeatures.map(f => {
        const g = f.geometry, segs = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
        let w = 180, e = -180, s = 90, n = -90;
        segs.forEach(sg => sg.forEach(c => {
            if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0];
            if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1];
        }));
        return {
            type: 'Feature', id: f.id, properties: { color: f.properties.color },
            geometry: { type: 'Point', coordinates: [(w + e) / 2, (s + n) / 2] }
        };
    })
};

// Every tile URL either map asks for while `collecting` is on. See warmFlight().
const flightUrls = [], seenUrl = new Set();
let collecting = false;
const collectHook = (url, kind) => {
    if (collecting && kind === 'Tile' && !seenUrl.has(url)) {
        seenUrl.add(url); flightUrls.push(url);
    }
    return { url };
};

const atlasMap = new maplibregl.Map({
    container: atlasEl, interactive: false, attributionControl: false,
    center: [-98.58, 39.82], zoom: 3.4, transformRequest: collectHook,
    style: {
        version: 8,
        sources: {
            relief: {
                type: 'raster',
                tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}'],
                tileSize: 256, maxzoom: 13, bounds: US_BOUNDS
            },
            states: { type: 'geojson', data: statesFC },
            nat: { type: 'geojson', data: natFC, tolerance: 0 },
            natpt: { type: 'geojson', data: natPointsFC, tolerance: 0 }
        },
        layers: [
            { id: 'parchment', type: 'background', paint: { 'background-color': '#ece3ce' } },
            { id: 'relief', type: 'raster', source: 'relief',
              paint: { 'raster-opacity': 0.62, 'raster-fade-duration': 450 } },
            { id: 'states', type: 'line', source: 'states',
              paint: { 'line-color': '#a8946e', 'line-opacity': 0.55, 'line-width': 1.1 } },
            { id: 'nat-core', type: 'line', source: 'nat',
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: { 'line-color': ['get', 'color'], 'line-width': 2,
                       'line-opacity': ['case', ['boolean', ['feature-state', 'on'], false], 1, 0] } },
            { id: 'nat-halo', type: 'circle', source: 'natpt',
              paint: { 'circle-color': ['get', 'color'], 'circle-blur': 1, 'circle-opacity': 0.32,
                       'circle-radius': ['case', ['boolean', ['feature-state', 'on'], false], 5.5, 0] } },
            { id: 'nat-dot', type: 'circle', source: 'natpt',
              paint: { 'circle-color': ['get', 'color'],
                       'circle-radius': ['case', ['boolean', ['feature-state', 'on'], false], 1.5, 0] } }
        ]
    }
});
// A parchment wash over the whole sheet, the same one the hero film wears.
const wash = document.createElement('div');
wash.style.cssText = 'position:absolute;inset:0;background:#d9c8a0;opacity:.40;mix-blend-mode:multiply;pointer-events:none';
atlasEl.appendChild(wash);

// Order the national reveal outward from the HERO TRAIL — the same point the
// flight spiralled around, not a hardcoded downtown LA that no longer means
// anything now the film opens on the PCT.
//
// And critically, the sheet must OPEN with everything the satellite half already
// inked already inked. Starting the count at zero made the hero and all 33
// Angeles trails wink out as the cloud lifted and then draw themselves a second
// time, which reads as the film forgetting what it had just shown you.
// PRE_LIT is that carried-over set; the reveal begins from there and expands.
const centroidOf = f => {
    const segs = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    let sx = 0, sy = 0, n = 0;
    segs.forEach(s => s.forEach(c => { sx += c[0]; sy += c[1]; n++; }));
    return [sx / n, sy / n];
};
// A trail's FOOTPRINT — the four corners of its bounding box — not its centre.
// The gate asks "is this trail in frame yet?", and a centre point answers a
// different question: the PCT leg is 9.4 km end to end, so its midpoint can be
// comfortably inside the frame while a third of the line is still off the top.
// Watching a trail write itself out of the edge of the picture is exactly the
// fault Danny kept catching, and it is not a timing bug — it is the gate being
// asked about the wrong shape. Corners are enough: a line never leaves its own
// bounding box, so if all four corners are in frame the whole trail is.
const footOf = f => {
    const segs = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    let w = 180, e = -180, s = 90, n = -90;
    segs.forEach(sg => sg.forEach(c => {
        if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0];
        if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1];
    }));
    return [[w, s], [e, s], [e, n], [w, n]];
};
const natCentroid = natFeatures.map(centroidOf);
const natFoot = natFeatures.map(footOf);
// natOrder is built further down, once the sheet's camera exists — the order is
// decided by WHEN EACH TRAIL ENTERS THE FRAME, which cannot be known here.

// ===== The 3D world (the flight) ============================================
// Every tile URL the film asks for while `collecting` is on. See warmFlight().
// (declared above atlasMap so BOTH maps can be hooked — the sheet now travels
// too, so its tiles need warming just as much as the flight's)

// ?capture=1 lets a headless harness read the WebGL canvas back frame by frame,
// which is the only way to actually WATCH this thing rather than judge it from
// stills. Off by default: preserving the drawing buffer costs real performance.
const CAPTURE = new URLSearchParams(location.search).get('capture') === '1';
// 'off' (default) | 'late' | 'early' — see the note where the mark is toggled.
const MARK_MODE = new URLSearchParams(location.search).get('mark') || 'off';
// Aerial haze. Lower is MORE fog. It buys the grandeur of scale, and it is also
// the film's cover for the far distance, which is where the terrain changes
// resolution. ?fog=0.22 to A/B it.
const FOG = (v => v === null ? 0.34 : +v)(new URLSearchParams(location.search).get('fog'));
// Directional light over the satellite imagery. ?shade=0 turns it off,
// ?shade=0.5 pushes it, ?sun=<degrees> moves the sun.
// OFF, and it was worth trying: satellite imagery is flat-lit, so a hillshade
// off the DEM we already load should have put a sun on the mountains for free.
// It does not. Measured at three moments, brightness-normalised ridge contrast
// is 26.58% with no shading and 26.42% with it — the shading is uniform
// darkening carrying no relief information, because the PHOTOGRAPH already has
// the real sun's shadows in it and the terrarium DEM at these zooms is coarser
// than the imagery's own texture. Painting light instead of shadow was worse
// still (contrast 34.2 -> 24.2, a pale film over the whole picture). ?shade=0.35
// to see it.
const SHADE = (v => v === null ? 0 : +v)(new URLSearchParams(location.search).get('shade'));
const SHADE_DIR = +(new URLSearchParams(location.search).get('sun') || 315);
const SHADE_COL = new URLSearchParams(location.search).get('suncol') || '#1d1810';
// 0.7. Sampled 0 / 0.6 / 1.0 / 1.6 side by side: 0 is cool olive and reads as a
// different world from the sheet it becomes, 1.6 is sepia and takes the green
// out of the forest. 0.7 warms the ground toward the Atlas's parchment and, as
// a bonus, puts more colour between the year inks and the land they cross.
// This one is a TASTE call, not a measurement: ?wash=0 reverts it.
const WASH = (v => v === null ? 0.7 : +v)(new URLSearchParams(location.search).get('wash'));

// The imagery, and how far into it we are allowed to go.
// CLARITY is Esri's second, higher-resolution World Imagery service — same
// free terms, same tiling scheme, a different URL. ?sat=clarity / ?satmax=18.
// 18, NOT 16. The 16 was a BANDWIDTH decision for a live page — "a quarter of
// the requests going to levels the film never frames" — and it was wrong on its
// own terms: under terrain at this pitch the near-field ground genuinely IS
// closer than the nominal zoom, so those z17/z18 tiles are the foreground, not
// waste. Compared at 2x density on the opening shot, uncapping raises fine
// detail 10.6 -> 12.9 and the difference is not subtle: at 16 the ranger
// station is a blur, at 18 you can count the vehicles. The flight is a baked
// video now, so the extra ~600 requests are paid once, by nobody.
// (Esri's second service, CLARITY, was tried as a higher-resolution
// alternative: over the Angeles it is SOFTER, detail 7.2 against 12.9, from a
// different and less detailed acquisition. ?sat=clarity to see.)
// ===== STAGE 4: the flight is a baked film ================================
// Everything up to the cloud is now a video. The live 3D flight is what MADE
// that video and is still the only way to re-cut it, so it stays behind
// ?live=1 — and `tools/render-intro.py` passes exactly that. Nothing else in
// the file branches on which one is running: the camera, the schedule, the
// cloud and the sheet are identical either way, and that is the point. The
// video replaces a PICTURE, not a piece of the choreography.
const LIVE_FLIGHT = new URLSearchParams(location.search).get('live') === '1';
// ---- Where the baked film comes from ---------------------------------------
// Cloudinary, not the repository. renders/ is git-ignored on purpose — a ~50 MB
// binary re-cut every time the choreography is retuned is the thing git is worst
// at — but the real reason is delivery: ONE master is uploaded, and Cloudinary
// derives the format, codec and width each visitor actually needs from it.
// w_ picks the size from the screen rather than sending a laptop the 2880-wide
// master, and c_limit never upscales.
//
// ---- THE CODEC IS PINNED TO H.264, ON PURPOSE ------------------------------
// This asked for `f_auto:video`, which sounds like the right answer and is not.
// f_auto sends VP9 to Chrome and Firefox and keeps h.264 for Safari, and APPLE
// SILICON HAS NO VP9 DECODER. Asked of VideoToolbox directly on an M3:
//
//     H.264  HARDWARE      VP9  software (CPU)
//     HEVC   HARDWARE      AV1  HARDWARE
//
// So every Chrome and Firefox visitor on a Mac was decoding 1920x1080 VP9 on the
// CPU, thirty times a second, against whatever else that machine was doing.
// Safari was the only browser on the hardware path, which is why the stutter
// hid from every measurement taken in Chrome's own headless build.
//
// h.264 is the one codec with a hardware decoder in essentially everything built
// this side of 2010: every Mac, every iPhone, every Windows GPU, every Android.
// It costs bytes for the same picture (at 1920, 9.4 MB against VP9's 6.8) and it
// buys a decode that cannot fall behind. That is the trade, taken deliberately.
// A film that plays smoothly everywhere beats a smaller one that judders on the
// machine it happens to open on.
//
// Do NOT let this drift back to f_auto:video, and do not "modernise" it to AV1.
// This M3 reports AV1 as hardware and VP9 as software, which is the reverse of
// what the codecs' ages suggest, and no rule derived from a codec's reputation
// would have got that right. Ask the hardware, or pick the boring codec.
//
// The widths are a short ladder, not a continuum: every distinct width is a
// separate derived file Cloudinary has to build and cache, and the first visitor
// to ask for an uncached one waits for the transcode. Three covers every screen.
// Kept in step with WIDTHS in tools/upload-intro.py.
const INTRO_WIDTHS = [1280, 1920, 2560];
const introUrl = w =>
    `https://res.cloudinary.com/${ATLAS_CONFIG.CLOUDINARY_CLOUD || 'dgdniwosl'}` +
    `/video/upload/f_mp4,vc_h264,q_auto,w_${w},c_limit/atlas-intro-film.mp4`;

// ---- A machine that struggled once starts lower next time -------------------
// There is no way to ASK a browser what it can decode. mediaCapabilities
// .decodingInfo() is the API for exactly this question and it is useless here:
// on this Mac it answers `powerEfficient: true` for AV1 at 2560 on hardware that
// has no AV1 decoder, and true for VP9, which VideoToolbox says is software. It
// says yes to everything. So the only honest signal is what actually happened,
// which land() writes down and this reads back. One rung per bad showing, and it
// never climbs back on its own: a machine does not get faster between visits,
// and re-testing an unhappy one costs the visitor the very stutter being avoided.
const DEMOTE_KEY = 'introFilmDemote';
function introDemotion() {
    try { return Math.min(INTRO_WIDTHS.length - 1, +localStorage.getItem(DEMOTE_KEY) || 0); }
    catch (e) { return 0; }                 // private mode: no memory, no harm
}
function noteStruggle() {
    try { localStorage.setItem(DEMOTE_KEY, String(introDemotion() + 1)); }
    catch (e) { /* private mode: this visit simply is not remembered */ }
}

const VIDEO_SRC = (() => {
    const q = new URLSearchParams(location.search).get('vid');
    if (q) return q.startsWith('http') || q.startsWith('.') ? q : introUrl(+q);
    // NEVER send fewer pixels than the layout lays out: below its CSS width the
    // film is being enlarged, and that is visible.
    // NEVER go past 1920 for the sake of a device pixel ratio ALONE. Measured
    // off the delivered h.264 files: 1280 is 5.4 MB, 1920 is 9.4 MB, 2560 is
    // 14.8 MB. The top rung costs more than the other two together and buys
    // sharpness in a hazy, motion-blurred aerial shot, which is the least
    // detail-critical thing a screen can be asked to show. A display that
    // genuinely LAYS OUT wider than 1920 still gets it.
    //
    // What is deliberately NOT consulted here is navigator.connection.downlink.
    // Reading it looks like the considerate thing to do and it is not: this
    // module runs in the first milliseconds of the page, while Chrome's estimate
    // is still a conservative guess, so Chrome demoted itself to 1280 more or
    // less at random. Firefox does not implement navigator.connection at all, so
    // it could never demote and always pulled the largest cut. One rule, two
    // engines, opposite answers, and the engine with no brakes was the one whose
    // decode was slowest. saveData stays, because it is a stated preference
    // rather than an estimate.
    const net = navigator.connection || {};
    if (net.saveData) return introUrl(INTRO_WIDTHS[0]);
    const css = window.innerWidth;
    const want = Math.max(css, Math.min(1920, css * (window.devicePixelRatio || 1)));
    let ix = INTRO_WIDTHS.findIndex(w => w >= want);
    if (ix < 0) ix = INTRO_WIDTHS.length - 1;
    return introUrl(INTRO_WIDTHS[Math.max(0, ix - introDemotion())]);
})();
// ---- THE FILM RECORD, and why the Atlas can keep growing ---------------------
// `data/intro-film.json` is written by tools/render-intro.py at the moment the
// video is baked. It holds the handful of facts that are TRUE OF THAT VIDEO and
// can therefore never be re-derived from today's data:
//
//   zSpan       the zoom ramp the flight was cut with
//   atlasStart  the ground its last frame was looking at
//   inked       the trail ids it actually draws
//
// This is what lets the second half of the film stay LIVE while the first half
// is a finished picture. Add a hike tomorrow and it appears on the sheet, drawn
// in its year's ink, with no re-render — because the sheet is built from
// trails.geojson every time the page loads.
//
// Without the record it would go wrong in two ways, and both are silent:
//
//  1. **A new Angeles hike would be claimed by the flight.** PRE_LIT used to be
//     re-derived by walking the flight's camera and asking which trails came
//     into frame. A new hike near the hero would clear that gate, the sheet
//     would open already carrying it — and the video never drew it. A trail
//     that appears out of nowhere under the cloud is exactly the fault this
//     whole schedule exists to prevent.
//  2. **A new hike outside the current bounds would desync the video.** The
//     landing frame is fitted to the trails, so one hike in Florida widens it,
//     which changes the ramp's span, which changes the zoom at every moment of
//     the FLIGHT — a flight that is now a fixed video. (This bit twice while
//     the film was being built. It is now impossible: the flight's span comes
//     from the record, and only the sheet's half re-derives.)
//
// In live mode there is no record to honour — that run IS the cut being made —
// so everything is computed fresh and the renderer writes the result out.
const FILM = LIVE_FLIGHT ? null : await fetch(DATA + 'intro-film.json')
    .then(r => r.ok ? r.json() : null).catch(() => null);
// A missing record is not fatal: fall back to deriving everything, which is
// what the film did before the record existed. It will be right for today's
// data and wrong only after the next hike is added, which is loud enough.
if (!LIVE_FLIGHT && !FILM) console.warn(
    'data/intro-film.json is missing — the film is deriving the flight from live ' +
    'data instead of from the video it must match. Re-run tools/render-intro.py.');
const BAKED_ATLAS_START = (FILM && FILM.atlasStart)
    || { center: [-118.02487460437197, 34.3224050054189], zoom: 9.879187785017095 };
const SAT_MAX = +(new URLSearchParams(location.search).get('satmax') || 18);
const SAT_URL = (new URLSearchParams(location.search).get('sat') === 'clarity')
    ? 'https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

// The DEM's zoom band — 13 at the fine end, not 14.
//
// The camera path itself is analytically smooth: with terrain switched off, the
// apparent scale of the ground has a jerk of 0.0003 median and 0.0027 worst
// across the whole pull-back. Switch terrain ON and the same measurement is 26x
// rougher, in a handful of discrete spikes. Those spikes ARE the stepping: the
// terrain mesh changes resolution beneath the camera as the DEM crosses tile
// levels, so the ground physically changes shape and the pull-back lurches.
//
// Capping at 13 measured ~35% less roughness than 14 (0.072 vs 0.111 summed
// over the spikes, 4 spikes vs 6). That cap was a WORKAROUND for the pull-back
// bob, and the bob is now fixed at its source by pinning the camera's reference
// height (see CENTER_ELEV) — so the reason for the cap is gone. Re-measured at
// 13 / 14 / 15 with the satellite uncapped: stability is IDENTICAL (worst
// whole-frame step 0.55 and one step past threshold in all three) and the cost
// is nil (181 / 188 / 215 DEM requests). Honestly, so is the visible gain: at
// mid-flight the three ridgelines are indistinguishable. 14 is taken because
// the near ridges of the opening are the only place it can help and it is free,
// not because anything measured better. The cost is one level of close-up relief in the opening,
// which is very nearly invisible — and 14 was showing hard faceting on the near
// ridges that 13 does not. ?dem=lo-hi to A/B it.
//
// Worth stating plainly: this is a 35% improvement, not a fix. The residual is
// MapLibre's terrain LOD, and no setting here removes it — a 3D camera that
// crosses six zoom levels re-meshes the ground six times. Only pre-rendering
// the film escapes that.
const DEM_BAND = ((new URLSearchParams(location.search).get('dem') || '0-14')
                  .split('-').map(Number));

// How long the imagery cross-dissolves when it changes level. ?fade=N to try
// others — see the note on the raster layer.
const FADE = (v => v === null ? 250 : +v)
             (new URLSearchParams(location.search).get('fade'));

const globe = new maplibregl.Map({
    container: globeEl, interactive: false, attributionControl: false,
    center: ANCHOR, zoom: 16.0, pitch: 70, bearing: -200,
    maxPitch: 85, preserveDrawingBuffer: CAPTURE,
    transformRequest: collectHook,
    // No maxTileCacheSize here on purpose. Setting one was TRIED and made things
    // visibly worse: MapLibre's default is derived from the viewport (five zoom
    // levels' worth of whatever the frame holds), and under terrain at a 70
    // degree pitch that is far more than the 260 I guessed at. Clamping it
    // evicted the parent tiles the renderer stretches to cover ground that has
    // not arrived yet, and the smeared-but-continuous hillside turned into
    // outright holes. Leave the default alone.
    style: {
        version: 8,
        sources: {
            ...(LIVE_FLIGHT ? { sat: {
                type: 'raster',
                tiles: [SAT_URL],
                // 16, NOT 18 — even though Esri publishes to 23. Terrain plus a
                // 70 degree pitch puts the near-field ground much closer to the
                // camera than the nominal zoom, so MapLibre was requesting tiles
                // a level or two BELOW the film's own floor: measured, 103 of
                // 445 satellite requests during the pull-back went to z17/z18,
                // for a film that never gets closer than z16. A quarter of the
                // bandwidth spent on levels nothing is framed at, competing with
                // the tiles that were actually about to be shown.
                // ...that reasoning is about BANDWIDTH on a live page, and the
                // flight is about to become a baked video where bandwidth is
                // paid once by nobody. ?satmax=18 uncaps it for the render.
                tileSize: 256, maxzoom: SAT_MAX, attribution: 'Esri World Imagery'
            } } : {}),
            ...(LIVE_FLIGHT ? { dem: {
                type: 'raster-dem',
                tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
                minzoom: DEM_BAND[0],
                encoding: 'terrarium', tileSize: 256, maxzoom: DEM_BAND[1]
            } } : {}),
            hero: { type: 'geojson', lineMetrics: true, tolerance: 0,
                    data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: heroCoords } } },
            anf: { type: 'geojson', tolerance: 0, data: anfFC }
        },
        // Real sky, so climbing out has somewhere to climb TO. Without it the
        // horizon is a hard edge against the page background and the ascent
        // reads as the map falling away rather than the camera rising.
        // The haze does two jobs, and the second one is why it is this strong.
        // Aerial perspective is the oldest depth cue there is, so it buys the
        // grandeur. But it also DISSOLVES THE FAR DISTANCE, which is where the
        // level-of-detail mismatch lives: at this pitch the top third of the
        // frame is ground 50 km away, drawn from tiles four or five levels
        // coarser than the foreground — Esri re-renders its imagery per level,
        // so that band was arriving in a visibly different palette and reading
        // as a seam across the picture. Fog turns the seam into distance.
        sky: {
            'sky-color': '#8fb4d6', 'sky-horizon-blend': 0.45,
            'horizon-color': '#e8dfc9', 'horizon-fog-blend': 0.5,
            'fog-color': '#ded4bd', 'fog-ground-blend': FOG
        },
        layers: [
            // Under the imagery, so a tile that has not arrived is a soft patch
            // of hillside rather than a black hole. The clear colour showed
            // through as literal black rectangles at every level change.
            { id: 'ground', type: 'background', paint: { 'background-color': '#79806c' } },
            // 250ms. This went 300 -> 600 to soften the patchy arrival of a new
            // level, and that was the wrong read of the trade. A crossfade does
            // not blend two RESOLUTIONS of one picture, it holds two visibly
            // different renderings of the same mountains on screen at once —
            // Esri redraws its imagery per level — so a long dissolve is half a
            // second of doubled, ghosted hillside. It is also why a REPLAY looks
            // worse than a first watch: cold, the tiles trickle in and each
            // fades on its own; warm, the entire level lands at once and the
            // whole screen dissolves in unison, which is legible as an event in
            // a way that a scattered arrival never is.
            //
            // Short enough to read as a refresh rather than a pulse, long enough
            // not to be a hard cut (fade 0 was tried in mockup A and read as the
            // camera shuddering). ?fade=0 / 600 to judge it on a real GPU —
            // this one is genuinely hard to settle headlessly.
            ...(LIVE_FLIGHT ? [{ id: 'sat', type: 'raster', source: 'sat',
              paint: { 'raster-fade-duration': FADE, 'raster-saturation': -0.12, 'raster-contrast': 0.04 } }] : []),
            // LIGHT. Satellite imagery is orthorectified and flat-lit, so a 3D
            // terrain draped in it gets its shape from silhouette and parallax
            // alone — the mountains READ as mountains only where they overlap
            // something. A hillshade puts a sun on them. It costs nothing to
            // fetch, because it is computed from the same terrarium DEM the
            // terrain mesh is already using.
            // The sun is anchored to the MAP, not the viewport: the camera
            // sweeps 200 degrees, and a light that swings round with the camera
            // would say the sun is orbiting the range. Anchored to the map it
            // stays put and the ridges turn through it, which is what an
            // aircraft actually sees.
            ...(SHADE > 0 ? [{ id: 'shade', type: 'hillshade', source: 'dem',
              paint: { 'hillshade-exaggeration': SHADE,
                       'hillshade-illumination-direction': SHADE_DIR,
                       'hillshade-illumination-altitude': 55,
                       'hillshade-illumination-anchor': 'map',
                       // SHADOW ONLY. MapLibre's hillshade paints light onto
                       // the surface rather than multiplying through it, so a
                       // highlight colour does not brighten the sunlit faces,
                       // it lays a pale film over the whole picture — measured,
                       // it dropped ridge contrast from 34.2 to 24.2 and looked
                       // exactly that washed. Painting only the shaded faces
                       // darkens what is turned away from the sun and leaves
                       // the rest of the photograph alone, which is what a
                       // cartographer's shading does.
                       'hillshade-shadow-color': SHADE_COL,
                       'hillshade-highlight-color': 'rgba(0,0,0,0)',
                       'hillshade-accent-color': 'rgba(0,0,0,0)' } }] : []),
            // Every stroke width is ZOOM-DRIVEN. A line-width is in screen
            // pixels, so a stroke tuned to look right at z15 over one trail
            // becomes a fat coloured blob once the camera has pulled back over
            // the whole forest — which is exactly what the first cut did.
            // These layers hold the FINISHED strokes. The 900ms ignition they
            // used to carry was from before the pens existed, when lighting a
            // trail WAS its reveal; now a pen has just written the trail to full
            // strength and hands it over here on the same frame it releases it,
            // so a fade-in means the completed stroke ghosts out and recovers
            // over the next second. Instant, i.e. invisible, is the only correct
            // handover — full to full.
            // Three strokes, the same language as the hero: a soft bloom, a
            // dark casing, the lifted ink. The pens below carry an IDENTICAL
            // set, because a stroke that changes appearance the instant it is
            // finished is a flash, and the film's rule is that nothing flashes.
            { id: 'anf-glow', type: 'line', source: 'anf',
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: { 'line-color': ['get', 'color'],
                       'line-opacity': ['case', ['boolean', ['feature-state', 'on'], false], ANF_GLOW_OP, 0],
                       'line-opacity-transition': { duration: 0, delay: 0 },
                       'line-blur': ANF_W.glowBlur, 'line-width': ANF_W.glow } },
            { id: 'anf-case', type: 'line', source: 'anf',
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: { 'line-color': ['get', 'case'],
                       'line-opacity': ['case', ['boolean', ['feature-state', 'on'], false], 1, 0],
                       'line-opacity-transition': { duration: 0, delay: 0 },
                       'line-blur': 0.3, 'line-width': ANF_W.case } },
            { id: 'anf-body', type: 'line', source: 'anf',
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: { 'line-color': ['get', 'body'],
                       'line-opacity': ['case', ['boolean', ['feature-state', 'on'], false], 1, 0],
                       'line-opacity-transition': { duration: 0, delay: 0 },
                       'line-blur': 0.5, 'line-width': ANF_W.body } },
            // The hero trail: three stacked strokes make the ink GLOW — a wide
            // soft bloom, a mid body, and a near-white core. One line at any
            // width just looks like a line.
            { id: 'hero-bloom', type: 'line', source: 'hero',
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: { 'line-blur': ['interpolate', ['linear'], ['zoom'], 10, 5, 15, 18],
                       'line-width': ['interpolate', ['linear'], ['zoom'], 10, 8, 13, 16, 15, 26] } },
            // The casing sits ABOVE the bloom and below the body: the glow needs
            // to spread out beneath everything, but if it washes over the dark
            // line the separation it exists to provide is gone.
            { id: 'hero-case', type: 'line', source: 'hero',
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: { 'line-blur': 0.4,
                       'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5.2, 13, 8.5, 15, 13] } },
            { id: 'hero-body', type: 'line', source: 'hero',
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: { 'line-blur': 2.5,
                       'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 13, 5, 15, 8] } },
            { id: 'hero-core', type: 'line', source: 'hero',
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.4, 13, 2, 15, 2.6] } }
        ]
    }
});

await Promise.all([
    new Promise(r => globe.on('load', r)),
    new Promise(r => atlasMap.on('load', r))
]);
// The camera's reference height, and the reason the pull-back is smooth. Named
// and applied through a function because the reveal schedule below has to take
// the terrain off for a moment and put it back exactly as it was.
const PIN_PARAM = new URLSearchParams(location.search).get('pin');
const CENTER_ELEV = PIN_PARAM === null ? 2100 : +PIN_PARAM;
function applyPin() {
    if (PIN_PARAM === 'off') return;
    globe.setCenterClampedToGround(false);
    if (typeof globe.setCenterElevation === 'function') globe.setCenterElevation(CENTER_ELEV);
    else globe.transform.elevation = CENTER_ELEV;
}

if (LIVE_FLIGHT && new URLSearchParams(location.search).get('terrain') !== 'off') {
    globe.setTerrain({ source: 'dem',
        exaggeration: +(new URLSearchParams(location.search).get('exg')) || 1.35 });
    // THE PULL-BACK JITTER. By default MapLibre clamps the map centre to the
    // ground: every frame it samples the terrain height under the centre point
    // and re-derives the camera from it (transform.recalculateZoomAndCenter).
    // That is right for a map you drag around and disastrous for a camera move,
    // because the sampled height is not stable — it changes when the centre
    // crosses a ridge, and it JUMPS when the DEM swaps tile level under it.
    // Measured earlier: the centre's ground elevation swinging 820-1999 m with
    // single-frame steps of 312 m. The camera was being shoved up and down by
    // the landscape it was flying over.
    //
    // Turning the clamp off was tried once before and measured MUCH worse, and
    // that reading was real but the experiment was wrong: switching it off
    // leaves the centre's reference at SEA LEVEL, two kilometres below the range
    // the film is flying over. That is not "no terrain reference", it is a wrong
    // one, and the camera fights it.
    //
    // Pinned to a height the camera actually works at, the altitude becomes a
    // pure function of zoom and the bob is simply gone. Measured over the
    // pull-back, p95 screen jerk of a fixed piece of ground:
    //
    //   clamped to the terrain   1.3503   (ground under the centre swinging
    //                                      1875-2565 m, 22 reversals)
    //   PINNED at 2100 m         0.0419
    //   unclamped at sea level   0.0519
    //   terrain switched off     0.0391   <- the floor
    //
    // 32x better than clamping, and within a hair of having no terrain at all.
    // Danny described it exactly: "bobbing or rocking up and down slightly with
    // the elevation as we zoom out". It was.
    //
    // 2100 m is the working height of the San Gabriels along the camera's own
    // centre path (measured range 1875-2565, mean 2140). It is a property of the
    // range this film flies over, so a different hero trail wants a different
    // number: ?pin=1600, or ?pin=off for the old ground-clamped behaviour.
}
// OUTSIDE the terrain block, and it has to be. The pin is a property of the
// CAMERA, not of the terrain, and the reveal schedule is built by walking that
// camera and asking where each trail lands. In video mode there is no terrain
// at all, so leaving the pin inside left the camera referenced to sea level
// while the film it must agree with was referenced to 2,100 m — and the two
// disagreed so completely that not one trail cleared its gate.
applyPin();

// ---- The landed frame -------------------------------------------------------
// THE SAME FRAME THE HOME PAGE ALREADY LANDS ON, by the same recipe: the bounds
// of every CONTINENTAL trail, padded 18% on each side, fitted to the viewport.
// `natFeatures` is exactly home.js's `mainIds` — plate country is already out —
// so the two films come to rest on the same picture, which matters because this
// one is replacing that one.
//
// Framing on the COUNTRY was tried in between and is wrong, even though it holds
// Florida and Maine that this does not. Fitting the whole lower 48 into a 16:9
// frame leaves the Gulf, the Atlantic and a third of Mexico in shot — a great
// deal of empty water around a country whose ink is nearly all in one corner of
// it. Danny: "too much open ocean and it showcases too much of mexico which we
// never visit." The Atlas is a record of where he has WALKED, so the frame is
// cut to the walking.
//
// No band is reserved at the bottom for the inset plates either, for the same
// reason: they sit over the map's own two lower corners, which at this framing
// are Pacific and Atlantic, and a plate over open water is a plate over nothing.
// home.js's own number. `?pad=` to compare landings.
const PAD = (v => v === null ? 0.18 : +v)(new URLSearchParams(location.search).get('pad'));
const atlasEnd = (() => {
    let w = 180, e = -180, s = 90, n = -90;
    natFeatures.forEach(f => {
        const g = f.geometry, segs = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
        segs.forEach(sg => sg.forEach(c => {
            if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0];
            if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1];
        }));
    });
    // Leaflet's `bounds.pad(0.18)`, which is what home.js calls: grow the box by
    // 18% of its own width and height on EACH side.
    const px = (e - w) * PAD, py = (n - s) * PAD;
    const cam = atlasMap.cameraForBounds([[w - px, s - py], [e + px, n + py]], { padding: 0 });
    return cam ? { center: [cam.center.lng, cam.center.lat], zoom: cam.zoom }
               : { center: [-98.58, 39.82], zoom: 3.9 };
})();

// ---- Cutting the plates -----------------------------------------------------
// Each plate is its own little sheet: its own projection, its own scale, a
// neatline and an engraved label. Its projection is plain Web Mercator at an
// arbitrary scale — the viewBox normalises the scale away, and the stroke widths
// counter-scale through --ps, so a plate reads with the same line weight
// whatever size it is cut at.
const SVGNS = 'http://www.w3.org/2000/svg';
const PLATE_MAX_W = 150, PLATE_MAX_H = 136;
const plateItems = [];
{
    const K = 4096;
    const pr = ([lo, la]) => {
        const sn = Math.sin(la * Math.PI / 180);
        return [(lo + 180) / 360 * K, (0.5 - Math.log((1 + sn) / (1 - sn)) / (4 * Math.PI)) * K];
    };
    const holders = {};
    ['sw', 'se'].forEach(c => {
        const el = document.createElement('div');
        el.className = 'inset-plates ' + c;
        el.id = 'inset-plates-' + c;
        holders[c] = el;
    });
    PLATE_DEFS.forEach(pd => {
        if (!pd.ids.length && !pd.reserved) return;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        const grow = ([x, y]) => { if (x < x0) x0 = x; if (x > x1) x1 = x;
                                   if (y < y0) y0 = y; if (y > y1) y1 = y; };
        // The plate frames the WHOLE state, so the silhouette says where you are
        // at a glance and the trails sit at their true place inside it. If the
        // outlines never arrived, fall back to framing the trails — an
        // unlabelled plate beats a missing one.
        const feat = statesGeo && statesGeo.features.find(
            f => f.properties && f.properties.name === pd.state);
        const rings = [];
        if (feat) {
            const g = feat.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
            polys.forEach(poly => poly.forEach(r => { if (pd.keepRing(r)) rings.push(r); }));
        }
        rings.forEach(r => r.forEach(c => grow(pr(c))));
        if (!rings.length) pd.ids.forEach(id => {
            const f = featOf[id]; if (!f) return;
            const g = f.geometry, segs = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
            segs.forEach(sg => sg.forEach(c => grow(pr(c))));
        });
        if (!isFinite(x0)) return;
        const pad = Math.max(x1 - x0, y1 - y0) * 0.05;
        x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
        const pw = Math.max(1e-6, x1 - x0), ph = Math.max(1e-6, y1 - y0);
        const sc = Math.min(PLATE_MAX_W / pw, PLATE_MAX_H / ph);

        const box = document.createElement('div');
        box.className = 'inset-plate' + (pd.ids.length ? '' : ' is-unwalked');
        box.style.width = Math.round(pw * sc) + 'px';
        box.style.height = Math.round(ph * sc) + 'px';
        const psvg = document.createElementNS(SVGNS, 'svg');
        psvg.setAttribute('viewBox', `${x0.toFixed(2)} ${y0.toFixed(2)} ${pw.toFixed(2)} ${ph.toFixed(2)}`);
        psvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        psvg.style.setProperty('--ps', sc);
        if (rings.length) {
            let d = '';
            rings.forEach(r => {
                r.forEach((c, i) => { const [x, y] = pr(c);
                    d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2) + ' '; });
                d += 'Z ';
            });
            const land = document.createElementNS(SVGNS, 'path');
            land.setAttribute('d', d); land.setAttribute('class', 'plate-land');
            psvg.appendChild(land);
        }
        pd.ids.forEach(id => {
            const f = featOf[id]; if (!f) return;
            const g = f.geometry, segs = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
            let d = '';
            segs.forEach(sg => sg.forEach((c, i) => { const [x, y] = pr(c);
                d += (i === 0 ? 'M' : 'L') + x.toFixed(3) + ',' + y.toFixed(3) + ' '; }));
            const path = document.createElementNS(SVGNS, 'path');
            path.setAttribute('d', d); path.setAttribute('class', 'plate-trail');
            path.setAttribute('stroke', yearColor(yearOf(id)));
            psvg.appendChild(path);
            // Plate trails are NOT part of the film's release order — they ink
            // after the plate has been laid down (see revealPlates).
            plateItems.push({ p: path });
        });
        const label = document.createElement('div');
        label.className = 'ip-label';
        label.textContent = pd.label;
        box.append(psvg, label);
        (holders[pd.corner] || holders.se).appendChild(box);
    });
    
    Object.values(holders).forEach(el => { if (el.children.length) host.insertBefore(el, vigEl); });
    plateItems.forEach(o => { o.len = o.p.getTotalLength(); });
}
const plateHolders = Array.from(document.querySelectorAll('.inset-plates'));
// ---- Laying the plates down -------------------------------------------------
// The plates belong to the FINISHED sheet, so they wait for the camera. Fading
// them in over a country still pulling back reads as a card floating on a moving
// map; the film lands, and only then does a plate settle into its corner and
// take its ink.
const primePlates = () => plateItems.forEach(o => {
    o.p.style.transition = 'none';
    o.p.style.strokeDasharray = o.len;
    o.p.style.strokeDashoffset = o.len;
});
let plateTimer = null;
function revealPlates(animated) {
    clearTimeout(plateTimer);
    plateHolders.forEach(el => { el.classList.toggle('no-anim', !animated); el.classList.add('show'); });
    const ink = () => plateItems.forEach((o, i) => {
        o.p.style.transition = animated
            ? `stroke-dashoffset 900ms cubic-bezier(0.33, 0, 0.15, 1) ${i * 120}ms` : 'none';
        o.p.style.strokeDasharray = animated ? o.len : 'none';
        o.p.style.strokeDashoffset = '0';
    });
    if (animated) plateTimer = setTimeout(ink, 820); else ink();
}
function hidePlates() {
    clearTimeout(plateTimer);
    plateHolders.forEach(el => el.classList.remove('show', 'no-anim'));
    primePlates();
}
primePlates();

// (atlasStart and setAtlasView live further down, with the choreography — they
// need anfCam, which is where the satellite half comes to rest.)

// ===== The ink ==============================================================
const lighten = (hex, amt) => {
    const v = parseInt(hex.slice(1), 16), f = c => Math.round(c + (255 - c) * amt);
    return `rgb(${f(v >> 16 & 255)},${f(v >> 8 & 255)},${f(v & 255)})`;
};

// Same HSL maths as atlasYearInk() in config.js, run backwards. The year ink is
// NOT up for negotiation — 2024 is #288f43 and it stays #288f43 — but a deep
// forest green at 36% lightness laid over a forest is close to invisible, which
// is the problem to solve. So the HUE is held exactly and only saturation and
// lightness move: it is unmistakably the same ink, lit.
function shift(hex, ds, dl) {
    let r = parseInt(hex.slice(1, 3), 16) / 255,
        g = parseInt(hex.slice(3, 5), 16) / 255,
        b = parseInt(hex.slice(5, 7), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0, s = 0; const l0 = (mx + mn) / 2;
    if (d) {
        s = l0 > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? ((b - r) / d + 2) : ((r - g) / d + 4);
        h /= 6;
    }
    const S = Math.max(0, Math.min(1, s + ds)), L = Math.max(0, Math.min(1, l0 + dl));
    const f = n => {
        const k = (n + h * 12) % 12, a = S * Math.min(L, 1 - L);
        return Math.round(255 * (L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return `rgb(${f(0)},${f(8)},${f(4)})`;
}
// A cartographer's CASING: a dark line laid under the coloured one so the ink
// separates from whatever it crosses. It is the oldest fix in map drawing and it
// works on any ground, which a brighter green would not.
const HERO_CASE = shift(HERO_COLOR, 0.06, -0.26);
const HERO_BODY = shift(HERO_COLOR, 0.20, 0.14);
// line-progress stops must strictly ascend, so p is clamped clear of both ends.
function grad(color, p, tail, head) {
    const a = Math.max(0.014, Math.min(0.985, p));
    const back = Math.max(0.004, a - (tail || 0.012));
    return ['interpolate', ['linear'], ['line-progress'],
        0, color, back, color, a, head || lighten(color, 0.75),
        Math.min(0.999, a + 0.004), 'rgba(0,0,0,0)', 1, 'rgba(0,0,0,0)'];
}
// ===== The hero's pen ======================================================
// The hero is NOT revealed with a line-gradient any more, and this is the one
// place in the film where that mattered.
//
// MapLibre rasterises `line-gradient` through a texture, and for an
// `interpolate` expression that texture is exactly 256 pixels wide — it is a
// literal `let l = 256` in the renderer, raised only for `step` expressions.
// So a gradient reveal can put the pen tip in 256 places along the line and no
// more. The Angeles trails each draw in 0.7 s, which is 21 frames, so 256 steps
// is far finer than they need. The hero draws across 15 SECONDS — 450 frames —
// so its tip could only move on 256 of them and stalled on the other 43%. That
// is the stutter, and no render fixes it, because it is baked into what is
// being drawn rather than into how it is being captured.
//
// So the tip is geometry now: the source is set each frame to the portion of
// the trail drawn so far, with the final point interpolated along its segment.
// The end of the line IS the end of the line, which moves continuously. The
// gradient stays, but only to colour what has been drawn and to put a bright
// head on it — and the head's softness is the only thing 256 steps now decides,
// which nobody can see. 456 points is a small enough feature to re-issue per
// frame; this would be the wrong trick on a hundred trails at once.
const heroCum = (() => {
    const c = [0];
    for (let i = 1; i < heroCoords.length; i++) {
        const a = heroCoords[i - 1], b = heroCoords[i];
        // longitude degrees shrink with latitude, so weight them or a north-south
        // trail measures long and an east-west one short
        const dx = (b[0] - a[0]) * Math.cos((a[1] + b[1]) / 2 * Math.PI / 180);
        c.push(c[i - 1] + Math.hypot(dx, b[1] - a[1]));
    }
    const tot = c[c.length - 1] || 1;
    return c.map(v => v / tot);
})();
function heroSlice(p) {
    let lo = 0, hi = heroCum.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (heroCum[mid] <= p) lo = mid; else hi = mid - 1; }
    const out = heroCoords.slice(0, lo + 1);
    if (lo < heroCoords.length - 1) {
        const a = heroCum[lo], b = heroCum[lo + 1], t = b > a ? (p - a) / (b - a) : 0;
        const u = heroCoords[lo], v = heroCoords[lo + 1];
        out.push([u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t]);
    }
    return out.length >= 2 ? out : [heroCoords[0], heroCoords[0].slice()];
}
// The bright head is a fixed fraction of the WHOLE trail, so it stays the same
// length on the ground instead of growing with the drawn part.
const HERO_HEAD = 0.014;
let heroShowing = true, heroLastP = -1;
function inkHero(p) {
    const show = p > 0;
    if (show !== heroShowing) {
        heroShowing = show;
        ['hero-bloom', 'hero-case', 'hero-body', 'hero-core'].forEach(id =>
            globe.setPaintProperty(id, 'line-opacity', show ? 1 : 0));
    }
    if (!show || p === heroLastP) return;
    heroLastP = p;
    globe.getSource('hero').setData({ type: 'Feature', properties: {},
        geometry: { type: 'LineString', coordinates: heroSlice(p) } });
    const head = Math.min(0.45, HERO_HEAD / Math.max(p, 1e-4));
    const g = (c, h) => ['interpolate', ['linear'], ['line-progress'],
                         0, c, Math.max(0.001, 1 - head), c, 1, h];
    globe.setPaintProperty('hero-bloom', 'line-gradient', g(HERO_COLOR, HERO_COLOR));
    // the casing keeps its own dark head — a bright tip on the SEPARATOR would
    // defeat the one job it has
    globe.setPaintProperty('hero-case', 'line-gradient', g(HERO_CASE, HERO_CASE));
    globe.setPaintProperty('hero-body', 'line-gradient', g(HERO_BODY, lighten(HERO_COLOR, 0.62)));
    globe.setPaintProperty('hero-core', 'line-gradient', g(lighten(HERO_COLOR, 0.82), '#fffdf5'));
}
inkHero(0);

// ===== Choreography =========================================================
// I  flyalong · II pull back over the Angeles · III climb into cloud · IV sheet
// 42s. The end of the flight and the arrival on the sheet were both reading as
// rushed. Rather than only stretch the film, the RAMP was also started quicker
// (see RAMP_R0) — which, because the ramp's total distance is fixed, makes the
// opening brisker AND the later stretch gentler in one move. It is still one
// monotonic ramp; no part of it ever slows down and speeds up again.
const D = 42000;
// S1 is no longer a boundary the camera cares about — the spiral is continuous —
// but the film still needs to know when the trail stops being the subject and
// the forest starts. That is SPIRAL_END, derived from the zoom curve itself.
// The satellite half ENDS at S2 and never climbs past it. It used to carry on
// out to z6.2, and that climb is where Esri's imagery falls apart: measured, the
// ground goes from greenness +2.4 / relief 17.7 at z10.4 to greenness -12.4 /
// relief 11.5 at z9.5, and relief 5.3 by z7.3. Green and three-dimensional to
// flat and brown, in two steps — and the old cloud was only 43% opaque when it
// happened, so you watched it through the veil.
//
// So the widening changes MEDIUM instead. Behind full cloud the Atlas sheet
// takes the zoom on, and the sheet is a drawn hillshade rather than photography:
// it does not change palette between levels, and being flat it has no terrain
// mesh to rebuild — the two things that made the second half ugly are simply
// absent from it.
// (S2 and the cloud beats are DERIVED from the zoom ramp further down — the
// hand-off happens when the zoom reaches HANDOFF_Z, not at a time someone typed.)

const ease = (u, a, b) => { const p = Math.pow(u, a), q = Math.pow(1 - u, b); return p / (p + q); };
const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;

// where the pull-back ends: the whole Angeles cluster in one frame
const anfBounds = (() => {
    let w = 180, e = -180, s = 90, n = -90;
    ANF_IDS.forEach(id => {
        const g = featOf[id].geometry, segs = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
        segs.forEach(sg => sg.forEach(c => {
            if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0];
            if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1];
        }));
    });
    return [[w, s], [e, n]];
})();
const anfCam = globe.cameraForBounds(anfBounds, { padding: 60 });

// ---- Where the sheet picks up what the satellite put down --------------------
// The pitch the flight comes to rest at, named because the hand-off depends on
// it: get this wrong and the two halves are framed on different amounts of
// ground.
// 44, down from 50. A pitched camera's far distance is where the desert lives,
// and flattening the rest point simply puts less of it in shot — the drone
// levels off as it rises, which is what a drone does. It also hands over to the
// flat Atlas sheet from closer to flat. ?fp=50 restores it.
const FINAL_PITCH = +(new URLSearchParams(location.search).get('fp') || 44);

// WHERE THE ORBIT COMES TO REST, and it decides what the widest frame contains.
// A pitched camera shows the ground BEYOND its centre in the direction it
// faces, so the final bearing chooses the far distance. Resting at 0 (north up)
// pointed the last third of the film straight at the Antelope Valley, which is
// why the top of the frame kept filling with Mojave — and the Mojave is where
// Esri's per-level re-renders disagree most, so it arrived as a patchwork.
// 135 (south-east up, camera sitting north-west of the range) looks DOWN the
// San Gabriels instead, toward the eastern range and the basin. Measured over
// the late pull-back: the far band's warmth ends at 15.9 instead of 37.4, its
// worst one-frame step falls 3.88 -> 0.60, and the number of steps worth
// noticing goes 8 -> ZERO. The same 31 trails still ink. This is the fix; the
// haze below is now only air. Danny's idea, and the right one.
// It costs some of the hero: the whole orbit rotates with it, and the ink is
// watched from a different arc, so visible trail falls 3764 -> 3115 px. PITCH0
// buys most of that back (see there).
const FINAL_BEARING = +(new URLSearchParams(location.search).get('bear') || 135);

// Where the satellite half stops climbing. NOT anfCam.zoom (10.4) any more:
// Danny could still see the brown creeping in there, because at z10.4 with a
// 52-degree pitch the top of the frame is real Mojave plus the coarsest tiles
// in the scene. Stopping at 11.2 keeps the frame full of green range with the
// LOD collapse (measured at 9.5) two levels away instead of one, AND it gives
// the satellite less ground to cover, so it can cover it slowly.
// 10.9. Nudged out from 11.2 to give the Angeles cascade somewhere to happen:
// a slightly wider final frame brings more of the range into view sooner, so
// more trails clear their gate earlier and the flurry at the end has room to
// spread. Still 1.4 zoom levels clear of the imagery collapse measured at 9.5,
// which is the number that actually matters here.
// 10.5. Out again from 10.9, for the trails at the far ends of the range: they
// were clearing their gate while still near the edge of frame, so you never got
// a clear look at them being written. A wider final frame brings them properly
// inside it, and (with a stricter gate to match) buys the cascade more room to
// breathe. Still a full level clear of the imagery collapse measured at 9.5.
// 10.65. Out at 10.5 the frame had opened just far enough to let the high
// desert into the top-left corner in the last second before the cloud, which is
// the eyesore Danny kept seeing. Measured together with the flatter rest pitch,
// the worst visible patch of desert in the whole flight falls from 2.01% of the
// picture to 0.27%, and its total exposure from 9.18 to 3.47, for 0.6s of
// flight — and the same 30 trails still ink. ?hz=10.5 to compare.
const HANDOFF_Z = +(new URLSearchParams(location.search).get('hz') || 10.65);

// Rather than guess a zoom for the sheet, ask the 3D camera what ground it is
// actually showing in its last frame, and frame the sheet on exactly that.
// The bottom 65% of the frame only: above that is horizon, where the ground runs
// away to infinity and a few pixels of haze would blow the bounds out to half a
// continent.
const atlasStart = (() => {
    // In video mode there is no terrain to raycast against, so the number the
    // flight was RENDERED with is used instead of a fresh guess. Live mode
    // recomputes it and shouts if the two have drifted, because that drift
    // would silently move every beat in the film away from the video.
    if (!LIVE_FLIGHT) return BAKED_ATLAS_START;
    const prev = { center: globe.getCenter(), zoom: globe.getZoom(),
                   bearing: globe.getBearing(), pitch: globe.getPitch() };
    globe.jumpTo({ center: [anfCam.center.lng, anfCam.center.lat],
                   zoom: HANDOFF_Z, bearing: FINAL_BEARING, pitch: FINAL_PITCH });
    const cv = globe.getCanvas();
    const W = cv.clientWidth, H = cv.clientHeight;
    const pts = [[0, H * 0.35], [W, H * 0.35], [W, H], [0, H]].map(p => globe.unproject(p));
    globe.jumpTo(prev);
    let w = 180, e = -180, s = 90, n = -90;
    pts.forEach(ll => {
        if (ll.lng < w) w = ll.lng; if (ll.lng > e) e = ll.lng;
        if (ll.lat < s) s = ll.lat; if (ll.lat > n) n = ll.lat;
    });
    const cam = atlasMap.cameraForBounds([[w, s], [e, n]], { padding: 0 });
    const out = cam ? { center: [cam.center.lng, cam.center.lat], zoom: cam.zoom }
                    : { center: [anfCam.center.lng, anfCam.center.lat], zoom: 8.2 };
    const drift = Math.abs(out.zoom - BAKED_ATLAS_START.zoom);
    if (drift > 0.01) console.warn(
        `atlasStart has drifted from the baked film by ${drift.toFixed(3)} zoom levels — ` +
        `re-render, or update BAKED_ATLAS_START to`, out);
    return out;
})();

// Web Mercator, normalised to a 0..1 world, for the anchored zoom below.
const mx = lng => (lng + 180) / 360;
const my = lat => { const s = Math.sin(lat * Math.PI / 180);
                    return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
const imx = x => x * 360 - 180;
const imy = y => 180 / Math.PI * Math.atan(Math.sinh(Math.PI * (1 - 2 * y)));

// The sheet's half of the pull-back. `a` runs 0 (SoCal, where the cloud took
// over) to 1 (the whole country).
//
// The centre is ANCHORED, not lerped — the same formula the hero film uses.
// Southern California has to hold its place on screen while the frame opens out
// around it; a straight interpolation between two centres a third of a continent
// apart sends it swinging sideways across the sheet, which is the drift that
// once put mockup A's camera in the Utah desert half way through.
function setAtlasView(zoom) {
    // how far through the sheet's own journey this zoom is — the centre drift is
    // tied to the ZOOM, not to the clock, so the two can never disagree
    const a = clamp01((atlasStart.zoom - zoom) / (atlasStart.zoom - atlasEnd.zoom));
    const S = Math.pow(2, zoom - atlasEnd.zoom);
    const hx = mx(atlasStart.center[0]), hy = my(atlasStart.center[1]);
    const fx = mx(atlasEnd.center[0]),   fy = my(atlasEnd.center[1]);
    atlasMap.jumpTo({
        center: [imx(hx + (fx - hx) * a / S), imy(hy + (fy - hy) * a / S)],
        zoom
    });
}

// The reveal schedule (which trail inks when, and how its stroke is drawn) is
// built further down, once the camera exists — see SCHED.

// ===== ONE ZOOM, ACROSS BOTH MAPS ==========================================
// This is the fix for "it doesn't feel like one consistent pull back", and the
// reason three previous attempts failed: each SEGMENT was being eased smoothly
// on its own, which produced a rate profile of accelerate–decelerate–stop–
// (hidden burst)–decelerate–stop. Every one of those joints is a place the eye
// reads a new shot starting. Smooth pieces do not add up to a smooth whole.
//
// So there is now exactly ONE zoom curve for the entire film, and the two maps
// each render their stretch of it. The cloud does not interrupt the zoom; it
// merely happens to be passing while the zoom continues underneath.
//
// The curve is a RAMP, in Danny's word: the rate of widening rises steadily and
// monotonically from start to finish, never falling. Written as rate(x) =
// R0 + (2-2*R0)x so that its integral over [0,1] is exactly 1 — the film always
// travels the whole distance no matter how the ramp is tuned.
const Z_START = 16.0;
// Opening rate, as a fraction of the mean. 0.72, up from 0.55: because the
// integral is pinned to 1, raising it does BOTH things Danny asked for at once —
// the film sets off quicker and the far end, where it was rushing, eases off.
// rate runs 0.72 -> 1.28 instead of 0.55 -> 1.45. Still strictly increasing.
const RAMP_R0 = 0.72;
// The sheet reads about 0.2 of a zoom level wider than the pitched 3D camera for
// the same ground, measured by unprojection above. Carrying that offset means
// the curve is continuous in APPARENT scale across the hand-off, not merely in
// zoom numbers.
const Z_OFFSET = HANDOFF_Z - atlasStart.zoom;
// The span the FLIGHT was cut with. In live mode it is derived, as it always
// was, from where the sheet has to land — that run is the cut being made. In
// video mode it is read back from the film record, and that is the whole reason
// the Atlas can grow: a new hike may widen `atlasEnd` all it likes, and the
// flight's zoom at every moment stays exactly what the video shows, because it
// no longer depends on where the sheet ends up.
const Z_SPAN = (FILM && FILM.zSpan) || (Z_START - (atlasEnd.zoom + Z_OFFSET));
// ...and a TAPER over the last stretch, easing the rate to nothing so the film
// settles onto its final frame instead of running at full speed into a wall.
// The ramp rises the whole way and then lands; it still never speeds up again,
// which is the property that matters.
const RAMP_TAPER = 0.86;
// The rate is no longer a tidy quadratic once tapered, so the curve is
// integrated once into a table and normalised — which also guarantees the film
// travels exactly its full distance however the taper is retuned.
const RAMP_N = 2048;
const rampLUT = (() => {
    const rate = new Float64Array(RAMP_N + 1);
    for (let i = 0; i <= RAMP_N; i++) {
        const x = i / RAMP_N;
        let t = 1;
        if (x > RAMP_TAPER) {
            const s = (x - RAMP_TAPER) / (1 - RAMP_TAPER);
            t = 1 - s * s * (3 - 2 * s);
        }
        rate[i] = (RAMP_R0 + (2 - 2 * RAMP_R0) * x) * t;
    }
    const c = new Float64Array(RAMP_N + 1);
    let acc = 0;
    for (let i = 1; i <= RAMP_N; i++) {
        acc += (rate[i - 1] + rate[i]) / 2 / RAMP_N;
        c[i] = acc;
    }
    for (let i = 0; i <= RAMP_N; i++) c[i] /= acc;
    return c;
})();
const rampAt = x => {
    const t = clamp01(x) * RAMP_N, i = Math.min(RAMP_N - 1, Math.floor(t));
    return rampLUT[i] + (rampLUT[i + 1] - rampLUT[i]) * (t - i);
};
// The FLIGHT's zoom. Only the flight — the sheet has its own reader below.
const zoomOf = q => Z_START - Z_SPAN * rampAt(clamp01(q));
// and its inverse, to find the moment the curve reaches the hand-off
const rampSolve = P => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (rampAt(mid) < P) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
};

// The satellite hands over the moment the ramp reaches HANDOFF_Z. Everything
// else hangs off that, so retuning the ramp or the hand-off zoom cannot leave
// the cloud in the wrong place — which is exactly the sort of drift that put a
// half-transparent veil over the ugliest four seconds of the last cut.
const S2 = rampSolve((Z_START - HANDOFF_Z) / Z_SPAN);
// How far through the ramp the hand-off happens. The SHEET rides the rest of
// that same curve — same shape, same taper, same lack of any joint — stretched
// onto whatever distance today's data actually asks for.
//
// Written this way it is algebraically IDENTICAL to the old
// `zoomOf(q) - Z_OFFSET` whenever Z_SPAN is the live one (both are linear in
// rampAt(q) through the same two points, atlasStart.zoom at R2 and atlasEnd.zoom
// at 1) — so nothing about the film changes. What it buys is that the sheet can
// now land somewhere the video knows nothing about.
const R2 = rampAt(S2);
const sheetZoom = q =>
    atlasStart.zoom - (atlasStart.zoom - atlasEnd.zoom) * clamp01((rampAt(q) - R2) / (1 - R2));
// Tightened hard: the whole cloud is now 6.5s rather than 14.2s, of which only
// ~1.1s is the full white-out. The mask does not need longer than that — the
// swap underneath it is a single frame — and every extra second was time spent
// looking at nothing.
const CLOUD_IN   = S2 - 0.070;   // veil starts closing, forest already complete
const CLOUD_FULL = S2;           // total cover exactly as the satellite stops
const CLOUD_HOLD = S2 + 0.030;   // and it STAYS total across the swap
const CLOUD_OUT  = S2 + 0.110;
const S4 = S2 + 0.015;           // the swap, inside the hold, invisible
// The SHROUD: the stretch either side of the swap where the cloud is thick
// enough that nothing behind it can be read. Nothing may ink in here — a trail
// drawn under the veil is a trail nobody ever sees drawn, and it is why the
// sheet was arriving with more on it than the satellite view had shown.
const SHROUD_IN  = CLOUD_IN + 0.5 * (CLOUD_FULL - CLOUD_IN);
const SHROUD_OUT = CLOUD_HOLD + 0.5 * (CLOUD_OUT - CLOUD_HOLD);
// Late and gentle: it is depth, not a mask. It used to start at 0.22 and reach
// full at 0.40, which is when the film's own cloud is still 5 seconds away —
// and a thickening white sky that early reads as arriving at the cloud early.
const HAZE_IN = 0.30, HAZE_FULL = 0.44;
const HAZE_K = (v => v === null ? 1 : +v)(new URLSearchParams(location.search).get('haze'));

// ---- The spiral -------------------------------------------------------------
// Z_START (16) is as close as the ground can be read: measured against Esri's
// imagery over the Angeles, z16 still resolves the trail cut into the ridge and
// individual trees, while z17 is visibly mushy and the terrain silhouette starts
// faceting against the DEM's own limit.
// Degrees of orbit, and the direction of it: negative sweeps the other way
// round. The orbit always ENDS at bearing 0, because the flat sheet it hands
// over to is north-up and arriving there any other way costs a rotation the
// cloud would have to hide. ?sweep= and ?pitch0= to try others.
const SWEEP = +(new URLSearchParams(location.search).get('sweep') || 200);
const B0 = FINAL_BEARING - SWEEP;
// 54, not 70. The old opening pitch was burying the trail behind whatever ridge
// happened to stand in front of it — MapLibre depth-tests the line against the
// terrain, so an occluded stretch genuinely is not drawn. Measured by counting
// visible trail pixels right through the orbit, the curve is monotonic and
// steep: 66 degrees shows 8,309 px, 58 shows 9,657, 54 shows 10,333 (+24% on
// the old 70) and 48 only reaches 10,641. So 48 buys 3% more while flattening
// the mountains out of the shot, and 54 is where the trade stops paying.
//
// Direction was measured the same way and the orbit already ran the right way:
// every clockwise sweep beat its counter-clockwise mirror by 20-35%. The AMOUNT
// barely matters (130 and 200 degrees are within 3% of each other), so the
// fuller turn stays — it is the shape of the move, not the visibility.
//
// Re-measured after the orbit was turned to rest at 135, because that moves the
// whole arc and the ink is watched from different ground: 46 shows 3,494 px, 54
// shows 3,115, 62 only 2,811. So flattening to 46 buys 12% more visible trail —
// but Danny watched both and prefers the steeper mountains, which is his call to
// make and the reason the number is his and not the measurement's. ?pitch0=46.
// (Sweep was re-checked at the same time and 200 still wins: 150 gives 2,674
// and 250 gives 3,045.)
const PITCH0 = +(new URLSearchParams(location.search).get('pitch0') || 54);
// The zoom is NOT computed here any more — it comes from zoomOf(q), the single
// ramp that also drives the sheet. Only the bearing, pitch and centre belong to
// the spiral.

// Where the orbit stops. This was first DERIVED, by solving the zoom curve for
// the zoom that frames the whole trail — and the answer was degenerate: Tee Pee
// is only 1.4 km across, so it already fits inside the opening frame at z16, and
// the solver duly ended the rotation at 10% in. The entire 200 degrees whipped
// round in the first two seconds.
//
// The framing question was the wrong one. "Until we can see the whole trail" is
// not about the trail FITTING — it already does — it is about the orbit lasting
// long enough to read as an orbit, and ending once the trail has become a shape
// on a hillside rather than the ground underfoot. That is a directorial call, so
// it is a stated constant: a bit over half the run up to the cloud, which lands
// the stop at roughly z13 with the whole trail and its ridge in frame.
const SPIRAL_END = 0.55;
// The ink is finished a little before the orbit is, so the moment you can see
// the whole trail is the moment it is all there.
// The hero's pen used to finish at 0.506 — about 11 s in, while the camera was
// still tight enough that the tip had run off the edge of the frame. So you
// watched it start, lost it, and by the time the camera was wide enough to hold
// the whole trail it was already finished. It now writes until 0.72, which is
// most of the way through the pull-back, so the tip is still travelling while
// the range opens up underneath it.
const HERO_INK_END = 0.72;
// A beat of untouched country before the pen touches it. The film used to have
// ink moving in its very first frame, which is also the frame that becomes the
// video's poster image — so the first thing anyone saw was a line already being
// drawn, rather than the land it is about to be drawn on. One second of
// mountain, then the trail begins.
const HERO_INK_START = 0.043;
// The forest begins to light while Tee Pee is still being drawn — they overlap
// by about two seconds. Igniting only once the ink had finished left a dead
// beat exactly where the film should be opening out, and the pull-back is long
// enough that the far end of the range needs the head start anyway.
// DECOUPLED from the hero's pen, and it has to be. This was HERO_INK_END * 0.79,
// so slowing the hero down dragged the whole forest's ignition later with it —
// and the forest's pacing is the one part of this Danny has signed off. 0.40 is
// exactly where the old expression put it.
const ANF_START = 0.40;
// Zero angular velocity at BOTH ends: the orbit eases into motion and eases out
// of it. A linear sweep that simply stops is the thing that reads as a lurch.
const smoother = t => t * t * t * (t * (t * 6 - 15) + 10);

// quadratic Bezier: leaves the anchor, bows over the trail's own middle, arrives
// at the forest — one continuous curve, no corner where the movements meet
// (heroMid is defined up with the anchor; it must not be re-declared here)
const bez = (p0, p1, p2, t) => {
    const m = 1 - t;
    return [m * m * p0[0] + 2 * m * t * p1[0] + t * t * p2[0],
            m * m * p0[1] + 2 * m * t * p1[1] + t * t * p2[1]];
};

let raf = null, running = false, t0 = 0, anfLit = 0, natLit = 0, globeParked = false;
// (titleEl / btn / hintEl / creditEl and the layer elements are all built or
// adopted up in "The stage", before any of the film exists.)
// Whichever surface is carrying the flight. Everything downstream crossfades
// THIS, so the seam is written once rather than twice.
const flightEl = LIVE_FLIGHT ? globeEl : filmEl;
if (!LIVE_FLIGHT) {
    // `visibility`, NOT `display`. The globe is still a live map in video mode —
    // it is the camera the reveal schedule is built by walking, and that walk
    // asks its canvas how big the frame is. `display:none` collapses the canvas
    // to 0x0, so every trail was tested against a frame with no width and not
    // one of them ever came "into view". Hidden keeps the box, and the box is
    // the whole point.
    globeEl.style.visibility = 'hidden';
}
// ---- Pulling the film down, in full, before a frame of it is shown --------
// FETCHED rather than handed to the <video> element, and that is the fix for
// the choppy first watch. Given a src, Chrome downloads only what it thinks a
// PAUSED video needs and then stops — so `buffered` never reaches the end, the
// film starts on a partial file, and playback spends the shot catching up with
// the download. (Measured: waiting on `buffered` timed out at 30s every time.)
//
// Fetching it ourselves gives three things instead: it genuinely completes, the
// bytes are in memory so playback cannot stall, and the read loop reports HONEST
// progress, which is what the plate outside is showing.
//
// A visitor who has already seen the film this session never calls this at all —
// they land on the finished sheet, so those megabytes are not spent. That is most
// visits, and it is the single biggest saving in the whole design.
// It is called ONCE, whenever it is first needed — at boot for a first visit,
// or the moment someone presses Replay after a repeat visit, where the film was
// deliberately never fetched. Memoised, so pressing Replay twice does not pull it twice.
let filmPromise = null;
function loadFilm() {
    if (LIVE_FLIGHT) return Promise.resolve();
    if (filmPromise) return filmPromise;
    filmPromise = (async () => {
        try {
            const res = await fetch(VIDEO_SRC);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            // Cloudinary sends a length; if a proxy ever strips it, fall back to
            // the size we expect so the plate still has something honest to
            // show rather than sitting at zero until the last byte.
            const total = +res.headers.get('content-length') || 9.4e6;
            const chunks = [];
            let got = 0;
            const reader = res.body.getReader();
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value); got += value.length;
                aim(0.42 + 0.48 * Math.min(1, got / total));
            }
            filmEl.src = URL.createObjectURL(
                new Blob(chunks, { type: res.headers.get('content-type') || 'video/mp4' }));
        } catch (e) {
            // Fall back to letting the element stream it. A film that stutters
            // is a poorer opening than one that does not; a film that never
            // appears is not an opening at all.
            console.warn('Could not preload the intro film, streaming instead:', e);
            filmEl.src = VIDEO_SRC;
        }
        // Having the bytes is not having a first frame.
        await new Promise(res2 => {
            let done = false;
            const go = () => { if (!done) { done = true; res2(); } };
            if (filmEl.readyState >= 3) go();
            filmEl.addEventListener('canplaythrough', go, { once: true });
            filmEl.addEventListener('error', go, { once: true });
            setTimeout(go, 8000);
        });
    })();
    return filmPromise;
}
// Putting the video where the film is — but ONLY when the film is not playing.
//
// This used to correct a PLAYING video too, whenever it drifted more than a
// couple of frames, and that was the stutter. Every correction is a seek, every
// seek flushes the decoder and sends it back to a keyframe to decode forward
// again, and the time that costs puts the video further behind, which brings the
// next correction sooner. A machine slightly late became a machine that juddered,
// and this line is what did it to it.
//
// While the film plays, the video is now the clock and nothing corrects it (see
// filmQ). What is left here is scrubbing: a seek, a screenshot, the cutting
// room's ?q= parking, all of which happen with the film stopped.
function syncFilm(q) {
    // `collectFlightTiles` walks the whole film at boot to note what the SHEET
    // will ask for; dragging the video's decoder along behind that sweep would
    // cost seconds and achieve nothing.
    if (LIVE_FLIGHT || collecting || running) return;
    const want = q * D / 1000;
    if (Math.abs(filmEl.currentTime - want) > 0.005) filmEl.currentTime = want;
}
washEl.style.opacity = 0.5 * WASH;

// ===== Real cloud ===========================================================
// Tileable fractal (value) noise, generated once into a canvas and handed to the
// puff layers as a texture. Clouds have structure at every scale — that is what
// makes them read as cloud rather than as fog — and summed octaves of noise is
// the cheapest honest way to get it. Tileable because the layers are scaled up
// hard as they pass the camera, and a seam sliding through frame would give the
// whole thing away.
function cloudTexture(size, seed, octaves) {
    let s = seed >>> 0;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const grids = [];
    for (let o = 0; o < octaves; o++) {
        const n = 4 << o, g = new Float32Array(n * n);
        for (let i = 0; i < n * n; i++) g[i] = rnd();
        grids.push({ n, g });
    }
    const sm = t => t * t * (3 - 2 * t);
    const at = (gr, a, b) => gr.g[(((b % gr.n) + gr.n) % gr.n) * gr.n + (((a % gr.n) + gr.n) % gr.n)];
    const sample = (gr, x, y) => {
        const fx = x * gr.n, fy = y * gr.n;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = sm(fx - x0), ty = sm(fy - y0);
        const top = at(gr, x0, y0) + (at(gr, x0 + 1, y0) - at(gr, x0, y0)) * tx;
        const bot = at(gr, x0, y0 + 1) + (at(gr, x0 + 1, y0 + 1) - at(gr, x0, y0 + 1)) * tx;
        return top + (bot - top) * ty;
    };
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        let v = 0, amp = 1, tot = 0;
        for (let o = 0; o < octaves; o++) {
            v += amp * sample(grids[o], x / size, y / size);
            tot += amp; amp *= 0.55;
        }
        v /= tot;
        // Bias and steepen into BILLOWS with clear edges and holes between them.
        // Straight noise looks like fog; the threshold is what makes it cloud.
        let a = Math.max(0, Math.min(1, (v - 0.40) / 0.34));
        a = a * a * (3 - 2 * a);
        const k = (x + y * size) * 4;
        const w = 248 + Math.round(7 * v);        // barely-warm white, not flat #fff
        img.data[k] = w; img.data[k + 1] = w - 1; img.data[k + 2] = w - 5;
        img.data[k + 3] = Math.round(a * 255);
    }
    ctx.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
}

// Four decks at different scales and drifts. Passing THROUGH cloud is mostly
// about parallax and about layers rushing past the lens, so each one is given
// its own scale, its own direction, and its own moment to arrive.
const PUFFS = [
    { tex: 0, size: 150, scale0: 1.00, scale1: 3.6, dx: -0.55, dy: 0.34, lead: 0.00 },
    { tex: 1, size: 105, scale0: 1.15, scale1: 4.8, dx: 0.42, dy: -0.28, lead: 0.14 },
    { tex: 2, size:  78, scale0: 1.30, scale1: 6.4, dx: -0.30, dy: -0.46, lead: 0.28 },
    { tex: 3, size:  56, scale0: 1.45, scale1: 8.6, dx: 0.62, dy: 0.22, lead: 0.42 }
];
{
    const texes = [cloudTexture(512, 9161, 6), cloudTexture(512, 4423, 6),
                   cloudTexture(256, 7717, 5), cloudTexture(256, 2939, 5)];
    PUFFS.forEach((p, i) => {
        const el = cloudsEl.children[i + 1];
        el.style.backgroundImage = `url(${texes[p.tex]})`;
        el.style.backgroundSize = `${p.size}% ${p.size}%`;
    });
}

// The camera, and ONLY the camera, as a pure function of q. Split out of
// renderAt so the reveal schedule below can be built by WALKING the film's own
// camera path at boot and asking where each trail actually lands on screen —
// without dragging the ink and the reveal, which depend on that schedule, round
// in a circle with it.
function cameraAt(q) {
    if (q < S2) {
        const u = clamp01(q / S2);
        const spun = smoother(clamp01(u / SPIRAL_END));
        const c = bez(ANCHOR, heroMid, [anfCam.center.lng, anfCam.center.lat],
                      smoother(clamp01((u - SPIRAL_END * 0.55) / (1 - SPIRAL_END * 0.55))));
        globe.jumpTo({ center: c, bearing: B0 + SWEEP * spun, zoom: zoomOf(q),
                       pitch: lerp(PITCH0, FINAL_PITCH, ease(u, 1.3, 1.3)) });
        globeParked = false;
    } else if (!globeParked) {
        globe.jumpTo({ center: [anfCam.center.lng, anfCam.center.lat],
                       zoom: HANDOFF_Z, bearing: FINAL_BEARING, pitch: FINAL_PITCH });
        globeParked = true;
    }
    setAtlasView(q >= S4 ? sheetZoom(q) : atlasStart.zoom);
}

function setAnfLit(n) {
    if (n === anfLit) return;
    const on = n > anfLit;
    for (let i = Math.min(anfLit, n); i < Math.max(anfLit, n); i++)
        // anfOrder[i].id, NOT i. `doneCount` counts along the SCHEDULE, which is
        // sorted by when each stroke finishes; the feature ids are in the order
        // the trails happen to sit in the file. Lighting by the raw index meant
        // the pen finished writing one trail and a completely different one lit
        // up, so the trail you had just watched being drawn vanished. Two of the
        // 32 also never enter the flight's frame and defer to the sheet, so the
        // two orders are not even the same length.
        globe.setFeatureState({ source: 'anf', id: anfOrder[i].id }, { on });
    anfLit = n;
}
// ===== The pens =============================================================
// Every trail is now DRAWN along its own GPX rather than switched on. The hero
// always was, via a line-gradient running on line-progress; the difficulty is
// that a gradient is a property of a LAYER, so it cannot be given to each of a
// hundred features in one.
//
// Hence a small pool of pens. Only a handful of trails are mid-stroke at any
// moment, so each gets a dedicated layer for as long as it is being written and
// then hands it back. A trail costs one setData when it picks up a pen — not one
// per frame — and thereafter only a gradient update, which is cheap and stays on
// the main thread. Finished trails move to the static layers that were already
// there and the pen goes back in the pot.
function makePens(map, n, layers) {
    const pens = [];
    for (let i = 0; i < n; i++) {
        const sid = `pen-${map === globe ? 'g' : 'a'}-${i}`;
        map.addSource(sid, { type: 'geojson', lineMetrics: true, tolerance: 0,
            data: { type: 'Feature', properties: {},
                    geometry: { type: 'LineString', coordinates: [[0, 0], [0, 0]] } } });
        const ids = layers.map((L, j) => {
            const lid = `${sid}-${j}`;
            map.addLayer(Object.assign({ id: lid, type: 'line', source: sid,
                layout: { 'line-cap': 'round', 'line-join': 'round' } },
                { paint: Object.assign({ 'line-opacity': 0 }, L) }));
            return lid;
        });
        pens.push({ src: sid, layers: ids, holding: null });
    }
    return pens;
}
// On the flight the trails are large on screen, so they get the same glow-and-
// core treatment the static Angeles layers wear. On the sheet a casing would be
// sub-pixel, so one stroke is honest.
const gPens = makePens(globe, 10, [
    { 'line-blur': ANF_W.glowBlur, 'line-width': ANF_W.glow },
    { 'line-blur': 0.3, 'line-width': ANF_W.case },
    { 'line-blur': 0.5, 'line-width': ANF_W.body }
]);
const aPens = makePens(atlasMap, 10, [{ 'line-width': 2 }]);

// Load a trail into a pen, but only when it actually changes — the setData is
// the expensive part and re-issuing it every frame is the churn this design
// exists to avoid.
function penHold(map, pen, feat) {
    if (pen.holding === feat.id) return;
    pen.holding = feat.id;
    map.getSource(pen.src).setData(feat.geom);
}
// A pen must lay down EXACTLY the ink the finished trail wears, or the moment
// it hands over is a flash. It used to draw its core 28% lighter than the layer
// it handed to, so every trail in the forest brightened while it was being
// written and dropped to its true colour the instant it finished.
function penDraw(map, pen, row, p, glow) {
    const cols = glow ? [row.color, row.case, row.body] : [row.color];
    const ops = glow ? [ANF_GLOW_OP, 1, 1] : [1];
    pen.layers.forEach((lid, j) => {
        map.setPaintProperty(lid, 'line-opacity', ops[j]);
        // The casing keeps its own dark head. A bright pen tip on the separator
        // would defeat the one job it has — the same rule the hero's casing
        // follows.
        map.setPaintProperty(lid, 'line-gradient',
            grad(cols[j], p, 0.02, j === 1 && glow ? cols[1] : undefined));
    });
}
function penIdle(map, pen) {
    pen.layers.forEach(lid => map.setPaintProperty(lid, 'line-opacity', 0));
}

function setNatLit(n) {
    if (n === natLit) return;
    const from = Math.min(natLit, n), to = Math.max(natLit, n);
    for (let i = from; i < to; i++) {
        const st = { on: n > natLit };
        atlasMap.setFeatureState({ source: 'nat', id: natOrder[i].id }, st);
        atlasMap.setFeatureState({ source: 'natpt', id: natOrder[i].id }, st);
    }
    natLit = n;
}

// ===== The reveal schedule ==================================================
// When each trail starts being written, and how long its stroke takes. Both
// halves are gated the same way now: Danny's note was that the Angeles trails
// were fully inked before the camera had pulled back far enough to show them,
// which is the same fault the sheet had.
// A stroke takes ~0.7s, in film units. It is deliberately brisk: 32 Angeles
// trails have to be written between the moment the frame reaches them and the
// moment the cloud closes, and a longer stroke needs either more pens running at
// once or a queue that overruns the cloud — which is where a slower one landed.
const DRAW_Q = 0.7 / (D / 1000);
// Below this sheet zoom a trail is a handful of pixels and drawing it is pixels
// nobody can read, so it simply arrives as its dot. Chosen from the arithmetic:
// at z7 a typical 5 km outing is about 10 screen px, and by z6 it is 5.
const DOT_Z = 6.3;
// trail_id per anfFC feature index, so the schedule can name which ones inked
const ANF_DRAWN_IDS = ANF_IDS.filter(id => id !== HERO_ID);
const anfCentroid = anfFC.features.map(centroidOf);
const anfFoot = anfFC.features.map(footOf);
// The gate, asked of a whole footprint: every corner inside a box that is
// `frac` of the way out to the edge. `frac` is the BUFFER — at 0.82 a trail has
// to be a tenth of the frame clear of the edge before it may take the pen.
const footIn = (map, pts, cx, cy, frac) => {
    for (let i = 0; i < pts.length; i++) {
        const p = map.project(pts[i]);
        if (!(Math.abs(p.x - cx) < cx * frac && Math.abs(p.y - cy) < cy * frac)) return false;
    }
    return true;
};
const SCHED = (() => {
    const gc = globe.getCanvas(), ac = atlasMap.getCanvas();
    const gx = gc.clientWidth / 2, gy = gc.clientHeight / 2;
    const ax = ac.clientWidth / 2, ay = ac.clientHeight / 2;
    const anfIn = new Array(anfCentroid.length).fill(null);
    const natIn = new Array(natCentroid.length).fill(null);
    const N = 240;

    // ---- pass 1: when does each trail come comfortably into frame? ----------
    //
    // THE WALK RUNS WITH TERRAIN SWITCHED OFF, and that is not a shortcut, it is
    // the only way the answer can be right. `project()` is terrain-aware: it
    // puts a point where its GROUND is. At boot the DEM has not loaded, so it
    // answered as if every trail sat at sea level while the camera was pinned
    // 2,100 m up — which places a trail LOWER in the frame than it really is,
    // and the gate happily opened while the trail was still off the top. Twenty-
    // seven of thirty trails were being written off-screen, then appearing
    // already finished as the camera reached them.
    //
    // With terrain off, the camera sits H above a flat plane and the trails lie
    // on it. That is exactly the real geometry, because the camera's reference
    // IS pinned to the height these trails sit at (CENTER_ELEV) — camera-to-
    // ground is H in both. It is also steadier than sampling real terrain would
    // be, which would make a gate depend on whether a trail happens to sit on a
    // peak or in a canyon. Waiting for the DEM instead would put ten seconds on
    // the boot and still give a worse answer.
    const terrain = (typeof globe.getTerrain === 'function') ? globe.getTerrain() : null;
    if (terrain) globe.setTerrain(null);
    for (let i = 0; i <= N; i++) {
        const q = i / N;
        cameraAt(q);
        // In video mode the flight is a finished picture and its gates are a
        // matter of record, not of derivation — so this half of the walk is
        // skipped outright, which also takes it off the boot.
        if (LIVE_FLIGHT && q < S2) for (let k = 0; k < anfFoot.length; k++) {
            if (anfIn[k] !== null) continue;
            // Genuinely on screen, WHOLE, with room to be watched rather than
            // glimpsed at the edge as it goes past.
            if (footIn(globe, anfFoot[k], gx, gy, 0.82)) anfIn[k] = q;
        }
        if (q >= S4) {
            // The buffer opens up as the sheet widens — early on the frame is
            // tight and a trail needs real room to be read, late on the country
            // is full of them and the corners are usable. But it never reaches
            // 1: at 1 the gate says "any part of the edge will do", which is the
            // same as having no buffer at all, and a trail would be free to ink
            // itself in the outermost pixel of the picture.
            const buf = lerp(0.68, 0.90, (q - S4) / (1 - S4));
            for (let k = 0; k < natFoot.length; k++) {
                if (natIn[k] !== null) continue;
                if (footIn(atlasMap, natFoot[k], ax, ay, buf)) natIn[k] = q;
            }
        }
    }
    if (terrain) { globe.setTerrain(terrain); applyPin(); }
    for (let k = 0; k < natIn.length; k++) if (natIn[k] === null) natIn[k] = 1;

    // ---- pass 2: the flight's cascade --------------------------------------
    // The clock paces the fill, the gate stops it running ahead of the camera,
    // and a trail starts at whichever of the two is later. A trail that never
    // comes into the flight's frame is simply not the flight's to tell: it drops
    // out and takes its turn on the sheet like any other.
    //
    // A trail whose gate opens too late to FINISH before the veil is dropped
    // here, not at the end. It used to ride along through the pacing and then be
    // filtered out afterwards, which cost twice: it took a share of the cascade's
    // gap budget, and it made the release clock count toward a total the window
    // could never hold. Eight Angeles trails that had every chance of being
    // written in the clear were being pushed past the veil by trails that never
    // stood a chance — 20 inking where 28 fit.
    const anfRows = anfIn.map((qq, k) => ({ k, gate: qq }))
                         .filter(r => r.gate !== null && r.gate + DRAW_Q <= SHROUD_IN)
                         .sort((a, b) => a.gate - b.gate);
    const aFirstGate = Math.min(...anfRows.map(r => r.gate));
    // The floor is the pen budget — a burst of trails arriving together must
    // never ask for more pens than exist, because an unpenned trail does not
    // draw at all, it just appears. Above that floor the strokes spread to FILL
    // the window rather than bunching early and leaving it empty.
    const A_MIN = DRAW_Q / (gPens.length * 0.8);
    const A_GAP = Math.max(A_MIN, (SHROUD_IN - aFirstGate - DRAW_Q) / Math.max(1, anfRows.length));
    let ai = 0, aLast = -9;
    for (let i = 0; i <= N * 3; i++) {
        const q = i / (N * 3);
        const au = ease(clamp01((q - ANF_START * S2) / (CLOUD_IN - ANF_START * S2)), 1.5, 1.3);
        while (ai < anfRows.length && ai < Math.round(au * anfRows.length) && anfRows[ai].gate <= q) {
            aLast = Math.max(q, aLast + A_GAP);
            anfRows[ai++].start = aLast;
        }
    }
    anfRows.forEach(r => { if (r.start === undefined) r.start = r.gate; });

    // The forest has to be FINISHED before the veil thickens, not merely before
    // it shuts — a trail drawn under cloud is a trail nobody sees drawn. The
    // camera only opens wide enough to hold 40 km of range in the last third of
    // the flight, so the ignition is inherently a late cascade; that is geometry,
    // not pacing. What can be fixed is the overrun.
    //
    // But it is fixed by SQUEEZING THE GAPS, never by moving a stroke earlier
    // than its own gate. Rescaling the whole cascade toward its first stroke is
    // what let it overtake the camera: 27 of 30 trails were starting up to 2.5 s
    // before the frame reached them. The gate is a floor, and nothing downstream
    // may lower it.
    {
        const first = Math.min(...anfRows.map(r => r.start));
        const last = Math.max(...anfRows.map(r => r.start));
        const room = SHROUD_IN - DRAW_Q - first;
        const k = (last > first && last - first > room && room > 0) ? room / (last - first) : 1;
        let prev = -9;
        anfRows.forEach(r => {
            r.start = Math.max(r.gate, first + (r.start - first) * k, prev + A_MIN);
            prev = r.start;
        });
    }
    // And whatever still cannot finish in the clear defers to the sheet, exactly
    // as a trail that never entered the frame does. Dropping them HERE, before
    // the sheet's schedule is built, is what keeps the sheet's opening picture
    // identical to the flight's closing one.
    const anfKept = anfRows.filter(r => r.start + DRAW_Q <= SHROUD_IN);

    // ---- pass 3: the sheet -------------------------------------------------
    // WHAT THE SHEET INHERITS IS A FACT ABOUT THE VIDEO, not a conclusion drawn
    // from today's data. In video mode it is read straight off the film record;
    // only a live cut re-derives it, and the renderer then writes down what this
    // cut actually drew. Getting this from the schedule instead is what would
    // break the first time a hike was added near the hero: it would clear the
    // flight's gate, the sheet would open already carrying it, and the video
    // would never have drawn it.
    const inked = (FILM && FILM.inked)
        ? new Set(FILM.inked)
        : new Set([HERO_ID, ...anfKept.map(r => ANF_DRAWN_IDS[r.k])]);
    const natRows = natIn.map((qq, k) => ({ k, gate: qq, pre: inked.has(natFeatures[k].properties.trail_id) }))
                         .sort((a, b) => (b.pre - a.pre) || (a.gate - b.gate));
    const preN = natRows.filter(r => r.pre).length;
    const N_GAP = Math.max(DRAW_Q / (aPens.length * 0.8),
                           // two strokes' margin, so the last trail lands with
                           // room rather than being cut off by the final frame
                           (1 - SHROUD_OUT - 2 * DRAW_Q) / Math.max(1, natRows.length - preN));
    let ni = preN, nLast = -9;
    for (let i = 0; i <= N * 3; i++) {
        const q = i / (N * 3);
        // Nothing new on the sheet until the veil has thinned enough to watch it
        // happen. The sheet takes over at S4, deep inside the cloud, and any
        // trail released between there and here would draw itself unseen.
        if (q < SHROUD_OUT) continue;
        const nu = ease(clamp01((q - SHROUD_OUT) / (1 - SHROUD_OUT)), 1.25, 1.4);
        while (ni < natRows.length && ni < preN + Math.round(nu * (natRows.length - preN))
               && natRows[ni].gate <= q) {
            nLast = Math.max(q, nLast + N_GAP);
            natRows[ni++].start = nLast;
        }
    }
    natRows.forEach(r => { if (r.start === undefined) r.start = r.pre ? 0 : 1; });
    // Anything the flight already inked is simply THERE when the sheet appears.
    natRows.forEach(r => { if (r.pre) r.start = 0; });

    // A sheet trail only earns a pen if it is still big enough to read when its
    // turn comes; otherwise its stroke is zero-length and it arrives as a dot.
    natRows.forEach(r => { r.draw = (!r.pre && sheetZoom(r.start) > DOT_Z) ? DRAW_Q : 0; });
    anfKept.forEach(r => { r.draw = DRAW_Q; });

    // Ordered by when each FINISHES, so "done" stays a prefix and the static
    // layers can keep lighting a simple count.
    const anf = anfKept.slice().sort((a, b) => (a.start + a.draw) - (b.start + b.draw))
        .map(r => ({ id: anfFC.features[r.k].id, start: r.start, draw: r.draw, gate: r.gate, k: r.k,
                     color: anfFC.features[r.k].properties.color,
                     case: anfFC.features[r.k].properties.case,
                     body: anfFC.features[r.k].properties.body,
                     geom: anfFC.features[r.k] }));
    const nat = natRows.slice().sort((a, b) => (b.pre - a.pre) ||
                                     ((a.start + a.draw) - (b.start + b.draw)))
        .map(r => ({ id: natFeatures[r.k].id, start: r.start, draw: r.draw, pre: r.pre, gate: r.gate, k: r.k,
                     color: natFeatures[r.k].properties.color,
                     geom: natFeatures[r.k] }));
    return { anf, nat, preN, inked: [...inked],
             // for the harness: how many the flight COULD have told vs did
             diag: { gated: anfRows.length, kept: anfKept.length, aFirstGate,
                     starts: anfRows.map(r => +r.start.toFixed(4)) } };
})();
const PRE_LIT = SCHED.preN;
const anfOrder = SCHED.anf;      // setAnfLit lights a prefix of this
const natOrder = SCHED.nat;      // setNatLit lights a prefix of this

// Run the pens for whichever trails are mid-stroke at this instant. Recomputed
// from q every frame rather than remembered, so seeking to any moment of the
// film lands on exactly the right picture.
function runPens(map, pens, rows, q, glow) {
    // A trail keeps ONE pen for its whole stroke. Handing pens out in the order
    // trails happen to be active meant that every time a stroke finished, every
    // later pen shifted down a slot and had to be re-loaded with different
    // geometry — a setData per pen per finished trail, and for the frame or two
    // the worker took to parse it, a pen drew the previous trail's shape at the
    // new trail's progress. Row index is fixed, so this assignment is fixed too,
    // and it still derives from q alone, so seeking still lands correctly.
    // Strokes all last DRAW_Q and rows are ordered by start, so the active set
    // is always a short contiguous run and two of them cannot want one pen.
    const busy = new Set();
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r.draw) continue;
        const t = (q - r.start) / r.draw;
        if (t <= 0 || t >= 1) continue;
        const slot = i % pens.length;
        if (busy.has(slot)) continue;   // cannot happen with the enforced spacing; never corrupt two trails if it did
        busy.add(slot);
        penHold(map, pens[slot], r);
        penDraw(map, pens[slot], r, t, glow);
    }
    for (let p = 0; p < pens.length; p++) if (!busy.has(p)) penIdle(map, pens[p]);
}
const doneCount = (rows, q, from) => {
    let n = from;
    while (n < rows.length && q >= rows[n].start + rows[n].draw) n++;
    return n;
};

// Writing the same string back into the DOM on every one of 2,500 frames is a
// layout and a font match each time, for a line that changes exactly once in
// the film. It also deadlocks the offline renderer, whose screenshots wait for
// `document.fonts.ready` while its clock is stopped.
function setCredit(text) {
    if (creditEl.textContent !== text) creditEl.textContent = text;
}

// How much of the picture the LIVE layers own. In live mode, always all of it.
// In video mode the wash, the haze, the vignette and the first half of the
// cloud are all BAKED INTO THE VIDEO — drawing them again on top would double
// every one of them — so they stay off while the video is on screen and take
// over as it leaves.
//
// THE HANDOVER IS A CUT, NOT A CROSSFADE, and it has to be. Fading the video out
// while the live layers faded in put the SHEET on screen for the length of the
// fade: half way through, the video was at 50% and the live cloud was at 50%,
// and two half-opacity whites do not add up to one opaque one. The map flashed
// into view, the cloud then closed over it, and it faded back in again — exactly
// what Danny saw. **You cannot cross-fade a mask**: the thing hiding the swap
// was itself being dissolved through.
//
// So every live layer switches on at full strength in ONE frame at S4, and the
// video switches off in the same frame. That is only safe because of where S4
// sits — inside the cloud's full hold, where the live cloud's white base is at
// opacity 1 and the video's own baked frame is the same flat white. There is
// nothing in the picture at that instant for a cut to show up in.
function liveShare(q) {
    return (LIVE_FLIGHT || q >= S4) ? 1 : 0;
}

function renderAt(q) {
    // Which movement is playing. Free unless a host has asked for it.
    onStage(q >= S4 ? 'IV \u00b7 the country'
          : q >= S2 ? 'III \u00b7 into cloud'
          : (q / S2) < SPIRAL_END ? 'I \u00b7 the spiral' : 'II \u00b7 the Angeles');

    cameraAt(q);
    syncFilm(q);
    const live = liveShare(q);

    // Everything below is derived from q alone, outside the stage branches, so
    // ANY moment of the film renders correctly on its own. Deriving the reveal
    // inside a branch once meant that seeking straight to a later moment gave a
    // forest with no trails on it — wrong on its own terms, and it would have
    // quietly misled every screenshot taken to check it.
    //
    // Finished strokes go to the static layers; the ones still being written are
    // held by pens.
    setAnfLit(doneCount(SCHED.anf, q, 0));
    runPens(globe, gPens, SCHED.anf, q, true);

    if (q < S2) {
        // ---- I + II: one spiral, widening ----
        // The two movements are the same continuous motion. What changes at
        // SPIRAL_END is only that the rotation has finished; the zoom carries
        // straight on through without a gear change, which is why there is no
        // seam between "the trail" and "the forest".
        const u = clamp01(q / S2);
        // The centre HOLDS on the trail while the trail is the subject, and only
        // sets off for the forest once the orbit has finished (see cameraAt).
        // The ink writes itself over the orbit and is finished by the time the
        // whole trail is in frame — so the moment you can see all of it is the
        // moment it is all there.
        inkHero(clamp01((u - HERO_INK_START) / (HERO_INK_END - HERO_INK_START)));
    } else {
        // ---- III: the satellite HOLDS on its last frame. ----
        // There is no climb any more. The camera has arrived at the widest view
        // the imagery can carry, and it simply stays there while the cloud
        // closes over it; the journey continues on the sheet underneath.
        // Parked once rather than re-issued every frame — the values never
        // change, and a jumpTo still costs a move event and a repaint.
        inkHero(1);
    }

    washEl.style.opacity = 0.5 * WASH * live;
    vigEl.style.opacity = live;

    // ---- the aerial haze, which is the far distance ----
    // It thickens as the camera widens, because that is when the far band both
    // fills more of the frame and starts changing tile level under itself. It
    // is gone by the time the sheet arrives; the screen is white by then, so
    // nobody sees it leave.
    const haze = (q >= S4 || !LIVE_FLIGHT) ? 0
               : HAZE_K * smoother(clamp01((q - HAZE_IN) / (HAZE_FULL - HAZE_IN)));
    if (haze > 0 || hazeEl.style.opacity !== '0') hazeEl.style.opacity = haze;

    // ---- the cloud, which is the mask ----
    const cin = clamp01((q - CLOUD_IN) / (CLOUD_FULL - CLOUD_IN));
    const cout = clamp01((q - CLOUD_HOLD) / (CLOUD_OUT - CLOUD_HOLD));
    const cloud = Math.min(cin, 1 - cout);
    // Only touch the cloud while there IS a cloud. These three writes used to
    // run on every frame of the film, keeping three full-screen compositor
    // layers alive and moving through the entire flight for the sake of the last
    // third of it.
    if ((cloud > 0 && live > 0) || cloudsEl.classList.contains('on')) {
        cloudsEl.classList.toggle('on', cloud > 0);
        cloudsEl.style.opacity = live;   // the layers carry their own opacity; this is the handover

        // `through` runs 0 -> 1 across the whole cloud, in and out, so the decks
        // keep travelling the same way the whole time. Reversing them on the way
        // out would read as backing out of the cloud rather than emerging.
        const through = (cin + cout) / 2;
        PUFFS.forEach((p, i) => {
            const el = cloudsEl.children[i + 1];
            // each deck arrives in turn, rushes past, and is gone
            const t = clamp01((through - p.lead * 0.35) / (1 - p.lead * 0.35));
            const k = t * t * (3 - 2 * t);
            const sc = p.scale0 + (p.scale1 - p.scale0) * k;
            // opacity: swells as it approaches, thins as it sweeps past the lens
            const near = Math.sin(Math.PI * clamp01(t * 1.12));
            el.style.opacity = (0.30 + 0.70 * cin) * Math.min(1, near * 1.9) * (1 - cout * 0.55);
            el.style.transform =
                `translate3d(${p.dx * k * 46}%, ${p.dy * k * 46}%, 0) scale(${sc})`;
        });
        // The white base is the mask, and it is the LAST thing to arrive and the
        // first to leave: any earlier and it flattens the decks into the white
        // screen this was all meant to stop being.
        const base = clamp01((cin - 0.62) / 0.38) * (1 - clamp01(cout / 0.30));
        cloudsEl.children[0].style.opacity = base * base * (3 - 2 * base);
        cloudsEl.children[0].style.transform = `scale(${1.04 + cin * 0.16})`;
    }

    // ---- IV: behind the cloud, the sheet takes the zoom on ----
    // The single change that makes the film feel like one continuous move: the
    // widening does not stop and restart across the cut, it carries straight on
    // at the same job on a different surface. The sheet is already travelling
    // well before the cloud thins enough to show it — a veil that lifts onto a
    // STATIONARY map reads as a cut no matter how well the scales are matched.
    if (q >= S4) {
        // The sheet simply CONTINUES the ramp (see cameraAt). No easing of its
        // own, no catching up: the same curve the satellite was on, shifted by
        // the pitched-vs-flat offset — the zoom never learns the medium changed.
        atlasEl.style.opacity = 1;
        flightEl.style.opacity = LIVE_FLIGHT ? 1 - clamp01((q - S4) / 0.05) : 1 - live;
        // Starts at PRE_LIT, the trails the flight already inked, and grows on
        // the schedule — clock-paced, frame-gated, and each stroke drawn.
        setNatLit(doneCount(SCHED.nat, q, PRE_LIT));
        runPens(atlasMap, aPens, SCHED.nat, q, false);
        creditEl.classList.add('dark');
        setCredit('Terrain: Esri World Shaded Relief');
    } else {
        atlasEl.style.opacity = 0;
        flightEl.style.opacity = 1;
        setNatLit(PRE_LIT);
        runPens(atlasMap, aPens, SCHED.nat, -1, false);
        creditEl.classList.remove('dark');
        // Restored, not merely un-darkened. The credit used to be set on the
        // way INTO the sheet and never set back, so once the film had passed
        // this point once — which the boot's tile sweep does before a frame is
        // ever shown — the satellite flight ran under the sheet's credit and
        // the imagery it was actually showing went uncredited.
        setCredit('Imagery: Esri World Imagery · Terrain: Mapzen / AWS');
    }

    // ---- the trail name, and whether it should be there at all ----
    // Default OFF. The film's whole structure is a reveal — one trail, then a
    // forest, then a country, then the Atlas — and naming the trail in the
    // opening seconds hands over the answer before the question has been asked.
    // Worse, the name means nothing to the audience at that moment (nobody
    // watching knows this trail yet), so it reads as a label rather than as
    // information, and it spends the film's one text moment early, on the
    // caption, instead of late, on the title. ?mark=late and ?mark=early to
    // compare all three.
}

// ===== Warming the pull-back ================================================
// This is the fix for the patchiness. MapLibre swaps its ENTIRE tile pyramid at
// every zoom level, and the new level lands a tile at a time; Esri re-renders
// its imagery per level rather than resampling it, so for a second or two the
// picture is not merely half-sharp, it is half a different COLOUR. That is the
// "tiles loading in and out in different aesthetics" — six times over, once per
// level crossed.
//
// The answer is not to fetch less. It is to fetch EARLIER. The opening shot is
// fully loaded before the film starts and then holds for several seconds while
// the camera barely moves, so the network sits idle at precisely the moment the
// rest of the flight could be arriving. So the camera is swept along the film's
// own path once behind the boot screen, purely to note down which tiles it will
// ask for, and that exact list is then fetched at full speed just after the film
// begins. The fetches run ahead of the camera and every level is already in the
// browser's cache by the time it is needed.
//
// This is NOT the speculative prefetching tried and rejected in mockup A. That
// guessed at a corridor wider than the film used and nearly doubled the network.
// This list is the film's own requests, in the film's own order — the same
// bytes, moved earlier.
async function collectFlightTiles() {
    collecting = true;
    // ---- the flight ----
    // Sampled in q, because the flight's camera turns and pitches as well as
    // widening, and no single variable stands in for where it is looking. In
    // video mode this fetches NOTHING (measured: the hidden globe requests not
    // one tile), so it is skipped outright and the whole budget goes to the
    // sheet, which is the only thing still live.
    if (LIVE_FLIGHT) {
        const N = 24;
        for (let i = 0; i <= N; i++) {
            renderAt(i / N * S2);
            // two frames per step: jumpTo only marks the map dirty, and MapLibre
            // decides what to load on ITS next render, not on the call
            await new Promise(r => setTimeout(r, 32));
        }
    }
    // ---- the sheet ----
    // Sampled in ZOOM, not in q, and that is the whole fix for the flicker Danny
    // reported. Stepping the sheet in equal slices of q under-samples it exactly
    // where the ramp is fastest: 17 samples were covering 5.6 zoom levels, so
    // between two of them the camera crossed a level and a whole band of tiles
    // was never asked for. Measured: **111 of the 443 tiles the sheet really
    // wants, 25%, were missing from the warm list** — spread across z6 to z11,
    // which is precisely where the picture was arriving unresolved.
    //
    // The sheet's camera is a pure function of its zoom (`setAtlasView`), so
    // walking the zoom evenly walks the picture evenly, and no level can be
    // stepped over however the ramp is retuned.
    const ZSTEP = 0.08;
    for (let z = atlasStart.zoom; z >= atlasEnd.zoom - 1e-6; z -= ZSTEP) {
        setAtlasView(Math.max(z, atlasEnd.zoom));
        await new Promise(r => setTimeout(r, 32));
    }
    renderAt(0);
    collecting = false;
}

let warmed = new URLSearchParams(location.search).get('warm') === '0';  // ?warm=0 to A/B it
// Returns a promise so the offline renderer can WAIT for the whole film's tiles
// to be in the browser cache before it starts baking frames. In the live film
// nothing awaits this — it is fire-and-forget by design.
let warmDone = 0;
function warmFlight() {
    if (warmed) return Promise.resolve();
    warmed = true;
    let i = 0;
    // Four in parallel, not all of them: the browser allows six per host, and
    // the film still needs a lane of its own for whatever it is looking at now.
    const pull = async () => {
        while (i < flightUrls.length) {
            // mode/credentials stated explicitly so these land in the SAME
            // cache partition MapLibre reads from. The DEM host answers with
            // `Vary: Origin`, so a warm request shaped differently from the
            // real one can leave an entry the real one then refuses, which
            // surfaces as a bogus CORS failure on a tile that is sitting right
            // there in the cache.
            try {
                // A warm lane must never be able to stall. One tile server
                // holding a connection open would otherwise park a quarter of
                // the warm for as long as the page is alive — invisible in the
                // live film, but it hangs the renderer, which waits for this.
                await (await fetch(flightUrls[i++],
                    { mode: 'cors', credentials: 'same-origin',
                      signal: AbortSignal.timeout(20000) })).arrayBuffer();
            } catch (e) { /* a warmed tile is a bonus, never a requirement */ }
            warmDone++;
        }
    };
    return Promise.all(Array.from({ length: 4 }, pull));
}

// ===== The clock, and why the PICTURE holds it ==============================
// q used to come from the wall clock alone, with syncFilm dragging the video
// along behind it. On hardware decode that correction never fires; on a machine
// that is behind it fires constantly and makes things worse (see syncFilm).
//
// So the video is the clock while the video IS the picture. The ink, the cloud
// and the camera are derived from whatever the decoder actually managed to show,
// which means the two can no longer disagree and there is nothing left to
// correct. A slow machine plays a slightly slow film in perfect step with
// itself. That is a graceful failure; the old one was not.
//
// Two details make it safe.
//
//   · currentTime only moves when a frame is PRESENTED, at 30fps, so reading it
//     raw would step the live layers at 30fps as well. The wall clock carries q
//     forward between those ticks, capped at one frame of lead, so the animation
//     still runs at the display's full rate while staying anchored to the film.
//
//   · if the picture never arrives — autoplay refused, a decode error, a file
//     that failed — nothing would ever advance and the film would sit at black
//     forever. So a picture that has not moved for STALL_MS hands back to the
//     wall clock, re-anchored to where it actually got to so q never jumps.
//     The threshold is generous because a real decoder that is merely SLOW still
//     ticks every 40 or 50 ms, and that case must ride, not trip the guard.
const VIDEO_FRAME_MS = 1000 / 30;
const STALL_MS = 2500;
let vClockT = -1, vClockAt = 0, vClockOn = false;

function filmQ(now) {
    if (!vClockOn) return (now - t0) / D;
    const secs = D / 1000;
    const ct = filmEl.currentTime;
    if (ct !== vClockT) { vClockT = ct; vClockAt = now; }
    const still = now - vClockAt;
    const ended = filmEl.ended || filmEl.error
        || (filmEl.duration && ct >= filmEl.duration - 0.05);
    if (ended || still > STALL_MS) {
        // Hand the clock back without moving the picture.
        vClockOn = false;
        t0 = now - (ct / secs) * D;
        return ct / secs;
    }
    return (ct + Math.min(still, VIDEO_FRAME_MS) / 1000) / secs;
}

function frame(now) {
    onFrame(now);                      // the cutting room's instruments, if any
    const q = Math.min(1, filmQ(now));
    renderAt(q);
    if (q < 1) raf = requestAnimationFrame(frame); else land();
}

function land(animated) {
    running = false;
    vClockOn = false;
    if (!LIVE_FLIGHT) filmEl.pause();
    // Did this machine cope with the cut it was sent? The only honest way to
    // know is to have watched. A showing that dropped more than a tenth of its
    // frames buys a smaller cut next visit (see introDemotion). Guarded on a
    // real sample so a Skip, which lands after a handful of frames, says nothing.
    if (!LIVE_FLIGHT && filmEl.getVideoPlaybackQuality) {
        const seen = filmEl.getVideoPlaybackQuality();
        if (seen.totalVideoFrames > 60
            && seen.droppedVideoFrames / seen.totalVideoFrames > 0.10) noteStruggle();
    }
    // The title's own ink-on goes FIRST, before any of the heavier landing work
    // below. `renderAt(1)` repaints the whole sheet at its final state and
    // `setNatLit` restyles every trail on it — real work, right on the frame
    // the title's clip-path transition needs to start cleanly on. Letting the
    // title's class change land on its own tick first, THEN doing the rest,
    // means the transition is never competing with the heaviest paint of the
    // whole film for the one frame that mattered most.
    // `no-anim` first, or a repeat visit watches the name write itself onto a
    // sheet it never saw arrive — a flourish with nothing behind it.
    titleEl.classList.toggle('no-anim', animated === false);
    titleEl.classList.add('show');
    renderAt(1);
    atlasEl.style.opacity = 1; flightEl.style.opacity = 0;
    cloudsEl.style.opacity = 0;
    setNatLit(natOrder.length);
    // The plates come last of all, onto a sheet that has stopped moving.
    revealPlates(animated !== false);
    if (hintEl) hintEl.classList.add('show');
    if (btn) btn.textContent = '\u21bb Replay';
    // The film has had its turn this session. A later Escape is a no-op, and a
    // second page load lands straight on the finished sheet.
    try { sessionStorage.setItem('introShown', 'true'); } catch (e) { /* private mode */ }
    if (Intro) {
        Intro.skipped = true;
        // The nav's loading phrases are timed to the FILM, not to a number
        // copied out of it — so the film says when it is done and the nav
        // answers. Retuning the film's length can no longer leave the nav
        // arriving in the middle of it.
        if (Intro.landed) Intro.landed();
    }
}

function run() {
    cancelAnimationFrame(raf);
    running = true;
    if (btn) btn.textContent = 'Skip';
    titleEl.classList.remove('show', 'no-anim');
    // Forces the removal above to actually commit to layout before anything
    // else runs, so there is no way for the browser to coalesce it with the
    // class add ~42s from now at land() and skip the transition entirely.
    // Belt and suspenders — the two are already far enough apart in time not
    // to need this — but it costs nothing and removes the possibility outright.
    void titleEl.offsetWidth;
    if (hintEl) hintEl.classList.remove('show');
    hidePlates();
    setNatLit(PRE_LIT); setAnfLit(0);
    t0 = performance.now();
    // Hand the clock to the picture. vClockT starts at -1 so the first read
    // anchors even though currentTime is legitimately 0.
    vClockT = -1; vClockAt = t0; vClockOn = !LIVE_FLIGHT;
    if (!LIVE_FLIGHT) { filmEl.currentTime = 0; filmEl.play().catch(() => {}); }
    raf = requestAnimationFrame(frame);
    // A beat after the film opens, not with it: the first seconds are already
    // loaded, so this way the warm never competes with the shot on screen.
    setTimeout(warmFlight, 1200);   // in video mode this is the sheet's tiles alone
}

// The one button, two jobs, and the same rule the old film had: only the button
// skips, never a click on the map itself (Danny's call — no accidental skips).
let arming = false;
// Replay has to be able to do what the first load did. After a REPEAT visit the
// film was deliberately never fetched — that is the whole saving — so pressing
// Replay used to start the clock against an empty <video> element and the
// flight simply was not there. And even when it had been fetched, replaying
// straight away could catch a partially decoded file, which is the stutter
// Danny saw on the second watch. So Replay puts the plate back up and waits,
// exactly as the first load does; if everything is already in memory that wait
// is a few hundred milliseconds and the plate barely registers.
async function replay() {
    if (arming) return;
    arming = true;
    if (btn) btn.textContent = 'Skip';
    try {
        const held = !LIVE_FLIGHT && filmEl.readyState >= 3 && filmPromise;
        if (!held) {
            showCover('Preparing the plate');
            await Promise.race([loadFilm(), new Promise(r => setTimeout(r, 45000))]);
            aim(1);
            await new Promise(r => setTimeout(r, 420));
            liftCover();
            await new Promise(r => setTimeout(r, 500));
        }
        run();
    } finally { arming = false; }
}

if (btn) btn.addEventListener('click', () => {
    if (!running) { replay(); return; }               // it reads "Replay"
    cancelAnimationFrame(raf);
    // First run, the nav's loading phrases are still going: one skip lands the
    // whole page at once, film and nav together. A replay is the film alone.
    if (Intro && !Intro.skipped) Intro.skip();
    else land();
});
const seek = q => {
    cancelAnimationFrame(raf); running = false; renderAt(clamp01(q));
    // Seeking to the very end is standing on the landed sheet, so the plates
    // belong there — laid, not animated, because nothing led up to it.
    if (q >= 1) { setNatLit(natOrder.length); revealPlates(false); } else hidePlates();
};
const DBG = { S2, S4, D, Z_OFFSET, Z_SPAN, PRE_LIT, HANDOFF_Z, PITCH0, SWEEP,
                 INKED_IDS: SCHED.inked, sheetZoom, FILM,
                 CLOUD_IN, CLOUD_FULL, CLOUD_HOLD, CLOUD_OUT,
                 zoomOf, ease, natOrder, atlasStart, atlasEnd, SCHED, DRAW_Q, DOT_Z,
                 anfCentroid, natCentroid, SHROUD_IN, SHROUD_OUT };

// ===== What the film offers the page it stands in ==========================
// One object, published once. `tools/render-intro.py` drives the film through
// `warm` / `quiet` / `settle` / `dress` and nothing else — the renderer must
// never own a copy of the choreography, or the video and the live map would
// drift apart the first time a beat is retuned.
const API = {
    // the whole film's tiles into the browser cache, awaitable
    warm: () => warmFlight(),
    warmProgress: () => [warmDone, flightUrls.length],
    // Are both maps quiet, answered SYNCHRONOUSLY. The renderer runs the page
    // on a virtual clock that is frozen between frames, and a frozen clock
    // means no requestAnimationFrame — so anything that waits for a frame in
    // order to answer simply never answers.
    quiet: () => globe.loaded() && globe.areTilesLoaded() &&
                 atlasMap.loaded() && atlasMap.areTilesLoaded(),
    // The same question asked the patient way, for the real-time fallback:
    // both maps quiet and two frames actually presented, because `loaded()`
    // can be true while the last raster is still being uploaded and a
    // screenshot taken then catches the frame before the one we asked for.
    settle: maxMs => new Promise(res => {
        const t0 = performance.now();
        const check = () => {
            const quiet = globe.loaded() && globe.areTilesLoaded() &&
                          atlasMap.loaded() && atlasMap.areTilesLoaded();
            if (quiet || performance.now() - t0 > maxMs)
                requestAnimationFrame(() => requestAnimationFrame(() => res(quiet)));
            else requestAnimationFrame(check);
        };
        check();
    }),
    // Instruments and buttons are for judging the film, never for being in it.
    // The imagery credit is a condition of using Esri's tiles, so it is a flag,
    // not a default — dropping it is a decision, not a tidy-up.
    dress: ({ credit = true } = {}) => {
        if (btn) btn.style.display = 'none';
        if (hintEl) hintEl.style.display = 'none';
        if (!credit && creditEl) creditEl.style.display = 'none';
        onDress();                     // the host strips its own furniture
    },
    duration: D,
    // Resolves once the film is loaded, warmed and standing on its first frame.
    ready,
    // The cutting room's instruments hang off these; the homepage sets none.
    onFrame: fn => { onFrame = fn; },
    onStage: fn => { onStage = fn; },
    onDress: fn => { onDress = fn; },
    // the choreography's own numbers, for the measuring harness
    dbg: DBG, globe, atlas: atlasMap, seek, play: run, land,
    anfFeats: anfFC.features, flightUrls
};
PUBLISH(API);


// Note down the whole flight's tiles first (invisible — the boot sheet is
// opaque), THEN let the opening shot settle. This order matters: the sweep ends
// back at q=0, so the wait below is waiting for exactly the frame about to be
// shown.
// The flight's tiles only exist to be flown through live. In video mode the
// only live surface left is the Atlas sheet, and it is warmed by the same sweep.
phase(0.22, 0.42, 11000);     // the tile sweep, which reports nothing
await collectFlightTiles();

// ---- THE WHOLE FILM, not `canplaythrough` --------------------------------
// See loadFilm(): fetched in full rather than streamed, because Chrome will not
// finish downloading a paused video and `canplaythrough` is only its optimistic
// guess. A repeat visit skips this entirely and never spends the bytes; the
// Replay button calls loadFilm() itself if it finds nothing loaded.
// The film itself. Its read loop reports honestly and will normally outrun
// this creep by a long way; the creep is only here so a stalled download still
// looks like a page that is working rather than one that has died.
phase(0.42, 0.86, 26000);
if (!FAST_FORWARD) await Promise.race([loadFilm(), new Promise(r => setTimeout(r, 45000))]);

// Give the first shot's imagery and terrain a moment to land before opening,
// so the film never starts on grey tiles. This wait can be several seconds and
// reports NOTHING — it is where the ring used to sit motionless at 96% for 8
// seconds (measured), which is exactly the stall Danny saw. So it gets a creep
// of its own rather than a number that arrives and then waits.
phase(0.90, 0.995, 3500);
await new Promise(res => {
    let done = false;
    const go = () => { if (!done) { done = true; res(); } };
    // ASK FIRST, then listen. `once('idle')` only fires on the NEXT settle, and
    // by this point the map has usually settled already — so the film sat here
    // for the full nine-second timeout on every single load (measured: 9s of a
    // 13s boot). And it must be the map that will actually be SEEN: in video
    // mode the globe is hidden and requests nothing, so waiting on it was
    // waiting on a surface nobody was going to look at.
    const m = LIVE_FLIGHT ? globe : atlasMap;
    if (m.loaded() && m.areTilesLoaded()) go();
    else { m.once('idle', go); setTimeout(go, 9000); }
});
stopCreep();
aim(1);

// ===== Ready, and who decides what happens next ============================
// The film does NOT start itself. It says it is ready and hands over, because
// which of these is right depends on the page it is standing in:
//
//   the home page   waits for the nav's loading phrases and starts both
//                   together, or skips straight to the landed sheet on a
//                   repeat visit
//   the cutting room / the renderer   drives it frame by frame
//
// `?q=` parks the film at a moment (the renderer's hook, and how every
// screenshot in this project was taken); `?p=` is the same thing under the name
// the old SVG film used, kept so existing links and notes still work.
const parked = new URLSearchParams(location.search).get('q')
            ?? new URLSearchParams(location.search).get('p');

// Straight to the finished sheet, with nothing animating: a repeat visit this
// session, or a visitor whose system asks for reduced motion. index.html sets
// that class before first paint, precisely so this decision costs no flicker.
function finishInstantly() {
    cancelAnimationFrame(raf);
    running = false;
    if (!LIVE_FLIGHT) filmEl.pause();
    seek(1);
    land(false);
}

if (parked !== null) {
    seek(+parked);
    liftCover();
} else if (FAST_FORWARD) {
    // Land FIRST, lift the cover second, and that order is the whole fix for
    // "coming back to the home page shows frames from the animation then gets
    // to the final live map frame". It was not landing late — it was landing
    // correctly, in full view, after the boot's own tile sweep had already
    // scrubbed the video across the screen. Nothing may be visible until the
    // final frame is the frame on the stage.
    finishInstantly();
    liftCover();
} else if (Intro) {
    // A skip from anywhere — the button, Escape, the nav — lands the film too.
    Intro.onSkip(finishInstantly);
    // The cover lifts onto the film's own first frame, then a beat, then it
    // moves — so the opening is a held shot rather than a cut into motion.
    liftCover();
    if (!Intro.skipped) Intro.schedule(run, 900);
} else {
    liftCover();
    run();          // the cutting room, which has no intro to coordinate with
}
READY({ parked: parked !== null });
// ===== Published, and handed over ==========================================
window.AtlasFilm = API;
// The cutting room and the renderer know the film by these names; keeping them
// means tools/render-intro.py and every measuring script in the project carry on
// working against the same object the homepage uses.
window.__film = API; window.__seek = seek; window.__dbg = DBG;
window.__globe = globe; window.__atlas = atlasMap;
window.__anfFeats = anfFC.features; window.__flightUrls = flightUrls;

})().catch(err => {
    // The film is decoration laid over the data. If anything in it fails —
    // WebGL refused, a fetch died, Cloudinary unreachable — the page must still
    // be a homepage: parchment, the title, and everything below it working.
    console.error('The intro film failed to start:', err);
    const host = document.getElementById('hero-film');
    if (host) {
        host.classList.add('film-failed');
        const t = host.querySelector('.hero-title');
        if (t) t.classList.add('show');
        const h = host.querySelector('.scroll-hint');
        if (h) h.classList.add('show');
        const b = host.querySelector('.film-btn');
        if (b) b.style.display = 'none';
    }
    if (typeof AtlasIntro !== 'undefined') AtlasIntro.skip();
});
