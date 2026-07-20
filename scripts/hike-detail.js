/**
 * The hike page — The Cartographer's Light Table.
 *
 * One desk seen from above: the day's slides at left, the map sheet at
 * centre with the elevation acetate bolted beneath it, the paperwork at
 * right. Spec mockup: mockups/hike-light-table-v2.html
 *
 * Two structural rules (both deliberate, both easy to break by accident):
 *   1. The maps NEVER pan or zoom. This page shows one GPX framed as large
 *      as the sheet allows; roaming belongs to map.html.
 *   2. The acetate is inside the sheet, under the map, so scrubbing the
 *      day's shape always happens with the trail in view.
 *
 * The brass rail sweeps between two stacked, identically-framed maps (the
 * topo survey clipped over the satellite land), so one drag wipes between
 * the cartography and the real ground.
 */
document.addEventListener('DOMContentLoaded', async () => {

    /* ===================== state ===================== */
    let allHikes = null;      // fetched once; reused by the timeline and back/forward
    let mapTopo = null;
    let mapSat = null;
    let routeBounds = null;
    let walkers = [];         // the scrub marker, one per glass
    let mediaItems = [];      // photos + videos for the lightbox
    let currentMediaIndex = 0;
    let currentTrack = null;  // the parsed GPX; the acetate redraws from it on resize
    let currentInk = null;

    // The acetate is a fixed height on this page. The map is the point, so the
    // profile never grows to swallow it — the gridline step adapts instead.
    const ACETATE_PLOT_PX = 92;

    // How far the brass rail can travel toward each edge, and the knob's reach.
    // The map's framing keeps the trail clear of both.
    const RAIL_TRAVEL_MIN = 0.02;
    const KNOB_RADIUS = 16;

    const $ = id => document.getElementById(id);

    /* ===================== the lightbox ===================== */
    const lightbox = $('lightbox');
    const modalImage = $('modal-image');
    const modalVideoContainer = $('modal-video-container');
    const filmStrip = $('modal-dots-container');
    const lbTitle = $('lb-title');
    const lbCount = $('lb-count');

    const getYoutubeId = (url) => {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    };

    const PHOTO_FULL = 'w_1800,c_limit,q_auto,f_auto';

    function showMedia(newIndex) {
        if (!mediaItems.length) return;
        if (newIndex >= mediaItems.length) newIndex = 0;
        if (newIndex < 0) newIndex = mediaItems.length - 1;
        currentMediaIndex = newIndex;
        const item = mediaItems[currentMediaIndex];

        modalImage.style.display = 'none';
        modalVideoContainer.style.display = 'none';
        modalVideoContainer.innerHTML = '';   // stops a playing video on every flip

        if (item.type === 'photo') {
            // blur-up + neighbour preload (config.js): the adjacent photos warm
            // in the background, so flipping in order lands sharp instantly
            const photoIds = mediaItems.filter(m => m.type === 'photo').map(m => m.id);
            const at = photoIds.indexOf(item.id);
            const neighbours = photoIds.length > 1
                ? [photoIds[(at + 1) % photoIds.length], photoIds[(at - 1 + photoIds.length) % photoIds.length]]
                : [];
            modalImage.classList.remove('loaded');
            modalImage.onload = () => modalImage.classList.add('loaded');
            blurUpShow(modalImage, item.id, PHOTO_FULL, neighbours);
            if (modalImage.complete && modalImage.naturalWidth) modalImage.classList.add('loaded');
            modalImage.style.display = 'block';
        } else if (item.type === 'video') {
            const videoId = getYoutubeId(item.url);
            if (videoId) {
                modalVideoContainer.innerHTML =
                    `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&controls=1&rel=0&iv_load_policy=3&showinfo=0"
                        allow="autoplay; encrypted-media" allowfullscreen title="Hike video"></iframe>`;
                modalVideoContainer.style.display = 'block';
            }
        }

        lbCount.textContent = `FRAME ${String(currentMediaIndex + 1).padStart(2, '0')} OF ${String(mediaItems.length).padStart(2, '0')}`;
        filmStrip.querySelectorAll('.media-dot').forEach(dot => {
            dot.classList.toggle('active', Number(dot.dataset.i) === currentMediaIndex);
        });
        const showNav = mediaItems.length > 1;
        $('modal-prev-btn').style.display = showNav ? 'flex' : 'none';
        $('modal-next-btn').style.display = showNav ? 'flex' : 'none';
        filmStrip.style.display = showNav ? 'flex' : 'none';
    }

    const openLightbox = (i) => { lightbox.classList.add('visible'); showMedia(i); };
    const closeLightbox = () => {
        lightbox.classList.remove('visible');
        modalVideoContainer.innerHTML = '';
    };

    $('modal-prev-btn').addEventListener('click', e => { e.stopPropagation(); showMedia(currentMediaIndex - 1); });
    $('modal-next-btn').addEventListener('click', e => { e.stopPropagation(); showMedia(currentMediaIndex + 1); });
    $('modal-close-btn').addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });

    document.addEventListener('keydown', (e) => {
        if (lightbox.classList.contains('visible')) {
            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowRight') showMedia(currentMediaIndex + 1);
            if (e.key === 'ArrowLeft') showMedia(currentMediaIndex - 1);
            return;
        }
        if (e.key === 'Escape' && document.body.classList.contains('sheet-full')) toggleFullSheet();
    });

    /* ===================== the weather almanac ===================== */
    /** WMO weather codes in plain words. No emoji anywhere on this page. */
    function weatherText(code) {
        const map = {
            0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
            45: 'Fog', 48: 'Depositing rime fog',
            51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
            56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
            61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
            66: 'Light freezing rain', 67: 'Heavy freezing rain',
            71: 'Slight snowfall', 73: 'Moderate snowfall', 75: 'Heavy snowfall',
            77: 'Snow grains', 80: 'Slight rain showers', 81: 'Moderate rain showers',
            82: 'Violent rain showers', 85: 'Slight snow showers', 86: 'Heavy snow showers',
            95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail'
        };
        return map[code] || 'Weather data unavailable';
    }

    async function renderAlmanac(hike, trackPromise) {
        const section = $('almanac-section');
        section.style.display = 'none';
        $('ontrail-card').style.display = 'none';
        if (!hike.latitude || !hike.longitude || !hike.date_completed) return;

        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${hike.latitude}&longitude=${hike.longitude}` +
            `&start_date=${hike.date_completed}&end_date=${hike.date_completed}` +
            `&daily=temperature_2m_max,sunrise,sunset&hourly=weathercode,temperature_2m&temperature_unit=fahrenheit&timezone=auto`;

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Almanac request failed: ${res.status}`);
            const data = await res.json();
            if (!data.daily || !data.hourly || !data.daily.time.length) return;

            const sunrise = new Date(data.daily.sunrise[0]);
            const sunset = new Date(data.daily.sunset[0]);
            const fmt = { hour: 'numeric', minute: '2-digit', hour12: true };

            const sunriseCode = data.hourly.weathercode[sunrise.getHours()];
            const sunsetCode = data.hourly.weathercode[sunset.getHours()];
            const sunriseTemp = Math.round(data.hourly.temperature_2m[sunrise.getHours()]);
            const sunsetTemp = Math.round(data.hourly.temperature_2m[sunset.getHours()]);

            $('sunrise-time').textContent = sunrise.toLocaleTimeString('en-US', fmt);
            $('sunrise-weather-desc').textContent = `${sunriseTemp}°F · ${weatherText(sunriseCode)}`;
            $('sunset-time').textContent = sunset.toLocaleTimeString('en-US', fmt);
            $('sunset-weather-desc').textContent = `${sunsetTemp}°F · ${weatherText(sunsetCode)}`;
            $('peak-weather-temp').textContent = `${Math.round(data.daily.temperature_2m_max[0])}°F`;
            $('peak-weather-desc').textContent = weatherText(data.hourly.weathercode[13]);  // conditions at 1 PM

            section.style.display = 'block';

            // The clock usually rides on the GPX, but a track can be replaced
            // (a recording that glitched, swapped for a clean route download)
            // and lose its timestamps while the day's real hours are still
            // known. `recorded_times` carries them; it wins when present.
            const track = await trackPromise;
            const clock = hike.recorded_times
                ? { startTime: new Date(hike.recorded_times.start), endTime: new Date(hike.recorded_times.end) }
                : track;
            renderOnTrailCard(clock, data.utc_offset_seconds, sunrise, sunset);
        } catch (err) {
            console.error('Could not load the hike almanac:', err);
        }
    }

    /**
     * The almanac's "On the Trail" row: the day's boots-on and boots-off clock,
     * read from the GPX recording. Each hike record is one day's walk (a
     * backpacking leg ends at camp), so the window never crosses midnight.
     * The daylight ribbon says the rest without words: the trail-green band is
     * the walk, laid over that day's actual night-day-night — a band that
     * starts in the dark IS the alpine start.
     */
    function renderOnTrailCard(track, utcOffsetSeconds, sunriseDate, sunsetDate) {
        const card = $('ontrail-card');
        if (!track || !track.startTime || !track.endTime) return;

        const durationMs = track.endTime - track.startTime;
        // A record longer than a waking day means a malformed track — stand
        // down. NaN is checked explicitly: an unparseable date is still a
        // truthy Date object, and every comparison against NaN is false, so
        // it would otherwise sail through and print "NaNh NaNm".
        if (isNaN(durationMs) || durationMs <= 0 || durationMs > 16 * 3600 * 1000) return;

        // GPX clocks are UTC. Shifting by the trail's offset (already fetched
        // with the weather) and reading with getUTC* yields the trail's wall
        // clock — correct whether the hike was in California or Virginia.
        const toWall = d => new Date(d.getTime() + utcOffsetSeconds * 1000);
        const wallStart = toWall(track.startTime);
        const wallEnd = toWall(track.endTime);
        const fmtTime = (d) => {
            const h12 = d.getUTCHours() % 12 || 12;
            return `${h12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${d.getUTCHours() >= 12 ? 'PM' : 'AM'}`;
        };
        $('ontrail-times').innerHTML =
            `${fmtTime(wallStart)}<span class="ontrail-arrow">&rarr;</span>${fmtTime(wallEnd)}`;

        let hrs = Math.floor(durationMs / 3600000);
        let mins = Math.round((durationMs % 3600000) / 60000);
        if (mins === 60) { hrs++; mins = 0; }
        $('ontrail-duration').textContent =
            hrs > 0 ? `${hrs}h ${mins}m on the trail` : `${mins} minutes on the trail`;

        // one bar = that day, midnight to midnight
        const minuteOfDay = d => d.getUTCHours() * 60 + d.getUTCMinutes();
        // sunrise/sunset arrived as local wall-clock strings (timezone=auto),
        // so the local getters read their wall-clock components directly
        const sunriseMin = sunriseDate.getHours() * 60 + sunriseDate.getMinutes();
        const sunsetMin = sunsetDate.getHours() * 60 + sunsetDate.getMinutes();
        const pct = m => (m / 1440) * 100;

        $('ontrail-ribbon').style.background = `linear-gradient(90deg,
            #2c3e50 0%, #2c3e50 ${pct(sunriseMin) - 1.5}%,
            #f2e3bb ${pct(sunriseMin) + 1.5}%, #f2e3bb ${pct(sunsetMin) - 1.5}%,
            #2c3e50 ${pct(sunsetMin) + 1.5}%, #2c3e50 100%)`;

        const band = $('ontrail-band');
        band.style.left = `${pct(minuteOfDay(wallStart))}%`;
        band.style.width = `${Math.max(pct(minuteOfDay(wallEnd)) - pct(minuteOfDay(wallStart)), 0.8)}%`;
        card.style.display = 'block';
    }

    /* ===================== the fire memorial ===================== */
    /**
     * A muted notice on trails that burned after Danny walked them. The GPX and
     * photos on those pages are historical documents now, and the banner says so
     * in one quiet sentence. The gap is computed per hike ("six weeks" for
     * Temescal, "eight months" for Sunset Peak) — that's why the wording lands.
     */
    function renderFireMemorial(hike) {
        const banner = $('fire-memorial');
        if (!hike.fire_memorial) { banner.style.display = 'none'; return; }

        // Both dates are date-only strings: parse as UTC per Atlas convention
        const fireDate = new Date(`${hike.fire_memorial.date}T00:00:00Z`);
        const hikeDate = new Date(`${hike.date_completed}T00:00:00Z`);
        const gap = fireGapText(fireDate - hikeDate);
        const monthYear = fireDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

        // A thin, single-weight line-drawn ember — vector, crisp at any size
        const flameOuter = 'M12 1.5 C 9.2 8, 5.2 11.4, 5.2 18.4 a 6.8 6.8 0 0 0 13.6 0 C 18.8 12.6, 15.2 10.6, 14.2 5.6 C 13.3 8.6, 12.4 8.8, 12 1.5 Z';
        const flameInner = 'M12 13 C 10.6 15.6, 9.3 16.8, 9.3 19.6 a 2.7 2.7 0 0 0 5.4 0 C 14.7 16.9, 13.2 16, 12.7 14 C 12.4 15, 12 15, 12 13 Z';

        banner.innerHTML =
            `<span class="fire-memorial-mark">` +
                `<svg width="19" height="27" viewBox="0 0 24 26" fill="none" stroke="#a8552e" ` +
                `stroke-width="1.3" stroke-linejoin="round" aria-hidden="true">` +
                `<path d="${flameOuter}"/><path d="${flameInner}" stroke-width="1.1" opacity="0.7"/></svg>` +
            `</span>` +
            `<p class="fire-memorial-eyebrow">From Before</p>` +
            `<p class="fire-memorial-line">This trail burned in the <strong>${hike.fire_memorial.fire}</strong> ` +
            `of ${monthYear}, <strong>${gap}</strong> after this hike. While the land will regrow, ` +
            `this log preserves it as it once stood.</p>`;
        banner.style.display = 'block';
    }

    /** Spells the hike-to-fire gap in plain words: "six weeks", "fourteen months". */
    function fireGapText(ms) {
        const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
            'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
            'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three'];
        const spell = n => WORDS[n] || String(n);
        const days = Math.round(ms / 86400000);
        if (days < 70) {
            const weeks = Math.max(1, Math.round(days / 7));
            return weeks === 1 ? 'one week' : `${spell(weeks)} weeks`;
        }
        const months = Math.round(days / 30.44);
        if (months === 12) return 'a year';
        if (months < 24) return `${spell(months)} months`;
        return `${spell(Math.round(months / 12))} years`;
    }

    /* ===================== small helpers ===================== */

    /**
     * Companion names become Trail Crew links: core crew (10+ shared outings)
     * go to their member page, everyone else to the register.
     */
    function linkifyCrewNames(names, hikes) {
        const people = groupByCompanion(hikes);
        return names.map(name => {
            const count = (people.get(name) || []).length;
            const href = count >= ATLAS_CONFIG.CREW_CORE_MIN_HIKES
                ? `crew-member.html?name=${encodeURIComponent(name)}`
                : 'crew.html';
            return `<a class="crew-name-link" href="${href}">${name}</a>`;
        }).join(', ');
    }

    /**
     * "Bigtooth maple (Acer grandidentatum) — fact" as an engraved specimen slip.
     *
     * The separator can't be trusted: 128 records use an em dash and 76 run the
     * fact straight on from the parenthetical. So the split keys off the Latin
     * name in brackets, and this page prints the dash itself — every slip reads
     * the same however its record was written.
     */
    function renderSlip(el, kicker, text) {
        if (!text) { el.style.display = 'none'; el.innerHTML = ''; return; }
        const head = `<div class="k">${kicker}</div>`;
        const named = text.match(/^\s*(.+?)\s*\(([^)]+)\)\s*(?:[—–-]\s*)?([\s\S]*)$/);
        if (named) {
            const fact = named[3].trim();
            el.innerHTML = head + `<b>${named[1]}</b> <span class="latin">(${named[2]})</span>` +
                (fact ? ` — ${formatHikeText(fact)}` : '');
        } else {
            const cut = text.indexOf(' — ');
            el.innerHTML = head + (cut > 0
                ? `<b>${text.slice(0, cut)}</b> — ${formatHikeText(text.slice(cut + 3))}`
                : formatHikeText(text));
        }
        el.style.display = 'block';
    }

    /**
     * Pulls a line back onto one row when it is only just too long.
     *
     * Letter-spaced display caps are mostly air, so tightening the tracking
     * usually buys back the one word that spilled; body lines give up a little
     * size instead. Each list is tried in order and the first setting that fits
     * wins. If even the tightest step can't hold it — a genuinely long park
     * name — the line goes back to its original setting and wraps, because two
     * honest rows beat one squashed one.
     */
    function fitOneLine(el, steps) {
        if (!el || !el.textContent.trim()) return;
        el.style.whiteSpace = 'nowrap';
        for (const step of steps) {
            Object.assign(el.style, step);
            if (!el.clientWidth) return;                    // not laid out yet
            if (el.scrollWidth <= el.clientWidth) return;   // fits
        }
        Object.assign(el.style, steps[0]);
        el.style.whiteSpace = 'normal';
    }

    /** The title block's three lines, each with its own room to give. */
    function fitCollar() {
        fitOneLine($('c-kicker'), [
            { letterSpacing: '0.3em' }, { letterSpacing: '0.24em' },
            { letterSpacing: '0.19em' }, { letterSpacing: '0.15em' },
            { letterSpacing: '0.11em' }
        ]);
        fitOneLine($('c-sub'), [
            { fontSize: '13px' }, { fontSize: '12.4px' },
            { fontSize: '11.9px' }, { fontSize: '11.4px' }, { fontSize: '11px' }
        ]);
        fitOneLine($('c-trip'), [
            { fontSize: '12.5px' }, { fontSize: '12px' }, { fontSize: '11.5px' }
        ]);
    }

    /** Degrees-minutes-seconds for the sheet's corner coordinates. */
    function dms(v, isLat) {
        const hemi = isLat ? (v >= 0 ? 'N' : 'S') : (v >= 0 ? 'E' : 'W');
        // round to whole seconds FIRST, then split — rounding each part on its
        // own prints impossibilities like 118°10′60″ instead of 118°11′00″
        const total = Math.round(Math.abs(v) * 3600);
        const d = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        return `${d}°${String(m).padStart(2, '0')}′${String(s).padStart(2, '0')}″ ${hemi}`;
    }

    /* ===================== the sheet's map ===================== */

    /**
     * Frames both glasses on the route. Called on first render, on window
     * resize, and after the full-sheet toggle — the map is locked, so this is
     * the only thing that ever moves it.
     */
    function frameMaps() {
        if (!mapTopo || !mapSat) return;

        // The rail is furniture, like the sheet's edge, and the trail must
        // clear it at either extreme: the knob is a 32px disc centred on the
        // rail, and the rail travels to 2% of the stage. Without this the
        // brass circle sits on top of the track on wide routes.
        const stageW = $('stage').clientWidth || 0;
        const padX = Math.round(stageW * RAIL_TRAVEL_MIN) + KNOB_RADIUS + 14;

        [mapTopo, mapSat].forEach(m => {
            m.invalidateSize({ animate: false });
            if (routeBounds) m.fitBounds(routeBounds, { padding: [Math.max(26, padX), 26], animate: false });
        });
        paintCorners();
        paintScaleBar();
    }

    /**
     * Redraws the profile at the acetate's current width. The chart maps one
     * viewBox unit to one pixel, so it has to be rebuilt whenever that width
     * changes — otherwise entering full-sheet would stretch it.
     */
    function drawAcetate() {
        const chart = $('shape-chart');
        if (!currentTrack || !chart.clientWidth) return;
        chart.__atlasShapeClear?.();
        AtlasShape.render(chart, currentTrack, {
            plotHeight: ACETATE_PLOT_PX,
            // the profile is drawn in this year's ink, on film
            palette: { line: currentInk, fill: currentInk, label: '#43597a', grid: 'rgba(90,110,140,0.18)', tick: 'rgba(90,110,140,0.35)' },
            onScrub: (sample) => walkers.forEach(w => {
                w.setLatLng([sample.lat, sample.lon]);
                w.setStyle({ opacity: 1, fillOpacity: 1 });
            }),
            onLeave: () => walkers.forEach(w => w.setStyle({ opacity: 0, fillOpacity: 0 }))
        });
    }

    function relayout() {
        fitCollar();
        frameMaps();
        drawAcetate();
    }
    window.addEventListener('resize', relayout);

    function paintCorners() {
        if (!mapTopo || !mapTopo._loaded) return;
        const b = mapTopo.getBounds();
        $('cnw').textContent = `${dms(b.getNorth(), true)}  ${dms(b.getWest(), false)}`;
        $('cne').textContent = `${dms(b.getNorth(), true)}  ${dms(b.getEast(), false)}`;
        $('csw').textContent = `${dms(b.getSouth(), true)}  ${dms(b.getWest(), false)}`;
        $('cse').textContent = `${dms(b.getSouth(), true)}  ${dms(b.getEast(), false)}`;
    }

    /** A real scale bar: pick a round distance, then size the bar to match it. */
    function paintScaleBar() {
        if (!mapTopo || !mapTopo._loaded) return;
        const size = mapTopo.getSize();
        if (!size.x) return;
        const midY = size.y / 2;
        const west = mapTopo.containerPointToLatLng([0, midY]);
        const east = mapTopo.containerPointToLatLng([size.x, midY]);
        const milesPerPx = (west.distanceTo(east) / 1609.34) / size.x;

        const NICE = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50];
        const target = milesPerPx * 112;                       // aim for ~112px
        const nice = NICE.reduce((a, b) => Math.abs(b - target) < Math.abs(a - target) ? b : a);
        const bar = document.querySelector('.scale-bar .bar');
        bar.style.width = `${Math.round(nice / milesPerPx)}px`;
        $('scale-t').textContent = `0 — ${nice < 1 ? nice : nice.toLocaleString()} MI`;
    }

    /* ----- the brass rail ----- */
    let railX = 58;   // percent from the left; >50 favours the survey
    function applyRail() {
        const split = $('split');
        const topoWrap = $('topo-wrap');
        split.style.left = `${railX}%`;
        topoWrap.style.clipPath = `inset(0 ${100 - railX}% 0 0)`;
        $('lab-l').style.left = `${railX / 2}%`;
        $('lab-r').style.left = `${(100 + railX) / 2}%`;
        $('lab-l').style.opacity = railX > 20 ? 1 : 0;
        $('lab-r').style.opacity = railX < 80 ? 1 : 0;
        $('tab-topo').classList.toggle('on', railX >= 50);
        $('tab-aerial').classList.toggle('on', railX < 50);
    }
    function sweepRail(to) {
        const split = $('split');
        const topoWrap = $('topo-wrap');
        split.classList.add('snap');
        topoWrap.classList.add('snap');
        railX = to;
        applyRail();
        setTimeout(() => { split.classList.remove('snap'); topoWrap.classList.remove('snap'); }, 760);
    }
    $('tab-topo').addEventListener('click', () => sweepRail(96));
    $('tab-aerial').addEventListener('click', () => sweepRail(4));
    $('split').addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const split = $('split');
        split.setPointerCapture(e.pointerId);
        split.classList.remove('snap');
        $('topo-wrap').classList.remove('snap');
        const move = (ev) => {
            const r = $('stage').getBoundingClientRect();
            const limit = RAIL_TRAVEL_MIN * 100;
            railX = Math.min(100 - limit, Math.max(limit, ((ev.clientX - r.left) / r.width) * 100));
            applyRail();
        };
        const up = () => { split.removeEventListener('pointermove', move); split.removeEventListener('pointerup', up); };
        split.addEventListener('pointermove', move);
        split.addEventListener('pointerup', up);
    });

    function toggleFullSheet() {
        // the pointer may never fire a leave across the layout change, so the
        // readout and the trail walker are cleared by hand
        $('shape-chart').__atlasShapeClear?.();
        document.body.classList.toggle('sheet-full');
        setTimeout(relayout, 60);
    }
    $('full-btn').addEventListener('click', toggleFullSheet);

    /* ===================== the main render ===================== */

    function displayHike(hike, hikes) {
        const year = String(hikeYear(hike));
        const ink = ATLAS_CONFIG.COLOR_MAP[year] || ATLAS_CONFIG.DEFAULT_COLOR;
        const sheetNo = hike.trail_id.replace('tta_', '');
        const isVp = isViewpoint(hike);

        document.title = `${hike.trail_name} - The Trailprint Atlas`;

        /* ----- the collar ----- */
        $('c-kicker').textContent =
            `THE TRAILPRINT ATLAS · SHEET NO. ${sheetNo} · ${hike.hike_type.toUpperCase()}`;
        $('c-title').textContent = hike.trail_name;
        $('c-sub').textContent =
            `${hike.location} — ${hike.region} · ${isVp ? 'Visited' : 'Hiked'} ${formatHikeDate(hike.date_completed)}`;

        const tripLine = $('c-trip');
        if (hike.trip_tag) {
            const splitAt = hike.trip_tag.lastIndexOf(' - ');
            const tripName = splitAt > 0 ? hike.trip_tag.slice(0, splitAt) : hike.trip_tag;
            tripLine.innerHTML = `<a href="trip.html?tag=${encodeURIComponent(hike.trip_tag)}">Part of: ${tripName} &rarr;</a>`;
        } else {
            tripLine.innerHTML = '';
        }

        const seal = $('seal');
        seal.innerHTML = atlasStampSvg(hike.hike_type);
        seal.title = hike.hike_type;
        seal.style.color = ink;

        // The vitals band. Viewpoints are not hikes: a scenic stop has no
        // distance worth featuring, and "0 MILES · 0 FT GAIN" says nothing
        // true — those sheets carry the note in the lower collar instead.
        const vitals = [];
        if (!(isVp && !hike.miles)) {
            vitals.push({ v: hike.miles, l: 'Miles' });
            vitals.push({ v: hike.elevation_gain.toLocaleString(), l: 'Feet climbed' });
        }
        if (hike.summit_trail && hike.summit_elevation) {
            vitals.push({ v: hike.summit_elevation.toLocaleString(), l: 'Summit (ft)' });
        }
        if (!(isVp && !hike.miles)) vitals.push({ v: hike.difficulty, l: 'Grade' });

        const vitalsEl = $('vitals');
        vitalsEl.innerHTML = vitals
            .map(c => `<div class="vital"><div class="v">${c.v}</div><div class="l">${c.l}</div></div>`)
            .join('');
        vitalsEl.style.display = vitals.length ? '' : 'none';

        // The lower collar keeps what a map's lower margin actually carries:
        // where this sheet came from, not its headline numbers.
        const party = (hike.hiked_with && hike.hiked_with.length)
            ? linkifyCrewNames(hike.hiked_with, hikes)
            : 'Solo';
        // Nothing here that the title block already says: the only sheets that
        // need a headline down here are the ones with no numbers to feature.
        const l1 = $('legend-1');
        l1.textContent = isVp && !hike.miles ? 'A SCENIC VIEWPOINT' : '';
        l1.style.display = l1.textContent ? '' : 'none';
        $('legend-2').innerHTML =
            `${hike.primary_geography} · Party: ${party} · surveyed in the ${year} ink`;

        renderFireMemorial(hike);

        /* ----- the two glasses ----- */
        if (mapTopo) { mapTopo.remove(); mapTopo = null; }
        if (mapSat) { mapSat.remove(); mapSat = null; }
        walkers = [];
        routeBounds = null;
        // drop the previous hike's profile, or a resize would redraw it here
        currentTrack = null;
        currentInk = ink;

        // Locked, by design: this page displays a route, it doesn't roam.
        const LOCKED = {
            attributionControl: false, zoomControl: false, dragging: false, touchZoom: false,
            doubleClickZoom: false, scrollWheelZoom: false, boxZoom: false, keyboard: false,
            tap: false, zoomSnap: 0, inertia: false
        };
        mapTopo = L.map('map-topo', LOCKED);
        mapSat = L.map('map-sat', LOCKED);
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            attribution: 'Tiles &copy; Esri — Esri, DeLorme, NAVTEQ, TomTom, USGS, NPS'
        }).addTo(mapTopo);
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            attribution: 'Tiles &copy; Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP'
        }).addTo(mapSat);

        // A view straight away, before the GPX lands: Leaflet refuses to add
        // layers (or report bounds) to a map that has never been positioned,
        // and the track arrives asynchronously. fitBounds refines this the
        // moment the route's real extent is known.
        [mapTopo, mapSat].forEach(m => m.setView([hike.latitude, hike.longitude], 14, { animate: false }));

        applyRail();

        /* ----- the route, drawn on both glasses ----- */
        const shapeChart = $('shape-chart');
        const acetate = $('acetate');
        shapeChart.innerHTML = '';
        let trackPromise = Promise.resolve(null);

        if (hike.gpx_file) {
            acetate.style.display = '';
            const mapsForThisRender = mapTopo;
            trackPromise = fetch(`data/trails/${hike.gpx_file}`)
                .then(res => {
                    if (!res.ok) throw new Error(`GPX fetch failed: ${res.status}`);
                    return res.text();
                })
                .then(gpxText => {
                    // The visitor may have jumped to another hike mid-fetch;
                    // that map is gone, so quietly stand down.
                    if (mapsForThisRender !== mapTopo) return null;
                    return drawRoute(gpxText, hike, ink);
                })
                .catch(err => {
                    console.error('Could not load the GPX track:', err);
                    acetate.style.display = 'none';
                    if (hike.latitude && hike.longitude) markTrailhead(hike, ink);
                    return null;
                });
        } else {
            // Viewpoints and tracks we never had: a stamp on the spot, no acetate
            acetate.style.display = 'none';
            markTrailhead(hike, ink);
        }

        /* ----- the slides ----- */
        buildSlides(hike);

        /* ----- the paperwork ----- */
        const notes = $('description-content-container');
        notes.innerHTML = hike.description
            ? `<p>${formatHikeText(hike.description)}</p>`
            : `<p>The field notes for this sheet are still being written.</p>`;
        if (hike.notes) {
            notes.insertAdjacentHTML('beforeend',
                `<div class="journal-entry"><p>${formatHikeText(hike.notes)}</p></div>`);
        }

        const links = $('external-links-container');
        links.innerHTML = '';
        if (hike.all_trails_url) {
            links.insertAdjacentHTML('beforeend',
                `<a href="${hike.all_trails_url}" target="_blank" rel="noopener noreferrer">View on AllTrails &#8599;</a>`);
        }
        if (hike.official_trail_url) {
            links.insertAdjacentHTML('beforeend',
                `<a href="${hike.official_trail_url}" target="_blank" rel="noopener noreferrer">Official trail site &#8599;</a>`);
        }

        renderSlip($('flora-annotation'), 'Flora · pressed specimen', hike.flora);
        renderSlip($('fauna-annotation'), 'Fauna · field sighting', hike.fauna);

        renderLogbook(hike, hikes);
        renderAlmanac(hike, trackPromise);

        // First framing happens once the containers have their real size
        requestAnimationFrame(() => { fitCollar(); frameMaps(); });
    }

    /**
     * Draws the GPX on both glasses and wires the acetate to it. One fetch,
     * one parse for the line and waypoints; AtlasShape re-reads the same text
     * for the elevation profile.
     */
    function drawRoute(gpxText, hike, ink) {
        const xml = new DOMParser().parseFromString(gpxText, 'application/xml');
        const latlngs = [...xml.querySelectorAll('trkpt')]
            .map(pt => [parseFloat(pt.getAttribute('lat')), parseFloat(pt.getAttribute('lon'))])
            .filter(p => !isNaN(p[0]) && !isNaN(p[1]));
        if (latlngs.length < 2) {
            $('acetate').style.display = 'none';
            markTrailhead(hike, ink);
            return null;
        }

        routeBounds = L.latLngBounds(latlngs);
        frameMaps();   // the extent is known now — frame it before the ink draws

        [mapTopo, mapSat].forEach(m => {
            const line = L.polyline(latlngs, { color: ink, weight: 4, opacity: 0.96, interactive: false }).addTo(m);

            // the ink draws itself in, the way it does on the map page
            const path = line.getElement();
            if (path && path.getTotalLength) {
                const len = path.getTotalLength();
                path.style.strokeDasharray = len;
                path.style.strokeDashoffset = len;
                path.getBoundingClientRect();   // force layout so the transition runs
                path.style.transition = 'stroke-dashoffset 2.4s ease';
                path.style.strokeDashoffset = 0;
                setTimeout(() => {
                    path.style.transition = 'none';
                    path.style.strokeDasharray = 'none';
                }, 2700);
            }

            // trailhead: a year-ink dot at the exact point, the type's stamp beside it
            L.circleMarker(latlngs[0], {
                radius: 5, color: '#fffdf6', weight: 1.5, fillColor: ink, fillOpacity: 1, interactive: false
            }).addTo(m);
            L.marker(latlngs[0], {
                interactive: false,
                icon: L.divIcon({
                    className: '', iconSize: [24, 24], iconAnchor: [-8, 30],
                    html: `<span style="color:${ink};display:block;width:24px;height:24px">${atlasStampSvg(hike.hike_type)}</span>`
                })
            }).addTo(m);

            // waypoints (18 of the tracks carry them). Native titles, not popups:
            // the stage clips its overflow, and a popup would be cut off.
            xml.querySelectorAll('wpt').forEach(wpt => {
                const lat = parseFloat(wpt.getAttribute('lat'));
                const lon = parseFloat(wpt.getAttribute('lon'));
                if (isNaN(lat) || isNaN(lon)) return;
                const name = wpt.querySelector('name')?.textContent || '';
                L.circleMarker([lat, lon], {
                    radius: 3.5, color: '#fffdf6', weight: 1.2,
                    fillColor: '#3d3a30', fillOpacity: 0.85
                }).addTo(m).bindTooltip(name || 'Waypoint', { direction: 'top' });
            });

            // the scrub marker the acetate walks along the trail
            const walker = L.circleMarker(latlngs[0], {
                radius: 6.5, color: '#fff', weight: 2, fillColor: '#c0392b',
                fillOpacity: 0, opacity: 0, interactive: false, className: 'trail-walker'
            }).addTo(m);
            walkers.push(walker);
        });

        /* ----- the acetate ----- */
        const track = AtlasShape.parseGpx(gpxText);
        if (!track) {
            $('acetate').style.display = 'none';
            return null;
        }
        currentTrack = track;
        currentInk = ink;
        drawAcetate();
        return track;
    }

    /** A viewpoint, or a hike whose track we never had: just the stamp on the spot. */
    function markTrailhead(hike, ink) {
        if (!hike.latitude || !hike.longitude) return;
        const at = [hike.latitude, hike.longitude];
        // a lone point has no extent to fit, so the fixed zoom stands
        routeBounds = null;
        [mapTopo, mapSat].forEach(m => {
            L.circleMarker(at, {
                radius: 5, color: '#fffdf6', weight: 1.5, fillColor: ink, fillOpacity: 1, interactive: false
            }).addTo(m);
            L.marker(at, {
                interactive: false,
                icon: L.divIcon({
                    className: '', iconSize: [26, 26], iconAnchor: [-9, 32],
                    html: `<span style="color:${ink};display:block;width:26px;height:26px">${atlasStampSvg(hike.hike_type)}</span>`
                })
            }).addTo(m);
            m.setView(at, 15, { animate: false });
        });
        paintCorners();
        paintScaleBar();
    }

    /* ----- the slides + their lightbox ----- */
    function buildSlides(hike) {
        const strip = $('slide-strip');
        strip.innerHTML = '';
        filmStrip.innerHTML = '';
        mediaItems = [];

        (hike.images || []).forEach(id => mediaItems.push({ type: 'photo', id }));
        (hike.videos || []).forEach(url => {
            if (getYoutubeId(url)) mediaItems.push({ type: 'video', url });
        });

        $('slides-count').textContent = mediaItems.length
            ? `${mediaItems.length} ${mediaItems.length === 1 ? 'FRAME' : 'FRAMES'}`
            : '';
        // A hidden column would leave the grid's other two tracks in the wrong
        // slots (the sheet crushed into the 196px slide column), so the desk
        // switches template rather than the column switching visibility.
        $('slides-col').style.display = mediaItems.length ? '' : 'none';
        document.querySelector('.desk').classList.toggle('no-slides', !mediaItems.length);
        if (!mediaItems.length) return;

        lbTitle.textContent = hike.trail_name.toUpperCase();

        mediaItems.forEach((item, i) => {
            const label = String(i + 1).padStart(2, '0');
            if (item.type === 'photo') {
                strip.insertAdjacentHTML('beforeend',
                    `<div class="slide" data-i="${i}" tabindex="0" role="button" aria-label="Open frame ${label}">
                        <img src="${cloudinaryUrl(item.id, 'w_420,h_280,c_fill,q_auto,f_auto')}" alt="Hike photo ${label}" loading="lazy">
                        <div class="glass"></div>
                        <div class="no">${label}</div>
                     </div>`);
                filmStrip.insertAdjacentHTML('beforeend',
                    `<div class="media-dot" data-i="${i}" style="background-image:url('${cloudinaryUrl(item.id, 'w_120,h_84,c_fill,q_auto,f_auto')}')"></div>`);
            } else {
                const thumb = `https://img.youtube.com/vi/${getYoutubeId(item.url)}/mqdefault.jpg`;
                strip.insertAdjacentHTML('beforeend',
                    `<div class="slide is-video" data-i="${i}" tabindex="0" role="button" aria-label="Play video ${label}">
                        <img src="${thumb}" alt="Hike video ${label}" loading="lazy">
                        <div class="glass"></div>
                        <div class="no">${label}</div>
                     </div>`);
                filmStrip.insertAdjacentHTML('beforeend',
                    `<div class="media-dot video" data-i="${i}"></div>`);
            }
        });

        // Each mount stays "undeveloped" until its own frame arrives, so a
        // cold cache reads as a slide waiting on the light box rather than a
        // blank hole. Cached images are already complete by this point.
        strip.querySelectorAll('.slide img').forEach(img => {
            const mount = img.closest('.slide');
            const develop = () => mount.classList.add('loaded');
            if (img.complete && img.naturalWidth) develop();
            else {
                img.addEventListener('load', develop, { once: true });
                img.addEventListener('error', develop, { once: true });  // never strand a frame mid-develop
            }
        });

        // hovering a slide signals intent: warm the full-size photo now, so
        // opening the lightbox usually lands straight on it
        strip.querySelectorAll('.slide').forEach(el => {
            el.addEventListener('pointerenter', () => {
                const item = mediaItems[Number(el.dataset.i)];
                if (item && item.type === 'photo') blurUpPreload(cloudinaryUrl(item.id, PHOTO_FULL));
            });
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(Number(el.dataset.i)); }
            });
        });
        strip.addEventListener('click', (e) => {
            const slide = e.target.closest('.slide');
            if (slide) openLightbox(Number(slide.dataset.i));
        });
        filmStrip.addEventListener('click', (e) => {
            const dot = e.target.closest('.media-dot');
            if (dot) showMedia(Number(dot.dataset.i));
        });
    }

    /** Every time this trail was walked — the repeat-visit ledger. */
    function renderLogbook(hike, hikes) {
        const section = $('hike-log');
        const group = hikes.filter(h => h.trail_name === hike.trail_name);
        if (group.length < 2) { section.style.display = 'none'; return; }

        group.sort(compareHikesChronoDesc);
        $('logbook-container').innerHTML = group.map(log => {
            const inner =
                `<div class="date">${formatHikeDate(log.date_completed)}</div>` +
                `<p class="meta">${isViewpoint(log) ? 'Visited' : 'Hiked'} as a ${log.hike_size}` +
                    `${log.hiked_with && log.hiked_with.length ? ` with ${log.hiked_with.join(', ')}` : ''}</p>` +
                (log.notes ? `<div class="notes">${formatHikeText(log.notes)}</div>` : '');
            return log.trail_id === hike.trail_id
                ? `<div class="log-entry current-hike">${inner}</div>`
                : `<a href="hike.html?id=${log.trail_id}" class="log-entry">${inner}</a>`;
        }).join('');
        section.style.display = 'block';
    }

    /** The sheet a bad ?id lands on. */
    function showEmptySheet(title, message) {
        $('sheet').innerHTML = `<div class="sheet-empty"><h1>${title}</h1><p>${message}</p></div>`;
        $('slides-col').style.display = 'none';
        $('side-col').style.display = 'none';
    }

    /* ===================== boot ===================== */
    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.hikeId && allHikes) {
            const hike = allHikes.find(h => h.trail_id === event.state.hikeId);
            if (hike) {
                displayHike(hike, allHikes);
                AtlasTimeline.setActiveHike(hike.trail_id);
                AtlasTimeline.centerOnHike(hike.trail_id);
            }
        }
    });

    try {
        allHikes = await fetchHikes();

        const hikeId = new URLSearchParams(window.location.search).get('id');
        history.replaceState({ hikeId }, '');

        if (!hikeId) {
            showEmptySheet('No sheet selected', 'Choose a hike from the map or the timeline above.');
            return;
        }

        const hike = allHikes.find(h => h.trail_id === hikeId);
        if (!hike) {
            showEmptySheet('Sheet not found', `No hike in the Atlas carries the id “${hikeId}”.`);
            return;
        }

        // The timeline swaps content in place rather than reloading the page.
        AtlasTimeline.init({
            allHikes,
            activeHikeId: hikeId,
            onHikeSelect: (selected) => {
                displayHike(selected, allHikes);
                history.pushState({ hikeId: selected.trail_id }, '', `hike.html?id=${selected.trail_id}`);
                AtlasTimeline.setActiveHike(selected.trail_id);
                AtlasTimeline.centerOnHike(selected.trail_id);
            }
        });

        displayHike(hike, allHikes);
    } catch (error) {
        console.error('Error initializing the hike page:', error);
        showEmptySheet('Error loading data', 'Could not load the hike details. Please check the console.');
    }
});
