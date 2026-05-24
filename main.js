const map = L.map("map").setView([16.311, 106.062], 6);
let weatherLayer = null;
let windLayer = null;
let timestamps = [];
let currentIndex = 0;
let isPlaying = false;
let playbackInterval = null;
let renderTimeout = null;
const RENDER_DEBOUNCE_MS = 600; // wait after changes before rendering
const PLAYBACK_INTERVAL_MS = 3000; // slower playback to reduce requests
let currentVariable = "temperature";
let selectedPoint = null;
let selectedPointMarker = null;
let windOn = false;

// Chart states
let temperatureChart = null;

let precipitationChart = null;

const VARIABLE_CONFIG = {
  temperature: {
    layer: "weather:temperature",
    opacity: 0.55,
  },

  precipitation: {
    layer: "weather:precipitation",
    opacity: 0.72,
  },
};

const slider = document.getElementById("time-slider");
const playBtn = document.getElementById("play-btn");
const sliderTicksEl = document.getElementById("slider-ticks");
const sliderProgressEl = document.getElementById("slider-progress");
const sliderHandleEl = document.getElementById("slider-handle");
const sliderHandleLabel = document.getElementById("slider-time-label");
const variableSelect = document.getElementById("weather-variable");

variableSelect.addEventListener("change", async (e) => {
  currentVariable = e.target.value;

  await loadTimestamps();
  updateLegend();
});

// Helper functions
function formatTimestamp(ts) {
  const year = ts.slice(0, 4);
  const month = ts.slice(4, 6);
  const day = ts.slice(6, 8);

  const hour = ts.slice(9, 11);

  return `${hour}:00 ${day}/${month}/${year}`;
}

function parseTimestampToDate(ts) {
  return new Date(
    `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}Z`,
  );
}

function getIsoTime(timestamp) {
  const isoTime =
    `${timestamp.slice(0, 4)}-` +
    `${timestamp.slice(4, 6)}-` +
    `${timestamp.slice(6, 8)}T` +
    `${timestamp.slice(9, 11)}:` +
    `${timestamp.slice(11, 13)}:` +
    `${timestamp.slice(13, 15)}.000Z`;
  return isoTime;
}

// Base layers
const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap",
});

const satellite = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { attribution: "Tiles © Esri" },
);

// Add default
satellite.addTo(map);

// Control
L.control
  .layers({
    "Đường phố": osm,
    "Vệ tinh": satellite,
  })
  .addTo(map);

const selectedPointIcon = L.icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",

  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",

  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// const marker = L.marker([21.0285, 105.8542]).addTo(map).bindPopup("<b>Hà Nội</b><br/>Thủ đô Việt Nam").openPopup();

function renderWeatherLayer(timestamp) {
  const isoTime = getIsoTime(timestamp);

  // replace weather WMS layer for the selected variable
  if (weatherLayer) {
    try {
      map.removeLayer(weatherLayer);
    } catch (e) {}
    weatherLayer = null;
  }

  weatherLayer = L.tileLayer.wms(
    "http://localhost:8080/geoserver/weather/wms",

    {
      layers: VARIABLE_CONFIG[currentVariable].layer,

      format: "image/png",

      transparent: true,

      opacity: VARIABLE_CONFIG[currentVariable].opacity,

      time: isoTime,

      zIndex: 1000,
    },
  );

  weatherLayer.addTo(map);

  slider.value = currentIndex;

  // Show chart loading overlays when timestamp changes
  function toggleChartLoading(show) {
    const overlays = document.querySelectorAll(".chart-loading");
    overlays.forEach((ov) => {
      ov.style.display = show ? "flex" : "none";
    });
  }

  toggleChartLoading(true);

  // update wind animation for this timestamp if enabled
  if (windOn) {
    renderWindAnimation(timestamp);
  }

  if (selectedPoint) {
    updateInfoPanel();
  }
}

// Load timestamps from backend
async function loadTimestamps() {
  try {
    const queryVariable = currentVariable;

    const res = await fetch(
      `http://localhost:3000/api/timestamps?variable=${queryVariable}`,
    );

    const data = await res.json();

    timestamps = data;

    slider.max = timestamps.length - 1;

    if (timestamps.length === 0) {
      console.log("No weather layers");

      return;
    }

    const now = new Date();

    let nearestIndex = 0;
    let smallestDiff = Infinity;

    timestamps.forEach((t, index) => {
      const ts = t.timestamp;

      const date = new Date(
        `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}Z`,
      );

      const diff = Math.abs(date - now);

      if (diff < smallestDiff) {
        smallestDiff = diff;
        nearestIndex = index;
      }
    });

    currentIndex = nearestIndex;

    renderWeatherLayer(timestamps[currentIndex].timestamp);
  } catch (err) {
    console.error(err);
  }
}

// Load timestamps and then set a default selected point for the info panel
loadTimestamps().then(() => {
  updateLegend();

  // default location (Hà Nội) — used to populate info panel on load
  const defaultPoint = L.latLng(21.0285, 105.8542);

  selectedPoint = defaultPoint;

  updateSelectedPointMarker(defaultPoint);

  // Pan map to default point so user sees the marker
  try {
    map.panTo(defaultPoint);
  } catch (e) {}

  updateInfoPanel();
  // render visual ticks when timestamps are ready
  renderTicks();
  updateVisualProgress();
});

slider.addEventListener("input", () => {
  currentIndex = parseInt(slider.value);
  if (slider) slider.value = currentIndex;
  updateVisualProgress();
  scheduleRenderForIndex(currentIndex);
});

playBtn.addEventListener("click", () => {
  isPlaying = !isPlaying;

  const playIcon = document.getElementById("play-icon");
  const pauseIcon = document.getElementById("pause-icon");

  if (isPlaying) {
    if (playIcon) playIcon.style.display = "none";
    if (pauseIcon) pauseIcon.style.display = "block";

    startPlayback();
  } else {
    if (playIcon) playIcon.style.display = "block";
    if (pauseIcon) pauseIcon.style.display = "none";

    stopPlayback();
  }
});

// Render daily ticks between first and last timestamp
function renderTicks() {
  if (!sliderTicksEl || timestamps.length === 0) return;

  sliderTicksEl.innerHTML = "";

  const first = parseTimestampToDate(timestamps[0].timestamp);
  const last = parseTimestampToDate(timestamps[timestamps.length - 1].timestamp);

  const firstMs = first.getTime();
  const lastMs = last.getTime();
  if (lastMs <= firstMs) {
    // fallback: single tick
    const tick = document.createElement("div");
    tick.className = "tick";
    const dd = String(first.getUTCDate()).padStart(2, "0");
    const mm = String(first.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = first.getUTCFullYear();
    tick.style.left = `0%`;
    tick.innerText = `${dd}-${mm}-${yyyy}`;
    sliderTicksEl.appendChild(tick);
    return;
  }

  // start at midnight UTC of first day
  let dMs = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate());
  const endMs = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());

  while (dMs <= endMs) {
    let pct = ((dMs - firstMs) / (lastMs - firstMs)) * 100;
    // clamp pct so ticks don't render outside the track when first timestamp is not midnight
    pct = Math.max(0, Math.min(100, pct));

    const tick = document.createElement("div");
    tick.className = "tick";
    const d = new Date(dMs);
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = d.getUTCFullYear();
    tick.style.left = `${pct}%`;
    tick.innerText = `${dd}-${mm}-${yyyy}`;

    sliderTicksEl.appendChild(tick);

    dMs += 24 * 60 * 60 * 1000; // next day
  }
}

function updateVisualProgress() {
  if (!sliderProgressEl || !sliderHandleEl) return;

  const max = Math.max(1, parseInt(slider.max) || 1);
  const pct = (currentIndex / max) * 100;

  sliderProgressEl.style.width = `${pct}%`;
  sliderHandleEl.style.left = `${pct}%`;

  const ts = timestamps[currentIndex]?.timestamp;
  const labelText = ts ? formatTimestamp(ts) : "Chưa có dữ liệu";
  if (sliderHandleLabel) sliderHandleLabel.innerText = labelText;

  // mark active tick if present
  if (sliderTicksEl) {
    const ticks = sliderTicksEl.querySelectorAll('.tick');
    ticks.forEach((t) => t.classList.remove('active'));

    // find tick with same date
    const curDate = parseTimestampToDate(ts);
    if (curDate) {
      const dd = String(curDate.getUTCDate()).padStart(2, "0");
      const mm = String(curDate.getUTCMonth() + 1).padStart(2, "0");
      const yyyy = curDate.getUTCFullYear();
      const targetText = `${dd}-${mm}-${yyyy}`;
      const tick = Array.from(sliderTicksEl.querySelectorAll('.tick')).find(x => x.innerText === targetText);
      if (tick) tick.classList.add('active');
    }
  }
}

function nextFrame() {
  if (timestamps.length === 0) return;

  currentIndex++;

  if (currentIndex >= timestamps.length) {
    currentIndex = 0;
  }

  // visually update and schedule render
  if (slider) slider.value = currentIndex;
  updateVisualProgress();
  scheduleRenderForIndex(currentIndex);
}

function startPlayback() {
  playbackInterval = setInterval(() => {
    nextFrame();
  }, PLAYBACK_INTERVAL_MS);
}

function stopPlayback() {
  clearInterval(playbackInterval);
}

// Schedule rendering with debounce to avoid spamming GeoServer / APIs
function scheduleRenderForIndex(index, immediate = false) {
  if (!timestamps || timestamps.length === 0) return;

  // update current index and visuals immediately
  currentIndex = index;
  if (slider) slider.value = currentIndex;
  updateVisualProgress();

  if (renderTimeout) clearTimeout(renderTimeout);

  if (immediate) {
    renderWeatherLayer(timestamps[currentIndex].timestamp);
    return;
  }

  renderTimeout = setTimeout(() => {
    // call actual render
    renderWeatherLayer(timestamps[currentIndex].timestamp);
  }, RENDER_DEBOUNCE_MS);
}

// Make the visual slider draggable/clickable
function enableSliderDrag() {
  const visual = document.getElementById('slider-visual');
  if (!visual) return;

  let dragging = false;

  const track = visual.querySelector('.slider-track') || visual;

  function posToIndex(clientX) {
    const rect = track.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const pct = x / rect.width;
    const idx = Math.round(pct * (timestamps.length - 1));
    return idx;
  }

  function onDown(e) {
    e.preventDefault();
    dragging = true;
    document.body.style.userSelect = 'none';
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const idx = posToIndex(clientX);
    currentIndex = idx;
    if (slider) slider.value = currentIndex;
    updateVisualProgress();
    scheduleRenderForIndex(idx);
  }

  function onMove(e) {
    if (!dragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const idx = posToIndex(clientX);
    currentIndex = idx;
    if (slider) slider.value = currentIndex;
    updateVisualProgress();
    scheduleRenderForIndex(idx);
  }

  function onUp(e) {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    // final render ensured by scheduleRenderForIndex debounce
  }

  visual.addEventListener('mousedown', onDown);
  visual.addEventListener('touchstart', onDown, {passive:true});
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, {passive:true});
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchend', onUp);
}

// initialize drag behavior after timestamps load
enableSliderDrag();

// AQI Data
// fetch("http://localhost:3000/api/aqi")
//   .then(res => res.json())
//   .then(data => {

//     L.geoJSON({
//       type: "FeatureCollection",
//       features: data.map(item => ({
//         type: "Feature",
//         geometry: {
//           type: "Point",
//           coordinates: [
//             item.longtitude,
//             item.latitude
//           ]
//         },
//         properties: item
//       }))
//     }, {
//       pointToLayer: (feature, latlng) => {
//         return L.circleMarker(latlng, {
//           radius: 8,
//           color: feature.properties.color,
//           fillOpacity: 0.8
//         });
//       },

//       onEachFeature: (feature, layer) => {
//         const p = feature.properties;

//         layer.bindPopup(`
//           <b>${p.name}</b><br>
//           AQI: ${p.aqi} (${p.aqiText})<br>
//           Temp: ${p.temp}°C<br>
//           Humidity: ${p.humid}%
//         `);
//       }

//     }).addTo(map);

//   })
//   .catch(err => console.error(err));

// Update Legend
function updateLegend() {
  const legendImg = document.getElementById("legend-image");
  document.getElementById("legend-image").style.display = "block";

  const layerName = VARIABLE_CONFIG[currentVariable].layer;

  legendImg.src =
    "http://localhost:8080/geoserver/wms?" +
    "REQUEST=GetLegendGraphic" +
    "&VERSION=1.0.0" +
    "&FORMAT=image/png" +
    "&WIDTH=20" +
    "&HEIGHT=20" +
    "&LAYER=" +
    layerName;
}

// Helper Query Layer
async function queryLayer(
  layerName,
  latlng,
  timestamp = timestamps[currentIndex].timestamp,
) {
  const bounds = map.getBounds();

  const bbox = [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth(),
  ].join(",");

  const size = map.getSize();

  const point = map.latLngToContainerPoint(latlng);

  const url =
    `http://localhost:3000/api/feature-info?` +
    `SERVICE=WMS&` +
    `VERSION=1.1.1&` +
    `REQUEST=GetFeatureInfo&` +
    `LAYERS=${layerName}&` +
    `QUERY_LAYERS=${layerName}&` +
    `INFO_FORMAT=text/plain&` +
    `FEATURE_COUNT=1&` +
    `FORMAT=image/png&` +
    `SRS=EPSG:4326&` +
    `WIDTH=${size.x}&` +
    `HEIGHT=${size.y}&` +
    `BBOX=${bbox}&` +
    `X=${Math.round(point.x)}&` +
    `Y=${Math.round(point.y)}` +
    `&TIME=${getIsoTime(timestamp)}`;

  const response = await fetch(url);

  return await response.text();
}

// Wind toggle helper
function setWindEnabled(enabled) {
  windOn = !!enabled;

  if (windOn) {
    if (timestamps.length > 0) {
      renderWindAnimation(timestamps[currentIndex].timestamp);
    }
  } else {
    if (windLayer) {
      try {
        map.removeLayer(windLayer);
      } catch (e) {}
      windLayer = null;
    }
  }
}

// Wire wind toggle input
const windToggleInput = document.getElementById("wind-toggle-input");
if (windToggleInput) {
  windToggleInput.addEventListener("change", (e) => {
    setWindEnabled(e.target.checked);
  });
}

// Update Selected Point Marker
function updateSelectedPointMarker(latlng) {
  if (!selectedPointMarker) {
    selectedPointMarker = L.marker(latlng, {
      icon: selectedPointIcon,
    }).addTo(map);
  } else {
    selectedPointMarker.setLatLng(latlng);
  }
}

// Reverse Geocode helper
async function reverseGeocode(latlng) {
  try {
    const response = await fetch(
      `http://localhost:3000/api/reverse-geocode?lat=${latlng.lat}&lon=${latlng.lng}`,
    );

    const data = await response.json();

    return data.display_name;
  } catch (err) {
    console.error(err);

    return "Không xác định";
  }
}

// Wind direction helper
function directionText(a) {
  if (a < 22.5) return "Bắc";
  if (a < 67.5) return "Đông Bắc";
  if (a < 112.5) return "Đông";
  if (a < 157.5) return "Đông Nam";
  if (a < 202.5) return "Nam";
  if (a < 247.5) return "Tây Nam";
  if (a < 292.5) return "Tây";
  if (a < 337.5) return "Tây Bắc";

  return "Bắc";
}

// Update Info Panel
async function updateInfoPanel() {
  if (!selectedPoint) return;

  // ensure panel is visible when selecting a point
  const infoPanelEl = document.getElementById("info-panel");
  if (infoPanelEl) infoPanelEl.style.display = "block";

  // Change text to "Đang tải..." while fetching data
  const loadingText = "Đang tải...";

  // safe setter to avoid null element errors
  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  }

  setText("location-text", loadingText);
  setText("temperature-text", loadingText);
  setText("time-text", loadingText);
  setText("precipitation-text", loadingText);
  setText("wind-text", loadingText);
  setText("direction-text", loadingText);

  // Fetch data at selected point
  const [tempText, precipText, windUText, windVText, locationName] =
    await Promise.all([
      queryLayer("weather:temperature", selectedPoint),

      queryLayer("weather:precipitation", selectedPoint),

      queryLayer("weather:wind_u", selectedPoint),

      queryLayer("weather:wind_v", selectedPoint),

      reverseGeocode(selectedPoint),
    ]);

  // Process query results
  const tempMatch = tempText.match(/GRAY_INDEX = ([\d.-]+)/);

  const precipMatch = precipText.match(/GRAY_INDEX = ([\d.-]+)/);

  const temperature = tempMatch
    ? parseFloat(tempMatch[1]).toFixed(2)
    : "No data";

  const precipitation = precipMatch
    ? parseFloat(precipMatch[1]).toFixed(2)
    : "No data";

  const windUMatch = windUText.match(/GRAY_INDEX = ([\d.-]+)/);

  const windVMatch = windVText.match(/GRAY_INDEX = ([\d.-]+)/);

  const u = windUMatch ? parseFloat(windUMatch[1]) : 0;

  const v = windVMatch ? parseFloat(windVMatch[1]) : 0;

  const windSpeed = Math.sqrt(u * u + v * v);

  const angle = ((Math.atan2(u, v) * 180) / Math.PI + 360) % 360;

  // Update info panel with fetched data (guarded writes)
  setText("location-text", locationName);

  setText("time-text", formatTimestamp(timestamps[currentIndex].timestamp));

  setText("temperature-text", `${temperature} °C`);

  setText("precipitation-text", `${precipitation} mm`);

  setText("wind-text", `${windSpeed.toFixed(2)} m/s`);

  setText("direction-text", `${directionText(angle)}`);

  loadForecastSeries();
}

// Info Panel Update On Map Click
map.on("click", async (e) => {
  selectedPoint = e.latlng;

  updateSelectedPointMarker(e.latlng);

  updateInfoPanel();
});

// Render wind
async function renderWindAnimation(timestamp) {
  try {
    if (windLayer) {
      map.removeLayer(windLayer);
    }

    const response = await fetch(
      `http://localhost:3000/api/wind-field?time=${getIsoTime(timestamp)}`,
    );

    if (!response.ok) {
      throw new Error(`Wind API error: ${response.status}`);
    }

    const field = await response.json();

    console.log("Wind response:", field);

    if (!field || !field.u || !field.v || !field.width || !field.height) {
      throw new Error("Invalid wind field response");
    }

    const nx = field.width;

    const ny = field.height;

    const [left, bottom, right, top] = field.bbox;

    const dx = (right - left) / (nx - 1);

    const dy = (top - bottom) / (ny - 1);

    windLayer = L.velocityLayer({
      displayValues: false,

      data: [
        {
          header: {
            nx,

            ny,

            lo1: left,

            la1: top,

            dx,

            dy,

            parameterCategory: 2,

            parameterNumber: 2,
          },

          data: field.u.flat(),
        },

        {
          header: {
            nx,

            ny,

            lo1: left,

            la1: top,

            dx,

            dy,

            parameterCategory: 2,

            parameterNumber: 3,
          },

          data: field.v.flat(),
        },
      ],

      velocityScale: 0.005,

      particleAge: 60,

      lineWidth: 2,

      frameRate: 40,

      maxVelocity: 25,
    });

    windLayer.addTo(map);

    console.log("Wind rendered");
  } catch (err) {
    console.error("Wind render failed:", err);
  }
}

async function loadForecastSeries() {
  if (!selectedPoint) return;

  const series = await Promise.all(
    timestamps.map(async ({ timestamp }) => {
      const [temp, rain, wu, wv] = await Promise.all([
        queryLayer("weather:temperature", selectedPoint, timestamp),

        queryLayer("weather:precipitation", selectedPoint, timestamp),
      ]);

      return {
        timestamp,

        temp: parseFloat(temp.match(/GRAY_INDEX = ([\d.-]+)/)?.[1]),

        rain: parseFloat(rain.match(/GRAY_INDEX = ([\d.-]+)/)?.[1]),
      };
    }),
  );

  renderForecastChart({
    labels: series.map((x) => formatTimestamp(x.timestamp)),

    temperature: series.map((x) => x.temp),

    precipitation: series.map((x) => x.rain),
  });
}

function renderForecastChart(data) {
  // TEMP

  if (temperatureChart) {
    temperatureChart.destroy();
  }

  temperatureChart = new Chart(
    document.getElementById("temperature-chart"),

    {
      type: "line",

      data: {
        labels: data.labels,

        datasets: [
          {
            label: "°C",

            data: data.temperature,

            borderColor: "#e74c3c",

            tension: 0.35,
          },
        ],
      },

      options: {
        responsive: true,

        animation: false,
      },
    },
  );

  // RAIN

  if (precipitationChart) {
    precipitationChart.destroy();
  }

  precipitationChart = new Chart(
    document.getElementById("precipitation-chart"),

    {
      type: "bar",

      data: {
        labels: data.labels,

        datasets: [
          {
            label: "mm",

            data: data.precipitation,

            backgroundColor: "#3498db",
          },
        ],
      },

      options: {
        responsive: true,

        animation: false,
      },
    },
  );

  // hide loading overlays after charts rendered
  const overlays = document.querySelectorAll(".chart-loading");
  overlays.forEach((ov) => (ov.style.display = "none"));
}

// Close button for info panel
const closeBtn = document.getElementById("close-info");
if (closeBtn) {
  closeBtn.addEventListener("click", () => {
    const p = document.getElementById("info-panel");
    if (p) p.style.display = "none";
  });
}
