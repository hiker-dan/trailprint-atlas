// Initialize the map and set its view to our chosen geographical coordinates and a zoom level
// The coordinates are centered roughly on the USA.
const map = L.map('map').setView([39.82, -98.58], 5);

// --- Define Base Map Tile Layers ---
const streetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
});

const voyagerMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
	attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
	subdomains: 'abcd',
	maxZoom: 20
});

const satelliteMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
	attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
});

// Set the default map layer
voyagerMap.addTo(map);

// Create a base maps object
const baseMaps = {
    "Voyager": voyagerMap,
    "Street Map": streetMap,
    "Satellite": satelliteMap
};

// Load hike data from JSON and add GPX tracks to the map

/**
 * Creates a Leaflet icon object based on the hike type.
 * @param {string} hikeType - The type of hike (e.g., "Overnight Trip", "Day Hike").
 * @returns {L.Icon} A Leaflet Icon object.
 */
function getIconForHikeType(hikeType) {
    // Map hike types to their corresponding icon filenames.
    const iconMap = {
        "Overnight Trip": "overnight-trip-icon.png",
        "Day Trip": "day-trip-icon.png",
        "Day Hike": "day-hike-icon.png",
        "Car Camping": "car-camping-icon.png",
        "Backpacking": "backpacking-icon.png",
        "Viewpoint": "viewpoint-icon.png"
    };

    // Use the specific icon if available, otherwise fall back to a default.
    const iconFilename = iconMap[hikeType] || 'hiker-icon.png'; // Default icon

    return L.icon({
        iconUrl: `assets/icons/${iconFilename}`,
        iconSize:     [32, 32], // size of the icon
        iconAnchor:   [16, 32], // point of the icon which will correspond to marker's location
        popupAnchor:  [0, -32], // point from which the popup should open relative to the iconAnchor
        shadowUrl: null, // Explicitly disable the shadow for this icon
        className: 'hike-icon' // Add a CSS class for styling
    });
}

fetch('data/hikes.json')
    .then(response => response.json())
    .then(data => {
        // Create a feature group to hold all the trail layers.
        const allTrailsGroup = L.featureGroup().addTo(map);

        // --- Data Grouping ---
        // We group all hikes by their trail_name to handle multiple hikes of the same trail.
        const trailGroups = {};
        data.forEach(hike => {
            if (!trailGroups[hike.trail_name]) {
                trailGroups[hike.trail_name] = [];
            }
            trailGroups[hike.trail_name].push(hike);
        });

        // --- Render Grouped Trails ---
        // Now, we loop through the grouped trails instead of the raw data.
        for (const trailName in trailGroups) {
            const hikesForTrail = trailGroups[trailName];

            // Sort hikes by date to always use the most recent one as the representative.
            hikesForTrail.sort((a, b) => new Date(b.date_completed) - new Date(a.date_completed));
            const representativeHike = hikesForTrail[0];

            const gpxPath = `data/trails/${representativeHike.gpx_file}`;

            // --- Create the Popup Content ---
            // List all dates the trail was hiked.
            let dateList = hikesForTrail.map(h => 
                `<li>${new Date(h.date_completed).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}</li>`
            ).join('');

            const popupContent = `
                <h3>${representativeHike.trail_name}</h3>
                <p><strong>Location:</strong> ${representativeHike.location}</p>
                <p><strong>Distance:</strong> ${representativeHike.miles} miles</p>
                <p><strong>Elevation Gain:</strong> ${representativeHike.elevation_gain} ft</p>
                <p><strong>Hiked ${hikesForTrail.length} time(s):</strong></p>
                <ul>${dateList}</ul>
            `;

            // Create a new GPX layer from the file path in our data
            const gpxLayer = new L.GPX(gpxPath, {
                async: true,
                gpx_options: {
                    parseElements: ['track'],
                },
                marker_options: {
                    startIcon: getIconForHikeType(representativeHike.hike_type),
                    endIconUrl: null,
                },
                polyline_options: {
                    color: '#e74c3c',
                    weight: 5,
                    opacity: 0.85,
                },
            }).on('loaded', function(e) {
                // When a trail loads successfully, add it to our group.
                allTrailsGroup.addLayer(e.target);
            }).on('error', function(e) {
                console.warn(`Could not load trail: ${gpxPath}`);
            }).bindPopup(popupContent);
        }

        // Add the layer control to the map
        L.control.layers(baseMaps).addTo(map);

        // This is a more robust way to zoom the map. It waits for all the
        // 'loaded' events to fire before fitting the bounds.
        setTimeout(() => {
            if (allTrailsGroup.getLayers().length > 0) {
                map.fitBounds(allTrailsGroup.getBounds().pad(0.1));
            } else {
                console.warn("No trails were loaded. Check GPX file paths and data.");
            }
        }, 1500); // Wait 1.5 seconds to allow GPX files to load.
    })
    .catch(error => console.error('Error loading hike data:', error));