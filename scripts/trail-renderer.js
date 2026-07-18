/**
 * This is a shared renderer for drawing a single trail group on a Leaflet map.
 * It can be used by both the interactive map and the homepage showcase map.
 * Color/icon maps live in config.js (ATLAS_CONFIG) — load that first.
 */

/**
 * Formats long-form hike text (descriptions, notes, flora/fauna) for HTML display:
 * converts **bold** markers to <strong> and newlines to <br>.
 */
function formatHikeText(text) {
    if (!text) return '';
    return String(text)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
}

function renderTrailGroup(hikesForTrail, options = {}) {
    // trailGeometries: trail_id -> array of [lat,lng] segments, from
    // fetchTrailGeometries(). Required to draw trail lines (interactive map).
    // iconNudges: trail_name -> horizontal pixel offset, for fanning apart the
    // icons of trails whose trailheads share a parking lot (computed in map.js).
    // onTrailClick: when provided, clicks on the trail call it instead of
    // opening a bound popup — the interactive map uses this to dock its
    // field card. popupHtmlGenerator remains for callers that want popups.
    const { isInteractive = false, popupHtmlGenerator, onTrailClick, trailGeometries = {}, iconNudges = {} } = options;

    // Sort hikes by date to easily identify the most recent one for styling.
    // This is safer than assuming the input array is pre-sorted.
    const sortedHikes = [...hikesForTrail].sort(compareHikesChronoDesc);
    const representativeHike = sortedHikes[0]; // The most recent hike represents the group.

    // Legs of the same trip (e.g. day 1 and day 2 of a backpacking route) are one
    // continuous journey, not repeats — they all render solid. Only hikes from
    // *other* visits become ghosts.
    const journeyHikes = representativeHike.trip_tag
        ? sortedHikes.filter(h => h.trip_tag === representativeHike.trip_tag)
        : [representativeHike];
    const olderHikes = sortedHikes.filter(h => !journeyHikes.includes(h));

    const iconNudgeX = iconNudges[representativeHike.trail_name] || 0;

    // --- Icon Logic ---
    const getIcon = (hikeType, nudgeX = 0) => {
        const iconFilename = ATLAS_CONFIG.ICON_MAP[hikeType] || 'day-hike-icon.png';

        // Add a specific class for trail start icons to allow toggling them separately from viewpoints.
        let iconClassName = 'hike-icon';
        if (isInteractive && hikeType !== 'Viewpoint') {
            iconClassName += ' trail-start-icon';
        }

        const icon = L.icon({
            iconUrl: `assets/icons/${iconFilename}`, // The image file for the icon
            iconSize: [32, 32], // The size of the icon image in pixels
            // Shifting the anchor sideways fans apart icons that share a
            // trailhead — a constant pixel offset that holds at every zoom.
            iconAnchor: [16 - nudgeX, 42], // The coordinate of the icon's "tip" (which is now 10px below the image)
            popupAnchor: [0, -32], // Where the popup should open relative to the iconAnchor,
            shadowUrl: null, className: iconClassName
        });
        // The gold "hiked more than once" ring counts separate visits, so a
        // multi-day journey on one trip doesn't earn it by itself.
        if (isInteractive && olderHikes.length > 0) {
            icon.options.className += ' multi-year-icon-style';
        }
        return icon;
    };

    // --- Color Logic ---
    const year = hikeYear(representativeHike).toString();
    const trailColor = ATLAS_CONFIG.COLOR_MAP[year] || ATLAS_CONFIG.DEFAULT_COLOR;

    // --- Layer Creation ---
    let layer;

    if (isInteractive) {
        // --- INTERACTIVE MAP LOGIC ---
        if (representativeHike.hike_type === 'Viewpoint' && representativeHike.latitude && representativeHike.longitude) {
            layer = L.marker([representativeHike.latitude, representativeHike.longitude], {
                icon: getIcon(representativeHike.hike_type, iconNudgeX)
            });
        } else {
            const allLayers = [];

            // --- Create Ghost Layers for Older Hikes ---
            // We render these first (from oldest to newest) so they appear underneath the main trail.
            if (olderHikes.length > 0) {
                [...olderHikes].reverse().forEach((hike, index) => {
                    const ghostSegments = trailGeometries[hike.trail_id];
                    if (ghostSegments) {
                        // Determine the color for this specific past hike based on its year.
                        const ghostYear = hikeYear(hike).toString();
                        const ghostColor = ATLAS_CONFIG.COLOR_MAP[ghostYear] || ATLAS_CONFIG.DEFAULT_COLOR;

                        // The oldest hikes are slightly more opaque than recent ghosts.
                        const ghostOpacity = Math.max(0.05, 0.2 - (index * 0.05));
                        const ghostLayer = L.polyline(ghostSegments, {
                            color: ghostColor,
                            // The oldest hikes are thickest, creating a "halo" effect.
                            weight: 5 + (olderHikes.length - index) * 4,
                            opacity: ghostOpacity,
                            baseOpacity: ghostOpacity, // remembered so the spotlight can dim and restore
                            interactive: false // Ghosts are not clickable.
                        });
                        allLayers.push(ghostLayer);
                    }
                });
            }

            // --- Create the Main, Interactive Layers for the Current Journey ---
            // Usually one hike; for a multi-day trip journey, every leg draws
            // solid (oldest first, so day 1 sits beneath later days where they overlap).
            // Each leg gets its own start marker: day 1's marks the trailhead,
            // and each later day's marks where that night's camp was.
            [...journeyHikes].reverse().forEach((hike, legIndex) => {
                const legSegments = trailGeometries[hike.trail_id];
                if (legSegments) {
                    allLayers.push(L.polyline(legSegments, {
                        color: trailColor, weight: 5, opacity: 0.85,
                        baseOpacity: 0.85, // remembered so the spotlight can dim and restore
                        pane: 'mainTrailPane' // Render on the higher-level pane.
                    }));
                    // Only the journey's first marker (the true trailhead) gets
                    // the fan-apart nudge; camp markers on later legs stay put.
                    allLayers.push(L.marker(legSegments[0][0], {
                        icon: getIcon(hike.hike_type, legIndex === 0 ? iconNudgeX : 0)
                    }));
                }
            });

            // Combine all layers into a single group for easy handling on the map.
            if (allLayers.length > 0) {
                layer = L.featureGroup(allLayers);
            }
        }
    } else {
        // --- HOMEPAGE MAP LOGIC (Radically Simplified) ---
        // Render ALL hikes as simple dots, provided they have coordinates.
        if (representativeHike.latitude && representativeHike.longitude) {
            const haloDot = L.circleMarker([representativeHike.latitude, representativeHike.longitude], {
                radius: 6,
                fillColor: trailColor,
                stroke: false, // No border on the halo
                className: 'breathing-halo trail-path', // Add class for transition
                fillOpacity: 0 // Start invisible
            });
            const mainDot = L.circleMarker([representativeHike.latitude, representativeHike.longitude], {
                radius: 3,
                fillColor: trailColor,
                stroke: false, // No border on the main dot
                className: 'trail-path', // Add class for transition
                fillOpacity: 0 // Start invisible
            });
            layer = L.featureGroup([haloDot, mainDot]);
        }
    }

    if (layer && isInteractive && onTrailClick) {
        layer.on('click', () => onTrailClick(hikesForTrail));
    } else if (layer && isInteractive && popupHtmlGenerator) {
        const popupContent = popupHtmlGenerator(hikesForTrail);
        layer.bindPopup(popupContent);
    }

    return layer;
}