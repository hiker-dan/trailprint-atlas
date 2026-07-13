/**
 * The Shape of the Day — the hike page's elevation profile.
 *
 * Hand-drawn SVG, no chart library. Parses the same GPX text the trail map
 * uses (one fetch serves both) and draws the day's terrain: an area chart in
 * the Atlas palette with a summit flag at the high point, elevation gridlines,
 * and mile markers. Hovering scrubs a crosshair here and reports each sample
 * to the page, which glides a dot along the trail line on the map above.
 *
 * The chart's height is honest: a fixed feet-per-pixel scale (within bounds)
 * means a 2,000-foot climb towers and a flat stroll stays a low ribbon —
 * the shape of the day at a glance, comparable across hikes.
 *
 * Exposes:
 *   AtlasShape.parseGpx(xmlText)  -> track object, or null if undrawable
 *   AtlasShape.render(el, track, { onScrub, onLeave })
 */
const AtlasShape = (() => {

    const SAMPLE_COUNT = 240;       // evenly spaced points the chart draws
    const SMOOTH_HALF_WINDOW = 5;   // moving-average reach, tames GPS jitter
    const PX_PER_FT = 0.1;          // the honest vertical scale
    const MIN_PLOT_PX = 48;         // floor so flat days still read as a ribbon
    const MAX_PLOT_PX = 240;        // ceiling so big climbs don't swallow the page

    /**
     * Parses GPX text into an evenly spaced elevation track.
     * Returns null when the file can't yield a drawable profile.
     */
    function parseGpx(xmlText) {
        const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
        const trkpts = [...xml.querySelectorAll('trkpt')];
        if (trkpts.length < 2) return null;

        const raw = [];
        for (const pt of trkpts) {
            const eleNode = pt.querySelector('ele');
            if (!eleNode) continue;
            raw.push({
                lat: parseFloat(pt.getAttribute('lat')),
                lon: parseFloat(pt.getAttribute('lon')),
                ele: parseFloat(eleNode.textContent) * 3.28084 // meters -> feet
            });
        }
        if (raw.length < 2) return null;

        // Cumulative trail miles (haversine between consecutive points)
        const R = 3958.8;
        let dist = 0;
        raw.forEach((p, i) => {
            if (i > 0) {
                const a = raw[i - 1];
                const dLat = (p.lat - a.lat) * Math.PI / 180;
                const dLon = (p.lon - a.lon) * Math.PI / 180;
                const s = Math.sin(dLat / 2) ** 2 +
                    Math.cos(a.lat * Math.PI / 180) * Math.cos(p.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
                dist += 2 * R * Math.asin(Math.sqrt(s));
            }
            p.mi = dist;
        });
        if (dist === 0) return null;

        // Smooth the elevation before drawing: raw GPS altitude is jittery
        const smoothed = raw.map((p, i) => {
            let sum = 0, n = 0;
            const from = Math.max(0, i - SMOOTH_HALF_WINDOW);
            const to = Math.min(raw.length - 1, i + SMOOTH_HALF_WINDOW);
            for (let j = from; j <= to; j++) { sum += raw[j].ele; n++; }
            return sum / n;
        });
        raw.forEach((p, i) => { p.ele = smoothed[i]; });

        // Resample to evenly spaced points so the drawing (and hover lookup)
        // is uniform no matter how unevenly the GPS recorded
        const samples = [];
        let k = 0;
        for (let i = 0; i < SAMPLE_COUNT; i++) {
            const target = dist * i / (SAMPLE_COUNT - 1);
            while (k < raw.length - 2 && raw[k + 1].mi < target) k++;
            const a = raw[k], b = raw[k + 1];
            const t = b.mi > a.mi ? (target - a.mi) / (b.mi - a.mi) : 0;
            samples.push({
                mi: target,
                ele: a.ele + (b.ele - a.ele) * t,
                lat: a.lat + (b.lat - a.lat) * t,
                lon: a.lon + (b.lon - a.lon) * t
            });
        }

        // Recorded tracks carry per-point clocks; AllTrails route downloads
        // don't. Capture the day's window when it exists (feeds the almanac).
        const times = [...xml.querySelectorAll('trkpt > time')];
        let startTime = null, endTime = null;
        if (times.length >= 2) {
            const first = new Date(times[0].textContent);
            const last = new Date(times[times.length - 1].textContent);
            if (!isNaN(first) && !isNaN(last) && last > first) {
                startTime = first;
                endTime = last;
            }
        }

        return {
            samples,
            totalMiles: dist,
            minEle: Math.min(...samples.map(s => s.ele)),
            maxEle: Math.max(...samples.map(s => s.ele)),
            startTime,
            endTime
        };
    }

    /**
     * Draws the profile into `el` (replacing any previous chart) and wires the
     * hover scrubbing. onScrub(sample) fires as the mouse moves along the
     * terrain; onLeave() when it steps off.
     */
    function render(el, track, { onScrub = null, onLeave = null } = {}) {
        const { samples, totalMiles } = track;

        // Palette straight from base.css so the chart never drifts off-brand
        const css = getComputedStyle(document.documentElement);
        const evergreen = css.getPropertyValue('--evergreen').trim() || '#2c3e50';
        const trailGreen = css.getPropertyValue('--trail-green').trim() || '#4a7c59';
        const gravel = css.getPropertyValue('--gravel').trim() || '#777';

        // Round the elevation window outward to friendly gridline steps
        const range = track.maxEle - track.minEle;
        const step = range > 1500 ? 500 : range > 600 ? 250 : 100;
        const yMin = Math.floor(track.minEle / step) * step;
        const yMax = Math.ceil(track.maxEle / step) * step;

        // The honest scale: plot height comes from the elevation window itself
        const plotH = Math.max(MIN_PLOT_PX, Math.min(MAX_PLOT_PX, (yMax - yMin) * PX_PER_FT));
        const W = 1000, padL = 52, padR = 14, padT = 26, padB = 30;
        const H = padT + plotH + padB;

        const x = mi => padL + (mi / totalMiles) * (W - padL - padR);
        const y = ele => padT + (1 - (ele - yMin) / (yMax - yMin)) * plotH;

        // Gridlines + axis labels
        let grid = '', labels = '';
        for (let e = yMin; e <= yMax; e += step) {
            grid += `<line x1="${padL}" y1="${y(e)}" x2="${W - padR}" y2="${y(e)}" stroke="#e8e5dc" stroke-width="1"/>`;
            labels += `<text x="${padL - 8}" y="${y(e) + 4}" text-anchor="end" font-size="12" fill="${gravel}">${e.toLocaleString()}</text>`;
        }
        // Tick spacing adapts to the trail: short strolls get fractional miles
        const mileStep = totalMiles > 6 ? 2 : totalMiles > 1.5 ? 1 : totalMiles > 0.5 ? 0.25 : 0.1;
        for (let i = 0; i * mileStep <= totalMiles; i++) {
            const m = i * mileStep;
            const label = m === 0 ? '0 mi' : parseFloat(m.toFixed(2));
            labels += `<text x="${x(m)}" y="${H - 8}" text-anchor="middle" font-size="12" fill="${gravel}">${label}</text>`;
            grid += `<line x1="${x(m)}" y1="${H - padB}" x2="${x(m)}" y2="${H - padB + 5}" stroke="#cfcabd" stroke-width="1"/>`;
        }

        // The terrain: a filled area under an evergreen line
        const linePts = samples.map(s => `${x(s.mi).toFixed(1)},${y(s.ele).toFixed(1)}`).join(' ');
        const areaPath = `M ${x(0)},${y(samples[0].ele)} ` +
            samples.slice(1).map(s => `L ${x(s.mi).toFixed(1)},${y(s.ele).toFixed(1)}`).join(' ') +
            ` L ${x(totalMiles)},${H - padB} L ${x(0)},${H - padB} Z`;

        // Summit flag at the day's high point — but a near-flat stroll has no
        // summit worth flagging, so it only appears when the day really climbed
        let summit = '';
        if (range >= 120) {
            const peak = samples.reduce((a, b) => (b.ele > a.ele ? b : a));
            // Flag text flips to the left when the peak sits near the right edge
            const flagLeft = x(peak.mi) > W - 130;
            summit = `
              <line x1="${x(peak.mi)}" y1="${y(peak.ele)}" x2="${x(peak.mi)}" y2="${y(peak.ele) - 16}" stroke="${evergreen}" stroke-width="1.5"/>
              <path d="M ${x(peak.mi)},${y(peak.ele) - 16} l ${flagLeft ? -12 : 12},4 l ${flagLeft ? 12 : -12},4 Z" fill="${trailGreen}"/>
              <text x="${x(peak.mi) + (flagLeft ? -16 : 16)}" y="${y(peak.ele) - 8}" text-anchor="${flagLeft ? 'end' : 'start'}" font-size="13" font-weight="700" fill="${evergreen}">${Math.round(peak.ele).toLocaleString()} ft</text>`;
        }

        el.innerHTML = `
          <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Elevation profile: ${Math.round(range).toLocaleString()} feet from lowest to highest point over ${totalMiles.toFixed(1)} miles">
            <defs>
              <linearGradient id="shape-terrain-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${trailGreen}" stop-opacity="0.45"/>
                <stop offset="100%" stop-color="${trailGreen}" stop-opacity="0.06"/>
              </linearGradient>
            </defs>
            ${grid}
            <path d="${areaPath}" fill="url(#shape-terrain-fill)"/>
            <polyline points="${linePts}" fill="none" stroke="${evergreen}" stroke-width="2.5" stroke-linejoin="round"/>
            ${summit}
            ${labels}
            <line class="shape-crosshair" x1="0" y1="${padT}" x2="0" y2="${H - padB}" stroke="${evergreen}" stroke-width="1" stroke-dasharray="3 3" opacity="0"/>
            <circle class="shape-hover-dot" r="5" fill="${trailGreen}" stroke="#fff" stroke-width="2" opacity="0"/>
          </svg>
          <div class="shape-readout"></div>`;

        // Hover scrubbing — listeners live on the fresh SVG, so re-rendering
        // for another hike never stacks handlers
        const svg = el.querySelector('svg');
        const crosshair = svg.querySelector('.shape-crosshair');
        const hoverDot = svg.querySelector('.shape-hover-dot');
        const readout = el.querySelector('.shape-readout');

        svg.addEventListener('mousemove', (e) => {
            const rect = svg.getBoundingClientRect();
            const svgX = ((e.clientX - rect.left) / rect.width) * W;
            const frac = Math.min(1, Math.max(0, (svgX - padL) / (W - padL - padR)));
            const s = samples[Math.round(frac * (SAMPLE_COUNT - 1))];
            crosshair.setAttribute('x1', x(s.mi));
            crosshair.setAttribute('x2', x(s.mi));
            crosshair.setAttribute('opacity', 1);
            hoverDot.setAttribute('cx', x(s.mi));
            hoverDot.setAttribute('cy', y(s.ele));
            hoverDot.setAttribute('opacity', 1);
            readout.innerHTML = `${Math.round(s.ele).toLocaleString()} ft <span class="ro-mile">&middot; mile ${s.mi.toFixed(1)}</span>`;
            readout.style.left = `${(x(s.mi) / W) * rect.width}px`;
            if (onScrub) onScrub(s);
        });
        svg.addEventListener('mouseleave', () => {
            crosshair.setAttribute('opacity', 0);
            hoverDot.setAttribute('opacity', 0);
            if (onLeave) onLeave();
        });
    }

    return { parseGpx, render };
})();
