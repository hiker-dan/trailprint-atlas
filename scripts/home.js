/**
 * Homepage script for The Trailprint Atlas.
 * Owns the showcase map + intro animation, headline stats, the state map,
 * the seasonal chart, the "Echoes of the Trail" sections, and the nav
 * loading-bar intro sequence. Extracted verbatim from index.html (Phase 1.4).
 * Requires Leaflet, config.js, atlas-data.js, trail-renderer.js.
 *
 * (The tiny sessionStorage fast-forward check stays inline in index.html —
 * it must run before first paint to prevent intro flicker.)
 */

// ===== Intro skip coordination =====
// The first-visit intro plays as two parallel timed sequences: the showcase
// map/stats choreography and the nav loading-bar. Both register their pending
// timers and a "jump to the end" finisher here, so a single skip() cancels
// everything still pending and lands on the finished homepage at once.
const AtlasIntro = {
    timeouts: [],
    finishers: [],
    skipped: false,
    // Use for every intro timer so skip() can cancel whatever hasn't fired.
    schedule(fn, delay) {
        const id = setTimeout(fn, delay);
        this.timeouts.push(id);
        return id;
    },
    // Register a "snap to final state" callback for one sequence.
    onSkip(fn) { this.finishers.push(fn); },
    skip() {
        if (this.skipped) return; // idempotent — natural completion also flips this
        this.skipped = true;
        this.timeouts.forEach(clearTimeout);
        // Land on exactly the repeat-visit state: the fast-forward class alone
        // expresses the finished layout instantly (no transitions). NB: do not
        // also add 'intro-finished' — its .map-placeholder rule (height: 60vh)
        // is only meant to be paired with 'layout-settled', which hides the
        // placeholder; without it you get a 60vh white gap above the map.
        document.documentElement.classList.add('intro-fast-forward');
        sessionStorage.setItem('introShown', 'true');
        this.finishers.forEach(fn => {
            try { fn(); } catch (e) { console.error('intro skip finisher failed:', e); }
        });
        document.getElementById('skip-intro-btn')?.remove();
    }
};

// ===== Showcase map, intro animation, stats, and page sections =====

// Arm the map's "Explore the Atlas" hover overlay only once the mouse truly
// moves. Browsers can apply a phantom :hover during refresh/renavigation
// (cursor resting where the map lands), which flashed the overlay on load.
window.addEventListener('mousemove', () => {
    document.documentElement.classList.add('map-hover-ready');
}, { once: true });

// --- Simplified Map for Homepage ---

// 1. Initialize a non-interactive map
const homeMap = L.map('home-map', {
    zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
    touchZoom: false, boxZoom: false, keyboard: false, tap: false
});

// 2. Add the same beautiful base layer
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
 attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
}).addTo(homeMap);



// 4. Fetch hike data (one shared, cached request) and render only the GPX trails
fetchHikes()
    .then(data => {
        const trailGroups = groupByTrail(data);

        const allLayersGroup = L.featureGroup().addTo(homeMap);

        Object.values(trailGroups).forEach(group => {
            const layer = renderTrailGroup(group, { isInteractive: false });
            if (layer) {
                allLayersGroup.addLayer(layer);
            }
        });

        // --- Refactored Stats Calculation --- 
        const atlasStats = getAtlasStats(data);

        // --- Populate Intro Stats Overlay ---
        const overlay = document.getElementById('intro-stats-overlay');
        overlay.innerHTML = `
            <div class="intro-stat-item">
                <span class="number" id="intro-stats-hikes">0</span>
                <span class="label">Total Hikes</span>
            </div>
            <div class="intro-stat-item">
                <span class="number" id="intro-stats-trails">0</span>
                <span class="label">Unique Trails</span>
            </div>
            <div class="intro-stat-item">
                <span class="number" id="intro-stats-miles">0</span>
                <span class="label">Miles Hiked</span>
            </div>
            <div class="intro-stat-item">
                <span class="number" id="intro-stats-elevation">0</span>
                <span class="label">Feet Climbed</span>
            </div>
        `;

        const layersToAnimate = allLayersGroup.getLayers();

        if (layersToAnimate.length === 0) {
            homeMap.setView([39.82, -98.58], 4); // Fallback
        } else {
            const bounds = allLayersGroup.getBounds();
            homeMap.fitBounds(bounds);

            // Snap the map dots + stats to their final look (repeat-visit load,
            // or the user skipped before the map finished loading).
            const settleMapInstantly = () => {
                layersToAnimate.forEach(layer => {
                    layer.eachLayer(feature => {
                        const finalOpacity = feature.options.className.includes('breathing-halo') ? 0.5 : 0.9;
                        feature.setStyle({ fillOpacity: finalOpacity });
                    });
                });
                document.getElementById('key-stats-section').classList.add('stats-visible');
                const overlay = document.getElementById('intro-stats-overlay');
                overlay.classList.remove('visible');
                overlay.style.display = 'none';
                homeMap.invalidateSize();
                homeMap.fitBounds(bounds, { animate: false });
            };

            if (document.documentElement.classList.contains('intro-fast-forward') || AtlasIntro.skipped) {
                settleMapInstantly();
            } else {
                // --- RUN THE FULL INTRO ANIMATION ---
                // If the user hits skip mid-animation, jump straight to the end.
                AtlasIntro.onSkip(settleMapInstantly);

                const introDuration = 9000;
                const delayBetweenDots = introDuration / layersToAnimate.length;

                layersToAnimate.forEach((layer, index) => {
                    AtlasIntro.schedule(() => {
                        layer.eachLayer(feature => {
                            const finalOpacity = feature.options.className.includes('breathing-halo') ? 0.5 : 0.9;
                            feature.setStyle({ fillOpacity: finalOpacity });
                        });
                    }, index * delayBetweenDots);
                });

                AtlasIntro.schedule(() => {
                    document.documentElement.classList.add('title-visible');
                }, 5000);

                AtlasIntro.schedule(() => {
                    document.getElementById('intro-stats-overlay').classList.add('visible');
                    animateCountUp('intro-stats-hikes', atlasStats.totalHikes);
                    animateCountUp('intro-stats-trails', atlasStats.totalUniqueTrails);
                    animateCountUp('intro-stats-miles', Math.round(atlasStats.totalMiles));
                    animateCountUp('intro-stats-elevation', atlasStats.totalElevation);
                }, 6000);

                AtlasIntro.schedule(() => {
                    AtlasIntro.skipped = true; // natural finish: later skip() is a no-op
                    document.getElementById('skip-intro-btn')?.remove();
                    document.documentElement.classList.add('intro-finished');
                    sessionStorage.setItem('introShown', 'true');
                    document.getElementById('intro-stats-overlay').classList.add('hiding');

                    // Trigger the new key stats section to animate in
                    // A short delay ensures the main content has started its transition
                    setTimeout(() => {
                        document.getElementById('key-stats-section').classList.add('stats-visible');
                    }, 400); // Stagger after the main transition starts

                    const animationDuration = 3000;
                    const startTime = Date.now();

                    function resizeMap() {
                        homeMap.invalidateSize();
                        if (Date.now() - startTime < animationDuration) {
                            requestAnimationFrame(resizeMap);
                        }
                    }
                    requestAnimationFrame(resizeMap);

                    // Start the map pan/zoom slightly before the resize finishes to blend the animations
                    setTimeout(() => {
                        homeMap.fitBounds(bounds, { 
                            animate: true,
                            duration: 1.5, // This animation will last 1.5s
                            easeLinearity: 0.25
                        });
                    }, 1500); // Start 1.5s into the 3s transition

                    // After the 3-second CSS transition, settle the layout by changing position
                    setTimeout(() => {
                        document.documentElement.classList.add('layout-settled');
                        // The map needs to be re-centered in its new container
                        // Add a small delay to ensure the container has fully settled in its new position
                        setTimeout(() => {
                            homeMap.invalidateSize(); // Invalidate size to ensure it renders correctly in new position
                            homeMap.fitBounds(bounds, { animate: false }); // Re-fit bounds without animation
                        }, 50); // Small delay (e.g., 50ms)
                    }, 3600);
                }, 10000);
            }
        }

        // --- Populate Main Dashboard and other sections ---
        (function populatePageContent() {
            // Key Atlas Stats
            document.getElementById('stats-hikes').innerText = atlasStats.totalHikes.toLocaleString();
            document.getElementById('stats-trails').innerText = atlasStats.totalUniqueTrails.toLocaleString();
            document.getElementById('stats-miles').innerText = Math.round(atlasStats.totalMiles).toLocaleString();
            document.getElementById('stats-elevation').innerText = atlasStats.totalElevation.toLocaleString();

            // (Record-stat calculations that once lived here moved to achievements.html.)



            // Time Range
            if (data.length > 0) {
                const startYear = data.reduce((min, hike) => Math.min(min, hikeYear(hike)), new Date().getFullYear());
                document.getElementById('start-year').innerText = startYear;
            }

            // First/Most Recent Hikes
            if (data.length > 0) {
                const sortedHikes = [...data].sort((a, b) => new Date(a.date_completed) - new Date(b.date_completed));
                const firstHike = sortedHikes[0];
                const mostRecentHike = sortedHikes[sortedHikes.length - 1];
                document.getElementById('first-hike-date').innerText = formatHikeDate(firstHike.date_completed);
                document.getElementById('first-hike-name').innerText = `${firstHike.trail_name} - ${firstHike.location}`;
                document.getElementById('most-recent-hike-date').innerText = formatHikeDate(mostRecentHike.date_completed);
                document.getElementById('most-recent-hike-name').innerText = `${mostRecentHike.trail_name} - ${mostRecentHike.location}`;
            } else {
                document.getElementById('first-hike-date').innerText = '--';
                document.getElementById('most-recent-hike-date').innerText = '--';
            }

            // Featured Adventure
            const trips = groupByTrip(data);
            const hikesWithTripTag = data.filter(hike => hike.trip_tag);
            if (hikesWithTripTag.length > 0) {
                const latestTripHike = hikesWithTripTag.sort((a, b) => new Date(b.date_completed) - new Date(a.date_completed))[0];
                const latestTripTag = latestTripHike.trip_tag;
                const adventureHikes = trips.get(latestTripTag);
                document.getElementById('featured-trip-title').innerText = latestTripTag;
                const hikesListContainer = document.getElementById('featured-trip-hikes-list');
                hikesListContainer.innerHTML = '';
                adventureHikes
                    .sort((a, b) => new Date(a.date_completed) - new Date(b.date_completed))
                    .forEach(hike => {
                        hikesListContainer.innerHTML += `
                            <div class="featured-trip-hike-item">
                                <h4>${hike.trail_name}</h4>
                                <div class="hike-meta">${hike.miles} miles | ${hike.elevation_gain.toLocaleString()} ft gain</div>
                                <p class="hike-description">${formatHikeText(hike.description)}</p>
                            </div>
                        `;
                    });
                const tripMiles = adventureHikes.reduce((sum, h) => sum + (h.miles || 0), 0);
                const tripElevation = adventureHikes.reduce((sum, h) => sum + (h.elevation_gain || 0), 0);
                const tripDays = new Set(adventureHikes.map(h => h.date_completed)).size;
                document.getElementById('featured-trip-days-stat').innerHTML = `<span class="number">${tripDays}</span><span class="label">Trip Day${tripDays !== 1 ? 's' : ''}</span>`;
                document.getElementById('featured-trip-miles-stat').innerHTML = `<span class="number">${Math.round(tripMiles)}</span><span class="label">Total Miles</span>`;
                document.getElementById('featured-trip-elevation-stat').innerHTML = `<span class="number">${tripElevation.toLocaleString()}</span><span class="label">Total Gain (ft)</span>`;
                const featuredImageIds = adventureHikes.map(h => h.images && h.images.length > 0 ? h.images[0] : null).filter(Boolean);
                startSlideshow('#featured-adventure .featured-adventure-image-container', featuredImageIds);
                document.getElementById('featured-adventure').style.display = 'flex';
            }

            // Go-To Trail
            const trailCounts = {};
            data.forEach(hike => { if (hike.trail_name) { trailCounts[hike.trail_name] = (trailCounts[hike.trail_name] || 0) + 1; } });
            let mostHikedTrailName = '';
            let maxHikes = 1;
            for (const trailName in trailCounts) { if (trailCounts[trailName] > maxHikes) { maxHikes = trailCounts[trailName]; mostHikedTrailName = trailName; } }
            if (mostHikedTrailName) {
                const mostHikedHikes = data.filter(h => h.trail_name === mostHikedTrailName);
                const representativeHike = mostHikedHikes.sort((a, b) => new Date(b.date_completed) - new Date(a.date_completed))[0];
                const totalMiles = mostHikedHikes.reduce((sum, h) => sum + (h.miles || 0), 0);
                const totalElevation = mostHikedHikes.reduce((sum, h) => sum + (h.elevation_gain || 0), 0);
                document.getElementById('goto-trail-title').innerText = representativeHike.trail_name;
                document.getElementById('goto-trail-description').innerHTML = formatHikeText(representativeHike.description);
                const datesHtml = mostHikedHikes.sort((a, b) => new Date(b.date_completed) - new Date(a.date_completed)).map(h => `<li>${formatHikeDate(h.date_completed)}</li>`).join('');
                document.getElementById('goto-trail-dates-list').innerHTML = `<h4>Dates Hiked:</h4><ul>${datesHtml}</ul>`;
                document.getElementById('goto-trail-times-hiked-stat').innerHTML = `<span class="number">${maxHikes}</span><span class="label">Times Hiked</span>`;
                document.getElementById('goto-trail-miles-stat').innerHTML = `<span class="number">${Math.round(totalMiles)}</span><span class="label">Total Miles</span>`;
                document.getElementById('goto-trail-elevation-stat').innerHTML = `<span class="number">${totalElevation.toLocaleString()}</span><span class="label">Total Gain (ft)</span>`;
                const gotoImageIds = mostHikedHikes.map(h => h.images && h.images.length > 0 ? h.images[0] : null).filter(Boolean);
                startSlideshow('#goto-trail-section .featured-adventure-image-container', gotoImageIds);
                document.getElementById('goto-trail-section').style.display = 'flex';
            }

            // Trail Log
            (function createTrailLog() {
                const trailLogContainer = document.getElementById('trail-log-section');
                if (!trailLogContainer) return;
                const recentHikes = [...data].sort((a, b) => new Date(b.date_completed) - new Date(a.date_completed)).slice(0, 3);
                if (recentHikes.length === 0) { trailLogContainer.innerHTML = '<p>No recent hikes to display.</p>'; return; }
                const cardsHtml = recentHikes.map(hike => `
                    <div class="trail-log-card">
                        <div>
                            <h4>${hike.trail_name}</h4>
                            <p class="location-date">${formatHikeDate(hike.date_completed)} &bull; ${hike.location}</p>
                        </div>
                        <div class="trail-log-stats">
                            <div class="stat"><span class="stat-icon">📏</span><span class="stat-value">${hike.miles} mi</span></div>
                            <div class="stat"><span class="stat-icon">🧗</span><span class="stat-value">${hike.elevation_gain.toLocaleString()} ft</span></div>
                        </div>
                    </div>`).join('');
                trailLogContainer.innerHTML = cardsHtml;
            })();

            // Interactive State Map
            (function setupInteractiveMap() {
                const container = document.getElementById('interactive-map-container');
                const tooltip = document.getElementById('map-tooltip');
                if (!container || !tooltip) return;
                fetch('assets/blank-us-map.svg').then(response => response.text()).then(svgData => {
                    const parser = new DOMParser();
                    const svgDoc = parser.parseFromString(svgData, "image/svg+xml");
                    const svg = svgDoc.documentElement;
                    svg.setAttribute('viewBox', '0 0 959 593');
                    svg.removeAttribute('width');
                    svg.removeAttribute('height');
                    svg.querySelector('defs')?.remove();
                    svg.querySelector('.separator1')?.remove();
                    svg.querySelector('.borders')?.remove();
                    const mainTitle = svg.querySelector('title');
                    if (mainTitle && mainTitle.parentElement === svg) { mainTitle.remove(); }
                    svg.querySelectorAll('path, circle').forEach(el => {
                        el.classList.add('state');
                        const titleEl = el.querySelector('title');
                        if (titleEl) { el.setAttribute('aria-label', titleEl.textContent); titleEl.remove(); }
                    });
                    container.innerHTML = '';
                    container.appendChild(svg);
                    svg.id = 'us-map-svg';
                    const stateStats = data.reduce((stats, hike) => {
                        const region = hike.region || '';
                        const stateAbbr = region.split(', ').pop();
                        if (stateAbbr) {
                            if (!stats[stateAbbr]) { stats[stateAbbr] = { totalHikes: 0, totalMiles: 0, uniqueTrails: new Set() }; }
                            stats[stateAbbr].totalHikes++;
                            stats[stateAbbr].totalMiles += hike.miles || 0;
                            stats[stateAbbr].uniqueTrails.add(hike.trail_name);
                        }
                        return stats;
                    }, {});
                    const stateNames = { "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia" };
                    Object.keys(stateStats).forEach(stateAbbr => {
                        const stateEl = svg.querySelector(`.${stateAbbr.toLowerCase()}`);
                        if (stateEl) {
                            stateEl.classList.add('active');
                            stateEl.dataset.hikes = stateStats[stateAbbr].totalHikes;
                            stateEl.dataset.miles = Math.round(stateStats[stateAbbr].totalMiles);
                            stateEl.dataset.trails = stateStats[stateAbbr].uniqueTrails.size;
                            stateEl.dataset.stateName = stateNames[stateAbbr] || stateAbbr;
                        }
                    });
                    svg.addEventListener('mouseover', e => {
                        if (e.target.classList.contains('active')) {
                            const { stateName, hikes, miles, trails } = e.target.dataset;
                            tooltip.innerHTML = `
                                <h4>${stateName}</h4>
                                <div class="tooltip-stats">
                                    <div class="tooltip-stat"><span class="tooltip-value">${hikes}</span><span class="tooltip-label">Hikes</span></div>
                                    <div class="tooltip-stat"><span class="tooltip-value">${trails}</span><span class="tooltip-label">Trails</span></div>
                                    <div class="tooltip-stat"><span class="tooltip-value">${miles}</span><span class="tooltip-label">Miles</span></div>
                                </div>
                            `;
                            tooltip.style.display = 'block';
                        }
                    });
                    svg.addEventListener('mousemove', e => {
                        if (tooltip.style.display === 'block') {
                            const tooltipRect = tooltip.getBoundingClientRect();
                            const containerRect = container.getBoundingClientRect();
                            let left = e.pageX + 15;
                            let top = e.pageY;
                            if (left + tooltipRect.width > containerRect.right) { left = e.pageX - tooltipRect.width - 15; }
                            if (top + tooltipRect.height > window.innerHeight + window.scrollY) { top = e.pageY - tooltipRect.height; }
                            tooltip.style.left = `${left}px`;
                            tooltip.style.top = `${top}px`;
                        }
                    });
                    svg.addEventListener('mouseout', () => { tooltip.style.display = 'none'; });
                });
            })();

            // Seasonal Chart
            (function createSeasonalChart() {
                const chartContainer = document.getElementById('seasonal-chart');
                if (!chartContainer) return;

                const monthCounts = Array(12).fill(0);
                data.forEach(hike => {
                    monthCounts[hikeMonth(hike)]++;
                });

                const maxCount = Math.max(...monthCounts, 1);
                const nonZeroCounts = monthCounts.filter(c => c > 0);
                const minCount = nonZeroCounts.length > 0 ? Math.min(...nonZeroCounts) : 0;

                const getHeatLevel = (count) => {
                    if (count === 0) return 0;
                    if (minCount === maxCount) return 3; // Use a mid-range color if all data is the same

                    // Normalize the count within the actual data range [minCount, maxCount]
                    const normalized = (count - minCount) / (maxCount - minCount);

                    // Scale into 5 buckets (levels 1-5)
                    const heatRange = 5;
                    return 1 + Math.floor(normalized * (heatRange - 0.001));
                };

                const monthAbbreviations = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                chartContainer.innerHTML = ''; // Clear existing content

                monthAbbreviations.forEach((abbr, index) => {
                    const count = monthCounts[index];
                    const heatLevel = getHeatLevel(count);
                    const barHeight = count === 0 ? 5 : (count / maxCount) * 95 + 5;

                    const barWrapper = document.createElement('div');
                    barWrapper.className = 'chart-bar-wrapper';

                    barWrapper.innerHTML = `
                        <div class="chart-bar heat-level-${heatLevel}" style="height: ${barHeight}%;">
                            <span class="bar-count">${count}</span>
                        </div>
                        <div class="month-label">${abbr}</div>
                    `;
                    chartContainer.appendChild(barWrapper);
                });

                // --- Intersection Observer for Animation ---
                const observer = new IntersectionObserver((entries, observer) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const bars = chartContainer.querySelectorAll('.chart-bar-wrapper');
                            bars.forEach((bar, index) => {
                                setTimeout(() => {
                                    bar.classList.add('visible');
                                }, index * 60);
                            });
                            observer.unobserve(entry.target);
                        }
                    });
                }, { threshold: 0.1 });

                observer.observe(chartContainer);
            })();
        })();
    }) .catch(error => {
        console.error("Error loading homepage map data:", error);
        homeMap.setView([39.82, -98.58], 4);
    });

function animateCountUp(elementId, finalValue, duration = 2000) {
    const element = document.getElementById(elementId);
    if (!element) return;

    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const currentValue = Math.floor(progress * finalValue);
        element.innerText = currentValue.toLocaleString();

        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// ===== Photo slideshows (Featured Adventure / Well-Worn Path) =====

function startSlideshow(containerSelector, imageIds, interval = 10000) {
    const container = document.querySelector(containerSelector);
    const fallbackImage = cloudinaryUrl('tta_67-china-camp-campground-via-pine-ridge-trail-01', 'w_800,h_600,c_fill,q_auto,f_auto');

    if (!container || imageIds.length === 0) {
        if (container) {
            container.innerHTML = `<img src="${fallbackImage}" alt="Trail photo" class="slideshow-image active">`;
        }
        return;
    }

    container.innerHTML = '';
    const imageElements = [];

    imageIds.forEach((id, index) => {
        const img = document.createElement('img');
        img.src = cloudinaryUrl(id, 'w_800,h_600,c_fill,q_auto,f_auto');
        img.alt = "A photo from the trail";
        img.className = 'slideshow-image';
        if (index === 0) {
            img.classList.add('active');
        }
        container.appendChild(img);
        imageElements.push(img);
    });

    if (imageElements.length <= 1) return;

    let currentIndex = 0;
    setInterval(() => {
        imageElements[currentIndex].classList.remove('active');
        currentIndex = (currentIndex + 1) % imageElements.length;
        imageElements[currentIndex].classList.add('active');
    }, interval);
}

// ===== Nav loading-bar intro sequence =====

(function() {
    const loadingBar = document.getElementById('loading-bar');
    const mainNav = document.getElementById('main-nav');
    const loadingText = document.getElementById('loading-text');

    // If we're fast-forwarding, just show the nav immediately.
    if (document.documentElement.classList.contains('intro-fast-forward')) {
        loadingBar.style.display = 'none';
        mainNav.style.display = 'flex';
        mainNav.style.opacity = '1';
        return;
    }

    // Full intro: start with the loading phrases visible and the nav links hidden.
    // (The shared nav component renders them the other way around by default.)
    loadingBar.style.display = 'flex';
    mainNav.style.display = 'none';

    // On skip, drop the loading phrases and reveal the real nav at once.
    AtlasIntro.onSkip(() => {
        loadingBar.style.display = 'none';
        mainNav.style.display = 'flex';
        mainNav.style.opacity = '1';
    });

    // The skip affordance: a subtle button, plus Escape, to leave the intro.
    const skipBtn = document.createElement('button');
    skipBtn.id = 'skip-intro-btn';
    skipBtn.type = 'button';
    skipBtn.textContent = 'Skip intro';
    skipBtn.addEventListener('click', () => AtlasIntro.skip());
    document.body.appendChild(skipBtn);

    const onEsc = (e) => { if (e.key === 'Escape') AtlasIntro.skip(); };
    document.addEventListener('keydown', onEsc);
    AtlasIntro.onSkip(() => document.removeEventListener('keydown', onEsc));

    const allPhrases = [
        "Calibrating Compass...", "Drawing Maps...", "Lacing Boots...", "Checking Weather...",
        "Packing Snacks...", "Finding North...", "Rendering Trails...", "Filtering Water...",
        "Setting up Camp...", "Watching the Sunset...", "Consulting Topography...", "Identifying Constellations...",
        "Avoiding Poison Oak...", "Listening for Birdsong...", "Following the Switchbacks...", "Taking a Break...",
        "Signing the Trail Log...", "Remembering the View...", "Planning the Next Leg...", "Zipping up the Tent...",
        "Gazing at the Stars...", "Waking up at Dawn...", "Making Cowboy Coffee...", "Breaking Down Camp..."
    ];

    // Fisher-Yates shuffle to randomize the phrases array
    for (let i = allPhrases.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allPhrases[i], allPhrases[j]] = [allPhrases[j], allPhrases[i]];
    }

    const phrase1 = allPhrases[0];
    const phrase2 = allPhrases[1];

    // Set initial phrase
    loadingText.textContent = phrase1;

    // Set timeout to change to the second phrase
    AtlasIntro.schedule(() => {
        loadingText.style.opacity = 0;
        setTimeout(() => {
            loadingText.textContent = phrase2;
            loadingText.style.opacity = 1;
        }, 500); // Fade transition
    }, 4750); // Change just before the 5-second mark

    // Set timeout to transition to the final nav bar
    const transitionTime = 9500;
    AtlasIntro.schedule(() => {
        // Fade out loading bar
        loadingBar.style.opacity = '0';
        setTimeout(() => {
            loadingBar.style.display = 'none';
            mainNav.style.display = 'flex';
            setTimeout(() => {
                mainNav.style.opacity = '1';
            }, 20);
        }, 500); // Match CSS transition
    }, transitionTime);

})();
