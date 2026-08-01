/**
 * The Record Books — Plate IV, the front matter's closer.
 * Two boards, each mount a bridge into a deeper page:
 *   • The Crowns      — the standing trail records → the hike pages.
 *   • The Expeditions — the trips that covered the most ground, as a podium
 *                       → the trip chapter pages.
 * Each mount's photo is the LAST image in that hike's roster (so rarely-seen
 * final shots get a moment), lazy-loaded so nothing fetches until the section
 * scrolls into view. The superlatives live here on purpose — Threads of the
 * Trail carries only firsts + cumulative counts, so the two never repeat.
 *
 * Re-set for the volume in August 2026: the cards were photographs with a dark
 * scrim and white type poured over them, which is the one place on this leaf a
 * photograph is not in a paper mount. See paperMount() and buildRecords() —
 * the second holds the reasoning behind four mounts, four trails and five
 * crowns, which is the only arrangement here that is both tidy and true.
 * Requires config.js + atlas-data.js. Added July 2026 (home redesign, Phase E).
 */
(function () {
    'use strict';

    const section = document.querySelector('.records-section');
    if (!section) return;

    const yearColor = y => ATLAS_CONFIG.COLOR_MAP[String(y)] || ATLAS_CONFIG.DEFAULT_COLOR;
    const maxBy = (arr, fn) => arr.reduce((best, x) => (fn(x) > fn(best) ? x : best));
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // The sample photo: the last image in the hike's roster (a chance for the
    // shots most visitors never scroll to). Null when the hike has no photos.
    const lastPhoto = (h, tf) => (h && h.images && h.images.length)
        ? cloudinaryUrl(h.images[h.images.length - 1], tf) : null;

    // A trip's curated opening frame, when it has one (config.js owns the list
    // and the fallback). Null rather than a broken URL if there is nothing.
    const starPhoto = (t, tf) => {
        const id = tripStar(t.tag, t.group);
        return id ? cloudinaryUrl(id, tf) : null;
    };

    /* ---- THE PAPER MOUNT ----------------------------------------------------
       A record used to be a photograph with a dark scrim poured over it and the
       figures printed in white on top — a web hero card, on a leaf where every
       other photograph in the Atlas sits in a paper mount: the hike page's 35 mm
       slides, the trip sheet's frontispiece, the crew book's portraits. So the
       photograph goes behind a window and the caption is printed on the paper
       below it, where a caption belongs, in the same engraved figures the
       Odometer and the vitals bands use.

       `crowns` is an array of { label, value, unit } — a trail can hold more
       than one record, and then it wears both. */
    const valHtml = c => `<div class="rb-v">${c.value}${c.unit ? `<span class="u">${esc(c.unit)}</span>` : ''}</div>`;
    function paperMount({ href, cls, idx, rank, crowns, name, meta, color, img, alt, ids }) {
        const win = img
            ? `<img loading="lazy" decoding="async" src="${img}" alt="${esc(alt || '')}">`
            : `<div class="rb-nowin" style="background:${color}"></div>`;
        const dot = color ? `<span class="yeardot" style="background:${color}"></span>` : '';
        return `<a class="rb-mount ${cls || ''}" href="${href}" style="--i:${idx || 0}"
                   data-ids="${esc((ids || []).join(','))}" data-name="${esc(name)}" data-place="${esc(meta)}">
            <div class="rb-win">${win}${rank ? `<span class="rb-rank">${rank}</span>` : ''}</div>
            <div class="rb-cap">
                <div class="rb-crowns">${crowns.map(c => `<div class="rb-crown">
                    ${c.label ? `<div class="rb-cart"><i></i><span>${esc(c.label)}</span><i></i></div>` : ''}${valHtml(c)}</div>`).join('')}</div>
                <div class="rb-name">${esc(name)}</div>
                <div class="rb-meta">${dot}${esc(meta)}</div>
            </div>
        </a>`;
    }

    /* NO RAGGED LAST ROW. `auto-fit` gave four mounts three columns on a 745 px
       leaf and left the fourth hanging alone — the same broken-looking half row
       the Territories index had to solve. Here the fix is simpler than blank
       squares, because the mounts are all the same size: take the widest column
       count the leaf can carry at a legible mount, then step DOWN to the
       nearest count that divides the number of mounts evenly. Four mounts
       therefore print as 4 or 2, never 3, and five would print as 5 or 1.
       Recomputed on resize, since the count is only known at run time. */
    const MOUNT_MIN = 230;
    function evenColumns(grid, n) {
        const set = () => {
            const w = grid.clientWidth;
            if (!w || !n) return;
            const fits = Math.max(1, Math.min(n, Math.floor((w + 16) / (MOUNT_MIN + 16))));
            let c = 1;
            for (let k = 1; k <= fits; k++) if (n % k === 0) c = k;
            grid.style.gridTemplateColumns = `repeat(${c}, minmax(0, 1fr))`;
        };
        set();
        let t;
        addEventListener('resize', () => { clearTimeout(t); t = setTimeout(set, 150); });
    }

    /* Every mount points the plate at its own ground — the same gesture the
       milestone ledger, the Effort Field and the Territories index all make. */
    function crossLight(root) {
        root.querySelectorAll('.rb-mount').forEach(m => {
            m.addEventListener('mouseenter', () => {
                if (!window.AtlasKeyMap) return;
                const ids = (m.dataset.ids || '').split(',').filter(Boolean);
                if (ids.length) AtlasKeyMap.light(ids, m.dataset.name, m.dataset.place);
            });
        });
    }

    fetchHikes().then(hikes => {
        buildRecords(hikes);
        buildExpeditions(hikes);
    });

    /* ---- The Crowns: the standing records → hike pages ---------------------

       FOUR MOUNTS, FOUR DIFFERENT TRAILS, AND EVERY FIGURE TRUE. One day can
       top two boards: tta_47, the PCT's Mill Creek Summit leg, is at once the
       longest hike (13.0 mi) and the biggest climb (2,549 ft). Printing it
       twice reads as a bug, and the obvious fix — let a crowned trail step
       aside so the next best takes the second crown — is worse than a bug, it
       is FALSE. Heather Lake did not climb the most; it climbed the second
       most, and this Atlas is a memoir, so a caption under a photograph has to
       be true.

       So a trail that holds two records wears both on one mount, and the board
       is filled back to four from a RESERVE of further records. Five crowns on
       four trails, all of them accurate. The reserve is ordered, so it also
       covers the day two more of them collide. */
    function buildRecords(hikes) {
        const TF = 'w_640,h_460,c_fill,g_auto,q_auto,f_auto';
        const MOUNTS = 4;
        const withMiles = hikes.filter(h => h.miles > 0);
        const withGain = hikes.filter(h => h.elevation_gain > 0);
        const summits = hikes.filter(h => h.summit_trail && h.summit_elevation);
        const grades = hikes.filter(h => h.miles >= 1 && h.elevation_gain > 0);
        const walked = hikes.filter(h => !isViewpoint(h));

        // The trail returned to most often — a standing record like any other,
        // and the one that is most this Atlas's own. Its mount shows the latest
        // visit, so the photograph is the freshest one of that ground.
        // groupByTrail returns a plain object keyed by trail_name (groupByTrip
        // returns a Map — they are not the same shape, so don't assume)
        let mostReturned = null;
        Object.entries(groupByTrail(walked)).forEach(([name, group]) => {
            if (group.length > 1 && (!mostReturned || group.length > mostReturned.n)) {
                mostReturned = { n: group.length, name, h: [...group].sort(compareHikesChronoDesc)[0] };
            }
        });

        const defs = [];
        const add = (pool, rank, label, fmt, unit) => {
            if (pool.length) { const h = maxBy(pool, rank); defs.push({ h, label, value: fmt(h), unit }); }
        };
        add(withMiles, x => x.miles, 'Longest Hike', h => h.miles.toFixed(1), 'mi');
        add(withGain, x => x.elevation_gain, 'Biggest Climb', h => h.elevation_gain.toLocaleString(), 'ft');
        add(summits, x => x.summit_elevation, 'Highest Summit', h => h.summit_elevation.toLocaleString(), 'ft');
        add(grades, x => x.elevation_gain / x.miles, 'Steepest Grade', h => Math.round(h.elevation_gain / h.miles).toLocaleString(), 'ft/mi');
        // ---- the reserve, drawn on only when the four above collide ----
        if (mostReturned) defs.push({ h: mostReturned.h, label: 'Most Returned To', value: mostReturned.n, unit: 'times' });
        add(hikes, x => x.latitude, 'Farthest North', h => `${h.latitude.toFixed(1)}°`, 'N');

        // Group crowns by trail, first-seen order, stopping once the board is
        // full — the reserve records are never reached unless they are needed.
        const order = [], byId = {};
        defs.forEach(d => {
            const id = d.h.trail_id;
            if (!byId[id] && order.length >= MOUNTS) return;
            if (!byId[id]) { byId[id] = { hike: d.h, crowns: [] }; order.push(id); }
            byId[id].crowns.push({ label: d.label, value: d.value, unit: d.unit });
        });

        const grid = document.getElementById('board-records');
        if (!grid) return;
        grid.innerHTML = order.map((id, i) => {
            const g = byId[id];
            return paperMount({
                href: `hike.html?id=${id}`, idx: i, crowns: g.crowns, name: g.hike.trail_name,
                meta: `${hikeYear(g.hike)} · ${g.hike.location}`, color: yearColor(hikeYear(g.hike)),
                img: lastPhoto(g.hike, TF), alt: g.hike.trail_name, ids: [id]
            });
        }).join('');
        crossLight(grid);
        evenColumns(grid, order.length);

        const crownCount = order.reduce((s, id) => s + byId[id].crowns.length, 0);
        const sub = document.getElementById('records-sub');
        if (sub) sub.textContent = `${crownCount} standing records across ${order.length} trails`;
    }

    // ---- The Expeditions: podium → trip pages ----
    function buildExpeditions(hikes) {
        const TF = 'w_640,h_460,c_fill,g_auto,q_auto,f_auto';
        const trips = [...groupByTrip(hikes).entries()].map(([tag, group]) => {
            const miles = group.reduce((s, h) => s + (h.miles || 0), 0);
            const days = new Set(group.map(h => h.date_completed)).size;
            const lead = [...group].sort(compareHikesChronoDesc)[0];  // the trip's most recent hike
            // viewpoints ride along on trips but aren't hikes — count them apart
            return { tag, miles, days, count: group.filter(h => !isViewpoint(h)).length, year: hikeYear(lead), lead, group };
        }).sort((a, b) => b.miles - a.miles);

        const RANK = ['', 'I', 'II', 'III'];   // engraved, not a coloured medal disc
        const card = (t, place, idx) => t ? paperMount({
            href: `trip.html?tag=${encodeURIComponent(t.tag)}`,
            cls: ['', 'gold', 'silver', 'bronze'][place], idx, rank: RANK[place],
            name: tripName(t.tag),
            meta: `${t.count} hikes · ${t.days} day${t.days > 1 ? 's' : ''} · ${t.year}`,
            color: yearColor(t.year),
            crowns: [{ label: 'Ground covered', value: t.miles.toFixed(1), unit: 'mi' }],
            /* THE PODIUM WEARS THE TRIP STAR. A chapter already has a
               hand-picked opening frame — the same one the trip page raises as
               its frontispiece — so an expedition mount should show it rather
               than reach for the last photo of the trip's last day. The crowns
               deliberately do NOT do this: a record moves to a new trail
               whenever one is beaten, and a curated-frame list that has to be
               updated every time a record falls is a system built to be
               forgotten. A trip is picked once, when it is added. */
            img: starPhoto(t, TF) || lastPhoto(t.lead, TF),
            alt: tripName(t.tag),
            // the whole chapter lights on the plate, not just its last day
            ids: t.group.map(h => h.trail_id)
        }) : '';

        const [first, second, third] = trips;
        // DOM order silver · gold · bronze so the winner sits raised in the middle
        const podium = document.getElementById('board-expeditions');
        if (!podium) return;
        podium.innerHTML = card(second, 2, 0) + card(first, 1, 1) + card(third, 3, 2);
        crossLight(podium);

        const extra = trips.length - 3;
        const note = document.getElementById('expeditions-note');
        if (note) note.textContent = extra > 0 ? `${extra} more expedition${extra > 1 ? 's' : ''} charted` : '';
    }

    // Reveal (and only then let the browser fetch the lazy photos) on scroll-in
    const io = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) { section.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    io.observe(section);
})();
