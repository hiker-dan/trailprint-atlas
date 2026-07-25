/**
 * Homepage script for The Trailprint Atlas.
 * Owns "The Life in Trails" hero film (the Atlas draws itself, from home
 * ground out to the whole country), the Odometer stats reels, and the nav
 * loading-bar intro sequence. (July 2026 home redesign: the film + Odometer
 * replaced the old showcase-map intro and key-stats dashboard; Echoes moved
 * to echoes.html earlier in the redesign.)
 * Requires Leaflet (projection only — no tiles), config.js, atlas-data.js.
 *
 * (The tiny sessionStorage/reduced-motion fast-forward check stays inline in
 * index.html — it must run before first paint to prevent intro flicker.)
 */

// ===== Intro skip coordination =====
// The first visit plays two parallel timed sequences: the hero film and the
// nav loading-bar. Both register their pending timers and a "jump to the end"
// finisher here, so a single skip() cancels everything still pending and
// lands on the finished homepage at once.
const AtlasIntro = {
    timeouts: [],
    finishers: [],
    skipped: false,
    // Use for every intro timer so skip() can cancel whatever hasn't fired.
    schedule(fn, delay) {
        const id = setTimeout(fn, delay);
        this.timeouts.push(id);
        return id;
    },
    // Register a "snap to final state" callback for one sequence.
    onSkip(fn) { this.finishers.push(fn); },
    skip() {
        if (this.skipped) return; // idempotent — natural completion also flips this
        this.skipped = true;
        this.timeouts.forEach(clearTimeout);
        document.documentElement.classList.add('intro-fast-forward');
        sessionStorage.setItem('introShown', 'true');
        this.finishers.forEach(fn => {
            try { fn(); } catch (e) { console.error('intro skip finisher failed:', e); }
        });
    }
};

// ===== The Life in Trails: the hero film =====
// One SVG map, built once from every trail's real geometry. The camera opens
// deep over home ground (the densest cluster of trailheads) and pulls back to
// the whole country over ~20s while the trails draw themselves in year
// colours, nearest-to-home first. The zoom is driven by the SVG's viewBox:
// viewBox re-renders the vectors crisply every frame, whereas an ANIMATED
// transform gets promoted to a GPU layer — Chrome snapshots the pixels once
// and stretches that picture, which blurs the whole opening. Stroke widths
// counter-scale via --z so line weight stays constant on screen, and the
// dash-based draw-on animation keeps working in map units.
(async function () {
    const btn = document.getElementById('film-btn');
    const heroTitle = document.getElementById('hero-title');
    const scrollHint = document.getElementById('scroll-hint');
    try {
        const yearColor = y => ATLAS_CONFIG.COLOR_MAP[String(y)] || ATLAS_CONFIG.DEFAULT_COLOR;

        // Everything starts fetching at once — the film begins the moment the
        // vector data lands; the terrain fades in beneath it when ready.
        const statesPromise = Promise.race([
            fetch('https://cdn.jsdelivr.net/gh/PublicaMundi/MappingAPI@master/data/geojson/us-states.json').then(r => r.ok ? r.json() : null).catch(() => null),
            new Promise(res => setTimeout(() => res(null), 2500))
        ]);
        const [hikes, trailsById] = await Promise.all([fetchHikes(), fetchTrailGeometries()]);
        // The outlines are wanted BEFORE the map is framed now (the inset plates
        // are cut from them), and they were already racing a 2.5s cap alongside
        // the data fetch — so awaiting here costs nothing the film would notice.
        const statesGeo = await statesPromise;

        const yearOf = {};
        hikes.forEach(h => { yearOf[h.trail_id] = hikeYear(h); });

        // ===== Inset plates: the atlas answer to far-flung country =====
        // Alaska sits too far north-west to share one frame with the lower 48 —
        // stretched to hold it, the continental map shrivels into a corner and
        // the whole film opens off-balance. Real atlases have solved this for a
        // century: distant land gets its own framed plate at its own scale.
        // A plate is CHROME, not land — it never rides the camera's zoom, and it
        // is laid on the sheet only once the camera has come to rest.
        // Hawaii's plate is RESERVED: cut and labelled but unwalked, so the pair
        // reads as a deliberate row (and Alaska keeps its spot the day it inks).
        const PLATE_DEFS = [
            {
                key: 'alaska', label: 'Alaska', state: 'Alaska', corner: 'se',
                holds: (la, lo) => la > 51 && lo < -129,
                // the Aleutians run another 1,200 miles west; dropping them keeps
                // the plate compact and the mainland readable, as most plates do
                keepRing: r => r.some(c => c[0] > -170)
            },
            {
                key: 'hawaii', label: 'Hawaii', state: 'Hawaii', reserved: true, corner: 'sw',
                holds: (la, lo) => la > 18 && la < 23 && lo > -161 && lo < -154,
                keepRing: () => true
            }
        ];
        PLATE_DEFS.forEach(pd => { pd.ids = []; });
        const mainIds = [];
        Object.keys(trailsById).forEach(id => {
            const first = trailsById[id] && trailsById[id][0] && trailsById[id][0][0];
            const pd = first && PLATE_DEFS.find(p => p.holds(first[0], first[1]));
            if (pd) pd.ids.push(id); else mainIds.push(id);
        });

        // Leaflet is here ONLY to project lat/lng → pixels (no tiles, no layers).
        const map = L.map('hero-map', {
            zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false,
            doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, zoomSnap: 0
        });

        // Bounds of every CONTINENTAL trail — the plate country is deliberately
        // excluded, which is the whole point: the film frames the lower 48 at
        // its widest instead of being dragged north-west by Alaska. Padded for
        // breathing room (future coast / Cascades / Canada trips) and so the
        // mid-zoom never sees past an unbuilt edge.
        const allBounds = L.latLngBounds([]);
        mainIds.forEach(id => trailsById[id].forEach(seg => seg.forEach(ll => allBounds.extend(ll))));
        // 0.18, down from 0.32: that generous margin was breathing room when
        // Alaska was in the bounds and everything continental sat small in one
        // corner. On a lower-48 frame it just read as empty ocean.
        map.fitBounds(allBounds.pad(0.18), { animate: false });

        // Full-precision projection (project() is float; latLngToContainerPoint rounds).
        const Z = map.getZoom(), sz = map.getSize(), W = sz.x, H = sz.y;
        const ctr = map.project(map.getCenter(), Z);
        const cont = ll => { const p = map.project(ll, Z); return [p.x - ctr.x + W / 2, p.y - ctr.y + H / 2]; };

        const SVGNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(SVGNS, 'svg');
        svg.id = 'map-svg'; svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        // COVER the hero, never letterbox it: if the hero's final height settles
        // a few px after Leaflet measured it, the mismatch becomes a hairline
        // crop at the edges instead of visible bars above and below the map.
        svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        const zoomG = document.createElementNS(SVGNS, 'g');
        svg.appendChild(zoomG);

        // State outlines (behind the trails) fill their group whenever the fetch
        // lands — never blocking the film; at the deep opening no border is in
        // frame anyway. Continental only: Alaska's islands otherwise poke
        // slivers into the corner of the final frame.
        const statesG = document.createElementNS(SVGNS, 'g');
        zoomG.appendChild(statesG);
        if (statesGeo) {
            const ring = r => { let d = ''; r.forEach((c, i) => { const [x, y] = cont([c[1], c[0]]); d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2) + ' '; }); return d + 'Z '; };
            statesGeo.features.filter(f => !['Alaska', 'Hawaii', 'Puerto Rico'].includes(f.properties && f.properties.name)).forEach(f => {
                const g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
                let d = ''; polys.forEach(poly => poly.forEach(r => d += ring(r)));
                const path = document.createElementNS(SVGNS, 'path');
                path.setAttribute('d', d); path.setAttribute('class', 'state-line');
                statesG.appendChild(path);
            });
        }

        // Trails on top. Coordinates keep 3 decimals: the deep opening zoom
        // (~×130) magnifies any quantization — 0.1px rounding would read as
        // staircases. Each trail also gets a halo twin in a group UNDER all the
        // cores, so one trail's glow never washes over a neighbour's line.
        const haloG = document.createElementNS(SVGNS, 'g');
        haloG.style.opacity = '0';
        const trailsG = document.createElementNS(SVGNS, 'g');
        zoomG.appendChild(haloG); zoomG.appendChild(trailsG);
        const items = [];
        mainIds.forEach(id => {
            let d = '', minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
            trailsById[id].forEach(seg => seg.forEach((ll, i) => {
                const [x, y] = cont(ll);
                d += (i === 0 ? 'M' : 'L') + x.toFixed(3) + ',' + y.toFixed(3) + ' ';
                if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
            }));
            const color = yearColor(yearOf[id] || 2022);
            const halo = document.createElementNS(SVGNS, 'path');
            halo.setAttribute('d', d); halo.setAttribute('class', 'trail-halo');
            halo.setAttribute('stroke', color);
            haloG.appendChild(halo);
            const path = document.createElementNS(SVGNS, 'path');
            path.setAttribute('d', d); path.setAttribute('class', 'trail-line');
            path.setAttribute('stroke', color);
            trailsG.appendChild(path);
            // `parts` = every stroke that draws as one: a continental trail has a
            // line and its halo twin; a plate trail is just the line.
            items.push({ p: path, h: halo, parts: [path, halo], cx: (minx + maxx) / 2, cy: (miny + maxy) / 2, bb: [minx, miny, maxx, maxy] });
        });
        document.getElementById('hero-film').insertBefore(svg, document.querySelector('.hero-vig'));
        items.forEach(o => { o.len = o.p.getTotalLength(); });

        // Home ground = the tight core of the densest cluster. A small radius
        // keeps distinct clusters from blurring together, and framing only the
        // nearest few trails opens the film genuinely close — you can see the
        // trails wind. Frame their actual GEOMETRY, not their centres: a whole
        // trail is only ~2px at country scale, so centring maths alone would
        // say "zero size" for a stack of repeat visits and never zoom in.
        const Rpx = Math.min(W, H) * 0.02;
        let hub = items[0], best = -1;
        items.forEach(o => { const n = items.reduce((k, p) => k + (Math.hypot(o.cx - p.cx, o.cy - p.cy) <= Rpx ? 1 : 0), 0); if (n > best) { best = n; hub = o; } });
        const near = [...items].sort((a, b) => Math.hypot(a.cx - hub.cx, a.cy - hub.cy) - Math.hypot(b.cx - hub.cx, b.cy - hub.cy)).slice(0, 4);
        let hxmin = Infinity, hymin = Infinity, hxmax = -Infinity, hymax = -Infinity;
        near.forEach(o => { hxmin = Math.min(hxmin, o.bb[0]); hxmax = Math.max(hxmax, o.bb[2]); hymin = Math.min(hymin, o.bb[1]); hymax = Math.max(hymax, o.bb[3]); });
        const hc = { x: (hxmin + hxmax) / 2, y: (hymin + hymax) / 2 };
        const homeW = Math.max(3, hxmax - hxmin), homeH = Math.max(3, hymax - hymin);
        const S0 = Math.max(2.4, Math.min(Math.min(W / homeW, H / homeH) * 0.62, 170));

        // One holder per bottom corner: the plates are anchored opposite each
        // other, not huddled in a row — a pair of matching corner mounts reads
        // as a deliberate sheet layout, and neither can crowd the other.
        const PLATE_MAX_W = 150, PLATE_MAX_H = 136;
        const plateHolders = {};
        ['sw', 'se'].forEach(c => {
            const el = document.createElement('div');
            el.className = 'inset-plates ' + c;
            el.id = 'inset-plates-' + c;
            plateHolders[c] = el;
        });

        // ---- The terrain underlay ----
        // Static rings of Esri Shaded Relief tiles — pure landform shadow, no
        // labels or roads — placed ONCE as SVG images in map coordinates, so
        // they ride the viewBox zoom with zero mid-animation tile loading. A
        // warm tint + parchment wash fold them into the Atlas's palette. The
        // film does NOT wait for any of this: trails start drawing on bare
        // parchment as soon as the vector data lands, and the terrain fades in
        // beneath them once its home-ground imagery is ready.
        const terrainG = document.createElementNS(SVGNS, 'g');
        terrainG.style.opacity = '0';
        terrainG.style.transition = 'opacity 1.4s ease';
        terrainG.style.isolation = 'isolate';   // keep the tint's multiply inside this group
        const wash = document.createElementNS(SVGNS, 'rect');
        wash.setAttribute('x', -8000); wash.setAttribute('y', -8000);
        wash.setAttribute('width', 30000); wash.setAttribute('height', 30000);
        wash.setAttribute('fill', '#ece3ce'); wash.setAttribute('fill-opacity', '0.38');
        zoomG.insertBefore(wash, zoomG.firstChild);
        zoomG.insertBefore(terrainG, wash);

        const inv = (x, y) => map.unproject(L.point(x + ctr.x - W / 2, y + ctr.y - H / 2), Z);
        // Esri renders relief LIGHTER at higher zooms, so a fine ring reads as a
        // brighter rectangle wherever its edge is on screen. Each fading ring
        // therefore dissolves just before the camera widens past it (edge scale
        // e = the S at which the ring stops filling the frame); setView drives
        // the opacities. The country base never fades.
        const rings = [];
        function addTiles(z, x0px, y0px, x1px, y1px, bucket, fades) {
            const g = document.createElementNS(SVGNS, 'g');
            terrainG.appendChild(g);
            const nw = map.project(inv(x0px, y0px), z), se = map.project(inv(x1px, y1px), z);
            const tx0 = Math.floor(nw.x / 256), tx1 = Math.floor(se.x / 256);
            const ty0 = Math.floor(nw.y / 256), ty1 = Math.floor(se.y / 256);
            for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) {
                const a = cont(map.unproject(L.point(tx * 256, ty * 256), z));
                const b = cont(map.unproject(L.point((tx + 1) * 256, (ty + 1) * 256), z));
                const img = document.createElementNS(SVGNS, 'image');
                const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/${z}/${ty}/${tx}`;
                // href is set later by arm() — bucket by bucket — so the handful
                // of opening-frame tiles never queue behind 200+ background ones.
                img.setAttribute('x', a[0]); img.setAttribute('y', a[1]);
                // 1% bleed: neighbours overlap a hair so antialiasing at
                // fractional scales can't open white seams between tiles (the
                // imagery is continuous, so the overlap itself is invisible).
                img.setAttribute('width', (b[0] - a[0]) * 1.01);
                img.setAttribute('height', (b[1] - a[1]) * 1.01);
                img.setAttribute('preserveAspectRatio', 'none');
                g.appendChild(img); bucket.push({ img, url });
            }
            if (fades) rings.push({ g, e: W / (x1px - x0px) });
        }
        // Ring buckets: homeUrls holds ONLY the opening-frame tiles (the finest
        // ring) — the film's start gates on them alone. Everything wider loads
        // behind the camera, covered by finer rings until the pull-back
        // reveals it, and starts fetching only after home ground is in.
        const bgUrls = [], homeUrls = [];
        // The country ring covers the FINAL VIEW rect ([0,0,W,H] in map space,
        // since the viewBox lands on exactly that) — not the trail bounds — so
        // any viewport shape ends fully covered, with no bare-parchment bands.
        addTiles(5, -60, -60, W + 60, H + 60, bgUrls, false);                                          // the country
        // A ladder of rings around home, ONE zoom step apart, each sized a hair
        // past its own native view and dissolved as its edge nears the frame.
        // The step size is the point: when a ring dissolves, the ring beneath is
        // never more than ~2× upscaled — invisible — whereas a wide gap (say
        // z11 straight to z8) drops 8× and reads as a sudden blur-in. Coarse
        // rings first so finer imagery always stacks on top.
        for (let z = 6; z <= 11; z++) {
            const nat = Math.pow(2, z - Z);                       // scale at which ring z is 1:1
            const hw = (W / nat) * 0.575, hh = (H / nat) * 0.575; // 1.15× its native view
            addTiles(z, hc.x - hw, hc.y - hh, hc.x + hw, hc.y + hh, bgUrls, true);
        }
        // The finest ring covers just the opening view at native resolution, so
        // the very first frames are sharp too. (Skipped for a shallow opening —
        // the ladder is already native there.)
        if (S0 > 48) {
            const rw = (W / S0) * 0.65, rh = (H / S0) * 0.65;
            addTiles(12, hc.x - rw, hc.y - rh, hc.x + rw, hc.y + rh, homeUrls, true);                  // opening frame
        }
        // A warm tint multiplied over the grayscale relief keeps it in the
        // Atlas's earthy palette. It lives inside terrainG so it fades in too.
        const tint = document.createElementNS(SVGNS, 'rect');
        tint.setAttribute('x', -8000); tint.setAttribute('y', -8000);
        tint.setAttribute('width', 30000); tint.setAttribute('height', 30000);
        tint.setAttribute('fill', '#d9c8a0'); tint.setAttribute('fill-opacity', '0.55');
        tint.style.mixBlendMode = 'multiply';
        terrainG.appendChild(tint);
        const arm = list => list.forEach(t => t.img.setAttribute('href', t.url));
        const loadAll = list => Promise.all(list.map(t => new Promise(res => { const im = new Image(); im.onload = im.onerror = () => res(); im.src = t.url; })));
        // The film itself waits only for the OPENING-FRAME imagery (capped —
        // parchment beats stalling), so a cold first load never draws trails
        // onto a map that hasn't appeared, yet starts as soon as those few
        // tiles land. The 200+ background tiles begin fetching only after,
        // with the whole ~20s of hold + glide to arrive before they're seen.
        arm(homeUrls);
        const homeReady = Promise.race([loadAll(homeUrls), new Promise(res => setTimeout(res, 4000))]);
        homeReady.then(() => {
            terrainG.style.opacity = '1';
            arm(bgUrls); loadAll(bgUrls);
        });

        // The zoom eases along a back-loaded sigmoid: a long tight hold over
        // home ground while its trails draw, a late accelerating pull-back,
        // then a soft brake into the final frame (stopping at full speed reads
        // as a slap). The camera is ANCHORED to home ground: hc stays pinned to
        // a screen point that glides from centre to its natural spot in the
        // final frame, so home is on screen at every instant — the country
        // reveals itself AROUND it, and no zoom/pan combination can ever show
        // an empty frame. The glide starts and ends at rest: no hard turns.
        // Heavily back-loaded: an almost imperceptible drift after the hold, a
        // long gradual glide, then the fast full pull-back arrives late — with
        // just enough brake at the very end that the landing doesn't slap.
        const sig = (u, a, b) => { const p = Math.pow(u, a), q = Math.pow(1 - u, b); return p / (p + q); };
        const sEase = u => sig(u, 5.4, 1.35);
        const aEase = u => sig(u, 3.8, 1.45);
        // The opening is ABSOLUTELY still: pixel-crisp relief drifting at
        // sub-pixel speed shimmers (antialiasing flips frame to frame), and a
        // camera that isn't moving can't. The hold also gives the first trails
        // their contemplative beat; the sigmoid then resumes from rest.
        const HOLD = 0.12;   // ~3s of stillness, then the drift begins
        const camU = q => Math.max(0, (q - HOLD) / (1 - HOLD));
        const setView = q => {
            const u = camU(q);
            const S = Math.exp(Math.log(S0) * (1 - sEase(u)));
            const a = aEase(u);
            const ax = W / 2 + (hc.x - W / 2) * a, ay = H / 2 + (hc.y - H / 2) * a;
            svg.setAttribute('viewBox', `${hc.x - ax / S} ${hc.y - ay / S} ${W / S} ${H / S}`);
            svg.style.setProperty('--z', S);
            // The trailprint glow blooms only as the camera recedes (S 2.6 → 1.3).
            haloG.style.opacity = (0.34 * Math.min(1, Math.max(0, (2.6 - S) / 1.3))).toFixed(3);
            // Dissolve each fine terrain ring just before its edge enters frame.
            rings.forEach(r => { r.g.style.opacity = Math.min(1, Math.max(0, (S - 1.02 * r.e) / (0.11 * r.e))).toFixed(3); });
            return S;
        };

        // Each trail: distance from home centre + the scale at which it enters
        // frame. Repeat visits share a trailhead, which would re-trace the same
        // line over a still camera — so each duplicate is nudged "farther" and
        // its re-tracing gets sprinkled through the film instead of stacking at
        // the very start. revealS is clamped ≥ 1.15 so even the farthest-flung
        // trails release during the final approach, not with the title.
        const dupes = {};
        items.forEach(o => {
            const key = Math.round(o.cx) + ',' + Math.round(o.cy);
            const k = dupes[key] = (dupes[key] || 0) + 1;
            o.d = Math.hypot(o.cx - hc.x, o.cy - hc.y) + (k - 1) * 7;
            o.revealS = Math.max(1.15, (0.5 * Math.min(W, H)) / Math.max(1, o.d));
        });

        // ---- Cutting the plates ----
        // Each plate is its own little sheet: its own projection, its own scale,
        // a neatline and an engraved label. A plate is cut if trails live there —
        // or if it's RESERVED, in which case the land is drawn and simply left
        // unwalked. Hawaii's empty plate is why Alaska has a neighbour to sit
        // beside, and it means Alaska never shifts position the day Hawaii inks.
        const plateItems = [];
        PLATE_DEFS.forEach(pd => {
            if (!pd.ids.length && !pd.reserved) return;
            const PZ = 8;   // any fixed zoom — the viewBox normalises it away
            const pr = ll => { const p = map.project(L.latLng(ll[0], ll[1]), PZ); return [p.x, p.y]; };
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            const grow = ([x, y]) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };

            // The plate frames the WHOLE state, so the silhouette says where you
            // are at a glance and the trails sit at their true place inside it.
            // If the outlines never arrived, fall back to framing the trails —
            // an unlabelled plate beats a missing one.
            const feat = statesGeo && statesGeo.features.find(f => f.properties && f.properties.name === pd.state);
            const keptRings = [];
            if (feat) {
                const g = feat.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
                polys.forEach(poly => poly.forEach(r => { if (pd.keepRing(r)) keptRings.push(r); }));
            }
            keptRings.forEach(r => r.forEach(c => grow(pr([c[1], c[0]]))));
            if (!keptRings.length) pd.ids.forEach(id => trailsById[id].forEach(seg => seg.forEach(ll => grow(pr(ll)))));
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
            // stroke widths counter-scale, exactly as --z does on the main film,
            // so a plate reads with the same line weight whatever its scale
            psvg.style.setProperty('--ps', sc);
            if (keptRings.length) {
                let d = '';
                keptRings.forEach(r => { r.forEach((c, i) => { const [x, y] = pr([c[1], c[0]]); d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2) + ' '; }); d += 'Z '; });
                const land = document.createElementNS(SVGNS, 'path');
                land.setAttribute('d', d); land.setAttribute('class', 'plate-land');
                psvg.appendChild(land);
            }
            pd.ids.forEach(id => {
                let d = '';
                trailsById[id].forEach(seg => seg.forEach((ll, i) => { const [x, y] = pr(ll); d += (i === 0 ? 'M' : 'L') + x.toFixed(3) + ',' + y.toFixed(3) + ' '; }));
                const path = document.createElementNS(SVGNS, 'path');
                path.setAttribute('d', d); path.setAttribute('class', 'plate-trail');
                path.setAttribute('stroke', yearColor(yearOf[id] || 2022));
                psvg.appendChild(path);
                // Plate trails are NOT part of the film's release order — they
                // ink after the plate has been laid down (see revealPlates).
                plateItems.push({ p: path });
            });
            const label = document.createElement('div');
            label.className = 'ip-label';
            label.textContent = pd.label;
            box.append(psvg, label);
            (plateHolders[pd.corner] || plateHolders.se).appendChild(box);
        });
        const heroEl = document.getElementById('hero-film'), vigEl = document.querySelector('.hero-vig');
        Object.values(plateHolders).forEach(el => { if (el.children.length) heroEl.insertBefore(el, vigEl); });
        plateItems.forEach(o => { o.len = o.p.getTotalLength(); });

        items.sort((a, b) => a.d - b.d);   // nearest to home first

        // ---- Laying the plates down ----
        // The plates belong to the FINISHED sheet, so they wait for the camera:
        // fading them in over a country still pulling back read as a card
        // appearing on top of a moving map. Now the film lands, the title rises,
        // and only then does the plate settle into the corner and take its ink.
        const primePlates = () => plateItems.forEach(o => {
            o.p.style.transition = 'none';
            o.p.style.strokeDasharray = o.len;
            o.p.style.strokeDashoffset = o.len;
        });
        let plateTimer = null;
        function revealPlates(animated) {
            clearTimeout(plateTimer);
            Object.values(plateHolders).forEach(el => {
                el.classList.toggle('no-anim', !animated);
                el.classList.add('show');
            });
            const ink = () => plateItems.forEach((o, i) => {
                o.p.style.transition = animated ? `stroke-dashoffset 900ms cubic-bezier(0.33, 0, 0.15, 1) ${i * 120}ms` : 'none';
                o.p.style.strokeDasharray = animated ? o.len : 'none';
                o.p.style.strokeDashoffset = '0';
            });
            if (animated) plateTimer = setTimeout(ink, 820); else ink();
        }
        function hidePlates() {
            clearTimeout(plateTimer);
            Object.values(plateHolders).forEach(el => el.classList.remove('show', 'no-anim'));
            primePlates();
        }

        // Halos prime and draw WITH their trail (same dash animation), so a glow
        // can never appear ahead of the line it belongs to — the group-level
        // fade in setView only governs how visible the drawn glows are.
        const prime = () => items.forEach(o => o.parts.forEach(p => { p.style.transition = 'none'; p.style.strokeDasharray = o.len; p.style.strokeDashoffset = o.len; }));
        // The map shows itself IMMEDIATELY — primed empty (state lines on
        // parchment), with the terrain fading in beneath it as imagery lands.
        // The film then starts on an already-visible world; if instead the svg
        // stayed hidden until the film began, the first trail would be mid-draw
        // while the whole map was still fading in, and would read as appearing
        // already drawn.
        prime();
        primePlates();
        setView(0);
        svg.classList.add('ready');
        const D = 24000;    // ~24s of drawing, then the title flourish
        let raf = null, filmRunning = false;

        function runIntro() {
            cancelAnimationFrame(raf);
            filmRunning = true;
            btn.textContent = 'Skip';
            heroTitle.classList.remove('show');
            scrollHint.classList.remove('show');
            items.forEach(o => o.started = false);
            prime();
            hidePlates();
            setView(0);
            svg.classList.add('ready');

            const t0 = performance.now();
            let lastRelease = t0 - 350;   // first stroke lands a beat in, never at frame zero
            function frame(now) {
                const tt = now - t0, q = Math.min(1, tt / D);
                const S = setView(q);
                // Pacing follows the ZOOM's progress, not the clock — with a
                // back-loaded camera, clock-based pacing would blossom too early.
                const zp = Math.max(0, 1 - Math.log(S) / Math.log(S0));
                // Slow, deliberate strokes over home ground (~2.3s each); the
                // late blossom quickens but stays unhurried (~0.75s) — the SPEED
                // of the finale comes from the camera and the release rate.
                const draw = o => {
                    const dur = Math.round(2300 - 1550 * zp);
                    o.parts.forEach(p => {
                        p.style.transition = `stroke-dashoffset ${dur}ms cubic-bezier(0.33, 0, 0.15, 1)`;
                        p.style.strokeDashoffset = '0';
                    });
                    o.started = true;
                };

                // Release trails the zoom has brought (nearly) into frame. Nearest
                // first; slow & individual early, tightening into a blossom late.
                const gap = 1250 - 1160 * zp, burst = 1 + Math.floor(zp * 6);
                if (now - lastRelease >= gap) {
                    let rel = 0;
                    for (const o of items) {
                        if (o.started) continue;
                        // A touch early (within ~1.45× of the frame) beats stalling
                        // while the camera is still tight over home ground.
                        if (o.revealS * 1.45 < S) break;   // sorted: everything farther is too
                        draw(o);
                        if (++rel >= burst) break;
                    }
                    if (rel) {
                        lastRelease = now;
                    } else if (now - lastRelease > 1600 && tt < D - 1200) {
                        // Heartbeat: the drawing must never visibly pause, even if
                        // the zoom hasn't caught up to the next-nearest trail yet.
                        const nxt = items.find(o => !o.started);
                        if (nxt) { draw(nxt); lastRelease = now; }
                    }
                }

                if (tt < D) { raf = requestAnimationFrame(frame); } else { finish(); }
            }
            raf = requestAnimationFrame(frame);
        }

        // The landed hero: title up, button turns into the replay offer, and the
        // film never auto-replays again this session.
        function land() {
            filmRunning = false;
            AtlasIntro.skipped = true;   // later Escape presses are no-ops
            sessionStorage.setItem('introShown', 'true');
            heroTitle.classList.add('show');
            btn.textContent = '↻ Replay';
        }
        function finish() {   // natural ending: stragglers draw in as the title lands
            setView(1);
            items.forEach(o => { if (!o.started) { o.parts.forEach(p => { p.style.transition = 'stroke-dashoffset 650ms ease-out'; p.style.strokeDashoffset = '0'; }); o.started = true; } });
            land();
            // the camera has stopped — NOW the plates are laid on the finished sheet
            setTimeout(() => revealPlates(true), 620);
            setTimeout(() => scrollHint.classList.add('show'), 1000);
        }
        function finishInstantly() {   // skip, or a repeat-visit load: straight to the final frame
            cancelAnimationFrame(raf);
            items.forEach(o => { o.parts.forEach(p => { p.style.transition = 'none'; p.style.strokeDasharray = 'none'; p.style.strokeDashoffset = '0'; }); o.started = true; });
            svg.classList.add('ready');
            setView(1);
            revealPlates(false);
            land();
            scrollHint.classList.add('show');
        }

        // The one button, two jobs. Only the button skips — clicks on the map do
        // nothing (Danny's call: no accidental skips).
        btn.addEventListener('click', () => {
            if (!filmRunning) { runIntro(); return; }         // it reads "Replay the film"
            if (!AtlasIntro.skipped) AtlasIntro.skip();       // first run: land nav + film together
            else finishInstantly();                            // skipping a replay: just the film
        });

        // Static test-mode (?p=0..1) freezes the map at a given zoom progress
        // with all trails drawn — used to verify framing with screenshots.
        const pParam = new URLSearchParams(location.search).get('p');
        if (pParam !== null) {
            items.forEach(o => o.parts.forEach(p => { p.style.transition = 'none'; p.style.strokeDasharray = 'none'; p.style.strokeDashoffset = '0'; }));
            svg.classList.add('ready');
            revealPlates(false);
            setView(Math.min(1, Math.max(0, +pParam)));
        } else if (document.documentElement.classList.contains('intro-fast-forward')) {
            finishInstantly();   // repeat visit this session, or reduced motion
        } else {
            AtlasIntro.onSkip(finishInstantly);
            // Open on the terrain settling in, take one breath, then the first
            // stroke — never a trail drawn onto a map that isn't there yet.
            homeReady.then(() => {
                if (!AtlasIntro.skipped && !filmRunning) AtlasIntro.schedule(runIntro, 450);
            });
        }
    } catch (error) {
        // The film is decoration on top of the data — if anything fails, land
        // on a quiet parchment hero with the title and let the page carry on.
        console.error('Error loading the hero film:', error);
        heroTitle.classList.add('show');
        if (btn) btn.style.display = 'none';
        AtlasIntro.skip();
    }
})();

// ===== The Odometer: the key stats as rolling mile-counter reels =====
(function () {
    fetchHikes().then(hikes => {
        const stats = getAtlasStats(hikes);
        const startYear = hikes.reduce((min, h) => Math.min(min, hikeYear(h)), new Date().getUTCFullYear());
        document.getElementById('odo-range').textContent = startYear;
        // viewpoints don't ride the reels — they're not hikes — but they get their line
        const extra = document.getElementById('odo-extra');
        if (extra && stats.totalViewpoints) extra.textContent = ` · plus ${stats.totalViewpoints} scenic viewpoints`;

        const odoDefs = [
            { value: stats.totalHikes, label: 'Hikes' },
            { value: Math.round(stats.totalMiles), label: 'Miles' },
            { value: stats.totalElevation, label: 'Feet Climbed' },
            { value: stats.totalUniqueTrails, label: 'Trails' }
        ];
        const grid = document.getElementById('odo-grid');
        const built = [];
        odoDefs.forEach(d => {
            const stat = document.createElement('div'); stat.className = 'odo-stat';
            const plate = document.createElement('div'); plate.className = 'odo-plate';
            const strips = [];
            for (const ch of d.value.toLocaleString()) {
                if (ch === ',') { const s = document.createElement('span'); s.className = 'odo-sep'; s.textContent = ','; plate.appendChild(s); continue; }
                const reel = document.createElement('span'); reel.className = 'odo-reel';
                const strip = document.createElement('span'); strip.className = 'odo-strip';
                // two 0-9 cycles so the reel spins a full extra turn before landing
                strip.innerHTML = Array.from({ length: 20 }, (_, k) => `<span class="odo-digit">${k % 10}</span>`).join('');
                reel.appendChild(strip); plate.appendChild(reel);
                strips.push({ strip, digit: +ch });
            }
            stat.appendChild(plate);
            const label = document.createElement('div'); label.className = 'odo-label'; label.textContent = d.label;
            stat.appendChild(label); grid.appendChild(stat);
            built.push(strips);
        });

        let rolled = false;
        function roll() {
            if (rolled) return; rolled = true;
            built.forEach(strips => strips.forEach((s, i) => {
                // Measure the digit height instead of assuming it — keeps the
                // reels honest if a media query resizes them.
                const h = s.strip.firstChild.offsetHeight;
                setTimeout(() => {
                    s.strip.classList.add('rolling');
                    s.strip.style.transform = `translateY(${-(10 + s.digit) * h}px)`;
                }, i * 90);
            }));
        }
        new IntersectionObserver((es, ob) => es.forEach(e => { if (e.isIntersecting) { roll(); ob.disconnect(); } }), { threshold: 0.4 })
            .observe(document.getElementById('odo-section'));
    });
})();

// ===== Nav loading-bar intro sequence =====

(function() {
    const loadingBar = document.getElementById('loading-bar');
    const mainNav = document.getElementById('main-nav');
    const loadingText = document.getElementById('loading-text');

    // If we're fast-forwarding, just show the nav immediately.
    if (document.documentElement.classList.contains('intro-fast-forward')) {
        loadingBar.style.display = 'none';
        mainNav.style.display = 'flex';
        mainNav.style.opacity = '1';
        return;
    }

    // Full intro: start with the loading phrases visible and the nav links hidden.
    // (The shared nav component renders them the other way around by default.)
    loadingBar.style.display = 'flex';
    mainNav.style.display = 'none';

    // On skip, drop the loading phrases and reveal the real nav at once.
    AtlasIntro.onSkip(() => {
        loadingBar.style.display = 'none';
        mainNav.style.display = 'flex';
        mainNav.style.opacity = '1';
    });

    // Escape also skips the film (the visible affordance is the hero's button).
    const onEsc = (e) => { if (e.key === 'Escape') AtlasIntro.skip(); };
    document.addEventListener('keydown', onEsc);
    AtlasIntro.onSkip(() => document.removeEventListener('keydown', onEsc));

    const allPhrases = [
        "Calibrating Compass...", "Drawing Maps...", "Lacing Boots...", "Checking Weather...",
        "Packing Snacks...", "Finding North...", "Rendering Trails...", "Filtering Water...",
        "Setting up Camp...", "Watching the Sunset...", "Consulting Topography...", "Identifying Constellations...",
        "Avoiding Poison Oak...", "Listening for Birdsong...", "Following the Switchbacks...", "Taking a Break...",
        "Signing the Trail Log...", "Remembering the View...", "Planning the Next Leg...", "Zipping up the Tent...",
        "Gazing at the Stars...", "Waking up at Dawn...", "Making Cowboy Coffee...", "Breaking Down Camp..."
    ];

    // Fisher-Yates shuffle to randomize the phrases array
    for (let i = allPhrases.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allPhrases[i], allPhrases[j]] = [allPhrases[j], allPhrases[i]];
    }

    const phrase1 = allPhrases[0];
    const phrase2 = allPhrases[1];

    // Set initial phrase
    loadingText.textContent = phrase1;

    // Set timeout to change to the second phrase
    AtlasIntro.schedule(() => {
        loadingText.style.opacity = 0;
        setTimeout(() => {
            loadingText.textContent = phrase2;
            loadingText.style.opacity = 1;
        }, 500); // Fade transition
    }, 4750); // Change just before the 5-second mark

    // Set timeout to transition to the final nav bar
    const transitionTime = 9500;
    AtlasIntro.schedule(() => {
        // Fade out loading bar
        loadingBar.style.opacity = '0';
        setTimeout(() => {
            loadingBar.style.display = 'none';
            mainNav.style.display = 'flex';
            setTimeout(() => {
                mainNav.style.opacity = '1';
            }, 20);
        }, 500); // Match CSS transition
    }, transitionTime);

})();
