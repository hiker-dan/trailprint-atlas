/**
 * This is a shared renderer for drawing a single trail group on a Leaflet map.
 * It can be used by both the interactive map and the homepage showcase map.
 */

const RENDERER_CONFIG = {
    ICON_MAP: {
        "Overnight Trip": "overnight-trip-icon.png",
        "Day Trip": "day-trip-icon.png",
        "Day Hike": "day-hike-icon.png",
        "Car Camping": "car-camping-icon.png",
        "Backpacking": "backpacking-icon.png",
        "Viewpoint": "viewpoint-icon.png"
    },
    COLOR_MAP: {
        "2022": "#3498db", "2023": "#2ecc71", "2024": "#f1c40f", "2025": "#e67e22", "2026": "#9b59b6",
    },
    DEFAULT_COLOR: '#7f8c8d'
};

function renderTrailGroup(hikesForTrail, options = {}) {
    const { isInteractive = false, popupHtmlGenerator } = options;

    // Sort hikes by date to easily identify the most recent one for styling.
    // This is safer than assuming the input array is pre-sorted.
    const sortedHikes = [...hikesForTrail].sort((a, b) => new Date(b.date_completed) - new Date(a.date_completed));
    const representativeHike = sortedHikes[0]; // The most recent hike represents the group.

    // --- Icon Logic ---
    const getIcon = (hikeType) => {
        const iconFilename = RENDERER_CONFIG.ICON_MAP[hikeType] || 'hiker-icon.png';

        // Add a specific class for trail start icons to allow toggling them separately from viewpoints.
        let iconClassName = 'hike-icon';
        if (isInteractive && hikeType !== 'Viewpoint') {
            iconClassName += ' trail-start-icon';
        }

        const icon = L.icon({
            iconUrl: `assets/icons/${iconFilename}`, // The image file for the icon
            iconSize: [32, 32], // The size of the icon image in pixels
            iconAnchor: [16, 42], // The coordinate of the icon's "tip" (which is now 10px below the image)
            popupAnchor: [0, -32], // Where the popup should open relative to the iconAnchor,
            shadowUrl: null, className: iconClassName
        });
        if (isInteractive && sortedHikes.length > 1) {
            icon.options.className += ' multi-year-icon-style';
        }
        return icon;
    };

    // --- Color Logic ---
    const year = new Date(representativeHike.date_completed).getFullYear().toString();
    const trailColor = RENDERER_CONFIG.COLOR_MAP[year] || RENDERER_CONFIG.DEFAULT_COLOR;

    // --- Layer Creation ---
    let layer;

    if (isInteractive) {
        // --- INTERACTIVE MAP LOGIC ---
        if (representativeHike.hike_type === 'Viewpoint' && representativeHike.latitude && representativeHike.longitude) {
            layer = L.marker([representativeHike.latitude, representativeHike.longitude], {
                icon: getIcon(representativeHike.hike_type)
            });
        } else {
            const mostRecentHike = sortedHikes[0];
            const olderHikes = sortedHikes.slice(1);

            const allLayers = [];

            // --- Create Ghost Layers for Older Hikes ---
            // We render these first (from oldest to newest) so they appear underneath the main trail.
            if (olderHikes.length > 0) {
                olderHikes.reverse().forEach((hike, index) => {
                    if (hike.gpx_file) {
                        // Determine the color for this specific past hike based on its year.
                        const ghostYear = new Date(hike.date_completed).getFullYear().toString();
                        const ghostColor = RENDERER_CONFIG.COLOR_MAP[ghostYear] || RENDERER_CONFIG.DEFAULT_COLOR;

                        const ghostLayer = new L.GPX(`data/trails/${hike.gpx_file}`, {
                            async: true,
                            gpx_options: { parseElements: ['track'] },
                            marker_options: { startIconUrl: null, endIconUrl: null, shadowUrl: null }, // No icons for ghosts
                            polyline_options: {
                                color: ghostColor,
                                // The oldest hikes are thickest, creating a "halo" effect.
                                weight: 5 + (olderHikes.length - index) * 4,
                                // The oldest hikes are slightly more opaque than recent ghosts.
                                opacity: Math.max(0.05, 0.2 - (index * 0.05)),
                                interactive: false // Ghosts are not clickable.
                            }
                        });
                        allLayers.push(ghostLayer);
                    }
                });
            }

            // --- Create the Main, Interactive Layer for the Most Recent Hike ---
            if (mostRecentHike.gpx_file) {
                const markerOpts = { startIcon: getIcon(mostRecentHike.hike_type), endIconUrl: null };
                const mainLayer = new L.GPX(`data/trails/${mostRecentHike.gpx_file}`, {
                    async: true,
                    gpx_options: { parseElements: ['track'] },
                    marker_options: markerOpts,
                    polyline_options: {
                        color: trailColor, weight: 5, opacity: 0.85,
                        pane: 'mainTrailPane' // Render on the higher-level pane.
                    }
                });
                allLayers.push(mainLayer);
            }

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

    if (layer && isInteractive && popupHtmlGenerator) {
        const popupContent = popupHtmlGenerator(hikesForTrail);
        layer.bindPopup(popupContent);
    }

    return layer;
}