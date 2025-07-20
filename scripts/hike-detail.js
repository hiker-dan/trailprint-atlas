/**
 * This script powers the individual hike detail page (hike.html).
 * It reads a hike ID from the URL, fetches the corresponding data from hikes.json,
 * and dynamically populates the page content.
 */
document.addEventListener('DOMContentLoaded', () => {
    // --- Modal Setup ---
    // Get modal elements once and set up their core functionality.
    // This is done outside the fetch so we don't re-add listeners.
    const modal = document.getElementById('photo-modal');
    const modalImage = document.getElementById('modal-image');
    const closeModalBtn = document.getElementById('modal-close-btn');
    const prevBtn = document.getElementById('modal-prev-btn');
    const nextBtn = document.getElementById('modal-next-btn');
    let currentModalIndex = 0;
    let currentImageSet = []; // Will hold the public IDs for the currently viewed hike

    const updateModalImage = (newIndex) => {
        if (currentImageSet.length === 0) return;
        if (newIndex >= currentImageSet.length) newIndex = 0; // Wrap to the start
        if (newIndex < 0) newIndex = currentImageSet.length - 1; // Wrap to the end
        currentModalIndex = newIndex;
        const publicId = currentImageSet[currentModalIndex];
        modalImage.src = `https://res.cloudinary.com/dgdniwosl/image/upload/w_1200,h_1200,c_limit,q_auto,f_auto/${publicId}`;
    };

    const urlParams = new URLSearchParams(window.location.search);
    const hikeId = urlParams.get('id');

    // If no ID is provided in the URL, we can't show a hike.
    if (!hikeId) {
        document.getElementById('hike-title').innerText = 'Hike Not Found';
        document.getElementById('hike-location').innerText = 'Please select a hike from the map to view its details.';
        return;
    }

    // --- Setup Modal Listeners ---
    prevBtn.addEventListener('click', (e) => { e.stopPropagation(); updateModalImage(currentModalIndex - 1); });
    nextBtn.addEventListener('click', (e) => { e.stopPropagation(); updateModalImage(currentModalIndex + 1); });
    const closeModal = () => modal.classList.remove('visible');
    closeModalBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // 2. Fetch the main data file
    fetch('data/hikes.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.statusText}`);
            }
            return response.json();
        })
        .then(hikes => {
            // 3. Find the specific hike that matches the ID from the URL
            const hike = hikes.find(h => h.trail_id === hikeId);

            if (hike) {
                // 4. Populate the page with the hike's data
                document.title = `${hike.trail_name} - The Trailprint Atlas`; // Update the browser tab title
                document.getElementById('hike-title').innerText = hike.trail_name;
                const dateOptions = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' };
                const formattedDate = new Date(hike.date_completed).toLocaleDateString('en-US', dateOptions);
                const datePrefix = hike.hike_type === 'Viewpoint' ? 'Visited on' : 'Hiked on';
                document.getElementById('hike-date').innerText = `${datePrefix} ${formattedDate}`;
                document.getElementById('hike-location').innerText = `${hike.location} • ${hike.region}`;
                
                // --- Define helper function to create the correct icon ---
                // This logic is mirrored from trail-renderer.js for consistency.
                const getIcon = (hikeType) => {
                    const iconFilename = RENDERER_CONFIG.ICON_MAP[hikeType] || 'hiker-icon.png';
                    return L.icon({
                        iconUrl: `assets/icons/${iconFilename}`,
                        iconSize: [32, 32],
                        iconAnchor: [16, 42],
                        popupAnchor: [0, -32],
                        shadowUrl: null,
                        className: 'hike-icon'
                    });
                };

                // --- Define a custom CSS-based icon for waypoints ---
                const waypointIcon = L.divIcon({
                    className: 'waypoint-marker',
                    iconSize: [8, 8],   // Reduced size for a more subtle look
                    iconAnchor: [4, 4]  // Keep the anchor centered
                });

                // --- Determine the correct trail color based on the year ---
                const year = new Date(hike.date_completed).getFullYear().toString();
                const trailColor = RENDERER_CONFIG.COLOR_MAP[year] || RENDERER_CONFIG.DEFAULT_COLOR;

                // --- Initialize a non-interactive, cycling map ---
                const detailMap = L.map('hike-map', {
                    // Disable all user interaction to make it a static visual
                    zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
                    touchZoom: false, boxZoom: false, keyboard: false, tap: false
                }).setView([39.82, -98.58], 4); // Default view

                // Define the two base layers we want to cycle between
                const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
                    className: 'fadeable-tile-layer' // Add class for CSS transition
                });

                // The topo layer will start transparent and fade in
                const topoLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
                    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community',
                    className: 'fadeable-tile-layer', // Add class for CSS transition
                    opacity: 0 // Start transparent
                });

                // Add both layers to the map. Satellite is on the bottom, topo is on top (but transparent).
                satelliteLayer.addTo(detailMap);
                topoLayer.addTo(detailMap);

                // Set up the cycling interval
                const cycleDuration = 15000; // 15 seconds
                setInterval(() => {
                    // Check the current opacity of the top layer (topoLayer) and toggle it
                    const newOpacity = topoLayer.options.opacity === 1 ? 0 : 1;
                    topoLayer.setOpacity(newOpacity);
                }, cycleDuration);

                if (hike.gpx_file) {
                    const gpxLayer = new L.GPX(`data/trails/${hike.gpx_file}`, {
                        async: true,
                        polyline_options: { color: trailColor, weight: 5, opacity: 0.85 },
                        marker_options: { 
                            startIcon: getIcon(hike.hike_type), 
                            endIconUrl: null, shadowUrl: null }
                    }).on('addpoint', (e) => {
                        // This event fires for each point (start, end, waypoint) the plugin finds.
                        if (e.point_type === 'waypoint') {
                            // Forcefully apply our custom icon to all waypoints.
                            e.point.setIcon(waypointIcon);
                            e.point.bindPopup(`<b>${e.point.options.title}</b>`);
                        }
                    }).on('loaded', (e) => {
                        // Add padding to ensure the trail is never cut off at the edges
                        detailMap.fitBounds(e.target.getBounds(), { padding: [50, 50] });
                    }).addTo(detailMap);
                } else if (hike.latitude && hike.longitude) {
                    // For hikes without a GPX file (like viewpoints), show a marker with the correct icon
                    L.marker([hike.latitude, hike.longitude], { 
                        icon: getIcon(hike.hike_type) 
                    }).addTo(detailMap);
                    detailMap.setView([hike.latitude, hike.longitude], 13);
                }

                // --- Find all hikes that share the same trail name for the logbook ---
                const hikeGroup = hikes.filter(h => h.trail_name === hike.trail_name);

                // --- Populate Right Column ---
                (function populateInfoColumn() {
                    // 1. Populate "By the Numbers" Stats Grid
                    const statsContainer = document.getElementById('stats-grid-container');
                    statsContainer.innerHTML = `
                        <div class="stat-card"><span class="value">${hike.miles.toLocaleString()}</span><span class="label">Miles</span></div>
                        <div class="stat-card"><span class="value">${hike.elevation_gain.toLocaleString()}</span><span class="label">Elevation (ft)</span></div>
                    `;
                    if (hike.summit_trail && hike.summit_elevation) {
                        statsContainer.innerHTML += `<div class="stat-card"><span class="value">${hike.summit_elevation.toLocaleString()}</span><span class="label">Summit (ft)</span></div>`;
                    }

                    // 2. Populate "Trail Notes" Section
                    const descriptionContainer = document.getElementById('description-content-container');
                    let descriptionHtml = `<p>${hike.description.replace(/\n/g, '<br>')}</p>`; // Replace newlines with <br>

                    if (hike.primary_geography) {
                        descriptionHtml += `<div class="eco-note"><strong>Primary Geography:</strong> <em>${hike.primary_geography}</em></div>`;
                    }
                    if (hike.flora) {
                        descriptionHtml += `<div class="eco-note"><strong>Flora Spotlight:</strong> <em>${hike.flora}</em></div>`;
                    }
                    if (hike.fauna) {
                        descriptionHtml += `<div class="eco-note"><strong>Fauna Spotlight:</strong> <em>${hike.fauna}</em></div>`;
                    }
                    descriptionContainer.innerHTML = descriptionHtml;

                    // 3. Populate External Links
                    const linksContainer = document.getElementById('external-links-container');
                    if (hike.all_trails_url) {
                        linksContainer.innerHTML += `<a href="${hike.all_trails_url}" class="link-btn" target="_blank" rel="noopener noreferrer">View on AllTrails</a>`;
                    }
                    if (hike.official_trail_url) {
                        linksContainer.innerHTML += `<a href="${hike.official_trail_url}" class="link-btn" target="_blank" rel="noopener noreferrer">Official Trail Site</a>`;
                    }

                    // 4. Populate the Photo Gallery with the Polaroid Card
                    const galleryContainer = document.getElementById('photo-gallery');
                    let crewHtml = '';
                    if (hike.hike_size === 'Solo') {
                        crewHtml = `<div class="crew-details solo-journey">A Solo Journey.</div>`;
                    } else if (hike.hiked_with && hike.hiked_with.length > 0) {
                        crewHtml = `<div class="crew-details">With <strong>${hike.hiked_with.join(', ')}</strong>.</div>`;
                    }

                    if (hike.images && hike.images.length > 0) {
                        // --- Build the Polaroid Card if images exist ---
                        currentImageSet = hike.images; // Load the images for the modal

                        galleryContainer.innerHTML = `
                            <div class="polaroid-card" id="polaroid-card">
                                <div class="polaroid-image-container">
                                    <img id="polaroid-main-image" class="polaroid-image" src="" alt="Expedition photo">
                                    <div class="polaroid-thumbnail-strip" id="polaroid-thumbnail-container"></div>
                                </div>
                                <div class="polaroid-text">
                                    <div class="title">${hike.difficulty} ${hike.hike_type}</div>
                                    ${crewHtml}
                                </div>
                            </div>
                        `;

                        const mainPolaroidImage = document.getElementById('polaroid-main-image');
                        const thumbnailContainer = document.getElementById('polaroid-thumbnail-container');

                        const cloudName = 'dgdniwosl';

                        // Set the initial image for the Polaroid viewer
                        mainPolaroidImage.src = `https://res.cloudinary.com/${cloudName}/image/upload/w_800,h_600,c_limit,q_auto,f_auto/${hike.images[0]}`;

                        hike.images.forEach((publicId, index) => {
                            const thumb = document.createElement('img');
                            thumb.src = `https://res.cloudinary.com/${cloudName}/image/upload/w_120,h_120,c_fill,q_auto,f_auto/${publicId}`;
                            thumb.dataset.publicId = publicId;
                            if (index === 0) { thumb.classList.add('active'); }
                            thumb.addEventListener('click', () => {
                                mainPolaroidImage.src = `https://res.cloudinary.com/${cloudName}/image/upload/w_800,h_600,c_limit,q_auto,f_auto/${publicId}`;
                                document.querySelectorAll('.polaroid-thumbnail-strip img').forEach(i => i.classList.remove('active'));
                                thumb.classList.add('active');
                            });
                            thumbnailContainer.appendChild(thumb);
                        });

                        mainPolaroidImage.addEventListener('click', () => {
                            const activeThumb = document.querySelector('.polaroid-thumbnail-strip img.active');
                            currentModalIndex = hike.images.indexOf(activeThumb.dataset.publicId);
                            updateModalImage(currentModalIndex);
                            modal.classList.add('visible');
                        });

                    } else {
                        // Fallback message if no images
                        // If there are no photos, we'll hide the photo gallery and make the map full-width.
                        // We'll then create a new "Expedition Details" section to display the info
                        // that would have been in the polaroid card.
                        const topVisualsGrid = galleryContainer.parentElement;
                        galleryContainer.style.display = 'none';
                        topVisualsGrid.style.gridTemplateColumns = '1fr';

                        // Tell Leaflet to re-check its container size.
                        // We use a short timeout to ensure the browser has finished
                        // the CSS reflow before Leaflet tries to resize the map.
                        setTimeout(() => {
                            detailMap.invalidateSize(true); // 'true' animates the transition smoothly
                        }, 10); // A tiny delay is often sufficient

                        // Create the new section to hold the details
                        const statsSection = document.getElementById('hike-stats');
                        const expeditionDetailsSection = document.createElement('div');
                        expeditionDetailsSection.className = 'info-section';

                        let detailsContent = `<strong>${hike.difficulty} ${hike.hike_type}</strong>`;
                        if (hike.hike_size === 'Solo') {
                            detailsContent += `<br>A Solo Journey.`;
                        } else if (hike.hiked_with && hike.hiked_with.length > 0) {
                            detailsContent += `<br>With <strong>${hike.hiked_with.join(', ')}</strong>.`;
                        }

                        expeditionDetailsSection.innerHTML = `
                            <h3>Expedition Details</h3>
                            <div class="expedition-meta">${detailsContent}</div>
                        `;
                        // Insert the new section right after the "By the Numbers" stats grid
                        statsSection.after(expeditionDetailsSection);
                    }

                    // Add journal entry if it exists
                    if (hike.notes) {
                        descriptionContainer.innerHTML += `
                            <div class="journal-entry">
                                <p>${hike.notes.replace(/\n/g, '<br>')}</p>
                            </div>
                        `;
                    }

                    // 5. Populate "Logbook" Section if hiked more than once
                    if (hikeGroup.length > 1) {
                        const logbookSection = document.getElementById('hike-log');
                        logbookSection.style.display = 'block'; // Show the section
                        const logbookContainer = logbookSection.querySelector('#logbook-container');
                        
                        // Sort hikes by date, most recent first
                        hikeGroup.sort((a, b) => new Date(b.date_completed) - new Date(a.date_completed));

                        logbookContainer.innerHTML = hikeGroup.map(log => {
                            const isCurrent = log.trail_id === hikeId;
                            const dateStr = new Date(log.date_completed).toLocaleDateString('en-US', dateOptions);

                            let metaHtml = `<p class="meta">Hiked as a ${log.hike_size}`;
                            if (log.hiked_with && log.hiked_with.length > 0) {
                                metaHtml += ` with ${log.hiked_with.join(', ')}`;
                            }
                            metaHtml += `</p>`;
 
                            let notesHtml = '';
                            if (log.notes) {
                                notesHtml = `<div class="notes">${log.notes}</div>`;
                            }

                            const innerContent = `
                                <div class="date">${dateStr}</div>
                                ${metaHtml}
                                ${notesHtml}
                            `;

                            if (isCurrent) {
                                return `<div class="log-entry current-hike">${innerContent}</div>`;
                            } else {
                                return `<a href="hike.html?id=${log.trail_id}" class="log-entry">${innerContent}</a>`;
                            }
                        }).join('');
                    }
                })();

            } else {
                document.getElementById('hike-title').innerText = 'Hike Not Found';
                document.getElementById('hike-location').innerText = `No hike data found for ID: ${hikeId}`;
            }
        })
        .catch(error => {
            console.error('Error fetching hike data:', error);
            document.getElementById('hike-title').innerText = 'Error Loading Data';
            document.getElementById('hike-location').innerText = 'Could not load hike details. Please check the console.';
        });
});