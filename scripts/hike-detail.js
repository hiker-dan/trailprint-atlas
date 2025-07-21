/**
 * This script powers the individual hike detail page (hike.html).
 * It fetches all hike data, builds a dynamic navigation timeline,
 * and displays the content for a specific hike based on the URL or user interaction.
 */
document.addEventListener('DOMContentLoaded', async () => {
    // --- Modal Setup ---
    // Get modal elements once and set up their core functionality.
    // This is done outside the fetch so we don't re-add listeners.
    const modal = document.getElementById('photo-modal');
    // ... (modal variables remain the same)
    const modalImage = document.getElementById('modal-image');
    const modalVideoContainer = document.getElementById('modal-video-container');
    const closeModalBtn = document.getElementById('modal-close-btn');
    const prevBtn = document.getElementById('modal-prev-btn');
    const modalDotsContainer = document.getElementById('modal-dots-container');
    const nextBtn = document.getElementById('modal-next-btn');
    let currentModalIndex = 0;
    let currentMediaSetInModal = []; // Will hold the media items for the modal

    // --- Global State ---
    let detailMap; // To hold the Leaflet map instance

    // Helper function to extract video ID from various YouTube URL formats
    const getYoutubeId = (url) => {
        // This regex handles standard, short, and other YouTube URL variations.
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    };

    const updateModalMedia = (newIndex) => {
        if (currentMediaSetInModal.length === 0) return;

        // Show or hide navigation arrows based on the number of media items.
        const showNav = currentMediaSetInModal.length > 1;
        prevBtn.style.display = showNav ? 'block' : 'none';
        nextBtn.style.display = showNav ? 'block' : 'none';

        if (newIndex >= currentMediaSetInModal.length) newIndex = 0; // Wrap to the start
        if (newIndex < 0) newIndex = currentMediaSetInModal.length - 1; // Wrap to the end
        currentModalIndex = newIndex;
        const item = currentMediaSetInModal[currentModalIndex];

        // Hide both containers and stop any playing video
        modalImage.style.display = 'none';
        modalVideoContainer.style.display = 'none';
        modalVideoContainer.innerHTML = '';

        if (item.type === 'photo') {
            modalImage.src = `https://res.cloudinary.com/dgdniwosl/image/upload/w_1200,h_1200,c_limit,q_auto,f_auto/${item.id}`;
            modalImage.style.display = 'block';
        } else if (item.type === 'video') {
            const videoId = getYoutubeId(item.url);
            if (videoId) {
                modalVideoContainer.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&controls=1&rel=0&iv_load_policy=3&showinfo=0" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
                modalVideoContainer.style.display = 'flex';
            }
        }

        // --- Populate modal dots ---
        modalDotsContainer.innerHTML = ''; // Clear existing dots
        if (currentMediaSetInModal.length > 1) {
            currentMediaSetInModal.forEach((media, index) => {
                const dot = document.createElement('div');
                dot.className = 'media-dot';
                if (media.type === 'video') dot.classList.add('video');
                if (index === currentModalIndex) dot.classList.add('active');
                dot.addEventListener('click', (e) => { e.stopPropagation(); updateModalMedia(index); });
                modalDotsContainer.appendChild(dot);
            });
        }
    };

    // --- Setup Modal Listeners ---
    prevBtn.addEventListener('click', (e) => { e.stopPropagation(); updateModalMedia(currentModalIndex - 1); });
    nextBtn.addEventListener('click', (e) => { e.stopPropagation(); updateModalMedia(currentModalIndex + 1); });
    const closeModal = () => {
        modal.classList.remove('visible');
        // Crucially, stop any video that might be playing when the modal is closed.
        modalVideoContainer.innerHTML = '';
    };
    closeModalBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    /**
     * Builds the interactive timeline navigation bar.
     */
    function buildTimeline(allHikes, currentHikeId) {
        const timelineContainer = document.getElementById('timeline-nav-container');
        if (!timelineContainer) return;

        // 1. Sort all hikes by date to establish the timeline order
        const sortedHikes = [...allHikes].sort((a, b) => new Date(a.date_completed) - new Date(b.date_completed));
        
        // 2. Calculate the total time span for positioning
        const firstHikeTime = new Date(sortedHikes[0].date_completed).getTime();
        const lastHikeTime = new Date(sortedHikes[sortedHikes.length - 1].date_completed).getTime();
        const totalTimeSpan = lastHikeTime - firstHikeTime;

        // 3. Build the timeline HTML
        let dotsHtml = '';
        const dateOptions = { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' };

        sortedHikes.forEach(hike => {
            const hikeTime = new Date(hike.date_completed).getTime();
            // Calculate the dot's position as a percentage from the left
            const positionPercent = totalTimeSpan > 0 ? ((hikeTime - firstHikeTime) / totalTimeSpan) * 100 : 50;

            // Add a class for dots near the edges to prevent tooltips from being cut off
            let edgeClass = '';
            if (positionPercent < 10) {
                edgeClass = 'edge-left';
            } else if (positionPercent > 90) {
                edgeClass = 'edge-right';
            }
            
            const isActive = hike.trail_id === currentHikeId ? 'active' : '';
            const formattedDate = new Date(hike.date_completed).toLocaleDateString('en-US', dateOptions);

            dotsHtml += `
                <div class="timeline-dot ${isActive} ${edgeClass}" style="left: ${positionPercent}%;" data-hike-id="${hike.trail_id}">
                    <div class="timeline-tooltip">${hike.trail_name}<br><small>${formattedDate}</small></div>
                </div>
            `;
        });

        timelineContainer.innerHTML = `<div class="timeline-track">${dotsHtml}</div>`;

        // 4. Add click listeners to the newly created dots
        timelineContainer.querySelectorAll('.timeline-dot').forEach(dot => {
            dot.addEventListener('click', () => {
                const newHikeId = dot.dataset.hikeId;
                const hikeToDisplay = allHikes.find(h => h.trail_id === newHikeId);

                if (hikeToDisplay) {
                    // Update the page content
                    displayHike(hikeToDisplay, allHikes);
                    // Update the URL without a full reload
                    history.pushState({ hikeId: newHikeId }, '', `hike.html?id=${newHikeId}`);
                    // Update the active state on the timeline
                    timelineContainer.querySelector('.timeline-dot.active')?.classList.remove('active');
                    dot.classList.add('active');
                }
            });
        });
    }

    /**
     * Main function to clear and populate the page with a specific hike's details.
     */
    function displayHike(hike, allHikes) {
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
                // If a map instance already exists, remove it to prevent errors.
                if (detailMap) {
                    detailMap.remove();
                }
                detailMap = L.map('hike-map', {
                    // Disable all user interaction to make it a static visual.
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
                const hikeGroup = allHikes.filter(h => h.trail_name === hike.trail_name);

                // --- Populate Right Column ---
                (function populateInfoColumn() {
                    // 1. Populate "By the Numbers" Stats Grid
                    // Clear existing stats before adding new ones
                    document.getElementById('stats-grid-container').innerHTML = '';
                    const statsContainer = document.getElementById('stats-grid-container');
                    statsContainer.innerHTML = `
                        <div class="stat-card"><span class="value">${hike.miles.toLocaleString()}</span><span class="label">Miles</span></div>
                        <div class="stat-card"><span class="value">${hike.elevation_gain.toLocaleString()}</span><span class="label">Elevation (ft)</span></div>
                    `;
                    if (hike.summit_trail && hike.summit_elevation) {
                        statsContainer.innerHTML += `<div class="stat-card"><span class="value">${hike.summit_elevation.toLocaleString()}</span><span class="label">Summit (ft)</span></div>`;
                    }

                    // 2. Populate "Trail Notes" Section
                    // Clear existing description before adding new ones
                    document.getElementById('description-content-container').innerHTML = '';
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
                    // Clear existing links before adding new ones
                    document.getElementById('external-links-container').innerHTML = '';
                    const linksContainer = document.getElementById('external-links-container');
                    if (hike.all_trails_url) {
                        linksContainer.innerHTML += `<a href="${hike.all_trails_url}" class="link-btn" target="_blank" rel="noopener noreferrer">View on AllTrails</a>`;
                    }
                    if (hike.official_trail_url) {
                        linksContainer.innerHTML += `<a href="${hike.official_trail_url}" class="link-btn" target="_blank" rel="noopener noreferrer">Official Trail Site</a>`;
                    }

                    // 4. Populate the Photo Gallery with the Polaroid Card
                    // Clear existing gallery content before adding new
                    document.getElementById('photo-gallery').innerHTML = '';
                    const galleryContainer = document.getElementById('photo-gallery');
                    let crewHtml = '';
                    if (hike.hike_size === 'Solo' && (!hike.hiked_with || hike.hiked_with.length === 0)) {
                        crewHtml = `<div class="crew-details solo-journey">A Solo Journey.</div>`;
                    } else if (hike.hiked_with && hike.hiked_with.length > 0) {
                        crewHtml = `<div class="crew-details">With <strong>${hike.hiked_with.join(', ')}</strong>.</div>`;
                    }

                    // --- UNIFIED MEDIA GALLERY LOGIC ---
                    const hasImages = hike.images && hike.images.length > 0;
                    const hasVideos = hike.videos && hike.videos.length > 0;

                    if (hasImages || hasVideos) {
                        // 1. Combine photos and videos into a single media array
                        const mediaItems = [];
                        if (hasImages) {
                            hike.images.forEach(id => mediaItems.push({ type: 'photo', id }));
                        }
                        if (hasVideos) {
                            // Now we iterate over a simple array of URL strings
                            hike.videos.forEach(url => mediaItems.push({ type: 'video', url: url }));
                        }

                        galleryContainer.innerHTML = `
                            <div class="polaroid-card" id="polaroid-card">
                                <div class="polaroid-image-container">
                                    <img id="polaroid-main-image" class="polaroid-image" src="" alt="Expedition media" style="display: none;">
                                    <div id="youtube-player-container" style="display: none;"></div>
                                </div>
                                <div class="polaroid-text">
                                    <div class="media-context-title">${hike.difficulty} ${hike.hike_type}</div>
                                    <div class="media-context-details">${crewHtml}</div>
                                </div>
                            </div>
                        `;

                        const imageContainer = document.querySelector('.polaroid-image-container');
                        const mainPolaroidImage = document.getElementById('polaroid-main-image');
                        const youtubePlayerContainer = document.getElementById('youtube-player-container');

                        const cloudName = 'dgdniwosl';

                        let currentMediaIndex = 0;

                        const showMedia = (newIndex) => {
                            if (newIndex >= mediaItems.length) newIndex = 0;
                            if (newIndex < 0) newIndex = mediaItems.length - 1;
                            currentMediaIndex = newIndex;
                            const item = mediaItems[currentMediaIndex];

                            // Hide everything first
                            mainPolaroidImage.style.display = 'none';
                            youtubePlayerContainer.style.display = 'none';
                            youtubePlayerContainer.innerHTML = ''; // Stop video when switching

                            if (item.type === 'photo') {
                                mainPolaroidImage.src = `https://res.cloudinary.com/${cloudName}/image/upload/w_800,h_600,c_limit,q_auto,f_auto/${item.id}`;
                                mainPolaroidImage.style.display = 'block';
                            } else if (item.type === 'video') {
                                const videoId = getYoutubeId(item.url);
                                if (videoId) {
                                    youtubePlayerContainer.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&controls=1&rel=0&iv_load_policy=3&showinfo=0" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
                                    youtubePlayerContainer.style.display = 'block';
                                }
                            }

                            // Update active dot
                            document.querySelectorAll('.media-dot').forEach((dot, index) => {
                                dot.classList.toggle('active', index === currentMediaIndex);
                            });
                        };

                        // Only create navigation elements if there's more than one item
                        if (mediaItems.length > 1) {
                            // Create nav arrows
                            const prevArrow = document.createElement('span');
                            prevArrow.className = 'media-nav-arrow prev';
                            prevArrow.innerHTML = '&lsaquo;';
                            prevArrow.addEventListener('click', (e) => { e.stopPropagation(); showMedia(currentMediaIndex - 1); });

                            const nextArrow = document.createElement('span');
                            nextArrow.className = 'media-nav-arrow next';
                            nextArrow.innerHTML = '&rsaquo;';
                            nextArrow.addEventListener('click', (e) => { e.stopPropagation(); showMedia(currentMediaIndex + 1); });

                            imageContainer.appendChild(prevArrow);
                            imageContainer.appendChild(nextArrow);

                            // Create dots
                            const dotsContainer = document.createElement('div');
                            dotsContainer.className = 'media-dots-container';
                            mediaItems.forEach((item, index) => {
                                const dot = document.createElement('div');
                                dot.className = 'media-dot';
                                if (item.type === 'video') {
                                    const videoId = getYoutubeId(item.url);
                                    if (videoId) {
                                        dot.classList.add('video');
                                    } else {
                                        return; // Don't create a dot for an invalid video URL
                                    }
                                }
                                dot.addEventListener('click', (e) => { e.stopPropagation(); showMedia(index); });
                                dotsContainer.appendChild(dot);
                            });
                            imageContainer.appendChild(dotsContainer);
                        }

                        // Set initial media item
                        showMedia(0);

                        // Update modal click listener to open any media type
                        document.getElementById('polaroid-card').addEventListener('click', (e) => {
                            // Prevent modal from opening if a nav arrow/dot was clicked
                            if (e.target.classList.contains('media-nav-arrow') || e.target.classList.contains('media-dot')) {
                                return;
                            }
                            currentMediaSetInModal = mediaItems;
                            updateModalMedia(currentMediaIndex);
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
                    const existingJournal = document.querySelector('.journal-entry');
                    if (existingJournal) existingJournal.remove();
                    if (hike.notes) {
                        descriptionContainer.innerHTML += `
                            <div class="journal-entry">
                                <p>${hike.notes.replace(/\n/g, '<br>')}</p>
                            </div>
                        `;
                    }

                    // 5. Populate "Logbook" Section if hiked more than once
                    const logbookSection = document.getElementById('hike-log');
                    logbookSection.style.display = 'none'; // Hide by default
                    if (hikeGroup.length > 1) {
                        logbookSection.style.display = 'block'; // Show the section
                        const logbookContainer = logbookSection.querySelector('#logbook-container');
                        
                        // Sort hikes by date, most recent first
                        hikeGroup.sort((a, b) => new Date(b.date_completed) - new Date(a.date_completed));

                        logbookContainer.innerHTML = hikeGroup.map(log => {
                            const isCurrent = log.trail_id === hike.trail_id;
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
    }

    // Listen for the browser's back/forward buttons
    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.hikeId) {
            // We need the full `allHikes` array to be available here.
            // We'll fetch it again or ideally have it stored globally.
            fetch('data/hikes.json').then(res => res.json()).then(allHikes => {
                const hikeToDisplay = allHikes.find(h => h.trail_id === event.state.hikeId);
                if (hikeToDisplay) {
                    displayHike(hikeToDisplay, allHikes);
                    // Also update the active dot on the timeline
                    document.querySelector('#timeline-nav-container .timeline-dot.active')?.classList.remove('active');
                    document.querySelector(`#timeline-nav-container .timeline-dot[data-hike-id="${event.state.hikeId}"]`)?.classList.add('active');
                }
            });
        }
    });

    /**
     * The main execution block that runs on page load.
     */
    try {
        // 1. Fetch all hike data
        const response = await fetch('data/hikes.json');
        if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.statusText}`);
        }
        const allHikes = await response.json();

        // 2. Get the hike ID from the URL to display the initial hike
        const urlParams = new URLSearchParams(window.location.search);
        const hikeId = urlParams.get('id');

        // Set the initial state for the history API, now that we have the hikeId
        history.replaceState({ hikeId: hikeId }, '');

        if (!hikeId) {
            document.getElementById('hike-title').innerText = 'Hike Not Found';
            document.getElementById('hike-location').innerText = 'Please select a hike from the map or timeline.';
            return;
        }

        // 3. Find the specific hike to display
        const hikeToDisplay = allHikes.find(h => h.trail_id === hikeId);

        if (hikeToDisplay) {
            // 4. Build the timeline and display the initial hike
            buildTimeline(allHikes, hikeId);
            displayHike(hikeToDisplay, allHikes);
        } else {
            document.getElementById('hike-title').innerText = 'Hike Not Found';
            document.getElementById('hike-location').innerText = `No hike data found for ID: ${hikeId}`;
        }
    } catch (error) {
        console.error('Error initializing hike detail page:', error);
        document.getElementById('hike-title').innerText = 'Error Loading Data';
        document.getElementById('hike-location').innerText = 'Could not load hike details. Please check the console.';
    }
});