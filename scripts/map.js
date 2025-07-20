// Initialize the map and set its view to our chosen geographical coordinates and a zoom level
// The coordinates are centered roughly on the USA.
const map = L.map('map').setView([39.82, -98.58], 5);

// --- Define Base Map Tile Layers ---
const esriTopoMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
	attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
});

const voyagerMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
	attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
	subdomains: 'abcd',
	maxZoom: 19
});

const satelliteMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
	attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
});

// Set the default map layer
esriTopoMap.addTo(map);

// Create a base maps object
const baseMaps = {
    "Topo": esriTopoMap,
    "Simple": voyagerMap,
    "Satellite": satelliteMap
};

let allHikesData = []; // Will hold the full, original dataset
const allTrailsGroup = L.featureGroup().addTo(map); // The main layer group for our trails
let layerReferences = {}; // To store references to map layers by trail_id

// --- New Filter State Management ---
const activeFilters = {
    year: new Set(),
    hike_type: new Set(),
    difficulty: new Set(),
    size: new Set(),
    search: '' // New property for the search term
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
    layerReferences = {}; // Reset references to prevent memory leaks and bugs

    renderTrailList(trailGroupsToRender);
    const loadingPromises = []; // An array to hold our loading promises

    trailGroupsToRender.forEach(hikesForTrail => {
        // Use the shared renderer in interactive mode
        const layer = renderTrailGroup(hikesForTrail, {
            isInteractive: true,
            popupHtmlGenerator: generatePopupHtml // Pass the function to generate popups
        });

        if (layer) {
            allTrailsGroup.addLayer(layer);
            layerReferences[hikesForTrail[0].trail_name] = layer;

            // If it's a GPX layer, it loads asynchronously. We create a promise for it.
            if (hikesForTrail[0].gpx_file) {
                const gpxPromise = new Promise(resolve => {
                    layer.on('loaded', () => resolve());
                    layer.on('error', () => resolve()); // Also resolve on error to not wait forever
                });
                loadingPromises.push(gpxPromise);
            }
        }
    });

    // Wait for all promises to resolve, then set the map view.
    Promise.all(loadingPromises).then(() => {
        if (allTrailsGroup.getLayers().length > 0) {
            map.fitBounds(allTrailsGroup.getBounds().pad(0.1));
        }
    });
}

function renderTrailList(trailGroupsToRender) {
    const listContainer = document.getElementById('trail-list-container');
    listContainer.innerHTML = ''; // Clear only the list items

    // Sort trail groups alphabetically by name
    trailGroupsToRender.sort((a, b) => a[0].trail_name.localeCompare(b[0].trail_name));

    trailGroupsToRender.forEach(group => {
        const representativeHike = group[0];
        const listItem = document.createElement('div');
        listItem.className = 'trail-list-item';
        // Store the trail_name on the element for our click listener
        listItem.dataset.trailName = representativeHike.trail_name;
        listItem.innerHTML = `
            <h4>${representativeHike.trail_name}</h4>
            <p>${representativeHike.location}</p>
        `;
        listContainer.appendChild(listItem);
    });
}

function generatePopupHtml(hikesForTrail) {
    const representativeHike = hikesForTrail[0]; // For shared info like name, miles, etc.

    let datesSectionHtml = '';
    if (hikesForTrail.length > 1) {
        // If hiked more than once, make each date a link
        const dateList = hikesForTrail
            .sort((a, b) => new Date(b.date_completed) - new Date(a.date_completed))
            .map(h => {
                const dateStr = new Date(h.date_completed).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
                return `<li><a href="hike.html?id=${h.trail_id}">${dateStr}</a></li>`;
            }).join('');
        const verb = representativeHike.hike_type === 'Viewpoint' ? 'Visited' : 'Hiked';
        datesSectionHtml = `<p><strong>${verb} ${hikesForTrail.length} times (click date for details):</strong></p><ul>${dateList}</ul>`;
    } else {
        // If hiked only once, use the single "View Full Details" link
        const singleHike = hikesForTrail[0];
        const dateStr = new Date(singleHike.date_completed).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
        const verb = singleHike.hike_type === 'Viewpoint' ? 'Visited on' : 'Hiked on';
        datesSectionHtml = `
            <p><strong>${verb}:</strong> ${dateStr}</p>
            <p style="margin-top: 10px; text-align: center;"><a href="hike.html?id=${singleHike.trail_id}" style="font-weight: bold;">View Full Details</a></p>
        `;
    }

    if (representativeHike.hike_type === 'Viewpoint') {
        return `
            <h3>${representativeHike.trail_name}</h3>
            <p><strong>Recreation or Natural Area:</strong> ${representativeHike.location}</p>
            <p><strong>Near:</strong> ${representativeHike.region}</p>
            ${datesSectionHtml}
        `;
    } else {
        let summitHtml = '';
        if (representativeHike.summit_trail && representativeHike.summit_elevation) {
            summitHtml = `<p><strong>Summit Elevation:</strong> ${representativeHike.summit_elevation.toLocaleString()} ft</p>`;
        }
        return `
            <h3>${representativeHike.trail_name}</h3>
            <p><strong>Recreation or Natural Area:</strong> ${representativeHike.location}</p>
            <p><strong>Near:</strong> ${representativeHike.region}</p>
            <p><strong>Distance:</strong> ${representativeHike.miles} miles</p>
            <p><strong>Elevation Gain:</strong> ${representativeHike.elevation_gain.toLocaleString()} ft</p>
            ${summitHtml}
            ${datesSectionHtml}
        `;
    }
}

function generateListDetailsHtml(hikesForTrail) {
    const representativeHike = hikesForTrail[0];

    let datesSectionHtml = '';
    if (hikesForTrail.length > 1) {
        // If hiked more than once, make each date a link
        const dateList = hikesForTrail
            .sort((a, b) => new Date(b.date_completed) - new Date(a.date_completed))
            .map(h => {
                const dateStr = new Date(h.date_completed).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
                return `<li><a href="hike.html?id=${h.trail_id}">${dateStr}</a></li>`;
            }).join('');
        const verb = representativeHike.hike_type === 'Viewpoint' ? 'Visited' : 'Hiked';
        datesSectionHtml = `<p><strong>${verb} ${hikesForTrail.length} times (click date for details):</strong></p><ul>${dateList}</ul>`;
    } else {
        // If hiked only once, use the single "View Full Details" link
        const singleHike = hikesForTrail[0];
        const dateStr = new Date(singleHike.date_completed).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
        const verb = singleHike.hike_type === 'Viewpoint' ? 'Visited on' : 'Hiked on';
        datesSectionHtml = `
            <p><strong>${verb}:</strong> ${dateStr}</p>
            <p><a href="hike.html?id=${singleHike.trail_id}">View Full Details</a></p>
        `;
    }

    if (representativeHike.hike_type === 'Viewpoint') {
        return datesSectionHtml; // For viewpoints, the dates section is all we need.
    } else {
        let summitHtml = '';
        if (representativeHike.summit_trail && representativeHike.summit_elevation) {
            summitHtml = `<p><strong>Summit Elevation:</strong> ${representativeHike.summit_elevation.toLocaleString()} ft</p>`;
        }
        return `
            <p><strong>Distance:</strong> ${representativeHike.miles} miles</p>
            <p><strong>Elevation Gain:</strong> ${representativeHike.elevation_gain.toLocaleString()} ft</p>
            ${summitHtml}
            ${datesSectionHtml}
        `;
    }
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

function clearAllFilters() {
    // 1. Reset filters state
    for (const type in activeFilters) {
        if (activeFilters[type] instanceof Set) {
            activeFilters[type].clear();
        }
    }
    activeFilters.search = '';

    // 2. Reset UI elements
    document.getElementById('trail-search-input').value = '';
    document.querySelectorAll('.filter-tag.active').forEach(tag => tag.classList.remove('active'));
}

function applyFilters() {
    const filteredGroups = allHikesData.filter(group => {
        // Check search filter first, as it applies to the whole group
        const representativeHike = group[0];
        const searchMatch = activeFilters.search === '' || 
                            representativeHike.trail_name.toLowerCase().includes(activeFilters.search) ||
                            representativeHike.location.toLowerCase().includes(activeFilters.search);

        if (!searchMatch) {
            return false; // If it doesn't match search, no need to check other filters
        }

        // Then, check that the group contains at least one hike matching the tag filters.
        const tagFiltersMatch = group.some(hike => {
            const yearMatch = activeFilters.year.size === 0 || activeFilters.year.has(new Date(hike.date_completed).getFullYear().toString());
            const typeMatch = activeFilters.hike_type.size === 0 || activeFilters.hike_type.has(hike.hike_type);
            const difficultyMatch = activeFilters.difficulty.size === 0 || activeFilters.difficulty.has(hike.difficulty);
            const sizeMatch = activeFilters.size.size === 0 || activeFilters.size.has(hike.hike_size);
            return yearMatch && typeMatch && difficultyMatch && sizeMatch;
        });
        return tagFiltersMatch;
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
        clearAllFilters();
        applyFilters();
    });

    // Event listener for the search input
    document.getElementById('trail-search-input').addEventListener('input', (e) => {
        activeFilters.search = e.target.value.toLowerCase();
        applyFilters();
    });

    // Event delegation for the trail list
    document.getElementById('trail-list-container').addEventListener('click', (e) => {
        const listItem = e.target.closest('.trail-list-item');
        if (listItem) {
            const wasActive = listItem.classList.contains('active');

            // Close any currently open panel
            const existingPanel = document.querySelector('.trail-details-panel');
            if (existingPanel) {
                existingPanel.previousElementSibling.classList.remove('active');
                existingPanel.remove();
            }

            // If the clicked item was not already active, open a new one
            if (!wasActive) {
                listItem.classList.add('active');
                const trailName = listItem.dataset.trailName;
                const trailGroup = allHikesData.find(group => group[0].trail_name === trailName);
                if (trailGroup) {
                    const detailsContent = generateListDetailsHtml(trailGroup);
                    const detailsPanel = document.createElement('div');
                    detailsPanel.className = 'trail-details-panel';
                    detailsPanel.innerHTML = detailsContent;
                    listItem.after(detailsPanel);
                }
            }

            // Always zoom the map
            const trailName = listItem.dataset.trailName;
            const layer = layerReferences[trailName];
            if (layer) {
                if (layer.getBounds) { // It's a GPX layer
                    map.fitBounds(layer.getBounds(), { padding: [50, 50] });
                } else if (layer.getLatLng) { // It's a Marker
                    map.setView(layer.getLatLng(), 15);
                }
            }
        }
    });
}

// --- Create Custom Reset Control ---
const resetControl = L.control({ position: 'topleft' });

resetControl.onAdd = function(map) {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
    const button = L.DomUtil.create('a', 'leaflet-control-reset-view', container);
    button.innerHTML = '&#x21bb;'; // Refresh symbol
    button.href = '#';
    button.title = 'Reset all filters';
    button.setAttribute('role', 'button');
    button.setAttribute('aria-label', 'Reset all filters');

    // Prevent map events from firing when clicking the button
    L.DomEvent.on(button, 'click', L.DomEvent.stop);
    L.DomEvent.on(button, 'click', () => {
        clearAllFilters();
        applyFilters();
    });

    return container;
};

resetControl.addTo(map);

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

    // Section 1: Trail Colors
    let colorHtml = '<h3>Trail Color (Year Last Hiked)</h3>';
    for (const year in RENDERER_CONFIG.COLOR_MAP) {
        const color = RENDERER_CONFIG.COLOR_MAP[year];
        colorHtml += `<div class="legend-item"><span class="legend-trail-segment" style="background-color: ${color};"></span> ${year}</div>`;
    }

    // Section 2: Hike Types
    let iconHtml = '<h3>Hike Type</h3>';
    for (const type in RENDERER_CONFIG.ICON_MAP) {
        const iconFile = RENDERER_CONFIG.ICON_MAP[type];
        const labelText = (type === 'Viewpoint') ? `${type} (No Trail Path)` : type;
        iconHtml += `<div class="legend-item"><img src="assets/icons/${iconFile}" class="legend-icon hike-icon" /> ${labelText}</div>`;
    }

    // Section 3: Special Indicators
    let specialHtml = '<h3>Special Indicators</h3>';
    specialHtml += `
        <div class="legend-item">
            <div class="legend-icon-wrapper">
                <img src="assets/icons/blank-icon.png" class="legend-icon hike-icon multi-year-icon-style" />
            </div>
            Hiked More Than Once
        </div>`;

    legendContainer.innerHTML = `
        <div class="legend-section">${colorHtml}</div>
        <div class="legend-section">${iconHtml}</div>
        <div class="legend-section">${specialHtml}</div>
    `;
}