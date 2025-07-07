// Initialize the map and set its view to our chosen geographical coordinates and a zoom level
// The coordinates are centered roughly on the USA.
const map = L.map('map').setView([39.82, -98.58], 4);

// Add a tile layer to our map. This is the background map image.
// We're using OpenStreetMap, a free and open-source map.
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Now that the map is set up, the next steps will be to:
// 1. Load the hike data from hikes.json
// 2. For each hike, load its GPX file
// 3. Draw the GPX track on the map as a polyline