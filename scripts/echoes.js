/**
 * Echoes of the Trail — the living-journal page.
 * Fresh Tracks (latest hikes), the Featured Adventure (most recent trip),
 * and the Go-To Trail (most-hiked path). Moved as-is from scripts/home.js
 * in the July 2026 home-page redesign; a full rework is planned.
 * Requires config.js, atlas-data.js, and trail-renderer.js (formatHikeText).
 */

fetchHikes()
    .then(data => {
        // --- Fresh Tracks: the three most recent hikes ---
        (function createTrailLog() {
            const trailLogContainer = document.getElementById('trail-log-section');
            if (!trailLogContainer) return;
            const recentHikes = [...data].sort(compareHikesChronoDesc).slice(0, 3);
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

        // --- Featured Adventure: the most recent trip ---
        const trips = groupByTrip(data);
        const hikesWithTripTag = data.filter(hike => hike.trip_tag);
        if (hikesWithTripTag.length > 0) {
            const latestTripHike = hikesWithTripTag.sort(compareHikesChronoDesc)[0];
            const latestTripTag = latestTripHike.trip_tag;
            const adventureHikes = trips.get(latestTripTag);
            document.getElementById('featured-trip-title').innerText = latestTripTag;
            const hikesListContainer = document.getElementById('featured-trip-hikes-list');
            hikesListContainer.innerHTML = '';
            adventureHikes
                .sort(compareHikesChrono)
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

        // --- Go-To Trail: the most-hiked path ---
        const trailCounts = {};
        data.forEach(hike => { if (hike.trail_name) { trailCounts[hike.trail_name] = (trailCounts[hike.trail_name] || 0) + 1; } });
        let mostHikedTrailName = '';
        let maxHikes = 1;
        for (const trailName in trailCounts) { if (trailCounts[trailName] > maxHikes) { maxHikes = trailCounts[trailName]; mostHikedTrailName = trailName; } }
        if (mostHikedTrailName) {
            const mostHikedHikes = data.filter(h => h.trail_name === mostHikedTrailName);
            const representativeHike = mostHikedHikes.sort(compareHikesChronoDesc)[0];
            const totalMiles = mostHikedHikes.reduce((sum, h) => sum + (h.miles || 0), 0);
            const totalElevation = mostHikedHikes.reduce((sum, h) => sum + (h.elevation_gain || 0), 0);
            document.getElementById('goto-trail-title').innerText = representativeHike.trail_name;
            document.getElementById('goto-trail-description').innerHTML = formatHikeText(representativeHike.description);
            const datesHtml = mostHikedHikes.sort(compareHikesChronoDesc).map(h => `<li>${formatHikeDate(h.date_completed)}</li>`).join('');
            document.getElementById('goto-trail-dates-list').innerHTML = `<h4>Dates Hiked:</h4><ul>${datesHtml}</ul>`;
            document.getElementById('goto-trail-times-hiked-stat').innerHTML = `<span class="number">${maxHikes}</span><span class="label">Times Hiked</span>`;
            document.getElementById('goto-trail-miles-stat').innerHTML = `<span class="number">${Math.round(totalMiles)}</span><span class="label">Total Miles</span>`;
            document.getElementById('goto-trail-elevation-stat').innerHTML = `<span class="number">${totalElevation.toLocaleString()}</span><span class="label">Total Gain (ft)</span>`;
            const gotoImageIds = mostHikedHikes.map(h => h.images && h.images.length > 0 ? h.images[0] : null).filter(Boolean);
            startSlideshow('#goto-trail-section .featured-adventure-image-container', gotoImageIds);
            document.getElementById('goto-trail-section').style.display = 'flex';
        }
    })
    .catch(error => {
        console.error('Error loading Echoes of the Trail data:', error);
    });

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
