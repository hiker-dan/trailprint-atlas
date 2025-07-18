/**
 * This is a shared script used across all pages of the site.
 * Its purpose is to find the most recently completed hike and dynamically
 * update the 'Latest Hike' link in the main navigation bar.
 */
document.addEventListener('DOMContentLoaded', () => {
    const latestHikeLink = document.getElementById('latest-hike-link');

    // If the link doesn't exist on the page, do nothing.
    if (!latestHikeLink) {
        return;
    }

    fetch('data/hikes.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.statusText}`);
            }
            return response.json();
        })
        .then(hikes => {
            if (hikes.length === 0) {
                latestHikeLink.style.display = 'none';
                return;
            }

            // Sort all hikes by date in descending order to find the most recent one.
            const mostRecentHike = [...hikes].sort((a, b) => new Date(b.date_completed) - new Date(a.date_completed))[0];

            if (mostRecentHike && mostRecentHike.trail_id) {
                latestHikeLink.href = `hike.html?id=${mostRecentHike.trail_id}`;
            }
        })
        .catch(error => {
            console.error('Error updating latest hike link:', error);
            if (latestHikeLink) latestHikeLink.style.display = 'none';
        });
});