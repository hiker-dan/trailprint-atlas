/**
 * Homepage script for The Trailprint Atlas.
 * Owns the intro's SKIP COORDINATION (AtlasIntro), the Odometer stats reels and
 * the nav loading-bar sequence. The hero film itself lives in
 * scripts/intro-film.js and hangs off AtlasIntro from there, so this file has
 * to load first.
 * Requires config.js, atlas-data.js.
 *
 * (The tiny sessionStorage/reduced-motion fast-forward check stays inline in
 * index.html — it must run before first paint to prevent intro flicker.)
 */

// ===== Intro skip coordination =====
// The first visit plays two parallel timed sequences: the hero film and the
// nav loading-bar. Both register their pending timers and a "jump to the end"
// finisher here, so a single skip() cancels everything still pending and
// lands on the finished homepage at once.
const AtlasIntro = {
    timeouts: [],
    finishers: [],
    skipped: false,
    // Use for every intro timer so skip() can cancel whatever hasn't fired.
    schedule(fn, delay) {
        const id = setTimeout(fn, delay);
        this.timeouts.push(id);
        return id;
    },
    // Register a "snap to final state" callback for one sequence.
    onSkip(fn) { this.finishers.push(fn); },
    // ...and a "the film has come to rest" callback. The nav's loading phrases
    // used to run on their own 9.5s timer, which was fine when the film was
    // ~20s and wrong the moment it became 42s — the nav arrived a third of the
    // way through, over the top of the shot. Now the film calls landed() and
    // the nav answers, so retuning the film cannot leave the two out of step.
    landers: [],
    onLand(fn) { this.landers.push(fn); },
    landed() {
        if (this._landed) return;
        this._landed = true;
        this.landers.forEach(fn => {
            try { fn(); } catch (e) { console.error('intro land handler failed:', e); }
        });
    },
    skip() {
        if (this.skipped) return; // idempotent — natural completion also flips this
        this.skipped = true;
        this.timeouts.forEach(clearTimeout);
        document.documentElement.classList.add('intro-fast-forward');
        sessionStorage.setItem('introShown', 'true');
        this.finishers.forEach(fn => {
            try { fn(); } catch (e) { console.error('intro skip finisher failed:', e); }
        });
        this.landed();      // a skip lands the page too, nav and all
    }
};

// ===== The Life in Trails: the hero film =====
// Lives in scripts/intro-film.js now, not here. It grew a video half, two
// MapLibre maps and a tile warm, and it is shared verbatim with the cutting
// room at mockups/option-c-3d-cinematic.html — one copy of the choreography,
// two hosts. It coordinates its skip through AtlasIntro above, which is why
// this file still loads first.
//
// (What used to be here was the SVG-viewBox film: one big SVG built from every
// trail's geometry, zoomed by rewriting its viewBox over static rings of Esri
// relief. Retired July 2026. Its story is in git.)

// ===== The Odometer: the key stats as rolling mile-counter reels =====
(function () {
    fetchHikes().then(hikes => {
        const stats = getAtlasStats(hikes);
        const startYear = hikes.reduce((min, h) => Math.min(min, hikeYear(h)), new Date().getUTCFullYear());
        document.getElementById('odo-range').textContent = startYear;
        // viewpoints don't ride the reels — they're not hikes — but they get their line
        const extra = document.getElementById('odo-extra');
        if (extra && stats.totalViewpoints) extra.textContent = ` · plus ${stats.totalViewpoints} scenic viewpoints`;

        const odoDefs = [
            { value: stats.totalHikes, label: 'Hikes' },
            { value: Math.round(stats.totalMiles), label: 'Miles' },
            { value: stats.totalElevation, label: 'Feet Climbed' },
            { value: stats.totalUniqueTrails, label: 'Trails' }
        ];
        const grid = document.getElementById('odo-grid');
        const built = [];
        odoDefs.forEach(d => {
            const stat = document.createElement('div'); stat.className = 'odo-stat';
            const plate = document.createElement('div'); plate.className = 'odo-plate';
            const strips = [];
            for (const ch of d.value.toLocaleString()) {
                if (ch === ',') { const s = document.createElement('span'); s.className = 'odo-sep'; s.textContent = ','; plate.appendChild(s); continue; }
                const reel = document.createElement('span'); reel.className = 'odo-reel';
                const strip = document.createElement('span'); strip.className = 'odo-strip';
                // two 0-9 cycles so the reel spins a full extra turn before landing
                strip.innerHTML = Array.from({ length: 20 }, (_, k) => `<span class="odo-digit">${k % 10}</span>`).join('');
                reel.appendChild(strip); plate.appendChild(reel);
                strips.push({ strip, digit: +ch });
            }
            stat.appendChild(plate);
            const label = document.createElement('div'); label.className = 'odo-label'; label.textContent = d.label;
            stat.appendChild(label); grid.appendChild(stat);
            built.push(strips);
        });

        let rolled = false;
        function roll() {
            if (rolled) return; rolled = true;
            built.forEach(strips => strips.forEach((s, i) => {
                // Measure the digit height instead of assuming it — keeps the
                // reels honest if a media query resizes them.
                const h = s.strip.firstChild.offsetHeight;
                setTimeout(() => {
                    s.strip.classList.add('rolling');
                    s.strip.style.transform = `translateY(${-(10 + s.digit) * h}px)`;
                }, i * 90);
            }));
        }
        new IntersectionObserver((es, ob) => es.forEach(e => { if (e.isIntersecting) { roll(); ob.disconnect(); } }), { threshold: 0.4 })
            .observe(document.getElementById('odo-section'));
    });
})();

// ===== Nav loading-bar intro sequence =====

(function() {
    const loadingBar = document.getElementById('loading-bar');
    const mainNav = document.getElementById('main-nav');
    const loadingText = document.getElementById('loading-text');

    // If we're fast-forwarding, just show the nav immediately.
    if (document.documentElement.classList.contains('intro-fast-forward')) {
        loadingBar.style.display = 'none';
        mainNav.style.display = 'flex';
        mainNav.style.opacity = '1';
        return;
    }

    // Full intro: start with the loading phrases visible and the nav links hidden.
    // (The shared nav component renders them the other way around by default.)
    loadingBar.style.display = 'flex';
    mainNav.style.display = 'none';

    // On skip, drop the loading phrases and reveal the real nav at once.
    AtlasIntro.onSkip(() => {
        loadingBar.style.display = 'none';
        mainNav.style.display = 'flex';
        mainNav.style.opacity = '1';
    });

    // Escape also skips the film (the visible affordance is the hero's button).
    const onEsc = (e) => { if (e.key === 'Escape') AtlasIntro.skip(); };
    document.addEventListener('keydown', onEsc);
    AtlasIntro.onSkip(() => document.removeEventListener('keydown', onEsc));

    const allPhrases = [
        "Calibrating Compass...", "Drawing Maps...", "Lacing Boots...", "Checking Weather...",
        "Packing Snacks...", "Finding North...", "Rendering Trails...", "Filtering Water...",
        "Setting up Camp...", "Watching the Sunset...", "Consulting Topography...", "Identifying Constellations...",
        "Avoiding Poison Oak...", "Listening for Birdsong...", "Following the Switchbacks...", "Taking a Break...",
        "Signing the Trail Log...", "Remembering the View...", "Planning the Next Leg...", "Zipping up the Tent...",
        "Gazing at the Stars...", "Waking up at Dawn...", "Making Cowboy Coffee...", "Breaking Down Camp..."
    ];

    // Fisher-Yates shuffle to randomize the phrases array
    for (let i = allPhrases.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allPhrases[i], allPhrases[j]] = [allPhrases[j], allPhrases[i]];
    }

    // The phrases now run for as long as the film does, cycling rather than
    // showing two and stopping. They are Danny's words and they are the only
    // text on screen while the film plays, so there should be enough of them
    // that nobody sees one twice.
    let phrase = 0;
    loadingText.textContent = allPhrases[0];
    const PHRASE_MS = 5200;
    const cycle = () => {
        loadingText.style.opacity = 0;
        setTimeout(() => {
            phrase = (phrase + 1) % allPhrases.length;
            loadingText.textContent = allPhrases[phrase];
            loadingText.style.opacity = 1;
        }, 500);                                  // matches the CSS fade
        AtlasIntro.schedule(cycle, PHRASE_MS);
    };
    AtlasIntro.schedule(cycle, PHRASE_MS);

    // THE NAV ARRIVES WITH THE FILM, not on a timer of its own. The film calls
    // AtlasIntro.landed() when it comes to rest — at the end of a full watch,
    // or the moment someone skips — and the whole page arrives together.
    AtlasIntro.onLand(() => {
        loadingBar.style.opacity = '0';
        setTimeout(() => {
            loadingBar.style.display = 'none';
            mainNav.style.display = 'flex';
            setTimeout(() => { mainNav.style.opacity = '1'; }, 20);
        }, 500);                                  // matches the CSS fade
    });

    // A backstop, and only that: if the film never reports (WebGL refused, the
    // script failed to load) the nav must still arrive rather than leaving the
    // page with no way out of the hero.
    AtlasIntro.schedule(() => AtlasIntro.landed(), 60000);

})();
