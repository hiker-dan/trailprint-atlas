/**
 * Homepage script for The Trailprint Atlas.
 * Owns the showcase map + intro animation, headline stats, the state map,
 * the seasonal chart, and the nav loading-bar intro sequence. (Echoes of
 * the Trail moved to echoes.html in the July 2026 redesign.)
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

            // (Record-stat calculations that once lived here now live on the
            //  Echoes page and in the Observatory section.)


            // Time Range
            if (data.length > 0) {
                const startYear = data.reduce((min, hike) => Math.min(min, hikeYear(hike)), new Date().getFullYear());
                document.getElementById('start-year').innerText = startYear;
            }

            // (First/Latest hike cards removed — Threads of the Trail now
            // carries the journey's endpoints.)

            // (Echoes of the Trail — Featured Adventure, Go-To Trail, Fresh Tracks —
            // moved to echoes.html / scripts/echoes.js in the July 2026 redesign.)

            // (State map + seasonal chart removed — their data returns
            // inside the Observatory section of the redesigned homepage.)
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
