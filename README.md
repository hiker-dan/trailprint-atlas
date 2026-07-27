# The Trailprint Atlas

**A living journal of one hiker's life outdoors** — every trail, every summit, every repeat
lap of the local loop, mapped and remembered.

🥾 **Live site:** [hiker-dan.github.io/trailprint-atlas](https://hiker-dan.github.io/trailprint-atlas/)

This is a personal archive built for friends and family, not a hiking app. It chronicles
71 hikes (and counting) across the United States since 2022: where they went, who came
along, what the weather did that day, and — increasingly — what it felt like to be there.

## What's inside

- **Home** — an animated map of every trailprint, headline stats, a state-by-state map,
  and the seasonal rhythm of a year on the trail.
- **Interactive Map** — every GPX track rendered together; filter by year, type,
  difficulty, and company. Repeat hikes leave "ghost trail" halos.
- **Logbook** — a detail page for each hike, reached through the map (or a trip chapter): the route, photos, trail notes, and a
  historical almanac (that day's actual sunrise, sunset, and weather).
- **Achievements** — personal records: longest hike, biggest climb, highest summit.
- **The Overlook** — credits and, soon, the story of why this exists.

## How it's built

Deliberately simple, so it can last for decades:

- Static HTML/CSS/vanilla JS — no framework, no build step
- [Leaflet](https://leafletjs.com) for maps, with GPX tracks as the archival source of truth
- [Cloudinary](https://cloudinary.com) for photo hosting and resizing
- [Open-Meteo](https://open-meteo.com) for historical weather
- [GitHub Pages](https://pages.github.com) for hosting

All hike data lives in a single file — [`data/hikes.json`](data/hikes.json) — and every
page derives from it.

## Running it locally

No install, no dependencies. Clone the repo and serve it over HTTP (fetching local JSON/GPX
doesn't work from `file://`):

```bash
git clone https://github.com/hiker-dan/trailprint-atlas.git
cd trailprint-atlas
python3 -m http.server 8000   # or use the VS Code "Live Server" extension
```

Then open `http://localhost:8000`.

## Project documents

- [CLAUDE.md](CLAUDE.md) — the working guide: stack, data schema, conventions
- [docs/STATE_OF_THE_ATLAS.md](docs/STATE_OF_THE_ATLAS.md) — the audit & roadmap current work follows
- [docs/](docs/) — historical documents, including the original PRD

Asset and icon credits live on [The Overlook](https://hiker-dan.github.io/trailprint-atlas/credits.html).
