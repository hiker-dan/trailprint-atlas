/**
 * THE PAGE TURN — the one gesture that carries a visitor between the two
 * leaves of the Trail Crew volume (the Muster Roll and a Service Record).
 *
 * It is a single turn filmed across two documents. The page being left
 * swings a leaf SHUT over itself; the page being arrived at swings the same
 * leaf back OPEN. The navigation fires while the paper lies flat across the
 * screen, so the document swap happens behind it and is never seen. The
 * book turns; it does not blink.
 *
 * Both crew pages load this, which is the point: the gesture is defined
 * once, so the two halves cannot drift apart. Styles live in crew.css.
 *
 * Usage:
 *   bookOpen()                — call on load; swings the leaf open
 *   bookTurnTo(href)          — swings it shut, then navigates
 */

/** The book respects a visitor who has asked the interface to hold still. */
const BOOK_STILL = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Lays the turning leaf across the right-hand page and the scrim across the
 * left, so a page can be arrived at already covered. Called by both halves.
 * @returns {HTMLElement|null} the .crew-book element, or null if absent
 */
function bookDressStage() {
    const book = document.querySelector('.crew-book');
    if (!book || BOOK_STILL) return book;
    const right = book.querySelector('.leaf.r');
    const left = book.querySelector('.leaf.l');
    if (!right || !left) return book;
    if (!right.querySelector('.page-turn')) {
        const turn = document.createElement('div');
        turn.className = 'page-turn';
        right.appendChild(turn);
    }
    if (!left.querySelector('.leaf-scrim')) {
        const scrim = document.createElement('div');
        scrim.className = 'leaf-scrim';
        left.appendChild(scrim);
    }
    return book;
}

/**
 * Arriving: the leaf is already flat across the page, and swings open.
 * Runs on every load of both crew pages — reaching Trail Crew from the nav
 * reads as opening the book, which is exactly what it is.
 */
function bookOpen() {
    const book = bookDressStage();
    if (!book || BOOK_STILL) return;
    // paint one frame with the leaf shut, so the animation has somewhere to
    // start from and the page beneath is never briefly visible
    book.classList.add('pre-turn');
    requestAnimationFrame(() => requestAnimationFrame(() => {
        book.classList.remove('pre-turn');
        book.classList.add('turn-open');
    }));
}

/**
 * Leaving: the leaf swings shut, and the new page is loaded behind it.
 * Navigation fires just before the leaf lands so the arriving document is
 * already painting while the paper still covers the screen.
 * @param {string} href - where the turn leads
 */
function bookTurnTo(href) {
    const book = bookDressStage();
    if (!book || BOOK_STILL) { window.location.href = href; return; }
    book.classList.remove('turn-open');
    book.classList.add('turn-shut');
    // just before the leaf lands, so the arriving document is already
    // painting behind paper that still covers the screen
    setTimeout(() => { window.location.href = href; }, 430);
}

/**
 * Wires every element carrying data-turn-to so a page never has to remember
 * to call the turn by hand. Anything that crosses between the two leaves of
 * the book should be marked up with it rather than a bare href.
 * @param {ParentNode} [root=document] - where to look for them
 */
function bookWireTurns(root = document) {
    root.querySelectorAll('[data-turn-to]').forEach(el => {
        if (el.dataset.turnWired) return;
        el.dataset.turnWired = '1';
        el.addEventListener('click', (e) => {
            // let a modified click open a real tab, as any link should
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            bookTurnTo(el.dataset.turnTo);
        });
    });
}
