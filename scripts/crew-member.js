/**
 * Trail Crew member page — one person's shared history with the Atlas.
 *
 * URL: crew-member.html?name=Will%20R.
 * Hero (their cover photo + headline numbers), a map of every trail walked
 * together (year colors, same visual language as the trip journey map), and
 * the full chronological list. Every hike links back to the Field Log.
 */
document.addEventListener('DOMContentLoaded', async () => {

    const params = new URLSearchParams(window.location.search);
    const name = params.get('name');

    let allHikes;
    try {
        allHikes = await fetchHikes();
    } catch (err) {
        console.error('Could not load hike data:', err);
        return;
    }

    const shared = name ? (groupByCompanion(allHikes).get(name) || []) : [];
    if (shared.length === 0) {
        document.getElementById('member-name').innerText = 'Off the Trail';
        document.getElementById('member-statline').innerHTML =
            `No shared hikes found. <a href="crew.html" style="color:#fff">Back to the Trail Crew &rarr;</a>`;
        return;
    }

    const sorted = [...shared].sort(compareHikesChrono);
    const totalMiles = shared.reduce((s, h) => s + h.miles, 0);
    const totalFeet = shared.reduce((s, h) => s + h.elevation_gain, 0);

    // --- Hero ---
    document.title = `${name} - Trail Crew - The Trailprint Atlas`;
    document.getElementById('member-name').innerText = name;
    document.getElementById('member-statline').innerText =
        `${shared.length} hikes together · ${totalMiles.toFixed(1)} miles · ${totalFeet.toLocaleString()} ft climbed`;
    const firstYear = hikeYear(sorted[0]);
    const lastYear = hikeYear(sorted[sorted.length - 1]);
    document.getElementById('member-since').innerText = firstYear === lastYear
        ? `On the trail together in ${firstYear}`
        : `On the trail together since ${firstYear}`;

    // No photo behind this hero, by design: member pages keep the plain
    // evergreen header (like hike pages) so the photographic hero stays a
    // trip-page signature. The portrait lives on their crew.html card.

    // --- The shared trails, as atlas plates ---
    // Hikes gather into geographic clusters; each cluster with company gets
    // its own mini-map plate, zoomed so the trails are legible at a glance.
    // Far-flung one-offs skip the basemap and render as line-art trailprints
    // in the "Scattered Trails" row instead — the shape of the walk itself.
    let geometries = {};
    try {
        geometries = await fetchTrailGeometries();
    } catch (err) {
        console.error('Could not load trail geometries:', err);
    }

    const popupHtml = (hike) => `
        <div class="member-popup">
            <div class="mp-title">${hike.trail_name}</div>
            <div class="mp-date">${formatHikeDate(hike.date_completed)}</div>
            <a href="hike.html?id=${hike.trail_id}">Open the Field Log &rarr;</a>
        </div>`;
    const hikeColor = (hike) => ATLAS_CONFIG.COLOR_MAP[hikeYear(hike)] || ATLAS_CONFIG.DEFAULT_COLOR;

    // Complete-linkage clustering with a diameter cap. Two groups merge only
    // if EVERY pair of hikes in the union stays within MAX_PLATE_SPAN_KM —
    // order-independent (no drifting centroids, no orphaned neighbors), and
    // the cap directly bounds each plate's zoom: a plate can never sprawl
    // past the span, so its trails stay legible. Always merge the tightest
    // compatible pair first, so natural regions form before loose ones.
    const MAX_PLATE_SPAN_KM = 75;
    const kmBetween = (a, b) => {
        const R = 6371;
        const dLat = (b.latitude - a.latitude) * Math.PI / 180;
        const dLon = (b.longitude - a.longitude) * Math.PI / 180;
        const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(a.latitude * Math.PI / 180) * Math.cos(b.latitude * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(s));
    };
    // Span of a would-be merged group = its farthest-apart pair of hikes
    const mergedSpan = (a, b) => {
        let span = 0;
        const union = [...a.hikes, ...b.hikes];
        for (let i = 0; i < union.length; i++) {
            for (let j = i + 1; j < union.length; j++) {
                span = Math.max(span, kmBetween(union[i], union[j]));
            }
        }
        return span;
    };

    let clusters = sorted
        .filter(h => h.latitude && h.longitude)
        .map(h => ({ hikes: [h] }));
    while (clusters.length > 1) {
        let best = null;
        for (let i = 0; i < clusters.length; i++) {
            for (let j = i + 1; j < clusters.length; j++) {
                const span = mergedSpan(clusters[i], clusters[j]);
                if (span <= MAX_PLATE_SPAN_KM && (!best || span < best.span)) {
                    best = { i, j, span };
                }
            }
        }
        if (!best) break; // nothing left that can merge without over-stretching a plate
        clusters[best.i].hikes.push(...clusters[best.j].hikes);
        clusters.splice(best.j, 1);
    }
    clusters.forEach(c => c.hikes.sort(compareHikesChrono));
    clusters.sort((a, b) => b.hikes.length - a.hikes.length);

    // Plate titles come from the cluster's locations: one place names itself;
    // a mixed cluster leads with its most-hiked place
    const plateTitle = (cluster) => {
        const tally = {};
        cluster.hikes.forEach(h => { tally[h.location] = (tally[h.location] || 0) + 1; });
        const places = Object.entries(tally).sort((a, b) => b[1] - a[1]);
        return places.length === 1 ? places[0][0] : `${places[0][0]} & nearby`;
    };

    // Region plates: every cluster where you hiked together more than once
    const regions = clusters.filter(c => c.hikes.length > 1);
    const singles = clusters.filter(c => c.hikes.length === 1).map(c => c.hikes[0]);
    const platesEl = document.getElementById('member-plates');

    // Two passes: all plate frames enter the DOM first, so the grid is in
    // its final layout before any Leaflet map measures its container.
    // (Initializing map 1 while it was the grid's temporarily-full-width
    // only child left its center computed for the wrong size.)
    regions.forEach((cluster, i) => {
        const plate = document.createElement('div');
        plate.className = 'plate';
        plate.innerHTML = `
            <div class="plate-title">
                <span class="plate-name">${plateTitle(cluster)}</span>
                <span class="plate-count">${cluster.hikes.length} hikes together</span>
            </div>
            <div class="plate-map" id="plate-map-${i}"></div>`;
        platesEl.appendChild(plate);
    });

    const plateFits = []; // each plate's (map, bounds), for post-layout re-fits
    regions.forEach((cluster, i) => {
        // Static like the hike page's map — but trails stay clickable for
        // their Field Log popups
        const plateMap = L.map(`plate-map-${i}`, {
            zoomControl: false, dragging: false, scrollWheelZoom: false,
            doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false,
            attributionControl: false
        });
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri'
        }).addTo(plateMap);

        const bounds = L.latLngBounds([]);
        cluster.hikes.forEach(hike => {
            const segments = geometries[hike.trail_id];
            if (segments) {
                segments.forEach(seg => {
                    const line = L.polyline(seg, { color: hikeColor(hike), weight: 3.5, opacity: 0.95 }).addTo(plateMap);
                    line.bindPopup(popupHtml(hike));
                    bounds.extend(line.getBounds());
                });
            } else {
                // Viewpoints and missing tracks still get a dot on their plate
                const dot = L.circleMarker([hike.latitude, hike.longitude], {
                    radius: 6, color: '#fff', weight: 2, fillColor: hikeColor(hike), fillOpacity: 1
                }).addTo(plateMap);
                dot.bindPopup(popupHtml(hike));
                bounds.extend(dot.getLatLng());
            }
        });
        plateMap.fitBounds(bounds, { padding: [24, 24] });
        plateFits.push({ map: plateMap, bounds });
    });

    // Late layout shifts (web fonts landing, a scrollbar appearing) change
    // container sizes after init — re-measure and re-center every plate
    const refitPlates = () => plateFits.forEach(({ map, bounds }) => {
        map.invalidateSize();
        map.fitBounds(bounds, { padding: [24, 24] });
    });
    setTimeout(refitPlates, 60);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refitPlates);

    // Scattered Trails: the far-flung one-offs as line-art trailprints
    if (singles.length > 0) {
        document.getElementById('member-scattered').style.display = 'block';
        document.getElementById('scattered-count').innerText =
            `${singles.length} ${singles.length === 1 ? 'hike' : 'hikes'} beyond the regions above`;
        const printsEl = document.getElementById('member-prints');
        singles.forEach(hike => {
            const card = document.createElement('a');
            card.className = 'trailprint';
            card.href = `hike.html?id=${hike.trail_id}`;
            card.innerHTML = `
                ${trailprintSVG(geometries[hike.trail_id], hikeColor(hike))}
                <div class="tp-name">${hike.trail_name}</div>
                <div class="tp-place">${hike.location}</div>`;
            printsEl.appendChild(card);
        });
    }

    // --- Every hike together, newest first ---
    document.getElementById('member-hikes').innerHTML =
        sorted.slice().reverse().map(hike => {
            const tripChip = hike.trip_tag
                ? `<span class="mhr-trip">${(() => {
                        const splitAt = hike.trip_tag.lastIndexOf(' - ');
                        return splitAt > 0 ? hike.trip_tag.slice(0, splitAt) : hike.trip_tag;
                    })()}</span>`
                : '';
            return `
            <a class="member-hike-row" href="hike.html?id=${hike.trail_id}">
                <span class="mhr-date">${formatHikeDate(hike.date_completed)}</span>
                <span class="mhr-name">${hike.trail_name}</span>
                ${tripChip}
                <span class="mhr-stats">${hike.miles} mi &middot; ${hike.elevation_gain.toLocaleString()} ft</span>
            </a>`;
        }).join('');
});

/**
 * A trail's shape as standalone line art (the literal trailprint): the GPX
 * geometry normalized into a small square SVG, drawn in the hike's year
 * color with no basemap. Trackless hikes (viewpoints) print as a single dot.
 * @param {Array|undefined} segments - [lat, lng] segment arrays from trails.geojson
 * @param {string} color - stroke color (the hike's year color)
 */
function trailprintSVG(segments, color) {
    const S = 120, PAD = 10;
    if (!segments) {
        return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
            <circle cx="${S / 2}" cy="${S / 2}" r="7" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`;
    }
    const pts = segments.flat();
    const lats = pts.map(p => p[0]), lons = pts.map(p => p[1]);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    // Equirectangular with latitude correction, so shapes aren't stretched
    const cosMid = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
    const w = (maxLon - minLon) * cosMid, h = maxLat - minLat;
    const scale = (S - 2 * PAD) / Math.max(w, h);
    const offX = (S - w * scale) / 2, offY = (S - h * scale) / 2;
    const paths = segments.map(seg => 'M ' + seg.map(p =>
        `${(offX + (p[1] - minLon) * cosMid * scale).toFixed(1)},${(offY + (maxLat - p[0]) * scale).toFixed(1)}`
    ).join(' L ')).join(' ');
    return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
        <path d="${paths}" fill="none" stroke="${color}"
            stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
