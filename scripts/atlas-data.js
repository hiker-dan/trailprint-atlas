/**
 * Shared data layer for The Trailprint Atlas.
 * One fetch, one cache, and the canonical grouping/date/stats helpers that
 * every page shares. Load after config.js and before any page script.
 */

let _hikesPromise = null;

/**
 * Fetches and caches data/hikes.json. Every caller on a page shares one
 * network request and one parsed copy (including back/forward navigation).
 */
function fetchHikes() {
    if (!_hikesPromise) {
        _hikesPromise = fetch('data/hikes.json').then(response => {
            if (!response.ok) throw new Error(`Failed to load hikes.json: ${response.status}`);
            return response.json();
        });
    }
    return _hikesPromise;
}

/** Groups hikes by trail_name: { "Trail Name": [hike, ...] } — repeats of a trail stay together. */
function groupByTrail(hikes) {
    const groups = {};
    hikes.forEach(hike => {
        if (!groups[hike.trail_name]) groups[hike.trail_name] = [];
        groups[hike.trail_name].push(hike);
    });
    return groups;
}

/** Groups hikes that carry a trip_tag: Map("Trip Name - Mon YYYY" -> [hike, ...]). */
function groupByTrip(hikes) {
    const trips = new Map();
    hikes.forEach(hike => {
        if (!hike.trip_tag) return;
        if (!trips.has(hike.trip_tag)) trips.set(hike.trip_tag, []);
        trips.get(hike.trip_tag).push(hike);
    });
    return trips;
}

// date_completed ("YYYY-MM-DD") parses as UTC midnight, so it must always be
// read back with UTC getters — local-time getters shift hikes a day west of UTC.

/** The (UTC) year a hike happened. */
function hikeYear(hike) {
    return new Date(hike.date_completed).getUTCFullYear();
}

/** The (UTC) month index (0-11) a hike happened. */
function hikeMonth(hike) {
    return new Date(hike.date_completed).getUTCMonth();
}

/** Formats a hike date string for display, timezone-safe. */
function formatHikeDate(dateStr, options = { year: 'numeric', month: 'long', day: 'numeric' }) {
    return new Date(dateStr).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
}

/**
 * The canonical headline stats. Miles and elevation count EVERY hike,
 * including repeats of the same trail (Danny's Part V decision #1).
 */
function getAtlasStats(hikes) {
    return {
        totalHikes: hikes.length,
        totalUniqueTrails: Object.keys(groupByTrail(hikes)).length,
        totalMiles: hikes.reduce((sum, hike) => sum + (hike.miles || 0), 0),
        totalElevation: hikes.reduce((sum, hike) => sum + (hike.elevation_gain || 0), 0)
    };
}
