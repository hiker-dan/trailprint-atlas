/**
 * Echoes of the Trail — the Atlas in the present tense.
 * Rebuilt July 2026 (replacing the Gemini-era sections moved off the homepage):
 *   Fresh Tracks  — the last page of the logbook: the five most recent hikes.
 *   Trail Echoes  — this month, in years past: anniversaries resurfacing on
 *                   their own, so the page changes with the calendar.
 *   The Local Loop — the Runyon Canyon record (data/local-loop.json): 54
 *                   recorded ascents of the hometown trail, 2022–2025, kept
 *                   deliberately OUTSIDE hikes.json so it never floods the
 *                   Atlas's stats, maps, or crew tallies.
 * Requires config.js + atlas-data.js.
 */
(function () {
    'use strict';

    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const yearColor = y => ATLAS_CONFIG.COLOR_MAP[String(y)] || ATLAS_CONFIG.DEFAULT_COLOR;
    const companions = h => (h.hiked_with && h.hiked_with.length) ? 'with ' + h.hiked_with.join(', ') : 'solo';
    const photo = (h, tf) => (h.images && h.images.length) ? cloudinaryUrl(h.images[0], tf) : null;

    fetchHikes().then(hikes => {
        buildFreshTracks(hikes);
        buildTrailEchoes(hikes);
    });
    fetch('data/local-loop.json').then(r => r.json()).then(buildLocalLoop);

    // ---- The page's photo lightbox (same conventions as the hike page) ----
    let lb = null, lbIds = [], lbIdx = 0;
    function openLightbox(ids, i) {
        if (!lb) {
            lb = document.createElement('div');
            lb.className = 'echo-lightbox';
            lb.innerHTML = `<span class="lb-close">&times;</span>
                <button class="lb-nav lb-prev" type="button">&#8249;</button>
                <img class="lb-main" alt="Trail photograph">
                <button class="lb-nav lb-next" type="button">&#8250;</button>`;
            document.body.appendChild(lb);
            lb.querySelector('.lb-close').addEventListener('click', () => lb.classList.remove('visible'));
            lb.addEventListener('click', e => { if (e.target === lb) lb.classList.remove('visible'); });
            lb.querySelector('.lb-prev').addEventListener('click', () => showLb(lbIdx - 1));
            lb.querySelector('.lb-next').addEventListener('click', () => showLb(lbIdx + 1));
            document.addEventListener('keydown', e => {
                if (!lb.classList.contains('visible')) return;
                if (e.key === 'Escape') lb.classList.remove('visible');
                if (e.key === 'ArrowLeft') showLb(lbIdx - 1);
                if (e.key === 'ArrowRight') showLb(lbIdx + 1);
            });
        }
        lbIds = ids;
        showLb(i);
        lb.classList.add('visible');
    }
    function showLb(i) {
        lbIdx = (i + lbIds.length) % lbIds.length;
        const T = 'w_1600,h_1200,c_limit,q_auto,f_auto';
        // warm both directions so flipping in order always lands sharp
        blurUpShow(lb.querySelector('.lb-main'), lbIds[lbIdx], T,
            [lbIds[(lbIdx + 1) % lbIds.length], lbIds[(lbIdx - 1 + lbIds.length) % lbIds.length]]);
    }

    // ============ Fresh Tracks: the last page of the logbook ============
    function buildFreshTracks(hikes) {
        const mount = document.getElementById('fresh-tracks');
        if (!mount) return;
        const recent = [...hikes].sort(compareHikesChronoDesc).slice(0, 5);
        if (!recent.length) return;
        const [latest, ...rest] = recent;

        // The newest entry gets the full spread: photograph + details
        const img = photo(latest, 'w_680,h_460,c_fill,g_auto,q_auto,f_auto');
        const feat = document.createElement('a');
        feat.className = 'ft-featured';
        feat.href = 'hike.html?id=' + latest.trail_id;
        feat.innerHTML = `
            ${img ? `<div class="ft-photo"><img loading="lazy" src="${img}" alt="${latest.trail_name}"></div>` : ''}
            <div class="ft-featured-body">
                <div class="ft-eyebrow">Latest entry</div>
                <h3 class="ft-name">${latest.trail_name}</h3>
                <div class="ft-meta">${formatHikeDate(latest.date_completed)} · ${latest.location}</div>
                <div class="ft-meta2">${companions(latest)}</div>
                <div class="ft-stats">
                    <span><b>${(latest.miles || 0).toFixed(1)}</b> mi</span>
                    <span><b>${(latest.elevation_gain || 0).toLocaleString()}</b> ft gain</span>
                    <span>${latest.hike_type}</span>
                </div>
            </div>`;
        mount.appendChild(feat);

        // The four entries before it, as ruled register lines
        const reg = document.createElement('div');
        reg.className = 'ft-register';
        rest.forEach(h => {
            const d = new Date(h.date_completed);
            const row = document.createElement('a');
            row.className = 'ft-row';
            row.href = 'hike.html?id=' + h.trail_id;
            row.innerHTML = `
                <span class="ft-row-date">${MON[d.getUTCMonth()]} ${d.getUTCDate()}<em>${d.getUTCFullYear()}</em></span>
                <span class="ft-row-main"><span class="ft-row-name">${h.trail_name}</span>
                    <span class="ft-row-loc">${h.location} · ${companions(h)}</span></span>
                <span class="ft-row-stats">${(h.miles || 0).toFixed(1)} mi · ${(h.elevation_gain || 0).toLocaleString()} ft</span>`;
            reg.appendChild(row);
        });
        mount.appendChild(reg);

        // the doorway out: the register continues in the full logbook
        // (always the newest hike — bare hike.html has no fallback and 404s)
        const more = document.createElement('a');
        more.className = 'ft-more';
        more.href = 'hike.html?id=' + latest.trail_id;
        more.innerHTML = 'Into the full logbook <span class="arw">&rarr;</span>';
        mount.appendChild(more);
    }

    // ============ Trail Echoes: this month, in years past ============
    function buildTrailEchoes(hikes) {
        const mount = document.getElementById('trail-echoes');
        if (!mount) return;
        const now = new Date();
        const m = now.getUTCMonth(), thisYear = now.getUTCFullYear();

        const sub = document.getElementById('echoes-month');
        if (sub) sub.textContent = `outings that happened in ${FULL[m]}, in years past`;

        const byYear = new Map();
        hikes.filter(h => hikeMonth(h) === m && hikeYear(h) < thisYear)
            .sort(compareHikesChrono)
            .forEach(h => {
                const y = hikeYear(h);
                if (!byYear.has(y)) byYear.set(y, []);
                byYear.get(y).push(h);
            });

        if (!byYear.size) {
            mount.innerHTML = `<p class="echo-empty">No echoes this month. ${FULL[m]} is still waiting for its first trail.</p>`;
            return;
        }

        // Newest years first, at most two echoes per year, six on the page
        const cards = [];
        [...byYear.keys()].sort((a, b) => b - a).forEach(y => {
            const pool = byYear.get(y);
            // prefer the most substantial days of that month
            pool.sort((a, b) => (b.miles || 0) - (a.miles || 0));
            pool.slice(0, 2).forEach(h => cards.push({ h, y }));
        });

        // Scattered like snapshots in a scrapbook: each card takes a small,
        // deterministic tilt and drop so the pile looks hand-laid but never
        // moves between visits, and the pile centres itself at any count.
        const ROT = [-2.4, 1.9, -1.3, 2.6, -3.1, 1.2];
        const TY = [8, -10, 3, -6, 12, 0];
        cards.slice(0, 6).forEach(({ h, y }, i) => {
            const ago = thisYear - y;
            const img = photo(h, 'w_480,h_360,c_fill,g_auto,q_auto,f_auto');
            const d = new Date(h.date_completed);
            const card = document.createElement('a');
            card.className = 'echo-card' + (img ? '' : ' echo-card-note');
            card.href = 'hike.html?id=' + h.trail_id;
            card.style.setProperty('--yc', yearColor(y));
            card.style.setProperty('--rot', ROT[i % ROT.length] + 'deg');
            card.style.setProperty('--ty', TY[i % TY.length] + 'px');
            // A hike with no photograph becomes a field note: a postmark
            // stamp instead of a broken-looking empty frame.
            const visual = img
                ? `<div class="echo-photo"><img loading="lazy" src="${img}" alt="${h.trail_name}"></div>`
                : `<div class="echo-postmark"><span class="echo-postmark-mon">${MON[d.getUTCMonth()]} ${d.getUTCDate()}</span><span class="echo-postmark-yr">${y}</span></div>`;
            card.innerHTML = `${visual}
                <div class="echo-body">
                    <div class="echo-ago">${ago} year${ago === 1 ? '' : 's'} ago this month</div>
                    <div class="echo-name">${h.trail_name}</div>
                    <div class="echo-meta">${formatHikeDate(h.date_completed)} · ${h.location}</div>
                </div>`;
            mount.appendChild(card);
        });
    }

    // ============ The Local Loop: the Runyon Canyon record ============
    function buildLocalLoop(loop) {
        const mount = document.getElementById('loop-tally');
        if (!mount) return;
        const ascents = loop.ascents;
        const first = ascents[0], last = ascents[ascents.length - 1];

        // --- The tally wall: every ascent a hand-scored mark, five to a gate ---
        const byYear = new Map();
        ascents.forEach(a => {
            const y = a.date.slice(0, 4);
            byYear.set(y, (byYear.get(y) || 0) + 1);
        });
        const years = [...byYear.keys()].sort();
        const rowH = 64, markH = 30, labelW = 74, gateW = 34, gapW = 16;
        const maxCount = Math.max(...byYear.values());
        const W = labelW + Math.ceil(maxCount / 5) * (gateW + gapW) + 60;
        const H = years.length * rowH + 8;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.setAttribute('class', 'tally-svg');
        // deterministic hand-wobble so the wall is the same on every visit
        let s = 41;
        const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
        years.forEach((y, yi) => {
            const yTop = yi * rowH + 18;
            const label = document.createElementNS(svg.namespaceURI, 'text');
            label.setAttribute('x', 0); label.setAttribute('y', yTop + markH - 6);
            label.setAttribute('class', 'tally-year');
            label.textContent = y;
            svg.appendChild(label);
            const count = byYear.get(y), color = yearColor(y);
            for (let k = 0; k < count; k++) {
                const gate = Math.floor(k / 5), pos = k % 5;
                const gx = labelW + gate * (gateW + gapW);
                const line = document.createElementNS(svg.namespaceURI, 'line');
                if (pos < 4) {
                    const x = gx + pos * 8 + (rnd() - 0.5) * 1.6;
                    line.setAttribute('x1', (x + (rnd() - 0.5) * 2).toFixed(1));
                    line.setAttribute('y1', yTop + (rnd() - 0.5) * 2.4);
                    line.setAttribute('x2', (x + (rnd() - 0.5) * 2).toFixed(1));
                    line.setAttribute('y2', yTop + markH + (rnd() - 0.5) * 2.4);
                } else {
                    // the fifth stroke bars the gate
                    line.setAttribute('x1', gx - 4 + (rnd() - 0.5) * 2);
                    line.setAttribute('y1', yTop + markH - 3 + (rnd() - 0.5) * 2);
                    line.setAttribute('x2', gx + 28 + (rnd() - 0.5) * 2);
                    line.setAttribute('y2', yTop + 3 + (rnd() - 0.5) * 2);
                }
                line.setAttribute('stroke', color);
                line.setAttribute('stroke-width', 2.6);
                line.setAttribute('stroke-linecap', 'round');
                svg.appendChild(line);
            }
            const ct = document.createElementNS(svg.namespaceURI, 'text');
            ct.setAttribute('x', labelW + Math.ceil(count / 5) * (gateW + gapW) + 2);
            ct.setAttribute('y', yTop + markH - 6);
            ct.setAttribute('class', 'tally-count');
            ct.textContent = count;
            svg.appendChild(ct);
        });
        mount.appendChild(svg);

        // --- The record's corners: totals, first ascent, last hurrah ---
        const fmtLong = d => { const dt = new Date(d); return `${FULL[dt.getUTCMonth()]} ${dt.getUTCDate()}, ${dt.getUTCFullYear()}`; };
        const stats = document.getElementById('loop-stats');
        if (stats) stats.innerHTML = `
            <div class="loop-stat"><div class="loop-stat-v">${ascents.length}</div><div class="loop-stat-l">recorded ascents</div></div>
            <div class="loop-stat"><div class="loop-stat-v">${first.date.slice(0, 4)}–${last.date.slice(0, 4)}</div><div class="loop-stat-l">the era</div></div>
            <div class="loop-stat"><div class="loop-stat-v">${new Set(ascents.flatMap(a => a.with)).size}</div><div class="loop-stat-l">companions brought along</div></div>`;
        const book = document.getElementById('loop-bookends');
        if (book) book.innerHTML = `
            <div class="loop-bookend"><div class="loop-bookend-l">First ascent</div>
                <div class="loop-bookend-v">${fmtLong(first.date)}</div>
                <div class="loop-bookend-m">with ${first.with.join(', ').replace(/, ([^,]*)$/, ' and $1')}</div></div>
            <div class="loop-bookend"><div class="loop-bookend-l">The last hurrah</div>
                <div class="loop-bookend-v">${fmtLong(last.date)}</div>
                <div class="loop-bookend-m">solo, days before moving away</div></div>`;

        // --- The two versions: both custom routes, drawn to scale ---
        // A field sketch, not a map: the loops' true shapes with the three
        // landmarks of the ritual (Fuller entrance, the benches, Mulholland).
        const routesMount = document.getElementById('loop-routes');
        const routes = loop.routes || [];
        if (routesMount && routes.length) {
            const all = routes.flatMap(r => r.points);
            const lats = all.map(p => p[0]), lons = all.map(p => p[1]);
            const latMin = Math.min(...lats), latMax = Math.max(...lats);
            const lonMin = Math.min(...lons), lonMax = Math.max(...lons);
            const kx = Math.cos((latMin + latMax) / 2 * Math.PI / 180);
            const spanX = (lonMax - lonMin) * kx, spanY = latMax - latMin;
            const W = 440, H = 330, pad = 40;
            const sc = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY);
            const ox = (W - spanX * sc) / 2, oy = (H - spanY * sc) / 2;
            const X = p => (ox + (p[1] - lonMin) * kx * sc).toFixed(1);
            const Y = p => (oy + (latMax - p[0]) * sc).toFixed(1);
            const rsvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            rsvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
            rsvg.setAttribute('class', 'route-svg');
            const ROUTE_STYLE = [
                { stroke: '#4a7c59', width: 2.6, dash: null },
                { stroke: '#b77d52', width: 2.2, dash: '7 5' }
            ];
            // the long route first, so the shared climb reads as the short route
            [...routes].reverse().forEach((r, ri) => {
                const st = ROUTE_STYLE[routes.length - 1 - ri] || ROUTE_STYLE[0];
                const path = document.createElementNS(rsvg.namespaceURI, 'path');
                path.setAttribute('d', 'M' + r.points.map(p => `${X(p)},${Y(p)}`).join(' L'));
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke', st.stroke);
                path.setAttribute('stroke-width', st.width);
                if (st.dash) path.setAttribute('stroke-dasharray', st.dash);
                path.setAttribute('stroke-linejoin', 'round');
                path.setAttribute('stroke-linecap', 'round');
                rsvg.appendChild(path);
            });
            (loop.landmarks || []).forEach(lm => {
                const p = [lm.lat, lm.lon];
                const dot = document.createElementNS(rsvg.namespaceURI, 'circle');
                dot.setAttribute('cx', X(p)); dot.setAttribute('cy', Y(p));
                dot.setAttribute('r', 4.5); dot.setAttribute('fill', '#fffdf6');
                dot.setAttribute('stroke', '#6b5136'); dot.setAttribute('stroke-width', 2);
                rsvg.appendChild(dot);
                const rightSide = +X(p) < W * 0.55;
                ['route-label-halo', 'route-label'].forEach(cls => {
                    const t = document.createElementNS(rsvg.namespaceURI, 'text');
                    t.setAttribute('x', +X(p) + (rightSide ? 10 : -10));
                    t.setAttribute('y', +Y(p) + 4);
                    t.setAttribute('text-anchor', rightSide ? 'start' : 'end');
                    t.setAttribute('class', cls);
                    t.textContent = lm.name;
                    rsvg.appendChild(t);
                });
            });
            // a small north arrow, since this is a sketch and not a map
            const nx = W - 22, ny = 34;
            const na = document.createElementNS(rsvg.namespaceURI, 'line');
            na.setAttribute('x1', nx); na.setAttribute('y1', ny); na.setAttribute('x2', nx); na.setAttribute('y2', ny - 16);
            na.setAttribute('stroke', '#8a7649'); na.setAttribute('stroke-width', 1.6);
            rsvg.appendChild(na);
            const nh = document.createElementNS(rsvg.namespaceURI, 'path');
            nh.setAttribute('d', `M${nx - 4},${ny - 12} L${nx},${ny - 19} L${nx + 4},${ny - 12}`);
            nh.setAttribute('fill', 'none'); nh.setAttribute('stroke', '#8a7649'); nh.setAttribute('stroke-width', 1.6);
            rsvg.appendChild(nh);
            const nt = document.createElementNS(rsvg.namespaceURI, 'text');
            nt.setAttribute('x', nx); nt.setAttribute('y', ny + 13); nt.setAttribute('text-anchor', 'middle');
            nt.setAttribute('class', 'route-label'); nt.textContent = 'N';
            rsvg.appendChild(nt);
            routesMount.appendChild(rsvg);

            const legend = document.getElementById('loop-legend');
            if (legend) legend.innerHTML = routes.map((r, i) => {
                const st = ROUTE_STYLE[i] || ROUTE_STYLE[0];
                return `<div class="loop-legend-row"><span class="loop-legend-sw" style="background:${st.stroke};${st.dash ? 'background:repeating-linear-gradient(90deg,' + st.stroke + ' 0 7px,transparent 7px 12px);' : ''}"></span>
                    <b>${r.name}</b> · ${r.miles.toFixed(1)} mi · ${r.gain_ft.toLocaleString()} ft · ${r.note}</div>`;
            }).join('');

            // honest math under the tally wall: nobody logged which version was
            // which, so the total is a range, and proudly so
            const math_ = document.getElementById('loop-math');
            if (math_) {
                const lo = Math.round(ascents.length * Math.min(...routes.map(r => r.miles)));
                const hi = Math.round(ascents.length * Math.max(...routes.map(r => r.miles)));
                const gainLo = Math.floor(ascents.length * Math.min(...routes.map(r => r.gain_ft)) / 1000) * 1000;
                math_.innerHTML = `Between the two versions, that is somewhere between <b>${lo}</b> and <b>${hi} miles</b>, and at least <b>${gainLo.toLocaleString()} ft</b> of climbing, all on the same hill.`;
            }
        }

        // --- Outbound: the loop on the wider record ---
        const links = document.getElementById('loop-links');
        if (links && loop.links) links.innerHTML =
            `<a href="${loop.links.alltrails}" target="_blank" rel="noopener">the loop on AllTrails</a>
             <span>·</span>
             <a href="${loop.links.official}" target="_blank" rel="noopener">Runyon Canyon Park, LA City Parks</a>`;

        // --- From the top of the hill: the photographs ---
        // Clicking opens the site's own lightbox (same conventions as the hike
        // page's photo modal) — never a bare Cloudinary tab.
        const strip = document.getElementById('loop-photos');
        if (strip && loop.photos) loop.photos.forEach((pid, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'loop-photo';
            btn.innerHTML = `<img loading="lazy" src="${cloudinaryUrl(pid, 'w_360,h_270,c_fill,g_auto,q_auto,f_auto')}" alt="From the top of Runyon Canyon">`;
            // hovering signals intent: start the full photo now, so the click
            // usually opens straight onto the sharp image
            btn.addEventListener('pointerenter', () => blurUpPreload(cloudinaryUrl(pid, 'w_1600,h_1200,c_limit,q_auto,f_auto')), { once: true });
            btn.addEventListener('click', () => openLightbox(loop.photos, i));
            strip.appendChild(btn);
        });

        // --- The roll-call: everyone ever brought up the hill ---
        const roll = document.getElementById('loop-rollcall');
        if (roll) {
            const counts = {};
            ascents.forEach(a => a.with.forEach(n => { counts[n] = (counts[n] || 0) + 1; }));
            Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).forEach(([name, c]) => {
                const chip = document.createElement('a');
                chip.className = 'loop-chip';
                chip.href = 'crew.html';
                chip.innerHTML = `${name}${c > 1 ? ` <em>×${c}</em>` : ''}`;
                roll.appendChild(chip);
            });
        }
    }
})();
