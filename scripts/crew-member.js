/**
 * THE SERVICE RECORD — one companion's own leaf of the Muster Roll.
 *
 * URL: crew-member.html?name=Will%20R.
 *
 * The crew index is a book, so a person is not a separate page: they are a
 * page IN it, reached by turning (see crew-book.js). Same volume, same
 * paper, same gutter.
 *
 *   LEFT LEAF, the record: the portrait in the cover's own mount, the
 *   service block as a ledger rather than a stat row, and this person's
 *   single lane from the roll, ENLARGED.
 *
 *   RIGHT LEAF, the plates: the country walked together, one numbered plate
 *   per region, on the Atlas's own basemap in year ink. Outings too far
 *   from the rest to share a plate print as line art on a loose sheet —
 *   a plate for one trail 2,000 miles from the next is a map of nothing.
 *
 *   THE TIE: the enlarged lane is the INDEX to the plates. Hover a mark and
 *   its trail lights on whichever plate holds it; hover a trail and its mark
 *   lights back. The left leaf asks when, the right leaf answers where.
 *
 * The plates never pan or zoom. Roaming the land belongs to map.html.
 */
document.addEventListener('DOMContentLoaded', async () => {

    const name = new URLSearchParams(window.location.search).get('name');

    let allHikes, portraits, geometries;
    try {
        allHikes = await fetchHikes();
        portraits = await fetchCrewPortraits();
        geometries = await fetchTrailGeometries();
    } catch (err) {
        console.error('Could not load the Atlas records:', err);
        geometries = geometries || {};
    }

    const shared = (allHikes && name)
        ? [...(groupByCompanion(allHikes).get(name) || [])].sort(compareHikesChrono)
        : [];

    /* ---- the friendly dead end: a name that isn't in the book ---- */
    if (shared.length === 0) {
        document.getElementById('member-name').textContent = 'Not in the book';
        document.getElementById('sig-no').textContent = 'No signature';
        document.getElementById('member-portrait').remove();
        document.getElementById('member-service').innerHTML =
            `<div><span class="k">Note</span><span class="v">No shared outings are recorded under that name.</span></div>`;
        document.getElementById('member-lane-block').remove();
        document.getElementById('member-sheets').innerHTML = `
            <div class="bk-lost">
                <div class="tl-kick">The Trailprint Atlas</div>
                <h2 class="tl-title">An unsigned page</h2>
                <p class="tl-msg">Every companion in the Atlas has a leaf in the Muster Roll. This one has no entry, so there is no country to draw.</p>
            </div>`;
        bookWireTurns(document);
        bookOpen();
        return;
    }

    const first = shared[0], last = shared[shared.length - 1];
    const totalMiles = shared.reduce((s, h) => s + h.miles, 0);
    const totalFeet = shared.reduce((s, h) => s + h.elevation_gain, 0);
    const trips = [...new Set(shared.filter(h => h.trip_tag).map(h => h.trip_tag))];
    const ink = (h) => ATLAS_CONFIG.COLOR_MAP[hikeYear(h)] || ATLAS_CONFIG.DEFAULT_COLOR;
    const initials = name.split(/\s+/).map(w => w[0]).join('');

    /* ---- their number in the register is signature order, the same order
            the roll itself is entered in ---- */
    const firstOf = new Map();
    [...allHikes].sort(compareHikesChrono).forEach(h =>
        (h.hiked_with || []).forEach(n => { if (!firstOf.has(n)) firstOf.set(n, h); }));
    const sigNo = [...firstOf.entries()]
        .sort((a, b) => compareHikesChrono(a[1], b[1]))
        .findIndex(([n]) => n === name) + 1;

    /* =====================================================================
       THE RECORD
       ===================================================================== */
    document.title = `${name} - Trail Crew - The Trailprint Atlas`;
    document.getElementById('sig-no').textContent = `Signature No. ${sigNo}`;
    document.getElementById('member-name').textContent = name;

    // one season together is a year, not a range
    const span = hikeYear(first) === hikeYear(last)
        ? `${hikeYear(first)}` : `${hikeYear(first)}&ndash;${hikeYear(last)}`;

    const pid = portraits[name];
    document.getElementById('member-portrait').innerHTML =
        (pid
            ? `<img src="${cloudinaryUrl(pid, 'w_640,h_480,c_fill,g_auto,q_auto,f_auto')}" alt="${name}">`
            : `<div class="blank">${initials}</div>`) +
        `<div class="cap"><span>PLATE &mdash; PORTRAIT</span><span>${span}</span></div>`;

    // a single shared outing IS both the first and the last, and saying so
    // twice makes the record look padded rather than short
    const lastSeenRow = shared.length > 1
        ? `<div><span class="k">Last seen</span><span class="v">${last.trail_name}<br><em>${formatHikeDate(last.date_completed)}</em></span></div>`
        : '';
    document.getElementById('member-service').innerHTML = `
        <div><span class="k">Signed in</span><span class="v">${first.trail_name}<br><em>${formatHikeDate(first.date_completed)}</em></span></div>
        ${lastSeenRow}
        <div><span class="k">Outings</span><span class="v"><b>${shared.length}</b></span></div>
        <div><span class="k">Ground</span><span class="v"><b>${totalMiles.toFixed(1)}</b> mi &nbsp;&middot;&nbsp; <b>${totalFeet.toLocaleString()}</b> ft climbed</span></div>
        ${trips.length ? `<div><span class="k">Trips</span><span class="v">${trips.map(tag =>
            `<a href="trip.html?tag=${encodeURIComponent(tag)}">${tripName(tag)}</a>`).join('<br>')}</span></div>` : ''}`;

    // the way back lands on this person's own line in the roll, opened,
    // rather than at the top of the book
    const backDoor = document.getElementById('member-back');
    const backHref = `crew.html?open=${encodeURIComponent(name)}`;
    backDoor.href = backHref;
    backDoor.dataset.turnTo = backHref;

    /* =====================================================================
       THE LANE — the roll's own track, given room to become an index
       ===================================================================== */
    const chronological = [...allHikes].sort(compareHikesChrono);
    const firstYear = hikeYear(chronological[0]);
    const thisYear = new Date().getUTCFullYear();
    const T0 = Date.UTC(firstYear, 0, 1), T1 = Date.UTC(thisYear + 1, 0, 1);
    const pct = (dateStr) => ((Date.parse(dateStr) - T0) / (T1 - T0)) * 100;
    const years = [];
    for (let y = firstYear; y <= thisYear; y++) years.push(y);
    const midOf = (y) => (pct(`${y}-01-01`) + pct(`${y + 1}-01-01`)) / 2;

    const laneEl = document.getElementById('member-lane');
    const left = pct(first.date_completed);

    /**
     * Lays the marks out, stacking any that collide.
     *
     * At this width two outings a day apart draw on top of each other, and a
     * mark buried under its neighbour cannot be pointed at — which would make
     * some trails unreachable on the very leaf where the lane's job is to be
     * the index to the plates. So a mark takes the lowest row that is clear,
     * exactly as a survey sheet stacks coincident points. Measured in pixels,
     * because "too close" is a screen question, not a calendar one — the same
     * reasoning as the map page's stamp fanning.
     */
    const TICK_D = 12, STACK = 12, MAX_ROWS = 4;
    function layoutLane() {
        const width = laneEl.clientWidth || 300;
        const lastInRow = [];
        const placed = shared.map(hike => {
            const x = pct(hike.date_completed) / 100 * width;
            let row = 0;
            while (row < MAX_ROWS && lastInRow[row] !== undefined && x - lastInRow[row] < TICK_D) row++;
            if (row >= MAX_ROWS) row = 0;   // a tower helps nobody; let the rare deep pile overlap
            lastInRow[row] = x;
            return { hike, row };
        });
        const rows = Math.max(1, lastInRow.length);
        laneEl.style.setProperty('--lane-h', `${26 + (rows - 1) * STACK + 14}px`);
        laneEl.innerHTML =
            years.map(y => `<span class="gl" style="left:${pct(`${y}-01-01`)}%"></span>`).join('') +
            years.map(y => `<span class="yr" style="left:${midOf(y)}%">${String(y).slice(2)}</span>`).join('') +
            `<span class="span" style="left:${left}%;width:${Math.max(0.3, pct(last.date_completed) - left)}%"></span>` +
            // a stacked mark keeps a hairline down to the moment it happened
            placed.filter(p => p.row > 0).map(p =>
                `<span class="stem" style="left:${pct(p.hike.date_completed)}%;bottom:26px;height:${p.row * STACK}px"></span>`).join('') +
            placed.map(({ hike, row }) => `<a class="tick" data-h="${hike.trail_id}" href="hike.html?id=${hike.trail_id}"
                title="${hike.trail_name}" style="left:${pct(hike.date_completed)}%;--r:${row};background:${ink(hike)}"></a>`).join('');
        wireTicks();
    }

    const readout = document.getElementById('member-readout');
    const restReadout = () => {
        readout.className = 'readout rest';
        readout.innerHTML =
            `<div class="t">${shared.length} outing${shared.length === 1 ? '' : 's'} together, ${span}.</div>`;
    };
    restReadout();
    layoutLane();
    // the leaf is fluid, so what collides changes with the window
    let laneTimer;
    window.addEventListener('resize', () => {
        clearTimeout(laneTimer);
        laneTimer = setTimeout(layoutLane, 180);
    });

    /* =====================================================================
       THE PLATES

       Complete-linkage clustering with a diameter cap: two groups merge only
       if EVERY pair in the union stays within MAX_PLATE_SPAN_KM. That is
       order-independent (no drifting centroids, no orphaned neighbours) and
       the cap directly bounds each plate's zoom, so a plate can never sprawl
       past legibility. Always merge the tightest compatible pair first, so
       natural regions form before loose ones.
       ===================================================================== */
    const MAX_PLATE_SPAN_KM = 75;
    const kmBetween = (a, b) => {
        const R = 6371;
        const dLat = (b.latitude - a.latitude) * Math.PI / 180;
        const dLon = (b.longitude - a.longitude) * Math.PI / 180;
        const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(a.latitude * Math.PI / 180) * Math.cos(b.latitude * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(s));
    };
    const mergedSpan = (a, b) => {
        const union = [...a.hikes, ...b.hikes];
        let span = 0;
        for (let i = 0; i < union.length; i++)
            for (let j = i + 1; j < union.length; j++) span = Math.max(span, kmBetween(union[i], union[j]));
        return span;
    };
    let clusters = shared.filter(h => h.latitude && h.longitude).map(h => ({ hikes: [h] }));
    while (clusters.length > 1) {
        let best = null;
        for (let i = 0; i < clusters.length; i++)
            for (let j = i + 1; j < clusters.length; j++) {
                const span = mergedSpan(clusters[i], clusters[j]);
                if (span <= MAX_PLATE_SPAN_KM && (!best || span < best.span)) best = { i, j, span };
            }
        if (!best) break;   // nothing left that can merge without over-stretching a plate
        clusters[best.i].hikes.push(...clusters[best.j].hikes);
        clusters.splice(best.j, 1);
    }
    clusters.forEach(c => c.hikes.sort(compareHikesChrono));
    clusters.sort((a, b) => b.hikes.length - a.hikes.length);

    // a plate names itself from its locations: one place speaks for itself,
    // a mixed cluster leads with its most-walked one
    const plateTitle = (cluster) => {
        const tally = {};
        cluster.hikes.forEach(h => { tally[h.location] = (tally[h.location] || 0) + 1; });
        const places = Object.entries(tally).sort((a, b) => b[1] - a[1]);
        return places.length === 1 ? places[0][0] : `${places[0][0]} & nearby`;
    };
    const regions = clusters.filter(c => c.hikes.length > 1);
    const singles = clusters.filter(c => c.hikes.length === 1).map(c => c.hikes[0]);
    const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

    document.getElementById('member-platecount').innerHTML =
        (regions.length ? `${regions.length} plate${regions.length === 1 ? '' : 's'}` : 'No plates') +
        (singles.length ? ` &middot; ${singles.length} loose` : '');

    /* ---- every frame enters the DOM first, so Leaflet measures a settled
            layout rather than a column still reflowing around it ---- */
    const platesEl = document.getElementById('member-plates');
    regions.forEach((cluster, i) => {
        const plate = document.createElement('div');
        plate.className = 'plate';
        plate.innerHTML = `
            <div class="p-collar">
                <div>
                    <div class="p-no">Plate ${ROMAN[i] || i + 1}</div>
                    <div class="p-name">${plateTitle(cluster)}</div>
                </div>
                <span class="p-cnt">${cluster.hikes.length} together</span>
            </div>
            <div class="p-map" id="plate-map-${i}"></div>`;
        platesEl.appendChild(plate);
    });

    /* ---- the Atlas basemap: the same stack map.js wears (CARTO Voyager,
            Esri hillshade multiplied over it, quiet labels under the
            parchment wash) so a plate has the Atlas's own complexion ---- */
    const VOYAGER_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png';
    const HILLSHADE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}';
    const LABELS_URL = 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png';

    const inkLayers = {};       // trail_id -> [leaflet layers], for the cross-light
    const plateFits = [];       // (map, bounds) pairs, for post-layout re-fits

    regions.forEach((cluster, i) => {
        // static, like the hike page's map: this is a plate, not a vehicle
        const plateMap = L.map(`plate-map-${i}`, {
            zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
            touchZoom: false, boxZoom: false, keyboard: false
        });
        L.tileLayer(VOYAGER_URL, { subdomains: 'abcd', maxZoom: 18, attribution: '&copy; CARTO' }).addTo(plateMap);
        L.tileLayer(HILLSHADE_URL, { maxNativeZoom: 16, maxZoom: 18, className: 'hillshade-multiply', attribution: 'Esri' }).addTo(plateMap);
        L.tileLayer(LABELS_URL, { subdomains: 'abcd', maxZoom: 18, className: 'atlas-labels' }).addTo(plateMap);
        const wash = document.createElement('div');
        wash.className = 'parchment-wash';
        plateMap.getContainer().appendChild(wash);

        const bounds = L.latLngBounds([]);
        cluster.hikes.forEach(hike => {
            const segments = geometries[hike.trail_id];
            const drawn = [];
            if (segments) {
                segments.forEach(seg => {
                    const line = L.polyline(seg, { color: ink(hike), weight: 3.8, opacity: 0.95 }).addTo(plateMap);
                    drawn.push(line);
                    bounds.extend(line.getBounds());
                });
            } else {
                // viewpoints and missing tracks still hold their place
                const dot = L.circleMarker([hike.latitude, hike.longitude], {
                    radius: 5, color: '#fffdf6', weight: 2, fillColor: ink(hike), fillOpacity: 1
                }).addTo(plateMap);
                drawn.push(dot);
                bounds.extend(dot.getLatLng());
            }
            inkLayers[hike.trail_id] = drawn;
            drawn.forEach(layer => {
                layer.on('mouseover', () => light(hike.trail_id));
                layer.on('mouseout', unlight);
                layer.on('click', () => { window.location.href = `hike.html?id=${hike.trail_id}`; });
            });
        });
        plateMap.fitBounds(bounds, { padding: [18, 18] });
        plateFits.push({ map: plateMap, bounds });
    });

    // Late layout shifts (web fonts landing, a scrollbar appearing) change
    // container sizes after init — re-measure and re-centre every plate.
    const refitPlates = () => plateFits.forEach(({ map, bounds }) => {
        map.invalidateSize();
        map.fitBounds(bounds, { padding: [18, 18] });
    });
    setTimeout(refitPlates, 80);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refitPlates);

    /* ---- the loose sheet ---- */
    if (singles.length > 0) {
        document.getElementById('member-loose').hidden = false;
        // "too far from the rest" is only true when there IS a rest — with no
        // plates at all, the loose sheet is simply the whole record
        document.getElementById('member-loose-count').textContent = regions.length
            ? `${singles.length} outing${singles.length === 1 ? '' : 's'} too far from the rest to share a plate`
            : `${singles.length === 1 ? 'the one outing' : `all ${singles.length} outings`} you have walked together, drawn as ${singles.length === 1 ? 'its own trailprint' : 'their own trailprints'}`;
        document.getElementById('member-prints').innerHTML = singles.map(hike => `
            <a class="print" data-h="${hike.trail_id}" href="hike.html?id=${hike.trail_id}">
                ${trailprintSVG(geometries[hike.trail_id], ink(hike))}
                <div class="t">${hike.trail_name}</div>
                <div class="p">${hike.location}</div>
            </a>`).join('');
    }

    /* =====================================================================
       THE TIE — a mark on the lane and its trail on the plates, both ways
       ===================================================================== */
    const byId = new Map(shared.map(h => [h.trail_id, h]));
    function light(id) {
        const hike = byId.get(id);
        if (!hike) return;
        readout.className = 'readout';
        readout.innerHTML =
            `<div class="t">${hike.trail_name}</div>
             <div class="d">${formatHikeDate(hike.date_completed)} &middot; ${hike.location}</div>`;
        laneEl.classList.add('reading');
        laneEl.querySelectorAll('.tick').forEach(tick => tick.classList.toggle('lit', tick.dataset.h === id));
        // every other trail steps back so the lit one is found at a glance,
        // but never so far that the plate reads as empty
        Object.entries(inkLayers).forEach(([tid, layers]) => layers.forEach(layer => {
            if (layer.setStyle) layer.setStyle(tid === id
                ? { weight: 5.5, opacity: 1 }
                : { weight: 3.4, opacity: 0.38 });
        }));
        document.querySelectorAll('.print').forEach(p => p.classList.toggle('lit', p.dataset.h === id));
    }
    function unlight() {
        restReadout();
        laneEl.classList.remove('reading');
        laneEl.querySelectorAll('.tick').forEach(tick => tick.classList.remove('lit'));
        Object.values(inkLayers).forEach(layers => layers.forEach(layer => {
            if (layer.setStyle) layer.setStyle({ weight: 3.8, opacity: 0.95 });
        }));
        document.querySelectorAll('.print').forEach(p => p.classList.remove('lit'));
    }

    // the lane is rebuilt whenever the leaf changes width, so its marks are
    // wired from there rather than once at the end
    function wireTicks() {
        laneEl.querySelectorAll('.tick').forEach(tick => {
            tick.addEventListener('mouseenter', () => light(tick.dataset.h));
            tick.addEventListener('mouseleave', unlight);
            tick.addEventListener('focus', () => light(tick.dataset.h));
            tick.addEventListener('blur', unlight);
        });
    }
    document.querySelectorAll('.print').forEach(print => {
        print.addEventListener('mouseenter', () => light(print.dataset.h));
        print.addEventListener('mouseleave', unlight);
    });

    bookWireTurns(document);
    bookOpen();
});

/**
 * A trail's shape as standalone line art — the literal trailprint. The GPX
 * geometry normalised into a small square, drawn in the hike's year ink with
 * no basemap beneath it. Trackless outings (viewpoints) print as a single
 * mark. Equirectangular with a latitude correction, so shapes aren't stretched.
 * @param {Array|undefined} segments - [lat, lng] segment arrays from trails.geojson
 * @param {string} color - the hike's year ink
 */
function trailprintSVG(segments, color) {
    const S = 96, PAD = 9;
    if (!segments) {
        return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
            <circle cx="${S / 2}" cy="${S / 2}" r="6" fill="${color}" stroke="#fffdf6" stroke-width="2"/></svg>`;
    }
    const pts = segments.flat();
    const lats = pts.map(p => p[0]), lons = pts.map(p => p[1]);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const cosMid = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
    const w = (maxLon - minLon) * cosMid, h = maxLat - minLat;
    const scale = (S - 2 * PAD) / Math.max(w, h);
    const offX = (S - w * scale) / 2, offY = (S - h * scale) / 2;
    const paths = segments.map(seg => 'M ' + seg.map(p =>
        `${(offX + (p[1] - minLon) * cosMid * scale).toFixed(1)},${(offY + (maxLat - p[0]) * scale).toFixed(1)}`
    ).join(' L ')).join(' ');
    return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
        <path d="${paths}" fill="none" stroke="${color}" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
