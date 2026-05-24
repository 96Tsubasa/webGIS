# AGENTS.md

## Project Overview

This project is a WebGIS weather visualization system.

Main goal:
- Display weather forecast layers on a web map.
- Support time-series forecast navigation.
- Render animated wind field.
- Show weather information for selected locations.

A different context version is saved as webgis_thoitiet_context_v9.pdf

Current architecture:

GFS Pipeline
    ↓
Processed Weather Data
    ↓
GeoServer (WMS / WCS)
    ↓
Frontend (Leaflet + JS)

Exception: Wind data does not need GeoServer to be served as tiles — the Backend provides wind vector grids (u/v) and the Frontend uses `leaflet-velocity.min.js` to draw wind animation.

---

## Current Features

Implemented:
- Load available forecast timestamps
- Render weather layers from GeoServer
- Time slider navigation
- Weather popup on map click
- Wind animation rendering
- Weather charts

Recently completed:
- Wind animation appears correctly
- Wind vector direction issue (v-axis inversion) has been fixed
- Temperature and precipitation data are now separated by timestamp
- Temperature → line chart
- Precipitation → bar chart
- Wind visualization remains animation-based (no dedicated chart)

Planned:
- Improve UI/UX
- Optimize rendering performance
- Finalize graduation thesis demo

---

## Project Structure

Frontend:

index.html
- Main UI layout

main.js
Responsibilities:
- App bootstrap
- Map initialization
- Layer switching
- Timeline control
- Weather rendering
- Event handling
- Chart rendering
- Wind animation orchestration

Frontend tech highlights:
- Uses `Leaflet` for the map (not OpenLayers).
- Uses `leaflet-velocity.min.js` for wind animation and `Chart.js` for charts.

<!-- moved: wind-field.js responsibilities are implemented server-side in backend/routes/wind-field.js -->

Backend / Pipeline:

gfsPipeline.js
Responsibilities:
- Fetch latest GFS cycle
- Process weather files
- Generate outputs
- Update GeoServer resources

wind-field.js (backend/routes/wind-field.js)
Responsibilities:
- Read GeoTIFF files for wind components (u/v), reshape into 2D grids and return JSON payload
- Provide caching for wind field responses (TTL ~10 minutes, bounded cache entries)
- Frontend consumes this endpoint to render animated wind using `leaflet-velocity`

Context:

webgis_thoitiet_context_v9.pdf
- Project history
- Design decisions
- Progress tracking

Docker & Runtime notes:

- `docker-compose.yml` defines services `backend` (built from `./backend`) and `geoserver` (image `docker.osgeo.org/geoserver:2.28.0`).
- Port mapping: backend -> `3000:3000`, geoserver -> `8080:8080`.
- Data volume: `./backend/data` is mounted into both containers at `/data` so GeoServer can read generated mosaics and the backend can write ingestion outputs.
- `backend/Dockerfile` installs `gdal-bin` and the pipeline uses `gdal_translate` to convert GRIB2 → GeoTIFF.
- Runtime file: `backend/data/latest_cycle.json` is produced by the ingestion pipeline at runtime (not included in repo by default).
- Note: `backend/server.js` listens on port `3000`, but `backend/Dockerfile` currently contains `EXPOSE 5000` — consider aligning to `EXPOSE 3000` or update the server port.
- Wind field caching: the backend `wind-field` route implements an in-memory cache (TTL ~10 minutes, max entries) to reduce repeated GeoTIFF reads.

---

## Important Engineering Rules

### Rule 1 — Minimize architectural changes

Do NOT rewrite large modules unless requested.

Prefer:
- Small patches
- Isolated fixes
- Preserve existing flow

Avoid:
- Framework migration
- Massive refactor

---

### Rule 2 — Understand before editing

Before modifying:

1. Read related files
2. Trace call flow
3. Identify dependencies
4. Explain root cause

Do NOT blindly regenerate files.

---

### Rule 3 — Weather data assumptions

Temperature:
- Continuous value
- Use line chart

Precipitation:
- Discrete accumulation
- Use bar chart

Wind:
- Prefer particle animation
- Avoid chart unless requested

---

### Rule 4 — Frontend conventions

Use:
- async/await
- Early return
- Small functions

Avoid:
- Deep nesting
- Global mutable state

Preserve:
- Existing naming
- Existing event flow

---

### Rule 5 — Debug workflow

When fixing bugs:

1. Explain suspected root cause
2. Propose minimal change
3. Show exact code patch
4. Mention affected files
5. Explain validation steps

Do NOT produce full-file rewrites.

---

## Wind Animation Notes

Expected behavior:
- Wind particles move according to wind vectors
- Animation updates with timestamp changes
- No duplicate render loop
- Cleanup previous frame before redraw

Watch for:
- u/v inversion
- coordinate mismatch
- stale animation state
- invalid field dimensions

Debug logs should remain concise.

---

## Chart Rules

Charts are informational only.

Temperature:
- Line chart

Precipitation:
- Bar chart

Wind:
- Optional

Avoid:
- Combining unrelated units
- Overloaded dual-axis charts

---

## Performance Guidelines

Prioritize:

1. Prevent duplicate network requests
2. Reuse cached data
3. Avoid unnecessary redraw
4. Destroy old animation state
5. Lazy render expensive layers

---

## Agent Working Style

When implementing:

First:
- Explain plan

Then:
- Generate code

After:
- Explain why changes work

If uncertain:
- Ask instead of assuming.

Never fabricate APIs or dataset structure.

---

## Definition of Done

Feature is complete only if:

- No console errors
- Works after timestamp switch
- Works after layer switch
- No duplicated listeners
- No obvious performance regression