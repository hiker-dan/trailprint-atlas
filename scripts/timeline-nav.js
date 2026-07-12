/**
 * The shared timeline navigation strip — the spine of the Atlas.
 *
 * Used by hike.html and trip.html (markup lives in each page, styles in
 * styles/timeline-nav.css). The rules of the spine:
 *   - solo dots select a hike (what "select" means is the page's choice,
 *     passed in as onHikeSelect — the hike page swaps in place, the trip
 *     page navigates)
 *   - trip capsules navigate to that trip's page
 *   - hovering a capsule opens the trip journal card: day dots select
 *     hikes, the title opens the trip page
 *   - the capsule holding the current hike — or whose trip page you're
 *     reading — glows green
 *
 * Load after config.js and atlas-data.js. Extracted from hike-detail.js
 * when trip pages arrived, July 2026.
 */
const AtlasTimeline = (() => {

    let allHikesRef = [];
    let tripsRef = [];
    let onHikeSelectRef = null;
    let activeTripTagRef = null;
    let dragDistance = 0; // set by the drag-to-scroll code; guards capsule clicks

    const tripHref = (tag) => `trip.html?tag=${encodeURIComponent(tag)}`;

    /**
     * Centers the timeline viewport on a specific hike dot (or, for a hike
     * inside a trip, on the middle of its capsule, so switching days within
     * one trip never nudges the timeline).
     */
    function centerOnHike(hikeId, behavior = 'smooth') {
        const viewport = document.getElementById('timeline-viewport');
        const activeDot = document.querySelector(`.timeline-dot[data-hike-id="${hikeId}"]`);
        if (!viewport || !activeDot) return;

        let scrollTarget;
        const tripBar = activeDot.closest('.timeline-trip-bar');
        if (tripBar) {
            scrollTarget = (tripBar.offsetLeft + tripBar.offsetWidth / 2) - (viewport.clientWidth / 2);
        } else {
            // For solo dots, offsetLeft is already relative to the track.
            scrollTarget = activeDot.offsetLeft - (viewport.clientWidth / 2);
        }
        viewport.scrollTo({ left: scrollTarget, behavior: behavior });
    }

    /** Centers the timeline viewport on a trip's capsule. */
    function centerOnTrip(tripTag, behavior = 'smooth') {
        const viewport = document.getElementById('timeline-viewport');
        const bar = document.querySelector(`.timeline-trip-bar[data-trip-tag="${tripTag}"]`);
        if (!viewport || !bar) return;
        const scrollTarget = (bar.offsetLeft + bar.offsetWidth / 2) - (viewport.clientWidth / 2);
        viewport.scrollTo({ left: scrollTarget, behavior: behavior });
    }

    /**
     * Moves the timeline's "you are here" marks: the active dot, plus the
     * green glow on the trip capsule that contains the current hike (the
     * dots inside a capsule are invisible, so the capsule carries the mark).
     */
    function setActiveHike(hikeId) {
        const track = document.getElementById('timeline-track');
        if (!track) return;
        track.querySelector('.timeline-dot.active')?.classList.remove('active');
        track.querySelector(`.timeline-dot[data-hike-id="${hikeId}"]`)?.classList.add('active');
        track.querySelectorAll('.timeline-trip-bar').forEach(bar => {
            bar.classList.toggle('contains-active', Boolean(bar.querySelector(`.timeline-dot[data-hike-id="${hikeId}"]`)));
        });
    }

    /**
     * Builds the timeline track: solo dots plus trip capsules, positioned by
     * time (5px per day), with the trip journal card wiring.
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

        // 2. Track width follows TIME, not hike count — the timeline is an
        // accurate representation of the years.
        const PIXELS_PER_DAY = 5;
        const PADDING_PX = viewport.clientWidth;
        const totalWidth = (totalTimeSpan / (1000 * 60 * 60 * 24)) * PIXELS_PER_DAY + PADDING_PX;
        track.style.width = `${totalWidth}px`;

        let timelineHtml = '';

        // groupByTrip returns a Map; the timeline wants a plain array so each
        // trip gets a numeric index the capsules can carry (data-trip-index).
        tripsRef = [...groupByTrip(sortedHikes).values()];
        const soloHikes = sortedHikes.filter(hike => !hike.trip_tag);

        // --- Render Solo Hikes (as individual dots) ---
        soloHikes.forEach(hike => {
            const hikeTime = new Date(hike.date_completed + 'T00:00:00Z').getTime();
            const positionPercent = totalTimeSpan > 0 ? ((hikeTime - firstHikeTime) / totalTimeSpan) : 0.5;
            const finalDotPosition = (positionPercent * (totalWidth - PADDING_PX)) + (PADDING_PX / 2);
            const isActive = hike.trail_id === currentHikeId ? 'active' : '';
            timelineHtml += `<div class="timeline-dot ${isActive}" style="left: ${finalDotPosition}px;" data-hike-id="${hike.trail_id}"></div>`;
        });

        // --- Render Trips (as capsules containing invisible anchor dots) ---
        tripsRef.forEach((hikesInTrip, tripIndex) => {
            const tripTimes = hikesInTrip.map(h => new Date(h.date_completed + 'T00:00:00Z').getTime());
            const tripStartTime = Math.min(...tripTimes);
            const tripEndTime = Math.max(...tripTimes);

            const startPercent = (tripStartTime - firstHikeTime) / totalTimeSpan;
            const endPercent = (tripEndTime - firstHikeTime) / totalTimeSpan;
            const barLeft = (startPercent * (totalWidth - PADDING_PX)) + (PADDING_PX / 2);
            const barRight = (endPercent * (totalWidth - PADDING_PX)) + (PADDING_PX / 2);
            const barWidth = Math.max(50, barRight - barLeft); // Enforce a wider minimum width for the capsule

            // The dots inside the bar stay invisible — they're positional
            // anchors for scroll-centering and the active-hike highlight.
            let tripDotsHtml = '';
            const hikesByDate = new Map();
            hikesInTrip.forEach(h => {
                if (!hikesByDate.has(h.date_completed)) hikesByDate.set(h.date_completed, []);
                hikesByDate.get(h.date_completed).push(h);
            });

            hikesInTrip.forEach(hike => {
                const hikeTime = new Date(hike.date_completed + 'T00:00:00Z').getTime();
                const dotPositionPercent = (tripEndTime - tripStartTime > 0) ? (hikeTime - tripStartTime) / (tripEndTime - tripStartTime) : 0.5;
                const dotPosition = dotPositionPercent * barWidth;

                const dayGroup = hikesByDate.get(hike.date_completed);
                let offset = 0;
                if (dayGroup.length > 1) {
                    const SPREAD_FACTOR_PX = 18;
                    const hikeIndexInGroup = dayGroup.findIndex(h => h.trail_id === hike.trail_id);
                    const centerIndex = (dayGroup.length - 1) / 2;
                    offset = (hikeIndexInGroup - centerIndex) * SPREAD_FACTOR_PX;
                }
                const isActive = hike.trail_id === currentHikeId ? 'active' : '';
                tripDotsHtml += `<div class="timeline-dot ${isActive}" style="left: ${dotPosition + offset}px;" data-hike-id="${hike.trail_id}" data-date="${hike.date_completed}"></div>`;
            });

            // The capsule glows green when it holds the current hike, or when
            // this timeline is standing on that trip's own page.
            const tag = hikesInTrip[0].trip_tag || '';
            const containsActive = hikesInTrip.some(h => h.trail_id === currentHikeId) ||
                (Boolean(activeTripTagRef) && tag === activeTripTagRef);
            timelineHtml += `
                <div class="timeline-trip-bar${containsActive ? ' contains-active' : ''}" style="left: ${barLeft}px; width: ${barWidth}px;" data-trip-index="${tripIndex}" data-trip-tag="${tag}">
                    <span class="trip-bar-label">Trip</span>
                    ${tripDotsHtml}
                </div>`;
        });

        track.innerHTML = timelineHtml;

        // 4. Solo dots select their hike (the page decides what that means)
        track.querySelectorAll('.timeline-dot').forEach(dot => {
            dot.addEventListener('click', () => {
                const hike = allHikes.find(h => h.trail_id === dot.dataset.hikeId);
                if (hike && onHikeSelectRef) onHikeSelectRef(hike);
            });
        });

        // 5. Capsules navigate to their trip's page (guarded against drags;
        // the capsule of the trip page you're already on just recenters)
        track.addEventListener('click', (e) => {
            if (e.target.classList.contains('timeline-dot')) return; // dots handle themselves
            const bar = e.target.closest('.timeline-trip-bar');
            if (!bar || dragDistance > 5) return;
            const tag = bar.dataset.tripTag;
            if (!tag) return;
            if (tag === activeTripTagRef) {
                centerOnTrip(tag);
            } else {
                window.location.href = tripHref(tag);
            }
        });

        // --- The Trip Journal Card ---
        // Hovering a trip capsule opens a stable drawer beneath the header:
        // the trip's name (a door to its page), its dates, and one dot per
        // hike. The track itself never stretches or shifts.
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
            // The card hangs flush from the header's bottom edge like a drawer.
            tripCard.style.top = `${stickyHeader.getBoundingClientRect().bottom}px`;
        };

        // The caption line inside the card: the hovered day's trail name, or
        // the selected day's when the mouse isn't on a day.
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

            const hikesInTrip = tripsRef[parseInt(bar.dataset.tripIndex, 10)];
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
                <div class="trip-card-title" title="Open the trip page">${tripName}</div>
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

        // Clicks inside the card: the title opens the trip page; a day
        // selects that hike (and the card refreshes its own marks — moot
        // when the page navigates away).
        tripCard.addEventListener('click', (e) => {
            if (e.target.closest('.trip-card-title')) {
                const tag = openTripBar?.dataset.tripTag;
                if (tag && tag !== activeTripTagRef) window.location.href = tripHref(tag);
                return;
            }
            const day = e.target.closest('.trip-card-day');
            if (!day) return;
            const hike = allHikes.find(h => h.trail_id === day.dataset.hikeId);
            if (!hike) return;
            if (onHikeSelectRef) onHikeSelectRef(hike);
            tripCard.querySelector('.trip-card-day.active')?.classList.remove('active');
            day.classList.add('active');
            resetCardTrailName();
        });

        // The card is fixed-position, so it follows its capsule while the
        // timeline scrolls (e.g. the recentering after choosing a day).
        viewport.addEventListener('scroll', positionTripCard);
        // Page scroll moves the sticky header until it docks — just let go.
        window.addEventListener('scroll', scheduleTripCardClose, { passive: true });
    }

    /**
     * Scrolling behaviors: drag, wheel, the floating date + seasonal
     * backgrounds, and the hike-name tooltip on solo dots.
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

            if (totalTimeSpan >= 0) {
                const currentTime = firstHikeTime + (scrollPercent * totalTimeSpan);
                const date = new Date(currentTime);

                const year = date.getUTCFullYear();
                const monthIndex = date.getUTCMonth(); // 0-11
                const monthName = date.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });

                floatingYear.innerText = year;
                floatingMonth.innerText = monthName.toUpperCase();
                if (dateDisplay.style.opacity !== '1') {
                    dateDisplay.style.opacity = '1';
                }
                // Seasonal background (shared definition in config.js)
                const currentSeason = ATLAS_CONFIG.SEASON_BY_MONTH[monthIndex];
                const seasonClass = `season-${currentSeason}`;
                if (!timelineNavContainer.classList.contains(seasonClass)) {
                    timelineNavContainer.classList.remove('season-winter', 'season-spring', 'season-summer', 'season-autumn');
                    timelineNavContainer.classList.add(seasonClass);
                }

                // Parallax: the landscape moves at a fraction of scroll speed.
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
            dragDistance = 0;
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
            dragDistance = Math.abs(walk); // capsule clicks ignore real drags
            viewport.scrollLeft = scrollLeft - walk;
        });

        // --- Scroll with mouse wheel / trackpad ---
        viewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            // Wheel deltaY + trackpad deltaX both scrub the timeline.
            viewport.scrollLeft += (e.deltaX + e.deltaY);
        }, { passive: false });

        // --- Global tooltip on solo dots ---
        const showTimelineTooltip = (anchorEl, hike) => {
            const formattedDate = formatHikeDate(hike.date_completed, { year: 'numeric', month: 'short', day: 'numeric' });
            globalTooltip.innerHTML = `${hike.trail_name}<br><small>${formattedDate}</small>`;

            // Measure invisibly first so positioning never flickers.
            globalTooltip.style.opacity = '0';
            globalTooltip.classList.add('visible');
            const tooltipWidth = globalTooltip.offsetWidth;
            globalTooltip.classList.remove('visible');
            globalTooltip.style.opacity = '';

            const anchorRect = anchorEl.getBoundingClientRect();
            const PADDING = 15; // 15px padding from the window edges

            globalTooltip.classList.remove('edge-left');
            const idealCenter = anchorRect.left + (anchorRect.width / 2);
            const idealLeft = idealCenter - (tooltipWidth / 2);

            if (idealLeft < PADDING) {
                globalTooltip.classList.add('edge-left');
                globalTooltip.style.left = `${PADDING}px`;
            } else if (idealCenter + (tooltipWidth / 2) > window.innerWidth - PADDING) {
                globalTooltip.classList.add('edge-left');
                globalTooltip.style.left = `${window.innerWidth - PADDING - tooltipWidth}px`;
            } else {
                globalTooltip.style.left = `${idealCenter}px`;
            }

            globalTooltip.style.top = `${anchorRect.bottom + 10}px`;
            globalTooltip.classList.add('visible');
        };

        track.addEventListener('mouseover', (e) => {
            if (e.target.classList.contains('timeline-dot')) {
                const hike = allHikes.find(h => h.trail_id === e.target.dataset.hikeId);
                if (hike) showTimelineTooltip(e.target, hike);
            }
        });
        track.addEventListener('mouseout', () => {
            globalTooltip.classList.remove('visible');
        });

        // --- Update the display on scroll (rAF-throttled) ---
        let ticking = false;
        viewport.addEventListener('scroll', () => {
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
     * Boots the timeline on a page.
     * @param {object} config
     * @param {Array}  config.allHikes      every hike record
     * @param {string} [config.activeHikeId]  hike to mark + center (hike page)
     * @param {string} [config.activeTripTag] trip to glow + center (trip page)
     * @param {Function} [config.onHikeSelect] what selecting a hike does
     */
    function init({ allHikes, activeHikeId = null, activeTripTag = null, onHikeSelect = null }) {
        allHikesRef = allHikes;
        onHikeSelectRef = onHikeSelect;
        activeTripTagRef = activeTripTag;

        buildTimeline(allHikes, activeHikeId);
        const controls = setupTimelineScrolling(allHikes);
        if (activeHikeId) {
            centerOnHike(activeHikeId, 'auto');
        } else if (activeTripTag) {
            centerOnTrip(activeTripTag, 'auto');
        }
        if (controls) setTimeout(() => controls.updateTimelineDisplay(), 0);
    }

    return { init, setActiveHike, centerOnHike, centerOnTrip };
})();
