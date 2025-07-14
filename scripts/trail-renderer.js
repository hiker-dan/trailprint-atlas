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
    const representativeHike = hikesForTrail[0];

    // --- Icon Logic ---
    const getIcon = (hikeType) => {
        const iconFilename = RENDERER_CONFIG.ICON_MAP[hikeType] || 'hiker-icon.png';
        const icon = L.icon({
            iconUrl: `assets/icons/${iconFilename}`, // The image file for the icon
            iconSize: [32, 32], // The size of the icon image in pixels
            iconAnchor: [16, 42], // The coordinate of the icon's "tip" (which is now 10px below the image)
            popupAnchor: [0, -32], // Where the popup should open relative to the iconAnchor
            shadowUrl: null, className: 'hike-icon'
        });
        if (isInteractive && hikesForTrail.length > 1) {
            icon.options.className += ' multi-year-icon-style';
        }
        return icon;
    };

    // --- Color Logic ---
    const year = new Date(representativeHike.date_completed).getFullYear().toString();
    const trailColor = RENDERER_CONFIG.COLOR_MAP[year] || RENDERER_CONFIG.DEFAULT_COLOR;

    // --- Layer Creation ---
    let layer;
    if (representativeHike.hike_type === 'Viewpoint' && representativeHike.latitude && representativeHike.longitude) {
        if (isInteractive) {
            layer = L.marker([representativeHike.latitude, representativeHike.longitude], {
                icon: getIcon(representativeHike.hike_type)
            });
        } else {
            // For the homepage, render a "halo" dot to match the trail paths
            const haloDot = L.circleMarker([representativeHike.latitude, representativeHike.longitude], {
                radius: 6,
                fillColor: trailColor,
                stroke: false,
                className: 'breathing-halo', // Apply the animation class
                fillOpacity: 0.5
            });
            const mainDot = L.circleMarker([representativeHike.latitude, representativeHike.longitude], {
                radius: 3,
                fillColor: trailColor,
                stroke: false, // No border on the main dot
                fillOpacity: 0.9
            });
            layer = L.featureGroup([haloDot, mainDot]);
        }
    } else if (representativeHike.gpx_file) {
        if (isInteractive) {
            // Standard rendering for the interactive map
            const markerOpts = { startIcon: getIcon(representativeHike.hike_type), endIconUrl: null };
            layer = new L.GPX(`data/trails/${representativeHike.gpx_file}`, {
                async: true,
                gpx_options: { parseElements: ['track'] },
                marker_options: markerOpts,
                polyline_options: { color: trailColor, weight: 5, opacity: 0.85 }
            });
        } else {
            // "Halo" effect rendering for the non-interactive homepage map
            const markerOpts = { startIconUrl: null, endIconUrl: null, shadowUrl: null };
            const haloLine = new L.GPX(`data/trails/${representativeHike.gpx_file}`, {
                async: true, gpx_options: { parseElements: ['track'] }, marker_options: markerOpts,
                polyline_options: { color: trailColor, weight: 7, opacity: 0.4, className: 'breathing-halo' }
            });
            const mainLine = new L.GPX(`data/trails/${representativeHike.gpx_file}`, {
                async: true, gpx_options: { parseElements: ['track'] }, marker_options: markerOpts,
                polyline_options: { color: trailColor, weight: 3, opacity: 0.9 } // The crisp main line
            });

            // Group both lines together. The FeatureGroup itself doesn't have a 'loaded' event,
            // so we listen to one of the lines and fire the event on the group.
            // This ensures our promise-based loader on index.html still works perfectly.
            layer = L.featureGroup([haloLine, mainLine]);
            mainLine.on('loaded', () => layer.fire('loaded'));
            mainLine.on('error', () => layer.fire('error'));
        }
    }

    if (layer && isInteractive && popupHtmlGenerator) {
        const popupContent = popupHtmlGenerator(hikesForTrail);
        layer.bindPopup(popupContent);
    }

    return layer;
}