/**
 * This script powers the individual hike detail page (hike.html).
 * It reads a hike ID from the URL, fetches the corresponding data from hikes.json,
 * and dynamically populates the page content.
 */
document.addEventListener('DOMContentLoaded', () => {
    // 1. Get the hike ID from the URL query parameter (e.g., ?id=tta_35)
    const urlParams = new URLSearchParams(window.location.search);
    const hikeId = urlParams.get('id');

    // If no ID is provided in the URL, we can't show a hike.
    if (!hikeId) {
        document.getElementById('hike-title').innerText = 'Hike Not Found';
        document.getElementById('hike-location').innerText = 'Please select a hike from the map to view its details.';
        return;
    }

    // 2. Fetch the main data file
    fetch('data/hikes.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.statusText}`);
            }
            return response.json();
        })
        .then(hikes => {
            // 3. Find the specific hike that matches the ID from the URL
            const hike = hikes.find(h => h.trail_id === hikeId);

            if (hike) {
                // 4. Populate the page with the hike's data
                document.title = `${hike.trail_name} - The Trailprint Atlas`; // Update the browser tab title
                document.getElementById('hike-title').innerText = hike.trail_name;
                document.getElementById('hike-location').innerText = `${hike.location} • ${hike.region}`;
                // More population logic for map, stats, etc., will be added in later steps.
            } else {
                document.getElementById('hike-title').innerText = 'Hike Not Found';
                document.getElementById('hike-location').innerText = `No hike data found for ID: ${hikeId}`;
            }
        })
        .catch(error => {
            console.error('Error fetching hike data:', error);
            document.getElementById('hike-title').innerText = 'Error Loading Data';
            document.getElementById('hike-location').innerText = 'Could not load hike details. Please check the console.';
        });
});