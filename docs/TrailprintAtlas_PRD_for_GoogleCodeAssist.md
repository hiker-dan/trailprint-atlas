# The Trailprint Atlas – Developer PRD for Google Code Assist

## 🧠 Context for the Model

I am a non-technical user building this project to learn how to code and publish a personal hiking website. I want you to **help me build it from scratch, step by step**, while **explaining what you're doing in plain English** so I can learn.

Use best coding practices, comment your code, and guide me as if I’m your junior developer learning the ropes.

---

## 🧭 Project Summary

This is a static personal site hosted on GitHub Pages that visualizes my hiking life.

Features include:
- Map with clickable trails (polylines from GPX)
- Detail pages for each hike
- Filtering and statistics
- Visual indicators like icons and summit markers

---

## 🗺️ Technical Specs

- Use **Leaflet.js** for maps
- Store all data in a `hikes.json` file
- Trail paths stored as GPX (or GeoJSON)
- Map polylines color-coded by year or type
- Icons placed based on hike type
- Summit icons placed by parsing GPX for max elevation
- Filters allow client-side filtering of hikes

---

## 📂 Required File Structure

trailprint-atlas/
├── index.html
├── /data/
│ └── hikes.json
│ └── trails/*.gpx
├── /images/
│ └── hike images
├── /scripts/
│ └── map.js, dashboard.js
└── README.md

---

## ✅ Please Help Me With...

1. Scaffold my folders and files
2. Parse a sample `hikes.json` and display hikes
3. Convert and draw a GPX file using Leaflet
4. Add a popup to each trail
5. Create detail pages
6. Help me filter by metadata
7. Help me create a form to add new hikes locally
8. Teach me how to push to GitHub Pages

---

## 🔐 Safety Considerations

- Do not expose any private data
- Do not include forms that write to external services
- Assume all data is added manually via code/git
- Use only free and open tools

---

## 👨‍🏫 Teach Me

Explain:
- Every important step
- Why you’re doing what you're doing
- What the purpose of each file is
- How to safely edit/add/update new content

---

Let’s build this together!