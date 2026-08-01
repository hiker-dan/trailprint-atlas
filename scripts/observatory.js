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

    // State names and the US/abroad test live in atlas-data.js (territoryKey /
    // territoryName / isUsState) — this panel is not the only place that files
    // a hike under a place, so the rule must not be re-derived here.

    const yearColor = y => ATLAS_CONFIG.COLOR_MAP[String(y)] || ATLAS_CONFIG.DEFAULT_COLOR;

    /* ---- THE ONE WAY THIS SECTION SPEAKS ------------------------------------
       Every panel answers on the LEFT LEAF. There used to be a shared floating
       tooltip, #obs-tip, following the cursor across three of these charts; it
       is gone entirely (August 2026). A card that chases the pointer to repeat
       what the leaf beside it is already showing is two answers to one
       question, and the leaf's answer is better in every way — it is the real
       ground, at real scale, with the measurements set in the collar.

       Free to call on every hover: keymap.js buffers the cut and dedupes by
       subject, so a cursor sweeping a grid of territories costs one cut when it
       stops, not one per tile it crosses. */
    const lightLand = (hs, label, place) => {
        if (!window.AtlasKeyMap || !hs || !hs.length) return;
        AtlasKeyMap.light(hs.map(h => h.trail_id), label, place);
    };

    Promise.all([
        fetchHikes(),
        fetch('assets/blank-us-map.svg').then(r => r.text()),
        // National silhouettes for the countries walked outside the US, built by
        // tools/build-countries.py. Never fatal: a missing file just means the
        // country tiles fall back to their pennant.
        fetch('assets/countries.json').then(r => r.ok ? r.json() : {}).catch(() => ({}))
    ]).then(([hikes, usSvgText, countryShapes]) => {
        buildEffortField(hikes);
        buildTerritories(hikes, usSvgText, countryShapes);
        buildAscents(hikes);
        buildCadence(hikes);
        buildNetwork(hikes);
        buildSpecimens(hikes);
    });

    // Blend two hex colours — the atmospheric-haze workhorse for the panorama.
    const mix = (a, b, t) => {
        const pa = a.match(/\w\w/g).map(x => parseInt(x, 16));
        const pb = b.match(/\w\w/g).map(x => parseInt(x, 16));
        return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
    };

    /* THE PROFILE LINE IS GONE (August 2026). It read "You're a desert-loving,
       duo-hiking explorer who has climbed 15.1 vertical miles, stood on 15
       summits, and left tracks across 7 states and 1 country beyond." — an
       auto-written sentence telling the reader what to conclude, in a voice
       that is not Danny's, at the head of a plate built entirely to let them
       conclude it themselves. Struck at his call. The Atlas's prose is his
       (see the voice rule); generated prose about him is worse than none. */

    // ============ The Effort Field (distance × climb scatter) ============
    /* R2 — A WIDE CHART GAINS PLOT AREA, NEVER HEIGHT.
       This was `viewBox="0 0 920 440"` at `width: 100%`, which locks the aspect
       at 2.09: on a 2,400 px leaf the SVG scaled to 1,148 px TALL, the dots and
       the axis type scaled with it, and the panel overran everything below.
       So the chart is no longer scaled — it is RE-DRAWN. The viewBox takes the
       container's real pixel width and a fixed height, which puts the scale at
       1:1 in both axes: dots stay 5.5 px, labels stay 8.5 px, and a wider leaf
       simply buys more plot. Redrawn on resize, debounced. */
    function buildEffortField(hikes) {
        const mount = document.getElementById('effort-field');
        if (!mount) return;
        const data = hikes.filter(h => (h.miles || 0) > 0 || (h.elevation_gain || 0) > 0);
        let dots = [], isolated = null;

        const applyIsolation = () => dots.forEach(d =>
            d.style.opacity = (isolated === null || +d.dataset.year === isolated) ? '' : '0.12');

        const render = () => {
            mount.innerHTML = '';
            dots = [];
            draw();
            applyIsolation();
        };

        let t;
        addEventListener('resize', () => { clearTimeout(t); t = setTimeout(render, 150); });

        function draw() {
        const W = Math.max(460, Math.round(mount.clientWidth) || 920);
        const H = 440, ML = 62, MR = 24, MT = 20, MB = 54;
        const plotW = W - ML - MR, plotH = H - MT - MB;
        const maxMi = Math.max(4, Math.ceil(Math.max(...data.map(h => h.miles || 0))));
        const maxGain = Math.ceil(Math.max(...data.map(h => h.elevation_gain || 0)) / 500) * 500;
        const sx = mi => ML + (mi / maxMi) * plotW;
        const sy = g => MT + plotH - (g / maxGain) * plotH;
        const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'ef-svg' });

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
        data.forEach(h => {
            const isSummit = h.summit_trail && h.summit_elevation;
            const yr = hikeYear(h);
            const dot = svgEl('circle', {
                cx: sx(h.miles || 0), cy: sy(h.elevation_gain || 0), r: 5.5,
                fill: yearColor(yr), stroke: isSummit ? '#2c3e50' : '#fffdf6',
                'stroke-width': isSummit ? 2 : 1.4, class: 'ef-dot'
            });
            dot.dataset.year = yr;
            /* CROSS-LIT. Pointing at a dot is now answered by the land on the
               left leaf: it names the hike, says where it happened and cuts the
               plate to it. The tooltip therefore carries ONLY what the leaf
               cannot — the two measurements this chart plots, and the date.
               Repeating the trail name here would be two floating answers to
               one question. */
            dot.style.cursor = 'pointer';
            dot.addEventListener('mouseenter', () => {
                dot.setAttribute('r', 8);
                if (window.AtlasKeyMap) AtlasKeyMap.light([h.trail_id], h.trail_name);
            });
            dot.addEventListener('mouseleave', () => { dot.setAttribute('r', 5.5); });
            dot.addEventListener('click', () => { location.href = `hike.html?id=${h.trail_id}`; });
            svg.appendChild(dot);
            dots.push(dot);
        });
        mount.appendChild(svg);
        }

        // Interactive year legend: click a year to isolate it, click again to
        // restore. Built ONCE and outside the redraw — the chart is rebuilt on
        // every resize, and rebuilding the legend with it would both leak
        // chips and drop whichever year the reader had isolated.
        const legend = document.getElementById('ef-legend');
        const years = [...new Set(data.map(h => hikeYear(h)))].sort();
        years.forEach(y => {
            const chip = document.createElement('button');
            chip.className = 'ef-chip';
            chip.innerHTML = `<span class="ef-sw" style="background:${yearColor(y)}"></span>${y}`;
            chip.onclick = () => {
                isolated = (isolated === y) ? null : y;
                document.querySelectorAll('.ef-chip').forEach(c => c.classList.remove('active'));
                if (isolated !== null) chip.classList.add('active');
                applyIsolation();
            };
            legend.appendChild(chip);
        });
        const ring = document.createElement('span');
        ring.className = 'ef-chip ef-chip-static';
        ring.innerHTML = `<span class="ef-sw ef-sw-ring"></span>summit`;
        legend.appendChild(ring);

        render();
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

            /* R2 — A WIDE PANEL GAINS PLOT AREA, NEVER HEIGHT. The panorama was
               a fixed 1060x470 viewBox at width:100%, which locks its aspect at
               2.26 and turns every extra pixel of leaf into extra HEIGHT: on the
               volume's widest setting it stood 541 px tall and rising, a sky
               getting emptier the more room it was given. So the width is
               measured and the range RE-DRAWN into it at a fixed height — more
               leaf now means the ridges stand further apart, which is the thing
               a crowded panorama actually wants. Same treatment as the Effort
               Field, and the reason both are built as draw() rather than once. */
            const H = 470;
            const draw = () => {
            const W = Math.max(680, Math.round(mount.clientWidth) || 1060);
            const baseY = H - 24, topPad = 42;
            const ridgeGroups = [], labels = [];
            const maxPeak = Math.max(list[0].peak, ...list.map(o => o.h.summit_elevation));
            const maxFt = Math.ceil((maxPeak * 1.07) / 1000) * 1000;
            const yOf = ft => baseY - (ft / maxFt) * (baseY - topPad);
            const SKY = '#f5ecd2';   // what distance dissolves a ridge toward
            const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'asc-svg' });
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

            // These labels tell climbs apart, so an unnamed high point falls
            // back to its trail — climbName's job. Abbreviated only to buy
            // horizontal room on a crowded crestline.
            const shortPeak = h => climbName(h).replace(/\bMountain\b/i, 'Mtn');

            // Name the three highest ridges; everything else reveals on hover.
            ridgeGroups.slice(0, 3).forEach(r => labels.push({ x: r.px, y: r.py - 10, text: `${shortPeak(r.o.h)} · ${r.o.h.summit_elevation.toLocaleString()} ft` }));
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
            /* THE ORDER IS THE WALK. It used to read summit, trailhead, gain,
               distance — the answer first, then the question. Now it reads the
               way the day went: you START at the trailhead, you CLIMB, you
               reach the SUMMIT, and it took this far. The gain is the middle
               term in that sentence and the point of the whole panel, so it is
               set larger, in the climb's own year ink, under a rule — a figure
               the eye lands on rather than a third of four equal numbers. */
            const stat = (v, l, cls) => `<div class="asc-stat${cls ? ' ' + cls : ''}">
                <div class="asc-stat-v">${v}</div><div class="asc-stat-l">${l}</div></div>`;
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
                // The True Ascents are about mountains, so the card leads with
                // the peak; the trail that reached it is one click away.
                card.innerHTML = `<div class="asc-card-lead"><div class="asc-card-name">${climbName(h)}</div>
                    <div class="asc-card-meta">${h.location} · ${formatHikeDate(h.date_completed)}${times > 1 ? ` · climbed ${times}×` : ''}</div></div>
                    <div class="asc-card-stats">
                        ${stat(o.prof[0].toLocaleString() + ' ft', 'trailhead')}
                        ${stat('&uarr;&thinsp;' + (h.elevation_gain || 0).toLocaleString() + ' ft', 'climbed', 'is-climb')}
                        ${stat(h.summit_elevation.toLocaleString() + ' ft', 'summit')}
                        ${stat((h.miles || 0).toFixed(1) + ' mi', 'distance')}
                    </div>`;
            };
            setCard(null);

            // Hit layer last, in paint order — the frontmost ridge wins the hover
            ridgeGroups.forEach(ridge => {
                const hit = svgEl('path', { d: ridge.dFill, fill: 'transparent', class: 'asc-hit' });
                hit.addEventListener('mouseenter', () => {
                    svg.classList.add('asc-focus'); ridge.g.classList.add('lit'); setCard(ridge.o);
                    // and the leaf stands on the mountain itself
                    lightLand([ridge.o.h], climbName(ridge.o.h));
                });
                hit.addEventListener('mouseleave', () => { svg.classList.remove('asc-focus'); ridge.g.classList.remove('lit'); setCard(null); });
                hit.addEventListener('click', () => { window.location.href = 'hike.html?id=' + ridge.o.h.trail_id; });
                svg.appendChild(hit);
            });

            mount.replaceChildren(svg);
            };   // ---- end draw()

            draw();
            let rt;
            addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(draw, 150); });

            const sub = document.getElementById('sky-count');
            if (sub) sub.textContent = `${n} summit climbs, drawn from their own GPX tracks`;
        });
    }

    function buildTerritories(hikes, usSvgText, countryShapes) {
        // --- Per-territory tally ---
        // Viewpoints count toward a territory's claim (you were there) but are
        // tallied apart from hikes — Arizona, for one, is all viewpoints.
        const byTerr = {};
        hikes.forEach(h => {
            // one key per collected place: a US state abbreviation, or a whole
            // country — so BC and a future Ontario hike share one Canada tile
            const abbr = territoryKey(h);
            if (!abbr) return;
            if (!byTerr[abbr]) byTerr[abbr] = { abbr, hikes: 0, viewpoints: 0, miles: 0, trails: new Set(), dates: [], hs: [] };
            byTerr[abbr].hs.push(h);
            if (isViewpoint(h)) {
                byTerr[abbr].viewpoints++;
            } else {
                byTerr[abbr].hikes++;
                byTerr[abbr].trails.add(h.trail_name);
            }
            byTerr[abbr].miles += h.miles || 0;
            byTerr[abbr].dates.push(h.date_completed);
        });
        const terrs = Object.values(byTerr).sort((a, b) => (b.hikes + b.viewpoints) - (a.hikes + a.viewpoints));

        // --- A hidden master SVG so we can measure each state path's bbox ---
        const usDoc = new DOMParser().parseFromString(usSvgText, 'image/svg+xml');
        const master = svgEl('svg', { viewBox: '0 0 959 593' });
        master.style.cssText = 'position:absolute;left:-9999px;top:0;width:959px;height:593px;opacity:0;pointer-events:none';
        document.body.appendChild(master);

        const grid = document.getElementById('terr-grid');
        if (!grid) return;
        let usStates = 0, countries = 0;

        /* ---- HOW BIG A TERRITORY PRINTS -------------------------------------
           Every square in the index is the same size, which made California —
           97 outings — and Pennsylvania — one — look like equal claims. So a
           territory now occupies a BLOCK of the grid: three squares by three
           for the home ground, two by two for a place genuinely returned to,
           one for a place visited. The unit never changes, so the index still
           reads as one ruled sheet rather than as tiles of assorted sizes.

           Thresholds, not ranks: a place has to earn its size, so a future
           tenth Utah outing grows that tile on its own and nothing else moves.
           They are counted in OUTINGS (hikes + viewpoints) because the tile's
           claim is "you were here". */
        const spanOf = n => n >= 40 ? 3 : n >= 6 ? 2 : 1;
        terrs.forEach(t => { t.span = spanOf(t.hikes + t.viewpoints); });

        terrs.forEach(t => {
            const isUS = isUsState(t.abbr);
            if (isUS) usStates++; else countries++;

            const tile = document.createElement('a');
            tile.className = 'terr-tile' + (isUS ? '' : ' abroad');
            tile.dataset.span = t.span;
            tile.style.gridColumn = `span ${t.span}`;
            tile.style.gridRow = `span ${t.span}`;
            // Every tile deep-links the map to its own hikes — a country tile
            // by name, a state tile by abbreviation.
            tile.href = isUS ? `map.html?state=${t.abbr}` : `map.html?country=${encodeURIComponent(t.abbr)}`;
            /* NO `title` ATTRIBUTE. It raised the browser's own grey tooltip on
               hover — the one piece of chrome on this page drawn by something
               other than the Atlas, and it said what the tile and the leaf were
               already saying. The rule is the same one that retired #obs-tip:
               nothing on this page floats, and nothing follows the cursor. */

            const silo = document.createElement('div');
            silo.className = 'terr-silo';

            // A country's silhouette is pre-projected and normalised by
            // tools/build-countries.py, so it drops straight in — no bbox
            // measuring, and it never depends on the US map asset.
            const shape = !isUS && countryShapes && countryShapes[t.abbr];
            // Reuse the real state silhouette from the US map asset
            const srcPaths = usDoc.querySelectorAll('.' + t.abbr.toLowerCase());
            if (shape) {
                const tsvg = svgEl('svg', { viewBox: shape.viewBox });
                tsvg.appendChild(svgEl('path', { d: shape.d, fill: densityColor(t.hikes + t.viewpoints), stroke: '#2f5c40', 'stroke-width': 1.1, 'stroke-linejoin': 'round' }));
                silo.appendChild(tsvg);
            } else if (isUS && srcPaths.length) {
                const d = Array.from(srcPaths).map(p => p.getAttribute('d')).filter(Boolean).join(' ');
                const measure = svgEl('path', { d });
                master.appendChild(measure);
                const bb = measure.getBBox();
                const pad = Math.max(bb.width, bb.height) * 0.06 + 2;
                const tsvg = svgEl('svg', { viewBox: `${bb.x - pad} ${bb.y - pad} ${bb.width + pad * 2} ${bb.height + pad * 2}` });
                tsvg.appendChild(svgEl('path', { d, fill: densityColor(t.hikes + t.viewpoints), stroke: '#2f5c40', 'stroke-width': Math.max(bb.width, bb.height) * 0.012, 'stroke-linejoin': 'round' }));
                silo.appendChild(tsvg);
            } else {
                // Fallback (a country walked before build-countries.py has been
                // run for it): a pennant so the tile still reads as collected.
                const tsvg = svgEl('svg', { viewBox: '0 0 24 24' });
                tsvg.appendChild(svgEl('path', { d: 'M7 22V3l11 3.5L7 10', fill: densityColor(t.hikes + t.viewpoints), stroke: '#2f5c40', 'stroke-width': 1, 'stroke-linejoin': 'round' }));
                silo.appendChild(tsvg);
            }

            const name = document.createElement('div');
            name.className = 'terr-name';
            name.textContent = territoryName(t.abbr);

            const count = document.createElement('div');
            count.className = 'terr-count';
            // A bigger plate says more. On a single square there is only room
            // for the claim itself, and three lines of wrapped small caps in a
            // 100 px box is not a caption, it is a smudge.
            const bits = [];
            if (t.span === 1) {
                if (t.hikes) bits.push(`<b>${t.hikes}</b> hike${t.hikes === 1 ? '' : 's'}`);
                if (t.viewpoints) bits.push(`${t.hikes ? '' : '<b>'}${t.viewpoints}${t.hikes ? '' : '</b>'} viewpoint${t.viewpoints === 1 ? '' : 's'}`);
            } else {
                if (t.hikes) bits.push(`<b>${t.hikes}</b> hike${t.hikes === 1 ? '' : 's'} · ${t.trails.size} trail${t.trails.size === 1 ? '' : 's'}`);
                if (t.viewpoints) bits.push(`${t.hikes ? '' : '<b>'}${t.viewpoints}${t.hikes ? '' : '</b>'} viewpoint${t.viewpoints === 1 ? '' : 's'}`);
            }
            count.innerHTML = bits.join(' · ');

            tile.append(silo, name, count);
            /* THE PLATE ANSWERS. Pointing at a territory frames every trailprint
               in it on the leaf — the payoff the mockup called the biggest
               single delight after the milestones, and the reason a silhouette
               here is enough: the real ground is a few inches to the left. */
            tile.addEventListener('mouseenter', () => lightLand(
                t.hs, territoryName(t.abbr),
                `${territoryName(t.abbr)} · ${t.hikes + t.viewpoints} outings`));
            grid.appendChild(tile);
        });

        master.remove();

        /* ---- LAYING THE INDEX OUT ------------------------------------------
           Two jobs, and they have to be done together every time the leaf
           changes width.

           THE SQUARES MUST BE SQUARE. A 3x3 block is only a block if a row is
           exactly as tall as a column is wide, and no CSS length knows the
           grid's own width — so the cell is measured and set as a pixel row
           height. (`aspect-ratio` on the tile cannot do it: a spanning tile
           would size itself and drag its neighbours' rows with it.)

           AND THE SHEET MUST COME OUT FULL. Big blocks leave holes that dense
           packing backfills with the small tiles, but the arithmetic almost
           never lands on a complete rectangle: 22 squares in a six-wide index
           is three and two-thirds rows, and the missing corner is exactly what
           looked broken about the old half-empty row. So the shortfall is
           counted and printed as BLANK INDEX SQUARES — which is what an atlas
           does with a sheet it has not surveyed yet, and what makes the block
           come out whole no matter how the collection grows. */
        const layout = () => {
            const w = grid.clientWidth;
            if (!w) return;
            const area = terrs.reduce((s, t) => s + t.span * t.span, 0);
            const widest = Math.max(...terrs.map(t => t.span));
            /* THE COLUMN COUNT IS A PROPORTION, NOT A CELL SIZE. Sizing the
               square to a fixed target looked right until the leaf narrowed:
               at 1,221 px the index ran six columns and the home ground's 3x3
               took half the width, but at 757 px it dropped to four and the
               same block took THREE QUARTERS — the same data reading as a
               different claim. So the count is chosen first: six columns
               wherever a square can still stay legible (about 118 px), fewer
               only when it cannot, and never so few that the largest block
               swallows the sheet.

               Then waste is weighed against that preference, worth about a
               column's deviation apiece, so the grid will accept a slightly
               unusual count to close the rectangle but will not collapse to
               three enormous columns to save two squares. */
            const floorC = Math.min(8, widest + 2);
            const pref = Math.max(floorC, Math.min(6, Math.floor(w / 118)));
            let cols = pref, best = Infinity;
            for (let c = floorC; c <= 9; c++) {
                const waste = Math.ceil(area / c) * c - area;
                const score = waste * 30 + Math.abs(c - pref) * 22;
                if (score < best) { best = score; cols = c; }
            }
            grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
            grid.style.gridAutoRows = `${(w / cols).toFixed(2)}px`;

            const blanks = Math.ceil(area / cols) * cols - area;
            grid.querySelectorAll('.terr-blank').forEach(n => n.remove());
            for (let i = 0; i < blanks; i++) {
                const b = document.createElement('div');
                b.className = 'terr-tile terr-blank';
                b.setAttribute('aria-hidden', 'true');
                grid.appendChild(b);
            }
        };
        layout();
        let lt;
        addEventListener('resize', () => { clearTimeout(lt); lt = setTimeout(layout, 150); });

        // Header sub-line: the collection, and that it keeps growing
        const parts = [`${usStates} state${usStates === 1 ? '' : 's'}`];
        if (countries) parts.push(`${countries} countr${countries === 1 ? 'y' : 'ies'} beyond`);
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

        /* The readout, where the tooltip used to be. A ring is one month of one
           year, which is a set of real outings — so it can be answered twice
           over: in words here, and as ground on the left leaf. */
        const roM = document.getElementById('cad-ro-month');
        const roS = document.getElementById('cad-ro-sub');
        const setReadout = (m, y, c) => {
            if (!roM || !roS) return;
            if (m == null) {
                roM.textContent = 'The whole year';
                roS.textContent = 'Point at a ring to read that month';
                return;
            }
            roM.textContent = `${FULL[m]} ${y}`;
            roS.textContent = `${c} hike${c === 1 ? '' : 's'}`;
        };

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
                wedge.addEventListener('mouseenter', () => {
                    setReadout(m, y, c);
                    const those = hikes.filter(h => hikeYear(h) === y
                        && new Date(h.date_completed).getUTCMonth() === m);
                    lightLand(those, `${FULL[m]} ${y}`, `${c} outing${c === 1 ? '' : 's'} that month`);
                });
                wedge.addEventListener('mouseleave', () => setReadout(null));
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
        'Riparian Meadow': '#8cc06a', 'Mountain Forest': '#2f5c40', 'Urban Edge': '#9c9486',
        'Tundra': '#7f9490'
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
        'Riparian Forest': ['tta_51', 0],
        'Tundra': ['tta_117', 0]
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
        const open = (idx, land) => {
            fronts.forEach((f, i) => f.classList.toggle('open', i === idx));
            display.replaceChildren(buildCard(items[idx]));
            // Pulling a drawer stands the leaf on every outing of that country.
            // Not on load, though: the plate's resting frame is the home ground,
            // and the page should not have moved it before anyone touched it.
            if (land) lightLand(items[idx].hs, items[idx].name,
                `${items[idx].name} · ${items[idx].count} outing${items[idx].count === 1 ? '' : 's'}`);
        };
        items.forEach((it, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'spec-front';
            btn.style.setProperty('--bio', BIOME_COLORS[it.name] || '#9a8f77');
            btn.innerHTML = `<span class="spec-front-plate">${it.name}</span><span class="spec-front-pull"></span>`;
            btn.addEventListener('click', () => open(idx, true));
            cabinet.appendChild(btn);
            fronts.push(btn);
        });
        // Ten drawers in a three-wide chest leaves two cells, and an empty
        // corner inside a bordered box is the same thing that looked broken on
        // the Territories index. A chest has blank fronts; print them.
        for (let i = items.length % 3 ? 3 - (items.length % 3) : 0; i > 0; i--) {
            const blank = document.createElement('div');
            blank.className = 'spec-front spec-blank';
            blank.setAttribute('aria-hidden', 'true');
            cabinet.appendChild(blank);
        }
        open(0, false);   // home ground starts pulled, but does not claim the leaf

        const sub = document.getElementById('bio-count');
        if (sub) sub.textContent = `${items.length} drawers, ${items.length} kinds of country`;
        const cap = document.getElementById('bio-caption');
        if (cap) cap.innerHTML = `Your home ground is <b>${items[0].name}</b>: ${items[0].count} of ${total} outings collected there. Pull a drawer to lift out its specimen; click the card to visit the hike it was taken on.`;
    }

    /* ========================================================================
       THE TRIANGULATION NETWORK — the Atlas's one PEOPLE chart
       ------------------------------------------------------------------------
       Every companion is a STATION; every pair who has walked together is
       joined by a measured BASELINE, its weight the number of outings they
       share. Angle around the sheet is the middle of a station's era, so
       reading clockwise from the top reads 2022 through 2026; distance IN from
       the rim is company kept, with Danny the primary station at the centre.

       Ported from mockups/crew-network.html (the crew redesign parked it for
       the Observatory in July 2026). It belongs on this plate rather than on
       crew.html because it is about GROUND SHARED rather than people listed —
       so it belongs where the land answers: hovering a station frames every
       hike walked with that person on the left leaf. Decided August 2026.

       Adapted for a panel rather than a full sheet: everything that was a
       fixed pixel size in the mockup is now a fraction of the measured plot,
       because this panel is ~590 px wide when paired with the Cadence and
       ~1,220 px when it is not (R2/R3).
       ===================================================================== */
    function buildNetwork(hikes) {
        const plot = document.getElementById('net-plot');
        const svg = document.getElementById('net-svg');
        const readout = document.getElementById('net-readout');
        if (!plot || !svg) return;

        const byName = new Map();
        hikes.forEach(h => (h.hiked_with || []).forEach(n => {
            if (!byName.has(n)) byName.set(n, []);
            byName.get(n).push(h);
        }));
        if (!byName.size) return;

        const tOf = h => Date.parse(h.date_completed);
        const roster = [...byName.entries()].map(([name, hs]) => {
            const sorted = [...hs].sort(compareHikesChrono);
            return {
                name, hikes: sorted, count: hs.length,
                miles: hs.reduce((s, h) => s + (h.miles || 0), 0),
                feet: hs.reduce((s, h) => s + (h.elevation_gain || 0), 0),
                trips: new Set(hs.filter(h => h.trip_tag).map(h => h.trip_tag)),
                first: sorted[0], last: sorted[sorted.length - 1],
                mid: hs.reduce((s, h) => s + tOf(h), 0) / hs.length   // their era's middle
            };
        }).sort((a, b) => b.count - a.count);
        const byKey = new Map(roster.map(p => [p.name, p]));
        const maxCount = roster[0].count;

        /* A STATION'S MARK MUST NAME ONE PERSON. Plain initials do not: this
           cast has Rachel G. and Robby G., and Luke R. and Lisa R. — two pairs
           of identical "RG" and "LR" disks, on the one chart whose entire
           subject is who somebody is. So a colliding group takes one more
           letter of the first name until the marks are distinct (RaG / RoG,
           LuR / LiR), which is how a chart has always disambiguated two
           stations with the same name. */
        const marks = new Map();
        (() => {
            const initial = (name, take) => {
                const parts = name.split(/\s+/);
                return parts[0].slice(0, take) + parts.slice(1).map(w => w[0]).join('');
            };
            for (let take = 1; take <= 6; take++) {
                const seen = new Map();
                roster.forEach(p => {
                    const m = initial(p.name, take);
                    seen.set(m, (seen.get(m) || 0) + 1);
                });
                roster.forEach(p => {
                    const m = initial(p.name, take);
                    if (!marks.has(p.name) && seen.get(m) === 1) marks.set(p.name, m);
                });
                if (marks.size === roster.length) break;
            }
            // anything still colliding after six letters keeps its full first name
            roster.forEach(p => { if (!marks.has(p.name)) marks.set(p.name, p.name.split(/\s+/)[0]); });
        })();

        // the baselines, and each person's closest companion
        const pairs = new Map();
        hikes.forEach(h => {
            const ppl = [...(h.hiked_with || [])].sort();
            for (let i = 0; i < ppl.length; i++)
                for (let j = i + 1; j < ppl.length; j++) {
                    const k = ppl[i] + '|' + ppl[j];
                    pairs.set(k, (pairs.get(k) || 0) + 1);
                }
        });
        const maxPair = Math.max(1, ...pairs.values());
        const closest = new Map();
        pairs.forEach((n, k) => {
            const [a, b] = k.split('|');
            [[a, b], [b, a]].forEach(([who, other]) => {
                const cur = closest.get(who);
                if (!cur || n > cur.n) closest.set(who, { who: other, n });
            });
        });

        const solo = hikes.filter(h => !(h.hiked_with || []).length).length;
        const sub = document.getElementById('net-count');
        if (sub) sub.textContent = `${roster.length} companions · ${pairs.size} baselines · ${solo} walked alone`;

        /* Stations are spaced EVENLY around the ring rather than by their true
           date. Real dates bunch them — most of the cast's middle years land in
           2023-24 — and six marks piled into one sector says less than a
           legible sequence. The year ticks around the rim carry the real dates. */
        const byEra = [...roster].sort((a, b) => a.mid - b.mid);
        let nodes = [];

        function layout() {
            const W = Math.max(360, Math.round(plot.clientWidth));
            // square-ish, capped: this is an R3 panel, it must not grow tall
            const H = Math.max(340, Math.min(560, Math.round(W * 0.94)));
            plot.style.height = H + 'px';
            const cx = W / 2, cy = H / 2 + 2;
            const rxOut = W * 0.42, ryOut = H * 0.38;
            const inner = 0.30;
            // the ring is CUT at the top: a ring of time has to end somewhere,
            // and the earliest and latest eras must not read as neighbours
            const A0 = -Math.PI / 2 + 0.20, SWEEP = Math.PI * 2 - 0.40;
            const rOf = p => (W < 700 ? 10 : 13) + (W < 700 ? 11 : 15) * Math.sqrt(p.count / maxCount);

            nodes = byEra.map((p, i) => {
                const ang = A0 + (i / Math.max(1, byEra.length - 1)) * SWEEP;
                const k = inner + (1 - inner) * (1 - Math.sqrt(p.count / maxCount)) * 0.96;
                return { p, ang, r: rOf(p),
                         x: cx + Math.cos(ang) * rxOut * k,
                         y: cy + Math.sin(ang) * ryOut * k };
            });

            // relaxation: separate marks that still crowd
            const want = W < 700 ? 16 : 26;
            for (let pass = 0; pass < 200; pass++) {
                for (let i = 0; i < nodes.length; i++)
                    for (let j = i + 1; j < nodes.length; j++) {
                        const a = nodes[i], b = nodes[j];
                        const dx = b.x - a.x, dy = b.y - a.y;
                        const d = Math.hypot(dx, dy) || 0.01;
                        const need = a.r + b.r + want;
                        if (d < need) {
                            const push = (need - d) / 2 * 0.35, ux = dx / d, uy = dy / d;
                            a.x -= ux * push; a.y -= uy * push;
                            b.x += ux * push; b.y += uy * push;
                        }
                    }
                nodes.forEach(n => {
                    n.x = Math.max(n.r + 26, Math.min(W - n.r - 26, n.x));
                    n.y = Math.max(n.r + 18, Math.min(H - n.r - 22, n.y));
                });
            }
            draw(cx, cy, W, H, rxOut, ryOut, inner);
        }

        function draw(cx, cy, W, H, rxOut, ryOut, inner) {
            svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
            svg.setAttribute('width', W);
            svg.setAttribute('height', H);
            svg.innerHTML = '';
            plot.querySelectorAll('.stn, .stn-lab').forEach(n => n.remove());

            const grat = svgEl('g', { class: 'net-grat' });
            for (let x = 0; x < W; x += 46) grat.appendChild(svgEl('line', { x1: x, y1: 0, x2: x, y2: H }));
            for (let y = 0; y < H; y += 46) grat.appendChild(svgEl('line', { x1: 0, y1: y, x2: W, y2: y }));
            svg.appendChild(grat);

            // the range rings, unlabelled where they are drawn — a real map
            // states its scale once, in the corner (see the bar below)
            [inner, 0.62, 0.96].forEach(k => svg.appendChild(
                svgEl('ellipse', { class: 'net-ring', cx, cy, rx: rxOut * k, ry: ryOut * k })));

            // the year ticks around the rim: this sheet's compass rose is TIME
            const years = new Map();
            nodes.forEach(n => {
                const y = new Date(n.p.mid).getUTCFullYear();
                if (!years.has(y)) years.set(y, []);
                years.get(y).push(n.ang);
            });
            [...years.entries()].sort((a, b) => a[0] - b[0]).forEach(([y, angs]) => {
                const a = angs.reduce((s, v) => s + v, 0) / angs.length;
                const x = cx + Math.cos(a) * rxOut * 1.11, yy = cy + Math.sin(a) * ryOut * 1.11;
                svg.appendChild(svgEl('line', {
                    class: 'net-tick',
                    x1: cx + Math.cos(a) * rxOut * 1.02, y1: cy + Math.sin(a) * ryOut * 1.02,
                    x2: cx + Math.cos(a) * rxOut * 1.08, y2: cy + Math.sin(a) * ryOut * 1.08
                }));
                const lab = svgEl('text', { class: 'net-year', x, y: yy + 3,
                    'text-anchor': Math.cos(a) < -0.25 ? 'end' : (Math.cos(a) > 0.25 ? 'start' : 'middle') });
                lab.textContent = y;
                svg.appendChild(lab);
            });

            // rays from the primary station — Danny is on every outing, so
            // these are a given, and drawn as one: hairlines
            const rays = svgEl('g', {});
            nodes.forEach(n => rays.appendChild(
                svgEl('line', { class: 'net-ray', x1: cx, y1: cy, x2: n.x, y2: n.y })));
            svg.appendChild(rays);

            // the measured baselines. Weight climbs steeply, so one shared day
            // recedes to a hairline and a years-long habit reads as a drawn line.
            const lines = svgEl('g', {}), labs = svgEl('g', {});
            const pos = new Map(nodes.map(n => [n.p.name, n]));
            [...pairs.entries()].sort((a, b) => a[1] - b[1]).forEach(([k, n]) => {
                const [a, b] = k.split('|');
                const A = pos.get(a), B = pos.get(b);
                if (!A || !B) return;
                const line = svgEl('line', { class: 'net-base', x1: A.x, y1: A.y, x2: B.x, y2: B.y,
                    'stroke-width': (0.5 + Math.pow(n / maxPair, 0.8) * 4.6).toFixed(2),
                    'stroke-opacity': (0.13 + Math.pow(n / maxPair, 0.7) * 0.42).toFixed(2) });
                line.dataset.a = a; line.dataset.b = b;
                lines.appendChild(line);
                const lab = svgEl('text', { class: 'net-base-lab', x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 - 3, 'text-anchor': 'middle' });
                lab.textContent = n;
                lab.dataset.a = a; lab.dataset.b = b;
                labs.appendChild(lab);
            });
            svg.appendChild(lines);
            svg.appendChild(labs);

            // the scale bar, in the corner where a map keeps it
            const SW = Math.min(150, W * 0.34);
            const sb = svgEl('g', { transform: `translate(14, ${H - 30})` });
            sb.appendChild(svgEl('line', { class: 'net-sb', x1: 0, y1: 10, x2: SW, y2: 10 }));
            [0, 0.5, 1].forEach((f, i) => {
                const x = SW * f;
                sb.appendChild(svgEl('line', { class: 'net-sb', x1: x, y1: 6, x2: x, y2: 14 }));
                const lab = svgEl('text', { class: 'net-year', x, y: 26,
                    'text-anchor': i === 0 ? 'start' : (i === 2 ? 'end' : 'middle') });
                lab.textContent = Math.max(1, Math.round(maxCount * Math.pow(1 - f, 2)));
                sb.appendChild(lab);
            });
            const cap = svgEl('text', { class: 'net-year', x: 0, y: -1 });
            cap.textContent = 'OUTINGS TOGETHER';
            sb.appendChild(cap);
            svg.appendChild(sb);

            // the primary station: the surveyor's own mark, a triangle
            const R = W < 700 ? 20 : 26;
            const me = document.createElement('div');
            me.className = 'stn primary';
            me.style.cssText = `left:${cx - R}px; top:${cy - R}px; width:${R * 2}px; height:${R * 2}px`;
            me.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#43310f" stroke-width="1.6">
                <path d="M12 4 L20.5 19 L3.5 19 Z"/><circle cx="12" cy="14.6" r="1.7" fill="#43310f" stroke="none"/></svg>`;
            plot.appendChild(me);

            nodes.forEach(n => {
                const d = document.createElement('a');
                d.className = 'stn';
                d.href = `crew-member.html?name=${encodeURIComponent(n.p.name)}`;
                d.style.cssText = `left:${n.x - n.r}px; top:${n.y - n.r}px; width:${n.r * 2}px; height:${n.r * 2}px`;
                const mark = marks.get(n.p.name);
                // a three-letter mark has to set smaller to stay inside its disk
                d.innerHTML = `<b style="font-size:${(n.r * (mark.length > 2 ? 0.46 : 0.62)).toFixed(0)}px">${mark}</b>`;
                d.dataset.name = n.p.name;
                plot.appendChild(d);
                d.addEventListener('mouseenter', () => focus(n.p.name));
                d.addEventListener('focus', () => focus(n.p.name));
            });
            rest();
        }

        function focus(name) {
            plot.classList.add('net-focus');
            const near = new Set();
            svg.querySelectorAll('.net-base').forEach(l => {
                const hit = l.dataset.a === name || l.dataset.b === name;
                l.classList.toggle('lit', hit);
                if (hit) near.add(l.dataset.a === name ? l.dataset.b : l.dataset.a);
            });
            svg.querySelectorAll('.net-base-lab').forEach(l =>
                l.classList.toggle('lit', l.dataset.a === name || l.dataset.b === name));
            plot.querySelectorAll('.stn').forEach(d => {
                d.classList.toggle('lit', d.dataset.name === name);
                d.classList.toggle('near', near.has(d.dataset.name));
            });
            card(byKey.get(name));
            // and the leaf frames the ground the two of you covered
            const p = byKey.get(name);
            if (p) lightLand(p.hikes, name, `${p.count} outings together`);
        }

        /* At rest the readout states how to read the sheet, in the same fixed
           place the answer appears. Nothing here floats. */
        function rest() {
            plot.classList.remove('net-focus');
            svg.querySelectorAll('.lit').forEach(l => l.classList.remove('lit'));
            plot.querySelectorAll('.near').forEach(l => l.classList.remove('near'));
            if (!readout) return;
            readout.innerHTML = `<div class="net-ro-name">How to read it</div>
                <p class="net-ro-note">Every companion is a station, set at the middle of their era —
                clockwise from the top runs ${new Date(byEra[0].mid).getUTCFullYear()} to
                ${new Date(byEra[byEra.length - 1].mid).getUTCFullYear()}. The nearer the centre, the
                more ground you have covered together. A line between two stations means they have
                walked together too, and the heavier it is drawn, the more often.</p>`;
        }

        function card(p) {
            if (!readout || !p) return;
            const c = closest.get(p.name);
            const y1 = hikeYear(p.first), y2 = hikeYear(p.last);
            const stat = (v, l) => `<div><div class="net-v">${v}</div><div class="net-l">${l}</div></div>`;
            readout.innerHTML = `<div class="net-ro-name">${p.name}</div>
                <div class="net-ro-meta">${y1}${y2 !== y1 ? `–${y2}` : ''} · first met on ${p.first.trail_name}</div>
                <div class="net-stats">
                    ${stat(p.count, 'outings')}
                    ${stat(Math.round(p.miles).toLocaleString(), 'miles')}
                    ${stat(Math.round(p.feet).toLocaleString(), 'ft climbed')}
                    ${stat(p.trips.size, p.trips.size === 1 ? 'trip' : 'trips')}
                </div>
                ${c ? `<div class="net-ro-meta">Most often alongside <b>${c.who}</b> — ${c.n} shared</div>` : ''}
                <a class="atlas-door" href="crew-member.html?name=${encodeURIComponent(p.name)}">
                    <svg class="ad-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.2C10.6 6 8.7 5.4 6.2 5.4H3.2v12.2h3c2.5 0 4.4.6 5.8 1.8 1.4-1.2 3.3-1.8 5.8-1.8h3V5.4h-3c-2.5 0-4.4.6-5.8 1.8Z"/><path d="M12 7.2v12.2"/></svg>
                    <span>Open the service record</span>
                    <svg class="ad-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6l6 6-6 6"/><path d="M4 4v16"/></svg>
                </a>`;
        }

        plot.addEventListener('mouseleave', rest);
        layout();
        let t;
        addEventListener('resize', () => { clearTimeout(t); t = setTimeout(layout, 150); });
    }

    // Reveal the section when it scrolls into view
    const io = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { section.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.08 });
    io.observe(section);
})();
