/**
 * THE TRAVERSE — one chapter of the Atlas (trip.html?tag=<trip_tag>).
 *
 * A survey traverse is a connected series of measured legs between fixed
 * points; that is exactly what a trip is, and it is what this page draws.
 * Every hike's real elevation profile is stitched end to end, the ground
 * covered between stops runs ramped and dashed, and the whole thing is
 * normalised to the window so a trip is legible in one glance. The land sits
 * behind it, and the camera CUTS to whatever stop you pick — it never flies,
 * and it never roams. Roaming belongs to map.html.
 *
 * Structure, in the order the page reads:
 *   frontispiece  the trip's chosen photograph (ATLAS_CONFIG.TRIP_STARS)
 *   the mark      the chapter name, engraved in the corner
 *   the sheet     map.css's quick glance, compacted — collar, vitals, slide, door
 *   the traverse  the instrument: stations, viewpoint sightings, day bands
 */
document.addEventListener('DOMContentLoaded', () => {

    const $ = id => document.getElementById(id);
    const SVGNS = 'http://www.w3.org/2000/svg';
    const el = (n, a) => {
        const e = document.createElementNS(SVGNS, n);
        for (const k in a) e.setAttribute(k, a[k]);
        return e;
    };

    const BIG  = id => cloudinaryUrl(id, 'w_1900,h_1100,c_fill,q_auto,f_auto');
    const MED  = id => cloudinaryUrl(id, 'w_760,h_480,c_fill,q_auto,f_auto');
    // ~1 kB. Lands in one packet, so the frontispiece is never a black rectangle.
    const TINY = id => cloudinaryUrl(id, 'w_48,h_28,c_fill,e_blur:900,q_20,f_auto');

    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    /** great-circle km — how far the ground moved between two stops */
    const havKm = (a, b) => {
        const R = 6371, rad = x => x * Math.PI / 180;
        const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
        const x = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(x));
    };

    /* The Atlas's own two door glyphs: the open field log (map.js's
       DOOR_LOG_GLYPH) and the folded map (hike.html's land-door). */
    const GLYPH_LOG = '<path d="M12 7.2C10.6 6 8.7 5.4 6.2 5.4H3.2v12.2h3c2.5 0 4.4.6 5.8 1.8 ' +
        '1.4-1.2 3.3-1.8 5.8-1.8h3V5.4h-3c-2.5 0-4.4.6-5.8 1.8Z"/><path d="M12 7.2v12.2"/>';
    const GLYPH_MAP = '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>';

    function showLost(message) {
        $('frontis').classList.add('lift');
        $('tl-msg').textContent = message;
        $('trip-lost').hidden = false;
    }

    /* =================================================================
       THE LAND — fixed. Every handle that could move it is off.
       ================================================================= */
    const map = L.map('trip-map', {
        zoomControl: false, zoomSnap: 0,
        dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
        touchZoom: false, boxZoom: false, keyboard: false, tap: false,
        attributionControl: true
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
        maxZoom: 16, keepBuffer: 2,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 16, opacity: 0.55, keepBuffer: 2, className: 'hillshade-multiply'
    }).addTo(map);
    const wash = document.createElement('div');
    wash.className = 'parchment-wash';
    map.getContainer().appendChild(wash);
    map.setView([39, -98], 4);   // a view, any view, before the first vector lands

    const veil = $('trip-veil');
    let cutTimer = null, afterCut = null, lastBounds = null, lastMax = null;

    /**
     * The padding is MEASURED, not guessed. Hardcoded numbers go stale every
     * time a panel changes size, and they can't know that the traverse
     * collapses on a level trip or that a long chapter name makes the mark
     * wider than the sheet. Each piece of chrome is cleared on its CHEAPER
     * axis: the sheet is tall and narrow, so it costs less to clear sideways;
     * the mark and the corner captions are short and wide, so they cost less
     * to clear downwards.
     *
     * NB: never test offsetParent here — every panel on this page is
     * absolutely positioned inside a fixed shell, and offsetParent reporting
     * null would silently collapse every pad to the bare margin.
     */
    function chromePads() {
        const shell = $('trip-shell') || document.querySelector('.trip-shell');
        const host = shell.getBoundingClientRect();
        const box = sel => {
            const e = document.querySelector(sel);
            if (!e || getComputedStyle(e).display === 'none' || e.hidden) return null;
            const r = e.getBoundingClientRect();
            return (r.width && r.height) ? r : null;
        };
        const GAP = 24;
        /* fitBounds frames the GEOMETRY, but what gets drawn is bigger than the
           geometry: a trailhead mark is a 26px disc centred on the point, and
           when two marks collide refreshPins fans them up to 40px off it. So a
           frame that fits the coordinates exactly still slides a mark under the
           sheet or beneath the traverse — which is what clipped the PCT trip on
           the left and Alaska's viewpoint A at the bottom. Every side carries
           the allowance, because the fan can push in any direction. */
        const MARK = 13 + 40 + 5;
        let left = 26, top = 26, right = 26, bottom = 26;
        const sheet = box('.sheet-mount');
        if (sheet) left = Math.max(left, sheet.right - host.left + GAP);
        ['.trip-mark', '.trip-hint'].forEach(s => {
            const r = box(s);
            if (r) top = Math.max(top, r.bottom - host.top + GAP);
        });
        const trav = box('.trav');
        if (trav) bottom = Math.max(bottom, host.bottom - trav.top + GAP);
        return {
            topLeft: L.point(left + MARK, top + MARK),
            bottomRight: L.point(right + MARK, bottom + MARK)
        };
    }

    /** The camera never flies. It cuts, behind the veil. */
    function cutTo(bounds, maxZoom) {
        lastBounds = bounds;
        lastMax = maxZoom || 16;
        clearTimeout(cutTimer);
        veil.classList.add('on');
        cutTimer = setTimeout(() => {
            const pad = chromePads();
            map.fitBounds(bounds, {
                paddingTopLeft: pad.topLeft, paddingBottomRight: pad.bottomRight,
                maxZoom: lastMax, animate: false
            });
            if (afterCut) afterCut();
            setTimeout(() => veil.classList.remove('on'), 230);
        }, 300);
    }
    /** re-frame in place with no veil — for when the CHROME changed, not the view */
    function reframe() {
        if (!lastBounds) return;
        const pad = chromePads();
        map.fitBounds(lastBounds, {
            paddingTopLeft: pad.topLeft, paddingBottomRight: pad.bottomRight,
            maxZoom: lastMax || 16, animate: false
        });
        if (afterCut) afterCut();
    }

    /* ================================================================= */
    Promise.all([fetchHikes(), fetchTrailGeometries(),
                 fetch('data/elevations.json').then(r => r.json()).catch(() => ({}))])
        .then(([allHikes, geometries, elevations]) => {

        const tag = (new URLSearchParams(window.location.search).get('tag') || '').trim();
        if (!tag) {
            showLost('No chapter was named. Pick one from the map, or from a hike’s field log.');
            return;
        }
        const trip = allHikes.filter(h => h.trip_tag === tag).sort(compareHikesChrono);
        if (!trip.length) {
            showLost(`Nothing in the Atlas is filed under “${tag}”.`);
            return;
        }

        const name = tripName(tag);
        const year = hikeYear(trip[0]);
        const YEAR_INK = ATLAS_CONFIG.COLOR_MAP[String(year)] || ATLAS_CONFIG.DEFAULT_COLOR;
        document.title = `${name} - The Trailprint Atlas`;

        const walked = trip.filter(h => !isViewpoint(h));
        const views = trip.filter(isViewpoint);
        /* A viewpoint doesn't add miles, but it absolutely adds a DAY — the day
           you drove the park road and stopped at an overlook was a day out.
           (Miles and feet still count walked ground only.) */
        const days = new Set(trip.map(h => h.date_completed)).size;
        const miles = walked.reduce((s, h) => s + (h.miles || 0), 0);
        const gain = walked.reduce((s, h) => s + (h.elevation_gain || 0), 0);
        /* under 100 ft climbed across the whole trip there is no section to draw */
        const LEVEL = gain < 100;

        const first = trip[0], last = trip[trip.length - 1];
        const oneDay = first.date_completed === last.date_completed;
        const span = oneDay
            ? formatHikeDate(first.date_completed, { month: 'long', day: 'numeric', year: 'numeric' })
            : formatHikeDate(first.date_completed, { month: 'long', day: 'numeric' }) + ' – ' +
              formatHikeDate(last.date_completed, { month: 'long', day: 'numeric', year: 'numeric' });

        /* hikes are NUMBERED, viewpoints are LETTERED — two sequences, one story */
        const mark = {};
        let nH = 0, nV = 0;
        trip.forEach(h => {
            mark[h.trail_id] = isViewpoint(h) ? String.fromCharCode(65 + nV++) : String(++nH);
        });

        /* ---- the frontispiece: held until the photograph exists -------- */
        const STAR = tripStar(tag, trip);
        $('f-name').textContent = name;
        $('f-when').textContent = span;
        $('f-tot').innerHTML = [
            [days, days === 1 ? 'Day out' : 'Days out'],
            [walked.length, walked.length === 1 ? 'Hike' : 'Hikes'],
            [views.length, views.length === 1 ? 'Viewpoint' : 'Viewpoints'],
            [miles.toFixed(1), 'Miles'],
            [gain.toLocaleString(), 'Feet climbed']
        ].filter(v => v[0] !== 0 && v[0] !== '0.0')
         .map(([n, l]) => `<div><b>${n}</b>${l}</div>`).join('');

        $('tm-name').textContent = name;
        $('tm-when').textContent = span;

        const frontis = $('frontis');
        let lifted = false, armed = false;
        const lift = () => { if (!lifted) { lifted = true; frontis.classList.add('lift'); } };
        const arm = () => { if (!armed) { armed = true; setTimeout(lift, 2200); } };
        if (STAR) {
            $('f-blur').src = TINY(STAR);
            const full = blurUpPreload(BIG(STAR));
            const landed = () => {
                const img = $('f-full');
                img.src = BIG(STAR);
                img.classList.add('on');
                frontis.classList.add('ready');
                arm();
                // with the big frame home, warm each stop's own slide so
                // walking the traverse never waits on the network
                trip.forEach(h => (h.images || []).slice(0, 1).forEach(id => blurUpPreload(MED(id))));
            };
            if (full.complete && full.naturalWidth) landed();
            else {
                full.addEventListener('load', landed, { once: true });
                full.addEventListener('error', () => { frontis.classList.add('ready'); arm(); }, { once: true });
            }
            setTimeout(arm, 7000);   // never trap the page on a dead or slow frame
        } else {
            frontis.classList.add('ready');
            arm();
        }
        frontis.addEventListener('click', lift);
        window.addEventListener('wheel', lift, { once: true, passive: true });

        /* ---- the trails on the land ---------------------------------- */
        const byTrail = {};
        trip.forEach(h => (byTrail[h.trail_id] = h));
        const allPts = [], heads = [], bounds = {}, lines = {}, home = {};
        trip.forEach(h => {
            const segs = geometries[h.trail_id];
            const here = (typeof h.latitude === 'number') ? [h.latitude, h.longitude] : null;
            if (segs && segs.length) {
                // the class names the trail, so a stop's own ink can be found
                lines[h.trail_id] = segs.map(ll => L.polyline(ll, {
                    color: YEAR_INK, weight: 3.2, opacity: 0.9,
                    className: `ink ink-${h.trail_id}`
                }).addTo(map));
                // with the map fixed, the ink is a control, not scenery
                lines[h.trail_id].forEach(pl => {
                    pl.on('mouseover', () => preview(h));
                    pl.on('mouseout', () => preview(null));
                    pl.on('click', () => select(h));
                });
                const flat = segs.flat();
                flat.forEach(p => allPts.push(p));
                heads.push(segs[0][0]);
                // a light breathing margin only — the measured pixel padding is
                // what keeps the trail clear of the chrome, and padding twice
                // pushed every frame further out than it needed to be
                bounds[h.trail_id] = L.latLngBounds(flat).pad(0.12);
            } else if (here) {
                allPts.push(here);
                heads.push(here);
                bounds[h.trail_id] = L.latLngBounds([here, here]).pad(0.02);
            } else {
                // no track and no coordinates: still take a slot, so `heads`
                // can never fall out of step with `trip` and mislabel the rest
                heads.push(heads[heads.length - 1] || [0, 0]);
            }
            home[h.trail_id] = heads[heads.length - 1];
        });
        if (heads.length > 1) {
            L.polyline(heads, {
                color: '#2f5c40', weight: 2, opacity: 0.5, dashArray: '7 7', interactive: false
            }).addTo(map);
        }
        const whole = L.latLngBounds(allPts.length ? allPts : heads);

        trip.forEach(h => {
            const vp = isViewpoint(h);
            L.marker(home[h.trail_id], {
                icon: L.divIcon({
                    className: '', iconSize: [26, 26],
                    html: `<div class="pin-wrap" data-id="${h.trail_id}"><div class="pin${vp ? ' vp' : ''}">` +
                          (vp ? `<span>${mark[h.trail_id]}</span>` : mark[h.trail_id]) + '</div></div>'
                })
            }).addTo(map)
              .on('mouseover', () => preview(h))
              .on('mouseout', () => preview(null))
              .on('click', () => select(h));
        });

        /**
         * Marks that land on top of each other fan apart IN SCREEN PIXELS,
         * recomputed whenever the camera rests. Nudging them in degrees moves
         * them a different distance at every zoom and can shove one clean out
         * of the framed bounds.
         */
        function refreshPins() {
            const placed = [];
            trip.forEach(h => {
                const p = map.latLngToContainerPoint(home[h.trail_id]);
                let dx = 0, dy = 0, q = p, tries = 0;
                while (placed.some(pp => pp.distanceTo(q) < 30) && tries < 12) {
                    const a = tries * (Math.PI / 3) + 0.6, r = 25 + Math.floor(tries / 6) * 15;
                    dx = Math.cos(a) * r; dy = Math.sin(a) * r;
                    q = p.add([dx, dy]);
                    tries++;
                }
                placed.push(q);
                const w = document.querySelector(`.pin-wrap[data-id="${h.trail_id}"]`);
                if (w) w.style.transform = `translate(${dx.toFixed(0)}px, ${dy.toFixed(0)}px)`;
            });
        }
        afterCut = refreshPins;

        /* ---- the sheet, as viewfinder --------------------------------- */
        const picA = $('ts-pic-a'), picB = $('ts-pic-b'), picFB = $('ts-pic-fb');
        const printEl = $('ts-print');
        let flip = true;
        function showPic(src, fallbackType) {
            if (!src) {                                  // no photograph: the type's own stamp
                picA.classList.add('off');
                picB.classList.add('off');
                picFB.style.background = YEAR_INK;
                picFB.innerHTML = atlasStampSvg(fallbackType);
                picFB.classList.add('on');
                printEl.classList.add('loaded');          // nothing developing; hold no sheen
                return;
            }
            picFB.classList.remove('on');
            const show = flip ? picB : picA, hide = flip ? picA : picB;
            if (show.src === src && !show.classList.contains('off')) return;
            const warm = blurUpPreload(src);
            const done = () => {
                show.classList.remove('off');
                hide.classList.add('off');
                flip = !flip;
                printEl.classList.add('loaded');
            };
            if (warm.complete && warm.naturalWidth) { show.src = src; done(); return; }
            printEl.classList.remove('loaded');
            show.onload = done;
            show.src = src;
        }

        const doorEl = $('ts-door'), doorGl = $('ts-door-glyph');
        const doorMain = $('ts-door-main'), doorSub = $('ts-door-sub');
        const kickEl = $('ts-kicker'), titleEl = $('ts-title');
        const subEl = $('ts-sub'), withEl = $('ts-with'), vitalsEl = $('ts-vitals');
        const noEl = $('ts-no'), ctEl = $('ts-ct');
        const vital = (v, l, wide) =>
            `<div class="ms-vital${wide ? ' wide' : ''}"><div class="v">${v}</div>` +
            (l ? `<div class="l">${l}</div>` : '') + '</div>';

        /* the trip's crew — the one fact the mark and the traverse don't carry.
           Named in full up to three; past that the card says how many, because
           one trip had six companions and the line ran off the card. */
        const crewAll = [...new Set(trip.flatMap(h => h.hiked_with || []))].sort();
        const crew = crewAll.length > 3
            ? crewAll.slice(0, 2).join(', ') + ` and ${crewAll.length - 2} others`
            : crewAll.join(', ');
        /* the place the trip actually centred on, which its NAME often doesn't
           say ("Alaska Camping Trip" was really four days at Denali) */
        const locCount = {};
        trip.forEach(h => (locCount[h.location] = (locCount[h.location] || 0) + 1));
        const locs = Object.keys(locCount).sort((a, b) => locCount[b] - locCount[a]);
        const terr = [...new Set(trip.map(h => territoryName(territoryKey(h))))].filter(Boolean).join(' · ');

        function readout(h) {
            /* AT REST — the sheet describes the whole chapter, and its vitals
               band carries the trip's numbers. That is why the traverse header
               doesn't repeat them: one home for a figure, and it is this one. */
            if (!h) {
                showPic(STAR ? MED(STAR) : null, trip[0].hike_type);
                kickEl.textContent = `THE TRAILPRINT ATLAS · CHAPTER · ${year}`;
                titleEl.innerHTML = `<span>${locs[0] || name}</span>`;
                subEl.textContent = (locs.length > 1
                    ? `and ${plural(locs.length - 1, 'other place', 'other places')} — ` : '') +
                    terr + ' · ' + span;
                withEl.textContent = crew ? `With ${crew}` : 'Walked solo, start to finish';
                vitalsEl.innerHTML = vital(days, days === 1 ? 'Day out' : 'Days out') +
                    vital(miles.toFixed(1), 'Miles') + vital(gain.toLocaleString(), 'Feet climbed');
                noEl.textContent = STAR ? 'THE OPENING FRAME' : '';
                ctEl.textContent = '';
                doorGl.innerHTML = GLYPH_MAP;
                doorMain.textContent = 'Trace this chapter on the land';
                doorSub.textContent = 'the interactive map, opened on this trip';
                doorEl.href = `map.html?trip=${encodeURIComponent(tag)}`;
                return;
            }
            /* ON A STOP — the sheet's own collar → vitals → slide → door.
               The kicker drops the "THE TRAILPRINT ATLAS" prefix the map's
               sheet carries: this card is narrower, and the chapter mark is
               engraved a few inches above it already. */
            const imgs = h.images || [];
            showPic(imgs.length ? MED(imgs[0]) : null, h.hike_type);
            const vp = isViewpoint(h);
            kickEl.textContent = `SHEET NO. ${h.trail_id.replace('tta_', '')} · ${h.hike_type.toUpperCase()}`;
            titleEl.innerHTML = `<span>${h.trail_name}</span>`;
            subEl.textContent = `${h.location} — ${h.region} · ${vp ? 'Visited' : 'Hiked'} ` +
                formatHikeDate(h.date_completed);
            withEl.textContent = (h.hiked_with && h.hiked_with.length)
                ? `With ${h.hiked_with.join(', ')}` : 'Walked solo';
            // the map sheet's own rule: a viewpoint with no miles gets one wide
            // cell instead of a band of zeroes, and a real summit earns a column
            if (vp && !h.miles) {
                vitalsEl.innerHTML = vital('A SCENIC VIEWPOINT', '', true);
            } else {
                let v = vital(h.miles, 'Miles') + vital((h.elevation_gain || 0).toLocaleString(), 'Feet climbed');
                if (h.summit_trail && h.summit_elevation) {
                    v += vital(h.summit_elevation.toLocaleString(), summitLabel(h));
                }
                vitalsEl.innerHTML = v + vital(h.difficulty, 'Grade');
            }
            noEl.textContent = imgs.length ? '01' : 'NO FRAME FILED';
            ctEl.textContent = imgs.length > 1 ? `${imgs.length} SLIDES` : '';
            doorGl.innerHTML = GLYPH_LOG;
            doorMain.textContent = 'Open the field log';
            doorSub.textContent = 'the whole day — the map, every slide & the almanac';
            doorEl.href = `hike.html?id=${h.trail_id}`;
        }

        /* =================================================================
           THE TRAVERSE
           ================================================================= */
        const svg = $('trav-svg');
        const rangeEl = $('t-range');
        const segs = [];
        trip.forEach((h, i) => {
            /* A gap belongs wherever ground was COVERED, not wherever the date
               changed: one trip's five stops all fall on a single day and still
               sit miles and 2,000 vertical feet apart. Past a mile gets a run. */
            if (i > 0 && typeof h.latitude === 'number' && typeof trip[i - 1].latitude === 'number') {
                const km = havKm([trip[i - 1].latitude, trip[i - 1].longitude], [h.latitude, h.longitude]);
                if (km > 1.6) segs.push({ travel: true, mi: Math.round(km * 0.621), w: km > 40 ? 46 : 34 });
            }
            const prof = elevations[h.trail_id];
            segs.push({
                h, prof, ix: i, vp: isViewpoint(h),
                w: prof ? Math.max(74, Math.min(280, (h.miles || 1) * 26)) : (isViewpoint(h) ? 38 : 52)
            });
        });

        let selected = null, hovered = null;
        const stops = [];              // live station nodes, so lighting one is a repaint
        const AXIS_W = 58;             // the left gutter carrying the vertical scale
        const diamond = (cx, cy, r) => `M${cx},${cy - r} L${cx + r},${cy} L${cx},${cy + r} L${cx - r},${cy} Z`;

        function drawTraverse() {
            const W = svg.clientWidth || svg.parentNode.clientWidth;
            const H = svg.clientHeight || (LEVEL ? 88 : 166);
            if (!W) return;
            const raw = segs.reduce((s, g) => s + g.w, 0);
            const gutter = LEVEL ? 0 : AXIS_W;
            const k = (W - gutter) / raw;
            const base = H - 42, top = 14;
            const vals = segs.filter(g => g.prof).flatMap(g => g.prof);
            /* the floor is the trip's OWN lowest ground, not sea level — seeding
               the minimum at 0 put a 4,100 ft plateau at the top of the plot and
               filled everything beneath it */
            const hi = vals.length ? Math.max(...vals) : 1;
            const lo = vals.length ? Math.min(...vals) : 0;
            /* the axis never spans less than 900 ft: without a floor, a trip that
               climbs 394 ft across five desert loops drew like an alpine range —
               the shape was honest, the impression was a lie */
            const spanFt = Math.max(hi - lo, 900);
            const y = LEVEL ? (() => base) : (ft => base - (ft - lo) / spanFt * (base - top));
            rangeEl.textContent = LEVEL
                ? `Level ground · ${gain.toLocaleString()} ft climbed all trip`
                : `Vertical section · cut at ${Math.round(lo).toLocaleString()} ft`;

            svg.innerHTML = '';
            let x = gutter;
            segs.forEach(g => { g.x0 = x; g.px = g.w * k; x += g.px; });

            /* ---- THE VERTICAL SCALE ---------------------------------------
               The floor of the plot is the trip's own lowest ground, but drawn
               as a bare line under a filled block it read as SEA LEVEL — a gap
               between days sitting at 4,427 ft looked like zero. Three cues fix
               it, and they only work together: a labelled scale down the left,
               a fill that fades out before it reaches the floor rather than
               sitting solidly on it, and a hatched cut band beneath the datum —
               the cross-section convention for "the ground continues below". */
            if (!LEVEL && vals.length) {
                const defs = el('defs', {});
                const hatch = el('pattern', {
                    id: 'trip-cut', width: 7, height: 7,
                    patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)'
                });
                hatch.appendChild(el('line', {
                    x1: 0, y1: 0, x2: 0, y2: 7, stroke: '#7a6846', 'stroke-opacity': 0.42, 'stroke-width': 1
                }));
                defs.appendChild(hatch);
                const grad = el('linearGradient', { id: 'trip-terra', x1: 0, y1: 0, x2: 0, y2: 1 });
                grad.appendChild(el('stop', { offset: '0%', 'stop-color': '#4a7c59', 'stop-opacity': 0.40 }));
                grad.appendChild(el('stop', { offset: '70%', 'stop-color': '#4a7c59', 'stop-opacity': 0.17 }));
                grad.appendChild(el('stop', { offset: '100%', 'stop-color': '#4a7c59', 'stop-opacity': 0.02 }));
                defs.appendChild(grad);
                svg.appendChild(defs);

                // the unit rides on the TOP tick — a separate "FEET" caption sat
                // on it whenever the high point reached the ceiling, which is
                // most trips
                const mid = (lo + hi) / 2;
                [[lo, true], [mid, false], [hi, false]].forEach(([ft, isDatum], i) => {
                    if (!isDatum && Math.abs(ft - lo) < 40) return;    // too close to read
                    const yy = y(ft);
                    svg.appendChild(el('line', {
                        x1: gutter, y1: yy, x2: W, y2: yy, stroke: '#7a6846',
                        'stroke-opacity': isDatum ? 0.5 : 0.16,
                        'stroke-dasharray': isDatum ? '' : '2 5'
                    }));
                    const t = el('text', { x: gutter - 9, y: yy + 3, 'text-anchor': 'end', class: 't-ax' });
                    t.textContent = Math.round(ft).toLocaleString() + (i === 2 ? ' FT' : '');
                    svg.appendChild(t);
                });
                // the cut: the earth keeps going below the datum, we stop drawing
                svg.appendChild(el('rect', {
                    x: gutter, y: base + 1, width: W - gutter, height: 9, fill: 'url(#trip-cut)'
                }));
            }

            /* Terrain first, then the ground between it. A gap RAMPS from where
               the last trail left off to where the next begins — driving from
               sea level to 2,700 ft is elevation gained, and drawing it flat
               left a vertical wall at every trailhead. A viewpoint has no track
               of its own, so it rides that ramp, which is what it did in life. */
            const endY = g => y(g.prof[g.prof.length - 1]);
            const startY = g => y(g.prof[0]);
            segs.forEach(g => {
                if (!g.prof) return;
                g.pts = g.prof.map((ft, i) => [g.x0 + (i / (g.prof.length - 1)) * g.px, y(ft)]);
            });
            for (let i = 0; i < segs.length;) {
                if (segs[i].prof) { i++; continue; }
                let j = i;
                while (j < segs.length && !segs[j].prof) j++;
                const rx0 = segs[i].x0, rx1 = segs[j - 1].x0 + segs[j - 1].px;
                let a = null, b = null;
                for (let q = i - 1; q >= 0; q--) if (segs[q].prof) { a = endY(segs[q]); break; }
                for (let q = j; q < segs.length; q++) if (segs[q].prof) { b = startY(segs[q]); break; }
                const yA = a !== null ? a : (b !== null ? b : base);
                const yB = b !== null ? b : (a !== null ? a : base);
                const at = xx => yA + (yB - yA) * ((xx - rx0) / Math.max(1, rx1 - rx0));
                for (let q = i; q < j; q++) {
                    segs[q].pts = [[segs[q].x0, at(segs[q].x0)],
                                   [segs[q].x0 + segs[q].px, at(segs[q].x0 + segs[q].px)]];
                }
                i = j;
            }
            let d = '';
            segs.forEach((g, i) => g.pts.forEach((pt, q) =>
                (d += (i === 0 && q === 0 ? 'M' : 'L') + pt[0].toFixed(1) + ',' + pt[1].toFixed(1) + ' ')));

            /* only GROUND HE WALKED is filled. The ramps between are real
               elevation too, but they were driven — so they stay a line, and the
               filled blocks read at a glance as "these are the hikes". */
            if (!LEVEL) segs.forEach(g => {
                if (!g.prof) return;
                let dd = '';
                g.pts.forEach((pt, q) => (dd += (q ? 'L' : 'M') + pt[0].toFixed(1) + ',' + pt[1].toFixed(1) + ' '));
                svg.appendChild(el('path', {
                    d: dd + `L${(g.x0 + g.px).toFixed(1)},${base} L${g.x0.toFixed(1)},${base} Z`,
                    fill: 'url(#trip-terra)'
                }));
            });
            svg.appendChild(el('path', {
                d, fill: 'none', stroke: '#2f5c40', 'stroke-opacity': '0.55',
                'stroke-width': '1.8', 'stroke-linejoin': 'round'
            }));
            svg.appendChild(el('line', {
                x1: gutter, y1: base, x2: W, y2: base, stroke: '#7a6846', 'stroke-opacity': '0.55'
            }));

            /* LEVEL GROUND: say plainly what this rule is and is not. A straight
               line must never be read as "no climbing happened" — it means the
               climbing was too small to draw honestly at any useful scale. */
            if (LEVEL) {
                const c = el('text', { x: W, y: top + 4, 'text-anchor': 'end', class: 't-caveat' });
                c.textContent = 'Under 100 ft climbed all trip — drawn to sequence, not to height.';
                svg.appendChild(c);
            }

            /* The lit stop's own stretch, in the year's ink. Built ONCE and
               hidden; lighting it is a display toggle, never a rebuild —
               redrawing the whole SVG on hover destroyed the very node the
               cursor sat on, which re-fired its own mouseenter: an endless
               redraw that also ate every click before it could land. */
            segs.forEach(g => {
                if (!g.prof || !g.h) return;
                let dd = '';
                g.prof.forEach((ft, i) => {
                    dd += (i ? 'L' : 'M') + (g.x0 + (i / (g.prof.length - 1)) * g.px).toFixed(1) +
                          ',' + y(ft).toFixed(1) + ' ';
                });
                g.litFill = el('path', {
                    d: dd + `L${(g.x0 + g.px).toFixed(1)},${base} L${g.x0.toFixed(1)},${base} Z`,
                    fill: YEAR_INK, 'fill-opacity': LEVEL ? '0' : '0.2', display: 'none'
                });
                g.litLine = el('path', {
                    d: dd, fill: 'none', stroke: YEAR_INK,
                    'stroke-width': LEVEL ? '3.4' : '2.4', 'stroke-linejoin': 'round', display: 'none'
                });
                svg.appendChild(g.litFill);
                svg.appendChild(g.litLine);
            });

            // travel runs: dashed, labelled with the miles actually covered
            segs.forEach(g => {
                if (!g.travel) return;
                svg.appendChild(el('line', {
                    x1: g.pts[0][0] + 2, y1: g.pts[0][1], x2: g.pts[1][0] - 2, y2: g.pts[1][1],
                    stroke: '#2f5c40', 'stroke-opacity': '0.6', 'stroke-width': '1.8', 'stroke-dasharray': '5 5'
                }));
                const t = el('text', { x: g.x0 + g.px / 2, y: base + 14, 'text-anchor': 'middle', class: 't-mi' });
                t.textContent = g.mi > 0 ? g.mi + ' mi' : 'onward';
                svg.appendChild(t);
            });

            // the day bands, under the run — viewpoints included, see `days`
            let dayStart = null, dayNo = 0, lastStop = null;
            const flushDay = (ds, lastSeg) => {
                const x1 = lastSeg.x0 + lastSeg.px;
                svg.appendChild(el('line', {
                    x1: ds.x0, y1: base + 24, x2: x1, y2: base + 24, stroke: '#7a6846', 'stroke-opacity': '0.35'
                }));
                const t = el('text', { x: (ds.x0 + x1) / 2, y: base + 36, 'text-anchor': 'middle', class: 't-day' });
                t.textContent = `DAY ${ds.no} · ` +
                    formatHikeDate(ds.date, { month: 'short', day: 'numeric' }).toUpperCase();
                svg.appendChild(t);
            };
            segs.forEach(g => {
                if (g.travel) return;
                if (!dayStart || g.h.date_completed !== dayStart.date) {
                    if (dayStart) flushDay(dayStart, lastStop);
                    dayStart = { date: g.h.date_completed, x0: g.x0, no: ++dayNo };
                }
                lastStop = g;
            });
            if (dayStart) flushDay(dayStart, lastStop);

            /* ---- the marks -------------------------------------------------
               A HIKE is a station: it stands ON the baseline, numbered, with a
               leader up to its own terrain. A VIEWPOINT never touches the
               baseline — it is a dashed diamond floating on the travelled ramp,
               lettered, because it is a sighting made along the way rather than
               ground the Atlas counts as walked. */
            stops.length = 0;
            segs.forEach(g => {
                if (g.travel) return;
                const cx = g.x0 + g.px / 2;
                const grp = el('g', { class: 't-st' });
                const s = { g, id: g.h.trail_id, vp: g.vp, cx };

                if (g.vp) {
                    const cy = (g.pts[0][1] + g.pts[1][1]) / 2 - 13;
                    s.cy = cy;
                    s.shape = el('path', {
                        d: diamond(cx, cy, 8.5), fill: '#f0e7cf', stroke: '#7a6846',
                        'stroke-width': 1.3, 'stroke-dasharray': '2.6 2.2'
                    });
                    s.txt = el('text', {
                        x: cx, y: cy + 3.4, 'text-anchor': 'middle', class: 't-num',
                        'font-style': 'italic', fill: '#6f6a58'
                    });
                    grp.appendChild(s.shape);
                } else {
                    const cy = g.prof ? y(g.prof[Math.floor(g.prof.length / 2)])
                                     : (g.pts[0][1] + g.pts[1][1]) / 2;
                    s.leader = el('line', {
                        x1: cx, y1: cy, x2: cx, y2: base,
                        stroke: '#7a6846', 'stroke-opacity': 0.3, 'stroke-dasharray': '3 3'
                    });
                    s.shape = el('circle', {
                        cx, cy: base, r: 8, fill: '#f0e7cf', stroke: '#7a6846', 'stroke-width': 1.4
                    });
                    s.txt = el('text', {
                        x: cx, y: base + 3.6, 'text-anchor': 'middle', class: 't-num', fill: '#6f6a58'
                    });
                    grp.appendChild(s.leader);
                    grp.appendChild(s.shape);
                }
                s.txt.textContent = mark[g.h.trail_id];
                grp.appendChild(s.txt);

                grp.appendChild(el('rect', { x: g.x0, y: 0, width: g.px, height: base + 18, class: 'hit' }));
                grp.addEventListener('mouseenter', () => preview(g.h));
                grp.addEventListener('mouseleave', () => preview(null));
                grp.addEventListener('click', ev => { ev.stopPropagation(); select(g.h); });
                svg.appendChild(grp);
                stops.push(s);
            });
            paintLit();
        }

        /** The only thing hover and selection touch: which stop is lit. */
        function paintLit() {
            const on = hovered || selected;
            segs.forEach(g => {
                if (!g.litFill) return;
                const lit = g.h && g.h.trail_id === on;
                g.litFill.setAttribute('display', lit ? '' : 'none');
                g.litLine.setAttribute('display', lit ? '' : 'none');
            });
            stops.forEach(s => {
                const lit = s.id === on;
                s.txt.setAttribute('fill', lit ? '#fff' : '#6f6a58');
                s.shape.setAttribute('fill', lit ? YEAR_INK : '#f0e7cf');
                s.shape.setAttribute('stroke', lit ? YEAR_INK : '#7a6846');
                if (s.vp) {
                    s.shape.setAttribute('d', diamond(s.cx, s.cy, lit ? 10 : 8.5));
                } else {
                    s.shape.setAttribute('r', lit ? 10 : 8);
                    s.leader.setAttribute('stroke', lit ? YEAR_INK : '#7a6846');
                    s.leader.setAttribute('stroke-opacity', lit ? 0.85 : 0.3);
                }
            });
        }

        function highlight() {
            const on = hovered || selected;
            Object.keys(lines).forEach(id => lines[id].forEach(pl => pl.setStyle({
                opacity: !on ? 0.9 : (id === on ? 1 : 0.28),
                weight: id === on ? 4 : 3.2
            })));
            document.querySelectorAll('.pin-wrap').forEach(w => {
                const me = w.dataset.id === on, p = w.firstElementChild;
                p.style.backgroundColor = me ? YEAR_INK : '#f0e7cf';
                p.style.color = me ? '#fff' : '#24401f';
                p.style.borderColor = me ? YEAR_INK : '#24401f';
                p.style.setProperty('--s', me ? 1.18 : 1);
            });
        }

        /** hovering changes what you SEE; it never moves the camera */
        function preview(h) {
            hovered = h ? h.trail_id : null;
            readout(h || (selected ? byTrail[selected] : null));
            highlight();
            paintLit();
        }
        /** clicking changes where you STAND — the one thing that cuts the camera */
        function select(h) {
            selected = h ? h.trail_id : null;
            hovered = null;
            readout(h);
            highlight();
            paintLit();
            // no arbitrary cap: a viewpoint is a single point so it needs one
            // (or it would zoom to the pavement), but a trail and the whole
            // expedition are each framed by their own extent
            cutTo(h ? bounds[h.trail_id] : whole, h ? (isViewpoint(h) ? 14 : 16) : 15);
        }

        // clicking the empty ground pulls back to the whole chapter
        svg.addEventListener('click', () => select(null));
        map.on('click', () => select(null));
        // and the arrows walk it, exactly as the map's transport does
        document.addEventListener('keydown', e => {
            // one handler for the whole page: Escape raises the frontispiece
            // first, and only afterwards means "pull back to the whole chapter"
            if (!lifted) { if (e.key === 'Escape') lift(); return; }
            if (e.key === 'Escape') { select(null); return; }
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            e.preventDefault();
            const i = selected ? trip.findIndex(h => h.trail_id === selected) : -1;
            select(trip[Math.max(0, Math.min(trip.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)))]);
        });

        // a level trip's panel collapses — chromePads() measures it, so the
        // camera reclaims the freed space by itself
        if (LEVEL) $('trav').classList.add('is-level');

        readout(null);
        drawTraverse();
        window.addEventListener('resize', () => {
            map.invalidateSize();
            drawTraverse();
            reframe();
            refreshPins();
        });
        setTimeout(() => { map.invalidateSize(); cutTo(whole, 15); }, 80);

    }).catch(error => {
        console.error('Error initializing the trip page:', error);
        showLost('Could not load this chapter. Please check the console.');
    });
});
