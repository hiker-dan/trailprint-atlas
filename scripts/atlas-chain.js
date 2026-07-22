/**
 * AtlasChain — the Surveyor's Chain: the map's scrolling, time-proportional
 * timeline (July 2026, replacing the AtlasTimeline spine). Self-contained so
 * the expedition engine in map.js is untouched: map.js plugs into it exactly
 * where it used AtlasTimeline —
 *
 *   AtlasChain.init({ hikes, onScrub, onSelect })  — build it
 *   AtlasChain.scrollToTime(t, behavior)           — the expedition drives it here
 *   AtlasChain.timeAtCenter()                      — read the moment under the line
 *   AtlasChain.setReveal(nowT)                     — dim everything ahead of the line
 *   AtlasChain.forceOpen(bool)                     — hold it open during cinema
 *
 * The whole history is engraved once on a native-scrolling track; the centre
 * playhead is fixed and whatever sits under it is "now". Two design invariants,
 * both proven in mockups/spine-chain.html:
 *   1. Every hike keeps a minimum gap, so same-day outings never overlap and
 *      any mark is pickable.
 *   2. The clock is derived from the ACTUAL laid-out dot positions (piecewise
 *      between them), so the line and the ink can never drift apart.
 *
 * Requires config.js (ATLAS_CONFIG.COLOR_MAP) and atlas-data.js (isViewpoint,
 * compareHikesChrono) to have loaded first.
 */
const AtlasChain = (() => {
    'use strict';
    const DAY = 86400000;
    const PX_PER_DAY = 5;                 // compact + proportional; the one spread knob
    const MOUNTAINSCAPE = 'assets/landscapes/timeline-landscape-fall.svg';

    let root, viewport, track, scapeFar, scapeNear, notch, playhead, pill;
    let hikes = [], H = 0, trips = [], tripOfHike = {};
    let byId = {}, orderOf = {};       // trail_id → hike record / chronological index
    let t0 = 0, tLast = 1;
    let PAD = 0, totalW = 0;
    let onScrubCb = null, onSelectCb = null;
    let ready = false, forcedOpen = false, suppressScrub = false, locked = false;
    let openTimer = null, closeTimer = null, rafPend = null;

    const inkOf = h => ATLAS_CONFIG.COLOR_MAP[String(new Date(h.t).getUTCFullYear())] || ATLAS_CONFIG.DEFAULT_COLOR;
    const isVp = h => (typeof isViewpoint === 'function') && isViewpoint(h);

    // -- the clock: piecewise-linear between the real dot positions -----------
    const timeToX = t => {
        if (t <= t0) return hikes[0].x;
        if (t >= tLast) return hikes[H - 1].x;
        let i = 0; while (i < H - 1 && hikes[i + 1].t <= t) i++;
        const a = hikes[i], b = hikes[i + 1], dt = b.t - a.t;
        return dt ? a.x + (t - a.t) / dt * (b.x - a.x) : a.x;
    };
    const xToTime = cx => {
        if (cx <= hikes[0].x) return t0;
        if (cx >= hikes[H - 1].x) return tLast;
        let i = 0; while (i < H - 1 && hikes[i + 1].x <= cx) i++;
        const a = hikes[i], b = hikes[i + 1], dx = b.x - a.x;
        return dx ? a.t + (cx - a.x) / dx * (b.t - a.t) : a.t;
    };
    const timeAtCenter = () => ready ? xToTime(viewport.scrollLeft + viewport.clientWidth / 2) : tLast;
    const scrollForTime = t => timeToX(t) - viewport.clientWidth / 2;

    // -- min-gap spacing so nothing overlaps; same-day is guaranteed apart -----
    const gapBefore = (prev, h) => {
        if (!prev) return 0;
        // same-day outings are the hardest to tell apart (one shared date label,
        // one tight cluster) AND the expedition inks them one at a time — so they
        // need the MOST room, or the playhead can't visibly travel between them
        // and the sequential reveal reads as simultaneous.
        if (prev.date_completed === h.date_completed) return 30;    // same day → widest, so each lights on its own
        const a = tripOfHike[prev.trail_id], b = tripOfHike[h.trail_id];
        if (a && a === b) return 13;                                // same trip, new day → tight cluster
        if (a || b) return 18;                                      // trip boundary → clear break
        return 12;                                                  // lone ↔ lone
    };

    function buildDom() {
        root.classList.add('atlas-chain');
        root.innerHTML = `
            <div class="ac-scape"><div class="ac-range far"></div><div class="ac-range near"></div></div>
            <div class="ac-strata" id="ac-strata"></div>
            <div class="ac-notch" id="ac-notch"></div>
            <div class="ac-wrap">
                <div class="ac-viewport" id="ac-viewport"><div class="ac-track" id="ac-track"></div></div>
                <div class="ac-fade l"></div><div class="ac-fade r"></div>
                <div class="ac-playhead"><div class="ac-pill" id="ac-pill">—</div>
                    <div class="ac-head"></div><div class="ac-line"></div></div>
            </div>`;
        viewport = root.querySelector('#ac-viewport');
        track = root.querySelector('#ac-track');
        scapeFar = root.querySelector('.ac-range.far');
        scapeNear = root.querySelector('.ac-range.near');
        notch = root.querySelector('#ac-notch');
        pill = root.querySelector('#ac-pill');
        playhead = root.querySelector('.ac-playhead');
        [scapeFar, scapeNear].forEach(el => el.style.backgroundImage = `url("${MOUNTAINSCAPE}")`);
    }

    function buildGrid() {
        const frag = document.createDocumentFragment();
        const monthEls = [];
        const d = new Date(t0); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0);
        while (d.getTime() <= tLast + 40 * DAY) {
            const t = Math.max(t0, d.getTime());
            if (d.getUTCMonth() === 0) {
                const line = document.createElement('div'); line.className = 'ac-yline';
                const lbl = document.createElement('div'); lbl.className = 'ac-year';
                lbl.textContent = d.getUTCFullYear();
                lbl.style.color = ATLAS_CONFIG.COLOR_MAP[d.getUTCFullYear()] || '#999';
                frag.append(line, lbl); monthEls.push({ t, line, lbl, isYear: true });
            } else {
                const tick = document.createElement('div'); tick.className = 'ac-mtick';
                let lbl = null;
                if (d.getUTCMonth() % 3 === 0) {
                    lbl = document.createElement('div'); lbl.className = 'ac-mo';
                    lbl.textContent = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
                    frag.append(lbl);
                }
                frag.append(tick); monthEls.push({ t, tick, lbl });
            }
            d.setUTCMonth(d.getUTCMonth() + 1);
        }
        track.appendChild(frag);
        return monthEls;
    }

    let monthEls = [];

    function build() {
        // sort + timestamp
        hikes = hikes.slice().sort((a, b) => (typeof compareHikesChrono === 'function')
            ? compareHikesChrono(a, b)
            : (Date.parse(a.date_completed) - Date.parse(b.date_completed)));
        hikes.forEach(h => { h.t = Date.parse(h.date_completed + 'T00:00:00Z'); h.ink = inkOf(h); });
        H = hikes.length;
        if (!H) return;
        t0 = hikes[0].t; tLast = hikes[H - 1].t;
        // identity index: same-day siblings share a date, so the expedition
        // must reveal + track by ORDER, not by time (this matches map.js's legs)
        byId = {}; orderOf = {};
        hikes.forEach((h, i) => { byId[h.trail_id] = h; orderOf[h.trail_id] = i; });

        // contiguous runs sharing a trip tag → a trip
        trips = []; tripOfHike = {};
        for (let i = 0; i < H;) {
            const tag = hikes[i].trip_tag;
            if (!tag) { i++; continue; }
            let j = i; while (j < H && hikes[j].trip_tag === tag) j++;
            const tr = { tag, name: tag.replace(/\s*-\s*\w+ \d{4}$/, ''), hikes: hikes.slice(i, j) };
            trips.push(tr); tr.hikes.forEach(h => (tripOfHike[h.trail_id] = tr));
            i = j;
        }

        monthEls = buildGrid();

        // trips: under-fill + binding bracket + (hover/active) name
        trips.forEach(tr => {
            tr.fillEl = document.createElement('div'); tr.fillEl.className = 'ac-fill';
            tr.fillEl.style.background = tr.hikes[0].ink;
            tr.bracketEl = document.createElement('div'); tr.bracketEl.className = 'ac-bracket';
            tr.bracketEl.style.borderColor = tr.hikes[0].ink;
            tr.nameEl = document.createElement('div'); tr.nameEl.className = 'ac-trip-name';
            tr.nameEl.textContent = tr.name.toUpperCase();
            track.append(tr.fillEl, tr.bracketEl, tr.nameEl);
        });

        // one dot per hike, with a generous invisible hit target
        hikes.forEach(h => {
            const dot = document.createElement('div');
            dot.className = 'ac-dot' + (isVp(h) ? ' viewpoint' : '');
            dot.style.background = h.ink;
            dot.addEventListener('mouseenter', () => focusTrip(tripOfHike[h.trail_id] || null));
            dot.addEventListener('mouseleave', () => { if (!forcedOpen) focusTrip(null); });
            dot.addEventListener('mousedown', e => e.stopPropagation());   // a mark is a select, not a scrub
            dot.addEventListener('click', e => { e.stopPropagation(); if (!locked && onSelectCb) onSelectCb(h); });
            h.dotEl = dot; track.appendChild(dot);
        });

        // strata ribbon (collapsed teaser): each year's width by hike count
        const strata = root.querySelector('#ac-strata'), byYear = {};
        hikes.forEach(h => { const y = new Date(h.t).getUTCFullYear(); byYear[y] = (byYear[y] || 0) + 1; });
        Object.keys(byYear).sort().forEach(y => {
            const seg = document.createElement('div');
            seg.style.width = (byYear[y] / H * 100) + '%';
            seg.style.background = ATLAS_CONFIG.COLOR_MAP[y] || '#666';
            strata.appendChild(seg);
        });
    }

    function layout() {
        if (!H) return;
        PAD = viewport.clientWidth;
        let prev = null;
        hikes.forEach(h => {
            const base = PAD / 2 + (h.t - t0) / DAY * PX_PER_DAY;
            h.x = prev ? Math.max(base, prev.x + gapBefore(prev, h)) : PAD / 2;
            prev = h;
        });
        totalW = hikes[H - 1].x + PAD / 2;
        track.style.width = totalW + 'px';
        monthEls.forEach(m => {
            const x = timeToX(m.t);
            if (m.line) m.line.style.left = x + 'px';
            if (m.tick) m.tick.style.left = x + 'px';
            if (m.lbl) m.lbl.style.left = x + 'px';
        });
        hikes.forEach(h => { h.dotEl.style.left = h.x + 'px'; });
        trips.forEach(tr => {
            const a = tr.hikes[0].x, b = tr.hikes[tr.hikes.length - 1].x, r = 7;
            tr.fillEl.style.left = (a - r) + 'px'; tr.fillEl.style.width = (b - a + 2 * r) + 'px';
            tr.bracketEl.style.left = (a - r) + 'px'; tr.bracketEl.style.width = (b - a + 2 * r) + 'px';
            tr.nameEl.style.left = ((a + b) / 2) + 'px';
        });
    }

    // -- reveal: dim everything ahead of the moment ---------------------------
    // When map.js names the newest inked hike (trailId), dim by ORDER — so a
    // trip's same-day siblings light one at a time, matching the map's leg-order
    // ink. Without it (manual paths), fall back to the date.
    let revealT = Infinity;
    function setReveal(nowT, trailId) {
        revealT = nowT;
        if (!H) return;
        let cutoff = null;   // null = time-based; a number = order index cutoff
        if (trailId !== undefined) cutoff = (trailId != null && orderOf[trailId] != null) ? orderOf[trailId] : -1;
        hikes.forEach((h, i) => h.dotEl.classList.toggle('future',
            cutoff != null ? i > cutoff : h.t > nowT + DAY / 2));
        trips.forEach(tr => {
            const fh = tr.hikes[0];
            tr.bracketEl.classList.toggle('future',
                cutoff != null ? orderOf[fh.trail_id] > cutoff : fh.t > nowT + DAY / 2);
        });
        // the pill is owned by onScroll (the viewport centre) so it glides
        // cleanly as the chain follows a leg; here we only move the strata notch.
        // The notch rides the SAME count-proportional axis as the strata ribbon
        // (each year's band is sized by its hike count, not its calendar span), so
        // it lands exactly on the band of the hike you're on — a time-proportional
        // notch drifted off the colored bands and never sat where you left off.
        let frac;
        if (cutoff != null) frac = cutoff < 0 ? 0 : (cutoff + 0.5) / H;
        else { let n = 0; while (n < H && hikes[n].t <= nowT + DAY / 2) n++; frac = (n - 0.5) / H; }
        notch.style.left = (12 + Math.max(0, Math.min(1, frac)) * (root.clientWidth - 24)) + 'px';
    }

    // -- trips: reveal the name on focus (hover / active leg) -----------------
    let litTrip = null;
    function focusTrip(tr) {
        if (litTrip === tr) return;
        if (litTrip) { litTrip.nameEl.classList.remove('lit'); litTrip.bracketEl.classList.remove('lit'); }
        monthEls.forEach(m => { if (m.lbl) m.lbl.classList.remove('ac-hidden'); });   // restore the axis
        litTrip = tr;
        if (tr) {
            tr.nameEl.classList.add('lit'); tr.bracketEl.classList.add('lit');
            // the trip name and the year/month text may never overlap: hide any
            // axis label whose position falls under the name's engraved extent
            const cx = (tr.hikes[0].x + tr.hikes[tr.hikes.length - 1].x) / 2;
            const half = tr.name.length * 2.9 + 8;
            monthEls.forEach(m => {
                if (!m.lbl) return;
                if (Math.abs(timeToX(m.t) - cx) < half + (m.isYear ? 16 : 12)) m.lbl.classList.add('ac-hidden');
            });
        }
    }
    function focusTripAt(t) { focusTrip(tripAtTime(t)); }
    function tripAtTime(t) {
        for (const tr of trips) if (t >= tr.hikes[0].t - DAY / 2 && t <= tr.hikes[tr.hikes.length - 1].t + DAY / 2) return tr;
        return null;
    }

    // -- scroll: the single source of the moment ------------------------------
    function onScroll() {
        const t = Math.max(t0, Math.min(tLast, timeAtCenter()));
        pill.textContent = new Date(t).toLocaleDateString('en-US',
            { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).toUpperCase();
        scapeFar.style.backgroundPositionX = (-viewport.scrollLeft * 0.12) + 'px';
        scapeNear.style.backgroundPositionX = (-viewport.scrollLeft * 0.30) + 'px';
        if (!suppressScrub && ready && onScrubCb) onScrubCb(t);
    }

    // -- collapse / expand on intent (never dims) ----------------------------
    function openChain() {
        if (locked) return;
        clearTimeout(closeTimer);
        if (!openTimer && !root.classList.contains('open'))
            openTimer = setTimeout(() => { root.classList.add('open'); openTimer = null; }, 70);
    }
    function scheduleCollapse() {
        clearTimeout(closeTimer);
        closeTimer = setTimeout(() => {
            if (forcedOpen || root.matches(':hover')) { scheduleCollapse(); return; }
            root.classList.remove('open');
        }, 600);
    }

    function wire() {
        viewport.addEventListener('scroll', () => {
            if (!rafPend) rafPend = requestAnimationFrame(() => { rafPend = null; onScroll(); });
        });
        // wheel over the chain scrubs it horizontally; drag grabs it
        root.addEventListener('wheel', e => {
            if (locked) return;
            e.preventDefault(); openChain();
            viewport.scrollLeft += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY);
        }, { passive: false });
        let dragging = false, dragX = 0, dragS = 0;
        viewport.addEventListener('mousedown', e => {
            if (locked) return;
            dragging = true; dragX = e.clientX; dragS = viewport.scrollLeft;
            viewport.classList.add('grabbing');
        });
        window.addEventListener('mousemove', e => { if (dragging) viewport.scrollLeft = dragS - (e.clientX - dragX); });
        window.addEventListener('mouseup', () => { dragging = false; viewport.classList.remove('grabbing'); });
        root.addEventListener('mouseenter', openChain);
        root.addEventListener('mouseleave', () => { clearTimeout(openTimer); openTimer = null; scheduleCollapse(); });
        window.addEventListener('resize', () => {
            const keep = revealT;
            layout();
            suppressScrub = true;
            viewport.scrollLeft = scrollForTime(Math.min(keep, tLast));
            requestAnimationFrame(() => { suppressScrub = false; });
            onScroll();
        });
    }

    // -- public API -----------------------------------------------------------
    function init({ container = 'atlas-chain', hikes: hs = [], onScrub = null, onSelect = null } = {}) {
        root = typeof container === 'string' ? document.getElementById(container) : container;
        if (!root) return;
        hikes = hs; onScrubCb = onScrub; onSelectCb = onSelect;
        buildDom();
        build();
        layout();
        wire();
        // open on the present, everything inked
        suppressScrub = true;
        viewport.scrollLeft = scrollForTime(tLast);
        onScroll();
        requestAnimationFrame(() => { ready = true; suppressScrub = false; });
    }

    // Own the scroll animation (native `behavior:'smooth'` is unreliable when
    // driven programmatically — it can silently no-op, so the chain would never
    // follow the expedition). A short rAF tween glides it there dependably.
    let scrollAnim = null, scrollEndT = null;
    function scrollToX(centerX, behavior) {
        if (!H) return;
        const target = centerX - viewport.clientWidth / 2;
        if (scrollAnim) { cancelAnimationFrame(scrollAnim); scrollAnim = null; }
        suppressScrub = true;
        if (behavior !== 'smooth') {
            viewport.scrollLeft = target;
            clearTimeout(scrollEndT); scrollEndT = setTimeout(() => { suppressScrub = false; }, 60);
            return;
        }
        const from = viewport.scrollLeft, dist = target - from, dur = 480, start = performance.now();
        const step = now => {
            const k = Math.min(1, (now - start) / dur), e = k * k * (3 - 2 * k);
            viewport.scrollLeft = from + dist * e;
            if (k < 1) scrollAnim = requestAnimationFrame(step);
            else { scrollAnim = null; suppressScrub = false; }
        };
        scrollAnim = requestAnimationFrame(step);
    }
    function scrollToTime(t, behavior = 'auto') { focusTripAt(t); scrollToX(timeToX(Math.max(t0, Math.min(tLast, t))), behavior); }
    // the expedition drives these by hike IDENTITY, so a same-day sibling lands
    // the playhead on ITS mark, not the last one that shares its date
    function scrollToHike(trailId, behavior = 'smooth') {
        const h = byId[trailId]; if (!h) return;
        focusTrip(tripOfHike[trailId] || null);
        scrollToX(h.x, behavior);
    }
    // travel the playhead from one hike to the next at a caller-supplied
    // progress (0..1) — the ceremony feeds it the Expedition Line's own eased
    // progress, so the chain and the dashed line cross the gap in lockstep
    function scrollBetween(fromId, toId, k) {
        const a = byId[fromId], b = byId[toId]; if (!a || !b) return;
        if (scrollAnim) { cancelAnimationFrame(scrollAnim); scrollAnim = null; }
        suppressScrub = true;
        viewport.scrollLeft = (a.x + (b.x - a.x) * k) - viewport.clientWidth / 2;
        focusTrip(tripOfHike[toId] || tripOfHike[fromId] || null);
    }

    function forceOpen(on) {
        forcedOpen = on;
        if (on) { clearTimeout(closeTimer); root.classList.add('open'); }
        else scheduleCollapse();
    }

    // Lock the chain to its static condensed ribbon (used while a sheet is up):
    // no expand, no scrub, no drag — just the year-ink strip showing your spot.
    function setLocked(on) {
        locked = on;
        if (on) { clearTimeout(openTimer); openTimer = null; clearTimeout(closeTimer); root.classList.remove('open'); }
    }

    return { init, scrollToTime, scrollToHike, scrollBetween, timeAtCenter, setReveal, forceOpen, setLocked,
        get ready() { return ready; } };
})();
