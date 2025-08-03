/**
 * This is a shared script used across all pages of the site.
 * Its primary purposes are:
 * 1. To find the most recently completed hike and dynamically update the 'Latest Hike' link.
 * 2. To highlight the current page in the navigation bar.
 * 3. To power the hero image slideshow on the credits page.
 */
document.addEventListener('DOMContentLoaded', () => {

    // --- Update "Latest Hike" Link ---
    const latestHikeLink = document.getElementById('latest-hike-link');
    if (latestHikeLink) {
        fetch('data/hikes.json')
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return response.json();
            })
            .then(hikes => {
                if (hikes.length === 0) {
                    latestHikeLink.style.display = 'none';
                    return;
                }
                const mostRecentHike = [...hikes].sort((a, b) => new Date(b.date_completed) - new Date(a.date_completed))[0];
                if (mostRecentHike && mostRecentHike.trail_id) {
                    latestHikeLink.href = `hike.html?id=${mostRecentHike.trail_id}`;
                }
            })
            .catch(error => {
                console.error('Error updating latest hike link:', error);
                if (latestHikeLink) latestHikeLink.style.display = 'none';
            });
    }

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