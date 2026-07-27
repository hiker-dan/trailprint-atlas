/**
 * This is a shared script used across all pages of the site.
 * Its purposes are:
 * 1. To highlight the current page in the navigation bar.
 * 2. To power the hero image slideshow on the credits page.
 *
 * It used to also point a "Logbook" nav link at the newest hike. That link was
 * removed in July 2026 — a hike is reached through the land, not by jumping
 * straight to whichever one happens to be most recent — so the lookup went
 * with it, and this script no longer needs the hike data at all.
 */
document.addEventListener('DOMContentLoaded', () => {

    // --- Active Navigation Link Highlighting ---
    const navLinks = document.querySelectorAll('nav a');
    const currentPage = window.location.pathname.split('/').pop();

    navLinks.forEach(link => {
        const linkPage = link.getAttribute('href').split('/').pop();
        if (linkPage === currentPage) {
            link.style.textDecoration = 'underline'; // Add a style to indicate the active page
            link.style.fontWeight = 'bolder';
        }
    });

    // --- Hero Image Slideshow for Credits Page ---
    if (currentPage === 'credits.html') {
        const images = document.querySelectorAll('.hero-image');
        if (images.length > 1) {
            let currentIndex = 0;
            setInterval(() => {
                images[currentIndex].classList.remove('active');
                currentIndex = (currentIndex + 1) % images.length;
                images[currentIndex].classList.add('active');
            }, 5000); // Change image every 5 seconds
        }
    }
});