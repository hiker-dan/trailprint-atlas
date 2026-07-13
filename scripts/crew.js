/**
 * Trail Crew — the people of the Atlas.
 *
 * Everything derives from hikes.json at load time; there is no companion
 * data anywhere else. Two tiers share the page:
 *   - The Core Crew: companions with CREW_CORE_MIN_HIKES+ shared hikes get a
 *     field card (photo, headline numbers) linking to their member page.
 *   - The Trail Register: every companion, one ledger line each, with an
 *     era bar showing when they were active. Rows expand in place to list
 *     the shared hikes, so no one's history hides behind a click-through.
 */
document.addEventListener('DOMContentLoaded', async () => {

    let allHikes;
    try {
        allHikes = await fetchHikes();
    } catch (err) {
        console.error('Could not load hike data:', err);
        document.getElementById('crew-tally').innerText = 'The register could not be opened.';
        return;
    }
    const portraits = await fetchCrewPortraits();

    const people = groupByCompanion(allHikes);
    const soloCount = allHikes.filter(h => !h.hiked_with || h.hiked_with.length === 0).length;

    // One stat block per person, sorted by hikes together (ties: miles)
    const roster = [...people.entries()].map(([name, hikes]) => {
        const sorted = [...hikes].sort(compareHikesChrono);
        return {
            name,
            hikes: sorted,
            count: hikes.length,
            miles: hikes.reduce((s, h) => s + h.miles, 0),
            feet: hikes.reduce((s, h) => s + h.elevation_gain, 0),
            trips: new Set(hikes.filter(h => h.trip_tag).map(h => h.trip_tag)),
            first: sorted[0],
            last: sorted[sorted.length - 1]
        };
    }).sort((a, b) => b.count - a.count || b.miles - a.miles);

    // --- Hero tally ---
    const sharedCount = allHikes.length - soloCount;
    document.getElementById('crew-tally').innerText =
        `${roster.length} companions · ${sharedCount} shared hikes · every name in the register below`;

    // --- The Core Crew cards ---
    const coreCrew = roster.filter(p => p.count >= ATLAS_CONFIG.CREW_CORE_MIN_HIKES);
    const cardsEl = document.getElementById('crew-cards');
    cardsEl.innerHTML = coreCrew.map(p => {
        // Hand-picked portrait when one exists (face-aware crop keeps the
        // person in frame); otherwise a landscape from a shared hike
        const cover = portraits[p.name]
            ? cloudinaryUrl(portraits[p.name], 'w_600,h_400,c_fill,g_auto,q_auto,f_auto')
            : crewCoverUrl(p.hikes, 'w_600,h_400,c_fill,q_auto,f_auto');
        const sinceYear = hikeYear(p.first);
        return `
        <a class="crew-card" href="crew-member.html?name=${encodeURIComponent(p.name)}">
            <div class="crew-card-photo" ${cover ? `style="background-image: url('${cover}')"` : ''}></div>
            <div class="crew-card-body">
                <div class="crew-card-name">${p.name}</div>
                <div class="crew-card-count">${p.count} hikes together</div>
                <div class="crew-card-stats">${p.miles.toFixed(1)} mi &middot; ${p.feet.toLocaleString()} ft climbed</div>
                <div class="crew-card-since">On the trail together since ${sinceYear}</div>
            </div>
        </a>`;
    }).join('');

    // --- The Trail Register ---
    // The era bar spans the Atlas's whole life: first hike ever -> today.
    const firstEver = [...allHikes].sort(compareHikesChrono)[0];
    const eraStart = Date.parse(firstEver.date_completed);
    const eraEnd = Date.now();
    const eraPct = (dateStr) =>
        Math.min(100, Math.max(0, (Date.parse(dateStr) - eraStart) / (eraEnd - eraStart) * 100));

    const registerEl = document.getElementById('crew-register');
    registerEl.innerHTML = roster.map((p, i) => {
        const left = eraPct(p.first.date_completed);
        const width = Math.max(1.5, eraPct(p.last.date_completed) - left);
        const span = hikeYear(p.first) === hikeYear(p.last)
            ? hikeYear(p.first)
            : `${hikeYear(p.first)}–${hikeYear(p.last)}`;
        const drawer = p.hikes.slice().reverse().map(h => `
            <a class="crew-drawer-hike" href="hike.html?id=${h.trail_id}">
                <span class="cdh-date">${formatHikeDate(h.date_completed)}</span>
                <span class="cdh-name">${h.trail_name}</span>
                <span class="cdh-arrow">&rarr;</span>
            </a>`).join('');
        const tripsLine = p.trips.size > 0
            ? `<div class="crew-drawer-trips">Trips together: ${[...p.trips].map(t => {
                    const splitAt = t.lastIndexOf(' - ');
                    const tripName = splitAt > 0 ? t.slice(0, splitAt) : t;
                    return `<a href="trip.html?tag=${encodeURIComponent(t)}">${tripName}</a>`;
                }).join(' &middot; ')}</div>`
            : '';
        return `
        <div class="crew-row" data-row="${i}">
            <button class="crew-row-line" type="button" aria-expanded="false">
                <span class="crew-row-name">${p.name}</span>
                <span class="crew-row-count">${p.count} ${p.count === 1 ? 'hike' : 'hikes'}</span>
                <span class="crew-row-stats">${p.miles.toFixed(1)} mi &middot; ${p.feet.toLocaleString()} ft</span>
                <span class="crew-row-era"><span class="crew-era-track"><span class="crew-era-fill" style="left: ${left}%; width: ${width}%"></span></span><span class="crew-era-span">${span}</span></span>
                <span class="crew-row-chevron">&#9662;</span>
            </button>
            <div class="crew-drawer">${drawer}${tripsLine}</div>
        </div>`;
    }).join('');

    // Row click toggles its drawer; only one open at a time keeps the ledger calm
    let openRow = null;
    registerEl.querySelectorAll('.crew-row').forEach(row => {
        row.querySelector('.crew-row-line').addEventListener('click', () => {
            if (openRow && openRow !== row) openRow.classList.remove('open');
            row.classList.toggle('open');
            const line = row.querySelector('.crew-row-line');
            line.setAttribute('aria-expanded', row.classList.contains('open'));
            openRow = row.classList.contains('open') ? row : null;
        });
    });

    // --- The quiet footnote ---
    document.getElementById('crew-solo-line').innerText =
        `…and ${soloCount} hikes walked alone.`;
});

/**
 * A companion's cover photo: the first photo of the longest hike together
 * that has photos (the anti-selfie heuristic, same as trip covers).
 * Returns null when no shared hike has photos.
 */
function crewCoverUrl(hikes, transform) {
    const withPhotos = hikes.filter(h => h.images && h.images.length > 0)
        .sort((a, b) => b.miles - a.miles);
    if (withPhotos.length === 0) return null;
    return cloudinaryUrl(withPhotos[0].images[0], transform);
}
