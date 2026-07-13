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

    // Cover: their hand-picked portrait when one exists (face-aware crop);
    // otherwise the first photo of the longest shared hike with photos
    const portraits = await fetchCrewPortraits();
    const withPhotos = shared.filter(h => h.images && h.images.length > 0)
        .sort((a, b) => b.miles - a.miles);
    const coverId = portraits[name] || (withPhotos.length > 0 ? withPhotos[0].images[0] : null);
    if (coverId) {
        const gravity = portraits[name] ? ',g_auto' : '';
        const cover = cloudinaryUrl(coverId, `w_1600,h_640,c_fill${gravity},q_auto,f_auto`);
        document.getElementById('crew-hero').style.backgroundImage =
            `linear-gradient(rgba(37, 52, 66, 0.55), rgba(44, 62, 80, 0.8)), url('${cover}')`;
    }

    // --- The shared-trails map ---
    const map = L.map('member-map');
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
    }).addTo(map);

    let geometries = {};
    try {
        geometries = await fetchTrailGeometries();
    } catch (err) {
        console.error('Could not load trail geometries:', err);
    }

    const bounds = L.latLngBounds([]);
    sorted.forEach(hike => {
        const color = ATLAS_CONFIG.COLOR_MAP[hikeYear(hike)] || ATLAS_CONFIG.DEFAULT_COLOR;
        const popupHtml = `
            <div class="member-popup">
                <div class="mp-title">${hike.trail_name}</div>
                <div class="mp-date">${formatHikeDate(hike.date_completed)}</div>
                <a href="hike.html?id=${hike.trail_id}">Open the Field Log &rarr;</a>
            </div>`;
        const segments = geometries[hike.trail_id];
        if (segments) {
            segments.forEach(seg => {
                const line = L.polyline(seg, { color, weight: 3.5, opacity: 0.9 }).addTo(map);
                line.bindPopup(popupHtml);
                bounds.extend(line.getBounds());
            });
        } else if (hike.latitude && hike.longitude) {
            // Viewpoints and missing tracks still get a dot on the shared map
            const dot = L.circleMarker([hike.latitude, hike.longitude], {
                radius: 6, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1
            }).addTo(map);
            dot.bindPopup(popupHtml);
            bounds.extend(dot.getLatLng());
        }
    });
    if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30] });
    } else {
        map.setView([36.5, -118.8], 6);
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
