/**
 * The Observatory — the homepage's deep-data section.
 * Explores five years of trails from every angle. Photo-free by design.
 * Panels are built one by one below; this file grows through Phase D.
 * Requires config.js + atlas-data.js. Added July 2026 (home redesign).
 *
 * Panel 1 — Territories: a growing grid of the states (and, later, countries)
 * you've set foot in. Each tile is that place's real silhouette (reused from
 * assets/blank-us-map.svg), tinted by how much you've hiked there — a collection
 * that deepens and widens as the Atlas grows. Deliberately NOT the hero map.
 */
(function () {
    'use strict';

    const section = document.querySelector('.obs-section');
    if (!section) return;

    const SVGNS = 'http://www.w3.org/2000/svg';
    const svgEl = (tag, attrs) => { const n = document.createElementNS(SVGNS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };

    // Sequential green ramp for density (light → dark = fewer → more hikes)
    const GREEN = ['#d8e6d0', '#a9cca2', '#79ac80', '#4a7c59', '#2f5c40'];
    const densityColor = h => h >= 50 ? GREEN[4] : h >= 16 ? GREEN[3] : h >= 6 ? GREEN[2] : h >= 2 ? GREEN[1] : GREEN[0];

    const STATE_NAMES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia' };
    const US_ABBRS = new Set(Object.keys(STATE_NAMES));

    const yearColor = y => ATLAS_CONFIG.COLOR_MAP[String(y)] || ATLAS_CONFIG.DEFAULT_COLOR;

    // Shared hover tooltip for the Observatory charts
    const tip = document.getElementById('obs-tip');
    const showTip = (html, ev) => { if (!tip) return; tip.innerHTML = html; tip.classList.add('show'); moveTip(ev); };
    const moveTip = ev => {
        if (!tip) return;
        const w = tip.offsetWidth || 200, h = tip.offsetHeight || 80;
        let x = ev.clientX + 14, y = ev.clientY + 14;
        if (x + w > window.innerWidth - 8) x = ev.clientX - w - 14;
        if (y + h > window.innerHeight - 8) y = ev.clientY - h - 14;
        tip.style.left = x + 'px'; tip.style.top = y + 'px';
    };
    const hideTip = () => tip && tip.classList.remove('show');

    Promise.all([
        fetchHikes(),
        fetch('assets/blank-us-map.svg').then(r => r.text())
    ]).then(([hikes, usSvgText]) => {
        buildProfile(hikes);
        buildEffortField(hikes);
        buildTerritories(hikes, usSvgText);
        buildSkyline(hikes);
        buildCadence(hikes);
        buildBiomes(hikes);
    });

    // ============ Profile line (replaces the old radar) ============
    function buildProfile(hikes) {
        const el = document.getElementById('obs-profile');
        if (!el) return;
        const count = (field) => { const c = {}; hikes.forEach(h => { c[h[field]] = (c[h[field]] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]; };
        const topBiome = count('primary_geography');
        const topSize = count('hike_size');
        const sizeWord = { Solo: 'often-solo', Duo: 'duo-hiking', Group: 'crew-leading' }[topSize] || topSize.toLowerCase();
        const totalElev = hikes.reduce((s, h) => s + (h.elevation_gain || 0), 0);
        const vertMiles = (totalElev / 5280).toFixed(1);
        const summits = new Set(hikes.filter(h => h.summit_trail && h.summit_elevation).map(h => h.trail_name)).size;
        const states = new Set(hikes.map(h => (h.region || '').split(', ').pop()).filter(Boolean)).size;
        el.innerHTML = `You're a <b>${topBiome.toLowerCase()}</b>-loving, <b>${sizeWord}</b> explorer who has climbed
            <b>${vertMiles} vertical miles</b>, stood on <b>${summits} summits</b>, and left tracks across <b>${states} states</b>.`;
    }

    // ============ The Effort Field (distance × climb scatter) ============
    function buildEffortField(hikes) {
        const mount = document.getElementById('effort-field');
        if (!mount) return;
        const data = hikes.filter(h => (h.miles || 0) > 0 || (h.elevation_gain || 0) > 0);
        const W = 920, H = 440, ML = 62, MR = 24, MT = 20, MB = 54;
        const plotW = W - ML - MR, plotH = H - MT - MB;
        const maxMi = Math.max(4, Math.ceil(Math.max(...data.map(h => h.miles || 0))));
        const maxGain = Math.ceil(Math.max(...data.map(h => h.elevation_gain || 0)) / 500) * 500;
        const sx = mi => ML + (mi / maxMi) * plotW;
        const sy = g => MT + plotH - (g / maxGain) * plotH;
        const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ef-svg' });

        // gridlines + y labels (feet)
        for (let g = 0; g <= maxGain; g += 500) {
            const y = sy(g);
            svg.appendChild(svgEl('line', { x1: ML, y1: y, x2: ML + plotW, y2: y, stroke: '#efe7d4', 'stroke-width': 1 }));
            const t = svgEl('text', { x: ML - 8, y: y + 3, 'text-anchor': 'end', class: 'ef-axis' });
            t.textContent = g.toLocaleString(); svg.appendChild(t);
        }
        // x labels (miles)
        for (let mi = 0; mi <= maxMi; mi += 2) {
            const x = sx(mi);
            const t = svgEl('text', { x, y: MT + plotH + 18, 'text-anchor': 'middle', class: 'ef-axis' });
            t.textContent = mi; svg.appendChild(t);
        }
        // axes
        svg.appendChild(svgEl('line', { x1: ML, y1: MT, x2: ML, y2: MT + plotH, stroke: '#d8ccae', 'stroke-width': 1.2 }));
        svg.appendChild(svgEl('line', { x1: ML, y1: MT + plotH, x2: ML + plotW, y2: MT + plotH, stroke: '#d8ccae', 'stroke-width': 1.2 }));
        const xtitle = svgEl('text', { x: ML + plotW / 2, y: H - 6, 'text-anchor': 'middle', class: 'ef-title' }); xtitle.textContent = 'Distance (miles)'; svg.appendChild(xtitle);
        const ytitle = svgEl('text', { x: 15, y: MT + plotH / 2, 'text-anchor': 'middle', class: 'ef-title', transform: `rotate(-90 15 ${MT + plotH / 2})` }); ytitle.textContent = 'Elevation gain (ft)'; svg.appendChild(ytitle);

        // dots
        const dots = [];
        data.forEach(h => {
            const isSummit = h.summit_trail && h.summit_elevation;
            const yr = hikeYear(h);
            const dot = svgEl('circle', {
                cx: sx(h.miles || 0), cy: sy(h.elevation_gain || 0), r: 5.5,
                fill: yearColor(yr), stroke: isSummit ? '#2c3e50' : '#fffdf6',
                'stroke-width': isSummit ? 2 : 1.4, class: 'ef-dot'
            });
            dot.dataset.year = yr;
            dot.addEventListener('mouseenter', ev => {
                dot.setAttribute('r', 8);
                showTip(`<div class="tt-title">${h.trail_name}</div><div class="tt-sub">${(h.miles || 0).toFixed(1)} mi · ${(h.elevation_gain || 0).toLocaleString()} ft${isSummit ? ' · summit' : ''}</div><div class="tt-sub">${formatHikeDate(h.date_completed)}</div>`, ev);
            });
            dot.addEventListener('mousemove', moveTip);
            dot.addEventListener('mouseleave', () => { dot.setAttribute('r', 5.5); hideTip(); });
            svg.appendChild(dot);
            dots.push(dot);
        });
        mount.appendChild(svg);

        // Interactive year legend: click a year to isolate it, click again to restore.
        const legend = document.getElementById('ef-legend');
        const years = [...new Set(data.map(h => hikeYear(h)))].sort();
        let isolated = null;
        years.forEach(y => {
            const chip = document.createElement('button');
            chip.className = 'ef-chip';
            chip.innerHTML = `<span class="ef-sw" style="background:${yearColor(y)}"></span>${y}`;
            chip.onclick = () => {
                isolated = (isolated === y) ? null : y;
                document.querySelectorAll('.ef-chip').forEach(c => c.classList.remove('active'));
                if (isolated !== null) chip.classList.add('active');
                dots.forEach(d => d.style.opacity = (isolated === null || +d.dataset.year === isolated) ? '' : '0.12');
            };
            legend.appendChild(chip);
        });
        const ring = document.createElement('span');
        ring.className = 'ef-chip ef-chip-static';
        ring.innerHTML = `<span class="ef-sw ef-sw-ring"></span>summit`;
        legend.appendChild(ring);
    }

    // ============ The Skyline (summits as a to-scale range) ============
    function buildSkyline(hikes) {
        const mount = document.getElementById('skyline');
        if (!mount) return;
        // One entry per peak (a repeated summit keeps its highest reading)
        const byPeak = {};
        hikes.filter(h => h.summit_trail && h.summit_elevation).forEach(h => {
            const k = h.trail_name;
            if (!byPeak[k] || h.summit_elevation > byPeak[k].summit_elevation) byPeak[k] = h;
        });
        const peaks = Object.values(byPeak).sort((a, b) => b.summit_elevation - a.summit_elevation);
        if (!peaks.length) return;

        // Bitonic arrangement: tallest in the middle, stepping down to both sides.
        const arranged = [];
        peaks.forEach((p, i) => { if (i % 2 === 0) arranged.push(p); else arranged.unshift(p); });

        const W = 920, H = 380, MB = 46, MT = 26, ML = 52, MR = 20;
        const plotW = W - ML - MR, plotH = H - MT - MB;
        const baseY = MT + plotH;
        const maxElev = peaks[0].summit_elevation;
        const elevMax = Math.ceil(maxElev / 2000) * 2000;
        const scaleY = e => (e / elevMax) * plotH;
        const n = arranged.length;
        const slotW = plotW / n;
        const peakW = slotW * 1.5; // overlap neighbours for a range feel
        const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sky-svg' });

        // elevation gridlines
        for (let e = 2000; e <= elevMax; e += 2000) {
            const y = baseY - scaleY(e);
            svg.appendChild(svgEl('line', { x1: ML, y1: y, x2: ML + plotW, y2: y, stroke: '#e8dfc8', 'stroke-width': 1, 'stroke-dasharray': '2 4' }));
            const t = svgEl('text', { x: ML - 8, y: y + 3, 'text-anchor': 'end', class: 'sky-axis' });
            t.textContent = (e / 1000) + 'k'; svg.appendChild(t);
        }
        svg.appendChild(svgEl('line', { x1: ML, y1: baseY, x2: ML + plotW, y2: baseY, stroke: '#b9a97f', 'stroke-width': 1.5 }));

        // Draw shortest→tallest so taller peaks sit in front; atmospheric colour by height.
        const lerp = (a, b, t) => Math.round(a + (b - a) * t);
        const heightColor = e => {
            const t = e / maxElev;
            return `rgb(${lerp(150, 47, t)},${lerp(174, 92, t)},${lerp(150, 64, t)})`; // sage → deep evergreen
        };
        const order = arranged.map((p, i) => ({ p, i })).sort((a, b) => a.p.summit_elevation - b.p.summit_elevation);
        order.forEach(({ p, i }) => {
            const cx = ML + slotW * (i + 0.5);
            const ph = scaleY(p.summit_elevation);
            const topY = baseY - ph;
            const half = peakW / 2;
            // a mountain with a slightly irregular ridge
            const d = `M${cx - half},${baseY} L${cx - half * 0.28},${baseY - ph * 0.62} L${cx},${topY} L${cx + half * 0.34},${baseY - ph * 0.58} L${cx + half},${baseY} Z`;
            svg.appendChild(svgEl('path', { d, fill: heightColor(p.summit_elevation), stroke: '#2f5c40', 'stroke-width': 0.8, 'stroke-opacity': 0.4, 'stroke-linejoin': 'round' }));
            // snowcap on the high peaks
            if (p.summit_elevation > maxElev * 0.82) {
                const capH = ph * 0.16;
                svg.appendChild(svgEl('path', { d: `M${cx - half * 0.16},${topY + capH} L${cx},${topY} L${cx + half * 0.2},${topY + capH} L${cx + half * 0.06},${topY + capH * 0.7} L${cx},${topY + capH * 0.9} L${cx - half * 0.06},${topY + capH * 0.7} Z`, fill: '#fdfdfb', 'fill-opacity': 0.9 }));
            }
            // hit area + hover
            const hit = svgEl('path', { d, fill: 'transparent', class: 'sky-hit' });
            hit.addEventListener('mouseenter', ev => showTip(`<div class="tt-title">${p.trail_name}</div><div class="tt-sub">${p.summit_elevation.toLocaleString()} ft · ${p.location}</div><div class="tt-sub">${formatHikeDate(p.date_completed)}</div>`, ev));
            hit.addEventListener('mousemove', moveTip);
            hit.addEventListener('mouseleave', hideTip);
            svg.appendChild(hit);
        });

        // A concise display name for a peak (drops trail suffixes, shortens "Mountain").
        const shortPeak = n => n.replace(/ via .*/i, '').replace(/:.*/, '').replace(/\s*(Loop )?Trail$/i, '').replace(/ Loop$/i, '').replace(/\bMountain\b/i, 'Mtn').trim();

        // Label only the tallest peak on the chart (its neighbours are unlabelled,
        // so nothing collides); everything else reveals on hover.
        const ti = arranged.indexOf(peaks[0]);
        const tcx = ML + slotW * (ti + 0.5);
        const tTopY = baseY - scaleY(peaks[0].summit_elevation);
        ['sky-label-halo', 'sky-label'].forEach(cls => {
            const t = svgEl('text', { x: tcx, y: tTopY - 19, 'text-anchor': 'middle', class: cls });
            t.textContent = shortPeak(peaks[0].trail_name); svg.appendChild(t);
        });
        const te = svgEl('text', { x: tcx, y: tTopY - 8, 'text-anchor': 'middle', class: 'sky-elev' });
        te.textContent = peaks[0].summit_elevation.toLocaleString() + ' ft'; svg.appendChild(te);

        mount.appendChild(svg);
        const sub = document.getElementById('sky-count');
        if (sub) sub.textContent = `${peaks.length} peaks, tallest to ${maxElev.toLocaleString()} ft`;
        const cap = document.getElementById('sky-caption');
        if (cap) cap.innerHTML = 'Highest: ' + peaks.slice(0, 3).map(p => `<b>${shortPeak(p.trail_name)}</b> ${p.summit_elevation.toLocaleString()} ft`).join('&nbsp;&nbsp;·&nbsp;&nbsp;');
    }

    function buildTerritories(hikes, usSvgText) {
        // --- Per-territory tally ---
        const byTerr = {};
        hikes.forEach(h => {
            const abbr = (h.region || '').split(', ').pop().trim();
            if (!abbr) return;
            if (!byTerr[abbr]) byTerr[abbr] = { abbr, hikes: 0, miles: 0, trails: new Set(), dates: [] };
            byTerr[abbr].hikes++;
            byTerr[abbr].miles += h.miles || 0;
            byTerr[abbr].trails.add(h.trail_name);
            byTerr[abbr].dates.push(h.date_completed);
        });
        const terrs = Object.values(byTerr).sort((a, b) => b.hikes - a.hikes);

        // --- A hidden master SVG so we can measure each state path's bbox ---
        const usDoc = new DOMParser().parseFromString(usSvgText, 'image/svg+xml');
        const master = svgEl('svg', { viewBox: '0 0 959 593' });
        master.style.cssText = 'position:absolute;left:-9999px;top:0;width:959px;height:593px;opacity:0;pointer-events:none';
        document.body.appendChild(master);

        const grid = document.getElementById('terr-grid');
        if (!grid) return;
        let usStates = 0, countries = 0;

        terrs.forEach(t => {
            const isUS = US_ABBRS.has(t.abbr);
            if (isUS) usStates++; else countries++;

            const tile = document.createElement('a');
            tile.className = 'terr-tile';
            // US states deep-link the interactive map straight to that state's hikes.
            tile.href = isUS ? `map.html?state=${t.abbr}` : 'map.html';
            tile.title = `${STATE_NAMES[t.abbr] || t.abbr}: ${t.hikes} hikes, ${t.trails.size} trails, ${Math.round(t.miles)} mi`;

            const silo = document.createElement('div');
            silo.className = 'terr-silo';

            // Reuse the real state silhouette from the US map asset
            const srcPaths = usDoc.querySelectorAll('.' + t.abbr.toLowerCase());
            if (isUS && srcPaths.length) {
                const d = Array.from(srcPaths).map(p => p.getAttribute('d')).filter(Boolean).join(' ');
                const measure = svgEl('path', { d });
                master.appendChild(measure);
                const bb = measure.getBBox();
                const pad = Math.max(bb.width, bb.height) * 0.06 + 2;
                const tsvg = svgEl('svg', { viewBox: `${bb.x - pad} ${bb.y - pad} ${bb.width + pad * 2} ${bb.height + pad * 2}` });
                tsvg.appendChild(svgEl('path', { d, fill: densityColor(t.hikes), stroke: '#2f5c40', 'stroke-width': Math.max(bb.width, bb.height) * 0.012, 'stroke-linejoin': 'round' }));
                silo.appendChild(tsvg);
            } else {
                // Fallback (e.g., a future international territory with no silhouette yet):
                // a simple pennant marker so the tile still reads as a collected place.
                const tsvg = svgEl('svg', { viewBox: '0 0 24 24' });
                tsvg.appendChild(svgEl('path', { d: 'M7 22V3l11 3.5L7 10', fill: densityColor(t.hikes), stroke: '#2f5c40', 'stroke-width': 1, 'stroke-linejoin': 'round' }));
                silo.appendChild(tsvg);
            }

            const name = document.createElement('div');
            name.className = 'terr-name';
            name.textContent = STATE_NAMES[t.abbr] || t.abbr;

            const count = document.createElement('div');
            count.className = 'terr-count';
            count.innerHTML = `<b>${t.hikes}</b> hike${t.hikes === 1 ? '' : 's'} · ${t.trails.size} trail${t.trails.size === 1 ? '' : 's'}`;

            tile.append(silo, name, count);
            grid.appendChild(tile);
        });

        master.remove();

        // Header sub-line: the collection, and that it keeps growing
        const parts = [`${usStates} state${usStates === 1 ? '' : 's'}`];
        if (countries) parts.push(`${countries} countr${countries === 1 ? 'y' : 'ies'}`);
        document.getElementById('terr-count').textContent = `${parts.join(' · ')}, and the map keeps growing`;
    }

    // ============ The Cadence (seasonal rhythm as a radial year-wheel) ============
    // Twelve month-spokes around a compass; each spoke's length is how often you
    // hiked that month across all five years, stacked by year colour (matching the
    // Effort Field). It reads as the seasonal pulse of a life outdoors — long petals
    // in the months you can't stay inside.
    function buildCadence(hikes) {
        const mount = document.getElementById('cadence');
        if (!mount) return;
        const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

        const years = [...new Set(hikes.map(h => hikeYear(h)))].sort();
        const mat = MONTHS.map(() => ({}));          // mat[month][year] = count
        const monthTotal = new Array(12).fill(0);
        hikes.forEach(h => {
            const m = new Date(h.date_completed).getUTCMonth();   // UTC per Atlas convention
            const y = hikeYear(h);
            mat[m][y] = (mat[m][y] || 0) + 1;
            monthTotal[m]++;
        });
        const maxT = Math.max(...monthTotal, 1);

        const W = 620, H = 560, cx = 310, cy = 286, r0 = 48, R = 210;
        const seg = (2 * Math.PI) / 12, gap = 2.4 * Math.PI / 180;
        const pt = (r, a) => `${(cx + r * Math.sin(a)).toFixed(2)} ${(cy - r * Math.cos(a)).toFixed(2)}`;
        const annular = (ri, ro, a1, a2) =>
            `M${pt(ri, a1)} L${pt(ro, a1)} A${ro} ${ro} 0 0 1 ${pt(ro, a2)} L${pt(ri, a2)} A${ri} ${ri} 0 0 0 ${pt(ri, a1)} Z`;
        const rAt = c => r0 + (c / maxT) * (R - r0);
        const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'cad-svg' });

        // Faint count-guide rings so the petal lengths are readable
        const step = maxT <= 6 ? 2 : maxT <= 12 ? 4 : 5;
        for (let c = step; c <= maxT; c += step) {
            const r = rAt(c);
            svg.appendChild(svgEl('circle', { cx, cy, r, fill: 'none', stroke: '#e8dfc8', 'stroke-width': 1, 'stroke-dasharray': '2 4' }));
            const t = svgEl('text', { x: cx + 3, y: cy - r - 2, class: 'cad-ring-label' });
            t.textContent = c; svg.appendChild(t);
        }

        // Petals: each month a spoke, stacked inner→outer by year
        for (let m = 0; m < 12; m++) {
            if (!monthTotal[m]) continue;
            const centre = m * seg;
            const a1 = centre - seg / 2 + gap, a2 = centre + seg / 2 - gap;
            let rc = r0;
            years.forEach(y => {
                const c = mat[m][y]; if (!c) return;
                const ro = rc + (c / maxT) * (R - r0);
                const wedge = svgEl('path', { d: annular(rc, ro, a1, a2), fill: yearColor(y), stroke: '#fffdf6', 'stroke-width': 1, class: 'cad-wedge' });
                wedge.addEventListener('mouseenter', ev => showTip(`<div class="tt-title">${FULL[m]} ${y}</div><div class="tt-sub">${c} hike${c === 1 ? '' : 's'}</div>`, ev));
                wedge.addEventListener('mousemove', moveTip);
                wedge.addEventListener('mouseleave', hideTip);
                svg.appendChild(wedge);
                rc = ro;
            });
        }

        // Month labels around the rim
        for (let m = 0; m < 12; m++) {
            const a = m * seg;
            const t = svgEl('text', { x: cx + (R + 22) * Math.sin(a), y: cy - (R + 22) * Math.cos(a) + 4, 'text-anchor': 'middle', class: monthTotal[m] === maxT ? 'cad-month cad-month-peak' : 'cad-month' });
            t.textContent = MONTHS[m]; svg.appendChild(t);
        }

        // A small compass rose in the hub — a fire-lookout map instrument, not a pie hole
        svg.appendChild(svgEl('circle', { cx, cy, r: r0 - 4, fill: '#fbf7ea', stroke: '#d8ccae', 'stroke-width': 1 }));
        const star = r0 - 12, thin = star * 0.34;
        const starPts = [];
        for (let k = 0; k < 8; k++) {
            const a = k * Math.PI / 4;
            const r = k % 2 === 0 ? star : thin;
            starPts.push(`${(cx + r * Math.sin(a)).toFixed(1)},${(cy - r * Math.cos(a)).toFixed(1)}`);
        }
        svg.appendChild(svgEl('polygon', { points: starPts.join(' '), fill: '#b9a97f', stroke: '#8a7a52', 'stroke-width': 0.6, 'stroke-linejoin': 'round' }));
        svg.appendChild(svgEl('circle', { cx, cy, r: 3, fill: '#6f6142' }));

        mount.appendChild(svg);

        // Caption + a compact year key (colours match the Effort Field)
        const peakM = monthTotal.indexOf(maxT);
        const SEASON = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'fall', 'fall', 'fall', 'winter'];
        const cap = document.getElementById('cad-caption');
        if (cap) cap.innerHTML = `You answer the call most in <b>${FULL[peakM]}</b> — the heart of <b>${SEASON[peakM]}</b>. Each ring outward is another year on the trail.`;
        const leg = document.getElementById('cad-legend');
        if (leg) leg.innerHTML = years.map(y => `<span class="cad-key"><span class="cad-key-sw" style="background:${yearColor(y)}"></span>${y}</span>`).join('');
    }

    // ============ Where You Feel at Home (biomes as a canyon-wall of strata) ============
    // Every hike's primary_geography, stacked as sedimentary rock layers — most-hiked
    // at the sunlit rim, rarest in the deep old rock at the base. Each layer's length
    // is how much of your hiking life it holds, with a weathered, eroded right face.
    // Honest bar lengths, earthy hues, and a name on every stratum (no slivers to lose).
    const BIOME_COLORS = {
        'Desert': '#c9a566', 'Chaparral': '#a7a058', 'Coastal Chaparral': '#8fb08a',
        'Coastal': '#6fb0ac', 'Riparian Canyon': '#b77d52', 'Riparian Forest': '#3f7a55',
        'Riparian Meadow': '#8cc06a', 'Mountain Forest': '#2f5c40', 'Urban Edge': '#9c9486'
    };
    function buildBiomes(hikes) {
        const mount = document.getElementById('biomes');
        if (!mount) return;
        const byBio = {};
        hikes.forEach(h => { const b = h.primary_geography || 'Unknown'; byBio[b] = (byBio[b] || 0) + 1; });
        const items = Object.entries(byBio).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
        const total = items.reduce((s, i) => s + i.count, 0);
        if (!total) return;
        const maxC = items[0].count;

        const W = 920, xName = 170, xStart = 178, padR = 44, rowH = 34, MT = 16;
        const plotW = W - xStart - padR;
        const H = MT + items.length * rowH + 16;
        const len = c => Math.max(16, (c / maxC) * plotW);   // rarest layer still shows a nub

        // A gently varied bedding plane — the same wavy line is one band's floor and
        // the next band's roof, so the strata sit flush like real rock.
        const amp = 2.3, freq = 0.024;
        const yB = (i, x) => MT + i * rowH + amp * Math.sin(x * freq + i * 1.7);
        const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'bio-svg' });

        items.forEach((it, i) => {
            const xEnd = xStart + len(it.count), yc = MT + i * rowH + rowH / 2, step = 26;
            let d = '';
            for (let x = xStart, first = true; x <= xEnd; x += step, first = false) d += `${first ? 'M' : 'L'}${x.toFixed(1)},${yB(i, x).toFixed(1)} `;
            d += `L${xEnd.toFixed(1)},${yB(i, xEnd).toFixed(1)} `;
            // weathered right face (a small concave notch)
            const midY = (yB(i, xEnd) + yB(i + 1, xEnd)) / 2;
            d += `L${(xEnd - 3).toFixed(1)},${midY.toFixed(1)} L${xEnd.toFixed(1)},${yB(i + 1, xEnd).toFixed(1)} `;
            for (let x = xEnd; x >= xStart; x -= step) d += `L${x.toFixed(1)},${yB(i + 1, x).toFixed(1)} `;
            d += `L${xStart.toFixed(1)},${yB(i + 1, xStart).toFixed(1)} Z`;

            const band = svgEl('path', { d, fill: BIOME_COLORS[it.name] || '#9a8f77', stroke: 'rgba(60,42,22,0.30)', 'stroke-width': 1, 'stroke-linejoin': 'round', class: 'bio-band' });
            band.addEventListener('mouseenter', ev => { band.style.filter = 'brightness(1.07)'; showTip(`<div class="tt-title">${it.name}</div><div class="tt-sub">${it.count} hike${it.count === 1 ? '' : 's'} · ${Math.round(it.count / total * 100)}%</div>`, ev); });
            band.addEventListener('mousemove', moveTip);
            band.addEventListener('mouseleave', () => { band.style.filter = ''; hideTip(); });
            svg.appendChild(band);
            // faint grain striation across the stratum
            if (xEnd - xStart > 30) svg.appendChild(svgEl('line', { x1: xStart + 3, y1: yc, x2: xEnd - 4, y2: yc, stroke: 'rgba(255,255,255,0.16)', 'stroke-width': 1 }));
            // name in the rim gutter, count at the weathered tip
            const nm = svgEl('text', { x: xName, y: yc + 4.5, 'text-anchor': 'end', class: 'bio-strata-name' });
            nm.textContent = it.name; svg.appendChild(nm);
            const ct = svgEl('text', { x: xEnd + 9, y: yc + 4.5, 'text-anchor': 'start', class: 'bio-strata-count' });
            ct.textContent = it.count; svg.appendChild(ct);
        });
        mount.appendChild(svg);

        const sub = document.getElementById('bio-count');
        if (sub) sub.textContent = `${items.length} kinds of country`;
        const cap = document.getElementById('bio-caption');
        if (cap) cap.innerHTML = `Your home ground is <b>${items[0].name}</b> — ${items[0].count} of ${total} outings. Layer by layer, the country you walk through.`;
    }

    // Reveal the section when it scrolls into view
    const io = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { section.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.08 });
    io.observe(section);
})();
