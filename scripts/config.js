/**
 * Shared configuration for The Trailprint Atlas.
 * The single home for values every page needs — load this before any other Atlas script.
 */

const ATLAS_CONFIG = {
    // --- Cloudinary (hosts all photos) ---
    CLOUDINARY_CLOUD: 'dgdniwosl',

    // --- Trail color, keyed by the year the trail was last hiked ---
    COLOR_MAP: {
        "2022": "#3498db", "2023": "#2ecc71", "2024": "#f1c40f", "2025": "#e67e22", "2026": "#9b59b6",
    },
    DEFAULT_COLOR: '#7f8c8d',

    // --- Map icon file (in assets/icons/) per hike type ---
    ICON_MAP: {
        "Overnight Trip": "overnight-trip-icon.png",
        "Day Trip": "day-trip-icon.png",
        "Day Hike": "day-hike-icon.png",
        "Car Camping": "car-camping-icon.png",
        "Backpacking": "backpacking-icon.png",
        "Viewpoint": "viewpoint-icon.png"
    },

    // --- Trail Crew: companions with at least this many shared hikes are
    // "core crew" — they get a card on crew.html and a member page ---
    CREW_CORE_MIN_HIKES: 10,

    // --- Season per UTC month index (0 = Jan ... 11 = Dec) ---
    SEASON_BY_MONTH: [
        'winter', 'winter',                       // Jan, Feb
        'spring', 'spring', 'spring',             // Mar, Apr, May
        'summer', 'summer', 'summer',             // Jun, Jul, Aug
        'autumn', 'autumn', 'autumn',             // Sep, Oct, Nov
        'winter'                                  // Dec
    ]
};

/**
 * Builds a Cloudinary delivery URL for an image public ID.
 * @param {string} publicId - e.g. "tta_43-lost-palms-oasis-trail-01"
 * @param {string} transform - Cloudinary transform string, e.g. "w_800,h_600,c_fill,q_auto,f_auto"
 *
 * Every upload carries a ~30 KB embedded ICC color profile that Cloudinary
 * preserves on derived images — a 40px thumbnail was arriving at 30 KB.
 * cs_srgb converts the pixels to standard sRGB (colors stay true), and
 * fl_strip_profile then drops the profile: most photos shrink by ~30 KB,
 * roughly half their size at gallery dimensions (measured July 2026).
 */
function cloudinaryUrl(publicId, transform = 'q_auto,f_auto') {
    return `https://res.cloudinary.com/${ATLAS_CONFIG.CLOUDINARY_CLOUD}/image/upload/${transform},cs_srgb,fl_strip_profile/${publicId}`;
}

/**
 * Photo-loading machinery for the lightboxes. Full-size Cloudinary images
 * can take a couple of seconds; the answer is preloading, not placeholders
 * (a holding card was tried July 2026 and retired — every variant flickered).
 * Loaded Image objects are cached so "is it warm?" survives across flips.
 */
const _photoCache = {};
function blurUpPreload(url) {
    if (!_photoCache[url]) { const im = new Image(); im.src = url; _photoCache[url] = im; }
    return _photoCache[url];
}
/**
 * Show a photo as fast as possible:
 *  - already loaded (the common case when flipping in order, thanks to the
 *    neighbor preloads below and hover warming at the call sites) → at once;
 *  - otherwise the current frame simply holds until the new photo is ready —
 *    no placeholder states.
 * Neighbors warm only AFTER the current photo lands — they must never
 * compete with it for bandwidth. Rapid flips are token-guarded: only the
 * newest request may land.
 */
function blurUpShow(img, publicId, transform, neighborIds = []) {
    const fullUrl = cloudinaryUrl(publicId, transform);
    img.dataset.blurToken = fullUrl;
    const isWarm = im => im.complete && im.naturalWidth > 0;
    const warmNeighbors = () => neighborIds.forEach(id => blurUpPreload(cloudinaryUrl(id, transform)));

    const full = blurUpPreload(fullUrl);
    if (isWarm(full)) {
        img.src = fullUrl;
        warmNeighbors();
        return;
    }
    full.addEventListener('load', () => {
        if (img.dataset.blurToken !== fullUrl) return;   // superseded by a newer flip
        img.src = fullUrl;
        warmNeighbors();
    }, { once: true });
}
