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

// --- Global Data Maps ---
const ICON_MAP = {
    "Overnight Trip": "overnight-trip-icon.png",
    "Day Trip": "day-trip-icon.png",
    "Day Hike": "day-hike-icon.png",
    "Car Camping": "car-camping-icon.png",
    "Backpacking": "backpacking-icon.png",
    "Viewpoint": "viewpoint-icon.png"
};

const COLOR_MAP = {
    "2022": "#3498db", // A nice blue
    "2023": "#2ecc71", // A vibrant green
    "2024": "#f1c40f", // A sunflower yellow
    "2025": "#e67e22", // A carrot orange
    "2026": "#9b59b6", // A rich amethyst
};

// Load hike data from JSON and add GPX tracks to the map

/**
 * Creates a Leaflet icon object based on the hike type.
 * @param {string} hikeType - The type of hike (e.g., "Overnight Trip", "Day Hike").
 * @returns {L.Icon} A Leaflet Icon object.
 */
function getIconForHikeType(hikeType) {
    // Use the specific icon if available, otherwise fall back to a default.
    const iconFilename = ICON_MAP[hikeType] || 'hiker-icon.png'; // Default icon

    return L.icon({
        iconUrl: `assets/icons/${iconFilename}`,
        iconSize:     [32, 32], // size of the icon
        iconAnchor:   [16, 32], // point of the icon which will correspond to marker's location
        popupAnchor:  [0, -32], // point from which the popup should open relative to the iconAnchor
        shadowUrl: null, // Explicitly disable the shadow for this icon
        className: 'hike-icon' // Add a CSS class for styling
    });
}

/**
 * Returns a color based on the year of the hike.
 * @param {string} year - The four-digit year of the hike.
 * @returns {string} A hex color code.
 */
function getColorForYear(year) {
    // Return the specific color if available, otherwise fall back to a default.
    return COLOR_MAP[year] || '#7f8c8d'; // Default grey for other years
}

let allHikesData = []; // Will hold the full, original dataset
const allTrailsGroup = L.featureGroup().addTo(map); // The main layer group for our trails

// --- New Filter State Management ---
const activeFilters = {
    year: new Set(),
    hike_type: new Set(),
    difficulty: new Set(),
    size: new Set()
};

fetch('data/hikes.json')
    .then(response => response.json())
    .then(data => {
        // --- Data Grouping ---
        // We group all hikes by their trail_name to handle multiple hikes of the same trail.
        const trailGroups = {};
        data.forEach(hike => {
            if (!trailGroups[hike.trail_name]) {
                trailGroups[hike.trail_name] = [];
            }
            trailGroups[hike.trail_name].push(hike);
        });

        allHikesData = Object.values(trailGroups); // Store the grouped data
        populateFilters(allHikesData);
        renderMapLayers(allHikesData); // Initial render with all data
        setupEventListeners();
        renderLegend();
    })
    .catch(error => console.error('Error loading hike data:', error));

function renderMapLayers(trailGroupsToRender) {
    allTrailsGroup.clearLayers(); // Clear all previous layers

    trailGroupsToRender.forEach(hikesForTrail => {
        const representativeHike = hikesForTrail[0]; // Already sorted from initial processing

        let dateList = hikesForTrail.map(h => 
            `<li>${new Date(h.date_completed).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}</li>`
        ).join('');

        if (representativeHike.hike_type === 'Viewpoint' && representativeHike.latitude && representativeHike.longitude) {
            const popupContent = `
                <h3>${representativeHike.trail_name}</h3>
                <p><strong>Location:</strong> ${representativeHike.location}</p>
                <p><strong>Visited ${hikesForTrail.length} time(s):</strong></p>
                <ul>${dateList}</ul>
            `;
            const marker = L.marker([representativeHike.latitude, representativeHike.longitude], {
                icon: getIconForHikeType(representativeHike.hike_type)
            }).bindPopup(popupContent);
            allTrailsGroup.addLayer(marker);
        } else if (representativeHike.gpx_file) {
            const yearsHiked = [...new Set(hikesForTrail.map(h => new Date(h.date_completed).getFullYear().toString()))];
            const trailColor = getColorForYear(yearsHiked[0]);
            const startIcon = getIconForHikeType(representativeHike.hike_type);
            if (hikesForTrail.length > 1) {
                startIcon.options.className += ' multi-year-icon-style';
            }
            const markerOptions = { startIcon: startIcon, endIconUrl: null };
            const gpxPath = `data/trails/${representativeHike.gpx_file}`;
            const popupContent = `
                <h3>${representativeHike.trail_name}</h3>
                <p><strong>Location:</strong> ${representativeHike.location}</p>
                <p><strong>Distance:</strong> ${representativeHike.miles} miles</p>
                <p><strong>Elevation Gain:</strong> ${representativeHike.elevation_gain} ft</p>
                <p><strong>Hiked ${hikesForTrail.length} time(s):</strong></p>
                <ul>${dateList}</ul>
            `;
            const gpxLayer = new L.GPX(gpxPath, {
                async: true,
                gpx_options: { parseElements: ['track'] },
                marker_options: markerOptions,
                polyline_options: { color: trailColor, weight: 5, opacity: 0.85 },
            }).on('error', function(e) {
                allTrailsGroup.removeLayer(gpxLayer);
            }).bindPopup(popupContent);
            allTrailsGroup.addLayer(gpxLayer);
        }
    });

    // After rendering, zoom the map to fit the new set of layers.
    setTimeout(() => { // Use timeout to wait for GPX layers to load
        if (allTrailsGroup.getLayers().length > 0) {
            map.fitBounds(allTrailsGroup.getBounds().pad(0.1));
        }
    }, 1500);
}

function populateFilters(trailGroups) {
    const years = new Set();
    const types = new Set();
    const difficulties = new Set();
    const sizes = new Set();

    trailGroups.forEach(group => {
        // We only need to check the representative hike for each group
        const representativeHike = group[0];
        types.add(representativeHike.hike_type);
        difficulties.add(representativeHike.difficulty);
        sizes.add(representativeHike.hike_size);
        // For year, we need to check all hikes in the group
        group.forEach(hike => years.add(new Date(hike.date_completed).getFullYear()));
    });

    const createFilterTags = (elementId, items, filterType) => {
        const container = document.getElementById(elementId);
        container.innerHTML = ''; // Clear existing tags
        [...items].sort().forEach(item => {
            const tag = document.createElement('button');
            tag.className = 'filter-tag';
            tag.dataset.filterType = filterType;
            tag.dataset.filterValue = item;
            tag.innerText = item;
            container.appendChild(tag);
        });
    };

    createFilterTags('year-filter-options', years, 'year');
    createFilterTags('type-filter-options', types, 'hike_type');
    createFilterTags('difficulty-filter-options', difficulties, 'difficulty');
    createFilterTags('size-filter-options', sizes, 'size');
}

function updateActiveFiltersDisplay() {
    const displayContainer = document.getElementById('active-filters-display');
    displayContainer.innerHTML = '<h5>Active Filters:</h5>';
    let hasActiveFilters = false;

    for (const type in activeFilters) {
        activeFilters[type].forEach(value => {
            hasActiveFilters = true;
            const activeTag = document.createElement('div');
            activeTag.className = 'active-filter-tag';
            activeTag.innerHTML = `<span>${value} <span class="remove-filter-btn" data-filter-type="${type}" data-filter-value="${value}">&times;</span></span>`;
            displayContainer.appendChild(activeTag);
        });
    }

    displayContainer.style.display = hasActiveFilters ? 'block' : 'none';
}

function applyFilters() {
    const filteredGroups = allHikesData.filter(group => {
        // A group matches if at least one hike within it matches all active filters.
        return group.some(hike => {
            const yearMatch = activeFilters.year.size === 0 || activeFilters.year.has(new Date(hike.date_completed).getFullYear().toString());
            const typeMatch = activeFilters.hike_type.size === 0 || activeFilters.hike_type.has(hike.hike_type);
            const difficultyMatch = activeFilters.difficulty.size === 0 || activeFilters.difficulty.has(hike.difficulty);
            const sizeMatch = activeFilters.size.size === 0 || activeFilters.size.has(hike.hike_size);
            return yearMatch && typeMatch && difficultyMatch && sizeMatch;
        });
    });

    renderMapLayers(filteredGroups);
    updateActiveFiltersDisplay();
}

function setupEventListeners() {
    document.getElementById('filter-toggle-btn').addEventListener('click', () => {
        document.getElementById('filter-panel').classList.toggle('visible');
    });

    // Event delegation for filter tags
    document.getElementById('filter-panel').addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('filter-tag')) {
            const { filterType, filterValue } = target.dataset;
            target.classList.toggle('active');
            if (activeFilters[filterType].has(filterValue)) {
                activeFilters[filterType].delete(filterValue);
            } else {
                activeFilters[filterType].add(filterValue);
            }
            applyFilters();
        }

        if (target.classList.contains('remove-filter-btn')) {
            const { filterType, filterValue } = target.dataset;
            activeFilters[filterType].delete(filterValue);
            // Deactivate the corresponding button in the options list
            const buttonToDeactivate = document.querySelector(`.filter-tag[data-filter-type="${filterType}"][data-filter-value="${filterValue}"]`);
            if (buttonToDeactivate) {
                buttonToDeactivate.classList.remove('active');
            }
            applyFilters();
        }
    });

    document.getElementById('reset-filters-btn').addEventListener('click', () => {
        for (const type in activeFilters) {
            activeFilters[type].clear();
        }
        document.querySelectorAll('.filter-tag.active').forEach(tag => tag.classList.remove('active'));
        applyFilters();
    });
}

// --- Create Custom Filter Control ---
const filterControl = L.control({ position: 'topright' });

filterControl.onAdd = function (map) {
    const div = L.DomUtil.create('div', 'filter-control-container');
    div.innerHTML = `
        <button id="filter-toggle-btn">Filters</button>
        <div id="filter-panel">
            <h4>Filter Hikes</h4>
            <div class="filter-group">
                <label for="year-filter">Year</label>
                <div class="filter-options" id="year-filter-options"></div>
            </div>
            <div class="filter-group">
                <label for="type-filter">Hike Type</label>
                <div class="filter-options" id="type-filter-options"></div>
            </div>
            <div class="filter-group">
                <label for="difficulty-filter">Difficulty</label>
                <div class="filter-options" id="difficulty-filter-options"></div>
            </div>
            <div class="filter-group">
                <label for="size-filter">Hike Size</label>
                <div class="filter-options" id="size-filter-options"></div>
            </div>
            <div id="active-filters-display" style="display: none;"></div>
            <button id="reset-filters-btn">Reset Filters</button>
        </div>
    `;
    // Stop map clicks from propagating into our filter panel
    L.DomEvent.disableClickPropagation(div);
    return div;
};

filterControl.addTo(map);

// Add the layer control to the map (base maps)
L.control.layers(baseMaps).addTo(map);

function renderLegend() {
    const legendContainer = document.getElementById('legend-container');
    if (!legendContainer) return;

    let colorHtml = '<h3>Trail Colors (by Year)</h3>';
    for (const year in COLOR_MAP) {
        const color = COLOR_MAP[year];
        colorHtml += `<div class="legend-item"><span class="legend-color-box" style="background-color: ${color};"></span> ${year}</div>`;
    }

    let iconHtml = '<h3>Icon Types</h3>';
    for (const type in ICON_MAP) {
        const iconFile = ICON_MAP[type];
        iconHtml += `<div class="legend-item"><img src="assets/icons/${iconFile}" class="legend-icon hike-icon" /> ${type}</div>`;
    }

    let specialHtml = '<h3>Special Indicators</h3>';
    specialHtml += `
        <div class="legend-item">
            <div class="legend-icon-wrapper">
                <img src="assets/icons/hiker-icon.png" class="legend-icon hike-icon multi-year-icon-style" />
            </div>
            Hiked More Than Once
        </div>`;

    legendContainer.innerHTML = `
        <div class="legend-section">${colorHtml}</div>
        <div class="legend-section">${iconHtml}</div>
        <div class="legend-section">${specialHtml}</div>
    `;
}