const map = L.map('map').setView([16.311, 106.062], 6);
let weatherLayer = null;
let timestamps = [];
let currentIndex = 0;
let isPlaying = false;
let playbackInterval = null;
let currentVariable = "temperature"; 
let selectedPoint = null;

const VARIABLE_CONFIG = {

  temperature: {
    layer: "weather:temperature",
    opacity: 0.55
  },

  precipitation: {
    layer: "weather:precipitation",
    opacity: 0.72
  }

};

const slider = document.getElementById("time-slider");
const label = document.getElementById("time-label");
const playBtn = document.getElementById("play-btn");
const variableSelect =document.getElementById("weather-variable");

variableSelect.addEventListener(
  "change",
  async (e) => {

    currentVariable =
      e.target.value;

    await loadTimestamps();
    updateLegend();

  }
);

// Helper functions
function formatTimestamp(ts) {

  const year = ts.slice(0,4);
  const month = ts.slice(4,6);
  const day = ts.slice(6,8);

  const hour = ts.slice(9,11);

  return `${hour}:00 ${day}/${month}/${year}`;
}

function getIsoTime(timestamp) {
  const isoTime =
  `${timestamp.slice(0,4)}-` +
  `${timestamp.slice(4,6)}-` +
  `${timestamp.slice(6,8)}T` +
  `${timestamp.slice(9,11)}:` +
  `${timestamp.slice(11,13)}:` +
  `${timestamp.slice(13,15)}.000Z`;
  return isoTime;
}

// Base layers
const osm = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  { attribution: '© OpenStreetMap' }
);

const satellite = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { attribution: 'Tiles © Esri' }
);

// Add default
satellite.addTo(map);

// Control
L.control.layers({
  "Street Map": osm,
  "Satellite": satellite
}).addTo(map);

// const marker = L.marker([21.0285, 105.8542]).addTo(map).bindPopup("<b>Hà Nội</b><br/>Thủ đô Việt Nam").openPopup();

function renderWeatherLayer(timestamp) {

  if (weatherLayer) {
    map.removeLayer(weatherLayer);
  }

  const isoTime = getIsoTime(timestamp);

  weatherLayer = L.tileLayer.wms(
    "http://localhost:8080/geoserver/weather/wms",
    {
      layers: VARIABLE_CONFIG[ 
        currentVariable 
      ].layer,
      format: "image/png",
      transparent: true,
      opacity: VARIABLE_CONFIG[
        currentVariable
      ].opacity,
      zIndex: 1000,
      time: isoTime
    }
  );

  weatherLayer.addTo(map);

  slider.value = currentIndex;

  label.innerText =
    formatTimestamp(timestamp);

  if (selectedPoint) {
    updateInfoPanel();
  }

  console.log(
    "Showing time:",
    isoTime
  );
}

// Load timestamps from backend
async function loadTimestamps() {

  try {

    const res = await fetch(
      `http://localhost:3000/api/timestamps?variable=${currentVariable}`
    );

    const data = await res.json();

    timestamps = data;

    slider.max =
      timestamps.length - 1;

    if (timestamps.length === 0) {

      console.log(
        "No weather layers"
      );

      return;
    }

    const now = new Date();

    let nearestIndex = 0;
    let smallestDiff = Infinity;

    timestamps.forEach((t, index) => {

      const ts = t.timestamp;

      const date =
        new Date(
          `${ts.slice(0,4)}-${ts.slice(4,6)}-${ts.slice(6,8)}T${ts.slice(9,11)}:${ts.slice(11,13)}:${ts.slice(13,15)}Z`
        );

      const diff =
        Math.abs(date - now);

      if (diff < smallestDiff) {

        smallestDiff = diff;
        nearestIndex = index;

      }

    });

    currentIndex = nearestIndex;

    renderWeatherLayer(
      timestamps[currentIndex]
        .timestamp
    );

  } catch (err) {

    console.error(err);

  }

}

loadTimestamps();
updateLegend();

slider.addEventListener("input", () => {

  currentIndex = parseInt(slider.value);

  renderWeatherLayer(
    timestamps[currentIndex].timestamp
  );

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

  renderWeatherLayer(
    timestamps[currentIndex].timestamp
  );
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

  const legendImg =
    document.getElementById(
      "legend-image"
    );

  const layerName =
    VARIABLE_CONFIG[
      currentVariable
    ].layer;

  legendImg.src =
    "http://localhost:8080/geoserver/wms?" +
    "REQUEST=GetLegendGraphic" +
    "&VERSION=1.0.0" +
    "&FORMAT=image/png" +
    "&WIDTH=20" +
    "&HEIGHT=20" +
    "&LAYER=" + layerName;

}

// Helper Query Layer
async function queryLayer(layerName, latlng) {

    const bounds = map.getBounds();

    const bbox = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth()
    ].join(",");

    const size = map.getSize();

    const point =
        map.latLngToContainerPoint(latlng);

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
        `&TIME=${getIsoTime(
            timestamps[currentIndex].timestamp
        )}`;

    const response = await fetch(url);

    return await response.text();
}

// Update Info Panel
async function updateInfoPanel() {

    if (!selectedPoint) return;

    const tempText =
        await queryLayer(
            "weather:temperature",
            selectedPoint
        );

    const precipText =
        await queryLayer(
            "weather:precipitation",
            selectedPoint
        );

    const tempMatch =
        tempText.match(/GRAY_INDEX = ([\d.-]+)/);

    const precipMatch =
        precipText.match(/GRAY_INDEX = ([\d.-]+)/);

    const temperature =
        tempMatch
        ? parseFloat(tempMatch[1]).toFixed(2)
        : "No data";

    const precipitation =
        precipMatch
        ? parseFloat(precipMatch[1]).toFixed(2)
        : "No data";

    document.getElementById(
        "location-text"
    ).innerText =
        `${selectedPoint.lat.toFixed(4)}, ${selectedPoint.lng.toFixed(4)}`;

    document.getElementById(
        "time-text"
    ).innerText =
        formatTimestamp(
            timestamps[currentIndex].timestamp
        );

    document.getElementById(
        "temperature-text"
    ).innerText =
        `${temperature} °C`;

    document.getElementById(
        "precipitation-text"
    ).innerText =
        `${precipitation} mm`;
}

// Info Panel Update On Map Click
map.on("click", async (e) => {

    selectedPoint = e.latlng;

    updateInfoPanel();

});