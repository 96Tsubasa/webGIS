const map = L.map('map').setView([16.311, 106.062], 6);
let weatherLayer = null;
let timestamps = [];
let currentIndex = 0;

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

const marker = L.marker([21.0285, 105.8542]).addTo(map).bindPopup("<b>Hà Nội</b><br/>Thủ đô Việt Nam").openPopup();

function renderWeatherLayer(layerName) {

  if (weatherLayer) {
    map.removeLayer(weatherLayer);
  }

  weatherLayer = L.tileLayer.wms(
    "http://localhost:8080/geoserver/weather/wms",
    {
      layers: `weather:${layerName}`,
      format: "image/png",
      transparent: true,
      opacity: 0.7,
      zIndex: 1000
    }
  );

  weatherLayer.addTo(map);

  console.log("Showing:", layerName);
}

// Dùng các thư viện để render GeoTIFF ở frontend
// fetch("data/MOD13Q1_NDVI_20120101.tif")
//   .then(res => res.arrayBuffer())
//   .then(arrayBuffer => parseGeoraster(arrayBuffer))
//   .then(georaster => {
//     const layer = new GeoRasterLayer({
//       georaster: georaster,
//       opacity: 0.7,
//       resolution: 256,
//       zIndex: 1000
//     });

//     layer.addTo(map);
//   });

// Load timestamps from backend
fetch("http://localhost:3000/api/timestamps")
  .then(res => res.json())
  .then(data => {

    timestamps = data;

    if (timestamps.length === 0) {
      console.log("No weather layers");
      return;
    }

    currentIndex = 0;

    renderWeatherLayer(
      timestamps[currentIndex].layer
    );

  })
  .catch(err => console.error(err));

function nextFrame() {

  if (timestamps.length === 0) return;

  currentIndex++;

  if (currentIndex >= timestamps.length) {
    currentIndex = 0;
  }

  renderWeatherLayer(
    timestamps[currentIndex].layer
  );
}

setInterval(() => {
  nextFrame();
}, 2000);

// AQI Data
fetch("http://localhost:3000/api/aqi")
  .then(res => res.json())
  .then(data => {

    L.geoJSON({
      type: "FeatureCollection",
      features: data.map(item => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [
            item.longtitude,
            item.latitude
          ]
        },
        properties: item
      }))
    }, {
      pointToLayer: (feature, latlng) => {
        return L.circleMarker(latlng, {
          radius: 8,
          color: feature.properties.color,
          fillOpacity: 0.8
        });
      },

      onEachFeature: (feature, layer) => {
        const p = feature.properties;

        layer.bindPopup(`
          <b>${p.name}</b><br>
          AQI: ${p.aqi} (${p.aqiText})<br>
          Temp: ${p.temp}°C<br>
          Humidity: ${p.humid}%
        `);
      }

    }).addTo(map);

  })
  .catch(err => console.error(err));