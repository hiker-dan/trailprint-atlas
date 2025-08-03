# GEMINI AGENT INSTRUCTIONS FOR TRAILPRINT ATLAS

**Version 2.0**

This document is the definitive guide for the Gemini agent's collaboration on the Trailprint Atlas project. It is the "north star," ensuring all development aligns with the project's philosophy, technical standards, and long-term vision. As my dedicated coding partner, your strict adherence to these instructions is paramount.

## 1. Guiding Philosophy & Project Vision

**Core Mission:** Trailprint Atlas is more than a website; it's a living digital memoir of Daniel Sotelo Reiner's personal journey through nature. Its purpose is to beautifully and intuitively chronicle his hiking, backpacking, and travel experiences. It's a tool for memory, a canvas for data storytelling, and a testament to the transformative power of the outdoors.

**Design Principles:**
*   **Data as Narrative:** Every data point tells a story. We don't just show numbers; we visualize them in a way that conveys the feeling of the experience. The timeline on the homepage isn't just a list; it's a journey through time.
*   **Visual First:** The aesthetic should be clean, inspiring, and map-centric. We use real cartographic elements, natural color palettes, and high-quality icons to create an immersive experience.
*   **Simplicity & Power:** The project is intentionally built with vanilla HTML, CSS, and JavaScript. This choice emphasizes craftsmanship and a deep understanding of the web's core technologies. It's about doing more with less and avoiding framework bloat.
*   **Personal & Authentic:** This is not a generic hiking app. It's Daniel's personal atlas. The tone, the stories, and the chosen data points should always reflect his unique perspective and voice.

## 2. Technical Architecture & Conventions

*   **Core Stack:** HTML5, CSS3, JavaScript (ES6+).
*   **Key Libraries:** None. We are committed to a vanilla JS approach.
*   **Data Source of Truth:**
    *   `data/hikes.json`: This is the heart of the Atlas. It is the **single, immutable source of truth** for all hike metadata. No hike data should ever be hardcoded elsewhere.
    *   `data/trails/`: Contains raw GPX files, one for each hike, used for rendering trail lines on maps.
*   **File Structure:**
    *   `index.html`: The landing page, featuring the interactive timeline and key statistics.
    *   `map.html`: The global, interactive map view of all hikes.
    *   `hike.html`: The detailed template for a single hike.
    *   `scripts/`: All JavaScript logic is modularized here.
        *   `nav-updater.js`: Manages navigation consistency.
        *   `trail-renderer.js`: Powers the homepage timeline.
        *   `map.js`: Powers the main map page.
        *   `hike-detail.js`: Populates the `hike.html` page.

### Critical Development Rules:

1.  **The `hikes.json` Golden Rule:** Before implementing any new feature that requires new information about a hike (e.g., park type, accolades), the **first step is always** to update the `hikes.json` schema. Define the new field, then populate it for existing and future hikes.
2.  **Local Development Server:** To work on this project, you **must** use a local server to avoid browser security (CORS) errors when fetching local files (`.json`, `.gpx`). The user prefers using the **"Live Server"** extension in their code editor, which handles this automatically.
3.  **Code Style:**
    *   **JavaScript:** Clean, readable, modern ES6+. Use `const` by default, `let` when mutation is necessary. Employ `async/await` for all fetch operations. Comment generously, explaining the *why*, not the *what*.
    *   **HTML:** Semantic and accessible. Use descriptive IDs and classes.
    *   **CSS:** Maintain a clear, organized stylesheet.

## 3. The Development Roadmap: Our To-Do List

This is the official plan. We will tackle these features methodically.

### Phase 1: UI/UX Refinement & Visual Polish

*   [ ] **Homepage State Stats:** The current expanding panel is awkward. Redesign this into a static, visually appealing grid or flexbox layout that displays state icons and their hike counts without shifting page content.
*   [ ] **Homepage Hike Dot Animation:** The current fade-in is too abrupt. Refine the CSS animation to be more gradual and staggered, giving a sense of the timeline building itself.
*   [ ] **Homepage Title Placement:** The "Trailprint Atlas" title currently risks obscuring timeline dots. Relocate it to a more prominent, non-interfering position.
*   [ ] **General Visual Overhaul:** Conduct a holistic visual refresh of the homepage and map page. This includes sourcing or designing new, more professional "Atlas Achievement" icons.
*   [ ] **Personal Welcome Message:** Integrate a short, impactful welcome message from Daniel on the homepage, right below the key stats, to add a personal touch.
*   [ ] **Credits & Attribution:** Create a `credits.html` page, link it in the footer, and meticulously credit all third-party assets (icons, etc.).

### Phase 2: Major Feature Expansion

*   [ ] **"Park Medallions" Collection:**
    *   **Concept:** Create a visually stunning "trophy case" or "gym badge" collection for parks visited.
    *   **Implementation:** This could be a new page (`achievements.html`) or a major section on the homepage.
    *   **Data Prerequisite:** Update `hikes.json` to include `parkType` ("National Park", "State Park", "National Forest") and `parkName` for every hike.
    *   **Asset Sourcing:** Find and use official (or high-quality vector) logos for each park entity to create the medallions.
*   [ ] **Hike-Specific Medallions:**
    *   **Concept:** Award special "medallions" to individual hikes on their detail pages (`hike.html`) for significant achievements.
    *   **Examples:** "First Backpacking Trip," "First Hike in [State]," "Highest Summit," "Personal Best Distance."
    *   **Data Prerequisite:** Add a `notableAchievements` array to the `hikes.json` schema (e.g., `notableAchievements: ["First Backpacking Trip"]`).
*   [ ] **In-Depth Data Analysis Page:**
    *   Create a `data.html` page dedicated to deeper data exploration.
    *   Visualize metrics like hikes per year, elevation vs. distance scatter plots, mileage by state, etc.
*   [ ] **Gear Catalog:**
    *   Create a `gear.html` page.
    *   Catalog current gear, "favorite" items, and, importantly, "firsts" (e.g., first real hiking boots, first tent). This adds to the personal history aspect of the project.

### Phase 3: Advanced Features & Security

*   [ ] **Photo Gallery Access Control:**
    *   **Goal:** Add a layer of privacy for personal photos.
    *   **Implementation:** Before loading the photo gallery on a hike page, prompt the user for a simple, hardcoded password. This is a privacy feature, not a full user authentication system.

This document is our contract. Let's build something amazing.