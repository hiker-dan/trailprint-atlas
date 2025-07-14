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

    if (isInteractive) {
        // --- INTERACTIVE MAP LOGIC (No changes here) ---
        if (representativeHike.hike_type === 'Viewpoint' && representativeHike.latitude && representativeHike.longitude) {
            layer = L.marker([representativeHike.latitude, representativeHike.longitude], {
                icon: getIcon(representativeHike.hike_type)
            });
        } else if (representativeHike.gpx_file) {
            // Standard rendering for the interactive map
            const markerOpts = { startIcon: getIcon(representativeHike.hike_type), endIconUrl: null };
            layer = new L.GPX(`data/trails/${representativeHike.gpx_file}`, {
                async: true,
                gpx_options: { parseElements: ['track'] },
                marker_options: markerOpts,
                polyline_options: { color: trailColor, weight: 5, opacity: 0.85 }
            });
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