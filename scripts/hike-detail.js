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
    let tileCycleInterval; // Tile-cycling timer, cleared between hikes to prevent leaks
    let allHikes = null; // All hike records: fetched once on load, reused by timeline nav + back/forward

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
            modalImage.src = cloudinaryUrl(item.id, 'w_1200,h_1200,c_limit,q_auto,f_auto');
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
            // Center on the capsule itself, not the day dot inside it: the
            // red "you are here" line sits smack in the middle of the trip,
            // and switching days within one trip never nudges the timeline
            // (the scroll target is identical for every day of the trip).
            scrollTarget = (tripBar.offsetLeft + tripBar.offsetWidth / 2) - (viewport.clientWidth / 2);
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
     * Moves the timeline's "you are here" marks: the active dot, plus the
     * green glow on the trip capsule that contains the current hike (the
     * dots inside a capsule are invisible, so the capsule carries the mark).
     */
    function setActiveTimelineDot(hikeId) {
        const track = document.getElementById('timeline-track');
        if (!track) return;
        track.querySelector('.timeline-dot.active')?.classList.remove('active');
        track.querySelector(`.timeline-dot[data-hike-id="${hikeId}"]`)?.classList.add('active');
        track.querySelectorAll('.timeline-trip-bar').forEach(bar => {
            bar.classList.toggle('contains-active', Boolean(bar.querySelector(`.timeline-dot[data-hike-id="${hikeId}"]`)));
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
        const sortedHikes = [...allHikes].sort(compareHikesChrono);
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
        // groupByTrip returns a Map; the timeline wants a plain array so each
        // trip gets a numeric index the capsules can carry (data-trip-index).
        const trips = [...groupByTrip(sortedHikes).values()];
        const soloHikes = sortedHikes.filter(hike => !hike.trip_tag);

        // --- Render Solo Hikes (as individual dots) ---
        soloHikes.forEach(hike => {
            const hikeTime = new Date(hike.date_completed + 'T00:00:00Z').getTime();
            const positionPercent = totalTimeSpan > 0 ? ((hikeTime - firstHikeTime) / totalTimeSpan) : 0.5;
            const finalDotPosition = (positionPercent * (totalWidth - PADDING_PX)) + (PADDING_PX / 2);
            const isActive = hike.trail_id === currentHikeId ? 'active' : '';
            timelineHtml += `<div class="timeline-dot ${isActive}" style="left: ${finalDotPosition}px;" data-hike-id="${hike.trail_id}"></div>`;
        });

        // --- Render Trips (as bars containing dots) ---
        trips.forEach((hikesInTrip, tripIndex) => {
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

            // Generate the dots that will live *inside* the bar. They stay
            // invisible — the trip journal card is how you reach a trip's
            // hikes — but they remain the positional anchors that
            // centerTimelineOn and the active-hike highlight rely on.
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

            // The capsule: labeled, indexed for the journal card, and glowing
            // green when it holds the hike currently on the page.
            const containsActive = hikesInTrip.some(h => h.trail_id === currentHikeId);
            timelineHtml += `
                <div class="timeline-trip-bar${containsActive ? ' contains-active' : ''}" style="left: ${barLeft}px; width: ${barWidth}px;" data-trip-index="${tripIndex}">
                    <span class="trip-bar-label">Trip</span>
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
                    setActiveTimelineDot(newHikeId);
                    centerTimelineOn(newHikeId);
                }
            });
        });

        // --- The Trip Journal Card ---
        // Hovering a trip capsule opens a stable, fixed-position card beneath
        // it: the trip's name, its dates, and one dot per hike. The track
        // itself never stretches or shifts — the card is the way in.
        const tripCard = document.getElementById('timeline-trip-card');
        let openTripBar = null;      // the capsule whose card is showing
        let cardCloseTimeout = null; // grace period so the mouse can cross the gap

        const stickyHeader = document.getElementById('sticky-header-wrapper');
        const positionTripCard = () => {
            if (!openTripBar) return;
            const barRect = openTripBar.getBoundingClientRect();
            const PADDING = 15; // keep clear of the window edges
            const cardWidth = tripCard.offsetWidth;
            const barCenter = barRect.left + barRect.width / 2;
            let cardLeft = barCenter - cardWidth / 2;
            cardLeft = Math.max(PADDING, Math.min(cardLeft, window.innerWidth - PADDING - cardWidth));
            tripCard.style.left = `${cardLeft}px`;
            // The card hangs flush from the header's bottom edge like a
            // drawer — a consistent, designed spot rather than floating at
            // whatever height the capsule happens to sit.
            tripCard.style.top = `${stickyHeader.getBoundingClientRect().bottom}px`;
        };

        // The caption line inside the card: the hovered day's trail name, or
        // the selected day's when the mouse isn't on a day. Replaces the old
        // floating tooltip so nothing stacks on top of the card.
        const resetCardTrailName = () => {
            const nameEl = tripCard.querySelector('.trip-card-trailname');
            if (!nameEl) return;
            const activeId = tripCard.querySelector('.trip-card-day.active')?.dataset.hikeId;
            const activeHike = activeId && allHikes.find(h => h.trail_id === activeId);
            nameEl.textContent = activeHike ? activeHike.trail_name : '';
        };

        const openTripCard = (bar) => {
            clearTimeout(cardCloseTimeout);
            if (openTripBar === bar) return;

            const hikesInTrip = trips[parseInt(bar.dataset.tripIndex, 10)];
            if (!hikesInTrip) return;
            openTripBar = bar;

            // trip_tag reads "Trip Name - Mon YYYY"; the card shows the name
            // and derives the date range from the hikes themselves.
            const tag = hikesInTrip[0].trip_tag || 'Trip';
            const splitAt = tag.lastIndexOf(' - ');
            const tripName = splitAt > 0 ? tag.slice(0, splitAt) : tag;

            const firstHike = hikesInTrip[0];
            const lastHike = hikesInTrip[hikesInTrip.length - 1];
            const rangeEnd = formatHikeDate(lastHike.date_completed, { month: 'short', day: 'numeric', year: 'numeric' });
            const dateRange = firstHike.date_completed === lastHike.date_completed
                ? rangeEnd
                : `${formatHikeDate(firstHike.date_completed, { month: 'short', day: 'numeric' })} – ${rangeEnd}`;
            const hikeCount = `${hikesInTrip.length} hike${hikesInTrip.length > 1 ? 's' : ''}`;

            const activeHikeId = track.querySelector('.timeline-dot.active')?.dataset.hikeId;
            const daysHtml = hikesInTrip.map(h => `
                <button class="trip-card-day${h.trail_id === activeHikeId ? ' active' : ''}" data-hike-id="${h.trail_id}">
                    <span class="trip-card-dot"></span>
                    <span class="trip-card-date">${formatHikeDate(h.date_completed, { month: 'numeric', day: 'numeric' })}</span>
                </button>`).join('');

            tripCard.innerHTML = `
                <div class="trip-card-title">${tripName}</div>
                <div class="trip-card-subtitle">${dateRange} &bull; ${hikeCount}</div>
                <div class="trip-card-days">${daysHtml}</div>
                <div class="trip-card-trailname"></div>`;
            resetCardTrailName();
            tripCard.classList.add('visible');
            positionTripCard();
        };

        const scheduleTripCardClose = () => {
            clearTimeout(cardCloseTimeout);
            cardCloseTimeout = setTimeout(() => {
                tripCard.classList.remove('visible');
                openTripBar = null;
            }, 250);
        };

        track.addEventListener('mouseover', (e) => {
            const bar = e.target.closest('.timeline-trip-bar');
            if (bar) openTripCard(bar);
        });
        track.addEventListener('mouseout', (e) => {
            const bar = e.target.closest('.timeline-trip-bar');
            if (bar) scheduleTripCardClose();
        });
        // The card itself keeps the card alive; leaving it starts the countdown.
        tripCard.addEventListener('mouseenter', () => clearTimeout(cardCloseTimeout));
        tripCard.addEventListener('mouseleave', scheduleTripCardClose);

        // Hovering a day fills the caption line with that day's trail name.
        tripCard.addEventListener('mouseover', (e) => {
            const day = e.target.closest('.trip-card-day');
            if (!day) return;
            const hike = allHikes.find(h => h.trail_id === day.dataset.hikeId);
            const nameEl = tripCard.querySelector('.trip-card-trailname');
            if (hike && nameEl) nameEl.textContent = hike.trail_name;
        });
        tripCard.addEventListener('mouseout', (e) => {
            if (e.target.closest('.trip-card-day')) resetCardTrailName();
        });

        // Clicking a day in the card navigates, exactly like a timeline dot.
        tripCard.addEventListener('click', (e) => {
            const day = e.target.closest('.trip-card-day');
            if (!day) return;
            const newHikeId = day.dataset.hikeId;
            const hikeToDisplay = allHikes.find(h => h.trail_id === newHikeId);
            if (!hikeToDisplay) return;

            displayHike(hikeToDisplay, allHikes);
            history.pushState({ hikeId: newHikeId }, '', `hike.html?id=${newHikeId}`);
            setActiveTimelineDot(newHikeId);
            tripCard.querySelector('.trip-card-day.active')?.classList.remove('active');
            day.classList.add('active');
            resetCardTrailName();
            centerTimelineOn(newHikeId);
        });

        // The card is fixed-position, so it follows its capsule while the
        // timeline scrolls (e.g. the recentering after choosing a day).
        viewport.addEventListener('scroll', positionTripCard);
        // Page scroll moves the sticky header until it docks — just let go.
        window.addEventListener('scroll', scheduleTripCardClose, { passive: true });
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

        const sortedHikes = [...allHikes].sort(compareHikesChrono);
        const firstHikeTime = new Date(sortedHikes[0].date_completed + 'T00:00:00Z').getTime();
        const lastHikeTime = new Date(sortedHikes[sortedHikes.length - 1].date_completed + 'T00:00:00Z').getTime();
        const totalTimeSpan = lastHikeTime - firstHikeTime;
        const PADDING_PX = viewport.clientWidth;

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
                // Determine current season (shared definition in config.js) and update the background color
                const currentSeason = ATLAS_CONFIG.SEASON_BY_MONTH[monthIndex];

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
        // Shared by the timeline dots and the trip journal card's day dots.
        const showTimelineTooltip = (anchorEl, hike) => {
            const formattedDate = formatHikeDate(hike.date_completed, { year: 'numeric', month: 'short', day: 'numeric' });
            globalTooltip.innerHTML = `${hike.trail_name}<br><small>${formattedDate}</small>`;

            // To calculate the correct position, we need the tooltip's width.
            // We make it visible but transparent to measure it without a flicker.
            globalTooltip.style.opacity = '0';
            globalTooltip.classList.add('visible'); // Temporarily add to measure
            const tooltipWidth = globalTooltip.offsetWidth;
            globalTooltip.classList.remove('visible'); // Remove before animation
            globalTooltip.style.opacity = ''; // Reset opacity

            const anchorRect = anchorEl.getBoundingClientRect();
            const PADDING = 15; // 15px padding from the window edges

            // Reset alignment classes
            globalTooltip.classList.remove('edge-left');

            const idealCenter = anchorRect.left + (anchorRect.width / 2);
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

            const tooltipTop = anchorRect.bottom + 10; // 10px below the anchor
            globalTooltip.style.top = `${tooltipTop}px`;
            globalTooltip.classList.add('visible'); // Trigger the animation
        };

        track.addEventListener('mouseover', (e) => {
            if (e.target.classList.contains('timeline-dot')) {
                const hike = allHikes.find(h => h.trail_id === e.target.dataset.hikeId);
                if (hike) showTimelineTooltip(e.target, hike);
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
     * Translates WMO weather codes into human-readable descriptions and emojis.
     * @param {number} code - The WMO weather code from the Open-Meteo API.
     * @returns {object} An object with 'description' and 'icon' properties.
     */
    function getWeatherInfo(code) {
        const weatherMap = {
            0: { description: 'Clear sky', icon: '☀️' },
            1: { description: 'Mainly clear', icon: '🌤️' },
            2: { description: 'Partly cloudy', icon: '⛅' },
            3: { description: 'Overcast', icon: '☁️' },
            45: { description: 'Fog', icon: '🌫️' },
            48: { description: 'Depositing rime fog', icon: '🌫️' },
            51: { description: 'Light drizzle', icon: '🌦️' },
            53: { description: 'Moderate drizzle', icon: '🌦️' },
            55: { description: 'Dense drizzle', icon: '🌧️' },
            56: { description: 'Light freezing drizzle', icon: '🌨️' },
            57: { description: 'Dense freezing drizzle', icon: '🌨️' },
            61: { description: 'Slight rain', icon: '🌦️' },
            63: { description: 'Moderate rain', icon: '🌧️' },
            65: { description: 'Heavy rain', icon: '🌧️' },
            66: { description: 'Light freezing rain', icon: '🌨️' },
            67: { description: 'Heavy freezing rain', icon: '🌨️' },
            71: { description: 'Slight snow fall', icon: '🌨️' },
            73: { description: 'Moderate snow fall', icon: '🌨️' },
            75: { description: 'Heavy snow fall', icon: '❄️' },
            77: { description: 'Snow grains', icon: '❄️' },
            80: { description: 'Slight rain showers', icon: '🌦️' },
            81: { description: 'Moderate rain showers', icon: '🌧️' },
            82: { description: 'Violent rain showers', icon: '🌧️' },
            85: { description: 'Slight snow showers', icon: '🌨️' },
            86: { description: 'Heavy snow showers', icon: '❄️' },
            95: { description: 'Thunderstorm', icon: '⛈️' },
            96: { description: 'Thunderstorm with slight hail', icon: '⛈️' },
            99: { description: 'Thunderstorm with heavy hail', icon: '⛈️' },
        };
        return weatherMap[code] || { description: 'Weather data unavailable', icon: '🤷' };
    }

    /**
     * Fetches and displays historical weather, sun data, and "On This Day" echoes for the hike.
     * @param {object} hike - The hike data object.
     * @param {Array} allHikes - The array of all hike objects.
     */
    async function fetchAndDisplayTimeSnapshot(hike, allHikes) {
        const almanacSection = document.getElementById('almanac-section');
        // Reset and hide section before fetching
        almanacSection.style.display = 'none';
        document.getElementById('sunrise-time').innerText = '--';
        document.getElementById('sunrise-weather-desc').innerText = 'Loading...';
        document.getElementById('sunset-time').innerText = '--';
        document.getElementById('sunset-weather-desc').innerText = 'Loading...';
        document.getElementById('peak-weather-desc').innerText = 'Loading...';
        document.getElementById('peak-weather-temp').innerText = '--';

        if (hike.latitude && hike.longitude && hike.date_completed) {
            const date = hike.date_completed;
            const lat = hike.latitude;
            const lon = hike.longitude;
            // Fetch daily max temp, sunrise/sunset, and hourly data for weather conditions.
            const apiUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&daily=temperature_2m_max,sunrise,sunset&hourly=weathercode,temperature_2m&temperature_unit=fahrenheit&timezone=auto`;

            try {
                const response = await fetch(apiUrl);
                if (!response.ok) throw new Error(`API request failed: ${response.statusText}`);
                const data = await response.json();

                if (data.daily && data.hourly && data.daily.time.length > 0) {
                    const dailyData = data.daily;
                    const hourlyData = data.hourly;

                    const sunriseISO = dailyData.sunrise[0];
                    const sunsetISO = dailyData.sunset[0];

                    const sunriseDate = new Date(sunriseISO);
                    const sunsetDate = new Date(sunsetISO);

                    // Get the hour index for sunrise and sunset to look up in the hourly arrays.
                    const sunriseHourIndex = sunriseDate.getHours();
                    const sunsetHourIndex = sunsetDate.getHours();

                    // Extract sunrise weather data
                    const sunriseWeatherCode = hourlyData.weathercode[sunriseHourIndex];
                    const sunriseTemp = Math.round(hourlyData.temperature_2m[sunriseHourIndex]);
                    const sunriseWeatherInfo = getWeatherInfo(sunriseWeatherCode);

                    // Extract sunset weather data
                    const sunsetWeatherCode = hourlyData.weathercode[sunsetHourIndex];
                    const sunsetTemp = Math.round(hourlyData.temperature_2m[sunsetHourIndex]);
                    const sunsetWeatherInfo = getWeatherInfo(sunsetWeatherCode);

                    // Extract peak conditions data
                    const peakTemp = Math.round(dailyData.temperature_2m_max[0]);
                    // Use weather at 1 PM (13:00) for midday conditions
                    const peakWeatherCode = hourlyData.weathercode[13];
                    const peakWeatherInfo = getWeatherInfo(peakWeatherCode);


                    // Format and display data
                    const timeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
                    document.getElementById('sunrise-time').innerText = sunriseDate.toLocaleTimeString('en-US', timeFormatOptions);
                    document.getElementById('sunrise-weather-desc').innerHTML = `${sunriseWeatherInfo.icon} ${sunriseTemp}°F &bull; ${sunriseWeatherInfo.description}`;

                    document.getElementById('sunset-time').innerText = sunsetDate.toLocaleTimeString('en-US', timeFormatOptions);
                    document.getElementById('sunset-weather-desc').innerHTML = `${sunsetWeatherInfo.icon} ${sunsetTemp}°F &bull; ${sunsetWeatherInfo.description}`;

                    document.getElementById('peak-weather-desc').innerText = `${peakWeatherInfo.icon} ${peakWeatherInfo.description}`;
                    document.getElementById('peak-weather-temp').innerText = `${peakTemp}°F`;

                    almanacSection.style.display = 'block';
                }
            } catch (error) {
                console.error('Error fetching time snapshot data:', error);
                almanacSection.style.display = 'none';
            }
        }
    }

    /**
     * Generates a context-aware, natural-language title for an expedition.
     * @param {object} hike - The hike data object.
     * @returns {string} A formatted, human-readable title for the expedition.
     */
    function getExpeditionTitle(hike) {
        const { difficulty, hike_type } = hike;
        if (!difficulty || !hike_type) return 'Expedition Details'; // Fallback

        switch (hike_type) {
            case 'Day Hike':
                return `${difficulty} Day Hike`;
            case 'Viewpoint':
                return 'A Scenic Viewpoint';
            case 'Backpacking':
                return `${difficulty} Backpacking Trip`;
            case 'Day Trip':
            case 'Overnight Trip':
                return `${difficulty} ${hike_type} Hike`;
            case 'Car Camping':
                return `${difficulty} Camping Hike`;
            default:
                return `${difficulty} ${hike_type}`; // Fallback for any other types
        }
    }

    // --- NEW: Thematic color mapping for hero headers ---
    const GEOGRAPHY_COLORS = {
        'Desert': '#b88a5b', // Sandy brown
        'Riparian Canyon': '#4a7c59', // Deep green
        'Chaparral': '#8a8174', // Dusty sage
        'Urban Edge': '#495057', // Slate gray
        'Default': '#2c3e50' // Default dark blue-gray
    };

    /**
     * Main function to clear and populate the page with a specific hike's details.
     */
    function displayHike(hike, allHikes) {

                // --- Cleanup from previous render ---
                document.getElementById('expedition-subtitle-container').innerHTML = '';

                // --- NEW: Populate Hero Header ---
                const hero = document.getElementById('hike-hero');
                const heroTitle = hero.querySelector('#hike-title');
                const heroLocation = hero.querySelector('#hike-location');
                const heroDate = hero.querySelector('#hike-date');

                document.title = `${hike.trail_name} - The Trailprint Atlas`;
                heroTitle.innerText = hike.trail_name;
                heroLocation.innerText = `${hike.location} • ${hike.region}`;
                const formattedDate = formatHikeDate(hike.date_completed);
                const datePrefix = hike.hike_type === 'Viewpoint' ? 'Visited on' : 'Hiked on';
                heroDate.innerText = `${datePrefix} ${formattedDate}`;

                // --- NEW: Set hero background color based on geography ---
                const geoType = hike.primary_geography || 'Default';
                const heroColor = GEOGRAPHY_COLORS[geoType] || GEOGRAPHY_COLORS['Default'];
                hero.style.backgroundColor = heroColor;
                // Remove any background image styling from previous renders
                hero.style.backgroundImage = 'none';
                
                // --- Define helper function to create the correct icon ---
                // This logic is mirrored from trail-renderer.js for consistency.
                const getIcon = (hikeType) => {
                    const iconFilename = ATLAS_CONFIG.ICON_MAP[hikeType] || 'day-hike-icon.png';
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
                const year = hikeYear(hike).toString();
                const trailColor = ATLAS_CONFIG.COLOR_MAP[year] || ATLAS_CONFIG.DEFAULT_COLOR;

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

                // Set up the cycling interval, clearing any timer left over from a previously viewed hike
                const cycleDuration = 15000; // 15 seconds
                if (tileCycleInterval) clearInterval(tileCycleInterval);
                tileCycleInterval = setInterval(() => {
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
                    // --- BUGFIX: Cleanup from previous renders ---
                    // Remove any dynamically created expedition details section to prevent duplication.
                    const existingExpeditionSection = document.querySelector('.expedition-details-section');
                    if (existingExpeditionSection) {
                        existingExpeditionSection.remove();
                    }

                    // Reset the layout to its default state in case the previous hike had no media.
                    const galleryContainer = document.getElementById('photo-gallery');
                    const topVisualsGrid = galleryContainer.parentElement;
                    galleryContainer.style.display = 'flex'; // Default is flex, making it visible.
                    topVisualsGrid.style.gridTemplateColumns = '1fr 1fr'; // Default is two columns.

                    // 1. Populate "Trail Vitals" with new card design
                    const vitalsContainer = document.getElementById('trail-vitals-container');
                    vitalsContainer.innerHTML = ''; // Clear previous

                    const displayMiles = hike.miles === 0 ? '&lt;0.1' : hike.miles.toLocaleString();
                    const displayElevation = hike.elevation_gain === 0 ? '&lt;0.1' : hike.elevation_gain.toLocaleString();

                    // Miles Card
                    vitalsContainer.innerHTML += `
                        <div class="vital-card">
                            <div class="vital-icon-wrapper">
                                <img src="assets/icons/numbers-miles-icon.png" alt="Miles">
                            </div>
                            <div class="vital-text">
                                <span class="value">${displayMiles}</span>
                                <span class="label">Miles</span>
                            </div>
                        </div>`;

                    // Elevation Card
                    vitalsContainer.innerHTML += `
                        <div class="vital-card">
                            <div class="vital-icon-wrapper">
                                <img src="assets/icons/numbers-elevation-icon.png" alt="Elevation">
                            </div>
                            <div class="vital-text">
                                <span class="value">${displayElevation}</span>
                                <span class="label">Elevation (ft)</span>
                            </div>
                        </div>`;

                    if (hike.summit_trail && hike.summit_elevation) {
                        // Summit Card
                        vitalsContainer.innerHTML += `
                            <div class="vital-card">
                                <div class="vital-icon-wrapper">
                                    <img src="assets/icons/numbers-summit-icon.png" alt="Summit">
                                </div>
                                <div class="vital-text">
                                    <span class="value">${hike.summit_elevation.toLocaleString()}</span>
                                    <span class="label">Summit (ft)</span>
                                </div>
                            </div>`;
                    }

                    // 2. Populate "Trail Notes" Section
                    document.getElementById('description-content-container').innerHTML = '';
                    const floraAnnotation = document.getElementById('flora-annotation');
                    const faunaAnnotation = document.getElementById('fauna-annotation');
                    floraAnnotation.style.display = 'none';
                    faunaAnnotation.style.display = 'none';
                    floraAnnotation.innerHTML = '';
                    faunaAnnotation.innerHTML = '';

                    const descriptionContainer = document.getElementById('description-content-container');
                    descriptionContainer.innerHTML = `<p>${formatHikeText(hike.description)}</p>`;

                    if (hike.flora) {
                        floraAnnotation.innerHTML = `
                            <div class="annotation-header">
                                <img src="assets/icons/flora-icon.png" alt="Flora" class="annotation-icon">
                                <span class="annotation-title">Flora Spotlight</span>
                            </div>
                            <div class="annotation-body">${formatHikeText(hike.flora)}</div>`;
                        floraAnnotation.style.display = 'block';
                    }
                    if (hike.fauna) {
                        faunaAnnotation.innerHTML = `
                            <div class="annotation-header">
                                <img src="assets/icons/fauna-icon.png" alt="Fauna" class="annotation-icon">
                                <span class="annotation-title">Fauna Spotlight</span>
                            </div>
                            <div class="annotation-body">${formatHikeText(hike.fauna)}</div>`;
                        faunaAnnotation.style.display = 'block';
                    }

                    // 3. Populate External Links
                    document.getElementById('external-links-container').innerHTML = '';
                    const linksContainer = document.getElementById('external-links-container');
                    if (hike.all_trails_url) {
                        linksContainer.innerHTML += `<a href="${hike.all_trails_url}" class="link-btn" target="_blank" rel="noopener noreferrer">View on AllTrails</a>`;
                    }
                    if (hike.official_trail_url) {
                        linksContainer.innerHTML += `<a href="${hike.official_trail_url}" class="link-btn" target="_blank" rel="noopener noreferrer">Official Trail Site</a>`;
                    }

                    // 4. Populate the Photo Gallery with the Polaroid Card
                    document.getElementById('photo-gallery').innerHTML = '';
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
                        const expeditionTitle = getExpeditionTitle(hike);
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
                                    <div class="media-context-title">${expeditionTitle}</div>
                                    <div class="media-context-details">${crewHtml}</div>
                                </div>
                            </div>
                        `;

                        const imageContainer = document.querySelector('.polaroid-image-container');
                        const mainPolaroidImage = document.getElementById('polaroid-main-image');
                        const youtubePlayerContainer = document.getElementById('youtube-player-container');

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
                                mainPolaroidImage.src = cloudinaryUrl(item.id, 'w_800,h_600,c_limit,q_auto,f_auto');
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
                        // If there's no media, hide the gallery, make the map full-width,
                        // and display the expedition details as a subtitle under the main hike title.
                        const topVisualsGrid = galleryContainer.parentElement;
                        galleryContainer.style.display = 'none';
                        topVisualsGrid.style.gridTemplateColumns = '1fr';

                        // Tell Leaflet to re-check its container size after a brief delay.
                        setTimeout(() => detailMap.invalidateSize(true), 10);

                        // Generate the subtitle content
                        const expeditionTitle = getExpeditionTitle(hike);
                        let crewDetailsText = '';
                        if (hike.hike_size === 'Solo' && (!hike.hiked_with || hike.hiked_with.length === 0)) {
                            crewDetailsText = 'A Solo Journey';
                        } else if (hike.hiked_with && hike.hiked_with.length > 0) {
                            crewDetailsText = `With ${hike.hiked_with.join(', ')}`;
                        }

                        // Combine title and details, using a separator if both exist.
                        const subtitleText = [expeditionTitle, crewDetailsText].filter(Boolean).join(' &bull; ');

                        // Populate the subtitle container
                        document.getElementById('expedition-subtitle-container').innerHTML = subtitleText;
                    }

                    // Add journal entry if it exists
                    const existingJournal = document.querySelector('.journal-entry');
                    if (existingJournal) existingJournal.remove();
                    if (hike.notes) {
                        descriptionContainer.innerHTML += `
                            <div class="journal-entry">
                                <p>${formatHikeText(hike.notes)}</p>
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
                        hikeGroup.sort(compareHikesChronoDesc);

                        logbookContainer.innerHTML = hikeGroup.map(log => {
                            const isCurrent = log.trail_id === hike.trail_id;
                            const dateStr = formatHikeDate(log.date_completed);

                            let metaHtml = `<p class="meta">Hiked as a ${log.hike_size}`;
                            if (log.hiked_with && log.hiked_with.length > 0) {
                                metaHtml += ` with ${log.hiked_with.join(', ')}`;
                            }
                            metaHtml += `</p>`;
 
                            let notesHtml = '';
                            if (log.notes) {
                                notesHtml = `<div class="notes">${formatHikeText(log.notes)}</div>`;
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

                // --- NEW: Fetch and display the "Trail in Time" data ---
                fetchAndDisplayTimeSnapshot(hike, allHikes);
    }

    // Listen for the browser's back/forward buttons
    window.addEventListener('popstate', (event) => {
        // Reuse the hikes we already loaded on page init — no need to fetch again.
        if (event.state && event.state.hikeId && allHikes) {
            const hikeToDisplay = allHikes.find(h => h.trail_id === event.state.hikeId);
            if (hikeToDisplay) {
                // Update the main page content
                displayHike(hikeToDisplay, allHikes);
                // Update the active dot + trip capsule glow on the timeline
                setActiveTimelineDot(event.state.hikeId);
                centerTimelineOn(event.state.hikeId);
            }
        }
    });

    /**
     * The main execution block that runs on page load.
     */
    try {
        // 1. Fetch all hike data (cached by the shared data layer), then keep
        //    it in closure scope so timeline nav and back/forward can reuse it.
        allHikes = await fetchHikes();

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