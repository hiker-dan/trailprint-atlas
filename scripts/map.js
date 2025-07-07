// Initialize the map and set its view to our chosen geographical coordinates and a zoom level
// The coordinates are centered roughly on the USA.
const map = L.map('map').setView([39.82, -98.58], 5);

// Add a tile layer to our map. This is the background map image.
// We're using OpenStreetMap, a free and open-source map.
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

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
        shadowUrl: null // Explicitly disable the shadow for this icon
    });
}

fetch('data/hikes.json')
    .then(response => response.json())
    .then(data => {
        data.forEach(hike => {
            // Create a new GPX layer from the file path in our data
            const gpxLayer = new L.GPX(hike.gpx_file, {
                async: true,
                // This is the definitive fix: Instruct the plugin to only parse 'track' data.
                // This completely ignores the 'waypoint' data in the GPX file that was causing the broken image.
                gpx_options: {
                    parseElements: ['track']
                },
                marker_options: {
                    startIcon: getIconForHikeType(hike.hike_type), // Use our dynamic icon
                    endIconUrl: null // No icon at the end of the trail
                },
                polyline_options: {
                    color: '#e74c3c', // A nice reddish-orange color
                    weight: 5,
                    opacity: 0.85
                }
            }).on('loaded', function(e) {
                // Once the GPX is loaded, fit the map bounds to the trail
                map.fitBounds(e.target.getBounds());
            }).bindPopup(`
                <h3>${hike.trail_name}</h3>
                <p><strong>Date Hiked:</strong> ${new Date(hike.date_completed).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}</p>
                <p><strong>Location:</strong> ${hike.location}</p>
                <p><strong>Distance:</strong> ${hike.miles} miles</p>
                <p><strong>Elevation Gain:</strong> ${hike.elevation_gain} ft</p>
                <p><strong>Difficulty:</strong> ${hike.difficulty}</p>
            `).addTo(map);
        });
    })
    .catch(error => console.error('Error loading hike data:', error));