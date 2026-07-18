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

// --- Zoom-aware icon reveal ---
// Below this zoom, trail-start icons fade out (via CSS) so the trailprints
// own the view; the line dash patterns still tell the outing style.
const ICON_REVEAL_ZOOM = 10;
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
// Every basemap layer glides through camera flights instead of churning:
// updateWhenIdle/updateWhenZooming defer tile requests until the camera
// settles (mid-flight the existing tiles scale smoothly, like motion blur in
// a tracking shot), and keepBuffer holds a wide apron of tiles so pans don't
// reveal bare paper. Landings resolve fast because prefetchTiles() (below)
// warms the destination's tiles before the camera gets there.
const TILE = (url, opts = {}) => L.tileLayer(url, {
    className: 'fadeable-tile-layer', opacity: 0, attribution: '',
    updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 8, ...opts
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
ALL_TILE_LAYERS.forEach(l => l.addTo(map));

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
function setBasemap(key) {
    currentBasemap = key;
    const conf = BASEMAPS[key];
    ALL_TILE_LAYERS.forEach(l => l.setOpacity(conf.tiles.get(l) || 0));
    parchmentWash.classList.toggle('on', conf.wash);
    document.querySelectorAll('.basemap-chips button').forEach(b => b.classList.toggle('active', b.dataset.base === key));
}
document.getElementById('basemap-chips').addEventListener('click', e => {
    if (e.target.dataset.base) setBasemap(e.target.dataset.base);
});
setBasemap('atlas');

// ===========================================================================
// Data + shared state
// ===========================================================================
let allHikesData = [];          // trail groups (hikes grouped by trail_name)
let allTrailGeometries = {};
const allTrailsGroup = L.featureGroup().addTo(map);
let layerReferences = {};       // trail_name -> { layer, firstT, row, bounds }
let iconNudges = {};
let legs = [];                  // every visible hike, chronological — the expedition's flight plan
let t0 = 0, t1 = 1;             // the timeline's ends (first & last hike)
let nowT = Infinity;            // the moment the map is showing
let fullBounds = null;

// Deep-link support: map.html?state=CA opens zoomed to that state's hikes.
const FOCUS_STATE = (new URLSearchParams(window.location.search).get('state') || '').trim().toUpperCase();
let pendingFocusState = FOCUS_STATE;

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
            nowT = legs[ix].t;
            applyReveal();
            syncThreads(ix);
            setSceneView(ix);
            setPlaque(legs[ix].h);
            syncScrub();
            updateDeck();
            if (params.get('cinema')) setCinema(true);
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

// --- Trail Spotlight (unchanged): an open popup dims every other trail ---
let spotlightTrailName = null;
function applySpotlight() {
    for (const name in layerReferences) {
        const focused = !spotlightTrailName || name === spotlightTrailName;
        const group = layerReferences[name].layer;
        const members = [];
        if (group.eachLayer) { group.eachLayer(l => members.push(l)); } else { members.push(group); }
        members.forEach(l => {
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
// Rendering: build every layer, then let the timeline decide what's on land
// ===========================================================================
function renderMapLayers(trailGroupsToRender) {
    resetExpedition();                      // a re-render always lands in off-trail mode
    allTrailsGroup.clearLayers();
    layerReferences = {};
    spotlightTrailName = null;

    const legList = [];
    trailGroupsToRender.forEach(hikesForTrail => {
        const trailName = hikesForTrail[0].trail_name;
        const layer = renderTrailGroup(hikesForTrail, {
            isInteractive: true,
            onTrailClick: () => {
                // the same click bubbles on to the map, whose handler would
                // immediately close the card we're about to open — swallow it
                suppressMapClick = true;
                setTimeout(() => { suppressMapClick = false; }, 0);
                focusTrail(trailName);
            },
            trailGeometries: allTrailGeometries,
            iconNudges: iconNudges
        });
        if (!layer) return;

        const firstT = Math.min(...hikesForTrail.map(h => new Date(h.date_completed).getTime()));
        layerReferences[trailName] = { layer, firstT, row: null, group: hikesForTrail };
        hikesForTrail.forEach(h => {
            if (typeof h.latitude !== 'number' && !allTrailGeometries[h.trail_id]) return;
            legList.push({ t: new Date(h.date_completed).getTime(), h, name: trailName });
        });

        let bannerWarmed = false;
        layer.on('mouseover', () => {
            if (bannerWarmed) return;
            bannerWarmed = true;
            const photoId = cardBannerPhotoId([...hikesForTrail].sort(compareHikesChronoDesc));
            if (photoId) {
                new Image().src = cloudinaryUrl(photoId, CARD_BANNER_TRANSFORM);
                new Image().src = cloudinaryUrl(photoId, CARD_BLUR_TRANSFORM);
            }
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
    holdTrailName = null;
    buildExpedition();
    buildTimelineChrome();
    syncScrub();
    applyReveal();
    updateDeck();

    const shown = Object.keys(layerReferences).length;
    const count = document.getElementById('filter-count');
    if (count) count.textContent = `Showing ${shown} of ${allHikesData.length} trails`;

    fullBounds = allTrailsGroup.getLayers().length ? allTrailsGroup.getBounds().pad(0.1) : null;
    if (!pendingFocusState && fullBounds) map.fitBounds(fullBounds);
}

/** Which trails exist yet, at the moment the map is showing? */
function applyReveal() {
    let hikeCount = 0, vpCount = 0, miles = 0;
    legs.forEach(l => {
        if (l.t > nowT) return;
        if (isViewpoint(l.h)) vpCount++; else hikeCount++;
        miles += l.h.miles || 0;
    });
    for (const name in layerReferences) {
        const ref = layerReferences[name];
        // holdTrailName keeps a trail off the land while its draw animation
        // performs; the register row already lights up (its day has come)
        const on = ref.firstT <= nowT && name !== holdTrailName;
        if (on && !allTrailsGroup.hasLayer(ref.layer)) allTrailsGroup.addLayer(ref.layer);
        if (!on && allTrailsGroup.hasLayer(ref.layer)) allTrailsGroup.removeLayer(ref.layer);
        if (ref.row) ref.row.classList.toggle('future', ref.firstT > nowT);
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
            <span class="deck-stats">${where}</span>`;
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
let registerAutoTucked = false;     // did the card tuck the register itself?
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
        const iconFile = ATLAS_CONFIG.ICON_MAP[rep.hike_type] || 'day-hike-icon.png';
        bannerHtml = `
            <div class="fc-banner fc-banner-fallback" style="background-color: ${yearColor};">
                <img src="assets/icons/${iconFile}" alt="${rep.hike_type}" class="hike-icon">
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
    // the card lives where the register does — tuck the drawer out of its way
    const panel = document.getElementById('register-panel');
    if (!panel.classList.contains('tucked')) { registerAutoTucked = true; panel.classList.add('tucked'); }
    spotlightTrailName = trailName;
    applySpotlight();
    markActiveRow(trailName);
}

function closeFieldCard() {
    cardTrailName = null;
    fieldCardEl.classList.remove('show');
    if (registerAutoTucked) {
        registerAutoTucked = false;
        document.getElementById('register-panel').classList.remove('tucked');
    }
    spotlightTrailName = null;
    applySpotlight();
    markActiveRow(null);
}

function markActiveRow(trailName) {
    document.querySelectorAll('.trail-list-item.active').forEach(i => i.classList.remove('active'));
    const ref = trailName && layerReferences[trailName];
    if (ref && ref.row) ref.row.classList.add('active');
}

// --- Framing: fit a trail into the open space beside the card + deck.
//     Every frame precedes a card, so the left padding always reserves its
//     column — the trail centers itself in the space that remains. ---
const FRAME_MAX_ZOOM = 14;
function cardFramePadding() {
    return {
        paddingTopLeft: L.point(356, 76),
        paddingBottomRight: L.point(46, 140)
    };
}

/** The bounds a trail (or viewpoint) will be framed to. */
function refTargetBounds(ref) {
    const b = ref.layer.getBounds ? ref.layer.getBounds() : null;
    if (b && b.isValid()) return b;
    const h = ref.group.find(hk => typeof hk.latitude === 'number');
    return h ? L.latLng(h.latitude, h.longitude).toBounds(900) : null;   // a viewpoint frames its neighborhood
}

/**
 * Frames a target. Flight durations are distance-aware (Leaflet's own flyTo
 * pacing): neighboring trails are a quick hop, cross-country legs take a
 * longer, statelier arc — and the tiles get a head start via prefetchTiles.
 * Returns 'noop' when the camera is already there, so callers can skip
 * waiting for a moveend that will never come.
 */
function frameLayer(ref, { instant = false } = {}) {
    const b = refTargetBounds(ref);
    if (!b) return false;
    const pad = cardFramePadding();
    const opts = { ...pad, maxZoom: FRAME_MAX_ZOOM };
    if (map._getBoundsCenterZoom) {
        const cz = map._getBoundsCenterZoom(b, opts);
        if (map.getZoom() === cz.zoom && map.getCenter().distanceTo(cz.center) < 2) return 'noop';
    }
    prefetchTiles(b);
    if (instant) map.fitBounds(b, { ...opts, animate: false });
    else map.flyToBounds(b, opts);
    return true;
}

// --- Tile prefetch: we know where the camera is going before it moves, so
//     the FULL landing viewport — every tile the screen will show, not just
//     the trail's own box — is requested ahead of the arrival. In ranger
//     mode the NEXT leg's viewport downloads during the current dwell. The
//     flight itself glides over the low-altitude underlay; the arrival then
//     resolves all at once instead of patchworking in. ---
function prefetchTiles(bounds, fitOpts) {
    if (!bounds || !map._getBoundsCenterZoom) return;
    // where exactly will fitBounds put the camera?
    const target = map._getBoundsCenterZoom(bounds, fitOpts || { ...cardFramePadding(), maxZoom: FRAME_MAX_ZOOM });
    const zoom = Math.round(target.zoom);
    // the geographic rectangle the whole screen will cover at that moment
    const half = map.getSize().divideBy(2);
    const pixelCenter = map.project(target.center, zoom);
    const nw = map.unproject(pixelCenter.subtract(half), zoom);
    const se = map.unproject(pixelCenter.add(half), zoom);
    const tileXY = (lat, lng, z) => {
        const n = Math.pow(2, z);
        const rad = lat * Math.PI / 180;
        return [
            Math.floor((lng + 180) / 360 * n),
            Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n)
        ];
    };
    BASEMAPS[currentBasemap].tiles.forEach((opacity, layer) => {
        if ((layer.options.maxNativeZoom || 99) <= 6) return;   // underlays keep themselves warm
        const z = Math.min(zoom, layer.options.maxNativeZoom || layer.options.maxZoom || zoom);
        const [x1, y1] = tileXY(nw.lat, nw.lng, z);
        const [x2, y2] = tileXY(se.lat, se.lng, z);
        if ((x2 - x1 + 1) * (y2 - y1 + 1) > 60) return;   // a huge area isn't worth warming
        const subs = layer.options.subdomains || 'abc';
        let i = 0;
        for (let x = x1; x <= x2; x++) {
            for (let y = y1; y <= y2; y++) {
                new Image().src = L.Util.template(layer._url, {
                    s: subs[(i++) % subs.length], z, x, y,
                    r: L.Browser.retina ? '@2x' : ''
                });
            }
        }
    });
}

/** Click a trail (on the map or in the register): spotlight + card + frame. */
function focusTrail(trailName) {
    const ref = layerReferences[trailName];
    if (!ref) return;
    if (playing) haltPlayback();   // clicking a trail takes the wheel
    // the trail may sit ahead of the timeline's moment — walk time forward
    // to its first hike so it exists to visit
    if (ref.firstT > nowT) {
        nowT = ref.firstT;
        legIx = lastLegAt(nowT);
        syncScrub();
        applyReveal();
        if (mode === 'expedition') updateDeck();
    }
    showFieldCard(ref.group);
    frameLayer(ref);
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
let holdTrailName = null;       // suppresses a trail's reveal until its draw lands
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
}

// --- the veil: every cut happens behind it, and it lifts only when the
//     visible tile sheets report themselves loaded ---
function waitTiles(timeout = 2600) {
    return new Promise(res => {
        requestAnimationFrame(() => {
            const pending = ALL_TILE_LAYERS.filter(l => (l.options.opacity || 0) > 0 && l.isLoading());
            if (!pending.length) return res();
            let n = pending.length;
            const done = () => { if (--n === 0) res(); };
            pending.forEach(l => l.once('load', done));
            setTimeout(res, timeout);
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

// --- the structure: chapters and scenes, rebuilt with every render ---
let chapters = [], chapterOfLeg = [], scenes = [], sceneOfLeg = [];
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
}
const setSceneView = ix => map.fitBounds(scenes[sceneOfLeg[ix]].bounds, { ...SCENE_FRAME, animate: false });
function viewMatchesScene(ix) {
    if (!map._getBoundsCenterZoom) return false;
    const t = map._getBoundsCenterZoom(scenes[sceneOfLeg[ix]].bounds, SCENE_FRAME);
    return map.getZoom() === t.zoom && map.getCenter().distanceTo(t.center) < 3;
}
const prefetchScene = si => { if (scenes[si]) prefetchTiles(scenes[si].bounds, SCENE_FRAME); };

// --- journey lines: every chapter boundary owns one; syncThreads renders
//     the set exactly as it would look having watched through to leg ix ---
const threadGroup = L.layerGroup().addTo(map);
const threadAt = new Map();
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
                { color: '#2f5c40', weight: 1.8, opacity: 0.3, dashArray: '7 7', interactive: false }).addTo(threadGroup);
            threadAt.set(i, line);
        } else if (!want && threadAt.has(i)) {
            threadGroup.removeLayer(threadAt.get(i));
            threadAt.delete(i);
        }
    }
}
/** The Expedition Line: trailhead to trailhead, exactly where you went. */
async function drawJourneyLine(a, b, tk) {
    const pts = threadPts(a, b);
    const line = L.polyline([pts[0]], { color: '#2f5c40', weight: 2.6, opacity: 0.9, dashArray: '7 7', interactive: false }).addTo(threadGroup);
    const pen = L.circleMarker(pts[0], { radius: 5, color: '#fffdf6', weight: 1.6, fillColor: '#2f5c40', fillOpacity: 1 }).addTo(map);
    const t0ms = performance.now(), dur = 1900;
    await new Promise(res => (function f(now) {
        if (tk !== expToken) return res();
        const t = Math.min(1, (now - t0ms) / dur);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const upto = Math.max(1, Math.round(e * pts.length));
        line.setLatLngs(pts.slice(0, upto));
        pen.setLatLng(pts[Math.min(upto, pts.length - 1)]);
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
    const line = L.polyline([all[0]], { color: col, weight: 5, opacity: 0.85, pane: 'mainTrailPane', interactive: false }).addTo(map);
    const pen = L.circleMarker(all[0], { radius: 5, color: '#fffdf6', weight: 1.6, fillColor: col, fillOpacity: 1, pane: 'mainTrailPane' }).addTo(map);
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
async function setPlaque(h) {
    const d = new Date(h.date_completed);
    const isVp = isViewpoint(h);
    const html = `
        <div class="lg-kicker">${h.hike_type} &middot; ${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}, ${d.getUTCFullYear()}</div>
        <div class="lg-name">${h.trail_name}</div>
        <div class="lg-loc">${h.location} &bull; ${h.region}</div>
        ${isVp ? `<div class="lg-stats">A scenic stop along the way. No miles inked.</div>`
               : `<div class="lg-stats">${h.miles} mi &middot; ${(h.elevation_gain || 0).toLocaleString()} ft gain &middot; ${h.difficulty}</div>`}
        ${h.hiked_with && h.hiked_with.length ? `<div class="lg-with">With ${h.hiked_with.join(', ')}</div>`
            : (h.hike_size === 'Solo' ? '<div class="lg-with">Walked solo</div>' : '')}
        <a class="lg-log" href="hike.html?id=${h.trail_id}">Open the Field Log &rarr;</a>`;
    if (!plaqueEl.classList.contains('dim') && lgInnerEl.innerHTML) {
        lgInnerEl.classList.add('swap');
        await sleep(240);
    }
    plaqueEl.style.setProperty('--lg', yearColorOf(h));
    lgInnerEl.innerHTML = html;
    plaqueEl.classList.remove('dim');
    lgInnerEl.classList.remove('swap');
}
const dimPlaque = () => plaqueEl.classList.add('dim');
function restPlaque() {
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
        if ((prevIx >= 0 && sceneOfLeg[prevIx] !== sceneOfLeg[ix]) || !viewMatchesScene(ix)) {
            await softCut(() => setSceneView(ix), tk);
        }
        return;
    }
    const outings = chNew.legIxs.length > 1 ? ` · ${chNew.legIxs.length} outings` : '';
    if (!chOld) {
        await veilIn(`<div class="veil-kicker">Chapter ${ROMAN(chapterOfLeg[ix] + 1)}</div>
            <div class="veil-title">${chNew.name}</div>
            <div class="veil-sub">${chNew.sub}${outings}</div>`, 1800);
        if (tk !== expToken) return;
        setSceneView(ix);
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
    const line = await drawJourneyLine(a, b, tk);
    threadAt.set(ix, line);
    if (tk !== expToken) return;
    await sleep(420); if (tk !== expToken) return;
    await softCut(() => setSceneView(ix), tk);
}

async function legSequence(prevIx, ix, tk) {
    await ceremony(prevIx, ix, tk); if (tk !== expToken) return;
    const leg = legs[ix];
    // the console flips the moment the new hike's pen touches the map
    nowT = leg.t;
    const ref = layerReferences[leg.name];
    holdTrailName = (ref && !allTrailsGroup.hasLayer(ref.layer)) ? leg.name : null;
    applyReveal();
    setPlaque(leg.h);
    syncScrub();
    updateDeck();
    const temps = await drawTrailAnim(leg, tk);
    if (tk !== expToken) { temps.forEach(l => map.removeLayer(l)); return; }
    holdTrailName = null;
    applyReveal();   // the real trail (icons and all) takes over the ink
    requestAnimationFrame(() => temps.forEach(l => map.removeLayer(l)));
    // the ranger reads the itinerary ahead: warm the next framing now
    if (ix + 1 < legs.length && sceneOfLeg[ix + 1] !== sceneOfLeg[ix]) prefetchScene(sceneOfLeg[ix + 1]);
}

async function playFrom(ix) {
    cancelRun(); const tk = expToken;
    mode = 'expedition';
    playing = true;
    setCinema(true);
    updateDeck();
    let prev = ix - 1;
    for (let k = ix; k < legs.length; k++) {
        legIx = k;
        await legSequence(prev, k, tk); if (tk !== expToken) return;
        prev = k;
        await sleep(isViewpoint(legs[k].h) ? DWELL_VIEWPOINT_MS : DWELL_MS);
        if (tk !== expToken) return;
    }
    await finale(tk);
}

async function startExpedition() {
    if (!legs.length) return;
    closeFieldCard();
    cancelRun(); const tk = expToken;
    mode = 'expedition';
    playing = true;
    setCinema(true);
    updateDeck();
    const y0 = new Date(t0).getUTCFullYear(), y1 = new Date(t1).getUTCFullYear();
    await veilIn(`<div class="veil-kicker">The Trailprint Atlas</div>
        <div class="veil-title">The expedition begins</div>
        <div class="veil-sub">${y0} – ${y1}, told one trail at a time</div>`, 1700);
    if (tk !== expToken) return;
    nowT = t0 - 1;
    legIx = -1;
    holdTrailName = null;
    applyReveal();
    threadGroup.clearLayers();
    threadAt.clear();
    await veilOut();
    if (tk !== expToken) return;
    playFrom(0);
}

async function finale(tk) {
    playing = false;
    dimPlaque();
    await veilIn(`<div class="veil-kicker">The expedition rests</div>
        <div class="veil-title">The whole Atlas</div>
        <div class="veil-sub">every trail, on the land itself</div>`, 1500);
    if (tk !== expToken) return;
    mode = 'free';
    nowT = t1;
    legIx = legs.length - 1;
    holdTrailName = null;
    applyReveal();
    syncThreads(legs.length - 1);
    threadGroup.eachLayer(l => l.setStyle && l.setStyle({ opacity: 0.45 }));
    if (fullBounds) map.fitBounds(fullBounds, { animate: false });
    await waitTiles(); if (tk !== expToken) { setCinema(false); return; }
    await veilOut();
    setCinema(false);
    restPlaque();
    syncScrub();
    updateDeck();
}

function endExpedition() {
    cancelRun();
    finale(expToken);
}

/** The visitor takes the wheel: playback stops, the chrome returns. */
function haltPlayback() {
    cancelRun();
    playing = false;
    setCinema(false);
    veilEl.classList.remove('on', 'fast');
    updateDeck();
}

/** A re-render (filters) lands instantly back in off-trail mode. */
function resetExpedition() {
    cancelRun();
    mode = 'free';
    playing = false;
    legIx = -1;
    setCinema(false);
    veilEl.classList.remove('on', 'fast');
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
    legIx = ix;
    nowT = ix > 0 ? legs[ix - 1].t : t0 - 1;
    holdTrailName = null;
    await softCut(() => {
        applyReveal();
        syncThreads(ix - 1);
        setSceneView(ix);
    }, tk);
    if (tk !== expToken) return;
    if (resume) playFrom(ix);
    else await legSequence(ix - 1, ix, tk);
}

/** Land anywhere in time with the whole world rendered to that point. */
async function settleJump(ix) {
    cancelRun(); const tk = expToken;
    legIx = ix;
    nowT = legs[ix].t;
    holdTrailName = null;
    await softCut(() => {
        applyReveal();
        syncThreads(ix);
        setSceneView(ix);
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
    if (!playing) closeFieldCard();
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (mode === 'expedition') endExpedition();
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
        const trips = chapters.filter(ch => ch.kind === 'trip').length;
        c.innerHTML = `<button class="deck-begin" id="deck-begin" type="button">&#9654;&nbsp; Begin the expedition</button>
            <span class="deck-leg">${chapters.length} chapters · ${trips} expeditions</span>`;
        document.getElementById('deck-begin').onclick = startExpedition;
        return;
    }
    const ch = chapters[chapterOfLeg[Math.max(0, legIx)]];
    c.innerHTML = `
        <button class="deck-step" id="deck-prev" type="button" title="Previous leg">&#8249;</button>
        <button class="deck-pp" id="deck-pp" type="button">${playing ? '&#10073;&#10073;' : '&#9654;'}</button>
        <button class="deck-step" id="deck-next" type="button" title="Next leg">&#8250;</button>
        <span class="deck-leg">leg ${legIx + 1} of ${legs.length} · Chapter ${ROMAN(chapterOfLeg[Math.max(0, legIx)] + 1)} · ${ch ? ch.name : ''}</span>
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
    document.getElementById('filter-toggle-btn').addEventListener('click', () => {
        document.getElementById('filter-panel').classList.toggle('visible');
    });
    document.getElementById('filter-panel').addEventListener('click', (e) => {
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
    document.getElementById('trail-search-input').addEventListener('input', (e) => {
        activeFilters.search = e.target.value.toLowerCase();
        applyFilters();
    });

    // Register rows: focus the trail — same card, same framing as a map click.
    document.getElementById('trail-list-container').addEventListener('click', (e) => {
        const listItem = e.target.closest('.trail-list-item');
        if (!listItem) return;
        focusTrail(listItem.dataset.trailName);
    });

    // Register drawer tuck/reveal
    const panel = document.getElementById('register-panel');
    document.getElementById('register-collapse').addEventListener('click', () => panel.classList.add('tucked'));
    document.getElementById('register-tab').addEventListener('click', () => panel.classList.remove('tucked'));

    // Legend cartouche fold
    document.getElementById('legend-toggle').addEventListener('click', () => {
        document.getElementById('legend-cartouche').classList.toggle('folded');
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
        nowT = legs[ix].t;
        holdTrailName = null;
        applyReveal();
        setPlaque(legs[ix].h);
        // scrubbing behind an open card un-inks its trail — let the card go too
        if (cardTrailName && layerReferences[cardTrailName] && layerReferences[cardTrailName].firstT > nowT) closeFieldCard();
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
    for (const type in ATLAS_CONFIG.ICON_MAP) {
        html += `<div class="legend-item"><img src="assets/icons/${ATLAS_CONFIG.ICON_MAP[type]}" class="legend-icon hike-icon" alt=""> ${type}</div>`;
    }
    html += `<div class="legend-item"><img src="assets/icons/blank-icon.png" class="legend-icon hike-icon multi-year-icon-style" alt=""> Hiked more than once</div>`;
    html += `<p class="legend-note">Icons appear as you zoom into a region.</p>`;
    body.innerHTML = html;
}

updateDeck();
restPlaque();
