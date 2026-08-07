/**
 * THE MUSTER ROLL — Trail Crew, the people of the Atlas.
 *
 * Everything derives from hikes.json at load; there is no companion data
 * anywhere else. The page is a bound register, and the register's own
 * conventions do the explaining:
 *
 *   ORDER OF ARRIVAL. Lines are entered in the order each companion first
 *   signed, not by rank. A ranked list flattens the story — Shawna K. has
 *   twelve outings and eleven of them are 2022-23, Colm D. has eleven in
 *   2026 alone — and the Atlas's circles arriving and handing off to one
 *   another is the thing this page exists to show. (The Outings order is
 *   still one click away, for when the question really is "who most?")
 *
 *   BRACE AND DITTO. A ledger never writes a repeated value down five
 *   consecutive lines; it braces them and dittos it. Five people signed in
 *   on one outing at Astral Drive in March 2022, so the notation states,
 *   with no commentary, that the Atlas gained a whole circle in an
 *   afternoon. Marcos L. signed the same DAY on a different trail and is
 *   deliberately not braced with them.
 *
 *   THE COUNTER-LANE. The last line of the book is the outings walked
 *   alone, drawn hollow. A register of company should say what it cost.
 *
 * Viewpoints are counted here on purpose: crew tallies say "outings", and
 * excluding them would demote real companions below the core-crew line.
 */
document.addEventListener('DOMContentLoaded', async () => {

    let allHikes, portraits;
    try {
        allHikes = await fetchHikes();
        portraits = await fetchCrewPortraits();
    } catch (err) {
        console.error('Could not load hike data:', err);
        document.getElementById('crew-roll').innerHTML =
            `<div class="bk-lost">
                <div class="tl-kick">The Trailprint Atlas</div>
                <h2 class="tl-title">The register could not be opened</h2>
                <p class="tl-msg">The Atlas's own records did not load. A reload usually settles it.</p>
             </div>`;
        return;
    }

    const t = (h) => Date.parse(h.date_completed);
    const fmtLong = (d) => formatHikeDate(d);
    const fmtTiny = (d) => formatHikeDate(d, { month: 'short', day: 'numeric', year: '2-digit' });
    const ink = (h) => ATLAS_CONFIG.COLOR_MAP[hikeYear(h)] || ATLAS_CONFIG.DEFAULT_COLOR;
    const initialsOf = (n) => n.split(/\s+/).map(w => w[0]).join('');
    const listNames = (arr) => arr.length === 1 ? arr[0]
        : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
    // companion names already end in a period ("Mila R."), so a sentence
    // closing on one must not pick up a second
    const stop = (s) => s.endsWith('.') ? s : s + '.';

    /* ---- Atlas time, squared off to whole years so the columns ARE years ---- */
    const chronological = [...allHikes].sort(compareHikesChrono);
    const firstYear = hikeYear(chronological[0]);
    const thisYear = new Date().getUTCFullYear();
    const T0 = Date.UTC(firstYear, 0, 1), T1 = Date.UTC(thisYear + 1, 0, 1);
    const pct = (dateStr) => ((Date.parse(dateStr) - T0) / (T1 - T0)) * 100;
    const years = [];
    for (let y = firstYear; y <= thisYear; y++) years.push(y);
    const midOf = (y) => (pct(`${y}-01-01`) + pct(`${y + 1}-01-01`)) / 2;
    const yearTotal = {};
    allHikes.forEach(h => { const y = hikeYear(h); yearTotal[y] = (yearTotal[y] || 0) + 1; });

    /* ---- the roster ---- */
    const roster = [...groupByCompanion(allHikes).entries()].map(([name, hikes]) => {
        const sorted = [...hikes].sort(compareHikesChrono);
        return {
            name, hikes: sorted, count: hikes.length,
            miles: hikes.reduce((s, h) => s + h.miles, 0),
            feet: hikes.reduce((s, h) => s + h.elevation_gain, 0),
            trips: [...new Set(hikes.filter(h => h.trip_tag).map(h => h.trip_tag))],
            ids: new Set(hikes.map(h => h.trail_id)),
            first: sorted[0], last: sorted[sorted.length - 1]
        };
    });
    const byName = new Map(roster.map(p => [p.name, p]));
    const signedOrder = [...roster].sort((a, b) =>
        compareHikesChrono(a.first, b.first) || b.count - a.count);
    const rankOrder = [...roster].sort((a, b) => b.count - a.count || b.miles - a.miles);
    const coreCrew = [...roster].filter(p => p.count >= ATLAS_CONFIG.CREW_CORE_MIN_HIKES)
        .sort((a, b) => b.count - a.count);

    /* ---- who signed in alongside whom: a debut outing can carry a party ---- */
    const debut = new Map();
    signedOrder.forEach(p => {
        if (!debut.has(p.first.trail_id)) debut.set(p.first.trail_id, []);
        debut.get(p.first.trail_id).push(p.name);
    });

    const soloHikes = allHikes.filter(h => !h.hiked_with || h.hiked_with.length === 0)
        .sort(compareHikesChrono);

    /* =====================================================================
       THE COVER
       ===================================================================== */
    document.getElementById('crew-tally').innerHTML = `
        <div><b>${roster.length}</b><span>Signatures in the book</span></div>
        <div><b>${allHikes.length - soloHikes.length}</b><span>Outings in company</span></div>
        <div><b>${coreCrew.length}</b><span>Have walked ${ATLAS_CONFIG.CREW_CORE_MIN_HIKES} or more</span></div>`;

    // a fixed, seeded tilt: photographs laid in a book are never square, but
    // they must not move between one visit and the next either
    const TILTS = [-2.4, 1.8, -1.2, 2.6, -1.9, 1.1, -2.8, 2.1, -1.5, 1.6, -2.2];
    document.getElementById('crew-strip').innerHTML = coreCrew.map((p, i) => {
        const pid = portraits[p.name];
        const face = pid
            ? `<img src="${cloudinaryUrl(pid, 'w_180,h_180,c_fill,g_auto,q_auto,f_auto')}" alt="${p.name}">`
            : `<div class="blank">${initialsOf(p.name)}</div>`;
        const href = `crew-member.html?name=${encodeURIComponent(p.name)}`;
        return `<a class="snap" style="--rot:${TILTS[i % TILTS.length]}deg" href="${href}"
                   data-turn-to="${href}" data-name="${p.name}"
                   title="${p.name} — ${p.count} outings together">
                    ${face}<div class="who">${p.name}</div>
                </a>`;
    }).join('');

    /* The year key has moved onto the axis it decodes: the years are already
       printed across the register as column headings, so each one is now inked
       in its own colour and the separate key stops being a second object. It
       used to sit on the OTHER leaf, below eleven photographs — measured on a
       1600x722 laptop it was 83px past the bottom of the cover, so every
       coloured mark on the page was undocumented.

       The hollow "alone" swatch stays here, because it belongs beside the
       closing line it explains rather than on the register's axis: the
       counter-lane is the book's last line, not one of its years. */
    document.getElementById('crew-key').innerHTML =
        `<span><i style="background:none;border:1.4px solid #a89769"></i>hollow marks are outings walked alone</span>`;
    document.getElementById('crew-closing').innerText =
        `…and ${soloHikes.length} outings walked alone.`;

    /* =====================================================================
       THE ROLL
       ===================================================================== */
    const rollEl = document.getElementById('crew-roll');
    const gridlines = years.map(y => `<span class="gl" style="left:${pct(`${y}-01-01`)}%"></span>`).join('');
    const ticks = (hikes, solo = false) => hikes.map(h =>
        `<span class="tick${solo ? ' solo' : ''}" data-h="${h.trail_id}"
               style="left:${pct(h.date_completed)}%;${solo ? '' : `background:${ink(h)}`}"></span>`).join('');

    /** The door into a person's own leaf of the book. */
    const recordDoor = (name) => {
        const href = `crew-member.html?name=${encodeURIComponent(name)}`;
        return `
        <div class="dwr-door">
            <a class="atlas-door is-wide" href="${href}" data-turn-to="${href}">
                <svg class="ad-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/>
                    <circle cx="9.5" cy="10" r="2.4"/>
                    <path d="M5.8 17c0.6-2.1 2-3.1 3.7-3.1S12.6 14.9 13.2 17"/>
                    <path d="M15.5 8.5h3.2M15.5 12h3.2M15.5 15.5h3.2"/>
                </svg>
                <span class="ad-copy">
                    <span class="ad-main">SERVICE RECORD</span>
                    <span class="ad-sub">${name}&rsquo;s own leaf of the book</span>
                </span>
                <svg class="ad-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5 L16 12 L9 19"/></svg>
            </a>
        </div>`;
    };

    /* The entry number is assigned in SIGNATURE order and travels with the
       person under any sort. Renumbering 1..20 by rank is what turned a re-sort
       into the leaderboard DESIGN.md forbids: Will R. was entry 11 in one view
       and entry 1 in the other, under a header still reading "No.". In a bound
       register an entry number is written once, in ink. */
    const entryNo = new Map(signedOrder.map((p, i) => [p.name, i + 1]));

    function render(order) {
        const list = order === 'signed' ? signedOrder : rankOrder;

        const head = `
            <div class="lane head">
                <div class="hd r">No.</div>
                <div class="hd">Signed</div>
                <div class="hd">First signature</div>
                <div class="track">
                    ${gridlines}
                    ${years.map(y => `
                        <span class="yr" style="left:${midOf(y)}%;color:${ATLAS_CONFIG.COLOR_MAP[y] || ATLAS_CONFIG.DEFAULT_COLOR}">${y}</span>
                        <span class="yrn" style="left:${midOf(y)}%">${yearTotal[y] || 0} outings</span>`).join('')}
                </div>
                <div class="hd r">Outings &middot; ground</div>
            </div>`;

        /* When the roll is read against its binding, the book says so in its own
           marginalia — the brace and ditto are silently unavailable in this
           order, and five rows then print the same date five times over. */
        const outOfOrder = order !== 'signed'
            ? `<div class="ooo">Shown by outings walked, out of signature order. Entry numbers keep their place in the book; the ledger&rsquo;s brace is set aside.</div>`
            : '';

        // the horizon lane: every outing the Atlas has, so a companion's own
        // marks can be read against the whole life rather than in isolation
        const atlasLane = `
            <div class="lane atlas">
                <div class="no"></div>
                <div class="who"><span class="face blank">D</span><span class="sig">The Atlas itself</span></div>
                <div class="when">${fmtLong(chronological[0].date_completed)}</div>
                <div class="track">${gridlines}${ticks(chronological)}</div>
                <div class="lane-stats"><span class="n">${allHikes.length}</span><span class="m">${allHikes.reduce((s, h) => s + h.miles, 0).toFixed(0)} mi</span></div>
            </div>`;

        const body = list.map((p, i) => {
            const pid = portraits[p.name];
            const face = pid
                ? `<img class="face" src="${cloudinaryUrl(pid, 'w_96,h_96,c_fill,g_auto,q_auto,f_auto')}" alt="">`
                : `<span class="face blank">${initialsOf(p.name)}</span>`;

            // the ledger's brace and ditto. Only meaningful in signature
            // order — ranked, the same-day parties are no longer adjacent.
            const party = debut.get(p.first.trail_id);
            const inParty = order === 'signed' && party.length > 1;
            const pos = inParty ? party.indexOf(p.name) : -1;
            const whenCls = inParty
                ? `grp${pos === 0 ? ' first' : ''}${pos === party.length - 1 ? ' last' : ''}` : '';
            const whenTxt = (inParty && pos > 0)
                ? '<span class="ditto">&#12291;</span>'
                : fmtLong(p.first.date_completed);

            /* A viewpoint has no distance by definition, so a companion whose
               only outings were viewpoints printed "0 mi · 0.0k ft" — two
               zeroes beside a real person's name, in a book made for her to
               read. Name it instead of measuring it at nothing. */
            const measured = p.miles >= 0.05 || p.feet >= 50;
            const ground = measured
                ? `${p.miles.toFixed(0)} mi &middot; ${(p.feet / 1000).toFixed(1)}k ft`
                : `<span class="vp">Viewpoint</span>`;

            const left = pct(p.first.date_completed);
            const width = Math.max(0.2, pct(p.last.date_completed) - left);
            const alongside = party.filter(n => n !== p.name);
            const note = `Signed in at <b>${p.first.trail_name}</b>, ${fmtLong(p.first.date_completed)}` +
                (alongside.length ? stop(`, alongside ${listNames(alongside)}`) : '.');
            // data-h is what lets a cross-read NAME the shared outings rather
            // than only counting them — see crossRead() below
            const drawer = p.hikes.slice().reverse().map(h => `
                <a href="hike.html?id=${h.trail_id}" data-h="${h.trail_id}">
                    <span class="dt" style="background:${ink(h)}"></span>
                    <span class="d">${fmtTiny(h.date_completed)}</span>
                    <span class="t">${h.trail_name}</span>
                </a>`).join('');
            const trips = p.trips.length
                ? `<div class="dwr-trips"><b>Trips</b>${p.trips.map(tag =>
                    `<a href="trip.html?tag=${encodeURIComponent(tag)}">${tripName(tag)}</a>`).join(' &middot; ')}</div>`
                : '';

            return `
            <div class="lane body ${p.count >= ATLAS_CONFIG.CREW_CORE_MIN_HIKES ? 'core' : ''}"
                 data-name="${p.name}" role="button" tabindex="0" aria-expanded="false">
                <div class="no">${entryNo.get(p.name)}<span class="turn" aria-hidden="true"></span></div>
                <div class="who">${face}<span class="sig">${p.name}</span></div>
                <div class="when ${whenCls}">${whenTxt}</div>
                <div class="track">
                    ${gridlines}
                    <span class="span" style="left:${left}%;width:${width}%"></span>
                    ${ticks(p.hikes)}
                </div>
                <div class="lane-stats">
                    <span class="n">${p.count}</span>
                    <span class="m">${ground}</span>
                    <span class="kn"></span>
                </div>
                <div class="drawer"><div class="dwr-in">
                    <div class="dwr-note">${note}</div>
                    <div class="dwr">${drawer}</div>
                    ${trips}
                    ${recordDoor(p.name)}
                </div></div>
            </div>`;
        }).join('');

        const aloneLane = `
            <div class="lane alone">
                <div class="no"></div>
                <div class="who"><span class="face blank" style="background:none;border-style:dashed">&mdash;</span><span class="sig">Walked alone</span></div>
                <div class="when">&mdash;</div>
                <div class="track">${gridlines}${ticks(soloHikes, true)}</div>
                <div class="lane-stats"><span class="n" style="color:var(--muted)">${soloHikes.length}</span><span class="m">${soloHikes.reduce((s, h) => s + h.miles, 0).toFixed(0)} mi</span></div>
            </div>`;

        rollEl.innerHTML = head + outOfOrder + atlasLane + body + aloneLane;
        stackTicks();
        wireLanes();
    }

    /* ---------------------------------------------------------------------
       The printed count and the countable marks have to agree. Measured over
       183 adjacent pairs on a 705px track: 83 of them (45%) sat closer than one
       dot diameter, and 43 were exactly on top of each other. Will R.'s line
       printed 32 and showed about 12.

       Colliding marks step up a tier, which is the device the Service Record
       already uses on its enlarged lane ("a mark buried under its neighbour
       cannot be pointed at"). Unbounded stacking was tried first and measured
       at 11 tiers deep, 83 marks escaping their own lane, the worst by 63px in
       a 36px row — it broke the ruled lines the register is made of. So tiers
       are capped and a cluster too dense to separate wears a ring instead,
       the way a ledger tallies a repeated entry.

       Collision is a SCREEN question, not a data one, so it is measured in
       pixels and recomputed on resize — the same reasoning as map.js's stamp
       fanning, where two trailheads 1km apart smudge at z11 and separate at z15.
       --------------------------------------------------------------------- */
    function stackTicks() {
        rollEl.querySelectorAll('.lane .track').forEach(track => {
            const w = track.getBoundingClientRect().width;
            if (!w) return;
            const marks = [...track.querySelectorAll('.tick')]
                .map(el => ({ el, x: (parseFloat(el.style.left) || 0) / 100 * w }))
                .sort((a, b) => a.x - b.x);

            const DIA = 9;              // an 8px dot plus a pixel of air
            const MAX_TIER = 2;         // three rows fit a 36px lane; eleven did not
            const clusters = [];
            marks.forEach(m => {
                const last = clusters[clusters.length - 1];
                if (last && m.x - last[last.length - 1].x < DIA) last.push(m);
                else clusters.push([m]);
            });
            clusters.forEach(cl => {
                const fused = cl.length > MAX_TIER + 1;
                cl.forEach((m, i) => {
                    m.el.style.setProperty('--r', fused ? 0 : i);
                    m.el.classList.toggle('fused', fused);
                });
            });
        });
    }
    let stackTimer;
    window.addEventListener('resize', () => {
        clearTimeout(stackTimer);
        stackTimer = setTimeout(stackTicks, 120);
    });

    /* ---------------------------------------------------------------------
       The cross-read: hovering a lane asks "and who else was there?", and
       the book answers on every other line at once.
       --------------------------------------------------------------------- */
    function crossRead(name) {
        const person = byName.get(name);
        if (!person) return;
        rollEl.classList.add('reading');
        rollEl.querySelectorAll('.lane').forEach(lane => {
            const isSelf = lane.dataset.name === name;
            lane.classList.toggle('self', isSelf);
            let shared = 0;
            lane.querySelectorAll('.tick').forEach(tick => {
                const hit = !isSelf && person.ids.has(tick.dataset.h);
                tick.classList.toggle('shared', hit);
                if (hit) shared++;
            });
            // the Atlas's own lane carries every outing, so it would always
            // claim to be everyone's closest companion — it is excluded
            const kin = !isSelf && shared > 0 &&
                !lane.classList.contains('atlas') && !lane.classList.contains('alone');
            lane.classList.toggle('kin', kin);
            const kn = lane.querySelector('.kn');
            if (kn) kn.textContent = kin ? `${shared} together` : '';

            // "12 together" answers HOW MANY. A register answers WHICH — and
            // that is the job this page is for. Without it a reader had to open
            // both lines and compare 21 entries against 32 by hand. The drawer
            // is already where a line names its outings, so the shared ones are
            // marked there.
            lane.querySelectorAll('.dwr a').forEach(a =>
                a.classList.toggle('shared-row', !isSelf && person.ids.has(a.dataset.h)));
        });

        // the cross-read was silent to assistive tech: no aria-live anywhere
        if (liveEl) {
            const kin = [...rollEl.querySelectorAll('.lane.kin')]
                .map(l => `${l.dataset.name}, ${l.querySelector('.kn').textContent}`);
            liveEl.textContent = kin.length
                ? `${name} walked with ${kin.join('; ')}.`
                : `${name}: no outings shared with anyone else in the book.`;
        }
    }
    function clearRead() {
        rollEl.classList.remove('reading');
        rollEl.querySelectorAll('.self, .kin, .shared, .shared-row').forEach(n =>
            n.classList.remove('self', 'kin', 'shared', 'shared-row'));
        if (liveEl) liveEl.textContent = '';
    }

    /* ---- one line open at a time keeps the roll calm ---- */
    let openLane = null;
    function wireLanes() {
        openLane = null;
        rollEl.querySelectorAll('.lane.body').forEach(lane => {
            lane.addEventListener('mouseenter', () => crossRead(lane.dataset.name));
            lane.addEventListener('mouseleave', clearRead);
            lane.addEventListener('click', (e) => {
                // links inside the drawer are their own destinations
                if (e.target.closest('a')) return;
                toggleLane(lane);
            });
            // A lane was a plain div with a click listener: no tabindex, no role,
            // no key handler. There was no keyboard route to a drawer, a
            // cross-read, or the Service Record door — which for the nine
            // companions with no photograph on the cover is the ONLY route.
            lane.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                if (e.target.closest('a')) return;
                e.preventDefault();
                toggleLane(lane);
            });
            lane.addEventListener('focus', () => crossRead(lane.dataset.name));
            lane.addEventListener('blur', clearRead);
        });
        bookWireTurns(rollEl);
    }

    /* ---------------------------------------------------------------------
       Opening a line has to REPORT BACK. Measured before this: clicking Kate
       C. (row 18) opened her drawer 446px below the fold, so the only visible
       result was a faint tint; Will R.'s door was sliced 20px below it; and
       opening a line above another dragged the clicked row 337px out from
       under the pointer.

       The Atlas had already solved this twice and neither fix reached here —
       the ?open= path calls scrollIntoView, and the home page's Threads ledger
       holds the clicked row to the pixel by measuring it before and after every
       DOM change. Both ideas are used below: hold the row, THEN bring the
       drawer's foot into view, and never at the cost of pushing the row off.
       --------------------------------------------------------------------- */
    function toggleLane(lane, force) {
        const willOpen = force !== undefined ? force : !lane.classList.contains('open');
        const before = lane.getBoundingClientRect().top;

        if (openLane && openLane !== lane) {
            openLane.classList.remove('open');
            openLane.setAttribute('aria-expanded', 'false');
        }
        lane.classList.toggle('open', willOpen);
        lane.setAttribute('aria-expanded', String(willOpen));
        openLane = willOpen ? lane : null;

        // 1. hold the clicked row exactly where the reader left it
        rollEl.scrollTop += lane.getBoundingClientRect().top - before;
        if (!willOpen) return;

        // 2. then the door — but only once the drawer has actually grown. Doing
        //    this synchronously does nothing at all: until the row expands the
        //    roll's scrollHeight still equals its clientHeight, so there is
        //    nowhere to scroll to and the assignment silently clamps to 0.
        const drawer = lane.querySelector('.drawer');
        if (!drawer) return;
        let done = false;
        const settle = () => {
            if (done) return;
            done = true;
            const rollBox = rollEl.getBoundingClientRect();
            const door = lane.querySelector('.dwr-door') || drawer;
            const overshoot = door.getBoundingClientRect().bottom - (rollBox.bottom - 12);
            if (overshoot <= 0) return;
            const headroom = lane.getBoundingClientRect().top - (rollBox.top + 46);
            rollEl.scrollTop += Math.min(overshoot, Math.max(0, headroom));
        };
        drawer.addEventListener('transitionend', settle, { once: true });
        setTimeout(settle, 340);            // fallback if the transition is suppressed
    }

    /* the roll's spoken channel: the cross-read is a hover effect, so without
       this it says nothing at all to a screen reader */
    const liveEl = Object.assign(document.createElement('div'), { className: 'sr-only' });
    liveEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(liveEl);

    /* ---- the order toggle ---- */
    document.querySelectorAll('.order button').forEach(btn => {
        btn.setAttribute('aria-pressed', String(btn.classList.contains('on')));
        btn.addEventListener('click', () => {
            document.querySelectorAll('.order button').forEach(b => {
                b.classList.toggle('on', b === btn);
                b.setAttribute('aria-pressed', String(b === btn));   // was carried by class alone
            });
            render(btn.dataset.sort);
        });
    });

    /* ---- the cover photographs are shortcuts into the book ---- */
    document.querySelectorAll('.snap').forEach(snap => {
        snap.addEventListener('mouseenter', () => crossRead(snap.dataset.name));
        snap.addEventListener('mouseleave', clearRead);
    });
    bookWireTurns(document);

    render('signed');

    /* ---- ?open=<name>: the way back from a Service Record lands on that
            person's own line, opened, rather than at the top of the book ---- */
    const wanted = new URLSearchParams(window.location.search).get('open');
    if (wanted) {
        const lane = rollEl.querySelector(`.lane.body[data-name="${CSS.escape(wanted)}"]`);
        if (lane) {
            toggleLane(lane, true);
            lane.scrollIntoView({ block: 'center' });
        }
    }

    bookOpen();
});
