/**
 * The shared navigation bar + footer for every page of the Atlas.
 *
 * The nav structure is injected synchronously (not on DOMContentLoaded) so
 * scripts that grab nav elements at parse time — like the homepage intro's
 * loading-bar sequence — always find them. Load this immediately after the
 * <nav id="top-bar-container"></nav> placeholder.
 *
 * Behavior (latest-hike link target, active-page highlight) lives in
 * nav-updater.js. Styling lives in styles/base.css.
 */
(function () {
    const navContainer = document.getElementById('top-bar-container');
    if (navContainer) {
        navContainer.innerHTML = `
        <div id="loading-bar" style="display: none;">
            <span id="loading-text"></span>
            <div class="loader-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
        <div id="main-nav">
            <a href="index.html">Home</a>
            <a href="map.html">Interactive Map</a>
            <a href="#" id="latest-hike-link">Logbook</a>
            <a href="achievements.html">Achievements</a>
            <a href="crew.html">Trail Crew</a>
            <a href="credits.html">The Overlook</a>
        </div>
    `;
    }

    // The footer belongs at the end of <body>, which hasn't been parsed yet
    // while this script runs — append it once the document is ready.
    document.addEventListener('DOMContentLoaded', () => {
        const footer = document.createElement('footer');
        footer.className = 'atlas-footer';
        footer.innerHTML = `
        <p class="footer-tagline">The Trailprint Atlas — a living journal of a life outdoors.</p>
        <p class="footer-links">
            <a href="credits.html">Credits — The Overlook</a> &middot;
            <a href="https://github.com/hiker-dan/trailprint-atlas" target="_blank" rel="noopener noreferrer">Source on GitHub</a> &middot;
            Maps by <a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a> &middot;
            Weather by <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer">Open-Meteo</a>
        </p>`;
        document.body.appendChild(footer);
    });
})();
