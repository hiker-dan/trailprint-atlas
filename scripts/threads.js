/**
 * Threads of the Trail — Plate II of the home page's front matter.
 *
 * THE MILESTONE LEDGER. Every milestone the Atlas has earned, in the order it
 * was earned, each one a brass benchmark disk carrying its category's engraved
 * glyph. Milestones are computed live from hikes.json, so new ones join by
 * themselves as the Atlas grows.
 *
 * WHAT USED TO BE HERE, AND WHY IT ISN'T (July 2026). This file drew a vintage
 * USGS quadrangle — a seeded height field run through marching squares for the
 * contours, a woodland tint, an invented lake, a full collar with neatline,
 * declination diagram and bar scale — and planted the benchmarks along a fixed
 * wandering spine on it. About 450 lines of genuinely good procedural
 * cartography, and it still had to go: the redesigned page sets this plate
 * inches from a leaf showing REAL ground, photographed from orbit at zoom 17,
 * and invented contours cannot share a spread with a satellite image. The
 * section's own claim — every marker is a milestone surveyed onto the map the
 * day it was earned — is only TRUE now, because the benchmarks stand at each
 * hike's real coordinates on the index diagram and the plate cuts to the actual
 * ground the milestone happened on.
 *
 * THE ENGINE IS UNTOUCHED: the same priorities, the same cumulative crossings,
 * the same dedupe by trail_id, the same chronological sort, the same glyphs,
 * the same notes. Nothing this section SAYS has changed.
 *
 * The hover card went with the sheet, folded into the row it used to describe.
 * A row has room for its own note, and one fewer floating element is the
 * standing preference here.
 *
 * WHY THE DRAWER IS OPENED BY A CLICK (August 2026, after two rebuilds). It was
 * opened by SCROLLING first, and it never once felt right. The reason is
 * structural, not a tuning problem: a drawer lives between its entry and the
 * next, so opening one MOVES every entry below it — and the scroll position is
 * what was choosing which entry to open. The choice fed its own input. Every
 * remedy was a patch on that loop (measure the layout as if all drawers were
 * shut, damp the switch by 30 px, lock out challenges for 260 ms, compensate
 * the scroll), each one true and none of them enough, because a reader dragging
 * a scrollbar is still moving the thing being measured.
 *
 * Pointing failed for a cousin of the same reason: the drawer opening under the
 * cursor changes what the cursor is over, and passing a cursor across a ledger
 * is not a decision anyway — it is how you read one.
 *
 * So the ledger now works the way a ledger works. HOVER LIGHTS THE LAND: it
 * costs no layout at all, so it cannot fight anything, and it is the whole
 * point of a cross-lit spread. CLICK OPENS THE DRAWER: the layout change is
 * asked for, expected, and attributable, which is exactly what it was never
 * allowed to be before. Nothing is open when the page loads.
 *
 * Talks to the land only through window.AtlasKeyMap — this file knows nothing
 * about Leaflet. Requires config.js + atlas-data.js.
 */
(function () {
    'use strict';

    const mount = document.getElementById('threads-ledger');
    if (!mount) return;

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

    fetchHikes().then(hikes => {
        const chrono = [...hikes].sort(compareHikesChrono);
        const firstWhere = pred => chrono.find(pred);
        const cumCross = (field, threshold) => { let s = 0; for (const h of chrono) { s += h[field] || 0; if (s >= threshold) return h; } return null; };

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
        // "Beyond the Border" asks the country field, not a list of state
        // abbreviations kept here — atlas-data.js owns that rule for the whole site.
        push(5, G.border, 'Beyond the Border', 'Beyond Border', firstWhere(h => hikeCountry(h) !== 'United States'), null);

        // Recurring milestones — each CATEGORY has one glyph; the specific value
        // lives on the label, so nothing is told apart by a number alone.
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
            if (d.kicker === 'First Summit') d.note = `Your first true mountain summit at ${h.summit_elevation.toLocaleString()} ft: ${climbName(h)}.`;
            if (d.kicker === 'Beyond the Border') d.note = `Your first hike outside the United States, in ${h.region}.`;
        });

        // One milestone per hike (highest priority wins), then chronological
        defs.sort((a, b) => a.pri - b.pri);
        const seen = new Set();
        const stations = defs.filter(d => { if (seen.has(d.hike.trail_id)) return false; seen.add(d.hike.trail_id); return true; });
        stations.sort((a, b) => compareHikesChrono(a.hike, b.hike));

        render(stations);
        plantOnTheLand(stations);

        // the plate's own note counts what it holds, rather than asserting a number
        const note = document.getElementById('threads-count');
        if (note) note.textContent = `${stations.length} milestones`;
    });

    /* ---- The ledger ---------------------------------------------------------
       One entry per milestone. THE ACCOMPLISHMENT IS THE HEADLINE — "The 50th
       Outing", "250 Miles" — with the outing that earned it beneath. It used to
       be the other way round, the achievement set in 8.5 px caps above a bold
       trail name, and the thing the whole plate is about was the smallest type
       in the row.

       The row is a real <button>, because that is what it now is: it opens
       something, it takes the keyboard, and a screen reader is told whether it
       is open.

       THE LINE NUMBER. On a wide leaf the ledger runs in TWO COLUMNS, and the
       one thing a milestone list cannot afford to lose is the order things
       happened in. The columns read left to right, then down — the drawer
       spanning the pair makes any other reading impossible to draw — and every
       entry carries its own engraved line number, so the sequence survives
       whatever shape the page takes. (Not to be confused with the rule that a
       recurring BENCHMARK is never told apart by a stamped number: that is
       about identity, this is about sequence, and a ledger has numbered its
       lines for four hundred years.) */
    function render(stations) {
        mount.innerHTML = stations.map((s, i) => `
            <div class="ms-entry" data-i="${i}" data-id="${s.hike.trail_id}">
                <button class="ms-row" type="button" aria-expanded="false" aria-controls="ms-drawer">
                    <span class="ms-no">${String(i + 1).padStart(2, '0')}</span>
                    <span class="ms-disk">${s.glyph}</span>
                    <span class="ms-body">
                        <span class="ms-k">${s.kicker}</span>
                        <span class="ms-t">${s.hike.trail_name}</span>
                    </span>
                    <span class="ms-d">${formatHikeDate(s.hike.date_completed, { year: 'numeric', month: 'short' })}</span>
                    <span class="ms-pull" aria-hidden="true">
                        <svg viewBox="0 0 24 24"><path d="M6 9.5 12 15.5 18 9.5"/></svg>
                    </span>
                </button>
            </div>`).join('');

        entries = Array.from(mount.querySelectorAll('.ms-entry'));
        cards = stations.map(cardHtml);

        /* ONE DRAWER, WHICH MOVES. It used to live inside its own entry, which
           only works while the ledger is a single column: in two columns a
           drawer nested in the left-hand entry would open half-width, shoving
           its own column down and tearing the two columns out of step with
           each other. So there is one drawer element, it spans the full width
           of the ledger, and it is inserted directly beneath the GRID ROW
           holding whichever entry was opened. In one column that is the entry
           itself, which is exactly the old behaviour — nothing had to be
           special-cased for narrow screens. */
        drawer = document.createElement('div');
        drawer.className = 'ms-drawer';
        drawer.id = 'ms-drawer';
        drawer.innerHTML = '<div class="ms-drawer-in"></div>';

        wire();
    }

    /* The preview card. Same facts the old hover card carried — the photograph,
       the milestone, the hike, where and when, the note — laid out along the
       drawer's width instead of stacked into a 244 px tooltip. The way into the
       hike is base.css's shared door, because that is how every crossing in the
       Atlas is drawn. */
    function cardHtml(s) {
        const h = s.hike;
        const imgs = h.images || [];
        const shot = (id, extra) => `<div class="ms-shot ${extra || ''}"><img loading="lazy" alt=""
            src="${cloudinaryUrl(id, 'w_560,h_420,c_fill,g_auto,q_auto,f_auto')}"></div>`;
        // A SECOND FRAME ON A WIDE LEAF. One photograph beside three short lines
        // left most of a 4K card empty; the second slide is dropped by CSS below
        // the width where it would start squeezing the text instead of filling
        // space. It only ever appears when the hike actually has one.
        const photos = imgs.length ? shot(imgs[0]) + (imgs[1] ? shot(imgs[1], 'is-extra') : '') : '';

        // the measurements, which give the body something to hold besides a note
        const vitals = [
            [`${(h.miles || 0).toFixed(1)}`, 'mi'],
            [`${(h.elevation_gain || 0).toLocaleString()}`, 'ft climbed'],
            h.summit_trail && h.summit_elevation
                ? [`${h.summit_elevation.toLocaleString()}`, 'ft summit']
                : [h.hike_type, ''],
        ].map(([v, l]) => `<div class="ms-v"><div class="ms-v-n">${v}</div><div class="ms-v-l">${l}</div></div>`).join('');

        // The measurements and the way in share one footer row, so the card's
        // whole width is used: stacked, they left the right third of a 1,200 px
        // drawer empty under a one-line note.
        return `<div class="ms-card">
            ${photos}
            <div class="ms-card-body">
                <div class="ms-card-meta">${h.location} &middot; ${formatHikeDate(h.date_completed)}</div>
                ${s.note ? `<p class="ms-card-note">${s.note}</p>` : ''}
                <div class="ms-vitals">${vitals}
                <a class="atlas-door" href="hike.html?id=${h.trail_id}">
                    <svg class="ad-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.2C10.6 6 8.7 5.4 6.2 5.4H3.2v12.2h3c2.5 0 4.4.6 5.8 1.8 1.4-1.2 3.3-1.8 5.8-1.8h3V5.4h-3c-2.5 0-4.4.6-5.8 1.8Z"/><path d="M12 7.2v12.2"/></svg>
                    <span>Open the field log</span>
                    <svg class="ad-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6l6 6-6 6"/><path d="M4 4v16"/></svg>
                </a>
                </div>
            </div>
        </div>`;
    }

    /* ---- Reading the ledger -------------------------------------------------
       Two gestures, deliberately kept apart, because the whole history of this
       section is what happens when one gesture tries to do both jobs.

         POINTING asks the land a question. It changes no layout whatsoever, so
         a cursor can sweep the whole ledger and nothing under it moves.

         CLICKING opens the drawer. One at a time, closed to start, and clicking
         the open one shuts it again.

       Nothing here reads the scroll position at all. */
    let entries = [], cards = [], drawer = null, openIx = -1, lastLit = -1;

    /* How many columns the ledger is currently in. Read from the resolved grid
       rather than from a breakpoint kept in two places — CSS owns where the
       second column appears, and this just asks what it decided. */
    function columnCount() {
        const t = getComputedStyle(mount).gridTemplateColumns;
        return t && t !== 'none' ? t.split(' ').filter(Boolean).length : 1;
    }

    /* Beneath the whole grid row, never beneath the single entry: with two
       columns the drawer belongs under the PAIR, so the other half of the row
       is not pushed away from its neighbour. */
    function placeDrawer(ix) {
        const cols = columnCount();
        const lastInRow = Math.min(entries.length - 1, Math.floor(ix / cols) * cols + cols - 1);
        const after = entries[lastInRow + 1];
        if (after) mount.insertBefore(drawer, after);
        else mount.appendChild(drawer);
    }

    /* Light the left leaf on this entry's hike. Free of layout, so it is safe to
       fire on every row the cursor crosses; keymap.js buffers the cut and holds
       the last subject once the cursor leaves. */
    function lightLand(el) {
        if (!window.AtlasKeyMap) return;
        lastLit = Number(el.dataset.i);
        AtlasKeyMap.light([el.dataset.id], el.querySelector('.ms-k').textContent);
        AtlasKeyMap.showBenchmarks(true, el.dataset.i);
    }

    /* THE ROW YOU CLICKED MUST NOT MOVE.

       The drawer sits between grid rows, so opening one for an entry below the
       currently open drawer removes a block of height H from ABOVE it — and the
       row jumps out from under the cursor that just clicked it. Rather than
       reason about which side of the change each row falls on (which got harder
       the moment the drawer started moving between columns as well as rows),
       the row's own position is measured before and after every DOM change and
       the page is scrolled by exactly the difference. That is correct for any
       layout, including ones this file has not been written for yet.

       It only works because the outgoing drawer closes INSTANTLY rather than
       animating: its height goes in one step, so the "after" measurement is the
       final layout rather than a frame of a transition. */
    function toggle(ix) {
        /* Stop any smooth scroll still in flight from a previous open. The
           whole correction below rests on `before` and `after` being read at
           the same scroll position, and a reveal animating underneath makes
           them measurements of two different pages — clicking a second row
           while the first was still settling threw the ledger a full drawer's
           height. Scrolling to where we already are cancels it. */
        scrollTo({ top: scrollY, left: scrollX, behavior: 'instant' });

        const row = entries[ix].querySelector('.ms-row');
        const before = row.getBoundingClientRect().top;

        if (openIx >= 0 && entries[openIx]) {
            entries[openIx].classList.remove('is-active');
            entries[openIx].querySelector('.ms-row').setAttribute('aria-expanded', 'false');
            drawer.classList.add('no-anim');
            drawer.classList.remove('is-open');
            void drawer.offsetHeight;               // settle at the closed height
            drawer.classList.remove('no-anim');
        }

        // clicking the open entry closes it and leaves the ledger flat
        if (ix === openIx) { openIx = -1; drawer.remove(); return; }

        openIx = ix;
        drawer.querySelector('.ms-drawer-in').innerHTML = cards[ix];
        placeDrawer(ix);
        entries[ix].classList.add('is-active');
        entries[ix].querySelector('.ms-row').setAttribute('aria-expanded', 'true');
        // the drawer must be SEEN closed at its new home before it is told to
        // open, or the browser has no start state to animate the height from
        void drawer.offsetHeight;
        drawer.classList.add('is-open');

        const shift = row.getBoundingClientRect().top - before;
        if (Math.abs(shift) > 0.5) scrollBy(0, shift);
        lightLand(entries[ix]);
        revealDrawer(ix);
    }

    /* A drawer that opens below the fold has opened where nobody can see it.
       The card's full height is readable straight away — the drawer's grid track
       is still animating, but the content inside it already has its own height —
       so the shortfall can be measured before the motion finishes and corrected
       in the same breath. Only ever scrolls DOWN, and only when it must. */
    function revealDrawer(ix) {
        const inner = drawer.querySelector('.ms-drawer-in');
        const foot = entries[ix].getBoundingClientRect().bottom + inner.scrollHeight;
        const over = foot - (innerHeight - 24);
        if (over > 12) scrollBy({ top: over, behavior: 'smooth' });
    }

    function wire() {
        entries.forEach((el, i) => {
            const row = el.querySelector('.ms-row');
            row.addEventListener('click', () => toggle(i));
            /* mouseenter, not mouseover: one event per row entered, rather than
               one per child element the cursor happens to pass over inside it */
            row.addEventListener('mouseenter', () => lightLand(el));
            row.addEventListener('focus', () => lightLand(el));
        });

        // crossing the two-column breakpoint moves which row the open drawer
        // belongs under, so it is re-seated rather than left stranded mid-grid
        let t;
        addEventListener('resize', () => {
            clearTimeout(t);
            t = setTimeout(() => { if (openIx >= 0) placeDrawer(openIx); }, 160);
        });
    }

    /* ---- The benchmarks, planted where they were actually earned ------------
       This is the whole reason the invented quadrangle could go: the disks now
       stand at each milestone hike's real latitude and longitude on the index
       diagram. They show only while this plate is the one being read — a country
       permanently studded with brass would say nothing about anything. */
    function plantOnTheLand(stations) {
        if (!window.AtlasKeyMap) return;
        AtlasKeyMap.ready.then(() => {
            AtlasKeyMap.benchmarks(stations.map((s, i) => ({
                id: String(i), n: i + 1, trail_id: s.hike.trail_id
            })));
            const plate = mount.closest('.plate');
            if (!plate) return;
            /* All this decides is whether the brass is on the index diagram —
               a country permanently studded with benchmarks says nothing about
               anything, and sixteen numbered disks on a 126 px silhouette is a
               smudge, not an index. So exactly one shows: the milestone the
               reader last asked about, and only while this plate is on screen.

               It deliberately does NOT close the drawer or send the plate home.
               Scrolling away is not a decision, and a drawer that shuts itself
               off-screen is a layout change nobody asked for, lying in wait for
               the reader on the way back up. */
            new IntersectionObserver(rows => rows.forEach(e => {
                AtlasKeyMap.showBenchmarks(e.isIntersecting && lastLit >= 0, String(lastLit));
            }), { rootMargin: '0px' }).observe(plate);
        });
    }

    function ordinal(n) {
        const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }

    // Reveal the plate when it scrolls into view (threads.css keeps the class)
    const section = document.querySelector('.threads-section');
    if (section) {
        const io = new IntersectionObserver(entries => {
            entries.forEach(e => { if (e.isIntersecting) { section.classList.add('in'); io.unobserve(e.target); } });
        }, { threshold: 0.12 });
        io.observe(section);
    }
})();
