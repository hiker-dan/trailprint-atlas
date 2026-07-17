/**
 * The Record Books — the homepage's closer.
 * Two photo boards, each card a bridge into a deeper page:
 *   • The Records  — four standing crowns (longest, biggest climb, highest
 *                    summit, steepest grade) → the hike pages.
 *   • The Expeditions — the longest multi-day trips as a gold/silver/bronze
 *                    podium → the trip chapter pages.
 * Each card's photo is the LAST image in that hike's roster (so rarely-seen
 * final shots get a moment), lazy-loaded so nothing fetches until the section
 * scrolls into view. The superlatives live here on purpose — Threads of the
 * Trail carries only firsts + cumulative counts, so the two never repeat.
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

    // `crowns` is an array of { label, value, unit }. One crown renders a big
    // hero value; two or more (a hike that holds several records) render side by
    // side, each under its own label — one card celebrating the double.
    const valHtml = (c, extra) => `<div class="rb-val${extra ? ' ' + extra : ''}">${c.value}${c.unit ? `<small>${esc(c.unit)}</small>` : ''}</div>`;
    function photoCard({ href, cls, idx, medal, crowns, name, meta, color, img, alt }) {
        const bg = img
            ? `<img class="bg" loading="lazy" decoding="async" src="${img}" alt="${esc(alt || '')}">`
            : `<div class="bg-fallback" style="background:${color}"></div>`;
        const dot = color ? `<span class="yeardot" style="background:${color}"></span>` : '';
        const body = crowns.length === 1
            ? `${crowns[0].label ? `<div class="rb-kicker">${esc(crowns[0].label)}</div>` : ''}${valHtml(crowns[0])}`
            : `<div class="rb-crowns">${crowns.map(c => `<div class="rb-crown"><div class="rb-kicker">${esc(c.label)}</div>${valHtml(c, 'rb-val-sm')}</div>`).join('')}</div>`;
        return `<a class="rb-card ${cls || ''}" href="${href}" style="--i:${idx || 0}">
            ${bg}<div class="scrim"></div>
            ${medal ? `<div class="medal medal-${medal}">${medal}</div>` : ''}
            <div class="body">
                ${body}
                <div class="rb-cardname">${esc(name)}</div>
                <div class="rb-cardmeta">${dot}${esc(meta)}</div>
            </div>
        </a>`;
    }

    fetchHikes().then(hikes => {
        buildRecords(hikes);
        buildExpeditions(hikes);
    });

    // ---- The Records: the standing crowns → hike pages ----
    // Four record types (longest, biggest climb, highest summit, steepest grade),
    // but a single hike that wins more than one wears both crowns on one card —
    // so the board never shows the same trail twice.
    function buildRecords(hikes) {
        const TF = 'w_640,h_460,c_fill,g_auto,q_auto,f_auto';
        const withMiles = hikes.filter(h => h.miles > 0);
        const withGain = hikes.filter(h => h.elevation_gain > 0);
        const summits = hikes.filter(h => h.summit_trail && h.summit_elevation);
        const grades = hikes.filter(h => h.miles >= 1 && h.elevation_gain > 0);

        const defs = [];
        if (withMiles.length) { const h = maxBy(withMiles, x => x.miles); defs.push({ h, label: 'Longest Hike', value: h.miles.toFixed(1), unit: 'mi' }); }
        if (withGain.length) { const h = maxBy(withGain, x => x.elevation_gain); defs.push({ h, label: 'Biggest Climb', value: h.elevation_gain.toLocaleString(), unit: 'ft' }); }
        if (summits.length) { const h = maxBy(summits, x => x.summit_elevation); defs.push({ h, label: 'Highest Summit', value: h.summit_elevation.toLocaleString(), unit: 'ft' }); }
        if (grades.length) { const h = maxBy(grades, x => x.elevation_gain / x.miles); defs.push({ h, label: 'Steepest Grade', value: Math.round(h.elevation_gain / h.miles).toLocaleString(), unit: 'ft/mi' }); }

        // Group crowns by hike, preserving first-seen order
        const order = [], byId = {};
        defs.forEach(d => {
            const id = d.h.trail_id;
            if (!byId[id]) { byId[id] = { hike: d.h, crowns: [] }; order.push(id); }
            byId[id].crowns.push({ label: d.label, value: d.value, unit: d.unit });
        });

        const cards = order.map((id, i) => {
            const g = byId[id];
            return photoCard({
                href: `hike.html?id=${id}`, idx: i, crowns: g.crowns, name: g.hike.trail_name,
                meta: `${hikeYear(g.hike)} · ${g.hike.location}`, color: yearColor(hikeYear(g.hike)),
                img: lastPhoto(g.hike, TF), alt: g.hike.trail_name
            });
        });

        const grid = document.getElementById('board-records');
        if (grid) grid.innerHTML = cards.join('');

        const latest = [...hikes].sort(compareHikesChronoDesc)[0];
        const more = document.getElementById('records-more');
        if (more && latest) more.href = `hike.html?id=${latest.trail_id}`;
    }

    // ---- The Expeditions: podium → trip pages ----
    function buildExpeditions(hikes) {
        const TF = 'w_640,h_460,c_fill,g_auto,q_auto,f_auto';
        const trips = [...groupByTrip(hikes).entries()].map(([tag, group]) => {
            const miles = group.reduce((s, h) => s + (h.miles || 0), 0);
            const days = new Set(group.map(h => h.date_completed)).size;
            const lead = [...group].sort(compareHikesChronoDesc)[0];  // the trip's most recent hike
            return { tag, miles, days, count: group.length, year: hikeYear(lead), lead };
        }).sort((a, b) => b.miles - a.miles);

        const card = (t, place, idx) => t ? photoCard({
            href: `trip.html?tag=${encodeURIComponent(t.tag)}`,
            cls: ['', 'gold', 'silver', 'bronze'][place], idx, medal: place,
            name: t.tag.replace(/ - .*$/, ''),
            meta: `${t.count} hikes · ${t.days} day${t.days > 1 ? 's' : ''} · ${t.year}`,
            color: yearColor(t.year),
            crowns: [{ label: '', value: t.miles.toFixed(1), unit: 'mi' }],
            img: lastPhoto(t.lead, TF), alt: t.tag.replace(/ - .*$/, '')
        }) : '<div></div>';

        const [first, second, third] = trips;
        // DOM order silver · gold · bronze so the winner sits raised in the middle
        const podium = document.getElementById('board-expeditions');
        if (podium) podium.innerHTML = card(second, 2, 0) + card(first, 1, 1) + card(third, 3, 2);

        const extra = trips.length - 3;
        const note = document.getElementById('expeditions-note');
        if (note) note.textContent = extra > 0 ? `+ ${extra} more expedition${extra > 1 ? 's' : ''} charted across the Atlas` : '';
    }

    // Reveal (and only then let the browser fetch the lazy photos) on scroll-in
    const io = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) { section.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    io.observe(section);
})();
