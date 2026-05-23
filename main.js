const map = L.map("map").setView([16.311, 106.062], 6);
let weatherLayer = null;
let windLayer = null;
let timestamps = [];
let currentIndex = 0;
let isPlaying = false;
let playbackInterval = null;
let currentVariable = "temperature";
let selectedPoint = null;
let selectedPointMarker = null;

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
const label = document.getElementById("time-label");
const playBtn = document.getElementById("play-btn");
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

  const isoTime =
    getIsoTime(
      timestamp
    );

  if (
    currentVariable ===
    "wind"
  ) {

    if (
      weatherLayer
    ) {

      map.removeLayer(
        weatherLayer
      );

      weatherLayer =
        null;

    }

    renderWindAnimation(
      timestamp
    );

  }

  else {

    if (
      windLayer
    ) {

      map.removeLayer(
        windLayer
      );

      windLayer =
        null;

    }

    if (
      weatherLayer
    ) {

      map.removeLayer(
        weatherLayer
      );

    }

    weatherLayer =
      L.tileLayer.wms(

        "http://localhost:8080/geoserver/weather/wms",

        {

          layers:
            VARIABLE_CONFIG[
              currentVariable
            ].layer,

          format:
            "image/png",

          transparent:
            true,

          opacity:
            VARIABLE_CONFIG[
              currentVariable
            ].opacity,

          time:
            isoTime,

          zIndex:
            1000

        }

      );

    weatherLayer.addTo(
      map
    );

  }

  slider.value =
    currentIndex;

  label.innerText =
    formatTimestamp(
      timestamp
    );

  if (
    selectedPoint
  ) {

    updateInfoPanel();

  }

}

// Load timestamps from backend
async function loadTimestamps() {
  try {
    const queryVariable =
      currentVariable === "wind" ? "wind_u" : currentVariable;

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

loadTimestamps();
updateLegend();

slider.addEventListener("input", () => {
  currentIndex = parseInt(slider.value);

  renderWeatherLayer(timestamps[currentIndex].timestamp);
});

playBtn.addEventListener("click", () => {
  isPlaying = !isPlaying;

  if (isPlaying) {
    playBtn.innerText = "Pause";

    startPlayback();
  } else {
    playBtn.innerText = "Play";

    stopPlayback();
  }
});

function nextFrame() {
  if (timestamps.length === 0) return;

  currentIndex++;

  if (currentIndex >= timestamps.length) {
    currentIndex = 0;
  }

  renderWeatherLayer(timestamps[currentIndex].timestamp);
}

function startPlayback() {
  playbackInterval = setInterval(() => {
    nextFrame();
  }, 2000);
}

function stopPlayback() {
  clearInterval(playbackInterval);
}

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

  if (currentVariable === "wind") {
    document.getElementById("legend-image").style.display = "none";

    return;
  }

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
async function queryLayer(layerName, latlng) {
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
    `&TIME=${getIsoTime(timestamps[currentIndex].timestamp)}`;

  const response = await fetch(url);

  return await response.text();
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

  // Change text to "Đang tải..." while fetching data
  const loadingText = "Đang tải...";

  document.getElementById("location-text").innerText = loadingText;

  document.getElementById("temperature-text").innerText = loadingText;

  document.getElementById("time-text").innerText = loadingText;

  document.getElementById("precipitation-text").innerText = loadingText;

  document.getElementById("wind-u-text").innerText = loadingText;

  document.getElementById("wind-v-text").innerText = loadingText;

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

  document.getElementById("coordinate-text").innerText =
    `${selectedPoint.lat.toFixed(4)}, ${selectedPoint.lng.toFixed(4)}`;

  // Update info panel with fetched data
  document.getElementById("location-text").innerText = locationName;

  document.getElementById("time-text").innerText = formatTimestamp(
    timestamps[currentIndex].timestamp,
  );

  document.getElementById("temperature-text").innerText = `${temperature} °C`;

  document.getElementById("precipitation-text").innerText =
    `${precipitation} mm`;

  document.getElementById("wind-u-text").innerText = `${u} m/s`;

  document.getElementById("wind-v-text").innerText = `${v} m/s`;

  document.getElementById("wind-text").innerText =
    `${windSpeed.toFixed(2)} m/s`;

  document.getElementById("direction-text").innerText =
    `${directionText(angle)}`;
}

// Info Panel Update On Map Click
map.on("click", async (e) => {
  selectedPoint = e.latlng;

  updateSelectedPointMarker(e.latlng);

  updateInfoPanel();
});

// Render wind
async function renderWindAnimation(timestamp) {
  if (windLayer) {
    map.removeLayer(windLayer);
  }

  const response = await fetch(
    `http://localhost:3000/api/wind-field?time=${getIsoTime(timestamp)}`,
  );

  console.log("Response:", response);

  const field = await response.json();

  windLayer = L.velocityLayer({
    displayValues: false,

    data: [
      {
        header: {
          nx: field.header.nx,

          ny: field.header.ny,

          lo1: field.header.lo1,

          la1: field.header.la1,

          dx: field.header.dx,

          dy: field.header.dy,

          parameterCategory: 2,

          parameterNumber: 2,
        },

        data: field.u,
      },

      {
        header: {
          nx: field.header.nx,

          ny: field.header.ny,

          lo1: field.header.lo1,

          la1: field.header.la1,

          dx: field.header.dx,

          dy: field.header.dy,

          parameterCategory: 2,

          parameterNumber: 3,
        },

        data: field.v,
      },
    ],

    velocityScale: 0.005,

    particleAge: 60,

    lineWidth: 2,

    frameRate: 30,

    maxVelocity: 20,
  });

  windLayer.addTo(map);
}
