/* =============================================================================
   THE PLATE — the left leaf of the home page's open volume
   -----------------------------------------------------------------------------
   A printed atlas page is a big DETAIL PLATE with a small KEY beside it. We
   built it upside down first: two co-equal maps, a continental one above a
   close-up. The continental one turned out to repeat what the hero film had
   just spent fifteen seconds showing, and two views of the same country a few
   hundred pixels apart read as repetition rather than as continuity. So the
   plate is now the leaf, and the key is an INDEX DIAGRAM — engraved, tiny, and
   deliberately not a map.

   That demotion is what makes the redundancy go away: a schematic silhouette
   and a photographic flyover cannot compete with each other. It is also the
   cheapest thing on the page. The index costs one 9 KB asset and no tiles at
   all, where the live key map cost 27 tile requests, the whole Atlas basemap
   stack and two full-screen mix-blend layers.

   THE LAWS THIS FILE KEEPS (learned expensively elsewhere — see CLAUDE.md):

     * THE CAMERA NEVER MOVES on its own. Roaming belongs to map.html. The plate
       CUTS between subjects and never flies, and the only thing allowed to
       re-frame it otherwise is a LAYOUT event — first settle, window resize —
       because the leaf's height is viewport-derived.
     * EVERY CUT IS BUFFERED. Running a cursor down a ledger of milestones would
       otherwise ask the tile server for a fresh region on every row it crossed.
     * THE LEFT LEAF IS A READOUT, NOT A CONTROL. Nothing here is hoverable or
       clickable except the door out. You act on the right leaf; the land
       answers. This is Danny's call (July 2026) and it is worth stating as a
       rule, because it also deletes a whole class of bug: the old `pointing`
       flag existed purely to referee the reader's cursor against their scroll
       position, and with no left-leaf cursor there is nothing to referee.

   THE ONE API. Every section on the right leaf talks to the land through
   window.AtlasKeyMap and nothing else — no section outside this file may
   reference Leaflet, L, or a layer. That is how AtlasChain, AtlasFilm,
   AtlasIntro and AtlasShape are already separated.

   Note AtlasIntro in home.js is declared with `const`, which makes it a global
   BINDING and not a property of window — code that tested `window.AtlasIntro`
   silently did nothing for weeks. AtlasKeyMap is therefore assigned to window
   explicitly, so a section can honestly guard on it.
   ============================================================================= */

(function () {
    'use strict';

    const IMAGERY_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    const PLACES_URL  = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

    /* Zoom 17 is about 1.2 m per pixel over the San Gabriels — the point at
       which you are looking at individual trees rather than green mush. It only
       binds on a SHORT subject: fitBounds sizes the zoom to the plate, so a
       five-mile trail settles well below it on its own. Where it earns its keep
       is a viewpoint, which has no track at all and would otherwise frame at
       whatever cap it was handed. */
    const MAX_ZOOM = 17;

    let plateMap = null;
    let allHikes = [], geo = {}, frame = null;
    let titleEl, placeEl, countEl, vitalsEl, veilEl, scaleLabelEl, scaleBarEl, indexSvg, dotsGroup;
    let imageryLayer = null;

    /* the index diagram's dots, keyed by trail_id */
    const indexDots = {};
    const benchmarkNodes = {};

    /* Where the plate stands before anyone has pointed at anything. Only ever
       used at boot: once a section asks for a subject, the plate keeps it. */
    const REST_LABEL = 'The home ground', REST_PLACE = 'California · the home ground';

    let resolveReady;
    const ready = new Promise(res => { resolveReady = res; });

    const yearInk = h => ATLAS_CONFIG.COLOR_MAP[hikeYear(h)] || '#777';
    const SVGNS = 'http://www.w3.org/2000/svg';

    /* =========================================================================
       BOOT
       ====================================================================== */
    async function boot() {
        if (!document.getElementById('detailplate')) return;
        titleEl      = document.getElementById('kf-title');
        placeEl      = document.getElementById('kf-place');
        countEl      = document.getElementById('kf-count');
        vitalsEl     = document.getElementById('kf-vitals');
        veilEl       = document.getElementById('kf-veil');
        scaleLabelEl = document.getElementById('kf-scale');
        scaleBarEl   = document.getElementById('kf-scale-bar');
        indexSvg     = document.getElementById('atlas-index');

        const [hikes, geometries, atlasFrame] = await Promise.all([
            fetchHikes(), fetchTrailGeometries(), fetchAtlasFrame()
        ]);
        allHikes = hikes;
        geo = geometries;
        frame = atlasFrame;

        buildIndex();
        buildPlate();
        resolveReady(true);
    }

    async function fetchAtlasFrame() {
        try {
            const r = await fetch('assets/atlas-frame.json');
            return r.ok ? await r.json() : null;
        } catch (e) {
            return null;                 // the plate still works without a key
        }
    }

    /* =========================================================================
       THE INDEX DIAGRAM — engraved, not photographed.

       assets/atlas-frame.json is generated by tools/build-countries.py: every
       country the Atlas has walked, projected through ONE Lambert azimuthal
       equal-area and normalised into a 100-unit box. Crucially it also carries
       that projection's own parameters, which is what lets a dot be PLANTED
       here rather than guessed at — replay the same maths on a hike's
       latitude/longitude and it lands where it belongs.
       ====================================================================== */
    function project(lat, lon) {
        const p = frame.proj;
        const rad = Math.PI / 180;
        const phi = lat * rad, phi0 = p.lat0 * rad, dl = (lon - p.lon0) * rad;
        const denom = 1 + Math.sin(phi0) * Math.sin(phi)
                    + Math.cos(phi0) * Math.cos(phi) * Math.cos(dl);
        if (denom <= 1e-9) return null;
        const k = Math.sqrt(2 / denom);
        const x = k * Math.cos(phi) * Math.sin(dl);
        const y = k * (Math.cos(phi0) * Math.sin(phi)
                     - Math.sin(phi0) * Math.cos(phi) * Math.cos(dl));
        return { x: (x - p.ox) * p.scale, y: (p.oy - y) * p.scale };
    }

    function buildIndex() {
        if (!indexSvg || !frame) return;
        indexSvg.setAttribute('viewBox', frame.viewBox);

        const land = document.createElementNS(SVGNS, 'path');
        land.setAttribute('d', frame.d);
        land.setAttribute('class', 'ai-land');
        indexSvg.appendChild(land);

        dotsGroup = document.createElementNS(SVGNS, 'g');
        indexSvg.appendChild(dotsGroup);

        allHikes.forEach(h => {
            const pt = project(h.latitude, h.longitude);
            if (!pt) return;
            const c = document.createElementNS(SVGNS, 'circle');
            c.setAttribute('cx', pt.x.toFixed(2));
            c.setAttribute('cy', pt.y.toFixed(2));
            c.setAttribute('r', '1');
            c.setAttribute('fill', yearInk(h));
            c.setAttribute('class', 'ai-dot');
            dotsGroup.appendChild(c);
            indexDots[h.trail_id] = c;
        });
    }

    /* light these on the index, fade the rest — the diagram's whole job */
    function markIndex(ids) {
        const keep = new Set(ids);
        Object.entries(indexDots).forEach(([id, c]) => {
            const on = keep.has(id);
            c.setAttribute('r', on ? '2.4' : '1');
            c.setAttribute('class', on ? 'ai-dot is-lit' : 'ai-dot');
            if (on) dotsGroup.appendChild(c);      // lit dots draw last
        });
    }

    /* =========================================================================
       THE PLATE — satellite, and the reason this leaf exists. It CUTS.
       ====================================================================== */
    let plateInk = [];
    let cutTimer = null;
    let showing = null;
    let plateBounds = null;

    function buildPlate() {
        plateMap = L.map('detailplate', {
            zoomControl: false, dragging: false, scrollWheelZoom: false,
            doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false,
            /* WHOLE ZOOM LEVELS, and this is not a preference. At a fractional
               zoom Leaflet scales the tile grid onto fractional device pixels,
               adjacent tile edges antialias, and the plate's backing shows
               through as a white lattice across the imagery. Pinned to whole
               levels the sheet lands on exact pixels and the seams never open. */
            zoomSnap: 1,
            maxZoom: MAX_ZOOM,
            attributionControl: true
        });
        plateMap.getContainer().style.cursor = 'default';
        plateMap.attributionControl.setPrefix('');
        plateMap.attributionControl.addAttribution('Imagery &copy; Esri');

        imageryLayer = L.tileLayer(IMAGERY_URL, { maxZoom: 19, attribution: '' }).addTo(plateMap);
        // Esri's own reference labels, not CARTO's grays, which drown on imagery
        L.tileLayer(PLACES_URL, { maxZoom: 17, attribution: '' }).addTo(plateMap);

        // at rest it stands on the home ground, where 97 of 123 outings are
        const home = allHikes.filter(h => territoryKey(h) === 'CA').map(h => h.trail_id);
        show(home, REST_LABEL, REST_PLACE, 'home');

        setTimeout(settleSize, 250);
        let t;
        addEventListener('resize', () => { clearTimeout(t); t = setTimeout(settleSize, 180); });
    }

    /* A resize re-frame is a LAYOUT event, not a camera gesture — it is the
       only thing permitted to move the camera without a cut. */
    function settleSize() {
        if (!plateMap) return;
        plateMap.invalidateSize({ animate: false });
        reframe();
    }

    /* The cut, buffered. map.js buffers a rapid step for the same reason. */
    function settleCut(ids, label, place, key) {
        if (key === showing) return;
        clearTimeout(cutTimer);
        cutTimer = setTimeout(() => cutTo(ids, label, place, key), 220);
    }

    /* ---- THE CUT, BEHIND THE VEIL ------------------------------------------
       Framing a new subject and drawing its ink is instant; the IMAGERY is not.
       Done in the open, a cut showed the trail inked onto the plate's bare dark
       backing — a black box with a green line in it — for the second or two the
       tiles took to arrive. So the parchment comes down first, the cut happens
       underneath it, and it lifts only once the imagery reports itself loaded.

       Timings are deliberately tighter than map.html's expedition cuts: this
       fires on a hover, not on a chapter change, so 130 ms down and 260 ms up
       against the map's 300/550. The floor stops a cached region producing a
       blink too quick to read as anything but a glitch; the ceiling means a
       slow network delays the reveal rather than holding the plate hostage. */
    const VEIL_MIN_MS = 190, VEIL_MAX_MS = 1400;

    function cutTo(ids, label, place, key) {
        if (!plateMap) return;
        if (!veilEl) { show(ids, label, place, key); return; }
        veilEl.classList.add('on');
        setTimeout(() => {
            show(ids, label, place, key);
            const t0 = performance.now();
            waitTiles().then(() => {
                const held = performance.now() - t0;
                setTimeout(() => veilEl.classList.remove('on'), Math.max(0, VEIL_MIN_MS - held));
            });
        }, 130);
    }

    /* Mirrors map.js's waitTiles, including its lesson: a `once('load')` that
       never fires — the common case when the timeout wins — stays wired to the
       layer forever, so the listener is registered with on/off and always
       detached on whichever path settles first. */
    function waitTiles() {
        return new Promise(res => {
            requestAnimationFrame(() => {
                if (!imageryLayer || !imageryLayer.isLoading()) return res();
                let settled = false;
                const finish = () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    imageryLayer.off('load', finish);
                    res();
                };
                imageryLayer.on('load', finish);
                const timer = setTimeout(finish, VEIL_MAX_MS);
            });
        });
    }

    function show(ids, label, place, key) {
        if (!plateMap) return;
        /* An id that resolves to nothing is a caller's bug, not this plate's.
           Standing still on the last good subject is a far better failure than
           cutting to an empty frame with a blank caption. */
        if (!ids.some(id => allHikes.some(h => h.trail_id === id))) return;
        showing = key;
        plateInk.forEach(l => plateMap.removeLayer(l));
        plateInk = [];

        const bounds = L.latLngBounds([]);
        ids.forEach(id => {
            const h = allHikes.find(x => x.trail_id === id);
            if (!h) return;
            const segs = geo[id];
            if (segs && segs.length) {
                segs.forEach(seg => {
                    // the year's own ink, undressed. A cream casing under the
                    // line is the standard printed-map answer to a saturated
                    // colour on saturated ground, and it is held in reserve
                    // rather than spent — see how the plain ink reads first.
                    /* `interactive: false` — NOT cosmetic. Leaflet gives every
                       vector a pointer cursor, which on this leaf promises a
                       click that does not exist: the plate is a readout, you
                       act on the right leaf. (trip.js's SOLO chapters do the
                       same thing for the same reason.) */
                    const line = L.polyline(seg, {
                        color: yearInk(h), weight: 3.4, opacity: 0.95, lineCap: 'round',
                        interactive: false
                    }).addTo(plateMap);
                    plateInk.push(line);
                    bounds.extend(line.getBounds());
                });
            }
            const dot = L.circleMarker([h.latitude, h.longitude], {
                radius: 3.6, color: '#fffdf6', weight: 1.2,
                fillColor: yearInk(h), fillOpacity: 1,
                interactive: false            // see the polyline above
            }).addTo(plateMap);
            plateInk.push(dot);
            bounds.extend(dot.getLatLng());
        });

        plateBounds = bounds.isValid() ? bounds : null;
        reframe();
        markIndex(ids);
        if (titleEl && label) titleEl.textContent = label;
        if (placeEl) placeEl.textContent = place || placeOf(ids);

        const shown = ids.map(id => allHikes.find(x => x.trail_id === id)).filter(Boolean);
        if (countEl) {
            countEl.textContent = shown.length === 1 ? 'One trailprint' : `${shown.length} trailprints`;
        }
        if (vitalsEl) vitalsEl.textContent = vitalsOf(shown);
    }

    /* The measurements, which used to be a tooltip beside the Effort Field's
       dots. One hike states its own; a group states what a group can honestly
       state — you cannot give "the summit" of ninety-seven outings. */
    function vitalsOf(hs) {
        if (!hs.length) return '';
        if (hs.length === 1) {
            const h = hs[0];
            const bits = [`${(h.miles || 0).toFixed(1)} mi`, `${(h.elevation_gain || 0).toLocaleString()} ft`];
            if (h.summit_trail && h.summit_elevation) bits.push(`${h.summit_elevation.toLocaleString()} ft summit`);
            bits.push(formatHikeDate(h.date_completed, { year: 'numeric', month: 'short', day: 'numeric' }));
            return bits.join('  ·  ');
        }
        const mi = hs.reduce((s, h) => s + (h.miles || 0), 0);
        const ft = hs.reduce((s, h) => s + (h.elevation_gain || 0), 0);
        return `${mi.toFixed(0)} mi  ·  ${ft.toLocaleString()} ft climbed`;
    }

    function reframe() {
        if (!plateMap || !plateBounds) return;
        plateMap.fitBounds(plateBounds, { padding: [16, 16], maxZoom: MAX_ZOOM, animate: false });
        updateScaleBar();
    }

    /* the place, in words — the one thing an index diagram can't say */
    function placeOf(ids) {
        const hs = ids.map(id => allHikes.find(x => x.trail_id === id)).filter(Boolean);
        if (!hs.length) return '';
        if (hs.length === 1) return `${hs[0].location} · ${hs[0].region}`;
        const terr = [...new Set(hs.map(territoryKey))];
        return terr.length === 1
            ? `${territoryName(terr[0])} · ${hs.length} outings`
            : `${terr.length} territories · ${hs.length} outings`;
    }

    /* =========================================================================
       THE PUBLISHED API
       ====================================================================== */
    function light(ids, label, place) {
        if (!ids || !ids.length) return;
        settleCut(ids, label, place, ids.join(','));
    }

    /* THE PLATE STAYS WHERE IT WAS PUT. Pointing away from a milestone or a dot
       used to send the plate back to the whole home ground, so a reader running
       an eye across the Effort Field watched the leaf slam in and out of
       California between every hike — dozens of cuts, each one a veil, for
       journeys nobody asked to take. A plate on a desk does not reset itself
       when you look away from it; it holds the last thing you asked for until
       you ask for something else.

       Kept in the API because sections legitimately want to say "I am done
       pointing" — it just no longer means "go home". */
    function clear() { /* deliberately nothing: see above */ }

    /* Which plate the reader is standing on. It no longer moves the camera —
       the leaf holds whatever it was last asked for (see clear) — so all this
       decides now is whether the milestone benchmarks are on the index. */
    function plate(mode) {
        showBenchmarks(mode === 'milestones');
    }

    /* =========================================================================
       THE BENCHMARKS — milestone disks planted on the index diagram at the
       ground each was earned on. Plate II wires these up in Stage 3; the API is
       published from the start so nothing has to be retrofitted.
       ====================================================================== */
    function benchmarks(list) {
        if (!indexSvg || !frame) return;
        Object.values(benchmarkNodes).forEach(n => n.remove());
        Object.keys(benchmarkNodes).forEach(k => delete benchmarkNodes[k]);

        (list || []).forEach(item => {
            const h = allHikes.find(x => x.trail_id === item.trail_id);
            if (!h) return;
            const pt = project(h.latitude, h.longitude);
            if (!pt) return;
            const g = document.createElementNS(SVGNS, 'g');
            g.setAttribute('class', 'ai-bm');
            g.setAttribute('transform', `translate(${pt.x.toFixed(2)} ${pt.y.toFixed(2)})`);
            const disk = document.createElementNS(SVGNS, 'circle');
            disk.setAttribute('r', '3.1');
            disk.setAttribute('class', 'ai-bm-disk');
            const label = document.createElementNS(SVGNS, 'text');
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('dy', '1.5');
            label.textContent = item.n == null ? '' : String(item.n);
            g.appendChild(disk);
            g.appendChild(label);
            indexSvg.appendChild(g);
            benchmarkNodes[item.id] = g;
        });
        showBenchmarks(false);
    }

    function showBenchmarks(on, only) {
        Object.entries(benchmarkNodes).forEach(([k, g]) => {
            g.classList.toggle('is-on', !!(on && (!only || only === k)));
        });
    }

    /* =========================================================================
       THE SCALE BAR — recomputed on every cut, because unlike the old key map
       this plate changes what it is standing on. Printed honestly: a nice round
       distance is chosen first and the bar drawn to match, rather than the bar
       being fixed and the number rounded into a lie.
       ====================================================================== */
    /* The ladder runs in FEET at the bottom and MILES above it, because this
       plate spans both: at zoom 17 a hundred pixels is about 400 feet, and at
       rest over California it is eighty miles. The smallest rung has to be
       genuinely small — with a miles-only ladder nothing fitted at z17, the bar
       fell back to its longest rung and grew wide enough to push the place name
       off the end of the readout. */
    const RUNGS_FT = [100, 250, 500, 1000, 2000];
    const RUNGS_MI = [0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];
    const FT_PER_MI = 5280;

    function updateScaleBar() {
        if (!plateMap || !scaleBarEl || !scaleLabelEl) return;
        const size = plateMap.getSize();
        if (!size.x) return;
        const y = Math.round(size.y / 2);
        const ftPerHundredPx = plateMap.distance(
            plateMap.containerPointToLatLng([0, y]),
            plateMap.containerPointToLatLng([100, y])) * 3.280839895;
        if (!isFinite(ftPerHundredPx) || ftPerHundredPx <= 0) return;

        const maxPx = size.x * 0.22;
        const rungs = RUNGS_FT.map(ft => ({ ft, label: `${ft.toLocaleString()} ft` }))
            .concat(RUNGS_MI.map(mi => ({ ft: mi * FT_PER_MI,
                label: `${mi.toLocaleString()} mi` })));

        // the largest rung that still fits; if even the smallest overruns, take
        // it anyway — a slightly long bar beats a bar that claims a wrong length
        let pick = rungs[0];
        rungs.forEach(r => { if ((r.ft / ftPerHundredPx) * 100 <= maxPx) pick = r; });
        const px = Math.max(28, Math.min(maxPx, Math.round((pick.ft / ftPerHundredPx) * 100)));
        scaleBarEl.querySelectorAll('i').forEach(seg => { seg.style.width = `${px / 4}px`; });
        scaleLabelEl.textContent = `0 — ${pick.label}`;
    }

    window.AtlasKeyMap = { ready, light, clear, plate, benchmarks, showBenchmarks };

    boot();
})();
