/**
 * The Interactive Map — rebuilt July 2026 around three ways of moving:
 *
 *   RANGER-LED  — "Begin the expedition": cinema mode. The floating chrome
 *                 fades away, the camera flies outing to outing in the order
 *                 they were walked, trails inking onto the land as time
 *                 advances, and each landing docks the trail's field card at
 *                 the left edge — never over the trail itself.
 *   SELF-LED    — pause anywhere (or just grab the map, which pauses it for
 *                 you) and step the legs with the arrows at your own pace.
 *   OFF-TRAIL   — the classic free map: pan, zoom, click, filter. The
 *                 timeline is grabbable here too: scrub it and the Atlas
 *                 un-inks back to any moment in its history.
 *
 * One state drives everything: nowT, the moment the map is showing. The
 * timeline sets it, the expedition advances it, and trails whose first hike
 * came after it simply aren't on the land yet.
 *
 * Requires config.js, atlas-data.js, trail-renderer.js.
 */

const map = L.map('map', { zoomControl: false }).setView([39.82, -98.58], 5);
L.control.zoom({ position: 'bottomright' }).addTo(map);
map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
map.attributionControl.addAttribution('Terrain, topo &amp; imagery &copy; Esri &middot; Base &amp; labels &copy; CARTO &middot; &copy; OpenStreetMap contributors');

// --- Create a custom pane for the main trail lines ---
// This ensures the primary trail is always drawn on top of its "ghost" trails.
map.createPane('mainTrailPane');
map.getPane('mainTrailPane').style.zIndex = 450;
// The Expedition Line rides its own pane so the whole thread web can fade as
// one: it is cinema apparatus, shown only while the engine is animating —
// at rest, the trails own the map alone (see .threads-on in map.css).
map.createPane('threadPane');
map.getPane('threadPane').style.zIndex = 430;

// Wide-padding vector renderers. Leaflet's default per-pane SVG renderer only
// draws a thin margin beyond the viewport (padding 0.1), so a quick pan or a
// zoom runs the trail ink off the edge of its own canvas and it visibly swims
// against the basemap until the next re-render. A generous buffer keeps the
// whole surrounding neighborhood of ink laid out, so the trails (and the
// viewpoint dots) stay locked to the land as you move and zoom around. Shared
// per pane so there is exactly one SVG each, not one per trail.
const trailRenderer = L.svg({ pane: 'mainTrailPane', padding: 0.5 });
const threadRenderer = L.svg({ pane: 'threadPane', padding: 0.5 });

// --- Zoom-aware stamp reveal ---
// Below this zoom the engraved stamps fold back into their trailhead dots
// (via CSS on .stamp-seat) so the trailprints own the wide view; the stamps
// bloom again as you approach a region.
const ICON_REVEAL_ZOOM = 11;
const updateIconVisibility = () => {
    map.getContainer().classList.toggle('icons-zoomed-out', map.getZoom() < ICON_REVEAL_ZOOM);
};
map.on('zoomend', updateIconVisibility);
updateIconVisibility();

// ===========================================================================
// The basemap wardrobe. Three outfits, all pre-added at opacity 0 and
// crossfaded (the .fadeable-tile-layer transition), never swapped:
//   Atlas     — shaded relief under a parchment wash + place names: the site's
//               own cartography, kin to the homepage hero film.
//   Topo      — full contour detail for knowing exactly where you are, washed
//               slightly toward the Atlas palette (CSS filter) so it doesn't
//               read like a 2010s embed.
//   Satellite — the real ground, with place names.
// ===========================================================================
// Tile loading is tuned for smooth MANUAL roaming — the camera never flies on
// its own any more (navigation cuts behind the veil), so the old "load eagerly
// through every level of a flight" reasoning is retired. Two knobs:
//   updateWhenIdle:false   — a PAN requests tiles immediately, so dragging the
//                            map never trails bare paper behind the cursor.
//   updateWhenZooming:false — but a ZOOM holds its requests until the wheel
//                            settles. Spinning fast used to fire a whole fresh
//                            tile set at every level it flew through (z10, 11,
//                            12, 13…), each arriving half-loaded and pruned
//                            before the next — that was the patchwork churn.
//                            Now the current tiles simply scale (a clean, brief
//                            blur) and one crisp sheet loads at the level you
//                            land on.
// keepBuffer holds a wide apron of loaded tiles so small pans never reveal the
// paper beneath; the z6 underlays mean a zoom never bottoms out on blank page.
const TILE = (url, opts = {}) => L.tileLayer(url, {
    className: 'fadeable-tile-layer', opacity: 0, attribution: '',
    updateWhenIdle: false, updateWhenZooming: false, keepBuffer: 8, ...opts
});
const VOYAGER_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png';
const HILLSHADE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}';
const LABELS_URL = 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png';
const PLACES_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const TOPO_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';
const IMAGERY_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

// The Atlas outfit is a stack, not a single sheet: CARTO's Voyager base
// (crisp to street level, @2x on retina; warm cream land, blue water, soft
// green parks) carries the color, with Esri's World Hillshade — native
// detail to z16, vs the old shaded relief's z13 — multiply-blended over it
// for the terrain. The parchment wash then warms the whole sandwich.
const atlasBaseLayer = TILE(VOYAGER_URL, { subdomains: 'abcd', maxZoom: 18, zIndex: 200 });
const hillshadeLayer = TILE(HILLSHADE_URL, { maxNativeZoom: 16, maxZoom: 18, zIndex: 210, className: 'fadeable-tile-layer hillshade-multiply' });
// Atlas-mode labels: CARTO's quiet gray label sheet, slid UNDER the parchment
// wash (z-index 240 vs the wash's 250) so the multiply blend inks the names
// into the paper instead of floating haloed text on top of it.
const atlasLabelsLayer = TILE(LABELS_URL, { subdomains: 'abcd', maxZoom: 18, className: 'fadeable-tile-layer atlas-labels' });
// Satellite keeps Esri's stronger reference labels — they're built to stay
// readable over imagery, where CARTO's grays would drown.
const placesLayer = TILE(PLACES_URL, { maxZoom: 17, className: 'fadeable-tile-layer places-layer' });
const topoLayer = TILE(TOPO_URL, { maxZoom: 17, zIndex: 220, className: 'fadeable-tile-layer basemap-soften' });
const imageryLayer = TILE(IMAGERY_URL, { maxZoom: 18, zIndex: 220 });

// The high-altitude backdrop: each basemap has an "underlay" twin pinned to
// z6 tiles (maxNativeZoom), scaled up beneath the crisp sheets. Its handful
// of tiles load once and are never pruned, so a camera flight always has
// land beneath it — the soft mid-flight view reads as altitude, never as
// blank paper. It keeps loading during flight ('move' updates), while the
// crisp layers wait for the landing. No hillshade twin: two multiply layers
// would double-shade the terrain, and Voyager's low-zoom tint is enough.
const UNDER = (url, opts = {}) => L.tileLayer(url, {
    className: 'fadeable-tile-layer', opacity: 0, attribution: '',
    maxNativeZoom: 6, maxZoom: 18, updateWhenIdle: false, keepBuffer: 4, ...opts
});
const atlasBaseUnder = UNDER(VOYAGER_URL, { subdomains: 'abcd', zIndex: 190 });
const topoUnder = UNDER(TOPO_URL, { zIndex: 191, className: 'fadeable-tile-layer basemap-soften' });
const imageryUnder = UNDER(IMAGERY_URL, { zIndex: 191 });

const ALL_TILE_LAYERS = [atlasBaseUnder, topoUnder, imageryUnder, atlasBaseLayer, hillshadeLayer, topoLayer, imageryLayer, placesLayer, atlasLabelsLayer];

// the parchment wash that ties the Atlas outfit to the hero film
const parchmentWash = document.createElement('div');
parchmentWash.className = 'parchment-wash';
map.getContainer().appendChild(parchmentWash);

const BASEMAPS = {
    atlas: { tiles: new Map([[atlasBaseUnder, 1], [atlasBaseLayer, 1], [hillshadeLayer, 0.9], [atlasLabelsLayer, 0.9]]), wash: true },
    topo: { tiles: new Map([[topoUnder, 1], [topoLayer, 1]]), wash: false },
    satellite: { tiles: new Map([[imageryUnder, 1], [imageryLayer, 1], [placesLayer, 1]]), wash: false }
};
let currentBasemap = 'atlas';
// Only the active outfit's sheets ride on the map. An opacity-0 tile layer
// still FETCHES every tile the camera crosses — with all three outfits
// mounted, each pan paid for nine layers' worth of requests, which is what
// made free roaming feel sluggish. Now the others dismount after the
// crossfade and remount on demand.
function setBasemap(key) {
    currentBasemap = key;
    const conf = BASEMAPS[key];
    ALL_TILE_LAYERS.forEach(l => {
        const target = conf.tiles.get(l) || 0;
        if (target > 0) {
            if (!map.hasLayer(l)) {
                l.addTo(map);
                // let the fresh sheet paint at 0 first so the fade-in runs
                requestAnimationFrame(() => requestAnimationFrame(() => l.setOpacity(target)));
            } else {
                l.setOpacity(target);
            }
        } else {
            l.setOpacity(0);
        }
    });
    clearTimeout(setBasemap._t);
    setBasemap._t = setTimeout(() => {
        const cur = BASEMAPS[currentBasemap].tiles;
        ALL_TILE_LAYERS.forEach(l => { if (!cur.get(l) && map.hasLayer(l)) map.removeLayer(l); });
    }, 700);
    parchmentWash.classList.toggle('on', conf.wash);
    document.querySelectorAll('.basemap-chips button').forEach(b => b.classList.toggle('active', b.dataset.base === key));
}
document.getElementById('pane-basemap').addEventListener('click', e => {
    if (e.target.dataset.base) setBasemap(e.target.dataset.base);
});
setBasemap('atlas');

// ===========================================================================
// Data + shared state
// ===========================================================================
let allHikesData = [];          // trail groups (hikes grouped by trail_name)
let allTrailGeometries = {};
let layerReferences = {};       // trail_name -> { layer, firstT, row, bounds }
let iconNudges = {};
let legs = [];                  // every visible hike, chronological — the expedition's flight plan
let t0 = 0, t1 = 1;             // the timeline's ends (first & last hike)
let nowT = Infinity;            // the moment the map is showing (for the readout)
let inkIx = -1;                 // how far the ink has been laid, by LEG ORDER —
                                // same-day trip siblings share a date, so time
                                // alone can never drive the reveal
let legIndexById = {};          // trail_id -> position in the itinerary
let hikesById = {};             // trail_id -> hike record (the sheet's lookup)
let fullBounds = null;

// Deep-link support: map.html?state=CA opens zoomed to that state's hikes.
const FOCUS_STATE = (new URLSearchParams(window.location.search).get('state') || '').trim().toUpperCase();
let pendingFocusState = FOCUS_STATE;
// A sheet arrival (?sheet= / ?restore=land) frames its own camera; the boot's
// whole-Atlas fit must stand down or its animation can land after the trail
// frame and shove the camera back out to the wide view.
let pendingSheetBoot = (() => {
    const p = new URLSearchParams(window.location.search);
    return Boolean(p.get('sheet') || p.get('restore') === 'land');
})();

function zoomToState(abbr) {
    const pts = [];
    allHikesData.forEach(group => {
        const st = (group[0].region || '').split(', ').pop().trim().toUpperCase();
        if (st !== abbr) return;
        group.forEach(h => {
            if (typeof h.latitude === 'number' && typeof h.longitude === 'number') pts.push([h.latitude, h.longitude]);
        });
    });
    if (!pts.length) return;
    const b = L.latLngBounds(pts);
    const span = Math.max(b.getNorth() - b.getSouth(), b.getEast() - b.getWest());
    if (span < 0.05) map.setView(b.getCenter(), 11, { animate: false });
    else map.fitBounds(b.pad(0.2), { maxZoom: 12, animate: false });
}

// --- Filter state ---
const activeFilters = {
    year: new Set(),
    hike_type: new Set(),
    difficulty: new Set(),
    size: new Set(),
    search: ''
};

Promise.all([fetchHikes(), fetchTrailGeometries()])
    .then(([data, trailGeometries]) => {
        allHikesData = Object.values(groupByTrail(data));
        allTrailGeometries = trailGeometries;
        iconNudges = computeIconNudges(allHikesData);
        populateFilters(allHikesData);
        renderMapLayers(allHikesData);
        setupEventListeners();
        renderLegend();
        const sub = document.getElementById('wordmark-sub');
        if (sub) {
            const vps = data.filter(isViewpoint).length;
            const trailCount = allHikesData.filter(g => !isViewpoint(g[0])).length;
            sub.textContent = `${data.length - vps} hikes · ${vps} viewpoints · ${trailCount} trails`;
        }
        bootSpine(data);
        // the resting console previews the newest outing (a live named card, not
        // the blank ledger) so the deck reads as a preview from first paint. A
        // ?leg/?sheet/?restore boot below overrides it with its own hike.
        if (legs.length) previewPlaque(legs[legs.length - 1].h);
        if (FOCUS_STATE) zoomToState(FOCUS_STATE);
        pendingFocusState = '';
        // ?leg=N lands instantly on an expedition leg, world rendered to that
        // point — the headless-screenshot hook, same spirit as home.js's ?p=.
        // Add &cinema=1 to freeze the cinema presentation for screenshots.
        const params = new URLSearchParams(window.location.search);
        const LEG_PARAM = params.get('leg');
        if (LEG_PARAM !== null && legs.length) {
            mode = 'expedition';
            const ix = Math.max(0, Math.min(legs.length - 1, +LEG_PARAM));
            legIx = ix;
            inkIx = ix;
            nowT = legs[ix].t;
            applyReveal();
            syncThreads(ix);
            setShotView(ix);
            setPlaque(legs[ix].h);
            syncScrub();
            updateDeck();
            if (params.get('cinema')) { setCinema(true); setThreads(true); }
            // &dbg=1: expose the landed zoom to headless checks via the title
            if (params.get('dbg')) document.title = `z${map.getZoom()} shot${shotOfLeg[ix]} legs${shots[shotOfLeg[ix]].legIxs.length}`;
        }
        // ?restore=land: the hike page's return door — put the land back
        // exactly as it stood when the visitor stepped through to the log.
        if (params.get('restore') === 'land' && LEG_PARAM === null) {
            if (restoreLandState()) { pendingSheetBoot = false; return; }
        }
        // ?sheet=tta_NN: arrive straight onto a risen sheet (a shared link).
        // replaceState, not push — the arrival IS the first history entry.
        const SHEET_PARAM = params.get('sheet');
        if (SHEET_PARAM && hikesById[SHEET_PARAM] && LEG_PARAM === null) {
            // The browser's own back button is a full reload of this URL, so
            // it must behave exactly like the return chip: if the handshake
            // matches this sheet, the whole moment comes back — timeline
            // position, basemap, everything — not just the risen sheet.
            const hs = freshLandState();
            if (hs && hs.sheet === SHEET_PARAM && restoreLandState()) { pendingSheetBoot = false; return; }
            const h = hikesById[SHEET_PARAM];
            const ref = layerReferences[h.trail_name];
            if (ref) {
                // cold: a shared link has no "before" — lowering stays on the trail
                raiseSheet(ref, h, { instant: true, pushUrl: false, cold: true });
                history.replaceState({ sheet: h.trail_id }, '', location.href);
            }
        }
        // whatever the arrival was, later renders (filters) fit normally again;
        // and a sheet boot that found nothing falls back to the whole Atlas
        if (pendingSheetBoot) {
            pendingSheetBoot = false;
            if (!sheetHikeId && fullBounds) map.fitBounds(fullBounds, { animate: false });
        }
    })
    .catch(error => console.error('Error loading map data:', error));

/**
 * Trailheads that share a parking lot would stack their icons exactly on top
 * of each other; fan them apart by a constant pixel offset. (Unchanged from
 * the first-generation map.)
 */
function computeIconNudges(trailGroups) {
    const NEIGHBOR_RADIUS_M = 150;
    const SPACING_PX = 36;
    const iconPosition = (group) => {
        const sorted = [...group].sort(compareHikesChronoDesc);
        const rep = sorted[0];
        const journey = rep.trip_tag ? sorted.filter(h => h.trip_tag === rep.trip_tag) : [rep];
        const firstLegSegments = allTrailGeometries[journey[journey.length - 1].trail_id];
        if (firstLegSegments) return firstLegSegments[0][0];
        return (rep.latitude && rep.longitude) ? [rep.latitude, rep.longitude] : null;
    };
    const trailheads = trailGroups
        .map(group => ({ name: group[0].trail_name, latlng: iconPosition(group) }))
        .filter(trailhead => trailhead.latlng);
    const nudges = {};
    const clustered = new Set();
    trailheads.forEach((trailhead, i) => {
        if (clustered.has(trailhead.name)) return;
        const cluster = [trailhead, ...trailheads.slice(i + 1).filter(other =>
            !clustered.has(other.name) &&
            map.distance(trailhead.latlng, other.latlng) < NEIGHBOR_RADIUS_M
        )];
        if (cluster.length > 1) {
            cluster.sort((a, b) => a.name.localeCompare(b.name));
            cluster.forEach((entry, index) => {
                clustered.add(entry.name);
                nudges[entry.name] = (index - (cluster.length - 1) / 2) * SPACING_PX;
            });
        }
    });
    return nudges;
}

// --- Trail Spotlight: a focused trail dims every other one ---
let spotlightTrailName = null;
function eachTrailLayer(ref, fn) {
    ref.visits.forEach(v => { if (v.mode !== 'off') v.lines.forEach(fn); });
    ref.markers.forEach(fn);
}
function applySpotlight() {
    for (const name in layerReferences) {
        const focused = !spotlightTrailName || name === spotlightTrailName;
        eachTrailLayer(layerReferences[name], l => {
            if (l instanceof L.Marker) {
                l.setOpacity(focused ? 1 : 0.2);
            } else if (l.setStyle) {
                const base = l.options.baseOpacity ?? l.options.opacity;
                l.setStyle({ opacity: focused ? base : base * 0.15 });
                if (focused && spotlightTrailName && l.bringToFront) l.bringToFront();
            }
        });
    }
}

// ===========================================================================
// Rendering: time-aware ink. Every VISIT to a trail owns its own stroke —
// the newest visible visit rides solid in its year's color, earlier visits
// fade to echo whispers beneath it, and nothing later than nowT exists yet.
// One rendering truth for playback and free exploration alike. (Replaced
// the static latest-color + ghost-halo rendering, which leaked future
// years into the expedition's past.)
// ===========================================================================
// Trailhead stamps (replaced gen-1's floating PNG pins, July 2026): each
// trailhead is a small year-ink dot at the exact point plus an engraved
// stamp seated beside it — printed on the paper like a quad-sheet symbol.
// The seat offsets away from the trail's own ink and blooms only past
// ICON_REVEAL_ZOOM; farther out, the dots own the view.

/** Which way is "away from the ink"? Opposite the bisector of the trail's
    opening and closing bearings out of the trailhead — for an out-and-back
    that's straight back down the approach, for a loop it's outside the
    loop's mouth. Returned in screen pixels (y runs south). */
function stampVector(segs) {
    const pts = segs[0], tail = segs[segs.length - 1];
    const a = pts[0];
    const k = Math.cos(a[0] * Math.PI / 180);         // shrink east-west degrees to true distance
    const unit = p => {
        const x = (p[1] - a[1]) * k, y = p[0] - a[0];
        const m = Math.hypot(x, y);
        return m ? [x / m, y / m] : [0, 0];
    };
    const probe = arr => arr[Math.max(1, Math.min(arr.length - 1, Math.round(arr.length * 0.06)))];
    const u1 = unit(probe(pts));
    const u2 = unit(probe([...tail].reverse()));
    let sx = u1[0] + u2[0], sy = u1[1] + u2[1];
    let m = Math.hypot(sx, sy);
    if (m < 0.35) { sx = -u1[1]; sy = u1[0]; m = 1; } // through-route: step aside instead
    const R = 16;
    return { dx: -sx / m * R, dy: sy / m * R };
}

function makeStampIcon(hike, vec, gold, isVp) {
    const cls = 'stamp' + (gold ? ' gold' : '');
    // viewpoints carry no dot of their own — their ink IS a dot already
    const html = `<div class="stamp-core" style="color:${yearColorOf(hike)}">`
        + (isVp ? '' : '<span class="stamp-dot"></span>')
        + `<span class="stamp-seat" style="transform:translate(${vec.dx.toFixed(1)}px,${vec.dy.toFixed(1)}px)">${atlasStampSvg(hike.hike_type)}</span></div>`;
    return L.divIcon({ className: cls, html, iconSize: [0, 0], iconAnchor: [0, 0] });
}

function attachTrailInteractions(layer, trailName, ref) {
    layer.on('click', () => {
        // the same click bubbles on to the map, whose handler would
        // immediately close the card we're about to open — swallow it
        suppressMapClick = true;
        setTimeout(() => { suppressMapClick = false; }, 0);
        focusTrail(trailName);
    });
    layer.on('mouseover', () => {
        if (ref.warmed) return;
        ref.warmed = true;
        const photoId = cardBannerPhotoId([...ref.group].sort(compareHikesChronoDesc));
        if (photoId) {
            new Image().src = cloudinaryUrl(photoId, CARD_BANNER_TRANSFORM);
            new Image().src = cloudinaryUrl(photoId, CARD_BLUR_TRANSFORM);
        }
    });
}

function buildTrailRef(hikesForTrail) {
    const trailName = hikesForTrail[0].trail_name;
    const allPts = [];
    const ref = {
        name: trailName, group: hikesForTrail, row: null, warmed: false,
        nudgeX: iconNudges[trailName] || 0,
        visits: [], markers: [], sig: null, msig: null,
        firstT: Math.min(...hikesForTrail.map(h => new Date(h.date_completed).getTime()))
    };
    [...hikesForTrail].sort(compareHikesChrono).forEach(h => {
        const col = yearColorOf(h);
        const segs = allTrailGeometries[h.trail_id] || null;
        const lines = [];
        if (segs) {
            segs.forEach(ll => {
                ll.forEach(p => allPts.push(p));
                lines.push(L.polyline(ll, { color: col, weight: 5, opacity: 0.85, baseOpacity: 0.85, pane: 'mainTrailPane', renderer: trailRenderer }));
            });
        } else if (typeof h.latitude === 'number') {
            // a viewpoint's ink is its dot — always visible, unlike the
            // zoom-gated icon above it
            allPts.push([h.latitude, h.longitude]);
            lines.push(L.circleMarker([h.latitude, h.longitude],
                { radius: 4.5, color: '#fffdf6', weight: 1.5, fillColor: col, fillOpacity: 0.95, opacity: 1, baseOpacity: 1, pane: 'mainTrailPane', renderer: trailRenderer }));
        } else {
            return;
        }
        lines.forEach(l => attachTrailInteractions(l, trailName, ref));
        // a viewpoint's stamp perches straight above its dot
        const vec = segs ? stampVector(segs) : { dx: 0, dy: -16 };
        ref.visits.push({ h, t: new Date(h.date_completed).getTime(), tag: h.trip_tag, segs, lines, vec, col, mode: 'off' });
    });
    if (!ref.visits.length) return null;
    ref.bounds = L.latLngBounds(allPts);
    return ref;
}

/** An echo's ink: the year's color mixed toward dusk, so a same-year halo
    still reads against the fresh stroke laid over it. */
const deepen = hex => {
    const n = parseInt(hex.slice(1), 16);
    const d = c => Math.round(c * 0.72);
    return `rgb(${d(n >> 16 & 255)},${d(n >> 8 & 255)},${d(n & 255)})`;
};

/** Restyle one visit's stroke: solid ink, echo whisper, or not yet walked.
    The CSS stroke transition turns solid→echo into the fade Danny asked for. */
function styleVisit(v, target) {
    if (v.mode === target) return;
    v.mode = target;
    if (target === 'off') {
        v.lines.forEach(l => map.removeLayer(l));
        return;
    }
    const solid = target === 'solid';
    // An echo is a HALO, not a thinner line: repeat visits mostly retrace the
    // same ground, and a narrow echo would hide entirely beneath the newer
    // solid stroke. Wider + faint + DEEPENED (the year's ink at dusk), it
    // glows out from under the new stroke — still unmistakably its year, but
    // visible even when the new visit is the very same color. The .echo-ink
    // class slows the stroke transition so a halo blooms in organically
    // rather than snapping.
    v.lines.forEach(l => {
        if (!map.hasLayer(l)) l.addTo(map);
        const el = l.getElement ? l.getElement() : null;
        if (el) el.classList.toggle('echo-ink', !solid);
        if (l instanceof L.CircleMarker) {
            l.setRadius(solid ? 4.5 : 8);
            l.setStyle({ fillColor: solid ? v.col : deepen(v.col), opacity: solid ? 1 : 0.35, fillOpacity: solid ? 0.95 : 0.3 });
            l.options.baseOpacity = solid ? 1 : 0.35;
        } else {
            l.setStyle({ color: solid ? v.col : deepen(v.col), weight: solid ? 5 : 11, opacity: solid ? 0.85 : 0.35 });
            l.options.baseOpacity = solid ? 0.85 : 0.35;
        }
        if (solid && l.bringToFront) l.bringToFront();
    });
}

/** Bring one trail's ink and markers in line with the reveal (leg order,
    never raw dates — same-day trip siblings must arrive one at a time). */
function applyTrailInk(ref) {
    const arrived = ref.visits.filter(v => legIndexById[v.h.trail_id] <= inkIx);
    const vis = arrived.filter(v => v.h.trail_id !== holdLegId);
    const last = vis.length ? vis[vis.length - 1] : null;
    // a multi-day journey is one visit-event: every leg sharing the newest
    // visit's trip_tag stays solid together
    const solidSet = new Set();
    if (last) vis.forEach(v => { if (v === last || (last.tag && v.tag === last.tag)) solidSet.add(v); });
    const sig = `${vis.length}|${last ? last.h.trail_id : ''}`;
    if (ref.sig !== sig) {
        ref.sig = sig;
        ref.visits.forEach(v => styleVisit(v, !vis.includes(v) ? 'off' : (solidSet.has(v) ? 'solid' : 'echo')));
    }
    // markers follow the newest visit-event. The gold ring counts HISTORY
    // (every arrived visit, held one included) so a redraw never strips it.
    const events = new Set(arrived.map(v => v.tag ? 'tag:' + v.tag : v.h.trail_id));
    const msig = last ? `${last.h.trail_id}|${events.size > 1}` : '';
    if (ref.msig !== msig) {
        ref.msig = msig;
        const gold = events.size > 1;
        const want = last ? [...solidSet].sort((a, b) => a.t - b.t) : [];
        const kindOf = v => `${v.h.hike_type}|${isViewpoint(v.h)}`;
        // When the standing markers can carry the new state (same count, same
        // stamp kinds — the usual case when a repeat visit lands), mutate them
        // in place: a teardown would make the gold ring POP into existence,
        // where a class toggle lets the CSS transitions bloom it in.
        const same = want.length && ref.markers.length === want.length &&
            want.every((v, k) => ref.markers[k]._stampKind === kindOf(v));
        if (same) {
            want.forEach((v, k) => {
                const m = ref.markers[k];
                m.setLatLng(v.segs ? v.segs[0][0] : [v.h.latitude, v.h.longitude]);
                const el = m.getElement();
                if (!el) return;
                el.classList.toggle('gold', gold && k === 0);
                el.querySelector('.stamp-core').style.color = yearColorOf(v.h);
                el.querySelector('.stamp-seat').style.transform =
                    `translate(${(v.vec.dx + (k === 0 ? ref.nudgeX : 0)).toFixed(1)}px,${v.vec.dy.toFixed(1)}px)`;
            });
        } else {
            ref.markers.forEach(m => map.removeLayer(m));
            ref.markers = [];
            want.forEach((v, k) => {
                const start = v.segs ? v.segs[0][0] : [v.h.latitude, v.h.longitude];
                const vec = { dx: v.vec.dx + (k === 0 ? ref.nudgeX : 0), dy: v.vec.dy };
                const m = L.marker(start, {
                    icon: makeStampIcon(v.h, vec, gold && k === 0, isViewpoint(v.h))
                });
                m._stampKind = kindOf(v);
                attachTrailInteractions(m, ref.name, ref);
                m.addTo(map);
                ref.markers.push(m);
            });
        }
    }
}

function renderMapLayers(trailGroupsToRender) {
    resetExpedition();                      // a re-render always lands in off-trail mode
    for (const name in layerReferences) {
        const old = layerReferences[name];
        old.visits.forEach(v => v.lines.forEach(l => map.removeLayer(l)));
        old.markers.forEach(m => map.removeLayer(m));
    }
    layerReferences = {};
    spotlightTrailName = null;

    const legList = [];
    trailGroupsToRender.forEach(hikesForTrail => {
        const ref = buildTrailRef(hikesForTrail);
        if (!ref) return;
        layerReferences[ref.name] = ref;
        hikesForTrail.forEach(h => {
            if (typeof h.latitude !== 'number' && !allTrailGeometries[h.trail_id]) return;
            legList.push({ t: new Date(h.date_completed).getTime(), h, name: ref.name });
        });
    });

    // the register renders after the layers exist, so each row can hold its ref
    renderTrailList(trailGroupsToRender);

    // the itinerary: chronological, ties broken by tta number (the order hiked)
    const num = h => +h.trail_id.split('_')[1];
    legs = legList.sort((a, b) => a.t - b.t || num(a.h) - num(b.h));
    if (legs.length) { t0 = legs[0].t; t1 = legs[legs.length - 1].t; }
    nowT = t1;
    legIx = legs.length - 1;
    inkIx = legs.length - 1;
    legIndexById = {};
    hikesById = {};
    legs.forEach((l, i) => {
        legIndexById[l.h.trail_id] = i;
        hikesById[l.h.trail_id] = l.h;
        const ref = layerReferences[l.name];
        if (ref && (ref.firstLegIx === undefined || i < ref.firstLegIx)) ref.firstLegIx = i;
    });
    holdLegId = null;
    buildExpedition();
    buildTimelineChrome();
    syncScrub();
    applyReveal();
    updateDeck();

    const shown = Object.keys(layerReferences).length;
    const count = document.getElementById('filter-count');
    if (count) count.textContent = `Showing ${shown} of ${allHikesData.length} trails`;

    fullBounds = null;
    for (const name in layerReferences) {
        const b = layerReferences[name].bounds;
        fullBounds = fullBounds ? fullBounds.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast());
    }
    if (fullBounds) fullBounds = fullBounds.pad(0.1);
    if (!pendingFocusState && !pendingSheetBoot && fullBounds) map.fitBounds(fullBounds);
}

/** Which trails exist yet, at the moment the map is showing? */
function applyReveal() {
    let hikeCount = 0, vpCount = 0, miles = 0;
    legs.forEach((l, i) => {
        if (i > inkIx) return;
        if (isViewpoint(l.h)) vpCount++; else hikeCount++;
        miles += l.h.miles || 0;
    });
    for (const name in layerReferences) {
        const ref = layerReferences[name];
        // per-visit ink: the newest visible visit solid, earlier ones echo;
        // holdLegId keeps the leg being drawn off the land until it lands
        applyTrailInk(ref);
        if (ref.row) ref.row.classList.toggle('future', ref.firstLegIx > inkIx);
    }
    // the chain dims every mark ahead of the moment, in lockstep with the ink.
    // Naming the newest inked hike lets it reveal same-day trip siblings one at
    // a time (by leg order), instead of a whole day lighting on its shared date.
    if (typeof AtlasChain !== 'undefined') {
        AtlasChain.setReveal(nowT, inkIx >= 0 && legs[inkIx] ? legs[inkIx].h.trail_id : null);
    }
    const d = new Date(Math.min(nowT, t1));
    const readout = document.getElementById('deck-readout');
    if (!readout || !legs.length) return;
    if (mode === 'expedition' && legIx >= 0 && chapters.length) {
        // mid-expedition the readout names the chapter (and, at home, the
        // running location tag — zones change here, never as a camera cut)
        const ch = chapters[chapterOfLeg[legIx]];
        const where = ch.kind === 'home' ? `${ch.name} · ${legs[legIx].h.location}` : ch.name;
        readout.innerHTML = `<b>${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}</b>
            <span class="deck-stats">Chapter ${ROMAN(chapterOfLeg[legIx] + 1)} · ${where}</span>`;
        return;
    }
    const atEnd = nowT >= t1;
    const bits = [`${hikeCount} hike${hikeCount === 1 ? '' : 's'}`];
    if (vpCount) bits.push(`${vpCount} viewpoint${vpCount === 1 ? '' : 's'}`);
    bits.push(`${Math.round(miles).toLocaleString()} miles of ink`);
    readout.innerHTML = `<b>${atEnd ? 'The whole Atlas' : MONTH_NAMES[d.getUTCMonth()] + ' ' + d.getUTCFullYear()}</b>
        <span class="deck-stats">${bits.join(' · ')}</span>`;
}

function renderTrailList(trailGroupsToRender) {
    const listContainer = document.getElementById('trail-list-container');
    listContainer.innerHTML = '';
    trailGroupsToRender.sort((a, b) => a[0].trail_name.localeCompare(b[0].trail_name));
    trailGroupsToRender.forEach(group => {
        const rep = [...group].sort(compareHikesChronoDesc)[0];
        const color = ATLAS_CONFIG.COLOR_MAP[hikeYear(rep).toString()] || ATLAS_CONFIG.DEFAULT_COLOR;
        const listItem = document.createElement('div');
        listItem.className = 'trail-list-item';
        listItem.dataset.trailName = rep.trail_name;
        listItem.innerHTML = `
            <span class="tli-dot" style="background:${color}"></span>
            <span class="tli-main">
                <span class="tli-name">${rep.trail_name}${group.length > 1 ? ` <em class="tli-times">×${group.length}</em>` : ''}</span>
                <span class="tli-loc">${rep.location}</span>
            </span>`;
        listContainer.appendChild(listItem);
        if (layerReferences[rep.trail_name]) layerReferences[rep.trail_name].row = listItem;
    });
}

// ===========================================================================
// The field card — one docked home for trail information in every mode.
// It replaces the old anchored popups: instead of a box floating over the
// trail, the card holds the map's left edge and the camera frames the trail
// in the open space beside it, so information and geography never fight.
// ===========================================================================
const CARD_BANNER_TRANSFORM = 'w_600,h_300,c_fill,q_auto,f_auto';
const CARD_BLUR_TRANSFORM = 'w_40,h_20,c_fill,q_auto:low,e_blur:300,f_auto';
const fieldCardEl = document.getElementById('field-card');
let cardTrailName = null;
let suppressMapClick = false;       // a trail click also bubbles to the map

function cardBannerPhotoId(sortedHikes) {
    const withPhoto = sortedHikes.find(h => h.images && h.images.length > 0);
    return withPhoto ? withPhoto.images[0] : null;
}

/**
 * currentHike (optional) pins the card to one specific outing — the
 * expedition passes the leg's hike so the stats and highlighted date stamp
 * belong to that day, not just the latest visit.
 */
function buildFieldCardHtml(hikesForTrail, currentHike) {
    const sorted = [...hikesForTrail].sort(compareHikesChronoDesc);
    const rep = currentHike || sorted[0];
    const yearColor = ATLAS_CONFIG.COLOR_MAP[hikeYear(rep).toString()] || ATLAS_CONFIG.DEFAULT_COLOR;
    const isVp = rep.hike_type === 'Viewpoint';
    const bannerPhotoId = cardBannerPhotoId(sorted);
    let bannerHtml;
    if (bannerPhotoId) {
        const photoUrl = cloudinaryUrl(bannerPhotoId, CARD_BANNER_TRANSFORM);
        const blurUrl = cloudinaryUrl(bannerPhotoId, CARD_BLUR_TRANSFORM);
        bannerHtml = `
            <div class="fc-banner" style="background-color: ${yearColor};">
                <img class="fc-banner-blur" src="${blurUrl}" alt="" aria-hidden="true">
                <img class="fc-banner-photo" src="${photoUrl}" alt="${rep.trail_name}">
                <span class="fc-kind">${rep.hike_type}</span>
            </div>`;
    } else {
        bannerHtml = `
            <div class="fc-banner fc-banner-fallback" style="background-color: ${yearColor};">
                ${atlasStampSvg(rep.hike_type)}
                <span class="fc-kind">${rep.hike_type}</span>
            </div>`;
    }
    const statsHtml = isVp
        ? `<div class="fc-vp-note">A scenic stop along the way. No miles inked.</div>`
        : `<div class="fc-stats">
                <div class="fc-stat"><span class="num">${rep.miles}</span><span class="cap">Miles</span></div>
                <div class="fc-stat"><span class="num">${rep.elevation_gain.toLocaleString()}</span><span class="cap">Ft Gain</span></div>
                <div class="fc-stat"><span class="num">${rep.difficulty}</span><span class="cap">Difficulty</span></div>
            </div>`;
    const withHtml = (rep.hiked_with && rep.hiked_with.length)
        ? `<div class="fc-with">With ${rep.hiked_with.join(', ')}</div>`
        : (rep.hike_size === 'Solo' ? `<div class="fc-with">Walked solo</div>` : '');
    const verb = isVp ? 'Visited' : 'Hiked';
    const visitsLabel = sorted.length > 1 ? `${verb} ${sorted.length} times &mdash; pick a day` : `${verb} on`;
    const stampsHtml = sorted.map(h =>
        `<a class="fc-stamp${currentHike && h.trail_id === currentHike.trail_id ? ' current' : ''}" href="hike.html?id=${h.trail_id}">${formatHikeDate(h.date_completed, { month: 'short', day: 'numeric', year: 'numeric' })}</a>`
    ).join('');
    return `
        <button class="fc-close" type="button" title="Close">&#10005;</button>
        ${bannerHtml}
        <div class="fc-body">
            <div class="fc-title">${rep.trail_name}</div>
            <div class="fc-loc">${rep.location} &bull; ${rep.region}</div>
            ${statsHtml}
            ${withHtml}
            <div class="fc-visits">
                <span class="fc-visits-label">${visitsLabel}</span>
                <div class="fc-stamps">${stampsHtml}</div>
            </div>
            <a class="fc-open-log" href="hike.html?id=${rep.trail_id}">Open the Field Log &rarr;</a>
        </div>`;
}

function showFieldCard(hikesForTrail, currentHike) {
    const trailName = hikesForTrail[0].trail_name;
    cardTrailName = trailName;
    const rep = currentHike || [...hikesForTrail].sort(compareHikesChronoDesc)[0];
    const yearColor = ATLAS_CONFIG.COLOR_MAP[hikeYear(rep).toString()] || ATLAS_CONFIG.DEFAULT_COLOR;
    fieldCardEl.style.setProperty('--fc-color', yearColor);
    fieldCardEl.innerHTML = buildFieldCardHtml(hikesForTrail, currentHike);
    fieldCardEl.classList.add('show');
    const photo = fieldCardEl.querySelector('.fc-banner-photo');
    if (photo) {
        if (photo.complete && photo.naturalWidth) photo.classList.add('loaded');
        else photo.addEventListener('load', () => photo.classList.add('loaded'), { once: true });
    }
    fieldCardEl.querySelector('.fc-close').addEventListener('click', () => closeFieldCard());
    spotlightTrailName = trailName;
    applySpotlight();
    markActiveRow(trailName);
}

function closeFieldCard() {
    cardTrailName = null;
    fieldCardEl.classList.remove('show');
    spotlightTrailName = null;
    applySpotlight();
    markActiveRow(null);
}

function markActiveRow(trailName) {
    document.querySelectorAll('.trail-list-item.active').forEach(i => i.classList.remove('active'));
    const ref = trailName && layerReferences[trailName];
    if (ref && ref.row) ref.row.classList.add('active');
}

// ===========================================================================
// THE SHEET — the light table's quick glance, risen over the land
// (The Continuous Expedition, stage 1). Free-exploration clicks raise it in
// place of the old docked field card: the camera frames the trail into the
// strip the sheet leaves open, the land stays alive behind it (the acetate
// walks a marker on the real trail out there), and lowering it returns the
// camera to where it stood. ?sheet=tta_NN keeps every risen sheet shareable.
// ===========================================================================
const sheetRiseEl = document.getElementById('sheet-rise');
const sheetBodyEl = document.getElementById('ms-sheet');
let sheetHikeId = null;          // trail_id of the hike the sheet is showing
let sheetCameraBefore = null;    // where the land stood before the first raise
let sheetWalker = null;          // the acetate's marker on the land
let elevProfiles = null;         // data/elevations.json, fetched on first raise

async function ensureElevations() {
    if (!elevProfiles) {
        elevProfiles = await fetch('data/elevations.json').then(r => r.json()).catch(() => ({}));
    }
    return elevProfiles;
}

/** The camera's frame while a sheet is up: the trail owns the left strip. */
function sheetFramePadding() {
    const w = sheetRiseEl.getBoundingClientRect().width || Math.min(700, window.innerWidth * 0.5);
    return {
        paddingTopLeft: L.point(56, 76),
        paddingBottomRight: L.point(w + 40, 44)
    };
}

/** "Name (Latin) — fact" in one condensed line for the sheet. */
function sheetFfLine(text) {
    if (!text) return '';
    const m = text.match(/^\s*(.+?)\s*\(([^)]+)\)\s*(?:[—–-]\s*)?([\s\S]*)$/);
    return m ? `<b>${m[1]}</b> <i>(${m[2]})</i> — ${m[3].trim()}` : text;
}

function buildSheetHtml(sorted, rep) {
    const isVp = isViewpoint(rep);
    const verb = isVp ? 'Visited' : 'Hiked';
    const stampsHtml = sorted.length > 1
        ? `<div class="ms-visits"><span class="ms-visits-label">${verb.toUpperCase()} ${sorted.length} TIMES</span>` +
          sorted.map(h => `<button class="ms-stamp${h.trail_id === rep.trail_id ? ' current' : ''}" data-id="${h.trail_id}">
              ${formatHikeDate(h.date_completed, { month: 'short', day: 'numeric', year: 'numeric' })}</button>`).join('') +
          `</div>`
        : '';
    const vitals = [];
    if (!(isVp && !rep.miles)) {
        vitals.push([rep.miles, 'Miles'], [rep.elevation_gain.toLocaleString(), 'Feet climbed']);
    }
    if (rep.summit_trail && rep.summit_elevation) vitals.push([rep.summit_elevation.toLocaleString(), 'Summit (ft)']);
    if (!(isVp && !rep.miles)) vitals.push([rep.difficulty, 'Grade']);
    const withLine = (rep.hiked_with && rep.hiked_with.length)
        ? `With ${rep.hiked_with.join(', ')}` : 'Walked solo';
    const printsHtml = (rep.images || []).slice(0, 6).map((id, i) =>
        `<div class="ms-print" data-id="${rep.trail_id}">
            <img src="${cloudinaryUrl(id, 'w_320,h_214,c_fill,q_auto,f_auto')}" alt="Hike photo ${i + 1}" loading="lazy">
            <div class="no">${String(i + 1).padStart(2, '0')}</div></div>`).join('');
    const ff = [sheetFfLine(rep.flora), sheetFfLine(rep.fauna)].filter(Boolean).join('<br>');
    return `
        <div class="ms-actions">
            <button class="ms-lower" type="button" title="Lower the sheet (Esc)">
                <svg viewBox="0 0 12 12"><path d="M2 4l4 4 4-4"/></svg> LOWER THE SHEET
            </button>
            <button class="ms-play" type="button" title="Watch the expedition roll on from this hike">
                <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 2l7 4-7 4z"/></svg> PLAY FROM HERE
            </button>
        </div>
        <div class="ms-collar">
            <div class="ms-kicker">THE TRAILPRINT ATLAS · SHEET NO. ${rep.trail_id.replace('tta_', '')} · ${rep.hike_type.toUpperCase()}</div>
            <h2 class="ms-title">${rep.trail_name}</h2>
            <div class="ms-sub">${rep.location} — ${rep.region} · ${verb} ${formatHikeDate(rep.date_completed)}</div>
            <div class="ms-with">${withLine}</div>
            ${stampsHtml}
        </div>
        ${vitals.length ? `<div class="ms-vitals">${vitals.map(([v, l]) =>
            `<div class="ms-vital"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}</div>`
            : `<div class="ms-vitals"><div class="ms-vital"><div class="v">A SCENIC VIEWPOINT</div></div></div>`}
        <div class="ms-acetate" id="ms-acetate" style="display:none">
            <div class="ms-a-label"><span>THE SHAPE OF THE DAY</span>
                <span class="aside">scrub — the marker walks the land behind this sheet</span>
                <span class="readout" id="ms-a-readout"></span></div>
            <div class="ms-a-chart" id="ms-a-chart"><div class="ms-a-hair" id="ms-a-hair"></div></div>
        </div>
        ${printsHtml ? `<div class="ms-k">The Slides</div><div class="ms-prints">${printsHtml}</div>` : ''}
        ${rep.description ? `<div class="ms-k">Trail Notes</div><p class="ms-notes">${formatHikeText(rep.description)}</p>` : ''}
        ${ff ? `<p class="ms-ff">${ff}</p>` : ''}
        <a class="ms-bridge" href="hike.html?id=${rep.trail_id}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6 16 12l-6 6"/><path d="M4 4v16"/></svg>
            <span class="ms-bridge-copy">
                <span class="ms-bridge-main">OPEN THE FULL FIELD LOG</span>
                <span class="ms-bridge-sub">the whole day &mdash; the map, every slide &amp; the almanac</span>
            </span>
        </a>`;
}

/** Wires the acetate to the land: the profile drawn in the year's ink, and a
    scrub marker that walks the REAL trail behind the sheet. */
async function wireSheetAcetate(rep) {
    const profiles = await ensureElevations();
    // the visitor may have flipped sheets while the fetch was in flight
    if (sheetHikeId !== rep.trail_id) return;
    const profile = profiles[rep.trail_id];
    const segs = allTrailGeometries[rep.trail_id];
    const acetate = document.getElementById('ms-acetate');
    if (!profile || !segs || !acetate) return;

    const latlngs = [];
    segs.forEach(seg => seg.forEach(p => latlngs.push(p)));
    if (latlngs.length < 2) return;

    const ink = yearColorOf(rep);
    const W = 1000, H = 76, P = 5, B = H - 4;
    const mn = Math.min(...profile), mx = Math.max(...profile);
    const pts = profile.map((v, i) =>
        `${(P + (W - 2 * P) * i / (profile.length - 1)).toFixed(1)},${(B - (B - P) * (v - mn) / ((mx - mn) || 1)).toFixed(1)}`).join(' ');
    const chart = document.getElementById('ms-a-chart');
    chart.insertAdjacentHTML('afterbegin',
        `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
            <polygon points="${P},${B} ${pts} ${W - P},${B}" fill="${ink}" opacity="0.14"/>
            <polyline points="${pts}" fill="none" stroke="${ink}" stroke-width="2" vector-effect="non-scaling-stroke"/>
         </svg>`);
    acetate.style.display = '';

    // cumulative distance -> honest position along the real trail
    const cum = [0];
    for (let i = 1; i < latlngs.length; i++) {
        const dx = (latlngs[i][1] - latlngs[i - 1][1]) * Math.cos(latlngs[i][0] * Math.PI / 180);
        const dy = latlngs[i][0] - latlngs[i - 1][0];
        cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    const total = cum[cum.length - 1];
    const ptAt = f => {
        const t = f * total;
        for (let i = 1; i < cum.length; i++) if (cum[i] >= t) {
            const s = (t - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
            return [latlngs[i - 1][0] + (latlngs[i][0] - latlngs[i - 1][0]) * s,
                    latlngs[i - 1][1] + (latlngs[i][1] - latlngs[i - 1][1]) * s];
        }
        return latlngs[latlngs.length - 1];
    };

    const hair = document.getElementById('ms-a-hair');
    const readout = document.getElementById('ms-a-readout');
    acetate.addEventListener('mousemove', (e) => {
        const r = chart.getBoundingClientRect();
        const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        hair.style.visibility = readout.style.visibility = 'visible';
        hair.style.left = (f * 100) + '%';
        const i = Math.round(f * (profile.length - 1));
        readout.textContent = `MILE ${(f * rep.miles).toFixed(1)} · ${profile[i].toLocaleString()} FT`;
        if (!sheetWalker) sheetWalker = L.circleMarker(latlngs[0], {
            radius: 7, color: '#fff', weight: 2, fillColor: '#c0392b', fillOpacity: 1,
            interactive: false, pane: 'mainTrailPane', renderer: trailRenderer
        }).addTo(map);
        sheetWalker.setLatLng(ptAt(f));
    });
    acetate.addEventListener('mouseleave', () => {
        hair.style.visibility = readout.style.visibility = 'hidden';
        if (sheetWalker) { map.removeLayer(sheetWalker); sheetWalker = null; }
    });
}

function syncSheetUrl(id) {
    const params = new URLSearchParams(window.location.search);
    if (id) params.set('sheet', id); else params.delete('sheet');
    const qs = params.toString();
    history.pushState({ sheet: id || null }, '', location.pathname + (qs ? '?' + qs : ''));
}

/**
 * Raises the sheet for a trail (optionally pinned to one specific visit).
 * Handles what focusTrail used to: halts playback, walks time forward so the
 * trail exists on the land, spotlights it, and frames it into the open strip.
 */
function raiseSheet(ref, hike, { instant = false, pushUrl = true, cold = false } = {}) {
    const sorted = [...ref.group].sort(compareHikesChronoDesc);
    // Time-aware: the sheet shows the newest visit that exists at the
    // timeline's current moment — standing in 2022, Barker Dam's sheet is
    // the 2022 walk in the 2022 ink, not a spoiler from 2025. The date
    // stamps still reach every other visit. If NO visit has arrived yet
    // (a finder click on a future trail), the FIRST visit is the sheet and
    // time walks forward to it below.
    const rep = hike
        || sorted.find(h => (legIndexById[h.trail_id] ?? Infinity) <= inkIx)
        || sorted[sorted.length - 1];
    if (playing) haltPlayback();
    closeFieldCard();

    // Opening a hike is "go to this hike": the map's moment moves to it, in
    // EITHER direction (backward too, not only to lay a future trail's ink), so
    // the timeline marker — expanded and condensed — the reveal, the preview,
    // and the resume point all land on this hike. That's what makes leafing
    // around feel live and makes "play from here" a continuation, not a jump.
    // Remember where the land stood so "lower the sheet" can return there —
    // but only for a live click. A COLD raise (a page boot: a shared ?sheet=
    // link, or the return-from-log restore) has no meaningful "before": the
    // map is showing the wide default at that instant, and capturing it would
    // fling the camera out to the whole continent on lower. Cold raises set
    // this explicitly (the restore, from the saved handshake) or leave it null
    // (a deep link), so lowering simply stays framed on the trail.
    if (!sheetHikeId && !cold) sheetCameraBefore = { center: map.getCenter(), zoom: map.getZoom() };
    sheetHikeId = rep.trail_id;
    if (typeof AtlasChain !== 'undefined') AtlasChain.setLocked(true);   // timeline goes static while reading
    dismissResumeHint();
    spotlightTrailName = ref.name;
    markActiveRow(ref.name);
    if (pushUrl) syncSheetUrl(rep.trail_id);

    // Commit the card: swap in this hike's content, wire it, and raise the sheet.
    // On a blink this runs behind the veil (below) so the card and the fully-inked
    // trail appear together over ground that has finished loading — never popping
    // in while the map is still repositioning. (A sheet already up simply keeps
    // showing the old hike until the new one lands.)
    const commit = () => {
        if (sheetHikeId !== rep.trail_id) return;   // a newer raise superseded us
        sheetBodyEl.innerHTML = buildSheetHtml(sorted, rep);
        sheetBodyEl.scrollTop = 0;
        sheetBodyEl.querySelector('.ms-lower').addEventListener('click', () => lowerSheet());
        sheetBodyEl.querySelectorAll('.ms-stamp').forEach(btn => btn.addEventListener('click', () => {
            const h = ref.group.find(x => x.trail_id === btn.dataset.id);
            if (h) raiseSheet(ref, h);
        }));
        sheetBodyEl.querySelectorAll('.ms-print').forEach(p => p.addEventListener('click', () => {
            saveLandState();
            window.location.href = `hike.html?id=${p.dataset.id}`;
        }));
        sheetBodyEl.querySelector('.ms-bridge').addEventListener('click', saveLandState);
        // "Play from here" drops the tour into gear from this hike; opening a
        // trail is also how you answer the resume cue, so it retires when you do.
        const playBtn = sheetBodyEl.querySelector('.ms-play');
        if (playBtn) playBtn.addEventListener('click', () => playFromHike(rep.trail_id));
        // each slide develops when its own frame arrives (same treatment as the
        // hike page's strip) — cached images are already complete here
        sheetBodyEl.querySelectorAll('.ms-print img').forEach(img => {
            const mount = img.closest('.ms-print');
            const develop = () => mount.classList.add('loaded');
            if (img.complete && img.naturalWidth) develop();
            else {
                img.addEventListener('load', develop, { once: true });
                img.addEventListener('error', develop, { once: true });
            }
        });
        sheetRiseEl.classList.add('up');
        document.body.classList.add('sheet-open');
        wireSheetAcetate(rep);
    };

    // Everything the eye would see change — the timeline moment stepping to this
    // hike, its ink revealing, the deck, the spotlight, the camera reframing (an
    // INSTANT fit, never a flight), and the card itself — happens together in
    // land(). When the camera has to move, land() runs behind the veil so the map
    // only ever appears finished; when the trail is already on screen, it runs in
    // the open (nothing to hide, so no blink).
    const pad = sheetFramePadding();
    const land = () => {
        const legIxOf = legIndexById[rep.trail_id];
        if (legIxOf !== undefined && legIxOf !== inkIx) {
            inkIx = legIxOf;
            nowT = legs[inkIx].t;
            legIx = inkIx;
            syncScrub();
            applyReveal();
            updateDeck();
        }
        applySpotlight();
        // prime the deck's preview so closing the sheet reveals this hike (name
        // and all), not a stale card from wherever the playhead last sat
        previewPlaque(rep);
        frameLayer(ref, { instant: true, padding: pad });
        commit();
    };
    if (!instant && cameraWillMove(ref, pad)) blinkTo(land);
    else land();
}

/**
 * Lowers the sheet. restoreCamera returns the land to where it stood before
 * the first raise (the pull + Esc); a bare-land click lowers in place, since
 * that click usually means "let me look around here".
 */
function lowerSheet({ pushUrl = true } = {}) {
    if (!sheetHikeId) return;
    sheetHikeId = null;
    if (typeof AtlasChain !== 'undefined') AtlasChain.setLocked(false);   // the timeline is live again
    sheetRiseEl.classList.remove('up');
    document.body.classList.remove('sheet-open');
    if (sheetWalker) { map.removeLayer(sheetWalker); sheetWalker = null; }
    spotlightTrailName = null;
    applySpotlight();
    markActiveRow(null);
    if (pushUrl) syncSheetUrl(null);
    // Lowering leaves you exactly where you are — on the hike you opened — to
    // explore or pick another to resume from. (The old "fly back to where you
    // were before" yanked you off an earlier hike whose ink had rolled back.)
    sheetCameraBefore = null;
}

window.addEventListener('popstate', (e) => {
    const id = e.state && e.state.sheet;
    if (id) {
        const h = hikesById[id];
        const ref = h && layerReferences[h.trail_name];
        if (ref) raiseSheet(ref, h, { pushUrl: false });
    } else {
        lowerSheet({ pushUrl: false });
    }
});

/**
 * The handshake with the full hike page. Stepping through to the Field Log
 * photographs the land as it stands — camera, moment, basemap, risen sheet —
 * and the hike page's "Return to the Land" door hands it back via
 * map.html?restore=land, which restores all of it exactly.
 */
function saveLandState() {
    try {
        const c = map.getCenter();
        // preSheet: where the land stood BEFORE this sheet rose, so a lowered
        // sheet on the restored page returns to the same spot the live map
        // would have — not the wide boot default.
        const pre = sheetCameraBefore
            ? { lat: sheetCameraBefore.center.lat, lng: sheetCameraBefore.center.lng, zoom: sheetCameraBefore.zoom }
            : null;
        sessionStorage.setItem('atlasLandState', JSON.stringify({
            lat: c.lat, lng: c.lng, zoom: map.getZoom(),
            basemap: currentBasemap, inkIx, sheet: sheetHikeId, preSheet: pre, at: Date.now()
        }));
    } catch (e) { /* private-mode storage refusal only costs the shortcut */ }
}

/** The saved handshake, if it exists and is fresh enough to trust. */
function freshLandState() {
    let s = null;
    try { s = JSON.parse(sessionStorage.getItem('atlasLandState')); } catch (e) { return null; }
    if (!s || !s.at || Date.now() - s.at > 6 * 3600 * 1000) return null;
    return s;
}

function restoreLandState() {
    const s = freshLandState();
    if (!s) return false;
    try { if (s.basemap && s.basemap !== currentBasemap) setBasemap(s.basemap); } catch (e) { /* wardrobe stays */ }
    if (typeof s.inkIx === 'number' && legs.length) {
        inkIx = Math.max(0, Math.min(legs.length - 1, s.inkIx));
        legIx = inkIx;
        nowT = legs[inkIx].t;
        applyReveal();
        if (legs[inkIx]) previewPlaque(legs[inkIx].h);   // preview the restored moment
        // the chain is the clock: park it on the restored moment so returning
        // from a hike page resumes exactly where the animation stood, not the
        // whole-Atlas end. ('auto' scroll suppresses its own onScrub feedback.)
        if (typeof AtlasChain !== 'undefined') AtlasChain.scrollToHike(legs[inkIx].h.trail_id, 'auto');
    }
    if (s.sheet && hikesById[s.sheet] && layerReferences[hikesById[s.sheet].trail_name]) {
        const h = hikesById[s.sheet];
        // cold raise: don't let it capture the wide boot view as the return
        // camera — restore the TRUE pre-sheet spot from the handshake instead,
        // so "lower the sheet" returns to where the visitor was roaming, not
        // out to the whole continent. No preSheet (they'd deep-linked in) means
        // lowering just stays framed on the trail.
        raiseSheet(layerReferences[h.trail_name], h, { instant: true, pushUrl: false, cold: true });
        sheetCameraBefore = s.preSheet
            ? { center: L.latLng(s.preSheet.lat, s.preSheet.lng), zoom: s.preSheet.zoom }
            : null;
        history.replaceState({ sheet: h.trail_id }, '',
            location.pathname + '?sheet=' + h.trail_id);
        // Belt and braces: the boot also runs an ANIMATED whole-Atlas fit
        // (renderMapLayers' tail), and depending on browser timing its
        // completion can land AFTER this instant frame and shove the camera
        // back to the wide view — the sheet up, the land fully zoomed out.
        // Once the boot settles, verify and re-assert; frameLayer no-ops
        // when the camera is already right.
        const assertFrame = () => {
            if (sheetHikeId !== h.trail_id) return;
            const ref = layerReferences[h.trail_name];
            if (ref) frameLayer(ref, { instant: true, padding: sheetFramePadding() });
        };
        setTimeout(assertFrame, 350);
        setTimeout(assertFrame, 1200);
    } else if (typeof s.lat === 'number') {
        map.setView([s.lat, s.lng], s.zoom, { animate: false });
    }
    return true;
}

// ===========================================================================
// THE SURVEYOR'S CHAIN — the map's one clock (scripts/atlas-chain.js). Scrolling
// it scrubs nowT and un-inks the land; clicking a mark raises that sheet. The
// deck's year-banded scrub retires; its plaque + transport stay as the console.
// The chain is self-contained: map.js only plugs into it at these seams —
// bootSpine (init), syncScrub (scrollToTime), applyReveal (setReveal),
// restoreLandState (scrollToTime), start/endExpedition (forceOpen).
// ===========================================================================
function bootSpine(hikes) {
    if (typeof AtlasChain === 'undefined' || !document.getElementById('atlas-chain')) return;
    AtlasChain.init({
        container: 'atlas-chain',
        hikes,
        onSelect: (h) => {
            const ref = layerReferences[h.trail_name];
            if (ref) raiseSheet(ref, h);
        },
        onScrub: (t) => {
            // the engine owns the clock during cinema; a raised sheet has
            // pinned its own moment — otherwise the centre of the chain IS nowT
            if (mode !== 'free' || playing || sheetHikeId) return;
            scrubRevealToTime(t);
        }
    });
    // sync the initial reveal (opens on the present, everything inked)
    AtlasChain.setReveal(nowT, legs.length ? legs[legs.length - 1].h.trail_id : null);
}

/** Scrub the reveal to a moment: ink every leg walked at or before it. Legs
    are time-sorted, so the last one at or before `t` is the newest visible. */
function scrubRevealToTime(t) {
    const tt = Math.max(t0, Math.min(t1, t));
    let ix = -1;
    for (let i = 0; i < legs.length; i++) { if (legs[i].t <= tt) ix = i; else break; }
    inkIx = Math.max(0, ix);
    legIx = inkIx;
    nowT = tt;
    holdLegId = null;
    applyReveal();
    // scrubbing in free mode previews the hike under the playhead in the deck —
    // the name is right there as you slide, and the tour picks up from it
    if (!playing && legs[inkIx]) previewPlaque(legs[inkIx].h);
}

// --- Framing: fit a trail into the open space beside the card + deck.
//     Every frame precedes a card, so the left padding always reserves its
//     column — the trail centers itself in the space that remains. ---
const FRAME_MAX_ZOOM = 16;   // free-mode clicks frame as close as the expedition's shots
function cardFramePadding() {
    return {
        paddingTopLeft: L.point(356, 76),
        paddingBottomRight: L.point(46, 140)
    };
}

/** The bounds a trail (or viewpoint) will be framed to. */
function refTargetBounds(ref) {
    if (ref.bounds && ref.bounds.isValid()) {
        // a lone point (viewpoint) frames its neighborhood, not a pinprick
        if (ref.bounds.getSouthWest().equals(ref.bounds.getNorthEast())) {
            return ref.bounds.getCenter().toBounds(900);
        }
        return ref.bounds;
    }
    return null;
}

/**
 * Frames a target. Flight durations are distance-aware (Leaflet's own flyTo
 * pacing): neighboring trails are a quick hop, cross-country legs take a
 * longer, statelier arc — and the tiles get a head start via prefetchTiles.
 * Returns 'noop' when the camera is already there, so callers can skip
 * waiting for a moveend that will never come.
 */
function frameLayer(ref, { instant = false, padding = null } = {}) {
    const b = refTargetBounds(ref);
    if (!b) return false;
    const pad = padding || cardFramePadding();
    const opts = { ...pad, maxZoom: FRAME_MAX_ZOOM };
    if (map._getBoundsCenterZoom) {
        const cz = map._getBoundsCenterZoom(b, opts);
        if (map.getZoom() === cz.zoom && map.getCenter().distanceTo(cz.center) < 2) return 'noop';
    }
    prefetchTiles(b, opts);
    if (instant) map.fitBounds(b, { ...opts, animate: false });
    else map.flyToBounds(b, opts);
    return true;
}

/** Will framing this trail actually move the camera? (Same test frameLayer uses
    for its 'noop' — pulled out so a caller can decide to dim the ink BEFORE it
    frames, without a stale dim flickering on a hike that's already on screen.) */
function cameraWillMove(ref, padding) {
    const b = refTargetBounds(ref);
    if (!b) return false;
    if (!map._getBoundsCenterZoom) return true;
    const cz = map._getBoundsCenterZoom(b, { ...(padding || cardFramePadding()), maxZoom: FRAME_MAX_ZOOM });
    return map.getZoom() !== cz.zoom || map.getCenter().distanceTo(cz.center) >= 2;
}

// --- The ink pane: always at full -------------------------------------------
// The trail ink used to be dimmed and faded around live camera flights. Now that
// navigation cuts behind the veil (blinkTo) — the map only ever reappears once
// it's finished — there is no in-flight dim to manage: the ink simply stays at
// full. endInkFlight() is kept as a cheap belt-and-suspenders reset the
// expedition's entry/reset call, guaranteeing a render never lands faint.
function inkPane() { return map.getPane('mainTrailPane'); }
function endInkFlight() {
    const p = inkPane();
    p.style.transition = 'none';
    p.style.opacity = '1';
    p.style.willChange = 'auto';
}

// --- Tile warming: pull tiles into the browser's cache BEFORE they're needed
//     on screen, so an arrival (or the next zoom step) resolves all at once
//     instead of patchworking in. `new Image().src` fires the request; the CDN
//     answer sits in cache, and Leaflet's real request moments later is a cache
//     hit. Two callers lean on this: the blink's landing viewport, and the
//     predictive neighbour-zoom warmer below. ---
function warmTilesAt(center, zoom, spread = 1) {
    if (zoom < 0 || !map._getBoundsCenterZoom) return;
    const half = map.getSize().multiplyBy(spread / 2);
    BASEMAPS[currentBasemap].tiles.forEach((opacity, layer) => {
        if ((layer.options.maxNativeZoom || 99) <= 6) return;   // underlays keep themselves warm
        const z = Math.min(zoom, layer.options.maxNativeZoom || layer.options.maxZoom || zoom);
        if (z < 0) return;
        const pc = map.project(center, z);
        const nw = map.unproject(pc.subtract(half), z);
        const se = map.unproject(pc.add(half), z);
        const n = Math.pow(2, z);
        const tx = lng => Math.floor((lng + 180) / 360 * n);
        const ty = lat => {
            const rad = lat * Math.PI / 180;
            return Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n);
        };
        const x1 = tx(nw.lng), x2 = tx(se.lng), y1 = ty(nw.lat), y2 = ty(se.lat);
        if ((x2 - x1 + 1) * (y2 - y1 + 1) > 64) return;   // a huge area isn't worth warming
        const subs = layer.options.subdomains || 'abc';
        let i = 0;
        for (let x = x1; x <= x2; x++) {
            for (let y = y1; y <= y2; y++) {
                if (y < 0 || y >= n) continue;             // above the pole / off-world: no such tile (a 400)
                const wx = ((x % n) + n) % n;              // longitude wraps the globe; keep x in range
                new Image().src = L.Util.template(layer._url, {
                    s: subs[(i++) % subs.length], z, x: wx, y,
                    r: L.Browser.retina ? '@2x' : ''
                });
            }
        }
    });
}

/** Warm the exact viewport a fitBounds landing will show (the blink's arrival,
    and each ranger leg during its dwell). */
function prefetchTiles(bounds, fitOpts) {
    if (!bounds || !map._getBoundsCenterZoom) return;
    const target = map._getBoundsCenterZoom(bounds, fitOpts || { ...cardFramePadding(), maxZoom: FRAME_MAX_ZOOM });
    warmTilesAt(target.center, Math.round(target.zoom), 1);
}

// --- Predictive neighbour-zoom warming: always a step ahead of the wheel -----
// The crisp-centre-with-a-blurry-halo just after a manual zoom is pure latency —
// the new level's tiles haven't downloaded yet. So the moment the map comes to
// REST we quietly warm one level IN and one level OUT for the current view (a
// touch wider than the screen) into the cache. Whichever way the wheel turns
// next, the tiles are already there and the step lands sharp instead of
// resolving in. Debounced so a flurry of wheel steps warms once, at the finish;
// idle-only so it never competes with the tiles the screen is actively loading.
let warmTimer = null;
function warmNeighbourZooms() {
    clearTimeout(warmTimer);
    warmTimer = setTimeout(() => {
        if (playing) return;                 // the tour warms its own next leg
        const c = map.getCenter(), z = map.getZoom();
        warmTilesAt(c, z + 1, 1.1);          // the zoom-IN detail, slightly wider
        warmTilesAt(c, z - 1, 1.1);          // the zoom-OUT surround
    }, 350);
}
map.on('zoomend moveend', warmNeighbourZooms);

/** Click a trail (on the map or in the register): spotlight + card + frame. */
function focusTrail(trailName) {
    // clicking a trail (or a finder row) raises its sheet over the land —
    // the sheet handles the halt, the time-walk, the spotlight, the frame
    const ref = layerReferences[trailName];
    if (!ref) return;
    raiseSheet(ref);
}

// ===========================================================================
// The expedition engine — Chapters of the Land + the Expedition Line
// (grafted from mockups/map-chapters.html after Danny's approval, July 2026).
//
// One camera rule with zero exceptions: the camera is always either PARKED
// on a scene or CUTTING behind the veil, which lifts only when every tile
// sheet reports itself loaded. All on-screen motion belongs to the ink: the
// pen drawing a trail, the Expedition Line traveling between chapters.
//
// The airtight structure, from the data itself:
//   CHAPTER — a tagged trip that truly left home, a home stretch between
//             trips, or a lone far-away day hike (a sortie). Distance
//             overrides trip tags: a local overnight is still home.
//   SCENE   — consecutive legs sharing one location tag: one parked frame.
// ===========================================================================
let mode = 'free';              // 'free' | 'expedition'
let playing = false;
let legIx = -1;
let holdLegId = null;           // suppresses one visit's ink until its draw lands
// When you escape the tour early it pauses IN PLACE (camera + reveal held). The
// paused POSITION is simply inkIx — the newest inked leg — so opening an earlier
// trail (which walks the reveal back to it) moves the resume point with it. This
// flag just marks that a paused tour is waiting to be picked up.
let tourPaused = false;
let expToken = 0;
const cancelRun = () => { expToken++; };
const DWELL_MS = 3000;
const DWELL_VIEWPOINT_MS = 1700;
const SORTIE_KM = 73;           // past Mugu Peak (71 km), inside Black Star (76 km)
const SCENE_FRAME = { paddingTopLeft: L.point(44, 64), paddingBottomRight: L.point(44, 208), maxZoom: 13 };

const veilEl = document.getElementById('veil');
const veilTextEl = document.getElementById('veil-text');
const plaqueEl = document.getElementById('deck-plaque');
const lgInnerEl = document.getElementById('lg-inner');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ROMAN = n => {
    const T = [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let out = ''; T.forEach(([v, s]) => { while (n >= v) { out += s; n -= v; } }); return out;
};
const havKm = (a, b) => {
    const R = 6371, r = Math.PI / 180;
    const dp = (b[0] - a[0]) * r, dl = (b[1] - a[1]) * r;
    const s = Math.sin(dp / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
};
// round BEFORE wrapping to 0..7 — a near-due-east angle rounds to 8
const bearing8 = (a, b) => ['east', 'northeast', 'north', 'northwest', 'west', 'southwest', 'south', 'southeast']
    [Math.round((Math.atan2(b[0] - a[0], (b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180))) / (Math.PI / 4) + 8) % 8];
const monthOfHike = h => { const d = new Date(h.date_completed); return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const lastLegAt = t => { let ix = -1; for (let i = 0; i < legs.length; i++) { if (legs[i].t <= t) ix = i; else break; } return ix; };
const yearColorOf = h => ATLAS_CONFIG.COLOR_MAP[String(hikeYear(h))] || ATLAS_CONFIG.DEFAULT_COLOR;

function setCinema(on) {
    document.querySelector('.map-shell').classList.toggle('cinema', on);
    // the chain holds open as the playhead through cinema, and releases to its
    // idle collapse when the film ends or the visitor takes the wheel
    if (typeof AtlasChain !== 'undefined') AtlasChain.forceOpen(on);
}

// --- the veil: every cut happens behind it, and it lifts only when the
//     visible tile sheets report themselves loaded ---
function waitTiles(timeout = 2600) {
    return new Promise(res => {
        requestAnimationFrame(() => {
            const pending = ALL_TILE_LAYERS.filter(l => (l.options.opacity || 0) > 0 && l.isLoading());
            if (!pending.length) return res();
            // Clean up on BOTH paths: a `once('load')` that never fires (the
            // common case when the timeout wins) stays wired to the tile layer
            // forever, and across an expedition's ~100 veil cuts those dangling
            // listeners pile up. Register with on/off and always detach.
            let n = pending.length, settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                pending.forEach(l => l.off('load', done));
                res();
            };
            const done = () => { if (--n === 0) finish(); };
            pending.forEach(l => l.on('load', done));
            const timer = setTimeout(finish, timeout);
        });
    });
}
async function veilIn(html, hold = 650) {
    veilTextEl.innerHTML = html || '';
    veilEl.classList.add('on');
    await sleep(550 + (html ? hold : 0));
}
async function veilOut() { veilEl.classList.remove('on'); await sleep(560); }
/** The soft cut: a quick textless blink; the new framing loads behind it. */
async function softCut(applyView, tk) {
    veilEl.classList.add('fast');
    veilTextEl.innerHTML = '';
    veilEl.classList.add('on');
    await sleep(320);
    if (tk !== expToken) { veilEl.classList.remove('on', 'fast'); return; }
    applyView();
    await waitTiles(2000);
    if (tk !== expToken) { veilEl.classList.remove('on', 'fast'); return; }
    veilEl.classList.remove('on');
    await sleep(320);
    veilEl.classList.remove('fast');
}

// --- The free-roam blink: navigation without a flight ------------------------
// Clicking a hike (on the timeline or on the map) never flies the camera across
// the land any more — that zoom-out-and-back was the page's most expensive and
// ugliest move (blurry mid-flight tiles, a whole-viewport re-raster every frame,
// worst of all at 4K). Instead we cut behind the same parchment veil the
// expedition uses: the veil covers the map, the new hike snaps into frame and
// its tiles load UNSEEN, then the veil lifts onto a finished view. `applyBehind`
// does all the reposition/reveal/card work while the paper hides it.
// A monotonic generation makes rapid clicks safe: a newer blink owns the screen,
// and the older one bows out without lifting the veil onto a half-loaded view.
let blinkGen = 0;
async function blinkTo(applyBehind) {
    const gen = ++blinkGen;
    veilEl.classList.add('fast');
    veilTextEl.innerHTML = '';
    veilEl.classList.add('on');
    await sleep(300);                       // the paper fully covers the map
    if (gen !== blinkGen) return;           // a newer blink took over the screen
    applyBehind();                          // reposition + reveal + card, all unseen
    await waitTiles(2000);                  // the landing's tiles resolve behind the veil
    if (gen !== blinkGen) return;
    veilEl.classList.remove('on');
    await sleep(320);
    if (gen === blinkGen) veilEl.classList.remove('fast');
}

// --- the structure: chapters, scenes, and shots, rebuilt with every render ---
let chapters = [], chapterOfLeg = [], scenes = [], sceneOfLeg = [], shots = [], shotOfLeg = [];
function buildExpedition() {
    chapters = []; chapterOfLeg = []; scenes = []; sceneOfLeg = [];
    threadAt.clear();
    threadGroup.clearLayers();
    if (!legs.length) return;
    const th = leg => {
        const s = allTrailGeometries[leg.h.trail_id];
        return s ? s[0][0] : [leg.h.latitude, leg.h.longitude];
    };
    legs.forEach(l => { l.head = th(l); });
    const med = arr => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    const src = legs.filter(l => !l.h.trip_tag);
    const anchor = src.length ? src : legs;
    const HOME_PT = [med(anchor.map(l => l.head[0])), med(anchor.map(l => l.head[1]))];
    // distance overrides trip tags: a tagged trip that never leaves the home
    // range (Mount Lowe, Cooper Canyon) stays in the home chapter
    const tripMaxKm = {};
    legs.forEach(l => {
        if (l.h.trip_tag) tripMaxKm[l.h.trip_tag] = Math.max(tripMaxKm[l.h.trip_tag] || 0, havKm(l.head, HOME_PT));
    });
    const kindOf = l => l.h.trip_tag
        ? (tripMaxKm[l.h.trip_tag] > SORTIE_KM ? 'trip' : 'home')
        : (havKm(l.head, HOME_PT) > SORTIE_KM ? 'sortie' : 'home');
    legs.forEach((l, i) => {
        const kind = kindOf(l);
        const key = kind === 'trip' ? l.h.trip_tag : (kind === 'sortie' ? 'sortie:' + l.h.trail_id : 'home');
        const last = chapters[chapters.length - 1];
        if (!last || last.key !== key) chapters.push({ key, kind, legIxs: [] });
        chapters[chapters.length - 1].legIxs.push(i);
        chapterOfLeg[i] = chapters.length - 1;
    });
    chapters.forEach(ch => {
        const first = legs[ch.legIxs[0]].h, last = legs[ch.legIxs[ch.legIxs.length - 1]].h;
        ch.name = ch.kind === 'trip' ? first.trip_tag.replace(/ - [^-]*$/, '')
            : ch.kind === 'sortie' ? first.location : 'Back Home';
        ch.sub = monthOfHike(first) === monthOfHike(last) ? monthOfHike(first) : `${monthOfHike(first)} – ${monthOfHike(last)}`;
    });
    legs.forEach((l, i) => {
        const last = scenes[scenes.length - 1];
        if (!last || last.chapter !== chapterOfLeg[i] || last.location !== l.h.location) {
            scenes.push({ chapter: chapterOfLeg[i], location: l.h.location, legIxs: [] });
        }
        scenes[scenes.length - 1].legIxs.push(i);
        sceneOfLeg[i] = scenes.length - 1;
    });
    scenes.forEach(sc => {
        const pts = [];
        sc.legIxs.forEach(i => {
            const s = allTrailGeometries[legs[i].h.trail_id];
            if (s) s.forEach(sg => sg.forEach(p => pts.push(p)));
            else pts.push(legs[i].head);
        });
        sc.bounds = L.latLngBounds(pts).pad(0.18);
    });
    // SHOTS: the camera's actual parking spots. A scene whose stops are
    // scattered (Joshua Tree spans a whole park) would force one soft, wide
    // frame — so consecutive scene legs merge into a shot only while their
    // union still frames tight (zoom 12 or closer). Lone stops get the
    // closest, crispest frame the padding allows.
    shots = []; shotOfLeg = [];
    const shotPad = L.point(
        SCENE_FRAME.paddingTopLeft.x + SCENE_FRAME.paddingBottomRight.x,
        SCENE_FRAME.paddingTopLeft.y + SCENE_FRAME.paddingBottomRight.y
    );
    const legShotBounds = i => {
        const s = allTrailGeometries[legs[i].h.trail_id];
        return s ? L.latLngBounds(s.flat()).pad(0.3) : L.latLng(legs[i].head).toBounds(900);
    };
    legs.forEach((l, i) => {
        const b = legShotBounds(i);
        const last = shots[shots.length - 1];
        if (last && last.scene === sceneOfLeg[i]) {
            const union = L.latLngBounds(last.bounds.getSouthWest(), last.bounds.getNorthEast()).extend(b);
            if (map.getBoundsZoom(union, false, shotPad) >= 12) {
                last.bounds = union;
                last.legIxs.push(i);
                shotOfLeg[i] = shots.length - 1;
                return;
            }
        }
        shots.push({ scene: sceneOfLeg[i], bounds: b, legIxs: [i] });
        shotOfLeg[i] = shots.length - 1;
    });
}
// One cap for every shot, and a close one: the bounds already say how big a
// shot is, so a wide cluster fits wide naturally, while anything tight — a
// lone trail, a viewpoint, a repeat retracing the same ground — earns a true
// close-up. z16 is the hillshade's native ceiling, so even the tightest frame
// stays crisp. (Capping by leg COUNT was tried and burned us: two same-trail
// repeat legs merged into a "multi" shot and got the wide-angle lens for a
// single trail's footprint.)
const shotFitOpts = () => ({ ...SCENE_FRAME, maxZoom: 16 });
const setShotView = ix => map.fitBounds(shots[shotOfLeg[ix]].bounds, { ...shotFitOpts(shotOfLeg[ix]), animate: false });
function viewMatchesShot(ix) {
    if (!map._getBoundsCenterZoom) return false;
    const si = shotOfLeg[ix];
    const t = map._getBoundsCenterZoom(shots[si].bounds, shotFitOpts(si));
    return map.getZoom() === t.zoom && map.getCenter().distanceTo(t.center) < 3;
}
const prefetchShot = si => { if (shots[si]) prefetchTiles(shots[si].bounds, shotFitOpts(si)); };

// --- journey lines: every chapter boundary owns one; syncThreads renders
//     the set exactly as it would look having watched through to leg ix ---
const threadGroup = L.layerGroup().addTo(map);
const threadAt = new Map();
const setThreads = on => map.getContainer().classList.toggle('threads-on', on);
function threadPts(a, b) {
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const d = [b[0] - a[0], b[1] - a[1]];
    const ctrl = [mid[0] - d[1] * 0.14, mid[1] + d[0] * 0.14];
    const pts = [];
    for (let i = 0; i <= 72; i++) {
        const t = i / 72, u = 1 - t;
        pts.push([u * u * a[0] + 2 * u * t * ctrl[0] + t * t * b[0], u * u * a[1] + 2 * u * t * ctrl[1] + t * t * b[1]]);
    }
    return pts;
}
function syncThreads(ix) {
    for (let i = 1; i < legs.length; i++) {
        if (chapterOfLeg[i] === chapterOfLeg[i - 1]) continue;
        const want = i <= ix;
        if (want && !threadAt.has(i)) {
            const line = L.polyline(threadPts(legs[i - 1].head, legs[i].head),
                { color: '#2f5c40', weight: 1.8, opacity: 0.3, dashArray: '7 7', interactive: false, pane: 'threadPane', renderer: threadRenderer }).addTo(threadGroup);
            threadAt.set(i, line);
        } else if (!want && threadAt.has(i)) {
            threadGroup.removeLayer(threadAt.get(i));
            threadAt.delete(i);
        }
    }
}
/** The Expedition Line: trailhead to trailhead, exactly where you went. The
    chain's playhead rides the SAME eased progress (fromId → toId), so the
    dashed line and the timeline cross the gap between chapters in lockstep. */
async function drawJourneyLine(a, b, tk, fromId = null, toId = null) {
    const pts = threadPts(a, b);
    const line = L.polyline([pts[0]], { color: '#2f5c40', weight: 2.6, opacity: 0.9, dashArray: '7 7', interactive: false, pane: 'threadPane', renderer: threadRenderer }).addTo(threadGroup);
    const pen = L.circleMarker(pts[0], { radius: 5, color: '#fffdf6', weight: 1.6, fillColor: '#2f5c40', fillOpacity: 1, pane: 'threadPane', renderer: threadRenderer }).addTo(map);
    const t0ms = performance.now(), dur = 1900;
    await new Promise(res => (function f(now) {
        if (tk !== expToken) return res();
        const t = Math.min(1, (now - t0ms) / dur);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const upto = Math.max(1, Math.round(e * pts.length));
        line.setLatLngs(pts.slice(0, upto));
        pen.setLatLng(pts[Math.min(upto, pts.length - 1)]);
        // only while the film is rolling: a manual step already parked the chain
        // on the target, so re-animating it would snap the playhead backward
        if (fromId && toId && playing && typeof AtlasChain !== 'undefined') AtlasChain.scrollBetween(fromId, toId, e);
        t >= 1 ? res() : requestAnimationFrame(f);
    })(t0ms));
    map.removeLayer(pen);
    line.setStyle({ opacity: 0.3, weight: 1.8 });   // it stays: the souvenir thread
    return line;
}

// --- performances: the pen draws the trail while the camera holds ---
async function drawTrailAnim(leg, tk) {
    const s = allTrailGeometries[leg.h.trail_id];
    const col = yearColorOf(leg.h);
    if (!s) { await pulsePoint(leg.head, col, tk); return []; }
    const all = s.flat();
    const dur = Math.min(2400, 1000 + (leg.h.miles || 1) * 130);
    const line = L.polyline([all[0]], { color: col, weight: 5, opacity: 0.85, pane: 'mainTrailPane', renderer: trailRenderer, interactive: false }).addTo(map);
    const pen = L.circleMarker(all[0], { radius: 5, color: '#fffdf6', weight: 1.6, fillColor: col, fillOpacity: 1, pane: 'mainTrailPane', renderer: trailRenderer }).addTo(map);
    const t0ms = performance.now();
    await new Promise(res => (function f(now) {
        if (tk !== expToken) return res();
        const t = Math.min(1, (now - t0ms) / dur);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const upto = Math.max(1, Math.round(e * all.length));
        line.setLatLngs(all.slice(0, upto));
        pen.setLatLng(all[Math.min(upto, all.length - 1)]);
        t >= 1 ? res() : requestAnimationFrame(f);
    })(t0ms));
    map.removeLayer(pen);
    return [line];
}
async function pulsePoint(ll, col, tk) {
    for (let k = 0; k < 2; k++) {
        if (tk !== expToken) return;
        const ring = L.circleMarker(ll, { radius: 6, color: col, weight: 2, fill: false, opacity: 0.8 }).addTo(map);
        const t0ms = performance.now(), dur = 620;
        await new Promise(res => (function f(now) {
            const t = Math.min(1, (now - t0ms) / dur);
            ring.setRadius(6 + t * 20); ring.setStyle({ opacity: 0.8 * (1 - t) });
            t >= 1 ? res() : requestAnimationFrame(f);
        })(t0ms));
        map.removeLayer(ring);
    }
}

// --- the field plaque: the ledger inside the deck, no photo by decision ---
function plaqueHtml(h) {
    const d = new Date(h.date_completed);
    const isVp = isViewpoint(h);
    return `
        <div class="lg-kicker">${h.hike_type} &middot; ${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}, ${d.getUTCFullYear()}</div>
        <div class="lg-name">${h.trail_name}</div>
        <div class="lg-loc">${h.location} &bull; ${h.region}</div>
        ${isVp ? `<div class="lg-stats">A scenic stop along the way. No miles inked.</div>`
               : `<div class="lg-stats">${h.miles} mi &middot; ${(h.elevation_gain || 0).toLocaleString()} ft gain &middot; ${h.difficulty}</div>`}
        ${h.hiked_with && h.hiked_with.length ? `<div class="lg-with">With ${h.hiked_with.join(', ')}</div>`
            : (h.hike_size === 'Solo' ? '<div class="lg-with">Walked solo</div>' : '')}
        <a class="lg-log" href="hike.html?id=${h.trail_id}">Open the Field Log &rarr;</a>`;
}
// which hike the plaque is currently showing, so scrubbing doesn't re-render
// the same card every frame
let plaquePreviewId = null;
async function setPlaque(h) {
    const html = plaqueHtml(h);
    if (!plaqueEl.classList.contains('dim') && lgInnerEl.innerHTML) {
        lgInnerEl.classList.add('swap');
        await sleep(240);
    }
    plaquePreviewId = h.trail_id;
    plaqueEl.style.setProperty('--lg', yearColorOf(h));
    lgInnerEl.innerHTML = html;
    plaqueEl.classList.remove('dim');
    lgInnerEl.classList.remove('swap');
}
/** Free-mode live preview: as you scrub or click a hike, the plaque names the
    hike under the playhead (no swap fade — it must keep up with a drag), so
    there's always a preview of where you are, and stepping into the tour from
    here feels continuous rather than a cold start. */
function previewPlaque(h) {
    if (!plaqueEl || !h || plaquePreviewId === h.trail_id) return;
    plaquePreviewId = h.trail_id;
    plaqueEl.style.setProperty('--lg', yearColorOf(h));
    lgInnerEl.innerHTML = plaqueHtml(h);
    lgInnerEl.classList.remove('swap');
    plaqueEl.classList.remove('dim');
}
const dimPlaque = () => plaqueEl.classList.add('dim');
function restPlaque() {
    plaquePreviewId = null;
    plaqueEl.classList.add('dim');
    plaqueEl.style.setProperty('--lg', '#d8ccae');
    lgInnerEl.innerHTML = `<div class="lg-kicker">The field ledger</div>
        <div class="lg-name">Every outing signs in here</div>
        <div class="lg-loc">as its trail draws on the land</div>`;
}

// --- the film itself ---
/**
 * The ceremony between chapters: one combined slide (direction, distance,
 * destination, date), the Expedition Line on the wide map, then a soft cut
 * into the new chapter's first scene. Scene changes inside a chapter are
 * just the blink — and so is snapping back after the visitor wandered.
 */
async function ceremony(prevIx, ix, tk) {
    const chNew = chapters[chapterOfLeg[ix]];
    const chOld = prevIx < 0 ? null : chapters[chapterOfLeg[prevIx]];
    if (chOld === chNew) {
        if ((prevIx >= 0 && shotOfLeg[prevIx] !== shotOfLeg[ix]) || !viewMatchesShot(ix)) {
            await softCut(() => setShotView(ix), tk);
        }
        return;
    }
    const outings = chNew.legIxs.length > 1 ? ` · ${chNew.legIxs.length} outings` : '';
    if (!chOld) {
        await veilIn(`<div class="veil-kicker">Chapter ${ROMAN(chapterOfLeg[ix] + 1)}</div>
            <div class="veil-title">${chNew.name}</div>
            <div class="veil-sub">${chNew.sub}${outings}</div>`, 1800);
        if (tk !== expToken) return;
        setShotView(ix);
        await waitTiles(); if (tk !== expToken) return;
        await veilOut();
        return;
    }
    const a = legs[prevIx].head, b = legs[ix].head;
    const miles = Math.round(havKm(a, b) * 0.621);
    dimPlaque();
    await veilIn(`<div class="veil-kicker">${chNew.kind === 'home' ? 'Homeward' : 'Onward'} · ${miles} miles ${bearing8(a, b)} · Chapter ${ROMAN(chapterOfLeg[ix] + 1)}</div>
        <div class="veil-title">${chNew.name}</div>
        <div class="veil-sub">${chNew.sub}${outings}</div>`, 2100);
    if (tk !== expToken) return;
    map.fitBounds(L.latLngBounds([a, b]).pad(0.4), { maxZoom: 9, animate: false });
    await waitTiles(); if (tk !== expToken) return;
    await veilOut(); if (tk !== expToken) return;
    if (threadAt.has(ix)) { threadGroup.removeLayer(threadAt.get(ix)); threadAt.delete(ix); }
    const line = await drawJourneyLine(a, b, tk, legs[prevIx].h.trail_id, legs[ix].h.trail_id);
    threadAt.set(ix, line);
    if (tk !== expToken) return;
    await sleep(420); if (tk !== expToken) return;
    await softCut(() => setShotView(ix), tk);
}

async function legSequence(prevIx, ix, tk, skipCeremony = false) {
    // skipCeremony: a clean resume already wiped to blank and framed this shot
    // behind its own blink, so re-running the ceremony would just double-cut
    if (!skipCeremony) { await ceremony(prevIx, ix, tk); if (tk !== expToken) return; }
    const leg = legs[ix];
    // the console flips the moment the new hike's pen touches the map
    nowT = leg.t;
    inkIx = ix;
    // hold only THIS visit's ink: on a repeat trail the earlier strokes stay
    // solid until the new drawing lands, then fade to echoes beneath it.
    // A viewpoint's dot shows immediately — the pulse rings around it.
    holdLegId = isViewpoint(leg.h) ? null : leg.h.trail_id;
    applyReveal();
    setPlaque(leg.h);
    syncScrub();
    updateDeck();
    const temps = await drawTrailAnim(leg, tk);
    if (tk !== expToken) { temps.forEach(l => map.removeLayer(l)); return; }
    holdLegId = null;
    applyReveal();   // the real visit (icons and all) takes over; prior ink whispers
    requestAnimationFrame(() => temps.forEach(l => map.removeLayer(l)));
    // the ranger reads the itinerary ahead: warm the next framing now
    if (ix + 1 < legs.length && shotOfLeg[ix + 1] !== shotOfLeg[ix]) prefetchShot(shotOfLeg[ix + 1]);
}

async function playFrom(ix) {
    cancelRun(); const tk = expToken;
    tourPaused = false;          // the tour is rolling again — no paused point waits
    dismissResumeHint();
    mode = 'expedition';
    playing = true;
    setThreads(true);
    setCinema(true);
    updateDeck();
    // Resuming onto ground that's already inked (you played from a hike you were
    // looking at)? Wipe back to just-before this leg AND frame its shot behind a
    // single blink, so the veil lifts onto blank land and the trail draws in —
    // never the old "back from the blink already drawn → cut to blank → redraw".
    let skipFirstCeremony = false;
    if (inkIx >= ix) {
        await softCut(() => {
            inkIx = ix - 1;
            nowT = ix > 0 ? legs[ix - 1].t : t0 - 1;
            holdLegId = null;
            applyReveal();
            setShotView(ix);
        }, tk);
        if (tk !== expToken) return;
        skipFirstCeremony = true;
    }
    let prev = ix - 1;
    for (let k = ix; k < legs.length; k++) {
        legIx = k;
        await legSequence(prev, k, tk, k === ix && skipFirstCeremony); if (tk !== expToken) return;
        prev = k;
        await sleep(isViewpoint(legs[k].h) ? DWELL_VIEWPOINT_MS : DWELL_MS);
        if (tk !== expToken) return;
    }
    await finale(tk);
}

async function startExpedition() {
    if (!legs.length) return;
    lowerSheet();
    closeFieldCard();
    endInkFlight();               // enter the tour with the ink at full, never a stray free-mode dim
    cancelRun(); const tk = expToken;
    mode = 'expedition';
    playing = true;
    setCinema(true);
    // reset the clock to "before the first trail" up front, so bailing during
    // the intro reads as a fresh start (nothing to resume), not a stale pause at
    // the last leg. The visual clear (applyReveal) still waits for the veil.
    nowT = t0 - 1;
    legIx = -1;
    inkIx = -1;
    holdLegId = null;
    updateDeck();
    const y0 = new Date(t0).getUTCFullYear(), y1 = new Date(t1).getUTCFullYear();
    await veilIn(`<div class="veil-kicker">The Trailprint Atlas</div>
        <div class="veil-title">The expedition begins</div>
        <div class="veil-sub">${y0} – ${y1}, told one trail at a time</div>`, 1700);
    if (tk !== expToken) return;
    applyReveal();
    threadGroup.clearLayers();
    threadAt.clear();
    await veilOut();
    if (tk !== expToken) return;
    playFrom(0);
}

// Land in free mode on the whole, fully-inked Atlas — the shared destination
// of both the natural finale and an early escape. The registry stays whole so
// a later "resume" can still walk the itinerary.
function settleWholeAtlas() {
    mode = 'free';
    tourPaused = false;          // played through — no paused tour waits
    nowT = t1;
    legIx = legs.length - 1;
    inkIx = legs.length - 1;
    legIndexById = {};
    hikesById = {};
    legs.forEach((l, i) => {
        legIndexById[l.h.trail_id] = i;
        hikesById[l.h.trail_id] = l.h;
        const ref = layerReferences[l.name];
        if (ref && (ref.firstLegIx === undefined || i < ref.firstLegIx)) ref.firstLegIx = i;
    });
    holdLegId = null;
    applyReveal();
    syncThreads(legs.length - 1);
    if (fullBounds) map.fitBounds(fullBounds, { animate: false });
}

// The natural end: played through the last leg. The earned ceremony — a held
// farewell slide, then the whole Atlas laid bare.
async function finale(tk) {
    playing = false;
    setThreads(false);   // the resting Atlas is pure trailprints — no rigging
    dimPlaque();
    await veilIn(`<div class="veil-kicker">The expedition rests</div>
        <div class="veil-title">The whole Atlas</div>
        <div class="veil-sub">every trail, on the land itself</div>`, 1500);
    if (tk !== expToken) return;
    settleWholeAtlas();
    await waitTiles(); if (tk !== expToken) { setCinema(false); return; }
    await veilOut();
    setCinema(false);
    restPlaque();
    syncScrub();
    updateDeck();
}

// Escaping the tour early (the ✕ / Esc) is NOT the finale — that grand slide is
// earned by playing to the end. Bailing PAUSES the film in place: the camera
// and the ink stay exactly where the tour left off, the chrome returns, and a
// quiet cue invites you to open any trail to pick the film back up from there.
function endExpedition() {
    cancelRun();
    playing = false;
    setThreads(false);
    mode = 'free';
    holdLegId = null;
    veilEl.classList.remove('on', 'fast');     // if we bailed mid-cut, lift it now
    if (inkIx < 0) {
        // bailed before a single trail was drawn — nothing to pause on, so just
        // lay the whole Atlas out to explore
        tourPaused = false;
        settleWholeAtlas();
    } else {
        tourPaused = true;                     // a paused tour waits at inkIx
        applyReveal();                         // hold the ink at the paused moment
        showResumeHint();                      // "open any trail to resume"
    }
    setCinema(false);                          // chrome returns; the camera stays put
    restPlaque();
    syncScrub();
    updateDeck();
}

// Drop into the tour from a specific hike — the sheet's "play from here", and
// the same path the resume cue points at. Draws that hike, then rolls on.
function playFromHike(trailId) {
    const ix = legIndexById[trailId];
    if (ix === undefined) return;
    lowerSheet();
    playFrom(ix);
}

// The resume cue: a quiet nudge after you step off the tour, pointing you back
// to any trail to pick the film up. It retires the moment you open one (or the
// film rolls again).
const resumeCueEl = document.getElementById('resume-cue');
function showResumeHint() { if (resumeCueEl) resumeCueEl.classList.add('show'); }
function dismissResumeHint() { if (resumeCueEl) resumeCueEl.classList.remove('show'); }

/** The visitor takes the wheel: playback stops, the chrome returns. */
function haltPlayback() {
    cancelRun();
    playing = false;
    setThreads(false);
    setCinema(false);
    holdLegId = null;            // never leave a mid-draw leg suppressed after a halt
    veilEl.classList.remove('on', 'fast');
    updateDeck();
}

/** A re-render (filters) lands instantly back in off-trail mode. */
function resetExpedition() {
    cancelRun();
    mode = 'free';
    playing = false;
    setThreads(false);
    legIx = -1;
    setCinema(false);
    veilEl.classList.remove('on', 'fast');
    endInkFlight();               // a fresh render always lands with the ink at full
    closeFieldCard();
    restPlaque();
}

// --- stepping, with a breath: rapid presses just flip the console; after
//     ~1.2s of quiet the map settles on the chosen hike with one blink ---
let stepTarget = null, stepTimer = null, resumeAfterStep = false;
function step(dir) {
    if (mode !== 'expedition' || !legs.length) return;
    if (stepTarget === null) {
        resumeAfterStep = playing;
        stepTarget = legIx < 0 ? 0 : legIx;
    }
    cancelRun();
    playing = false;
    setCinema(false);
    veilEl.classList.remove('on', 'fast');
    stepTarget = Math.max(0, Math.min(legs.length - 1, stepTarget + dir));
    legIx = stepTarget;
    setPlaque(legs[stepTarget].h);
    syncScrub();
    updateDeck();
    clearTimeout(stepTimer);
    stepTimer = setTimeout(() => {
        const target = stepTarget, resume = resumeAfterStep;
        stepTarget = null;
        settleStep(target, resume);
    }, 1200);
}
async function settleStep(ix, resume) {
    cancelRun(); const tk = expToken;
    setThreads(true);   // a step replays its leg — the line web is in play
    legIx = ix;
    inkIx = ix - 1;
    nowT = ix > 0 ? legs[ix - 1].t : t0 - 1;
    holdLegId = null;
    await softCut(() => {
        applyReveal();
        syncThreads(ix - 1);
        setShotView(ix);
    }, tk);
    if (tk !== expToken) return;
    if (resume) playFrom(ix);
    else await legSequence(ix - 1, ix, tk);
}

/** Land anywhere in time with the whole world rendered to that point. */
async function settleJump(ix) {
    cancelRun(); const tk = expToken;
    setThreads(false);   // a jump lands at rest — no rigging until play resumes
    legIx = ix;
    inkIx = ix;
    nowT = legs[ix].t;
    holdLegId = null;
    await softCut(() => {
        applyReveal();
        syncThreads(ix);
        setShotView(ix);
    }, tk);
    if (tk !== expToken) return;
    setPlaque(legs[ix].h);
    syncScrub();
    updateDeck();
}

// The visitor grabbing the map always stops the film (chrome returns).
map.on('dragstart', () => { if (playing) haltPlayback(); });
map.getContainer().addEventListener('wheel', () => { if (playing) haltPlayback(); }, { passive: true });
// A click on bare land closes the card (a click on a trail is swallowed above).
map.on('click', () => {
    if (suppressMapClick) { suppressMapClick = false; return; }
    // a click on bare land lowers the sheet IN PLACE — that click usually
    // means "let me look around here", so the camera stays put
    if (!playing) { lowerSheet(); closeFieldCard(); }
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (mode === 'expedition') endExpedition();
        else if (sheetHikeId) lowerSheet();
        else closeFieldCard();
        return;
    }
    if (mode !== 'expedition') return;
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
});

// --- The deck's controls, per mode ---
function updateDeck() {
    const c = document.getElementById('deck-controls');
    if (!c) return;
    if (mode === 'free') {
        // a tour paused in place (you stepped off early) offers Resume, right
        // where you left it; otherwise the deck invites the whole expedition
        if (tourPaused) {
            c.innerHTML = `<button class="deck-begin" id="deck-resume" type="button">&#9654;&nbsp; Resume the expedition</button>
                <span class="deck-leg">paused at leg ${Math.max(0, inkIx) + 1} of ${legs.length}</span>`;
            document.getElementById('deck-resume').onclick = () => playFrom(Math.max(0, inkIx));
            return;
        }
        const trips = chapters.filter(ch => ch.kind === 'trip').length;
        c.innerHTML = `<button class="deck-begin" id="deck-begin" type="button">&#9654;&nbsp; Begin the expedition</button>
            <span class="deck-leg">${chapters.length} chapters · ${trips} expeditions</span>`;
        document.getElementById('deck-begin').onclick = startExpedition;
        return;
    }
    c.innerHTML = `
        <button class="deck-step" id="deck-prev" type="button" title="Previous leg">&#8249;</button>
        <button class="deck-pp" id="deck-pp" type="button">${playing ? '&#10073;&#10073;' : '&#9654;'}</button>
        <button class="deck-step" id="deck-next" type="button" title="Next leg">&#8250;</button>
        <span class="deck-leg">leg ${legIx + 1} of ${legs.length}</span>
        <button class="deck-end" id="deck-end" type="button" title="End the expedition">&#10005;</button>`;
    document.getElementById('deck-pp').onclick = () => {
        if (playing) haltPlayback();
        else playFrom(Math.max(0, legIx));
    };
    document.getElementById('deck-prev').onclick = () => step(-1);
    document.getElementById('deck-next').onclick = () => step(1);
    document.getElementById('deck-end').onclick = () => endExpedition();
}

// --- The timeline: one equal slice per leg, banded by year ---
function syncScrub() {
    const scrub = document.getElementById('timeline-scrub');
    if (scrub) scrub.value = Math.max(0, legIx);
    // Keep the chain's centre playhead on the current hike in BOTH modes, so the
    // EXPANDED timeline shows where you are whether the tour drove you here or you
    // just clicked a hike. During the expedition the chain is open, so it glides
    // ('smooth'); in free roam it's condensed under a raised sheet, so the move is
    // invisible until you reopen it ('auto', no need to animate). onScrub is
    // suppressed during a programmatic scroll, so this can't feed back.
    if (legIx >= 0 && legs[legIx] && typeof AtlasChain !== 'undefined') {
        AtlasChain.scrollToHike(legs[legIx].h.trail_id, mode === 'expedition' ? 'smooth' : 'auto');
    }
}

function buildTimelineChrome() {
    const scrub = document.getElementById('timeline-scrub');
    const band = document.getElementById('deck-band');
    const years = document.getElementById('deck-years');
    if (!scrub || !legs.length) return;
    scrub.max = legs.length - 1;
    const n = legs.length;
    const yearOf = leg => hikeYear(leg.h);
    const stops = [], labels = [];
    let runStart = 0;
    for (let i = 1; i <= n; i++) {
        if (i === n || yearOf(legs[i]) !== yearOf(legs[runStart])) {
            const y = yearOf(legs[runStart]);
            const col = ATLAS_CONFIG.COLOR_MAP[String(y)] || ATLAS_CONFIG.DEFAULT_COLOR;
            const a = runStart / n * 100, b = i / n * 100;
            stops.push(`${col} ${a.toFixed(1)}% ${b.toFixed(1)}%`);
            labels.push(`<span style="left:${((a + b) / 2).toFixed(1)}%">${y}</span>`);
            runStart = i;
        }
    }
    if (band) band.style.background = `linear-gradient(90deg, ${stops.join(', ')})`;
    if (years) years.innerHTML = labels.join('');
}

// ===========================================================================
// Filters (logic unchanged, chrome rebuilt) + register + legend
// ===========================================================================
function populateFilters(trailGroups) {
    const years = new Set(), types = new Set(), difficulties = new Set(), sizes = new Set();
    trailGroups.forEach(group => {
        const rep = group[0];
        types.add(rep.hike_type);
        difficulties.add(rep.difficulty);
        sizes.add(rep.hike_size);
        group.forEach(hike => years.add(hikeYear(hike)));
    });
    const createFilterTags = (elementId, items, filterType) => {
        const container = document.getElementById(elementId);
        container.innerHTML = '';
        [...items].sort().forEach(item => {
            const tag = document.createElement('button');
            tag.className = 'filter-tag';
            tag.type = 'button';
            tag.dataset.filterType = filterType;
            tag.dataset.filterValue = item;
            tag.innerText = item;
            container.appendChild(tag);
        });
    };
    createFilterTags('year-filter-options', years, 'year');
    createFilterTags('type-filter-options', types, 'hike_type');
    createFilterTags('difficulty-filter-options', difficulties, 'difficulty');
    createFilterTags('size-filter-options', sizes, 'size');
}

function updateActiveFiltersDisplay() {
    const displayContainer = document.getElementById('active-filters-display');
    displayContainer.innerHTML = '<h5>Active Filters:</h5>';
    let hasActiveFilters = false;
    for (const type in activeFilters) {
        if (!(activeFilters[type] instanceof Set)) continue;
        activeFilters[type].forEach(value => {
            hasActiveFilters = true;
            const activeTag = document.createElement('div');
            activeTag.className = 'active-filter-tag';
            activeTag.innerHTML = `<span>${value} <span class="remove-filter-btn" data-filter-type="${type}" data-filter-value="${value}">&times;</span></span>`;
            displayContainer.appendChild(activeTag);
        });
    }
    displayContainer.style.display = hasActiveFilters ? 'block' : 'none';
}

function clearAllFilters() {
    for (const type in activeFilters) {
        if (activeFilters[type] instanceof Set) activeFilters[type].clear();
    }
    activeFilters.search = '';
    document.getElementById('trail-search-input').value = '';
    document.querySelectorAll('#trail-list-container .trail-list-item').forEach(row => { row.style.display = ''; });
    document.querySelectorAll('.filter-tag.active').forEach(tag => tag.classList.remove('active'));
}

function applyFilters() {
    const filteredGroups = allHikesData.filter(group => {
        const rep = group[0];
        const searchMatch = activeFilters.search === '' ||
            rep.trail_name.toLowerCase().includes(activeFilters.search) ||
            rep.location.toLowerCase().includes(activeFilters.search);
        if (!searchMatch) return false;
        return group.some(hike => {
            const yearMatch = activeFilters.year.size === 0 || activeFilters.year.has(hikeYear(hike).toString());
            const typeMatch = activeFilters.hike_type.size === 0 || activeFilters.hike_type.has(hike.hike_type);
            const difficultyMatch = activeFilters.difficulty.size === 0 || activeFilters.difficulty.has(hike.difficulty);
            const sizeMatch = activeFilters.size.size === 0 || activeFilters.size.has(hike.hike_size);
            return yearMatch && typeMatch && difficultyMatch && sizeMatch;
        });
    });
    renderMapLayers(filteredGroups);
    updateActiveFiltersDisplay();
}

function setupEventListeners() {
    // The rail card's tabs: one panel at a time; tapping the active tab
    // folds the card shut.
    const railCard = document.getElementById('rail-card');
    const railTabs = document.getElementById('rail-tabs');
    railTabs.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const wasActive = btn.classList.contains('active');
        railTabs.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        railCard.querySelectorAll('.rail-pane').forEach(pn => pn.classList.remove('active'));
        if (wasActive) { railCard.classList.remove('open'); return; }
        btn.classList.add('active');
        document.getElementById('pane-' + btn.dataset.pane).classList.add('active');
        railCard.classList.add('open');
    });
    document.getElementById('pane-filters').addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('filter-tag')) {
            const { filterType, filterValue } = target.dataset;
            target.classList.toggle('active');
            if (activeFilters[filterType].has(filterValue)) activeFilters[filterType].delete(filterValue);
            else activeFilters[filterType].add(filterValue);
            applyFilters();
        }
        if (target.classList.contains('remove-filter-btn')) {
            const { filterType, filterValue } = target.dataset;
            activeFilters[filterType].delete(filterValue);
            const btn = document.querySelector(`.filter-tag[data-filter-type="${filterType}"][data-filter-value="${filterValue}"]`);
            if (btn) btn.classList.remove('active');
            applyFilters();
        }
    });
    document.getElementById('reset-filters-btn').addEventListener('click', () => {
        clearAllFilters();
        applyFilters();
    });
    // The finder: search-first trail navigation (the register, summoned).
    // Typing filters the LIST only — the map keeps every trail; the filters
    // panel is where the map itself gets sifted.
    const finder = document.getElementById('finder');
    const finderInput = document.getElementById('trail-search-input');
    const openFinder = () => finder.classList.add('open');
    finderInput.addEventListener('focus', openFinder);
    finderInput.addEventListener('input', () => {
        openFinder();
        const q = finderInput.value.toLowerCase();
        document.querySelectorAll('#trail-list-container .trail-list-item').forEach(row => {
            row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
    });
    document.addEventListener('pointerdown', (e) => {
        if (!finder.contains(e.target)) finder.classList.remove('open');
    });
    finderInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { finder.classList.remove('open'); finderInput.blur(); }
    });

    // Finder rows: focus the trail — same card, same framing as a map click.
    document.getElementById('trail-list-container').addEventListener('click', (e) => {
        const listItem = e.target.closest('.trail-list-item');
        if (!listItem) return;
        finder.classList.remove('open');
        focusTrail(listItem.dataset.trailName);
    });

    // The timeline: grabbable in every mode. Dragging is a live preview (the
    // ink grows and shrinks under the thumb); releasing mid-expedition
    // settles the world with one blink — trails AND journey lines — exactly
    // as if you had watched through to that moment. In off-trail mode it is
    // the chronoscope: reveal only, the camera stays yours.
    const scrub = document.getElementById('timeline-scrub');
    scrub.addEventListener('input', () => {
        if (!legs.length) return;
        if (playing) haltPlayback();
        const ix = Math.max(0, Math.min(legs.length - 1, +scrub.value));
        legIx = ix;
        inkIx = ix;
        nowT = legs[ix].t;
        holdLegId = null;
        applyReveal();
        setPlaque(legs[ix].h);
        // scrubbing behind an open card or sheet un-inks its trail — let it go too
        if (cardTrailName && layerReferences[cardTrailName] && layerReferences[cardTrailName].firstLegIx > inkIx) closeFieldCard();
        if (sheetHikeId && legIndexById[sheetHikeId] !== undefined && legIndexById[sheetHikeId] > inkIx) {
            lowerSheet();
        }
        if (mode === 'expedition') updateDeck();
    });
    scrub.addEventListener('change', () => {
        if (!legs.length) return;
        if (mode === 'expedition') settleJump(Math.max(0, Math.min(legs.length - 1, +scrub.value)));
    });
}

function renderLegend() {
    const body = document.getElementById('legend-body');
    if (!body) return;
    let html = '<div class="cartouche-label">Trail color · year last hiked</div>';
    for (const year in ATLAS_CONFIG.COLOR_MAP) {
        html += `<div class="legend-item"><span class="legend-trail-segment" style="background-color:${ATLAS_CONFIG.COLOR_MAP[year]};"></span>${year}</div>`;
    }
    html += '<div class="cartouche-label">Outing style</div>';
    for (const type in ATLAS_CONFIG.STAMPS) {
        html += `<div class="legend-item"><span class="legend-stamp">${atlasStampSvg(type)}</span>${type}</div>`;
    }
    html += `<div class="legend-item"><span class="legend-stamp"><span class="legend-gold-dot"></span></span>Hiked more than once</div>`;
    html += `<p class="legend-note">Stamps appear as you zoom into a region.</p>`;
    body.innerHTML = html;
}

updateDeck();
restPlaque();
