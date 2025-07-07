# hiker-dan.github.io
Building 'The Trailprint Atlas' a living journal of my hikes.

🏞️ The Trailprint Atlas – PRD v1.4

📌 tl;dr
The Trailprint Atlas is a personal, visual record of every trail you've ever hiked — past and future. It brings together structured data (mileage, elevation, date, region), emotional storytelling (descriptions, photos), and geospatial interaction (map with GPX-based trails) into a living archive of your hiking life.
The site will be:
Fast and responsive, hosted for free on GitHub Pages
Built for solo management but public viewing
Map-driven, with dynamic trail styling and detail filtering
Expandable over time with new hikes and data layers

🎯 Goals
Business / Personal Goals
Learn web development by building something personally meaningful
Host your entire hiking history in a visual, structured, emotional way
Keep the project maintainable and scalable for years to come
Protect editing access to yourself while keeping the site public to explore
User Goals
Explore hikes visually on a map
Filter hikes by metadata (mileage, difficulty, region, hiked with, etc.)
Read personal notes and see photos tied to each trip
Add new hikes quickly as you complete them
Non-Goals
No user accounts or real-time interaction
No mobile app (yet) — focus is on desktop browser MVP
No trail recommendations or scraped data — everything is manual input

👤 User Stories
As a hiker, I want to see all my trails on a map so I can visually retrace where I’ve been
As a storyteller, I want each hike to include photos and notes about my experience
As a data enthusiast, I want to filter and visualize hikes by type, mileage, region, etc.
As a solo builder, I want a fast and simple way to add hikes without coding each time
As a sharer, I want friends and family to browse my hiking life easily, but not edit it

📚 Full Data Model
This model reflects every field from your spreadsheet, plus some enhancements.
Field
Description
trail_name
Name of the trail
date_completed
Date of hike (YYYY-MM-DD)
location
Specific park, forest, or trail system
region
State or geographic region
primary_geography
Ecosystem type (e.g., Desert, Mountain) — TBD for standardization
miles
Total trail distance in miles
elevation_gain
Elevation gain in feet
summit_trail
Boolean: was this a summit-focused trail?
summit_elevation
Summit elevation in feet (if applicable)
difficulty
Easy, Moderate, Hard
hike_type
Day Hike, Backpacking, Camping, etc.
hiked_with
Solo, Friends, Partner, Group, etc.
flora
Notable native flora of the trail area
fauna
Notable native fauna of the trail area
description
2–4 sentence trail summary (not personal)
notes
Optional personal highlights/reflections
trip_tag
Identifier for group trips (e.g. 2023_JTree_Thanksgiving)
all_trails_url
Link to AllTrails route
official_trail_url
Link to official trail website (e.g. NPS)
gpx_file
GPX or GeoJSON file path
images
Array of image paths or links
trail_id
(Optional) Unique identifier for shared trail grouping


🧠 Map Interaction Model
Single Map Strategy (MVP)
Map displays all trails on a Leaflet.js base
Trails shown using polylines generated from GPX files
Icons at start points based on hike_type (backpack, tent, etc.)
If summit_trail: true, extract peak from GPX and place 🗻 icon with summit elevation
Map is filterable by year, type, elevation gain, difficulty, etc.
Popup Design
Clicking a trail opens a popup that includes:
Trail name
Distance, elevation gain
Location, region
Hike type icon
Number of times hiked + clickable list of dates
Link to hike detail page

📖 Narrative
This isn’t just a map. It’s a memory trail.
Each hike in this atlas is a physical reminder of something you did that mattered. Some were grinds. Others were spiritual. A few were just plain fun. But together? They form something real. A shape. A signature. A trailprint.
With each mile, you weren’t just crossing distance. You were becoming someone new.
The Trailprint Atlas is your living archive — a way to visualize growth, remember the quiet moments, and share the journey in a way that’s intimate, beautiful, and uniquely yours.
This is personal topography. And it's always in progress.

🧭 UX Flow
Homepage
Project intro and stats
Preview map or region highlights
“Explore the Atlas” CTA
Map View
All hikes visualized
Custom icons at start points
Colored trails (by year or type)
Popup preview with metadata + links
Hike Detail Page
Trail metadata and description
Flora/Fauna highlights
Photo gallery
GPX trail map with summit markers
External links (AllTrails + official site)
Dashboard
Filters: year, type, region, difficulty
Charts: mileage over time, hikes per state
Full sortable table of hikes
Trip Tag View
Grouped hikes from shared trip
Map overlays and timeline-style detail
Add a Hike (Local Only)
Simple form or JSON template
Save image + GPX file
Push to GitHub

✅ Success Metrics
100% of planned metadata is shown in the UI
Trail lines are correctly styled and summit markers placed
Popup previews show all relevant info + link to all hikes of that trail
Dashboard and filters work entirely client-side
New hikes can be added in <5 minutes via local entry

🛠️ Technical Considerations
Frontend: HTML / JS / CSS (optionally React)
Mapping: Leaflet.js
Charting: Chart.js or D3
Data: hikes.json for metadata, trails/ for GPX, images/ for photos
Hosting: GitHub Pages
Optional: Use GPX metadata to autofill trail_name, elevation, miles, etc.

⏳ Milestones
Setup
GitHub repo + GitHub Pages
Leaflet.js base map + tiles
Data Integration
Convert spreadsheet → hikes.json
Organize images + GPX files
Map Rendering
Show 10–20 hikes with icons and summit points
Hike Pages
Static pages with full metadata + visuals
Dashboard
Charts + filters for metadata
Trip Tags
View grouped hikes with shared tags
Mobile Polish (Phase 2)

🧠 Future Features
Region-based submaps
Animated hike progression over time
Elevation profile visualizations
Map overlays for biomes or parks