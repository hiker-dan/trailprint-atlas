/**
 * The Observatory — the homepage's deep-data section.
 * Explores five years of trails from every angle. Photo-free by design,
 * with one deliberate exception: the Specimen Drawer's nine lazy-loaded,
 * small-transform thumbnails.
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
        buildAscents(hikes);
        buildCadence(hikes);
        buildSpecimens(hikes);
    });

    // Blend two hex colours — the atmospheric-haze workhorse for the panorama.
    const mix = (a, b, t) => {
        const pa = a.match(/\w\w/g).map(x => parseInt(x, 16));
        const pb = b.match(/\w\w/g).map(x => parseInt(x, 16));
        return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
    };

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

    // ============ The True Ascents (every summit climb, as its real profile) ============
    // Each ridge is the genuine elevation profile of a summit hike, read from its
    // GPX by tools/build-trails.py (data/elevations.json) and drawn at true
    // vertical scale, sea level at the ground line. Tallest climbs stand at the
    // back of the panorama, hazed toward the sky like a real mountain horizon.
    // Hovering a ridge raises it out of the haze; clicking opens the climb.
    function buildAscents(hikes) {
        const mount = document.getElementById('skyline');
        if (!mount) return;
        // How many times each summit trail has been climbed (repeats collapse
        // into one ridge; the tooltip carries the count).
        const climbs = {};
        hikes.filter(h => h.summit_trail && h.summit_elevation).forEach(h => { climbs[h.trail_name] = (climbs[h.trail_name] || 0) + 1; });
        const seen = new Set();
        const summits = hikes.filter(h => h.summit_trail && h.summit_elevation && h.gpx_file)
            .filter(h => !seen.has(h.trail_name) && seen.add(h.trail_name));

        fetch('data/elevations.json').then(r => r.json()).then(profiles => {
            const list = summits
                .map(h => { const prof = profiles[h.trail_id]; return prof && prof.length >= 20 ? { h, prof, peak: Math.max(...prof) } : null; })
                .filter(Boolean)
                .sort((a, b) => b.peak - a.peak);   // tallest painted first = the back of the panorama
            if (!list.length) return;
            const n = list.length;

            const W = 1060, H = 470, baseY = H - 24, topPad = 42;
            const maxPeak = Math.max(list[0].peak, ...list.map(o => o.h.summit_elevation));
            const maxFt = Math.ceil((maxPeak * 1.07) / 1000) * 1000;
            const yOf = ft => baseY - (ft / maxFt) * (baseY - topPad);
            const SKY = '#f5ecd2';   // what distance dissolves a ridge toward
            const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'asc-svg' });
            const defs = svgEl('defs', {});
            svg.appendChild(defs);

            // Dawn sky, warming toward the horizon
            const sky = svgEl('linearGradient', { id: 'asc-sky', x1: 0, y1: 0, x2: 0, y2: 1 });
            [['0%', '#fdfbf2'], ['62%', '#f9f1db'], ['100%', '#f3e6c4']].forEach(([o, c]) => sky.appendChild(svgEl('stop', { offset: o, 'stop-color': c })));
            defs.appendChild(sky);
            svg.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: baseY, fill: 'url(#asc-sky)' }));

            // Elevation lines, floating in the sky like survey marks (labels hug
            // the right edge, clear of the peak name-plates)
            for (let ft = 2000; ft < maxFt; ft += 2000) {
                svg.appendChild(svgEl('line', { x1: 0, x2: W, y1: yOf(ft), y2: yOf(ft), stroke: '#b8a67c', 'stroke-width': 0.7, 'stroke-dasharray': '3 7', opacity: 0.5 }));
                const t = svgEl('text', { x: W - 8, y: yOf(ft) - 5, 'text-anchor': 'end', class: 'asc-axis' });
                t.textContent = ft.toLocaleString() + ' ft'; svg.appendChild(t);
            }

            // Deterministic horizontal spread: coprime slot shuffle + seeded jitter,
            // so tall back ridges and short front ones interleave across the frame.
            let s = 7;
            const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
            const coprime = [7, 5, 3].find(k => n % k !== 0) || 1;
            const ridgeGroups = [], labels = [];
            list.forEach((o, i) => {
                const yc = yearColor(hikeYear(o.h));
                const w = 170 + Math.min(280, (o.h.miles || 4) * 20);
                const slot = (i * coprime) % n;
                const cx = 60 + ((slot + 0.5) / n) * (W - 120) + (rnd() - 0.5) * 54;
                const x0 = Math.max(-30, Math.min(W + 30 - w, cx - w / 2));

                // The track itself (its true GPX shape)…
                let dTrack = '', px = 0, py = 0, pft = 0;
                o.prof.forEach((ft, k) => {
                    const x = x0 + (k / (o.prof.length - 1)) * w, y = yOf(ft);
                    dTrack += ` L${x.toFixed(1)},${y.toFixed(1)}`;
                    if (ft > pft) { pft = ft; px = x; py = y; }
                });
                const peakPt = [px, py];   // raw summit point (labels use a clamped copy)
                // …with concave flanks easing down to the valley floor on both
                // sides — the mountain's real skirt below the trailhead. Without
                // them a high-trailhead climb ends in a sheer block wall.
                const yL = yOf(o.prof[0]), yR = yOf(o.prof[o.prof.length - 1]);
                const skirt = (xEdge, yTop, dir) => {
                    const sw = Math.min(300, (baseY - yTop) * 0.75) * dir;
                    let d = '';
                    for (let k = 0; k <= 8; k++) {
                        const t = k / 8;   // t=0 at the valley, t=1 at the track's edge
                        const x = xEdge - sw + sw * t, y = baseY - (baseY - yTop) * Math.pow(t, 1.6);
                        d += ` L${x.toFixed(1)},${y.toFixed(1)}`;
                    }
                    return d;
                };
                const left = skirt(x0, yL, 1), right = skirt(x0 + w, yR, -1);
                const dFill = 'M' + (left + dTrack + [...right.split(' L').filter(Boolean)].reverse().map(p => ' L' + p).join('')).slice(2) + ' Z';
                // Only the hiked ground gets a crestline — the flanks stay strokeless,
                // so where the bright line begins IS the trailhead.
                const dHike = 'M' + dTrack.slice(2);

                // Atmospheric perspective: the further back (taller) a ridge, the
                // more it dissolves toward the sky. Front ridges keep full colour.
                const hz = 0.68 * Math.pow(1 - i / Math.max(1, n - 1), 0.8);
                const grad = (id, haze) => {
                    const g = svgEl('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
                    g.appendChild(svgEl('stop', { offset: '0%', 'stop-color': mix(mix(yc, '#fdf8ec', 0.30), SKY, haze) }));
                    g.appendChild(svgEl('stop', { offset: '100%', 'stop-color': mix(mix(yc, '#2e2413', 0.32), SKY, haze) }));
                    defs.appendChild(g);
                };
                grad(`asc-g${i}`, hz);
                grad(`asc-gl${i}`, 0);
                const crestCol = haze => mix(mix(yc, '#4a3a1e', 0.35), SKY, haze);

                const g = svgEl('g', { class: 'asc-ridge' });
                g.appendChild(svgEl('path', { d: dFill, fill: `url(#asc-g${i})` }));
                g.appendChild(svgEl('path', { d: dHike, fill: 'none', stroke: crestCol(hz), 'stroke-width': 1.3, 'stroke-linejoin': 'round' }));
                // The raised state: unhazed colours, a bolder crest, and survey
                // marks pinning the real track — trailhead, summit, trail's end.
                const lit = svgEl('g', { class: 'asc-lit-layer' });
                lit.appendChild(svgEl('path', { d: dFill, fill: `url(#asc-gl${i})` }));
                lit.appendChild(svgEl('path', { d: dHike, fill: 'none', stroke: crestCol(0), 'stroke-width': 2, 'stroke-linejoin': 'round' }));
                [[x0, yL], [x0 + w, yR]].forEach(([x, y]) =>
                    lit.appendChild(svgEl('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 4, fill: '#fffdf6', stroke: crestCol(0), 'stroke-width': 2 })));
                lit.appendChild(svgEl('circle', { cx: peakPt[0].toFixed(1), cy: peakPt[1].toFixed(1), r: 3.4, fill: crestCol(0), stroke: '#fffdf6', 'stroke-width': 1.4 }));
                g.appendChild(lit);
                svg.appendChild(g);
                ridgeGroups.push({ o, g, dFill, px: Math.max(70, Math.min(W - 70, px)), py });
            });

            // The ground the panorama stands on
            svg.appendChild(svgEl('rect', { x: 0, y: baseY, width: W, height: H - baseY, fill: '#cdbb90' }));
            svg.appendChild(svgEl('line', { x1: 0, x2: W, y1: baseY, y2: baseY, stroke: '#8a7649', 'stroke-width': 1.4 }));

            const shortPeak = nm => nm.replace(/ via .*/i, '').replace(/:.*/, '').replace(/\s*(Loop )?Trail$/i, '').replace(/ Loop$/i, '').replace(/\bMountain\b/i, 'Mtn').trim();

            // Name the three highest ridges; everything else reveals on hover.
            ridgeGroups.slice(0, 3).forEach(r => labels.push({ x: r.px, y: r.py - 10, text: `${shortPeak(r.o.h.trail_name)} · ${r.o.h.summit_elevation.toLocaleString()} ft` }));
            // Nudge apart any label pair that would collide
            labels.sort((a, b) => a.x - b.x);
            for (let i = 1; i < labels.length; i++) {
                for (let j = 0; j < i; j++) {
                    if (Math.abs(labels[i].x - labels[j].x) < 230 && Math.abs(labels[i].y - labels[j].y) < 18) labels[i].y = labels[j].y - 20;
                }
            }
            labels.forEach(l => {
                ['asc-label-halo', 'asc-label'].forEach(cls => {
                    const t = svgEl('text', { x: l.x, y: Math.max(16, l.y), 'text-anchor': 'middle', class: cls + ' asc-anno' });
                    t.textContent = l.text; svg.appendChild(t);
                });
            });

            // The field card: a fixed home for the details below the panorama, so
            // nothing ever floats over (or hides) a profile. At rest it reads the
            // whole range; hovering a ridge morphs it to that climb.
            const card = document.getElementById('asc-card');
            const top = list[0].h;
            const stat = (v, l) => `<div class="asc-stat"><div class="asc-stat-v">${v}</div><div class="asc-stat-l">${l}</div></div>`;
            const setCard = o => {
                if (!card) return;
                if (!o) {
                    card.style.setProperty('--accent', '#b9a97f');
                    card.innerHTML = `<div class="asc-card-lead"><div class="asc-card-name">The whole range</div>
                        <div class="asc-card-meta">${n} summit climbs at true scale, sea level to ${top.summit_elevation.toLocaleString()} ft. The bright crestline is ground you actually walked; the soft flanks are the mountain beneath it.</div></div>
                        <div class="asc-card-hint">Hover a ridge to raise it from the haze · click to stand on it again</div>`;
                    return;
                }
                const h = o.h, times = climbs[h.trail_name] || 1;
                card.style.setProperty('--accent', yearColor(hikeYear(h)));
                card.innerHTML = `<div class="asc-card-lead"><div class="asc-card-name">${h.trail_name}</div>
                    <div class="asc-card-meta">${h.location} · ${formatHikeDate(h.date_completed)}${times > 1 ? ` · climbed ${times}×` : ''}</div></div>
                    <div class="asc-card-stats">
                        ${stat(h.summit_elevation.toLocaleString() + ' ft', 'summit')}
                        ${stat(o.prof[0].toLocaleString() + ' ft', 'trailhead')}
                        ${stat('+' + (h.elevation_gain || 0).toLocaleString() + ' ft', 'gain')}
                        ${stat((h.miles || 0).toFixed(1) + ' mi', 'distance')}
                    </div>`;
            };
            setCard(null);

            // Hit layer last, in paint order — the frontmost ridge wins the hover
            ridgeGroups.forEach(ridge => {
                const hit = svgEl('path', { d: ridge.dFill, fill: 'transparent', class: 'asc-hit' });
                hit.addEventListener('mouseenter', () => { svg.classList.add('asc-focus'); ridge.g.classList.add('lit'); setCard(ridge.o); });
                hit.addEventListener('mouseleave', () => { svg.classList.remove('asc-focus'); ridge.g.classList.remove('lit'); setCard(null); });
                hit.addEventListener('click', () => { window.location.href = 'hike.html?id=' + ridge.o.h.trail_id; });
                svg.appendChild(hit);
            });

            mount.appendChild(svg);
            const sub = document.getElementById('sky-count');
            if (sub) sub.textContent = `${n} summit climbs, drawn from their own GPX tracks`;
        });
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

    // ============ The Specimen Drawer (biomes as a naturalist's cabinet) ============
    // Nine kinds of country the Atlas has collected, each pinned as one photograph
    // in a wooden specimen drawer — most-hiked first, with a count stamp for how
    // many outings that country holds. The one deliberate photo exception in the
    // Observatory: nine lazy-loaded, small-transform Cloudinary thumbnails.
    const BIOME_COLORS = {
        'Desert': '#c9a566', 'Chaparral': '#a7a058', 'Coastal Chaparral': '#8fb08a',
        'Coastal': '#6fb0ac', 'Riparian Canyon': '#b77d52', 'Riparian Forest': '#3f7a55',
        'Riparian Meadow': '#8cc06a', 'Mountain Forest': '#2f5c40', 'Urban Edge': '#9c9486'
    };
    // Hand-picked specimen per biome: [trail_id, image index]. Chosen for the
    // landscape, not the people — swap freely as better photographs join the Atlas.
    // Any biome missing here falls back to its earliest photographed hike.
    const SPECIMEN_PICKS = {
        'Desert': ['tta_06', 1],
        'Mountain Forest': ['tta_47', 0],
        'Chaparral': ['tta_20', 0],
        'Riparian Canyon': ['tta_39', 0],
        'Urban Edge': ['tta_70', 0],
        'Coastal Chaparral': ['tta_103', 0],
        'Coastal': ['tta_68', 3],
        'Riparian Meadow': ['tta_52', 0],
        'Riparian Forest': ['tta_51', 0]
    };
    function buildSpecimens(hikes) {
        const mount = document.getElementById('biomes');
        if (!mount) return;
        const byBio = {};
        hikes.forEach(h => {
            const b = h.primary_geography || 'Unknown';
            (byBio[b] = byBio[b] || []).push(h);
        });
        const items = Object.entries(byBio).map(([name, hs]) => ({ name, hs, count: hs.length })).sort((a, b) => b.count - a.count);
        const total = items.reduce((s, i) => s + i.count, 0);
        if (!total) return;
        const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        // The cabinet: nine wooden drawer fronts with brass label plates. Pulling
        // one lifts its specimen card onto the display shelf beside it — one
        // country at a time, and each photograph only loads when its drawer opens.
        mount.classList.add('spec-cabinet-wrap');
        const cabinet = document.createElement('div');
        cabinet.className = 'spec-cabinet';
        const display = document.createElement('div');
        display.className = 'spec-display';
        mount.append(cabinet, display);

        const buildCard = it => {
            // The pinned photograph: the hand-picked specimen, or the earliest
            // photographed hike of that country as a fallback.
            const pick = SPECIMEN_PICKS[it.name];
            let hike = pick && it.hs.find(h => h.trail_id === pick[0]);
            let imgIdx = hike ? pick[1] : 0;
            if (!hike || !(hike.images || [])[imgIdx]) {
                hike = it.hs.slice().sort(compareHikesChrono).find(h => (h.images || []).length);
                imgIdx = 0;
            }
            const first = it.hs.slice().sort(compareHikesChrono)[0];
            const fd = new Date(first.date_completed);
            const collected = `${MON[fd.getUTCMonth()]} ${fd.getUTCFullYear()}`;

            const card = document.createElement('a');
            card.className = 'spec-card';
            card.href = hike ? 'hike.html?id=' + hike.trail_id : 'map.html';
            card.style.setProperty('--bio', BIOME_COLORS[it.name] || '#9a8f77');
            const img = hike
                ? `<img loading="lazy" src="${cloudinaryUrl(hike.images[imgIdx], 'w_640,h_440,c_fill,g_auto,q_auto,f_auto')}" alt="${it.name} — ${hike.trail_name}">`
                : '<div class="spec-empty">specimen pending</div>';
            card.innerHTML = `
                <div class="spec-photo">${img}<span class="spec-stamp">&times;&thinsp;${it.count}</span></div>
                <div class="spec-plate">
                    <div class="spec-name">${it.name}</div>
                    <div class="spec-meta">${hike ? hike.location : ''}</div>
                    <div class="spec-meta2">first collected ${collected} · ${it.count} outing${it.count === 1 ? '' : 's'}</div>
                </div>`;
            return card;
        };

        const fronts = [];
        const open = idx => {
            fronts.forEach((f, i) => f.classList.toggle('open', i === idx));
            display.replaceChildren(buildCard(items[idx]));
        };
        items.forEach((it, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'spec-front';
            btn.style.setProperty('--bio', BIOME_COLORS[it.name] || '#9a8f77');
            btn.innerHTML = `<span class="spec-front-plate">${it.name}</span><span class="spec-front-pull"></span>`;
            btn.addEventListener('click', () => open(idx));
            cabinet.appendChild(btn);
            fronts.push(btn);
        });
        open(0);   // home ground starts pulled

        const sub = document.getElementById('bio-count');
        if (sub) sub.textContent = `${items.length} drawers, ${items.length} kinds of country`;
        const cap = document.getElementById('bio-caption');
        if (cap) cap.innerHTML = `Your home ground is <b>${items[0].name}</b>: ${items[0].count} of ${total} outings collected there. Pull a drawer to lift out its specimen; click the card to visit the hike it was taken on.`;
    }

    // Reveal the section when it scrolls into view
    const io = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { section.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.08 });
    io.observe(section);
})();
