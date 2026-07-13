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
