/**
 * This script powers the trip page (trip.html?tag=<trip_tag>) — one chapter
 * of the Atlas. It gathers every hike sharing the trip_tag and renders the
 * chapter: hero, headline numbers, and (in later build steps) the combined
 * journey map and the day-by-day itinerary.
 */
document.addEventListener('DOMContentLoaded', async () => {

    const heroTitle = document.getElementById('trip-title');
    const heroDates = document.getElementById('trip-dates');
    const heroRegions = document.getElementById('trip-regions');

    /** Friendly dead-end for a missing or unknown trip tag. */
    function showTripNotFound(message) {
        heroTitle.innerText = 'Trip Not Found';
        heroDates.innerText = message;
        document.getElementById('trip-eyebrow').innerText = 'Off the Trail';
    }

    try {
        const allHikes = await fetchHikes();

        const params = new URLSearchParams(window.location.search);
        const tag = params.get('tag');
        if (!tag) {
            showTripNotFound('No trip was specified. Pick one from the timeline.');
            return;
        }

        // The chapter's hikes, in the order they were walked.
        const tripHikes = allHikes
            .filter(h => h.trip_tag === tag)
            .sort(compareHikesChrono);

        if (tripHikes.length === 0) {
            showTripNotFound(`No trip data found for "${tag}".`);
            return;
        }

        // --- Hero ---
        // trip_tag reads "Trip Name - Mon YYYY"; the page shows the name and
        // derives the real date range from the hikes themselves.
        const splitAt = tag.lastIndexOf(' - ');
        const tripName = splitAt > 0 ? tag.slice(0, splitAt) : tag;
        document.title = `${tripName} - The Trailprint Atlas`;
        heroTitle.innerText = tripName;

        // The hero says when the trip happened, month/year only — hike dates
        // mark the days Danny hiked, not the trip's full span, so exact day
        // ranges would understate the trip.
        const firstHike = tripHikes[0];
        const lastHike = tripHikes[tripHikes.length - 1];
        const startMonth = formatHikeDate(firstHike.date_completed, { month: 'long', year: 'numeric' });
        const endMonth = formatHikeDate(lastHike.date_completed, { month: 'long', year: 'numeric' });
        if (startMonth === endMonth) {
            heroDates.innerText = startMonth;
        } else if (hikeYear(firstHike) === hikeYear(lastHike)) {
            heroDates.innerText = `${formatHikeDate(firstHike.date_completed, { month: 'long' })} – ${endMonth}`;
        } else {
            heroDates.innerText = `${startMonth} – ${endMonth}`;
        }

        // Where the trip roamed: every distinct region, in visit order.
        const regions = [...new Set(tripHikes.map(h => h.region))];
        heroRegions.innerText = regions.join('  •  ');

        // The cover photo: the first photo of the trip's longest hike.
        // Deterministic on purpose — one URL per trip means the CDN and the
        // browser cache it, so it loads instantly after the first visit. And
        // the first photo of the big hike is landscape, rarely a selfie
        // (Danny's heuristic — the site can't see faces).
        const coverHike = [...tripHikes]
            .filter(h => h.images && h.images.length > 0)
            .sort((a, b) => b.miles - a.miles)[0];
        if (coverHike) {
            const coverUrl = cloudinaryUrl(coverHike.images[0], 'w_1600,h_640,c_fill,q_auto,f_auto');
            document.getElementById('trip-hero').style.backgroundImage =
                `linear-gradient(rgba(37, 52, 66, 0.55), rgba(44, 62, 80, 0.8)), url('${coverUrl}')`;
        }

        // The shared timeline strip — the spine of the Atlas on this page
        // too. Solo dots open hikes, other capsules open their trips, and
        // this trip's capsule glows as "you are here."
        AtlasTimeline.init({
            allHikes,
            activeTripTag: tag,
            onHikeSelect: (hike) => { window.location.href = `hike.html?id=${hike.trail_id}`; }
        });

        // --- Headline numbers ---
        const dayCount = new Set(tripHikes.map(h => h.date_completed)).size;
        const totalMiles = tripHikes.reduce((sum, h) => sum + h.miles, 0);
        const totalFeet = tripHikes.reduce((sum, h) => sum + h.elevation_gain, 0);

        const realHikes = tripHikes.filter(h => !isViewpoint(h)).length;
        const vpCount = tripHikes.length - realHikes;
        const stats = [
            // "Hiking Days" claims exactly what it counts — days with a hike
            // logged, not the trip's total length.
            { value: dayCount, label: dayCount === 1 ? 'Hiking Day' : 'Hiking Days' },
            { value: realHikes, label: realHikes === 1 ? 'Hike' : 'Hikes' },
            // a viewpoint stop isn't a hike — it gets its own headline number
            ...(vpCount ? [{ value: vpCount, label: vpCount === 1 ? 'Viewpoint' : 'Viewpoints' }] : []),
            { value: (Math.round(totalMiles * 10) / 10).toLocaleString(), label: 'Miles' },
            { value: totalFeet.toLocaleString(), label: 'Ft Climbed' }
        ];
        document.getElementById('trip-stats').innerHTML = stats.map(s => `
            <div class="trip-stat">
                <span class="num">${s.value}</span>
                <span class="cap">${s.label}</span>
            </div>`).join('');

        // --- The Journey Map: every leg of the trip on one canvas ---
        const trailGeometries = await fetchTrailGeometries();
        renderJourneyMap(tripHikes, trailGeometries);

        // --- The Day by Day itinerary ---
        renderItinerary(tripHikes);

    } catch (error) {
        console.error('Error initializing trip page:', error);
        showTripNotFound('Could not load trip data. Please check the console.');
    }

    /**
     * The Day by Day itinerary: hikes grouped under their hiking day, each
     * entry numbered to match its stop marker on the journey map. Labeled
     * "Hiking Day N" deliberately — the Atlas only knows the days a hike was
     * logged, not the trip's full length.
     */
    function renderItinerary(tripHikes) {
        const hikesByDate = new Map();
        tripHikes.forEach(hike => {
            if (!hikesByDate.has(hike.date_completed)) hikesByDate.set(hike.date_completed, []);
            hikesByDate.get(hike.date_completed).push(hike);
        });

        let html = '';
        let dayNumber = 0;
        let stopNumber = 0;
        hikesByDate.forEach((dayHikes, date) => {
            dayNumber++;
            const dateLabel = formatHikeDate(date, { weekday: 'long', month: 'long', day: 'numeric' });
            html += `
                <div class="trip-day">
                    <div class="trip-day-header">
                        <span class="trip-day-chip">Hiking Day ${dayNumber}</span>
                        <span class="trip-day-date">${dateLabel}</span>
                    </div>`;

            dayHikes.forEach(hike => {
                stopNumber++;
                const isViewpoint = hike.hike_type === 'Viewpoint';
                const meta = [
                    hike.hike_type,
                    isViewpoint ? null : `${hike.miles} mi`,
                    isViewpoint ? null : `${hike.elevation_gain.toLocaleString()} ft gain`,
                    isViewpoint ? null : hike.difficulty
                ].filter(Boolean).join(' &bull; ');

                const photosHtml = (hike.images || []).slice(0, 3).map(id =>
                    `<img src="${cloudinaryUrl(id, 'w_300,h_210,c_fill,q_auto,f_auto')}" alt="${hike.trail_name}" loading="lazy">`
                ).join('');

                html += `
                    <div class="trip-stop">
                        <div class="trip-stop-badge">${stopNumber}</div>
                        <div class="trip-stop-body">
                            <a class="trip-stop-name" href="hike.html?id=${hike.trail_id}">${hike.trail_name}</a>
                            <div class="trip-stop-meta">${meta}</div>
                            ${hike.description ? `<p class="trip-stop-desc">${formatHikeText(hike.description)}</p>` : ''}
                            ${photosHtml ? `<div class="trip-stop-photos">${photosHtml}</div>` : ''}
                            <a class="trip-stop-log" href="hike.html?id=${hike.trail_id}">Open the Field Log &rarr;</a>
                        </div>
                    </div>`;
            });

            html += '</div>';
        });

        document.getElementById('trip-days').innerHTML = html;
    }

    /**
     * Draws every leg of the trip on one map: trail lines in the trip's year
     * color (matching the interactive map), plus a numbered marker at each
     * leg's start — the numbers match the day-by-day itinerary below.
     */
    function renderJourneyMap(tripHikes, trailGeometries) {
        // Fully interactive, like the main map — wheel and trackpad zoom in
        // and out naturally (Danny's call: seamless beats scroll-hijack worry).
        const map = L.map('trip-map');
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
        }).addTo(map);

        const yearColor = ATLAS_CONFIG.COLOR_MAP[hikeYear(tripHikes[0]).toString()] || ATLAS_CONFIG.DEFAULT_COLOR;
        const journeyGroup = L.featureGroup().addTo(map);

        // First pass: where does each numbered stop stand?
        const stops = tripHikes.map((hike, index) => {
            const segments = trailGeometries[hike.trail_id];
            const point = segments ? segments[0][0]
                : (hike.latitude && hike.longitude) ? [hike.latitude, hike.longitude]
                : null;
            return { hike, index, segments, point };
        }).filter(stop => stop.point);

        // The journey line: a dashed connector from stop to stop. Zoomed to
        // the whole trip, each day's trail is only a few pixels long — this
        // line carries the story at that scale, and the real trailprints
        // take over as you zoom in. Drawn first, so everything sits above it.
        if (stops.length > 1) {
            L.polyline(stops.map(s => s.point), {
                color: '#2c3e50', // evergreen
                weight: 2.5,
                opacity: 0.5,
                dashArray: '6 8',
                interactive: false
            }).addTo(journeyGroup);
        }

        // Second pass: the actual trailprints, then the numbered stops.
        const stopMarkers = [];
        stops.forEach(({ hike, index, segments, point }) => {
            if (segments) {
                L.polyline(segments, { color: yearColor, weight: 4, opacity: 0.85 }).addTo(journeyGroup);
            }
            const marker = L.marker(point, {
                icon: L.divIcon({
                    className: 'trip-leg-marker',
                    html: `<span>${index + 1}</span>`,
                    iconSize: [26, 26],
                    iconAnchor: [13, 13]
                })
            }).addTo(journeyGroup);
            marker.bindPopup(`
                <div class="trip-leg-popup">
                    <div class="leg-title">${hike.trail_name}</div>
                    <div class="leg-date">${formatHikeDate(hike.date_completed)}</div>
                    <a href="hike.html?id=${hike.trail_id}">Open the Field Log &rarr;</a>
                </div>`);

            // Hovering one stop fades the others, so tangled clusters read.
            marker.on('mouseover', () => setStopFocus(marker));
            marker.on('mouseout', () => setStopFocus(null));
            stopMarkers.push(marker);
        });

        function setStopFocus(focusedMarker) {
            stopMarkers.forEach(m => {
                m.getElement()?.classList.toggle('stop-dimmed', Boolean(focusedMarker) && m !== focusedMarker);
            });
        }

        // De-overlap, two phases re-run on every zoom.
        // Phase 1 folds genuinely stacked stops into cluster bubbles. Each
        // unclaimed stop gathers neighbors within CLUSTER_RADIUS_PX of
        // *itself* (a seed, never a chain) — judged this way, a tight knot
        // stays folded while zooming out and bubbles only grow or absorb
        // neighbors; a chained test let far-away stops yank knots back open,
        // which read as cluster → fan → cluster flicker.
        // Phase 2 fans whatever individual stops still collide.
        const CLUSTER_RADIUS_PX = 24;
        const SPREAD_PX = 28;
        let clusterMarkers = [];
        let baselineZoom = null; // the "whole trip framed" zoom, set after fitBounds
        function spreadStops() {
            clusterMarkers.forEach(bubble => bubble.remove());
            clusterMarkers = [];
            const points = stopMarkers.map(m => map.latLngToContainerPoint(m.getLatLng()));
            const total = points.length;
            const clustered = new Array(total).fill(false);

            // Bubbles only exist when zoomed out BEYOND the initial framing:
            // the default view always shows every stop individually (fanned
            // if they collide) — Danny's call, July 2026.
            const allowClusters = baselineZoom !== null && map.getZoom() < baselineZoom;

            // --- Phase 1: bubbles ---
            for (let i = 0; allowClusters && i < total; i++) {
                if (clustered[i]) continue;
                const group = [i];
                for (let j = 0; j < total; j++) {
                    if (j === i || clustered[j]) continue;
                    if (Math.abs(points[j].x - points[i].x) < CLUSTER_RADIUS_PX &&
                        Math.abs(points[j].y - points[i].y) < CLUSTER_RADIUS_PX) {
                        group.push(j);
                    }
                }
                if (group.length < 3) continue; // pairs and singles just fan

                group.forEach(g => {
                    clustered[g] = true;
                    stopMarkers[g].getElement()?.classList.add('stop-hidden');
                });
                const latlngs = group.map(g => stopMarkers[g].getLatLng());
                const centroid = [
                    latlngs.reduce((s, ll) => s + ll.lat, 0) / latlngs.length,
                    latlngs.reduce((s, ll) => s + ll.lng, 0) / latlngs.length
                ];
                // No number on the bubble — stop numbers belong to stops, and
                // a bubble reading "3" beside a stop reading "3" was confusing.
                // The ⋯ says "several here"; the tooltip carries the count.
                const bubble = L.marker(centroid, {
                    icon: L.divIcon({
                        className: 'trip-cluster-marker',
                        html: '<span>&#8943;</span>',
                        iconSize: [34, 34],
                        iconAnchor: [17, 17]
                    })
                }).addTo(map);
                bubble.bindTooltip(`${group.length} stops — click to zoom in`);
                bubble.on('click', () => map.fitBounds(L.latLngBounds(latlngs).pad(0.6)));
                clusterMarkers.push(bubble);
            }

            // --- Phase 2: fan the remaining stops that still collide ---
            // Chains of overlap fan together (connected components), so a
            // stop can't hide under its fanned neighbor.
            const componentOf = new Array(total).fill(-1);
            for (let i = 0; i < total; i++) {
                if (clustered[i] || componentOf[i] !== -1) continue;
                const members = [i];
                const queue = [i];
                componentOf[i] = i;
                while (queue.length > 0) {
                    const a = queue.pop();
                    for (let b = 0; b < total; b++) {
                        if (clustered[b] || componentOf[b] !== -1) continue;
                        if (Math.abs(points[a].x - points[b].x) < SPREAD_PX &&
                            Math.abs(points[a].y - points[b].y) < SPREAD_PX) {
                            componentOf[b] = i;
                            members.push(b);
                            queue.push(b);
                        }
                    }
                }
                members.sort((a, b) => a - b); // fan left-to-right in itinerary order
                members.forEach((stopIndex, k) => {
                    const offset = (k - (members.length - 1) / 2) * SPREAD_PX;
                    const el = stopMarkers[stopIndex].getElement();
                    if (el) {
                        el.classList.remove('stop-hidden');
                        // Leaflet centers the 26px icon via margin-left:
                        // -13px; the fan offset rides on top of that base.
                        el.style.marginLeft = `${-13 + offset}px`;
                    }
                });
            }
        }
        map.on('zoomend', spreadStops);

        if (journeyGroup.getLayers().length > 0) {
            map.fitBounds(journeyGroup.getBounds().pad(0.15));
            baselineZoom = map.getZoom();
        }
        spreadStops();
    }
});
