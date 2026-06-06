import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet-velocity/dist/leaflet-velocity.min.js';
import { getIsoTime, VARIABLE_CONFIG } from '../utils';

const selectedPointIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function MapComponent({ timestamps, currentIndex, currentVariable, windOn, selectedPoint, onPointSelect }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const weatherLayerRef = useRef(null);
  const windLayerRef = useRef(null);
  const markerRef = useRef(null);

  // Init Map
  useEffect(() => {
    if (!mapRef.current) return;
    
    const map = L.map(mapRef.current, { zoomControl: false }).setView([16.311, 106.062], 6);
    L.control.zoom({ position: 'topright' }).addTo(map);
    mapInstanceRef.current = map;

    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    });

    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles © Esri' },
    );

    satellite.addTo(map);

    L.control
      .layers({
        'Đường phố': osm,
        'Vệ tinh': satellite,
      })
      .addTo(map);

    map.on('click', (e) => {
      onPointSelect(e.latlng);
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Weather Layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || timestamps.length === 0) return;

    const timestamp = timestamps[currentIndex]?.timestamp;
    if (!timestamp) return;

    const isoTime = getIsoTime(timestamp);

    if (weatherLayerRef.current) {
      map.removeLayer(weatherLayerRef.current);
    }

    const newWeatherLayer = L.tileLayer.wms('/geoserver/weather/wms', {
      layers: VARIABLE_CONFIG[currentVariable].layer,
      format: 'image/png',
      transparent: true,
      opacity: VARIABLE_CONFIG[currentVariable].opacity,
      time: isoTime,
      zIndex: 1000,
    });

    newWeatherLayer.addTo(map);
    weatherLayerRef.current = newWeatherLayer;
  }, [timestamps, currentIndex, currentVariable]);

  // Render Wind
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    async function renderWind() {
      if (windLayerRef.current) {
        map.removeLayer(windLayerRef.current);
        windLayerRef.current = null;
      }

      if (!windOn || timestamps.length === 0) return;

      const timestamp = timestamps[currentIndex]?.timestamp;
      if (!timestamp) return;

      try {
        const response = await fetch(`/api/wind-field?time=${getIsoTime(timestamp)}`);
        if (!response.ok) throw new Error(`Wind API error: ${response.status}`);
        
        const field = await response.json();
        if (!field || !field.u || !field.v || !field.width || !field.height) {
          throw new Error('Invalid wind field response');
        }

        const nx = field.width;
        const ny = field.height;
        const [left, bottom, right, top] = field.bbox;
        const dx = (right - left) / (nx - 1);
        const dy = (top - bottom) / (ny - 1);

        const layer = L.velocityLayer({
          displayValues: false,
          data: [
            {
              header: { nx, ny, lo1: left, la1: top, dx, dy, parameterCategory: 2, parameterNumber: 2 },
              data: field.u.flat(),
            },
            {
              header: { nx, ny, lo1: left, la1: top, dx, dy, parameterCategory: 2, parameterNumber: 3 },
              data: field.v.flat(),
            },
          ],
          velocityScale: 0.005,
          particleAge: 60,
          lineWidth: 2,
          frameRate: 40,
          maxVelocity: 25,
        });

        layer.addTo(map);
        windLayerRef.current = layer;
      } catch (err) {
        console.error('Wind render failed:', err);
      }
    }

    renderWind();
  }, [windOn, timestamps, currentIndex]);

  // Update Marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (selectedPoint) {
      if (!markerRef.current) {
        markerRef.current = L.marker(selectedPoint, { icon: selectedPointIcon }).addTo(map);
      } else {
        markerRef.current.setLatLng(selectedPoint);
      }
      const currentZoom = map.getZoom();
      map.flyTo(selectedPoint, currentZoom < 10 ? 10 : currentZoom, { duration: 1.5 });
    } else {
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
    }
  }, [selectedPoint]);

  return <div id="map" ref={mapRef} style={{ width: '100%', height: '100vh' }}></div>;
}

export default MapComponent;
