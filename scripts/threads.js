/**
 * Threads of the Trail — the homepage milestone narrative.
 *
 * Renders a vintage USGS-style quadrangle ("The Field Sheet"): procedural
 * contour terrain (a seeded height field run through marching squares),
 * woodland tint, water, and an authentic collar (neatline, declination
 * diagram, bar scale, tick marks). The milestones themselves are computed
 * live from hikes.json and planted along a fixed wandering trail as brass
 * benchmark disks — "firsts" get an engraved glyph, recurring/numeric ones
 * a stamped value. New milestones join automatically as the Atlas grows.
 *
 * Requires config.js + atlas-data.js. Added July 2026 (home redesign).
 */
(function () {
    'use strict';

    const mount = document.getElementById('threads-sheet');
    if (!mount) return;

    const SVGNS = 'http://www.w3.org/2000/svg';
    const svgEl = (tag, attrs) => {
        const n = document.createElementNS(SVGNS, tag);
        for (const k in attrs) n.setAttribute(k, attrs[k]);
        return n;
    };

    // ---- Sheet geometry (SVG user units) ----
    const W = 1080, H = 760;
    const M = 34;                       // collar margin
    const NEAT = { x: M, y: M, w: W - 2 * M, h: H - 2 * M - 46 }; // body; extra bottom band for collar text
    const BX = NEAT.x, BY = NEAT.y, BW = NEAT.w, BH = NEAT.h;

    // ---- Seeded RNG (mulberry32) so the map is stable across visits ----
    function mulberry32(seed) {
        return function () {
            seed |= 0; seed = seed + 0x6D2B79F5 | 0;
            let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }
    const rand = mulberry32(20220108); // the Atlas's first-hike date, as a seed

    const svg = svgEl('svg', { class: 'sheet-art', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });

    // Paper + a soft aged vignette / foxing
    svg.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: '#f2ead2' }));
    const defs = svgEl('defs', {});
    defs.innerHTML = `
        <radialGradient id="foxing" cx="50%" cy="46%" r="65%">
            <stop offset="0%" stop-color="#f7f0da" stop-opacity="1"/>
            <stop offset="72%" stop-color="#f2ead2" stop-opacity="0"/>
            <stop offset="100%" stop-color="#e4d9b6" stop-opacity="0.55"/>
        </radialGradient>
        <radialGradient id="wood" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#8fb08a" stop-opacity="0.42"/>
            <stop offset="70%" stop-color="#8fb08a" stop-opacity="0.24"/>
            <stop offset="100%" stop-color="#8fb08a" stop-opacity="0"/>
        </radialGradient>`;
    svg.appendChild(defs);
    svg.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#foxing)' }));

    // A clip so terrain never spills past the neatline
    const clip = svgEl('clipPath', { id: 'bodyClip' });
    clip.appendChild(svgEl('rect', { x: BX, y: BY, width: BW, height: BH }));
    defs.appendChild(clip);
    const body = svgEl('g', { 'clip-path': 'url(#bodyClip)' });
    svg.appendChild(body);

    // ================= 1. HEIGHT FIELD =================
    // A handful of seeded peaks/basins + low-frequency ripple → organic terrain.
    const peaks = [
        { x: 0.20, y: 0.28, amp: 1.00, sig: 0.15 },
        { x: 0.70, y: 0.22, amp: 0.86, sig: 0.16 },
        { x: 0.84, y: 0.60, amp: 0.72, sig: 0.13 },
        { x: 0.45, y: 0.52, amp: 0.60, sig: 0.19 },
        { x: 0.30, y: 0.78, amp: 0.62, sig: 0.13 },
        { x: 0.14, y: 0.84, amp: -0.55, sig: 0.12 }, // basin → lake (lower-left corner, clear of the trail)
        { x: 0.62, y: 0.74, amp: -0.24, sig: 0.10 },
        { x: 0.92, y: 0.30, amp: 0.40, sig: 0.10 },
    ];
    // small seeded phase offsets keep the ripple from looking mechanical
    const ph = [rand() * 6.28, rand() * 6.28, rand() * 6.28];
    function heightAt(u, v) {
        let h = 0;
        for (const p of peaks) {
            const dx = u - p.x, dy = v - p.y;
            h += p.amp * Math.exp(-(dx * dx + dy * dy) / (2 * p.sig * p.sig));
        }
        // ridged low-frequency detail
        h += 0.06 * Math.sin(u * 7.0 + v * 3.0 + ph[0]);
        h += 0.045 * Math.sin(u * 12.5 - v * 9.0 + ph[1]);
        h += 0.03 * Math.sin(u * 20.0 + v * 15.0 + ph[2]);
        return h;
    }

    const COLS = 88, ROWS = 60;
    const field = [];
    let hMin = Infinity, hMax = -Infinity;
    for (let j = 0; j <= ROWS; j++) {
        const row = [];
        for (let i = 0; i <= COLS; i++) {
            const val = heightAt(i / COLS, j / ROWS);
            row.push(val);
            if (val < hMin) hMin = val;
            if (val > hMax) hMax = val;
        }
        field.push(row);
    }
    const cw = BW / COLS, ch = BH / ROWS;
    const gx = i => BX + i * cw;
    const gy = j => BY + j * ch;

    // ================= 2. WOODLAND TINT =================
    // Forested highlands: soft green wash around the positive massifs.
    peaks.filter(p => p.amp > 0.45).forEach(p => {
        const r = p.sig * BW * 1.6;
        body.appendChild(svgEl('ellipse', {
            cx: BX + p.x * BW, cy: BY + p.y * BH,
            rx: r, ry: r * (0.8 + rand() * 0.3),
            fill: 'url(#wood)'
        }));
    });

    // ================= 3. CONTOURS (marching squares) =================
    const contourColor = '#9c6b3f';   // USGS brown
    const indexColor = '#7c4f28';
    const NLEVELS = 16;               // ~25% fewer minor contours → calmer, still organic
    const lo = hMin + (hMax - hMin) * 0.06;
    const hi = hMax - (hMax - hMin) * 0.03;
    const step = (hi - lo) / NLEVELS;

    function marchLevel(level) {
        let d = '';
        for (let j = 0; j < ROWS; j++) {
            for (let i = 0; i < COLS; i++) {
                const a = field[j][i], b = field[j][i + 1], c = field[j + 1][i + 1], dd = field[j + 1][i];
                let idx = 0;
                if (a > level) idx |= 8;
                if (b > level) idx |= 4;
                if (c > level) idx |= 2;
                if (dd > level) idx |= 1;
                if (idx === 0 || idx === 15) continue;
                // edge crossing points (linear)
                const top = () => [gx(i + (level - a) / (b - a)), gy(j)];
                const right = () => [gx(i + 1), gy(j + (level - b) / (c - b))];
                const bottom = () => [gx(i + (level - dd) / (c - dd)), gy(j + 1)];
                const left = () => [gx(i), gy(j + (level - a) / (dd - a))];
                const seg = (p, q) => { d += `M${p[0].toFixed(1)},${p[1].toFixed(1)}L${q[0].toFixed(1)},${q[1].toFixed(1)}`; };
                switch (idx) {
                    case 1: case 14: seg(left(), bottom()); break;
                    case 2: case 13: seg(bottom(), right()); break;
                    case 3: case 12: seg(left(), right()); break;
                    case 4: case 11: seg(top(), right()); break;
                    case 5: seg(left(), top()); seg(bottom(), right()); break;
                    case 6: case 9: seg(top(), bottom()); break;
                    case 7: case 8: seg(left(), top()); break;
                    case 10: seg(left(), bottom()); seg(top(), right()); break;
                }
            }
        }
        return d;
    }

    const contourGroup = svgEl('g', {});
    body.appendChild(contourGroup);
    const labelPts = []; // sampled points on index contours for elevation labels
    for (let n = 0; n < NLEVELS; n++) {
        const level = lo + n * step;
        const d = marchLevel(level);
        if (!d) continue;
        const isIndex = n % 5 === 0;
        contourGroup.appendChild(svgEl('path', {
            d, fill: 'none',
            stroke: isIndex ? indexColor : contourColor,
            'stroke-width': isIndex ? 1.4 : 0.75,
            'stroke-opacity': isIndex ? 0.8 : 0.42,   // lighter minor lines → easier to read labels over
            'stroke-linecap': 'round', 'stroke-linejoin': 'round'
        }));
        // grab a couple of label anchor points from index contours
        if (isIndex && n > 0) {
            const m = d.match(/M([\d.]+),([\d.]+)/g);
            if (m && m.length > 8) {
                const elev = 1000 + n * 120; // decorative elevation values
                [Math.floor(m.length * 0.28), Math.floor(m.length * 0.7)].forEach(k => {
                    const mm = m[k].match(/M([\d.]+),([\d.]+)/);
                    labelPts.push({ x: +mm[1], y: +mm[2], elev });
                });
            }
        }
    }

    // Elevation labels are rendered later (in the milestone callback) so they can
    // dodge the marker disks and their text — candidates are just collected here.
    const elevGroup = svgEl('g', {});
    body.appendChild(elevGroup);
    function renderElevationLabels(avoidRects) {
        const inset = 46;
        const overlapsAny = r => avoidRects.some(a => !(r.x1 < a.x0 || r.x0 > a.x1 || r.y1 < a.y0 || r.y0 > a.y1));
        let drawn = 0;
        for (const lp of labelPts) {
            if (drawn >= 6) break;
            if (lp.x < BX + inset || lp.x > BX + BW - inset || lp.y < BY + inset || lp.y > BY + BH - inset) continue;
            const rect = { x0: lp.x - 22, y0: lp.y - 9, x1: lp.x + 22, y1: lp.y + 5 };
            if (overlapsAny(rect)) continue;
            avoidRects.push(rect);
            const halo = svgEl('text', { x: lp.x, y: lp.y, 'text-anchor': 'middle', 'font-family': "'Alegreya Sans', sans-serif", 'font-size': 9, fill: '#f2ead2', stroke: '#f2ead2', 'stroke-width': 3, 'paint-order': 'stroke' });
            halo.textContent = lp.elev; elevGroup.appendChild(halo);
            const t = svgEl('text', { x: lp.x, y: lp.y, 'text-anchor': 'middle', 'font-family': "'Alegreya Sans', sans-serif", 'font-size': 9, fill: indexColor, 'font-style': 'italic' });
            t.textContent = lp.elev; elevGroup.appendChild(t);
            drawn++;
        }
    }

    // ================= 4. WATER =================
    const waterColor = '#6f97b3';     // USGS water blue (a touch softer, aged)
    const waterEdge = '#4f7998';
    // Helper: a smooth closed shape (Catmull-Rom → cubic bezier) through points
    function smoothClosed(pts) {
        const n = pts.length;
        let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
        for (let i = 0; i < n; i++) {
            const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
            const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
            const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
            d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
        }
        return d + 'Z';
    }
    // A lake in the lower-left basin: a natural, gently irregular shoreline
    const lakeCx = BX + 0.15 * BW, lakeCy = BY + 0.83 * BH;
    const lakePts = [];
    const lobes = 11;
    // fixed-but-organic radii so the outline undulates without spiking
    const lakeR = [1.0, 1.14, 0.9, 1.05, 0.82, 1.1, 0.95, 1.18, 0.86, 1.02, 0.92];
    for (let k = 0; k < lobes; k++) {
        const a = (k / lobes) * Math.PI * 2 + 0.3;
        const rr = 0.072 * BW * lakeR[k];
        lakePts.push([lakeCx + Math.cos(a) * rr * 1.18, lakeCy + Math.sin(a) * rr * 0.72]);
    }
    const lakeD = smoothClosed(lakePts);
    // Authentic topo behavior: contours STOP at the shoreline (a lake is one flat
    // water elevation). Mask the contour layer out wherever the lake sits.
    const lakeMask = svgEl('mask', { id: 'lakeMask' });
    lakeMask.appendChild(svgEl('rect', { x: BX, y: BY, width: BW, height: BH, fill: 'white' }));
    lakeMask.appendChild(svgEl('path', { d: lakeD, fill: 'black' }));
    defs.appendChild(lakeMask);
    contourGroup.setAttribute('mask', 'url(#lakeMask)');

    body.appendChild(svgEl('path', { d: lakeD, fill: waterColor, 'fill-opacity': 0.5, stroke: waterEdge, 'stroke-width': 1.3, 'stroke-opacity': 0.9, 'stroke-linejoin': 'round' }));
    // faint inner "depth" ring, like a topo lake's first depth contour
    body.appendChild(svgEl('path', { d: smoothClosed(lakePts.map(p => [lakeCx + (p[0] - lakeCx) * 0.72, lakeCy + (p[1] - lakeCy) * 0.72])), fill: 'none', stroke: waterEdge, 'stroke-width': 0.7, 'stroke-opacity': 0.45 }));
    const lakeLbl = svgEl('text', { x: lakeCx, y: lakeCy + 3, 'text-anchor': 'middle', 'font-family': "'Alegreya Sans', sans-serif", 'font-style': 'italic', 'font-size': 10, fill: waterEdge, 'fill-opacity': 0.9 });
    lakeLbl.textContent = 'Mirror Lake'; body.appendChild(lakeLbl);
    // (Stream removed July 2026 — it didn't read naturally into the lake.)

    // ================= 5. COLLAR (neatline, ticks, declination, scale, title) =================
    const collar = svgEl('g', {});
    svg.appendChild(collar);
    // Double neatline
    collar.appendChild(svgEl('rect', { x: BX, y: BY, width: BW, height: BH, fill: 'none', stroke: '#2c2418', 'stroke-width': 1.6 }));
    collar.appendChild(svgEl('rect', { x: BX - 4, y: BY - 4, width: BW + 8, height: BH + 8, fill: 'none', stroke: '#2c2418', 'stroke-width': 0.8 }));

    // UTM-style tick marks + tiny numbers along top & bottom
    for (let k = 1; k < 8; k++) {
        const x = BX + (BW / 8) * k;
        [BY, BY + BH].forEach((yy, edge) => {
            collar.appendChild(svgEl('line', { x1: x, y1: yy, x2: x, y2: yy + (edge ? 6 : -6), stroke: '#2c2418', 'stroke-width': 1 }));
        });
        const lab = svgEl('text', { x: x, y: BY - 9, 'text-anchor': 'middle', 'font-family': "'Alegreya Sans', sans-serif", 'font-size': 8, fill: '#5b4a2c' });
        lab.textContent = `${370 + k}`; collar.appendChild(lab);
    }
    for (let k = 1; k < 6; k++) {
        const y = BY + (BH / 6) * k;
        [BX, BX + BW].forEach((xx, edge) => {
            collar.appendChild(svgEl('line', { x1: xx, y1: y, x2: xx + (edge ? 6 : -6), y2: y, stroke: '#2c2418', 'stroke-width': 1 }));
        });
    }
    // Decorative corner coordinates
    const corner = (x, y, txt, anchor) => {
        const t = svgEl('text', { x, y, 'text-anchor': anchor, 'font-family': "'Alegreya Sans', sans-serif", 'font-size': 9, fill: '#5b4a2c' });
        t.textContent = txt; collar.appendChild(t);
    };
    corner(BX - 6, BY - 10, '34°30′', 'start');
    corner(BX + BW + 6, BY - 10, '118°15′', 'end');

    // ---- Bottom collar band: declination + scale + title ----
    const bandY = BY + BH + 24;

    // Declination diagram (three norths), in the bottom collar band (fully below the neatline)
    const decl = svgEl('g', { transform: `translate(${BX + 26}, ${bandY + 27})` });
    decl.appendChild(svgEl('line', { x1: 0, y1: 8, x2: 0, y2: -26, stroke: '#2c2418', 'stroke-width': 1.2 })); // true north
    decl.appendChild(svgEl('path', { d: 'M0,-30 l3.4,7 l-3.4,-2.4 l-3.4,2.4 Z', fill: '#2c2418' }));           // star point
    const starTxt = svgEl('text', { x: 0, y: -34, 'text-anchor': 'middle', 'font-family': "'Alegreya Sans', sans-serif", 'font-size': 8, fill: '#2c2418', 'font-weight': 700 }); starTxt.textContent = '★'; decl.appendChild(starTxt);
    decl.appendChild(svgEl('line', { x1: 0, y1: 8, x2: 8, y2: -24, stroke: '#7c4f28', 'stroke-width': 1 }));       // magnetic north
    const mn = svgEl('text', { x: 12, y: -20, 'font-family': "'Alegreya Sans', sans-serif", 'font-size': 8, fill: '#7c4f28' }); mn.textContent = 'MN 12°'; decl.appendChild(mn);
    decl.appendChild(svgEl('line', { x1: 0, y1: 8, x2: -7, y2: -24, stroke: '#5c86a3', 'stroke-width': 1 }));      // grid north
    const gn = svgEl('text', { x: -26, y: -20, 'font-family': "'Alegreya Sans', sans-serif", 'font-size': 8, fill: '#5c86a3' }); gn.textContent = 'GN'; decl.appendChild(gn);
    collar.appendChild(decl);

    // Bar scale, bottom-center
    const scaleG = svgEl('g', { transform: `translate(${BX + BW / 2 - 90}, ${bandY - 2})` });
    const segW = 30;
    for (let k = 0; k < 6; k++) {
        scaleG.appendChild(svgEl('rect', { x: k * segW, y: 0, width: segW, height: 6, fill: k % 2 ? '#f2ead2' : '#2c2418', stroke: '#2c2418', 'stroke-width': 0.8 }));
    }
    for (let k = 0; k <= 6; k++) {
        const t = svgEl('text', { x: k * segW, y: -4, 'text-anchor': 'middle', 'font-family': "'Alegreya Sans', sans-serif", 'font-size': 8, fill: '#2c2418' });
        t.textContent = k; scaleG.appendChild(t);
    }
    const miLbl = svgEl('text', { x: 3 * segW, y: 18, 'text-anchor': 'middle', 'font-family': "'Alegreya Sans', sans-serif", 'font-size': 8, fill: '#5b4a2c', 'letter-spacing': '0.08em' });
    miLbl.textContent = 'MILES'; scaleG.appendChild(miLbl);
    const ci = svgEl('text', { x: 3 * segW, y: 30, 'text-anchor': 'middle', 'font-family': "'Alegreya Sans', sans-serif", 'font-size': 8, fill: '#7c4f28', 'letter-spacing': '0.05em', 'font-style': 'italic' });
    ci.textContent = 'CONTOUR INTERVAL — ONE MILESTONE'; scaleG.appendChild(ci);
    collar.appendChild(scaleG);

    // Title block, bottom-right
    const title = svgEl('g', { transform: `translate(${BX + BW - 8}, ${bandY})` });
    const t1 = svgEl('text', { x: 0, y: 0, 'text-anchor': 'end', 'font-family': "'National Park', sans-serif", 'font-size': 15, fill: '#2c3e50', 'letter-spacing': '0.06em' }); t1.textContent = 'THREADS OF THE TRAIL QUADRANGLE'; title.appendChild(t1);
    const t2 = svgEl('text', { x: 0, y: 14, 'text-anchor': 'end', 'font-family': "'Alegreya Sans', sans-serif", 'font-size': 9, fill: '#5b4a2c', 'letter-spacing': '0.14em' }); t2.textContent = 'THE TRAILPRINT ATLAS — PROVISIONAL EDITION'; title.appendChild(t2);
    collar.appendChild(title);

    mount.appendChild(svg);

    // ================= 6. MILESTONES (live from hikes.json) =================
    // A fixed wandering trail across the sheet; stations distribute along it,
    // so the map stays bounded and organic no matter how many milestones exist.
    const spineCtrl = [
        [0.07, 0.40], [0.17, 0.26], [0.30, 0.34], [0.42, 0.24], [0.55, 0.31], [0.68, 0.23], [0.80, 0.33],
        [0.83, 0.50], [0.71, 0.585], [0.58, 0.53], [0.46, 0.60], [0.34, 0.55], [0.245, 0.65],
        [0.34, 0.80], [0.49, 0.86], [0.63, 0.82], [0.75, 0.72]
    ].map(([u, v]) => [BX + u * BW, BY + v * BH]);

    // Catmull-Rom → dense polyline, then arc-length resample
    function catmullRom(pts, samplesPer = 24) {
        const out = [];
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
            for (let s = 0; s < samplesPer; s++) {
                const t = s / samplesPer, t2 = t * t, t3 = t2 * t;
                const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
                const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
                out.push([x, y]);
            }
        }
        out.push(pts[pts.length - 1]);
        return out;
    }
    const spine = catmullRom(spineCtrl);
    // cumulative arc length
    const cum = [0];
    for (let i = 1; i < spine.length; i++) cum.push(cum[i - 1] + Math.hypot(spine[i][0] - spine[i - 1][0], spine[i][1] - spine[i - 1][1]));
    const totalLen = cum[cum.length - 1];
    function pointAtLen(L) {
        L = Math.max(0, Math.min(totalLen, L));
        let i = 1; while (i < cum.length && cum[i] < L) i++;
        const t = (L - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
        return [spine[i - 1][0] + (spine[i][0] - spine[i - 1][0]) * t, spine[i - 1][1] + (spine[i][1] - spine[i - 1][1]) * t];
    }

    // ---- Engraved glyphs (line art, sit in the brass). Each milestone CATEGORY
    // has its own glyph, so recurring markers are told apart by symbol, never by a
    // stamped number (100 miles vs the 100th outing are now clearly different marks). ----
    const G = {
        first:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21V4"/><path d="M9 5h8l-2 2.5L17 10H9"/></svg>',
        group:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="7" r="2"/><circle cx="16" cy="7" r="2"/><path d="M4.5 20v-3a3.5 3.5 0 0 1 7 0v3"/><path d="M12.5 20v-3a3.5 3.5 0 0 1 7 0v3"/></svg>',
        solo:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.4" r="1.9"/><path d="M12 6.6v6"/><path d="M12 12.6l-3 6.4"/><path d="M12 12.6l3 6.4"/><path d="M12 8.4l-3.2 2.2"/><path d="M12 8.4l3.2 1.9"/></svg>',
        summit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20l6-10 3.2 5 2.3-3.5L21 20z"/><path d="M9 10V4l3.6 1.3L9 6.8"/></svg>',
        night:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5L3 20h18z"/><path d="M12 5v15"/></svg>',
        border: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21V4l9 2.5L6 9"/><path d="M6 21h13" stroke-dasharray="2 2.5"/></svg>',
        // recurring categories:
        // miles — the first-hike flag, now reached by a bold winding trail that swerves
        // below and out in front of the flag (distance traveled to plant it)
        miles:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 18.5V4.2"/><path d="M9.5 4.7h7l-1.8 2.2 1.8 2.2h-7"/><path d="M2.5 20.4c3.2.6 4.6-1.1 7-1.9 2.6-.9 4.4 1.2 8 .1" stroke-dasharray="0.1 3.6" stroke-width="2"/></svg>',
        // outings — a backpack: rounded body, two shoulder straps, a lid seam, a front pocket
        outings:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12.2a5 5 0 0 1 10 0v5.3a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/><path d="M10.3 11.1c-.3-2.5.2-4.1 1.1-4.9"/><path d="M13.7 11.1c.3-2.5-.2-4.1-1.1-4.9"/><path d="M7.3 13.7h9.4"/><path d="M9.9 19.5v-3.3a2.1 2.1 0 0 1 4.2 0v3.3"/></svg>',
        feet:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16"/><path d="M12 17V5"/><path d="M8.3 8.7 12 5l3.7 3.7"/></svg>'
    };

    // Milestone definitions (priority order → dedupe → chronological), computed from data.
    const US_STATES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']);

    fetchHikes().then(hikes => {
        const chrono = [...hikes].sort(compareHikesChrono);
        const firstWhere = pred => chrono.find(pred);
        const cumCross = (field, threshold) => { let s = 0; for (const h of chrono) { s += h[field] || 0; if (s >= threshold) return h; } return null; };
        const stateOf = h => (h.region || '').split(', ').pop();

        const defs = [];
        const push = (pri, glyph, kicker, short, hike, note) => {
            if (hike) defs.push({ pri, glyph, kicker, short: short || kicker, hike, note });
        };

        // Narrative firsts (one-time). "First Summit" means a real mountain peak
        // (>= 3000 ft), so a 420 ft city overlook doesn't claim the title.
        push(0, G.first, 'The First Step', 'First Step', chrono[0], 'Where the Atlas begins. Every mile since traces back to this trailhead.');
        push(1, G.group, 'First Group Hike', 'First Group', firstWhere(h => h.hike_size === 'Group'), 'The first walk with company — the trail got a little louder.');
        push(2, G.solo, 'First Solo Hike', 'First Solo', firstWhere(h => h.hike_size === 'Solo'), 'Just you and the quiet.');
        push(3, G.summit, 'First Summit', 'First Summit', firstWhere(h => h.summit_trail && h.summit_elevation >= 3000), null);
        push(4, G.night, 'First Night on the Trail', 'First Night', firstWhere(h => h.hike_type === 'Backpacking'), 'The first time you carried everything in and slept out on the trail itself.');
        push(5, G.border, 'Beyond the Border', 'Beyond Border', firstWhere(h => stateOf(h) && !US_STATES.has(stateOf(h))), null);

        // Recurring milestones — each CATEGORY has one glyph; the specific value
        // lives on the label + hover card, so nothing is told apart by a number alone.
        for (let n = 50; n <= chrono.length; n += 50) {
            push(10, G.outings, `The ${ordinal(n)} Outing`, `${ordinal(n)} Outing`, chrono[n - 1], `Outing number ${n}. The Atlas keeps growing.`);
        }
        [100, 250, 500, 750, 1000].forEach(mi => {
            push(20, G.miles, `${mi.toLocaleString()} Miles`, `${mi.toLocaleString()} Miles`, cumCross('miles', mi), `Your cumulative trail mileage crossed ${mi.toLocaleString()} on this hike.`);
        });
        [50000, 100000, 250000].forEach(ft => {
            push(30, G.feet, `${(ft / 1000)}K Feet Climbed`, `${(ft / 1000)}K Feet`, cumCross('elevation_gain', ft), `Total climbing passed ${ft.toLocaleString()} ft — that's ${Math.round(ft / 5280)} vertical miles.`);
        });

        // Context notes that reference the resolved hike
        defs.forEach(d => {
            const h = d.hike;
            if (d.kicker === 'First Summit') d.note = `Your first true mountain summit at ${h.summit_elevation.toLocaleString()} ft: ${h.trail_name}.`;
            if (d.kicker === 'Beyond the Border') d.note = `Your first hike outside the United States, in ${h.region}.`;
        });

        // One milestone per hike (highest priority wins), then chronological
        defs.sort((a, b) => a.pri - b.pri);
        const seen = new Set();
        const stations = defs.filter(d => { if (seen.has(d.hike.trail_id)) return false; seen.add(d.hike.trail_id); return true; });
        stations.sort((a, b) => compareHikesChrono(a.hike, b.hike));

        // Stations distribute along the fixed spine; the map stays bounded as it grows.
        const N = stations.length;
        const pad = totalLen * 0.05;
        const positions = stations.map((_, i) => pointAtLen(pad + (totalLen - 2 * pad) * (N === 1 ? 0.5 : i / (N - 1))));

        // Route: faint solid underlay + dotted footpath through the stations
        const startL = pad, endL = totalLen - pad;
        let routeD = '';
        for (let L = startL; L <= endL; L += 4) {
            const p = pointAtLen(L);
            routeD += (L === startL ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1);
        }
        body.insertBefore(svgEl('path', { d: routeD, fill: 'none', stroke: '#6b4a2a', 'stroke-width': 4, 'stroke-opacity': 0.12, 'stroke-linecap': 'round' }), contourGroup.nextSibling);
        body.insertBefore(svgEl('path', { d: routeD, fill: 'none', stroke: '#6b4a2a', 'stroke-width': 2, 'stroke-dasharray': '0.1 9', 'stroke-linecap': 'round', 'stroke-opacity': 0.92 }), contourGroup.nextSibling);

        // ---- "Survey in progress": the trail continues past the last benchmark,
        // fading out, so the map reads as living and unfinished. ----
        const lastP = positions[N - 1];
        const before = pointAtLen(endL - 14);
        let dirx = lastP[0] - before[0], diry = lastP[1] - before[1];
        const dlen = Math.hypot(dirx, diry) || 1; dirx /= dlen; diry /= dlen;
        const contDots = svgEl('g', {});
        for (let k = 1; k <= 12; k++) {
            const t = k / 12;
            const cx = lastP[0] + dirx * 15 * k + Math.sin(k * 0.9) * 6 * diry;
            const cy = lastP[1] + diry * 15 * k - Math.sin(k * 0.9) * 6 * dirx;
            if (cx > BX + BW - 12 || cy > BY + BH - 12 || cy < BY + 12) break;
            contDots.appendChild(svgEl('circle', { cx, cy, r: 1.7 * (1 - t * 0.5), fill: '#6b4a2a', 'fill-opacity': 0.85 * (1 - t) }));
        }
        body.insertBefore(contDots, contourGroup.nextSibling);
        const contEnd = [lastP[0] + dirx * 15 * 8, lastP[1] + diry * 15 * 8];
        const survTxt = svgEl('text', {
            x: Math.min(contEnd[0], BX + BW - 20), y: Math.min(contEnd[1] + 16, BY + BH - 10),
            'text-anchor': 'middle', 'font-family': "'Alegreya Sans', sans-serif", 'font-style': 'italic',
            'font-size': 9.5, fill: '#6b4a2a', 'fill-opacity': 0.7, 'letter-spacing': '0.06em'
        });
        survTxt.textContent = 'survey in progress…';
        body.appendChild(survTxt);

        // ---- Hover card. Hovering fades the map into a calm "focus" state so the
        // card never sits over live text, and the card itself is hoverable + clickable:
        // a short close delay bridges the gap from disk to card, so you can move onto
        // the card and click "Open this hike" (the whole card is a link). ----
        const tip = document.getElementById('threads-tip');
        let hideTimer = null, activeDisk = null;
        const closeCard = () => {
            mount.classList.remove('focus');
            tip.classList.remove('show');
            if (activeDisk) { activeDisk.classList.remove('active'); activeDisk = null; }
        };
        const scheduleClose = () => { clearTimeout(hideTimer); hideTimer = setTimeout(closeCard, 160); };
        tip.addEventListener('mouseenter', () => clearTimeout(hideTimer));
        tip.addEventListener('mouseleave', scheduleClose);
        tip.addEventListener('click', () => { if (tip.dataset.href) window.location.href = tip.dataset.href; });

        function bindTip(elm, m) {
            elm.addEventListener('mouseenter', () => {
                clearTimeout(hideTimer);
                if (activeDisk && activeDisk !== elm) activeDisk.classList.remove('active');
                mount.classList.add('focus');
                elm.classList.add('active');
                activeDisk = elm;
                const h = m.hike;
                const hasImg = h.images && h.images.length;
                tip.dataset.href = `hike.html?id=${h.trail_id}`;
                const img = hasImg ? `<img loading="lazy" src="${cloudinaryUrl(h.images[0], 'w_488,h_244,c_fill,g_auto,q_auto,f_auto')}" alt="">` : '';
                tip.innerHTML = `${img}<div class="tip-body">
                    <div class="tip-kicker">${m.kicker}</div>
                    <div class="tip-hike">${h.trail_name}</div>
                    <div class="tip-meta">${h.location} · ${formatHikeDate(h.date_completed)}</div>
                    <div class="tip-note">${m.note || ''}</div>
                    <div class="tip-cta">Open this hike →</div></div>`;
                const r = elm.getBoundingClientRect();
                // Offset the card to the side of the disk with the most room, so the
                // disk itself stays visible and the card never straddles it.
                const cardW = 244, cardH = hasImg ? 258 : 140, gap = 14;
                let left = r.right + gap;
                if (left + cardW > window.innerWidth - 8) left = r.left - gap - cardW;
                left = Math.max(8, Math.min(left, window.innerWidth - cardW - 8));
                let top = r.top + r.height / 2 - cardH / 2;
                top = Math.max(8, Math.min(top, window.innerHeight - cardH - 8));
                tip.style.left = left + 'px';
                tip.style.top = top + 'px';
                tip.classList.add('show');
            });
            elm.addEventListener('mouseleave', scheduleClose);
        }

        const pctX = x => (x / W * 100) + '%';
        const pctY = y => (y / H * 100) + '%';

        // ---- Label placement with simple collision avoidance ----
        const R = 26, LW = 128, LH = 30;                       // disk radius, label box
        const placed = positions.map(([px, py]) => ({ x0: px - R, y0: py - R, x1: px + R, y1: py + R }));
        const overlaps = (a, b) => !(a.x1 < b.x0 || a.x0 > b.x1 || a.y1 < b.y0 || a.y0 > b.y1);
        function labelRect(px, top) { return { x0: px - LW / 2, y0: top, x1: px + LW / 2, y1: top + LH }; }
        function placeLabel(px, py) {
            const belowFirst = py < BY + BH * 0.58;
            for (const side of (belowFirst ? [1, -1] : [-1, 1])) {
                let top = side === 1 ? py + R + 5 : py - R - 5 - LH;
                for (let n = 0; n < 7; n++) {
                    const rect = labelRect(px, top);
                    if (rect.y0 > BY + 4 && rect.y1 < BY + BH - 4 && !placed.some(p => overlaps(rect, p))) {
                        placed.push(rect); return top;
                    }
                    top += side * 7;
                }
            }
            const fallback = py + R + 5; placed.push(labelRect(px, fallback)); return fallback;
        }

        stations.forEach((m, i) => {
            const [px, py] = positions[i];

            const disk = document.createElement('a');
            disk.className = 'bm-disk';
            disk.href = `hike.html?id=${m.hike.trail_id}`;
            disk.style.left = pctX(px);
            disk.style.top = pctY(py);
            disk.innerHTML = m.glyph;
            bindTip(disk, m);
            mount.appendChild(disk);

            const labelTop = placeLabel(px, py);
            const label = document.createElement('div');
            label.className = 'bm-label';
            label.style.left = pctX(px);
            label.style.top = pctY(labelTop);
            label.innerHTML = `<div class="lk">${m.short}</div><div class="dt">${formatHikeDate(m.hike.date_completed, { year: 'numeric', month: 'short' })}</div>`;
            mount.appendChild(label);
        });

        // Now place contour elevation labels in the gaps, avoiding every disk + label
        // (and the lake, so a number never clips the shoreline).
        const lxs = lakePts.map(p => p[0]), lys = lakePts.map(p => p[1]);
        placed.push({ x0: Math.min(...lxs) - 12, y0: Math.min(...lys) - 12, x1: Math.max(...lxs) + 12, y1: Math.max(...lys) + 12 });
        renderElevationLabels(placed);
    });

    function ordinal(n) {
        const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }

    // Reveal the sheet when it scrolls into view
    const section = document.querySelector('.threads-section');
    const io = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { section.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    if (section) io.observe(section);
})();
