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
     * Centers the timeline viewport on a specific hike dot.
     * @param {string} hikeId - The ID of the hike to center on.
     * @param {string} behavior - 'smooth' or 'auto' for scroll behavior.
     */
    function centerTimelineOn(hikeId, behavior = 'smooth') {
        const viewport = document.getElementById('timeline-viewport');
        const activeDot = document.querySelector(`.timeline-dot[data-hike-id="${hikeId}"]`);
        if (!viewport || !activeDot) return;

        let scrollTarget;
        const tripBar = activeDot.closest('.timeline-trip-bar');

        if (tripBar) {
            // For dots inside a trip, their offsetLeft is relative to the bar.
            // We calculate the absolute position on the track by adding the bar's offset.
            scrollTarget = (tripBar.offsetLeft + activeDot.offsetLeft) - (viewport.clientWidth / 2);
        } else {
            // For solo dots, offsetLeft is already relative to the track.
            scrollTarget = activeDot.offsetLeft - (viewport.clientWidth / 2);
        }

        viewport.scrollTo({
            left: scrollTarget,
            behavior: behavior
        });
    }

    /**
     * Builds the interactive timeline navigation bar.
     */
    function buildTimeline(allHikes, currentHikeId) {
        const track = document.getElementById('timeline-track');
        const viewport = document.getElementById('timeline-viewport');
        if (!track || !viewport) return;

        // 1. Sort hikes and get the full time range of all adventures
        const sortedHikes = [...allHikes].sort((a, b) => new Date(a.date_completed) - new Date(b.date_completed));
        const firstHikeTime = new Date(sortedHikes[0].date_completed + 'T00:00:00Z').getTime();
        const lastHikeTime = new Date(sortedHikes[sortedHikes.length - 1].date_completed + 'T00:00:00Z').getTime();
        const totalTimeSpan = lastHikeTime - firstHikeTime;

        // 2. Define a density constant and calculate total track width based on TIME, not number of hikes.
        // This is the key to making the timeline an accurate representation of time.
        const PIXELS_PER_DAY = 5; // Adjust this to make the timeline more or less dense.
        const PADDING_PX = viewport.clientWidth;
        const totalWidth = (totalTimeSpan / (1000 * 60 * 60 * 24)) * PIXELS_PER_DAY + PADDING_PX;
        track.style.width = `${totalWidth}px`;

        // 3. Build the timeline HTML (This logic remains largely the same, but now works with the time-based width)
        let timelineHtml = '';

        // --- NEW: Group hikes by trip_tag ---
        const trips = new Map();
        const soloHikes = [];

        sortedHikes.forEach(hike => {
            if (hike.trip_tag) {
                if (!trips.has(hike.trip_tag)) {
                    trips.set(hike.trip_tag, []);
                }
                trips.get(hike.trip_tag).push(hike);
            } else {
                soloHikes.push(hike);
            }
        });

        // --- Render Solo Hikes (as individual dots) ---
        soloHikes.forEach(hike => {
            const hikeTime = new Date(hike.date_completed + 'T00:00:00Z').getTime();
            const positionPercent = totalTimeSpan > 0 ? ((hikeTime - firstHikeTime) / totalTimeSpan) : 0.5;
            const finalDotPosition = (positionPercent * (totalWidth - PADDING_PX)) + (PADDING_PX / 2);
            const isActive = hike.trail_id === currentHikeId ? 'active' : '';
            timelineHtml += `<div class="timeline-dot ${isActive}" style="left: ${finalDotPosition}px;" data-hike-id="${hike.trail_id}"></div>`;
        });

        // --- Render Trips (as bars containing dots) ---
        trips.forEach(hikesInTrip => {
            // Find the start and end time for this trip
            const tripTimes = hikesInTrip.map(h => new Date(h.date_completed + 'T00:00:00Z').getTime());
            const tripStartTime = Math.min(...tripTimes);
            const tripEndTime = Math.max(...tripTimes);

            // Calculate the bar's position and width
            const startPercent = (tripStartTime - firstHikeTime) / totalTimeSpan;
            const endPercent = (tripEndTime - firstHikeTime) / totalTimeSpan;
            const barLeft = (startPercent * (totalWidth - PADDING_PX)) + (PADDING_PX / 2);
            const barRight = (endPercent * (totalWidth - PADDING_PX)) + (PADDING_PX / 2);
            const barWidth = Math.max(50, barRight - barLeft); // Enforce a wider minimum width for the capsule

            // Generate the dots that will live *inside* the bar
            let tripDotsHtml = '';
            const hikesByDate = new Map();
            hikesInTrip.forEach(h => {
                const dateKey = h.date_completed;
                if (!hikesByDate.has(dateKey)) hikesByDate.set(dateKey, []);
                hikesByDate.get(dateKey).push(h);
            });

            hikesInTrip.forEach(hike => {
                const hikeTime = new Date(hike.date_completed + 'T00:00:00Z').getTime();
                // Position dot relative to the trip bar's start
                const dotPositionPercent = (tripEndTime - tripStartTime > 0) ? (hikeTime - tripStartTime) / (tripEndTime - tripStartTime) : 0.5;
                const dotPosition = dotPositionPercent * barWidth;

                const dayGroup = hikesByDate.get(hike.date_completed);
                let offset = 0;
                if (dayGroup.length > 1) {
                    const SPREAD_FACTOR_PX = 18;
                    const hikeIndexInGroup = dayGroup.findIndex(h_in_group => h_in_group.trail_id === hike.trail_id);
                    const centerIndex = (dayGroup.length - 1) / 2;
                    offset = (hikeIndexInGroup - centerIndex) * SPREAD_FACTOR_PX;
                }
                const finalDotPosition = dotPosition + offset;
                const isActive = hike.trail_id === currentHikeId ? 'active' : '';
                tripDotsHtml += `<div class="timeline-dot ${isActive}" style="left: ${finalDotPosition}px;" data-hike-id="${hike.trail_id}" data-date="${hike.date_completed}"></div>`;
            });

            // NEW: Add the label inside the capsule
            const labelText = 'Trip';
            timelineHtml += `
                <div class="timeline-trip-bar" style="left: ${barLeft}px; width: ${barWidth}px;">
                    <span class="trip-bar-label">${labelText}</span>
                    ${tripDotsHtml}
                </div>`;
        });

        track.innerHTML = timelineHtml;

        // 4. Add click listeners to the newly created dots
        track.querySelectorAll('.timeline-dot').forEach(dot => {
            dot.addEventListener('click', () => {
                const newHikeId = dot.dataset.hikeId;
                const hikeToDisplay = allHikes.find(h => h.trail_id === newHikeId);

                if (hikeToDisplay) {
                    displayHike(hikeToDisplay, allHikes);
                    history.pushState({ hikeId: newHikeId }, '', `hike.html?id=${newHikeId}`);
                    track.querySelector('.timeline-dot.active')?.classList.remove('active');
                    dot.classList.add('active');
                    centerTimelineOn(newHikeId);
                }
            });
        });

        // --- NEW: "Hover Priority" Logic for Trip Bars ---
        // This system uses a delayed collapse to create an "invisible bridge"
        // for the mouse, and gives the hovered bar priority with z-index.
        const expandTripBar = (bar) => {
            // If a collapse is scheduled, cancel it. This is the "bridge".
            if (bar.dataset.collapseTimeoutId) {
                clearTimeout(bar.dataset.collapseTimeoutId);
                bar.dataset.collapseTimeoutId = null;
            }
            // Don't re-run if already expanded.
            if (bar.classList.contains('trip-bar-hover')) return;

            bar.classList.add('trip-bar-hover');

            const dotsInBar = Array.from(bar.querySelectorAll('.timeline-dot'));
            dotsInBar.forEach(dot => {
                if (!dot.dataset.originalLeft) dot.dataset.originalLeft = dot.style.left;
            });

            const numDots = dotsInBar.length;
            if (numDots > 1) {
                const GUARANTEED_SPACING_PX = 40;
                const requiredWidth = (numDots - 1) * GUARANTEED_SPACING_PX;
                const barWidth = bar.offsetWidth;
                const clusterStartPosition = (barWidth / 2) - (requiredWidth / 2);
                // Sort dots by their date attribute to ensure chronological order.
                const sortedDots = dotsInBar.sort((a, b) => new Date(a.dataset.date + 'T00:00:00Z') - new Date(b.dataset.date + 'T00:00:00Z'));
                sortedDots.forEach((dot, index) => {
                    const newPosition = clusterStartPosition + (index * GUARANTEED_SPACING_PX);
                    dot.style.left = `${newPosition}px`;
                });
            }
        };

        const collapseTripBar = (bar) => {
            const timeoutId = setTimeout(() => {
                bar.classList.remove('trip-bar-hover');
                const dotsInBar = bar.querySelectorAll('.timeline-dot');
                dotsInBar.forEach(dot => {
                    if (dot.dataset.originalLeft) dot.style.left = dot.dataset.originalLeft;
                });
            }, 200); // 200ms grace period before collapsing.
            bar.dataset.collapseTimeoutId = timeoutId;
        };

        track.addEventListener('mouseover', (e) => {
            const bar = e.target.closest('.timeline-trip-bar');
            if (bar) expandTripBar(bar);
        });

        track.addEventListener('mouseout', (e) => {
            const bar = e.target.closest('.timeline-trip-bar');
            if (bar) collapseTripBar(bar);
        });
    }

    /**
     * Sets up scrolling functionality for the timeline.
     */
    function setupTimelineScrolling(allHikes) {
        const viewport = document.getElementById('timeline-viewport');
        const track = document.getElementById('timeline-track');
        const dateDisplay = document.getElementById('timeline-date-display');
        const floatingMonth = document.getElementById('timeline-floating-month');
        const floatingYear = document.getElementById('timeline-floating-year');
        const timelineNavContainer = document.getElementById('timeline-nav-container');
        const landscapeContainer = document.getElementById('timeline-mountainscape');
        const globalTooltip = document.getElementById('timeline-global-tooltip');
        if (!viewport || !track || !dateDisplay || !floatingMonth || !floatingYear || !globalTooltip || !landscapeContainer || !timelineNavContainer) return;

        const sortedHikes = [...allHikes].sort((a, b) => new Date(a.date_completed) - new Date(b.date_completed));
        const firstHikeTime = new Date(sortedHikes[0].date_completed + 'T00:00:00Z').getTime();
        const lastHikeTime = new Date(sortedHikes[sortedHikes.length - 1].date_completed + 'T00:00:00Z').getTime();
        const totalTimeSpan = lastHikeTime - firstHikeTime;
        const PADDING_PX = viewport.clientWidth;

        const dateOptions = { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' };

        const updateTimelineDisplay = () => {
            // This function handles background seasons, parallax, and the central date display.
            const scrollCenter = viewport.scrollLeft + (viewport.clientWidth / 2);
            const trackWidth = track.clientWidth - PADDING_PX;
            const scrollPercent = trackWidth > 0 ? (scrollCenter - PADDING_PX / 2) / trackWidth : 0;
            
            // This check is important to prevent errors if the timeline is empty or has one hike
            if (totalTimeSpan >= 0) {
                // Calculate the current time based on the scroll percentage of the time-based track
                const currentTime = firstHikeTime + (scrollPercent * totalTimeSpan);
                const date = new Date(currentTime);

                const year = date.getUTCFullYear();
                const monthIndex = date.getUTCMonth(); // 0-11
                const monthName = date.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });

                // Update floating text and make the container visible
                floatingYear.innerText = year;
                floatingMonth.innerText = monthName.toUpperCase();
                if (dateDisplay.style.opacity !== '1') {
                    dateDisplay.style.opacity = '1';
                }
                // NEW: Determine current season and update the background color
                let currentSeason = 'winter'; // Default for Dec, Jan, Feb
                if ([2, 3, 4].includes(monthIndex)) currentSeason = 'spring';      // Mar, Apr, May
                else if ([5, 6, 7].includes(monthIndex)) currentSeason = 'summer'; // Jun, Jul, Aug
                else if ([8, 9, 10].includes(monthIndex)) currentSeason = 'autumn';// Sep, Oct, Nov

                const seasonClass = `season-${currentSeason}`;
                // Only update the DOM if the season has actually changed
                if (!timelineNavContainer.classList.contains(seasonClass)) {
                    timelineNavContainer.classList.remove('season-winter', 'season-spring', 'season-summer', 'season-autumn');
                    timelineNavContainer.classList.add(seasonClass);
                }

                // NEW: Parallax scrolling for the landscape.
                // We move the landscape at a fraction of the speed of the main scroll for a depth effect.
                const parallaxFactor = 0.2;
                landscapeContainer.style.transform = `translateX(-${viewport.scrollLeft * parallaxFactor}px)`;
            }
        };

        // --- Drag-to-scroll functionality ---
        let isDown = false;
        let startX;
        let scrollLeft;

        viewport.addEventListener('mousedown', (e) => {
            isDown = true;
            viewport.classList.add('active');
            startX = e.pageX - viewport.offsetLeft;
            scrollLeft = viewport.scrollLeft;
        });
        viewport.addEventListener('mouseleave', () => { isDown = false; viewport.classList.remove('active'); });
        viewport.addEventListener('mouseup', () => { isDown = false; viewport.classList.remove('active'); });
        viewport.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - viewport.offsetLeft;
            const walk = x - startX; // No multiplier for a 1:1 drag feel.
            viewport.scrollLeft = scrollLeft - walk;
        });

        // --- Scroll with mouse wheel ---
        viewport.addEventListener('wheel', (e) => {
            // Prevent the default vertical scroll of the page.
            e.preventDefault();

            // A typical mouse wheel event has a large deltaY. A trackpad swipe has a
            // smaller deltaY (for vertical swipes) and/or deltaX (for horizontal swipes).
            // We add them together to make the timeline respond to both, and apply a
            // multiplier to make trackpad scrolling feel natural and not sluggish.
            viewport.scrollLeft += (e.deltaX + e.deltaY);
        }, { passive: false }); // We must set passive: false to be able to preventDefault()

        // --- NEW: Global Tooltip Hover Logic ---
        track.addEventListener('mouseover', (e) => {
            if (e.target.classList.contains('timeline-dot')) {
                const dot = e.target;
                const hikeId = dot.dataset.hikeId;
                const hike = allHikes.find(h => h.trail_id === hikeId);

                if (hike) {
                    const formattedDate = new Date(hike.date_completed).toLocaleDateString('en-US', dateOptions);
                    globalTooltip.innerHTML = `${hike.trail_name}<br><small>${formattedDate}</small>`;
                    
                    // To calculate the correct position, we need the tooltip's width.
                    // We make it visible but transparent to measure it without a flicker.
                    globalTooltip.style.opacity = '0';
                    globalTooltip.classList.add('visible'); // Temporarily add to measure
                    const tooltipWidth = globalTooltip.offsetWidth;
                    globalTooltip.classList.remove('visible'); // Remove before animation
                    globalTooltip.style.opacity = ''; // Reset opacity
                    
                    const dotRect = dot.getBoundingClientRect();
                    const PADDING = 15; // 15px padding from the window edges

                    // Reset alignment classes
                    globalTooltip.classList.remove('edge-left');

                    const idealCenter = dotRect.left + (dotRect.width / 2);
                    const idealLeft = idealCenter - (tooltipWidth / 2);

                    // Check for edge collisions and apply the correct class and position
                    if (idealLeft < PADDING) {
                        globalTooltip.classList.add('edge-left');
                        globalTooltip.style.left = `${PADDING}px`;
                    } else if (idealCenter + (tooltipWidth / 2) > window.innerWidth - PADDING) {
                        globalTooltip.classList.add('edge-left'); // Use the same alignment style
                        // But calculate the left position to align the *right* edge of the tooltip
                        globalTooltip.style.left = `${window.innerWidth - PADDING - tooltipWidth}px`;
                    } else {
                        // Default centered case
                        globalTooltip.style.left = `${idealCenter}px`;
                    }

                    const tooltipTop = dotRect.bottom + 10; // 10px below the dot
                    globalTooltip.style.top = `${tooltipTop}px`;
                    globalTooltip.classList.add('visible'); // Trigger the animation
                }
            }
        });

        track.addEventListener('mouseout', () => {
            globalTooltip.classList.remove('visible'); // Hide by removing the class
        });

        // --- Update year display on scroll ---
        let ticking = false;
        viewport.addEventListener('scroll', () => {
            // Use requestAnimationFrame to throttle scroll events for performance.
            // This prevents the expensive updateTimelineDisplay function from running
            // on every single pixel of a scroll, making it much smoother.
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    updateTimelineDisplay();
                    ticking = false;
                });
                ticking = true;
            }
        });

        return { updateTimelineDisplay };
    }

    /**
     * Main function to clear and populate the page with a specific hike's details.
     */
    function displayHike(hike, allHikes) {
                document.title = `${hike.trail_name} - The Trailprint Atlas`; // Update the browser tab title
                document.getElementById('hike-title').innerText = hike.trail_name;
                const dateOptions = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' };
                const formattedDate = new Date(hike.date_completed + 'T00:00:00Z').toLocaleDateString('en-US', dateOptions);
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
                const year = new Date(hike.date_completed + 'T00:00:00Z').getFullYear().toString();
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
                        hikeGroup.sort((a, b) => new Date(b.date_completed + 'T00:00:00Z') - new Date(a.date_completed + 'T00:00:00Z'));

                        logbookContainer.innerHTML = hikeGroup.map(log => {
                            const isCurrent = log.trail_id === hike.trail_id;
                            const dateStr = new Date(log.date_completed + 'T00:00:00Z').toLocaleDateString('en-US', dateOptions);

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
                    // Update the main page content
                    displayHike(hikeToDisplay, allHikes);
                    // Update the active dot on the timeline
                    document.querySelector('#timeline-nav-container .timeline-dot.active')?.classList.remove('active');
                    const newActiveDot = document.querySelector(`#timeline-track .timeline-dot[data-hike-id="${event.state.hikeId}"]`);
                    if (newActiveDot) {
                        newActiveDot.classList.add('active');
                        centerTimelineOn(event.state.hikeId);
                    }
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
            // 4. Build and set up the timeline, then display the hike
            buildTimeline(allHikes, hikeId);
            const timelineControls = setupTimelineScrolling(allHikes);
            displayHike(hikeToDisplay, allHikes);
            // Finally, center the timeline on the initial hike without animation
            centerTimelineOn(hikeId, 'auto');
            // Use a timeout to ensure the initial year is displayed after the scroll position is set.
            // This is a robust way to handle the event loop.
            setTimeout(() => timelineControls.updateTimelineDisplay(), 0);
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