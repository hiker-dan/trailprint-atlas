/**
 * THE SERVICE RECORD — one companion's own leaf of the Muster Roll.
 *
 * URL: crew-member.html?name=Will%20R.
 *
 * The crew index is a book, so a person is not a separate page: they are a
 * page IN it, reached by turning (see crew-book.js). Same volume, same
 * paper, same gutter.
 *
 *   LEFT LEAF, the record: the portrait in the cover's own mount, the
 *   service block as a ledger rather than a stat row, and this person's
 *   single lane from the roll, ENLARGED.
 *
 *   RIGHT LEAF, the plates: the country walked together, one numbered plate
 *   per region, on the Atlas's own basemap in year ink. Outings too far
 *   from the rest to share a plate print as line art on a loose sheet —
 *   a plate for one trail 2,000 miles from the next is a map of nothing.
 *
 *   THE TIE: the enlarged lane is the INDEX to the plates. Hover a mark and
 *   its trail lights on whichever plate holds it; hover a trail and its mark
 *   lights back. The left leaf asks when, the right leaf answers where.
 *
 * The plates never pan or zoom. Roaming the land belongs to map.html.
 *
 * ---------------------------------------------------------------------------
 * AUGUST 2026 — three things changed, and each has its long version below.
 *
 *   A TRIP IS ONE MARK. Marks used to fuse by pixel collision, which could
 *   split one chapter across a fused mark and loose ones: the Alaska week
 *   read as a ringed 3, another ringed 3, and two strays. Outings are now
 *   grouped by trip_tag BEFORE anything is placed, so a chapter is one mark
 *   carrying its count and standing at the middle of its span. Will R.'s 32
 *   outings are 14 marks. See THE EVENTS.
 *
 *   THE LANE WRAPS. Five years to a course, so a year is the same width on
 *   every line forever and the Atlas's sixth year starts a second line
 *   instead of squeezing the first. Nothing is re-tuned as years arrive.
 *
 *   THE CHAPTERS PANEL. The space under the lane holds the chapters walked
 *   together and, when a chapter's mark is pointed at, every outing on it.
 *   This replaced the ledger's Trips row, which was six same-coloured links
 *   separated by <br> in a ledger of one-fact measurements.
 * ---------------------------------------------------------------------------
 */
document.addEventListener('DOMContentLoaded', async () => {

    const name = new URLSearchParams(window.location.search).get('name');

    let allHikes, portraits, geometries;
    try {
        allHikes = await fetchHikes();
        portraits = await fetchCrewPortraits();
        geometries = await fetchTrailGeometries();
    } catch (err) {
        console.error('Could not load the Atlas records:', err);
        geometries = geometries || {};
    }

    const shared = (allHikes && name)
        ? [...(groupByCompanion(allHikes).get(name) || [])].sort(compareHikesChrono)
        : [];

    /* ---- the friendly dead end: a name that isn't in the book ---- */
    if (shared.length === 0) {
        document.getElementById('member-name').textContent = 'Not in the book';
        document.getElementById('sig-no').textContent = 'No signature';
        document.getElementById('member-portrait').remove();
        document.getElementById('member-service').innerHTML =
            `<div><span class="k">Note</span><span class="v">No shared outings are recorded under that name.</span></div>`;
        document.getElementById('member-lane-block').remove();
        document.getElementById('member-sheets').innerHTML = `
            <div class="bk-lost">
                <div class="tl-kick">The Trailprint Atlas</div>
                <h2 class="tl-title">An unsigned page</h2>
                <p class="tl-msg">Every companion in the Atlas has a leaf in the Muster Roll. This one has no entry, so there is no country to draw.</p>
            </div>`;
        bookWireTurns(document);
        bookOpen();
        return;
    }

    const first = shared[0], last = shared[shared.length - 1];
    const totalMiles = shared.reduce((s, h) => s + h.miles, 0);
    const totalFeet = shared.reduce((s, h) => s + h.elevation_gain, 0);
    const trips = [...new Set(shared.filter(h => h.trip_tag).map(h => h.trip_tag))];
    const ink = (h) => ATLAS_CONFIG.COLOR_MAP[hikeYear(h)] || ATLAS_CONFIG.DEFAULT_COLOR;
    // every chapter's own outings, in the order they were walked. `shared` is
    // already chronological, so `trips` is in first-outing order and so is this.
    const tripHikes = new Map(trips.map(tag => [tag, shared.filter(h => h.trip_tag === tag)]));
    /* How big the chapter REALLY is, which is not the same question. A record
       only ever holds the outings walked together, so a panel headed "every
       outing on this chapter" over that subset is simply false: Lisa R. shares
       2 of the Summer 2024 East Coast Trip's 3, and the chapter door beside the
       list opens a page showing all 3. The panel says which it is counting. */
    const tripTotal = new Map(trips.map(tag => [tag, allHikes.filter(h => h.trip_tag === tag).length]));
    const initials = name.split(/\s+/).map(w => w[0]).join('');

    /* ---- their number in the register is signature order, the same order
            the roll itself is entered in ---- */
    /* THE TIE-BREAK IS NOT OPTIONAL, and getting it wrong printed two different
       numbers for the same fact one page turn apart. A debut outing can carry a
       whole party — five people signed in together at Astral Drive in March 2022
       and two more at Escondido Falls in January 2023 — so compareHikesChrono
       alone returns 0 for them and the sort falls back to insertion order, which
       here is `hiked_with`, which the Atlas stores ALPHABETICALLY. The roll
       breaks the same tie by outings, most first (crew.js:81). Measured: six of
       twenty companions disagreed, and Will R. was numbered 11 on the roll and
       12 on his own record. In a bound register an entry number is written once,
       in ink, so this now matches crew.js exactly. */
    const firstOf = new Map(), outingsOf = new Map();
    [...allHikes].sort(compareHikesChrono).forEach(h =>
        (h.hiked_with || []).forEach(n => {
            if (!firstOf.has(n)) firstOf.set(n, h);
            outingsOf.set(n, (outingsOf.get(n) || 0) + 1);
        }));
    const sigNo = [...firstOf.entries()]
        .sort((a, b) => compareHikesChrono(a[1], b[1]) || outingsOf.get(b[0]) - outingsOf.get(a[0]))
        .findIndex(([n]) => n === name) + 1;

    /* =====================================================================
       THE RECORD
       ===================================================================== */
    document.title = `${name} - Trail Crew - The Trailprint Atlas`;
    document.getElementById('sig-no').textContent = `Signature No. ${sigNo}`;
    document.getElementById('member-name').textContent = name;

    // one season together is a year, not a range
    const span = hikeYear(first) === hikeYear(last)
        ? `${hikeYear(first)}` : `${hikeYear(first)}&ndash;${hikeYear(last)}`;

    const pid = portraits[name];
    document.getElementById('member-portrait').innerHTML =
        (pid
            ? `<img src="${cloudinaryUrl(pid, 'w_640,h_426,c_fill,g_face,q_auto,f_auto')}" alt="${name}">`
            : `<div class="blank">${initials}</div>`) +
        `<div class="cap"><span>PLATE &mdash; PORTRAIT</span><span>${span}</span></div>`;

    // a single shared outing IS both the first and the last, and saying so
    // twice makes the record look padded rather than short
    /* =====================================================================
       IMPECCABLE — "the record tells him WHAT HE DID; it never tells him WHAT
       HE IS to this book." Will R. has walked 32 of the Atlas's 123 outings and
       his page never said so.

       The answer is spread across the ledger rather than gathered into a device
       of its own, because every part of it already had a row it belonged in:

         SIGNED IN takes the order of signing. It is chronology, so it belongs
         beside the date it happened, not on a line by itself where it reads as
         a placing. This is a register of friends, not a leaderboard.

         OUTINGS takes the share. The count was already printed there; it simply
         never said 32 of what.

         REMARKS is the service record's own word for the things a ledger column
         cannot hold — core crew, and the summits climbed together.
       ===================================================================== */
    const isCore = shared.length >= ATLAS_CONFIG.CREW_CORE_MIN_HIKES;
    const summitsTogether = shared.filter(h => h.summit_trail);

    /* signing order reads as chronology in words and as a placing in numerals:
       "twelfth name in the book" is a fact about when, "12th" is a rank */
    const ORD_WORDS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh',
        'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth',
        'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth'];
    const ordinalWord = (n) => {
        if (ORD_WORDS[n]) return ORD_WORDS[n];
        const t = n % 100, u = n % 10;
        return n + (t >= 11 && t <= 13 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th');
    };
    const signedOrder = `${ordinalWord(sigNo)} name in the book`;

    const remarkBits = [];
    if (isCore) remarkBits.push(`<b>Core crew</b>`);
    if (summitsTogether.length)
        remarkBits.push(`${summitsTogether.length} summit${summitsTogether.length === 1 ? '' : 's'} climbed together`);
    const remarksRow = remarkBits.length
        ? `<div><span class="k">Remarks</span><span class="v remarks">${remarkBits.join(' &middot; ')}</span></div>`
        : '';

    /* IMPECCABLE — Ginni S.'s one outing was a viewpoint, which has no
       distance, and her ledger printed "0.0 mi · 0 ft climbed" in 17px bold:
       two zeroes where the page should say what she did. crew.css already
       carries the rule ("a viewpoint is named, never measured at zero") and the
       record ignored it. A ledger omits a column it has no entry for; it does
       not rule a zero into it. */
    const measuredGround = totalMiles >= 0.05 || totalFeet >= 50;
    const groundRow = measuredGround
        ? `<div><span class="k">Ground</span><span class="v"><b>${totalMiles.toFixed(1)}</b> mi &nbsp;&middot;&nbsp; <b>${totalFeet.toLocaleString()}</b> ft climbed</span></div>`
        : `<div><span class="k">Ground</span><span class="v"><em>${shared.length === 1 ? 'A viewpoint together' : `${shared.length} viewpoints together`}, with no ground to measure.</em></span></div>`;

    const lastSeenRow = shared.length > 1
        ? `<div><span class="k">Last seen</span><span class="v">${last.trail_name}<br><em>${formatHikeDate(last.date_completed)}</em></span></div>`
        : '';
    document.getElementById('member-service').innerHTML = `
        <div><span class="k">Signed in</span><span class="v">${first.trail_name}<br><em>${formatHikeDate(first.date_completed)} &middot; ${signedOrder}</em></span></div>
        ${lastSeenRow}
        <div><span class="k">Outings</span><span class="v"><b>${shared.length}</b> <span class="of">of the Atlas&rsquo;s ${allHikes.length}</span></span></div>
        ${groundRow}
        ${remarksRow}`;
    /* The Trips row is GONE from the ledger, and this is the one deletion in
       this pass that removes something that worked. It was six links of the
       same green, separated by <br>, so a chapter whose name wrapped looked
       exactly like two chapters and a two-line list looked like a paragraph.
       Worse, it sat in a ledger of MEASUREMENTS — signed in, outings, ground —
       where every other row is one short fact and this one was a list.
       The chapters now stand under the lane, which is where they are already
       being pointed at. See THE CHAPTERS PANEL. */

    // the way back lands on this person's own line in the roll, opened,
    // rather than at the top of the book
    const backDoor = document.getElementById('member-back');
    const backHref = `crew.html?open=${encodeURIComponent(name)}`;
    backDoor.href = backHref;
    backDoor.dataset.turnTo = backHref;

    /* =====================================================================
       THE LANE — the roll's own track, given room to become an index

       IT WRAPS, and it has to. The Atlas is five years old, so the lane fits
       on one line today; it will not at fifteen, and squeezing more years
       into the same 313px shrinks a year until a summer is two pixels wide.

       So the lane is SET LIKE A PARAGRAPH. A course is five years, and a
       year is one fifth of the leaf's width on every course forever. Past
       five years the lane takes a second course beneath the first, and reads
       top to bottom the way lines of text do. A partial final course draws
       only the fraction of the width its years need, exactly as the last
       line of a paragraph is short — which is what keeps a year the same
       width whether it is the only one on its line or one of five.

       Nothing has to be re-tuned as the years arrive. At five years there is
       one course; the day the Atlas enters 2027 there are two. Because the
       stacking is measured per course, wrapping also hands every year back
       the room it had in 2022, so marks that would have fused stay separate.
       ===================================================================== */
    const YEARS_PER_COURSE = 5;
    const chronological = [...allHikes].sort(compareHikesChrono);
    const laneEl = document.getElementById('member-lane');
    const firstYear = hikeYear(chronological[0]);
    const realLastYear = new Date().getUTCFullYear();

    /* ---- ?demo=<years> — THE REHEARSAL --------------------------------
       The wrap cannot be judged on a five-year book: the second course does
       not exist until 2027, and by then it is too late to find out it looks
       wrong. So this replays the whole record forward in strides of its own
       length until the lane spans <years>, and it SHIPS for the same reason
       the film keeps ?q= and the map keeps ?leg=/?cinema= — a thing you
       cannot look at is a thing nobody checks.

       It touches the LANE AND NOTHING ELSE: the ledger, the plates and the
       loose sheet stay on the real record, and the lane header says
       "rehearsal · N years" so no invented outing can be mistaken for one
       that happened. Off unless asked for. Try ?demo=13, ?demo=15, ?demo=30.
       --------------------------------------------------------------------- */
    const realSpan = realLastYear - firstYear + 1;
    const askedYears = Math.max(0, parseInt(new URLSearchParams(location.search).get('demo') || '0', 10));
    // a rehearsal may lengthen the Atlas, never shorten it: asking for fewer
    // years than it has would quietly drop outings that really happened
    const demoYears = askedYears ? Math.max(askedYears, realSpan) : 0;
    const shiftYears = (h, n) => {
        const [y, m, d] = h.date_completed.split('-').map(Number);
        const day = (m === 2 && d === 29) ? 28 : d;   // a leap day + n years may not exist
        return { ...h, trail_id: `${h.trail_id}~${n}`,
            date_completed: `${y + n}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
    };
    const lastYear = Math.max(realLastYear, firstYear + demoYears - 1);
    const strides = [0];
    for (let off = realSpan; off < demoYears; off += realSpan) strides.push(off);
    // a stride can overshoot the rehearsal's last year — the final one is
    // trimmed so the lane spans exactly the years its labels claim, which is
    // also the only way to see a PARTIAL final course (the shape the real
    // page takes the day the Atlas enters its sixth year)
    const within = (h) => hikeYear(h) <= lastYear;
    const laneAll = strides.flatMap(n => n ? chronological.map(h => shiftYears(h, n)) : chronological).filter(within);
    const laneMine = strides.flatMap(n => n ? shared.map(h => shiftYears(h, n)) : shared).filter(within);
    if (demoYears) {
        document.querySelector('.lane-hd .c').textContent =
            `rehearsal · ${lastYear - firstYear + 1} years`;
    }

    /* COLOUR_MAP is generated 2022 → today, so a rehearsal year has no entry.
       atlasYearInk() is the formula behind it and answers for any year. */
    const laneInk = (h) => ATLAS_CONFIG.COLOR_MAP[hikeYear(h)]
        || (typeof atlasYearInk === 'function' ? atlasYearInk(hikeYear(h)) : ATLAS_CONFIG.DEFAULT_COLOR);

    const years = [];
    for (let y = firstYear; y <= lastYear; y++) years.push(y);
    const courses = [];
    for (let i = 0; i < years.length; i += YEARS_PER_COURSE)
        courses.push(years.slice(i, i + YEARS_PER_COURSE));

    // a course's window is ALWAYS five years wide, even when it holds fewer:
    // that is what keeps one year the same width on every line
    const courseStart = (c) => Date.UTC(c[0], 0, 1);
    const courseEnd = (c) => Date.UTC(c[0] + YEARS_PER_COURSE, 0, 1);
    const pctT = (c, t) => ((t - courseStart(c)) / (courseEnd(c) - courseStart(c))) * 100;
    const pctIn = (c, dateStr) => pctT(c, Date.parse(dateStr));
    const holds = (c, h) => { const y = hikeYear(h); return y >= c[0] && y < c[0] + YEARS_PER_COURSE; };
    // a rehearsal clone carries the real hike's id with a stride suffix, so
    // every door it opens still leads to the outing that actually happened
    const realId = (id) => String(id).split('~')[0];

    /* =====================================================================
       THE EVENTS — what actually stands on the lane.

       A TRIP IS ONE MARK, always (Danny, August 2026). Pixel collision used
       to decide what fused, which could split one trip across a fused mark
       and loose ones — the Alaska week read as a ringed 3, then another
       ringed 3, with nothing saying they were the same week. Now the
       grouping is the record's own: every outing sharing a trip_tag becomes
       one ringed mark carrying its count, standing at the middle of the
       trip's span; a standalone outing stands alone. A trip with a single
       shared outing stays a plain mark — one outing is one mark.

       (In a rehearsal, a clone trip is grouped by tag AND stride, so the
       2029 replay of Alaska doesn't merge with the 2026 original.)
       ===================================================================== */
    const strideOf = (id) => String(id).split('~')[1] || '0';
    const events = [];
    {
        const byTrip = new Map();
        laneMine.forEach(h => {
            if (!h.trip_tag) { events.push({ hikes: [h] }); return; }
            const k = `${h.trip_tag}~${strideOf(h.trail_id)}`;
            if (!byTrip.has(k)) { const e = { hikes: [] }; byTrip.set(k, e); events.push(e); }
            byTrip.get(k).hikes.push(h);
        });
        events.forEach(e => {
            e.t = (Date.parse(e.hikes[0].date_completed) +
                   Date.parse(e.hikes[e.hikes.length - 1].date_completed)) / 2;
        });
        events.sort((a, b) => a.t - b.t);
    }

    /**
     * Lays a course's marks out, stacking any that collide.
     *
     * At this width two outings a day apart draw on top of each other, and a
     * mark buried under its neighbour cannot be pointed at — which would make
     * some trails unreachable on the very leaf where the lane's job is to be
     * the index to the plates. So a mark takes the lowest row that is clear,
     * exactly as a survey sheet stacks coincident points. Measured in pixels,
     * because "too close" is a screen question, not a calendar one — the same
     * reasoning as the map page's stamp fanning.
     */
    /* Diameters match the CSS: a lone outing is 11px, a chapter 16px. Kept here
       because collision is arithmetic, and TICK_GAP is the clear paper demanded
       between two marks' edges. */
    const STACK = 12, MAX_ROWS = 4, TICK_GAP = 3;
    const dia = (n) => (n > 1 ? 16 : 11);

    /* Four rows is the stacking ceiling — a lane that grew a row per
       coincident outing would be taller than the leaf on any dense season.
       With trips pre-grouped above, an event that still finds no clear row
       is rare and always standalone; it joins its neighbour as a pixel
       fuse, and because such a mark can only honestly open ONE of its
       doors, its label says which. */
    function markHTML(c, { hikes, t, row }) {
        const one = hikes.length === 1 ? hikes[0] : null;
        const lead = hikes[0];
        let href, label;
        if (one) {
            href = `hike.html?id=${realId(one.trail_id)}`;
            label = one.trail_name;
        } else {
            const tags = [...new Set(hikes.map(h => h.trip_tag))];
            const oneTrip = tags.length === 1 && tags[0] ? tags[0] : null;
            const range = `${formatHikeDate(hikes[0].date_completed)} to ${formatHikeDate(hikes[hikes.length - 1].date_completed)}`;
            href = oneTrip ? `trip.html?tag=${encodeURIComponent(oneTrip)}` : `hike.html?id=${realId(lead.trail_id)}`;
            label = oneTrip
                ? `${hikes.length} outings walked together on the ${tripName(oneTrip)}, ${range}. Opens the chapter.`
                : `${hikes.length} outings, ${range}. Opens ${lead.trail_name}; the rest are on the plates.`;
        }
        // aria-label, not title: a native tooltip is the floating,
        // cursor-following chrome the Atlas banned everywhere else, and it
        // arrives a second after the readout has already said the same thing
        return `<a class="tick${one ? '' : ' fused'}" data-h="${lead.trail_id}"
            ${one ? '' : `data-fused="${hikes.map(f => f.trail_id).join(',')}"`}
            href="${href}" aria-label="${label}"
            style="left:${pctT(c, t)}%;--r:${row};background:${laneInk(lead)}"
            >${one ? '' : `<span class="fn">${hikes.length}</span>`}</a>`;
    }

    // the runs this layout actually produced, for the panel to reserve against
    let runsSeen = [];

    function layoutLane() {
        const width = laneEl.clientWidth || 300;
        const mine = new Set(laneMine.map(h => h.trail_id));
        const mFirst = laneMine[0], mLast = laneMine[laneMine.length - 1];
        runsSeen = [];

        laneEl.innerHTML = courses.map(c => {
            const used = (c.length / YEARS_PER_COURSE) * 100;
            // an event stands at ONE moment (the middle of its span), so its
            // course is decided by that moment — a trip crossing New Year
            // belongs to one line or the other, never to both
            const ours = events.filter(e => e.t >= courseStart(c) && e.t < courseEnd(c));

            /* An EVENT takes the lowest row that is genuinely clear. Only when
               NO row is clear does it join its neighbour — chaining marks by
               proximity to each other instead collapses a long dense sequence
               into a single blob (measured: 32 marks became 8).

               With trips grouped first this almost never fires: Will R.'s 32
               outings are 14 events, and 14 events across five years have room
               to stand apart. It stays as the backstop for a run of standalone
               day hikes in one week. */
            /* Clearance is measured between the marks' EDGES, not their centres.
               A chapter's mark is 16px across where a lone outing's is 11, so a
               flat 12px centre-to-centre gap let two chapters overlap by 4px —
               and a chapter is exactly the mark you least want smudged. */
            const placed = [], lastInRow = [];
            ours.forEach(ev => {
                const x = pctT(c, ev.t) / 100 * width;
                const d = dia(ev.hikes.length);
                let row = -1;
                for (let r = 0; r < MAX_ROWS; r++) {
                    const prev = lastInRow[r];
                    if (!prev || x - prev.x >= (prev.d + d) / 2 + TICK_GAP) { row = r; break; }
                }
                if (row === -1) {
                    // nowhere clear to stand: join the neighbour rather than hide under it
                    const anchor = placed[placed.length - 1];
                    anchor.hikes = anchor.hikes.concat(ev.hikes);
                } else {
                    lastInRow[row] = { x, d };
                    placed.push({ hikes: ev.hikes, t: ev.t, row });
                }
            });
            const rows = Math.max(1, lastInRow.length);

            // a mark holding several outings that DON'T share one chapter is a
            // RUN, and the panel has to reserve room for its list
            placed.forEach(p => {
                if (p.hikes.length < 2) return;
                const tags = new Set(p.hikes.map(h => h.trip_tag));
                if (tags.size === 1 && [...tags][0]) return;   // a chapter, not a run
                runsSeen.push(p.hikes.map(h => byId.get(realId(h.trail_id))).filter(Boolean));
            });

            /* THE REST OF THE BOOK. The outings walked WITHOUT this person,
               threaded on a register rule under the lane's own marks. It is not
               a second track: it shares this course's axis, gridlines and rule,
               so the share is read as ink above paper rather than stated twice.
               Inert by design — no hover, no click, no tab stop. */
            const rest = laneAll.filter(h => holds(c, h) && !mine.has(h.trail_id));

            // the span of their own service, clipped to this course
            const s = Math.max(Date.parse(mFirst.date_completed), courseStart(c));
            const e = Math.min(Date.parse(mLast.date_completed), courseEnd(c) - 1);
            const span = e > s
                ? `<span class="span" style="left:${pctT(c, s)}%;width:${Math.max(0.3, pctT(c, e) - pctT(c, s))}%"></span>`
                : '';

            return `<div class="course" style="--ch:${26 + (rows - 1) * STACK + 14}px">` +
                c.map(y => `<span class="gl" style="left:${pctIn(c, `${y}-01-01`)}%"></span>`).join('') +
                c.map(y => `<span class="yr" style="left:${(pctIn(c, `${y}-01-01`) + pctIn(c, `${y + 1}-01-01`)) / 2}%">${String(y).slice(2)}</span>`).join('') +
                `<span class="rail" style="right:${(100 - used).toFixed(4)}%"></span>` +
                rest.map(h => `<span class="rm" style="left:${pctIn(c, h.date_completed)}%"></span>`).join('') +
                span +
                // a stacked mark keeps a hairline down to the moment it happened
                placed.filter(p => p.row > 0).map(p =>
                    `<span class="stem" style="left:${pctT(c, p.t)}%;bottom:26px;height:${p.row * STACK}px"></span>`).join('') +
                placed.map(p => markHTML(c, p)).join('') +
                `</div>`;
        }).join('');

        wireTicks();
        reservePanel();
    }

    /* =====================================================================
       THE CHAPTERS PANEL — the space under the lane, which used to hold one
       line of text and now does the work the ledger was doing badly.

       Danny, August 2026: the ledger's Trips row was "a messy paragraph",
       and what the record actually lacked was the outings INSIDE a trip.
       Both are the same problem — a chapter had no home of its own — so
       they get one answer, in the space the timeline is already pointing at.

       It is one panel with three states, and it never moves:

         AT REST      the legend, then every chapter walked together, one row
                      each with its year ink, its count and its years. This is
                      the ledger's Trips row done properly, and it is a door
                      to each chapter.
         ON A HIKE    that hike's name and where it was. The chapter list
                      stays put underneath, because nothing about a single
                      outing needs it to move.
         ON A TRIP    the chapter's name (a door), its span, and then EVERY
                      outing on it, each one a door of its own. This is the
                      answer to "the thing missing is listing out those
                      individual hikes within a trip".

       Two rules keep it honest, both learned elsewhere in this codebase:

       IT NEVER REBUILDS ITSELF UNDER THE CURSOR. Hovering a row inside the
       panel lights ink and nothing else. trip.js has the long version: a
       repaint destroys the node under the pointer, re-fires its own
       mouseenter and eats the click. Only the LANE may change the panel,
       and the lane is somewhere the cursor isn't.

       LEAVING A MARK IS NOT LEAVING THE PANEL. Travelling from a trip's mark
       down into its list crosses empty paper, so a mark's mouseleave only
       SCHEDULES the return to rest; entering the panel cancels it. Without
       that grace the list vanishes as you reach for it.
       ===================================================================== */
    const readout = document.getElementById('member-readout');
    /* NOT a live region, and that is the considered answer rather than an
       oversight. It was made aria-live="polite" so the page's mechanism would
       not be silent — but setPanel() replaces the whole panel, so every pass
       of the pointer across the lane queued the legend, a heading and six to
       nine rows to be read aloud in full. Roughly forty-five words per mark,
       fourteen marks, no throttle: not an announcement, a flood.

       What a screen reader actually needs here is already in the markup and is
       announced on focus: each mark's aria-label names its outing or chapter,
       each panel row is a link with its own text. The panel is the SIGHTED
       reading of the same facts. */

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    // UTC getters, always: read locally, a date west of UTC slides back a day
    const shortDate = (ds) => {
        const d = new Date(Date.parse(ds));
        return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
    };
    const yearSpan = (hs) => {
        const a = hikeYear(hs[0]), b = hikeYear(hs[hs.length - 1]);
        return a === b ? `${a}` : `${a}&ndash;${b}`;
    };
    const outings = (n) => `${n} outing${n === 1 ? '' : 's'}`;
    /* A chapter's span, written the way a person would say it. Mixing the two
       date formats ("16 Jun to June 22, 2026") reads like two half-finished
       sentences; a chapter almost always sits inside one year, so the year is
       said once at the end. */
    const spanOf = (hs) => {
        const a = hs[0], b = hs[hs.length - 1];
        if (a.date_completed === b.date_completed) return `${shortDate(a.date_completed)} ${hikeYear(a)}`;
        if (hikeYear(a) === hikeYear(b))
            return `${shortDate(a.date_completed)} to ${shortDate(b.date_completed)} ${hikeYear(b)}`;
        return `${formatHikeDate(a.date_completed)} to ${formatHikeDate(b.date_completed)}`;
    };

    /* the chapter list — the rest state's own content, and the thing a single
       hike leaves standing. Rows are anchors, so this is also how a keyboard
       reaches every chapter. */
    function chaptersHTML() {
        if (!trips.length) return '';
        return `<div class="tx-hd">${trips.length === 1 ? 'The chapter' : 'Chapters'} walked together</div>
            <div class="plist">${trips.map(tag => {
                const hs = tripHikes.get(tag);
                return `<a class="prow" data-tag="${encodeURIComponent(tag)}" href="trip.html?tag=${encodeURIComponent(tag)}">
                    <span class="pdot" style="background:${ink(hs[0])}"></span>
                    <span class="pnm">${tripName(tag)}</span>
                    <span class="pdt">${outings(hs.length)} &middot; ${yearSpan(hs)}</span>
                </a>`;
            }).join('')}</div>`;
    }

    function restHTML() {
        return `<div class="t">On the rule, the Atlas&rsquo;s other ${allHikes.length - shared.length} outings.</div>`
            + chaptersHTML();
    }

    function hikeHTML(hike) {
        return `<div class="t">${hike.trail_name}</div>
            <div class="d">${formatHikeDate(hike.date_completed)} &middot; ${hike.location}</div>`
            + chaptersHTML();
    }

    const rowFor = (h) => `<a class="prow" data-h="${h.trail_id}" href="hike.html?id=${h.trail_id}">
            <span class="pdot" style="background:${ink(h)}"></span>
            <span class="pnm">${h.trail_name}</span>
            <span class="pdt">${shortDate(h.date_completed)}</span>
        </a>`;

    /* a chapter, opened: its name is the door, and so is every outing listed */
    function tripHTML(tag, hs) {
        const total = tripTotal.get(tag) || hs.length;
        const part = total > hs.length;
        return `<a class="t tlink" href="trip.html?tag=${encodeURIComponent(tag)}">${tripName(tag)}</a>
            <div class="d">${spanOf(hs)} &middot; ${part
                ? `${hs.length} of the chapter&rsquo;s ${total} outings`
                : outings(hs.length)}</div>
            <div class="tx-hd">${part ? 'Walked together on this chapter' : 'Every outing on this chapter'}</div>
            <div class="plist">${hs.map(rowFor).join('')}</div>`;
    }

    // outings that collided on the lane without sharing a chapter
    function runHTML(hs) {
        return `<div class="t">${outings(hs.length)}</div>
            <div class="d">${spanOf(hs)}</div>
            <div class="tx-hd">Too close together to stand apart</div>
            <div class="plist">${hs.map(rowFor).join('')}</div>`;
    }

    /* THE PANEL HOLDS ITS HEIGHT.
       A long trail name wraps to three lines where most take one, and a
       nine-outing chapter is far taller than a one-line legend. Left to size
       itself the panel would jump on every hover, and the leaf with it.

       So it is measured against every state this record can actually reach,
       at the current width, and reserved at its tallest. The slack that
       leaves at rest sits BETWEEN the panel and the door, which is the one
       place crew.css allows it: "empty paper at the bottom of a page is a
       margin; in the middle, a mistake."

       This is also what fixed the bug Danny found: the date line of a
       three-line trail name used to land under the door, on content that
       exists only while the pointer is on a mark — so reaching it meant
       scrolling, scrolling meant moving the pointer, and moving the pointer
       took the line away. A box that never changes size can be scrolled into
       view once, at rest, and it is still there when you hover. */
    function reservePanel() {
        const w = readout.clientWidth;
        if (!w) return;
        const probe = document.createElement('div');
        probe.style.cssText = `position:absolute;left:0;visibility:hidden;pointer-events:none;width:${w}px;`;
        readout.parentNode.appendChild(probe);
        let tallest = 0;
        const measure = (cls, html) => {
            probe.className = cls; probe.innerHTML = html;
            tallest = Math.max(tallest, probe.offsetHeight);
        };
        measure('readout rest', restHTML());
        shared.forEach(h => measure('readout', hikeHTML(h)));
        trips.forEach(tag => measure('readout', tripHTML(tag, tripHikes.get(tag))));
        // runs depend on what actually collided at THIS width, so the layout
        // that just ran hands them over rather than us guessing the worst case
        runsSeen.forEach(hs => measure('readout', runHTML(hs)));
        probe.remove();
        readout.style.minHeight = `${tallest}px`;
    }

    /* The paper behind the door is the LEAF'S, not a flat fill: --leaf-l is
       the 9% stop of a four-stop gradient and the door sits nearer the 62%
       one, so a flat fill printed a pale rectangle across the page. The
       leaf's own gradient is re-cut to the door's box, read from the computed
       style so crew.css stays the one place those stops are written, and laid
       flat (to right) because over the leaf's height the 96deg tilt is worth
       about two parts in 255 — nothing, where a hard edge at the wrong colour
       was not. */
    function setDoorPaper() {
        const back = document.querySelector('.rec-back');
        if (!back) return;
        const leaf = document.querySelector('.crew-record .leaf.l');
        const lr = leaf.getBoundingClientRect(), br = back.getBoundingClientRect();
        const inner = back.parentNode;
        inner.style.setProperty('--door-paper', getComputedStyle(leaf).backgroundImage
            .replace(/^linear-gradient\([^,]+,/, 'linear-gradient(to right,'));
        inner.style.setProperty('--door-paper-w', `${Math.round(lr.width)}px`);
        inner.style.setProperty('--door-paper-x', `${Math.round(lr.left - br.left)}px`);
    }

    /* =====================================================================
       THE PLATES

       Complete-linkage clustering with a diameter cap: two groups merge only
       if EVERY pair in the union stays within MAX_PLATE_SPAN_KM. That is
       order-independent (no drifting centroids, no orphaned neighbours) and
       the cap directly bounds each plate's zoom, so a plate can never sprawl
       past legibility. Always merge the tightest compatible pair first, so
       natural regions form before loose ones.
       ===================================================================== */
    const MAX_PLATE_SPAN_KM = 75;
    const kmBetween = (a, b) => {
        const R = 6371;
        const dLat = (b.latitude - a.latitude) * Math.PI / 180;
        const dLon = (b.longitude - a.longitude) * Math.PI / 180;
        const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(a.latitude * Math.PI / 180) * Math.cos(b.latitude * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(s));
    };
    const mergedSpan = (a, b) => {
        const union = [...a.hikes, ...b.hikes];
        let span = 0;
        for (let i = 0; i < union.length; i++)
            for (let j = i + 1; j < union.length; j++) span = Math.max(span, kmBetween(union[i], union[j]));
        return span;
    };
    let clusters = shared.filter(h => h.latitude && h.longitude).map(h => ({ hikes: [h] }));
    while (clusters.length > 1) {
        let best = null;
        for (let i = 0; i < clusters.length; i++)
            for (let j = i + 1; j < clusters.length; j++) {
                const span = mergedSpan(clusters[i], clusters[j]);
                if (span <= MAX_PLATE_SPAN_KM && (!best || span < best.span)) best = { i, j, span };
            }
        if (!best) break;   // nothing left that can merge without over-stretching a plate
        clusters[best.i].hikes.push(...clusters[best.j].hikes);
        clusters.splice(best.j, 1);
    }
    clusters.forEach(c => c.hikes.sort(compareHikesChrono));
    clusters.sort((a, b) => b.hikes.length - a.hikes.length);

    // a plate names itself from its locations: one place speaks for itself,
    // a mixed cluster leads with its most-walked one
    const plateTitle = (cluster) => {
        const tally = {};
        cluster.hikes.forEach(h => { tally[h.location] = (tally[h.location] || 0) + 1; });
        const places = Object.entries(tally).sort((a, b) => b[1] - a[1]);
        return places.length === 1 ? places[0][0] : `${places[0][0]} & nearby`;
    };
    const regions = clusters.filter(c => c.hikes.length > 1);
    const singles = clusters.filter(c => c.hikes.length === 1).map(c => c.hikes[0]);
    const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

    document.getElementById('member-platecount').innerHTML =
        (regions.length ? `${regions.length} plate${regions.length === 1 ? '' : 's'}` : 'No plates') +
        (singles.length ? ` &middot; ${singles.length} loose` : '');

    /* ---- every frame enters the DOM first, so Leaflet measures a settled
            layout rather than a column still reflowing around it ---- */
    const platesEl = document.getElementById('member-plates');
    // the grid composes to the number of plates, not to the window width
    platesEl.classList.add(`n${Math.min(regions.length, 5)}`);
    regions.forEach((cluster, i) => {
        const plate = document.createElement('div');
        plate.className = 'plate';
        plate.innerHTML = `
            <div class="p-collar">
                <div>
                    <div class="p-no">Plate ${ROMAN[i] || i + 1}</div>
                    <div class="p-name">${plateTitle(cluster)}</div>
                </div>
                <span class="p-cnt">${cluster.hikes.length} together</span>
            </div>
            <div class="p-map" id="plate-map-${i}"></div>`;
        platesEl.appendChild(plate);
    });

    /* ---- the Atlas basemap: the same stack map.js wears (CARTO Voyager,
            Esri hillshade multiplied over it, quiet labels under the
            parchment wash) so a plate has the Atlas's own complexion ---- */
    const VOYAGER_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png';
    const HILLSHADE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}';
    const LABELS_URL = 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png';

    const inkLayers = {};       // trail_id -> [leaflet layers], for the cross-light
    const plateFits = [];       // (map, bounds) pairs, for post-layout re-fits
    const grabLayers = [];      // invisible fat lines that make a 3.8px trail pointable

    regions.forEach((cluster, i) => {
        // static, like the hike page's map: this is a plate, not a vehicle
        const plateMap = L.map(`plate-map-${i}`, {
            zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
            touchZoom: false, boxZoom: false, keyboard: false
        });
        L.tileLayer(VOYAGER_URL, { subdomains: 'abcd', maxZoom: 18, attribution: '&copy; CARTO' }).addTo(plateMap);
        L.tileLayer(HILLSHADE_URL, { maxNativeZoom: 16, maxZoom: 18, className: 'hillshade-multiply', attribution: 'Esri' }).addTo(plateMap);
        L.tileLayer(LABELS_URL, { subdomains: 'abcd', maxZoom: 18, className: 'atlas-labels' }).addTo(plateMap);
        const wash = document.createElement('div');
        wash.className = 'parchment-wash';
        plateMap.getContainer().appendChild(wash);

        const bounds = L.latLngBounds([]);
        cluster.hikes.forEach(hike => {
            const segments = geometries[hike.trail_id];
            const drawn = [];
            if (segments) {
                segments.forEach(seg => {
                    /* IMPECCABLE — the median trail occupies about 15px of a
                       536px plate, and the hit target was the 3.8px stroke
                       itself; the smallest measured 1x1 px, a live navigation
                       target the size of a full stop. An invisible fat line
                       under the ink is the standard Leaflet answer and costs
                       nothing visually. */
                    const grab = L.polyline(seg, {
                        color: '#000', weight: 16, opacity: 0, interactive: true
                    }).addTo(plateMap);
                    const line = L.polyline(seg, { color: ink(hike), weight: 3.8, opacity: 0.95, interactive: false }).addTo(plateMap);
                    line._plateIndex = i;
                    drawn.push(line);
                    grabLayers.push({ grab, id: hike.trail_id });
                    bounds.extend(line.getBounds());
                });
            } else {
                // viewpoints and missing tracks still hold their place
                const dot = L.circleMarker([hike.latitude, hike.longitude], {
                    radius: 5, color: '#fffdf6', weight: 2, fillColor: ink(hike), fillOpacity: 1
                }).addTo(plateMap);
                dot._plateIndex = i;
                drawn.push(dot);
                bounds.extend(dot.getLatLng());
            }
            inkLayers[hike.trail_id] = drawn;
            // the plate answers back into the same panel the lane drives, and
            // leaves on the same grace, so crossing between the two leaves
            // doesn't slam the panel home in between
            grabLayers.filter(g => g.id === hike.trail_id).forEach(({ grab }) => {
                grab.on('mouseover', () => showHike(hike));
                grab.on('mouseout', scheduleRest);
                grab.on('click', () => { window.location.href = `hike.html?id=${hike.trail_id}`; });
            });
            drawn.forEach(layer => {
                layer.on('mouseover', () => showHike(hike));
                layer.on('mouseout', scheduleRest);
                layer.on('click', () => { window.location.href = `hike.html?id=${hike.trail_id}`; });
            });
        });
        plateMap.fitBounds(bounds, { padding: [18, 18] });
        plateFits.push({ map: plateMap, bounds });
    });

    // Late layout shifts (web fonts landing, a scrollbar appearing) change
    // container sizes after init — re-measure and re-centre every plate.
    const refitPlates = () => plateFits.forEach(({ map, bounds }) => {
        map.invalidateSize();
        map.fitBounds(bounds, { padding: [18, 18] });
    });
    setTimeout(refitPlates, 80);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refitPlates);

    /* ---- the loose sheet ---- */
    if (singles.length > 0) {
        document.getElementById('member-loose').hidden = false;
        // "too far from the rest" is only true when there IS a rest — with no
        // plates at all, the loose sheet is simply the whole record
        document.getElementById('member-loose-count').textContent = regions.length
            ? `${singles.length} outing${singles.length === 1 ? '' : 's'} too far from the rest to share a plate`
            : `${singles.length === 1 ? 'the one outing' : `all ${singles.length} outings`} you have walked together, drawn as ${singles.length === 1 ? 'its own trailprint' : 'their own trailprints'}`;
        document.getElementById('member-prints').innerHTML = singles.map(hike => `
            <a class="print" data-h="${hike.trail_id}" href="hike.html?id=${hike.trail_id}">
                ${trailprintSVG(geometries[hike.trail_id], ink(hike))}
                <div class="t">${hike.trail_name}</div>
                <div class="p">${hike.location}</div>
            </a>`).join('');
    }

    /* =====================================================================
       THE TIE — a mark on the lane and its trail on the plates, both ways
       ===================================================================== */
    const byId = new Map(shared.map(h => [h.trail_id, h]));

    /* IMPECCABLE — a VIEWPOINT is a circleMarker, not a polyline, and the dim
       style was written for a line: weight and opacity govern a circle's
       STROKE, so its white ring faded away while the coloured fill stayed at
       full strength. The result was backwards — at the exact moment every
       trail around it stepped back, a viewpoint looked like the thing being
       pointed at. A circle has to fade by its FILL. */
    function styleLayer(layer, lit) {
        if (!layer.setStyle) return;
        if (layer instanceof L.CircleMarker) {
            layer.setStyle(lit
                ? { color: '#fffdf6', weight: 2, opacity: 1, fillOpacity: 1 }
                : { color: '#fffdf6', weight: 1.2, opacity: 0.3, fillOpacity: 0.3 });
            layer.setRadius(lit ? 6.5 : 5);
        } else {
            layer.setStyle(lit ? { weight: 5.5, opacity: 1 } : { weight: 3.4, opacity: 0.38 });
        }
    }
    function restLayer(layer) {
        if (!layer.setStyle) return;
        if (layer instanceof L.CircleMarker) {
            layer.setStyle({ color: '#fffdf6', weight: 2, opacity: 1, fillOpacity: 1 });
            layer.setRadius(5);
        } else {
            layer.setStyle({ weight: 3.8, opacity: 0.95 });
        }
    }

    /* ---------------------------------------------------------------------
       THE INK — marks, plates, trails, loose prints. Deliberately separate
       from the panel: a row inside the panel lights ink WITHOUT repainting
       the panel it lives in, which is the only way a list can be hovered
       without destroying the node under the cursor.
       --------------------------------------------------------------------- */
    function lightInk(ids) {
        const set = new Set(ids);
        laneEl.classList.add('reading');
        laneEl.querySelectorAll('.tick').forEach(tick => {
            const own = [tick.dataset.h, ...(tick.dataset.fused || '').split(',')].filter(Boolean);
            tick.classList.toggle('lit', own.some(i => set.has(realId(i))));
        });

        /* IMPECCABLE — one plate out of four was answering and the leaf kept it
           to itself: the lit trail is a ~15px mark on a 536px plate, every other
           trail dimmed, and nothing said WHICH map had spoken. The plate that
           holds the answer now takes the ink in its own collar. A chapter's mark
           can light two plates at once, which is exactly right: the Alaska week
           is on Denali and Chugach both. */
        const litPlates = new Set();
        ids.forEach(id => (inkLayers[id] || []).forEach(l => {
            if (l._plateIndex !== undefined) litPlates.add(l._plateIndex);
        }));
        document.querySelectorAll('.plate').forEach((pl, n) => pl.classList.toggle('answering', litPlates.has(n)));
        // every other trail steps back so the lit ones are found at a glance,
        // but never so far that the plate reads as empty
        Object.entries(inkLayers).forEach(([tid, layers]) =>
            layers.forEach(layer => styleLayer(layer, set.has(tid))));
        document.querySelectorAll('.print').forEach(p => p.classList.toggle('lit', set.has(p.dataset.h)));
        /* The panel answers to the ink too, and a CHAPTER row and an OUTING row
           answer different questions.

           An outing row lights only when the ink is EXACTLY its own — "is my
           outing among those lit?" is true of every row of an opened chapter,
           which lit the whole list at once and made the highlight meaningless.

           A chapter row lights when everything lit BELONGS to it. That is what
           finally makes the two-way tie the stylesheet promises real: hovering
           a single trail on a plate now lights the chapter it was walked on,
           where before the test was equality and no chapter row could ever
           match one hike. */
        readout.querySelectorAll('.prow').forEach(r => {
            const own = rowIds(r);
            const lit = r.dataset.tag
                ? set.size > 0 && [...set].every(i => own.includes(i))
                : own.length === set.size && own.every(i => set.has(i));
            r.classList.toggle('lit', lit);
        });
    }

    function dimOff() {
        laneEl.classList.remove('reading');
        laneEl.querySelectorAll('.tick.lit').forEach(t => t.classList.remove('lit'));
        Object.values(inkLayers).forEach(layers => layers.forEach(restLayer));
        document.querySelectorAll('.print.lit').forEach(p => p.classList.remove('lit'));
        document.querySelectorAll('.plate.answering').forEach(pl => pl.classList.remove('answering'));
        readout.querySelectorAll('.prow.lit').forEach(r => r.classList.remove('lit'));
    }

    /* ---------------------------------------------------------------------
       THE PANEL's three states, and the grace that lets you walk into one.
       --------------------------------------------------------------------- */
    let subject = { ids: [], state: 'rest' };
    let graceTimer = null;
    /* Declarations, not const arrows, and that is load-bearing: the plates are
       built ABOVE this point and hand `scheduleRest` straight to Leaflet as a
       handler, which reads the binding there and then. A const would still be
       in its temporal dead zone at that moment and the whole boot would throw.
       A hoisted declaration is readable from anywhere in the closure and only
       ever CALLED once everything it touches exists. */
    function cancelGrace() { clearTimeout(graceTimer); graceTimer = null; }
    // long enough to cross the paper between a mark and its own list, short
    // enough that the panel doesn't feel stuck to the last thing you touched
    // ...unless the leaf has just scrolled itself under a pointer that never
    // moved: what looks like leaving is the ground going by. See revealPanel.
    function scheduleRest() {
        if (pinned) return;
        cancelGrace();
        graceTimer = setTimeout(showRest, 340);
    }

    // a panel row stands either for one outing or for a whole chapter
    function rowIds(row) {
        if (row.dataset.h) return [row.dataset.h];
        const hs = tripHikes.get(decodeURIComponent(row.dataset.tag || ''));
        return hs ? hs.map(h => h.trail_id) : [];
    }

    /* BRING THE ANSWER INTO VIEW.
       The record is taller than the leaf that holds it, so for most of the
       leaf's travel the panel sits below the fold at the exact moment it
       fills: you point at a mark and the reply lands somewhere you cannot
       see. Measured at 1512x722 — the leaf overflows by 382px, and the first
       chapter row needs it scrolled 182px before it clears the door.

       So a mark that opens the panel also scrolls the leaf the LEAST it can
       and still stand one row clear of the door. Not to the panel's top, not
       to the foot of the page: the smallest move keeps the lane nearest to
       where the reader left it, and once a row is showing the check costs
       nothing and no further hover moves the page at all.

       THE POINTER DID NOT MOVE — THE GROUND DID, and everything awkward here
       comes from that one fact. Scrolling drags the mark out from under a
       stationary cursor, which fires exactly the same mouseleave as walking
       away, and would send the panel home 340ms after opening it.

       On a long scroll it happened to survive: the panel sits directly below
       the lane, so the list arrived under the cursor and its own mouseenter
       cancelled the return. But that is a coincidence of distance, not a
       rule, and the shortest records break it — Chandler's panel needs 15px,
       enough to leave an 11px mark and not enough to reach the list, so the
       answer appeared and vanished. So the panel is PINNED from the moment we
       scroll until the pointer genuinely moves again. A mouseleave we caused
       is not a gesture and is not counted as one.

       "Genuinely" is load-bearing: browsers re-run hit testing after a scroll
       and emit a pointermove at the SAME coordinates to refresh :hover, so
       the release waits for coordinates that actually differ. When the real
       move comes, where it lands decides — a mark, the panel or a loose print
       and the panel holds; anywhere else and it goes home on the usual grace.

       Two more things hold for the length of the scroll itself. A mark on a
       LOWER course (the lane wraps every five years) would be dragged up
       under the stationary cursor and open a chapter nobody asked for, so
       ticks ignore the pointer while the leaf is moving. And someone who has
       asked for less motion gets the jump, not the glide. */
    const scroller = document.querySelector('.crew-record .leaf.l .inner');
    const doorBlock = document.querySelector('.rec-back');
    /* Declared here rather than read from crew-book.js's BOOK_STILL: that is a
       top-level `const`, so it is a lexical binding and not a property of
       window, and reaching for it would make this file fail at BOOT the day
       that one is wrapped in a function. One duplicated media query is the
       cheaper of the two mistakes. */
    const LEAF_STILL = !!(window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    /* A row counts as seen only when nothing is printed over it. The door's
       paper does thin to transparent across its top 32px — that fade is why
       the pointer may reach through it — but "legible under a wash" is not
       the same as visible, so the floor is the whole door block. */
    const ROW_CLEAR = 6;
    const SCROLL_MS = 480;
    let scrollHold = 0;
    const leafMoving = () => performance.now() < scrollHold;

    /* Whatever the pointer "leaves" while this is up, it did not leave.
       The release waits for the pointer to travel, and the reference it
       travels FROM is set by the first move after the pin rather than by the
       pin itself. That is not a nicety — a mouse crossing into an element
       emits pointerover/mouseenter and THEN a pointermove, so the move that
       delivers the hover always arrives just after the leaf starts scrolling,
       at fractional coordinates a fraction of a pixel away (measured:
       180,567 -> 180.2266,567.9141). Treated as travel it unpinned instantly
       and the panel went home 340ms later, which is the bug this whole block
       exists to stop. It is the tail of the gesture that opened the panel, so
       it is where the reader IS, not evidence of them going anywhere. */
    const PIN_SLACK = 3;
    let pinned = false, pinX = null, pinY = null;
    document.addEventListener('pointermove', (e) => {
        if (!pinned) return;
        if (pinX === null) { pinX = e.clientX; pinY = e.clientY; return; }
        if (Math.abs(e.clientX - pinX) < PIN_SLACK && Math.abs(e.clientY - pinY) < PIN_SLACK) return;
        pinned = false;
        const el = e.target;
        // the instrument is the lane, the panel and the loose prints; a real
        // move to anywhere else is the reader done reading
        if (!(el instanceof Element) || !el.closest('.tick, .readout, .print')) scheduleRest();
    }, { passive: true });

    /* `topUp` is the second look. THE DOOR IS STICKY, and on a short record it
       has not finished travelling to where it sticks, so it moves DOWN the
       page as the leaf scrolls up and eats into the very clearance being made
       for it — Chandler asks for 15px, the door takes back 6, and the row
       lands flush against it instead of clear of it. Modelling that would
       mean reimplementing position:sticky from the outside and being right
       about it; measuring again once the leaf has stopped costs one more
       scroll of a few pixels, inside the pinned window, where nobody sees it.
       The flag is what stops the two of them calling each other forever. */
    function revealPanel(topUp) {
        if (!scroller || !doorBlock) return;
        /* The first row where there is one, and the head's last line where
           there isn't. A record with a single outing and no chapter (Chandler
           has exactly that) has no rows at all, and its panel is still two
           lines that must be readable — "at least one entry" means the reply,
           not literally a list item. */
        const target = readout.querySelector('.prow')
            || readout.querySelector('.d')
            || readout.querySelector('.t');
        if (!target) return;
        // nothing was disturbed unless we actually move the leaf. On the
        // second look the pin is already earned and must survive a no-op.
        if (!topUp) pinned = false;
        const delta = Math.round(target.getBoundingClientRect().bottom + ROW_CLEAR
            - doorBlock.getBoundingClientRect().top);
        if (delta < 2) return;
        const top = Math.min(scroller.scrollTop + delta,
            scroller.scrollHeight - scroller.clientHeight);
        if (top - scroller.scrollTop < 2) return;
        if (!topUp) { pinned = true; pinX = null; pinY = null; }
        scrollHold = performance.now() + (LEAF_STILL ? 0 : SCROLL_MS);
        scroller.scrollTo({ top, behavior: LEAF_STILL ? 'auto' : 'smooth' });
        if (!topUp) setTimeout(() => revealPanel(true), SCROLL_MS + 40);
    }

    function setPanel(html, isRest) {
        /* NEVER repaint out from under the keyboard. The panel holds up to
           nine links, and a pointer drifting across the lane while someone has
           tabbed into that list would replace the row they are standing on —
           dropping focus to <body> and losing their place in the page. The
           pointer can wait; a lost caret cannot be recovered. */
        if (readout.contains(document.activeElement)) return;
        readout.className = isRest ? 'readout rest' : 'readout';
        readout.innerHTML = html;
        // rows are rebuilt with the panel, so they are wired from here
        readout.querySelectorAll('.prow').forEach(row => {
            const ids = rowIds(row);
            const on = () => { cancelGrace(); lightInk(ids); };
            // a row lights ink and NOTHING else. Repainting the panel from
            // inside the panel destroys the node under the pointer, re-fires
            // its own mouseenter and eats the click (trip.js has the scars).
            row.addEventListener('mouseenter', on);
            row.addEventListener('focus', on);
            // leaving a row falls back to whatever the panel is ABOUT, so
            // running an eye down a chapter's list keeps the chapter lit
            const off = () => { subject.ids.length ? lightInk(subject.ids) : dimOff(); };
            row.addEventListener('mouseleave', off);
            row.addEventListener('blur', off);
        });
        // the reader has pointed at something; the reply has to be on screen
        if (!isRest) revealPanel();
    }

    function showRest() {
        cancelGrace();
        subject = { ids: [], state: 'rest' };
        setPanel(restHTML(), true);
        dimOff();
    }
    function showHike(hike) {
        cancelGrace();
        subject = { ids: [hike.trail_id], state: 'hike' };
        setPanel(hikeHTML(hike), false);
        lightInk(subject.ids);
    }
    function showTrip(tag) {
        cancelGrace();
        const hs = tripHikes.get(tag);
        if (!hs) return;
        subject = { ids: hs.map(h => h.trail_id), state: 'trip' };
        setPanel(tripHTML(tag, hs), false);
        lightInk(subject.ids);
    }
    /* The rare pixel fuse: outings too close to stand apart that DON'T share a
       chapter. It used to open one of them arbitrarily and strand the rest;
       now it lists every one as its own door, the same as a chapter does. */
    function showRun(hs) {
        cancelGrace();
        subject = { ids: hs.map(h => h.trail_id), state: 'run' };
        setPanel(runHTML(hs), false);
        lightInk(subject.ids);
    }

    function showHikeById(id) {
        const h = byId.get(realId(id));
        if (h) showHike(h);
    }

    /* A mark answers for whatever it stands for: one outing, one chapter, or
       a run of outings that collided. */
    function showMark(tick) {
        const hs = [...new Set((tick.dataset.fused || tick.dataset.h).split(',').map(realId))]
            .map(i => byId.get(i)).filter(Boolean);
        if (!hs.length) return;
        if (hs.length === 1) return showHike(hs[0]);
        const tags = [...new Set(hs.map(h => h.trip_tag))];
        if (tags.length === 1 && tags[0]) return showTrip(tags[0]);
        showRun(hs);
    }

    // travelling INTO the panel keeps what is showing; leaving it goes home
    readout.addEventListener('mouseenter', cancelGrace);
    readout.addEventListener('focusin', cancelGrace);
    readout.addEventListener('mouseleave', () => {
        subject.state === 'rest' ? dimOff() : scheduleRest();
    });
    /* Leaving the panel BY KEYBOARD has to go home too, and it is a separate
       event from a row losing focus: a row's own blur only puts the ink back
       to whatever the panel is about, because moving between rows of an open
       chapter must not close it. So the panel watches focus leaving IT — a
       relatedTarget still inside is a step between rows, anything else is the
       way out. Without this, tabbing into a chapter's list and then onward
       left the panel stuck on that chapter for good. */
    readout.addEventListener('focusout', (e) => {
        if (!readout.contains(e.relatedTarget)) scheduleRest();
    });

    // the lane is rebuilt whenever the leaf changes width, so its marks are
    // wired from there rather than once at the end
    /* THE POINTER OPENS THE PANEL; THE KEYBOARD ONLY LIGHTS THE INK.
       They are not the same gesture and treating them as one broke both ends.

       The panel sits AFTER all 14 marks in the document, so a keyboard reaches
       it by tabbing past the lane — and if every mark rewrote the panel on
       focus, then by the time you arrived it held whatever the LAST mark
       happened to be. Measured: tabbing to Alaska replaced the chapter list
       with its 8 outings, so the six chapter links were unreachable by
       keyboard. Those links are the ledger's old Trips row, which this change
       deleted; losing them was a straight regression.

       Focus therefore lights the trail on the plates and nothing else. The
       mark's own aria-label already says what it is ("8 outings walked
       together on the Alaska Camping Trip… Opens the chapter"), Enter opens
       that chapter, and the panel stays at rest so its chapter list is still
       there when you reach it. It also stops the panel being rebuilt — and
       re-announced — on every single Tab. */
    function wireTicks() {
        laneEl.querySelectorAll('.tick').forEach(tick => {
            const ids = [...new Set((tick.dataset.fused || tick.dataset.h).split(',').map(realId))];
            // not while the leaf is scrolling itself: a mark on a lower course
            // dragged up under a stationary cursor is not somebody pointing
            tick.addEventListener('mouseenter', () => { if (!leafMoving()) showMark(tick); });
            // scheduled, not immediate: the pointer has to cross empty paper
            // to reach the list this mark just opened
            tick.addEventListener('mouseleave', scheduleRest);
            tick.addEventListener('focus', () => { cancelGrace(); lightInk(ids); });
            tick.addEventListener('blur', () => { subject.ids.length ? lightInk(subject.ids) : dimOff(); });
        });
    }
    // The loose prints were tab stops that answered to nothing: focusing one
    // lit no mark, because they carried mouseenter/mouseleave only while the
    // lane's marks carry focus/blur as well. A tab stop that does nothing when
    // reached is worse than no tab stop.
    document.querySelectorAll('.print').forEach(print => {
        print.addEventListener('mouseenter', () => showHikeById(print.dataset.h));
        print.addEventListener('mouseleave', scheduleRest);
        // same split as the lane's marks: a keyboard lights, it does not rewrite
        print.addEventListener('focus', () => { cancelGrace(); lightInk([realId(print.dataset.h)]); });
        print.addEventListener('blur', () => { subject.ids.length ? lightInk(subject.ids) : dimOff(); });
    });

    /* ---------------------------------------------------------------------
       FIRST LIGHT. The lane and the panel are raised LAST, after the plates,
       because both reach for things declared down here — `byId` to map a
       rehearsal clone back to the outing it copies, `inkLayers` to put the
       ink back at rest. Raising them earlier reads those bindings before
       they exist, which is a silent ReferenceError inside a handler and a
       hard one at boot.
       --------------------------------------------------------------------- */
    showRest();
    setDoorPaper();
    layoutLane();
    // the leaf is fluid, so what collides — and how tall the panel must be —
    // changes with the window
    let laneTimer;
    window.addEventListener('resize', () => {
        clearTimeout(laneTimer);
        laneTimer = setTimeout(() => { setDoorPaper(); layoutLane(); }, 180);
    });

    bookWireTurns(document);
    bookOpen();
});

/**
 * A trail's shape as standalone line art — the literal trailprint. The GPX
 * geometry normalised into a small square, drawn in the hike's year ink with
 * no basemap beneath it. Trackless outings (viewpoints) print as a single
 * mark. Equirectangular with a latitude correction, so shapes aren't stretched.
 * @param {Array|undefined} segments - [lat, lng] segment arrays from trails.geojson
 * @param {string} color - the hike's year ink
 */
function trailprintSVG(segments, color) {
    const S = 96, PAD = 9;
    if (!segments) {
        return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
            <circle cx="${S / 2}" cy="${S / 2}" r="6" fill="${color}" stroke="#fffdf6" stroke-width="2"/></svg>`;
    }
    const pts = segments.flat();
    const lats = pts.map(p => p[0]), lons = pts.map(p => p[1]);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const cosMid = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
    const w = (maxLon - minLon) * cosMid, h = maxLat - minLat;
    const scale = (S - 2 * PAD) / Math.max(w, h);
    const offX = (S - w * scale) / 2, offY = (S - h * scale) / 2;
    const paths = segments.map(seg => 'M ' + seg.map(p =>
        `${(offX + (p[1] - minLon) * cosMid * scale).toFixed(1)},${(offY + (maxLat - p[0]) * scale).toFixed(1)}`
    ).join(' L ')).join(' ');
    return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
        <path d="${paths}" fill="none" stroke="${color}" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
